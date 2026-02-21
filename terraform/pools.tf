# ---------------------------------------------------------------------------
# Proxmox Resource Pools — logical grouping for VMs per environment
# Provides: UI organization, permission scoping, resource visibility
# ---------------------------------------------------------------------------

resource "proxmox_virtual_environment_pool" "shared" {
  count   = var.manage_cluster_resources ? 1 : 0
  pool_id = "imp-shared"
  comment = "IMP shared infrastructure (Vault, Runner)"
}

resource "proxmox_virtual_environment_pool" "dev" {
  count   = var.manage_cluster_resources ? 1 : 0
  pool_id = "imp-dev"
  comment = "IMP dev environment"
}

resource "proxmox_virtual_environment_pool" "qa" {
  count   = var.manage_cluster_resources ? 1 : 0
  pool_id = "imp-qa"
  comment = "IMP QA environment"
}

resource "proxmox_virtual_environment_pool" "prod" {
  count   = var.manage_cluster_resources ? 1 : 0
  pool_id = "imp-prod"
  comment = "IMP production environment"
}
