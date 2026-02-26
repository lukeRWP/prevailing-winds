# ---------------------------------------------------------------------------
# HA Groups — one per environment for independent management and node affinity
# Created in shared workspace only (manage_cluster_resources = true)
# ---------------------------------------------------------------------------

resource "proxmox_virtual_environment_hagroup" "shared" {
  count   = var.manage_cluster_resources ? 1 : 0
  group   = "pw-shared"
  comment = "Shared infrastructure (Vault, Runner, Orchestrator)"

  nodes = {
    prx002 = 2 # preferred
    prx001 = 1 # failover
  }

  restricted  = true
  no_failback = false
}

resource "proxmox_virtual_environment_hagroup" "dev" {
  count   = var.manage_cluster_resources ? 1 : 0
  group   = "${var.app_name}-dev"
  comment = "Dev environment"

  nodes = {
    prx001 = 2 # preferred
    prx002 = 1 # failover
  }

  restricted  = true
  no_failback = false
}

resource "proxmox_virtual_environment_hagroup" "qa" {
  count   = var.manage_cluster_resources ? 1 : 0
  group   = "${var.app_name}-qa"
  comment = "QA environment"

  nodes = {
    prx001 = 2 # preferred
    prx002 = 1 # failover
  }

  restricted  = true
  no_failback = false
}

resource "proxmox_virtual_environment_hagroup" "prod" {
  count   = var.manage_cluster_resources ? 1 : 0
  group   = "${var.app_name}-prod"
  comment = "Prod environment"

  nodes = {
    prx002 = 2 # preferred
    prx001 = 1 # failover
  }

  restricted  = true
  no_failback = false
}
