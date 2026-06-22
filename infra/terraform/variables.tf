variable "location" {
  description = "Azure region for the demo resources."
  type        = string
  default     = "southeastasia"
}

variable "resource_group_name" {
  description = "Resource group name."
  type        = string
  default     = "rg-nopollops-drasi-demo"
}

variable "name_prefix" {
  description = "Short unique prefix used for globally named resources."
  type        = string
  default     = "nopollops"
}

variable "postgres_admin_login" {
  description = "PostgreSQL administrator login."
  type        = string
  default     = "nopollopsadmin"
}

variable "postgres_admin_password" {
  description = "PostgreSQL administrator password."
  type        = string
  sensitive   = true
}

variable "kubernetes_version" {
  description = "Optional AKS Kubernetes version. Empty lets Azure choose the default."
  type        = string
  default     = null
}

variable "authorized_ip_ranges" {
  description = "Optional public API server authorized IP ranges for the conference operator."
  type        = list(string)
  default     = []
}

