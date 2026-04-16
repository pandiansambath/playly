output "acr_login_server" {
  description = "ACR URL — use as image prefix in K8s manifests and GitHub Actions"
  value       = azurerm_container_registry.playly.login_server
  # Example: playlyacr.azurecr.io
}

output "aks_cluster_name" {
  description = "AKS cluster name — needed for az aks get-credentials"
  value       = azurerm_kubernetes_cluster.playly.name
}

output "resource_group_name" {
  description = "Resource group name — needed for az aks get-credentials"
  value       = azurerm_resource_group.playly.name
}

output "github_actions_client_id" {
  description = "⭐ Add as AZURE_CLIENT_ID in GitHub Secrets"
  value       = azuread_application.github_actions.client_id
}

output "github_actions_tenant_id" {
  description = "⭐ Add as AZURE_TENANT_ID in GitHub Secrets"
  value       = data.azuread_client_config.current.tenant_id
}

output "kubectl_config_command" {
  description = "Run this command to configure kubectl to connect to your AKS cluster"
  value       = "az aks get-credentials --resource-group ${azurerm_resource_group.playly.name} --name ${azurerm_kubernetes_cluster.playly.name} --overwrite-existing"
}

output "acr_push_command_example" {
  description = "Example docker push command for reference"
  value       = "docker push ${azurerm_container_registry.playly.login_server}/playly/backend:latest"
}
