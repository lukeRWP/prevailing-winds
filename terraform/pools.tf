# ---------------------------------------------------------------------------
# Proxmox Resource Pools — logical grouping for VMs per environment
# Provides: UI organization, permission scoping, resource visibility
# ---------------------------------------------------------------------------

resource "proxmox_virtual_environment_pool" "shared" {
  count   = var.manage_cluster_resources ? 1 : 0
  pool_id = "pw-shared"
  comment = "PW shared infrastructure (Vault, Runner, Orchestrator)"
}

resource "proxmox_virtual_environment_pool" "dev" {
  count   = var.manage_cluster_resources ? 1 : 0
  pool_id = "${var.app_name}-dev"
  comment = "${var.app_name} dev environment"
}

resource "proxmox_virtual_environment_pool" "qa" {
  count   = var.manage_cluster_resources ? 1 : 0
  pool_id = "${var.app_name}-qa"
  comment = "${var.app_name} QA environment"
}

resource "proxmox_virtual_environment_pool" "prod" {
  count   = var.manage_cluster_resources ? 1 : 0
  pool_id = "${var.app_name}-prod"
  comment = "${var.app_name} production environment"
}
