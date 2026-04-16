terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 2.0"
    }
  }
}

provider "azurerm" {
  features {}
  subscription_id = var.subscription_id
}

provider "azuread" {
  # Automatically picks up tenant from your `az login` session
}

# ─────────────────────────────────────────────
# 1. Resource Group — container for ALL PlayLy Azure resources
# ─────────────────────────────────────────────
resource "azurerm_resource_group" "playly" {
  name     = var.resource_group_name
  location = var.location

  tags = {
    project = "playly"
    env     = "production"
  }
}

# ─────────────────────────────────────────────
# 2. Azure Container Registry (ACR) — stores Docker images
#    like Docker Hub but private, in your Azure account
# ─────────────────────────────────────────────
resource "azurerm_container_registry" "playly" {
  name                = var.acr_name
  resource_group_name = azurerm_resource_group.playly.name
  location            = azurerm_resource_group.playly.location
  sku                 = "Basic"
  admin_enabled       = false  # We use RBAC, not admin credentials

  tags = {
    project = "playly"
  }
}

# ─────────────────────────────────────────────
# 3. AKS Cluster — managed Kubernetes on Azure
#    Control plane is FREE, you only pay for the VMs (nodes)
# ─────────────────────────────────────────────
resource "azurerm_kubernetes_cluster" "playly" {
  name                = var.cluster_name
  location            = azurerm_resource_group.playly.location
  resource_group_name = azurerm_resource_group.playly.name
  dns_prefix          = "playly"

  default_node_pool {
    name       = "default"
    node_count = var.node_count
    vm_size    = var.vm_size

    # Enable auto-scaling (optional — keeps costs low by scaling down at night)
    # enable_auto_scaling = true
    # min_count           = 1
    # max_count           = 3
  }

  # SystemAssigned = AKS manages its own identity (no manual service principal)
  identity {
    type = "SystemAssigned"
  }

  network_profile {
    network_plugin    = "azure"
    load_balancer_sku = "standard"
  }

  tags = {
    project = "playly"
  }
}

# Allow AKS nodes to pull Docker images from ACR automatically
# Without this, pods would get ImagePullBackOff errors
resource "azurerm_role_assignment" "aks_acr_pull" {
  principal_id                     = azurerm_kubernetes_cluster.playly.kubelet_identity[0].object_id
  role_definition_name             = "AcrPull"
  scope                            = azurerm_container_registry.playly.id
  skip_service_principal_aad_check = true
}

# ─────────────────────────────────────────────
# 4. GitHub Actions — App Registration + OIDC Federated Credentials
#    This is the Azure equivalent of GCP Workload Identity.
#    GitHub Actions gets Azure tokens WITHOUT any static passwords/keys.
# ─────────────────────────────────────────────
data "azuread_client_config" "current" {}

# App Registration (like an "identity" for GitHub Actions in Azure AD)
resource "azuread_application" "github_actions" {
  display_name = "playly-github-actions"
  owners       = [data.azuread_client_config.current.object_id]
}

# Service Principal (the actual "account" that gets permissions)
resource "azuread_service_principal" "github_actions" {
  client_id = azuread_application.github_actions.client_id
  owners    = [data.azuread_client_config.current.object_id]
}

# OIDC Federated Credential — GitHub's OIDC token is trusted as Azure identity
# Only GitHub Actions running from your repo's main branch can use this
resource "azuread_application_federated_identity_credential" "github_main" {
  application_id = azuread_application.github_actions.id
  display_name   = "github-actions-main-branch"
  description    = "GitHub Actions OIDC for PlayLy — main branch deploys"
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = "repo:${var.github_repo}:ref:refs/heads/main"
}

# Also allow workflow_dispatch (manual triggers from GitHub UI)
resource "azuread_application_federated_identity_credential" "github_dispatch" {
  application_id = azuread_application.github_actions.id
  display_name   = "github-actions-workflow-dispatch"
  description    = "GitHub Actions OIDC for PlayLy — manual triggers"
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = "repo:${var.github_repo}:workflow_dispatch"
}

# Allow GitHub Actions SP to push Docker images to ACR
resource "azurerm_role_assignment" "sp_acr_push" {
  principal_id         = azuread_service_principal.github_actions.object_id
  role_definition_name = "AcrPush"
  scope                = azurerm_container_registry.playly.id
}
