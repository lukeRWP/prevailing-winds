terraform {
  required_providers {
    proxmox = {
      source = "bpg/proxmox"
    }
  }
}

# ---------------------------------------------------------------
# Variables
# ---------------------------------------------------------------
variable "name" { type = string }
variable "target_node" { type = string }
variable "cores" { type = number }
variable "memory" { type = number }
variable "disk_size" { type = number }
variable "network_bridge" { type = string }
variable "template_id" { type = number }
variable "ssh_public_key" { type = string }

variable "vlan_tag" {
  type    = number
  default = 87
}

variable "external_vlan_tag" {
  description = "VLAN tag for external/production NIC. Set to 0 to skip."
  type        = number
  default     = 0
}

variable "additional_vlans" {
  description = "Additional VLAN tags for extra NICs (e.g. runner connecting to all env VLANs)"
  type        = list(number)
  default     = []
}

variable "tags" {
  type    = list(string)
  default = []
}

variable "protection" {
  description = "Prevent accidental VM deletion (Proxmox-level, stronger than Terraform lifecycle)"
  type        = bool
  default     = false
}

variable "pool_id" {
  description = "Proxmox resource pool to assign this VM to"
  type        = string
  default     = ""
}

variable "cloud_init_snippet_id" {
  description = "Proxmox file ID for cloud-init user data snippet"
  type        = string
  default     = ""
}

variable "enable_firewall" {
  description = "Enable Proxmox firewall on all NICs"
  type        = bool
  default     = true
}

variable "firewall_security_groups" {
  description = "Security group names to apply on internal NIC (net0)"
  type        = list(string)
  default     = []
}

variable "external_firewall_security_groups" {
  description = "Security group names to apply on external NIC (net1)"
  type        = list(string)
  default     = []
}

variable "ha_group" {
  description = "HA group to enroll this VM in"
  type        = string
  default     = "RWP-DC-PAIR"
}

# ---------------------------------------------------------------
# VM Resource Tuning
# ---------------------------------------------------------------
variable "cpu_type" {
  description = "CPU type exposed to guest (host = passthrough for AES-NI, AVX, etc.)"
  type        = string
  default     = "host"
}

variable "disk_iothread" {
  description = "Enable IO thread for disk operations (recommended for DB workloads)"
  type        = bool
  default     = false
}

variable "disk_discard" {
  description = "Enable discard/TRIM for thin provisioning"
  type        = string
  default     = "on"
}

variable "balloon_minimum" {
  description = "Minimum memory for ballooning (0 = disable ballooning, guarantees full memory)"
  type        = number
  default     = 0
}

# ---------------------------------------------------------------
# IP Filter — populate ipfilter sets so ipfilter=true works
# Without these, ipfilter drops ALL outbound traffic (empty set = deny all).
# ---------------------------------------------------------------
variable "internal_ip" {
  description = "Fixed IP for this VM on net0 (populates ipfilter-net0)"
  type        = string
  default     = ""
}

variable "external_ip" {
  description = "Fixed IP for this VM on net1/external NIC (populates ipfilter-net1)"
  type        = string
  default     = ""
}

variable "additional_vlan_ips" {
  description = "Fixed IPs for additional NICs in VLAN order (populates ipfilter-net2+)"
  type        = list(string)
  default     = []
}

# ---------------------------------------------------------------
# VM Resource
# ---------------------------------------------------------------
resource "proxmox_virtual_environment_vm" "vm" {
  name       = var.name
  node_name  = var.target_node
  pool_id    = var.pool_id != "" ? var.pool_id : null
  on_boot    = true
  tags       = var.tags
  protection = var.protection

  clone {
    vm_id = var.template_id
  }

  agent {
    enabled = true
    timeout = "5m"
    trim    = true
  }

  cpu {
    cores = var.cores
    type  = var.cpu_type
  }

  memory {
    dedicated = var.memory
    floating  = var.balloon_minimum
  }

  disk {
    datastore_id = "RWP-STOR"
    size         = var.disk_size
    interface    = "scsi0"
    iothread     = var.disk_iothread
    discard      = var.disk_discard
  }

  # Internal network (environment VLAN — management/app traffic)
  network_device {
    bridge   = var.network_bridge
    vlan_id  = var.vlan_tag
    firewall = var.enable_firewall
  }

  # External network (VLAN 7 — production ingress) — only if specified
  dynamic "network_device" {
    for_each = var.external_vlan_tag > 0 ? [1] : []
    content {
      bridge   = var.network_bridge
      vlan_id  = var.external_vlan_tag
      firewall = true
    }
  }

  # Additional NICs (e.g. runner needs access to each environment VLAN)
  dynamic "network_device" {
    for_each = var.additional_vlans
    content {
      bridge   = var.network_bridge
      vlan_id  = network_device.value
      firewall = var.enable_firewall
    }
  }

  initialization {
    datastore_id      = "local-lvm"
    user_data_file_id = var.cloud_init_snippet_id != "" ? var.cloud_init_snippet_id : null

    ip_config {
      ipv4 {
        address = "dhcp"
      }
    }
    user_account {
      keys     = [var.ssh_public_key]
      username = "deploy"
    }
  }
}

# ---------------------------------------------------------------
# Proxmox Firewall — VM-level options
# ---------------------------------------------------------------
resource "proxmox_virtual_environment_firewall_options" "vm" {
  node_name = var.target_node
  vm_id     = proxmox_virtual_environment_vm.vm.vm_id

  enabled       = true
  macfilter     = true      # Prevent MAC spoofing
  dhcp          = true      # Allow DHCP traffic through ipfilter during bootstrap
  input_policy  = "DROP"    # Default deny inbound
  output_policy = "DROP"    # Default deny outbound (egress via security groups)
  ipfilter      = true      # Prevent IP spoofing — dhcp=true handles bootstrap
}

# ---------------------------------------------------------------
# Proxmox Firewall — All rules (single resource per VM)
# The provider manages all rules as one list; separate resources conflict.
# ---------------------------------------------------------------
resource "proxmox_virtual_environment_firewall_rules" "vm" {
  node_name = var.target_node
  vm_id     = proxmox_virtual_environment_vm.vm.vm_id

  # Internal NIC (net0) security groups
  dynamic "rule" {
    for_each = var.firewall_security_groups
    content {
      security_group = rule.value
      iface          = "net0"
      comment        = "${rule.value} on internal"
    }
  }

  # External NIC (net1) security groups — only if external NIC exists
  dynamic "rule" {
    for_each = var.external_vlan_tag > 0 ? var.external_firewall_security_groups : []
    content {
      security_group = rule.value
      iface          = "net1"
      comment        = "${rule.value} on external"
    }
  }
}

# ---------------------------------------------------------------
# Proxmox Firewall — IP filter sets
# ipfilter=true requires populated ipsets; without them all outbound is dropped.
# DHCP bootstrap is handled by dhcp=true in firewall options.
# ---------------------------------------------------------------
resource "proxmox_virtual_environment_firewall_ipset" "ipfilter_net0" {
  count     = var.internal_ip != "" ? 1 : 0
  node_name = var.target_node
  vm_id     = proxmox_virtual_environment_vm.vm.vm_id
  name      = "ipfilter-net0"
  comment   = "Managed by Terraform"

  cidr {
    name    = var.internal_ip
    comment = "Fixed IP for net0"
  }
}

resource "proxmox_virtual_environment_firewall_ipset" "ipfilter_net1" {
  count     = var.external_ip != "" ? 1 : 0
  node_name = var.target_node
  vm_id     = proxmox_virtual_environment_vm.vm.vm_id
  name      = "ipfilter-net1"
  comment   = "Managed by Terraform"

  cidr {
    name    = var.external_ip
    comment = "Fixed IP for net1 (external)"
  }
}

resource "proxmox_virtual_environment_firewall_ipset" "ipfilter_additional" {
  count     = length(var.additional_vlan_ips)
  node_name = var.target_node
  vm_id     = proxmox_virtual_environment_vm.vm.vm_id
  name      = "ipfilter-net${count.index + (var.external_vlan_tag > 0 ? 2 : 1)}"
  comment   = "Managed by Terraform"

  cidr {
    name    = var.additional_vlan_ips[count.index]
    comment = "Fixed IP for additional VLAN ${count.index}"
  }
}

# ---------------------------------------------------------------
# HA — Enroll in HA group
# ---------------------------------------------------------------
resource "proxmox_virtual_environment_haresource" "vm" {
  resource_id = "vm:${proxmox_virtual_environment_vm.vm.vm_id}"
  group       = var.ha_group
  state       = "started"
}

# ---------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------
output "vm_id" {
  value = proxmox_virtual_environment_vm.vm.vm_id
}

output "mac_address" {
  value = proxmox_virtual_environment_vm.vm.network_device[*].mac_address
}
