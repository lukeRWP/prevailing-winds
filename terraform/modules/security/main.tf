terraform {
  required_providers {
    proxmox = {
      source = "bpg/proxmox"
    }
  }
}

variable "internal_cidr" {
  description = "Management subnet CIDR (VLAN 87)"
  type        = string
  default     = "10.0.5.0/24"
}

variable "env_cidrs" {
  description = "Map of environment name to CIDR for per-env security groups"
  type        = map(string)
  default = {
    mgmt = "10.0.5.0/24"
    dev  = "10.0.100.0/24"
    qa   = "10.0.110.0/24"
    prod = "10.0.120.0/24"
  }
}

# ---------------------------------------------------------------
# SSH from management network (rate limited via fail2ban on host)
# ---------------------------------------------------------------
resource "proxmox_virtual_environment_cluster_firewall_security_group" "ssh" {
  name    = "imp-ssh"
  comment = "SSH from management network"

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "22"
    source  = var.internal_cidr
    comment = "SSH from management"
  }

  # Also allow SSH from each environment VLAN (for inter-VM access within env)
  dynamic "rule" {
    for_each = { for k, v in var.env_cidrs : k => v if k != "mgmt" }
    content {
      type    = "in"
      action  = "ACCEPT"
      proto   = "tcp"
      dport   = "22"
      source  = rule.value
      comment = "SSH from ${rule.key}"
    }
  }
}

# ---------------------------------------------------------------
# ICMP from management (health checks, diagnostics)
# ---------------------------------------------------------------
resource "proxmox_virtual_environment_cluster_firewall_security_group" "icmp" {
  name    = "imp-icmp"
  comment = "ICMP ping from management and environment networks"

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "icmp"
    source  = var.internal_cidr
    comment = "ICMP from management"
  }

  dynamic "rule" {
    for_each = { for k, v in var.env_cidrs : k => v if k != "mgmt" }
    content {
      type    = "in"
      action  = "ACCEPT"
      proto   = "icmp"
      source  = rule.value
      comment = "ICMP from ${rule.key}"
    }
  }
}

# ---------------------------------------------------------------
# Node exporter metrics (Prometheus scraping)
# ---------------------------------------------------------------
resource "proxmox_virtual_environment_cluster_firewall_security_group" "monitoring" {
  name    = "imp-monitoring"
  comment = "Node exporter metrics from management network"

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "9100"
    source  = var.internal_cidr
    comment = "Node exporter from management"
  }
}

# ---------------------------------------------------------------
# Vault API + cluster (management network only)
# ---------------------------------------------------------------
resource "proxmox_virtual_environment_cluster_firewall_security_group" "vault" {
  name    = "imp-vault"
  comment = "Vault server API and cluster ports"

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "8200"
    source  = var.internal_cidr
    comment = "Vault API from management"
  }

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "8201"
    source  = var.internal_cidr
    comment = "Vault cluster from management"
  }

  # Allow Vault access from each environment VLAN (app servers need secrets)
  dynamic "rule" {
    for_each = { for k, v in var.env_cidrs : k => v if k != "mgmt" }
    content {
      type    = "in"
      action  = "ACCEPT"
      proto   = "tcp"
      dport   = "8200"
      source  = rule.value
      comment = "Vault API from ${rule.key}"
    }
  }
}

# ---------------------------------------------------------------
# Web server (HTTP + HTTPS from anywhere — production ingress)
# ---------------------------------------------------------------
resource "proxmox_virtual_environment_cluster_firewall_security_group" "web" {
  name    = "imp-web"
  comment = "HTTP/HTTPS from any source (production ingress)"

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "80"
    comment = "HTTP from any"
  }

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "443"
    comment = "HTTPS from any"
  }
}

# ---------------------------------------------------------------
# Per-environment app server (port 2727, scoped to env CIDR)
# ---------------------------------------------------------------
resource "proxmox_virtual_environment_cluster_firewall_security_group" "app_env" {
  for_each = var.env_cidrs
  name     = "imp-app-${each.key}"
  comment  = "App server port from ${each.key} network"

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "2727"
    source  = each.value
    comment = "App server from ${each.key}"
  }
}

# ---------------------------------------------------------------
# Per-environment MySQL (port 3306, scoped to env CIDR)
# ---------------------------------------------------------------
resource "proxmox_virtual_environment_cluster_firewall_security_group" "db_env" {
  for_each = var.env_cidrs
  name     = "imp-db-${each.key}"
  comment  = "MySQL from ${each.key} network"

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "3306"
    source  = each.value
    comment = "MySQL from ${each.key}"
  }
}

# ---------------------------------------------------------------
# Per-environment MinIO (ports 9000 + 9001, scoped to env CIDR)
# ---------------------------------------------------------------
resource "proxmox_virtual_environment_cluster_firewall_security_group" "minio_env" {
  for_each = var.env_cidrs
  name     = "imp-minio-${each.key}"
  comment  = "MinIO from ${each.key} network"

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "9000"
    source  = each.value
    comment = "MinIO API from ${each.key}"
  }

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "9001"
    source  = each.value
    comment = "MinIO console from ${each.key}"
  }
}

# ---------------------------------------------------------------
# Orchestrator API (management network only)
# ---------------------------------------------------------------
resource "proxmox_virtual_environment_cluster_firewall_security_group" "orchestrator" {
  name    = "imp-orchestrator"
  comment = "Orchestrator REST API from management network"

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "8500"
    source  = var.internal_cidr
    comment = "Orchestrator API from management"
  }
}

# ---------------------------------------------------------------
# Egress — Base (all VMs): DNS, NTP, HTTP/S, ICMP
# ---------------------------------------------------------------
resource "proxmox_virtual_environment_cluster_firewall_security_group" "egress_base" {
  name    = "imp-egress-base"
  comment = "Base egress rules for all VMs (DNS, NTP, apt, ICMP)"

  rule {
    type    = "out"
    action  = "ACCEPT"
    proto   = "udp"
    dport   = "53"
    comment = "DNS resolution (UDP)"
  }

  rule {
    type    = "out"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "53"
    comment = "DNS resolution (TCP)"
  }

  rule {
    type    = "out"
    action  = "ACCEPT"
    proto   = "udp"
    dport   = "123"
    comment = "NTP time sync"
  }

  rule {
    type    = "out"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "443"
    comment = "HTTPS outbound (apt, certbot, etc.)"
  }

  rule {
    type    = "out"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "80"
    comment = "HTTP outbound (apt)"
  }

  rule {
    type    = "out"
    action  = "ACCEPT"
    proto   = "icmp"
    comment = "ICMP outbound"
  }
}

# ---------------------------------------------------------------
# Egress — App server: DB, MinIO, Vault
# ---------------------------------------------------------------
resource "proxmox_virtual_environment_cluster_firewall_security_group" "egress_app" {
  name    = "imp-egress-app"
  comment = "App server egress (MySQL, MinIO, Vault)"

  rule {
    type    = "out"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "3306"
    comment = "MySQL outbound"
  }

  rule {
    type    = "out"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "9000"
    comment = "MinIO outbound"
  }

  rule {
    type    = "out"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "8200"
    comment = "Vault outbound"
  }
}

# ---------------------------------------------------------------
# Egress — Client (nginx): proxy to app server
# ---------------------------------------------------------------
resource "proxmox_virtual_environment_cluster_firewall_security_group" "egress_client" {
  name    = "imp-egress-client"
  comment = "Client egress (proxy to app server)"

  rule {
    type    = "out"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "2727"
    comment = "App server proxy"
  }
}

# ---------------------------------------------------------------
# Outputs — security group names for VM modules
# ---------------------------------------------------------------
output "sg_names" {
  value = {
    ssh           = proxmox_virtual_environment_cluster_firewall_security_group.ssh.name
    icmp          = proxmox_virtual_environment_cluster_firewall_security_group.icmp.name
    monitoring    = proxmox_virtual_environment_cluster_firewall_security_group.monitoring.name
    vault         = proxmox_virtual_environment_cluster_firewall_security_group.vault.name
    web           = proxmox_virtual_environment_cluster_firewall_security_group.web.name
    orchestrator  = proxmox_virtual_environment_cluster_firewall_security_group.orchestrator.name
    egress_base   = proxmox_virtual_environment_cluster_firewall_security_group.egress_base.name
    egress_app    = proxmox_virtual_environment_cluster_firewall_security_group.egress_app.name
    egress_client = proxmox_virtual_environment_cluster_firewall_security_group.egress_client.name
    # Per-environment groups (map of env_key → group name)
    app_env   = { for k, v in proxmox_virtual_environment_cluster_firewall_security_group.app_env : k => v.name }
    db_env    = { for k, v in proxmox_virtual_environment_cluster_firewall_security_group.db_env : k => v.name }
    minio_env = { for k, v in proxmox_virtual_environment_cluster_firewall_security_group.minio_env : k => v.name }
  }
}
