terraform {
  required_providers {
    proxmox = {
      source = "bpg/proxmox"
    }
  }
}

# ---------------------------------------------------------------
# Cluster-level firewall defaults — DROP inbound, DROP outbound
# All traffic must be explicitly allowed via security groups.
# ---------------------------------------------------------------
resource "proxmox_virtual_environment_cluster_firewall" "policy" {
  enabled        = true
  ebtables       = true
  input_policy   = "DROP"
  output_policy  = "ACCEPT"   # Host egress must remain ACCEPT for cluster comms
  forward_policy = "ACCEPT"   # VM traffic filtered by per-VM firewall rules

  log_ratelimit {
    enabled = true
    burst   = 10
    rate    = "5/second"
  }
}

# ---------------------------------------------------------------
# Cluster-level firewall rules — apply to Proxmox NODES (not VMs).
# Required because cluster input_policy=DROP blocks all inbound to
# the hypervisors unless explicitly allowed here.
# ---------------------------------------------------------------
resource "proxmox_virtual_environment_firewall_rules" "cluster" {
  depends_on = [proxmox_virtual_environment_cluster_firewall.policy]

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "22"
    source  = var.internal_cidr
    comment = "SSH to nodes from management"
  }

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "8006"
    source  = var.internal_cidr
    comment = "Proxmox web UI from management"
  }

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "8006"
    source  = "10.0.1.0/24"
    comment = "Proxmox web UI from primary LAN"
  }

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "22"
    source  = "10.0.1.0/24"
    comment = "SSH to nodes from primary LAN"
  }

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "22"
    source  = var.workstation_cidr
    comment = "SSH to nodes from workstation LAN"
  }

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "8006"
    source  = var.workstation_cidr
    comment = "Proxmox web UI from workstation LAN"
  }

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "icmp"
    source  = var.workstation_cidr
    comment = "ICMP from workstation LAN"
  }

  # --- Remote network (VPN) access to nodes ---
  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "22"
    source  = var.remote_cidr
    comment = "SSH to nodes from remote network"
  }

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "8006"
    source  = var.remote_cidr
    comment = "Proxmox web UI from remote network"
  }

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "icmp"
    source  = var.remote_cidr
    comment = "ICMP from remote network"
  }

  # --- Teleport VPN access to nodes ---
  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "22"
    source  = var.teleport_cidr
    comment = "SSH to nodes from Teleport"
  }

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "8006"
    source  = var.teleport_cidr
    comment = "Proxmox web UI from Teleport"
  }

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "icmp"
    source  = var.teleport_cidr
    comment = "ICMP from Teleport"
  }

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "icmp"
    source  = var.internal_cidr
    comment = "ICMP to nodes from management"
  }

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "5405:5412"
    source  = var.internal_cidr
    comment = "Corosync cluster comms"
  }

  # --- Inter-node cluster communication (primary LAN) ---
  # Proxmox nodes communicate on 10.0.1.0/24 for Ceph and Corosync.
  # Without these rules, rbd/Ceph OSD traffic is blocked between nodes,
  # causing pvedaemon hangs and HTTP 596 timeouts on VM status queries.

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "icmp"
    source  = "10.0.1.0/24"
    comment = "ICMP from primary LAN"
  }

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "5405:5412"
    source  = "10.0.1.0/24"
    comment = "Corosync from primary LAN"
  }

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "6789"
    source  = "10.0.1.0/24"
    comment = "Ceph MON from primary LAN"
  }

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "3300"
    source  = "10.0.1.0/24"
    comment = "Ceph MON v2 from primary LAN"
  }

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "6800:7300"
    source  = "10.0.1.0/24"
    comment = "Ceph OSD from primary LAN"
  }
}

variable "app_name" {
  description = "Application name for app-specific security group prefixes"
  type        = string
  default     = "imp"
}

variable "internal_cidr" {
  description = "Management subnet CIDR (VLAN 87)"
  type        = string
  default     = "10.0.5.0/24"
}

variable "workstation_cidr" {
  description = "Workstation LAN CIDR (10.0.87.0/24)"
  type        = string
  default     = "10.0.87.0/24"
}

variable "remote_cidr" {
  description = "Remote VPN/access CIDR (10.0.27.0/24)"
  type        = string
  default     = "10.0.27.0/24"
}

variable "teleport_cidr" {
  description = "UniFi Teleport VPN CIDR (192.168.6.0/24)"
  type        = string
  default     = "192.168.6.0/24"
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
# SSH from management network + orchestrator per-env IPs
# ---------------------------------------------------------------
resource "proxmox_virtual_environment_cluster_firewall_security_group" "ssh" {
  name    = "pw-ssh"
  comment = "SSH from management and orchestrator (no lateral movement between env VMs)"

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "22"
    source  = var.internal_cidr
    comment = "SSH from management"
  }

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "22"
    source  = var.workstation_cidr
    comment = "SSH from workstation LAN"
  }

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "22"
    source  = var.teleport_cidr
    comment = "SSH from Teleport"
  }

  # Orchestrator connects to env VMs from its per-VLAN IP (.2 on each env subnet).
  # Without these rules, Ansible provisioning fails because the orchestrator's
  # source IP doesn't match the management CIDR.
  dynamic "rule" {
    for_each = { for k, v in var.env_cidrs : k => v if k != "mgmt" }
    content {
      type    = "in"
      action  = "ACCEPT"
      proto   = "tcp"
      dport   = "22"
      source  = "${cidrhost(rule.value, 2)}/32"
      comment = "SSH from orchestrator on ${rule.key}"
    }
  }
}

# ---------------------------------------------------------------
# ICMP from management (health checks, diagnostics)
# ---------------------------------------------------------------
resource "proxmox_virtual_environment_cluster_firewall_security_group" "icmp" {
  name    = "pw-icmp"
  comment = "ICMP ping from management and Teleport networks"

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "icmp"
    source  = var.internal_cidr
    comment = "ICMP from management"
  }

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "icmp"
    source  = var.teleport_cidr
    comment = "ICMP from Teleport"
  }
}

# ---------------------------------------------------------------
# Node exporter metrics (Prometheus scraping)
# ---------------------------------------------------------------
resource "proxmox_virtual_environment_cluster_firewall_security_group" "monitoring" {
  name    = "pw-monitoring"
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
  name    = "pw-vault"
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
  name    = "${var.app_name}-web"
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
  name     = "${var.app_name}-app-${each.key}"
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
  name     = "${var.app_name}-db-${each.key}"
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
  name     = "${var.app_name}-minio-${each.key}"
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
  name    = "pw-orchestrator"
  comment = "Orchestrator API + Dashboard from management, workstation, and remote networks"

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "8500"
    source  = var.internal_cidr
    comment = "Orchestrator API from management"
  }

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "3100"
    source  = var.internal_cidr
    comment = "Orchestrator UI from management"
  }

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "3100"
    source  = var.workstation_cidr
    comment = "Orchestrator UI from workstations"
  }

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "3100"
    source  = var.remote_cidr
    comment = "Orchestrator UI from remote network"
  }

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "8500"
    source  = var.teleport_cidr
    comment = "Orchestrator API from Teleport"
  }

  rule {
    type    = "in"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "3100"
    source  = var.teleport_cidr
    comment = "Orchestrator UI from Teleport"
  }
}

# ---------------------------------------------------------------
# Egress — Base (all VMs): DNS, NTP, HTTP/S, ICMP
# ---------------------------------------------------------------
resource "proxmox_virtual_environment_cluster_firewall_security_group" "egress_base" {
  name    = "pw-egress-base"
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

  rule {
    type    = "out"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "22"
    comment = "SSH outbound (Ansible from orchestrator)"
  }
}

# ---------------------------------------------------------------
# Egress — App server: DB, MinIO, Vault
# ---------------------------------------------------------------
resource "proxmox_virtual_environment_cluster_firewall_security_group" "egress_app" {
  name    = "${var.app_name}-egress-app"
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
  name    = "${var.app_name}-egress-client"
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
# Egress — Orchestrator: Vault API
# ---------------------------------------------------------------
resource "proxmox_virtual_environment_cluster_firewall_security_group" "egress_orchestrator" {
  name    = "pw-egress-orch"
  comment = "Orchestrator-specific egress (Vault API, Proxmox API)"

  rule {
    type    = "out"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "8200"
    comment = "Vault API outbound"
  }

  rule {
    type    = "out"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "8006"
    comment = "Proxmox API outbound"
  }
}

# ---------------------------------------------------------------
# Egress — Runner: Orchestrator API
# ---------------------------------------------------------------
resource "proxmox_virtual_environment_cluster_firewall_security_group" "egress_runner" {
  name    = "pw-egress-runner"
  comment = "Runner-specific egress (Orchestrator API)"

  rule {
    type    = "out"
    action  = "ACCEPT"
    proto   = "tcp"
    dport   = "8500"
    comment = "Orchestrator API outbound"
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
    egress_client       = proxmox_virtual_environment_cluster_firewall_security_group.egress_client.name
    egress_orchestrator = proxmox_virtual_environment_cluster_firewall_security_group.egress_orchestrator.name
    egress_runner       = proxmox_virtual_environment_cluster_firewall_security_group.egress_runner.name
    # Per-environment groups (map of env_key → group name)
    app_env   = { for k, v in proxmox_virtual_environment_cluster_firewall_security_group.app_env : k => v.name }
    db_env    = { for k, v in proxmox_virtual_environment_cluster_firewall_security_group.db_env : k => v.name }
    minio_env = { for k, v in proxmox_virtual_environment_cluster_firewall_security_group.minio_env : k => v.name }
  }
}
