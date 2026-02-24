variable "app_name" {
  description = "Application name — used as prefix for app-specific resources (VMs, pools, DNS, security groups)"
  type        = string
  default     = "imp"
}

variable "proxmox_api_url" {
  description = "Proxmox API endpoint"
  type        = string
}

variable "proxmox_api_token" {
  description = "Proxmox API token (user@realm!token=secret)"
  type        = string
  sensitive   = true
}

variable "environment" {
  description = "Environment name (dev, qa, prod, shared)"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "qa", "prod", "shared"], var.environment)
    error_message = "Environment must be one of: dev, qa, prod, shared."
  }
}

variable "ssh_public_key" {
  description = "SSH public key for VM access"
  type        = string
}

variable "target_node" {
  description = "Proxmox node name"
  type        = string
  default     = "prx002"

  validation {
    condition     = can(regex("^prx[0-9]{3}$", var.target_node))
    error_message = "Target node must match pattern prxNNN (e.g. prx001, prx002)."
  }
}

variable "network_bridge" {
  description = "Network bridge for VMs"
  type        = string
  default     = "vmbr0"
}

variable "template_id" {
  description = "Cloud-init template VM ID"
  type        = number
  default     = 9999

  validation {
    condition     = var.template_id >= 100 && var.template_id <= 99999
    error_message = "Template ID must be between 100 and 99999."
  }
}

variable "deploy_shared" {
  description = "Deploy shared infrastructure (Vault, Runner). Set true for initial setup only."
  type        = bool
  default     = false
}

variable "manage_cluster_resources" {
  description = "Create cluster-level resources (security groups, cloud-init, pools, VLANs). Only true in the shared workspace."
  type        = bool
  default     = false
}

# ---------------------------------------------------------------------------
# Network — VLAN-per-environment isolation
# ---------------------------------------------------------------------------
variable "env_vlan_tag" {
  description = "VLAN tag for this environment's internal network (87=management, 100=dev, 110=qa, 120=prod)"
  type        = number
  default     = 87

  validation {
    condition     = var.env_vlan_tag >= 1 && var.env_vlan_tag <= 4094
    error_message = "VLAN tag must be between 1 and 4094."
  }
}

variable "env_cidr" {
  description = "CIDR for this environment's internal network"
  type        = string
  default     = "10.0.5.0/24"

  validation {
    condition     = can(cidrhost(var.env_cidr, 0))
    error_message = "env_cidr must be a valid CIDR notation."
  }
}

variable "management_cidr" {
  description = "Management VLAN CIDR (VLAN 87) for cross-environment access from Vault/Runner"
  type        = string
  default     = "10.0.5.0/24"
}

variable "prod_db_node" {
  description = "Proxmox node for prod DB VM (anti-affinity with server)"
  type        = string
  default     = "prx002"
}

# ---------------------------------------------------------------------------
# UniFi Network Controller
# ---------------------------------------------------------------------------
variable "unifi_api_url" {
  description = "UniFi controller URL"
  type        = string
  default     = "https://10.0.5.254"
}

variable "unifi_api_key" {
  description = "UniFi API key"
  type        = string
  sensitive   = true
}

variable "unifi_site" {
  description = "UniFi site name"
  type        = string
  default     = "default"
}

variable "internal_network_name" {
  description = "Name of the VLAN 87 (management) network in UniFi"
  type        = string
  default     = "Servers"
}

variable "external_network_name" {
  description = "Name of the VLAN 7 (external ingress) network in UniFi"
  type        = string
  default     = "Deployment"
}

variable "vault_ip" {
  description = "Fixed IP for Vault server on VLAN 87"
  type        = string
  default     = "10.0.5.40"
}

variable "runner_ip" {
  description = "Fixed IP for GitHub Actions runner on VLAN 87"
  type        = string
  default     = "10.0.5.41"
}

variable "orchestrator_ip" {
  description = "Fixed IP for PW orchestrator on VLAN 87"
  type        = string
  default     = "10.0.5.42"
}

variable "vm_ips" {
  description = "Map of role name to fixed IP on environment VLAN for environment VMs"
  type        = map(string)
  default     = {}
}

variable "vm_external_ips" {
  description = "Map of role name to fixed IP on VLAN 7 for external-facing VMs (client, server)"
  type        = map(string)
  default     = {}
}

# ---------------------------------------------------------------------------
# DNS
# ---------------------------------------------------------------------------
variable "dns_domain" {
  description = "Base domain for DNS records"
  type        = string
  default     = "razorwire-productions.com"
}

# ---------------------------------------------------------------------------
# Cloud-init
# ---------------------------------------------------------------------------
variable "cloud_init_datastore" {
  description = "Datastore for cloud-init snippets (use shared storage for multi-node HA)"
  type        = string
  default     = "local"
}

# ---------------------------------------------------------------------------
# TLS Verification
# ---------------------------------------------------------------------------
variable "tls_skip_verify" {
  description = "Skip TLS verification for Proxmox/UniFi providers (set false after deploying trusted certs)"
  type        = bool
  default     = true
}
