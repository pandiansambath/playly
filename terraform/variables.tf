variable "subscription_id" {
  description = "Azure Subscription ID"
  type        = string
}

variable "location" {
  description = "Azure region. southindia = Chennai datacenter"
  type        = string
  default     = "southindia"
}

variable "resource_group_name" {
  description = "Name for the Azure Resource Group (logical container for all resources)"
  type        = string
  default     = "playly-rg"
}

variable "acr_name" {
  description = <<EOT
Azure Container Registry name.
MUST be globally unique across all of Azure (like a domain name).
alphanumeric only, 5-50 chars, lowercase.
If 'playlyacr' is taken, try 'playlyregistry' or 'playlyimages'.
EOT
  type        = string
  default     = "playlyacr"
}

variable "cluster_name" {
  description = "AKS cluster name"
  type        = string
  default     = "playly-aks"
}

variable "vm_size" {
  description = <<EOT
VM size for AKS nodes.
Standard_B2s = 2vCPU / 4GB RAM (~$0.04/hr each) — good balance
Standard_B2ms = 2vCPU / 8GB RAM (~$0.08/hr each) — more memory
Standard_D2s_v3 = 2vCPU / 8GB RAM (~$0.10/hr) — if B-series unavailable
EOT
  type        = string
  default     = "Standard_B2s"
}

variable "node_count" {
  description = "Number of AKS nodes. 2 = 1 for apps + 1 for ArgoCD/NGINX"
  type        = number
  default     = 2
}

variable "github_repo" {
  description = "GitHub repository in owner/repo format (e.g. pandiansambath/playly)"
  type        = string
}
