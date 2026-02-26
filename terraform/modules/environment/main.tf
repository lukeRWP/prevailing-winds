variable "app_name" {
  description = "Application name prefix for VM naming"
  type        = string
}

variable "environment" { type = string }
variable "target_node" { type = string }
variable "network_bridge" { type = string }
variable "template_id" { type = number }
variable "ssh_public_key" { type = string }

variable "cloud_init_snippet_id" {
  description = "Proxmox file ID for cloud-init user data snippet"
  type        = string
  default     = ""
}

variable "security_groups" {
  description = "Security group names from the security module (mixed flat + nested maps)"
  type        = any
  default     = {}
}

variable "env_vlan_tag" {
  description = "VLAN tag for this environment's internal network"
  type        = number
  default     = 87
}

variable "pool_id" {
  description = "Proxmox resource pool for this environment's VMs"
  type        = string
  default     = ""
}

variable "db_target_node" {
  description = "Override target node for DB VM (anti-affinity with server)"
  type        = string
  default     = ""
}

variable "vm_ips" {
  description = "Map of role to fixed IP on environment VLAN (for ipfilter)"
  type        = map(string)
  default     = {}
}

variable "vm_external_ips" {
  description = "Map of role to fixed IP on VLAN 7 (for ipfilter on external NIC)"
  type        = map(string)
  default     = {}
}

variable "enable_external_network" {
  description = "Enable external VLAN 7 NIC on client VMs. Only prod should have this."
  type        = bool
  default     = false
}

locals {
  # Only create app VMs for actual environments (not shared)
  create_vms = var.environment != "shared"

  # Production VMs get deletion protection
  is_prod = var.environment == "prod"

  # Environment key for looking up per-env security groups
  env_key = contains(["dev", "qa", "prod"], var.environment) ? var.environment : "mgmt"

  # VM specifications per role
  vm_specs = {
    client = { cores = 2, memory = 1024, disk = 10,  iothread = false, balloon = 0 }
    server = { cores = 4, memory = 8192, disk = 30,  iothread = false, balloon = 0 }
    db     = { cores = 4, memory = 8192, disk = 100, iothread = true,  balloon = 0 }
    minio  = { cores = 2, memory = 4096, disk = 200, iothread = true,  balloon = 0 }
  }

  # Roles that need external/production network (VLAN 7)
  # Only client (nginx) needs external ingress; only prod gets external access
  external_roles = var.enable_external_network ? toset(["client"]) : toset([])

  # Base security groups applied to all VMs (flat string lookups)
  base_sg = [
    try(var.security_groups.ssh, ""),
    try(var.security_groups.icmp, ""),
    try(var.security_groups.monitoring, ""),
  ]

  # Egress groups
  egress_base   = try(var.security_groups.egress_base, "")
  egress_app    = try(var.security_groups.egress_app, "")
  egress_client = try(var.security_groups.egress_client, "")

  # Per-role security groups on internal NIC (net0)
  # Uses environment-scoped groups for app/db/minio (micro-segmentation)
  role_security_groups = {
    client = concat(local.base_sg, [
      try(var.security_groups.web, ""),
      local.egress_base,
      local.egress_client,
    ])
    server = concat(local.base_sg, [
      try(var.security_groups.app_env[local.env_key], ""),
      local.egress_base,
      local.egress_app,
    ])
    db = concat(local.base_sg, [
      try(var.security_groups.db_env[local.env_key], ""),
      local.egress_base,
    ])
    minio = concat(local.base_sg, [
      try(var.security_groups.minio_env[local.env_key], ""),
      local.egress_base,
    ])
  }

  # Per-role security groups on external NIC (net1)
  role_external_security_groups = {
    client = [try(var.security_groups.web, "")]
    server = [] # Server API only reachable via internal; nginx on client proxies
    db     = []
    minio  = []
  }
}

module "vms" {
  source   = "../proxmox-vm"
  for_each = local.create_vms ? local.vm_specs : {}

  name                              = "${var.app_name}-${each.key}-${var.environment}"
  target_node                       = each.key == "db" && var.db_target_node != "" ? var.db_target_node : var.target_node
  cores                             = each.value.cores
  memory                            = each.value.memory
  disk_size                         = each.value.disk
  network_bridge                    = var.network_bridge
  template_id                       = var.template_id
  ssh_public_key                    = var.ssh_public_key
  vlan_tag                          = var.env_vlan_tag
  external_vlan_tag                 = contains(local.external_roles, each.key) ? 7 : 0
  tags                              = [var.environment, each.key, var.app_name]
  protection                        = local.is_prod
  pool_id                           = var.pool_id
  cpu_type                          = "host"
  disk_iothread                     = each.value.iothread
  disk_discard                      = "on"
  balloon_minimum                   = each.value.balloon
  cloud_init_snippet_id             = var.cloud_init_snippet_id
  firewall_security_groups          = local.role_security_groups[each.key]
  external_firewall_security_groups = local.role_external_security_groups[each.key]
  internal_ip                       = try(var.vm_ips[each.key], "")
  external_ip                       = contains(local.external_roles, each.key) ? try(var.vm_external_ips[each.key], "") : ""
}

output "vm_ids" {
  value = local.create_vms ? { for k, v in module.vms : k => v.vm_id } : {}
}

output "mac_addresses" {
  description = "MAC addresses per VM — use for DHCP reservations"
  value       = local.create_vms ? { for k, v in module.vms : k => v.mac_address } : {}
}
