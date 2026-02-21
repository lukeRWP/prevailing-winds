module "imp_vms" {
  source = "./modules/environment"

  environment           = var.environment
  target_node           = var.target_node
  network_bridge        = var.network_bridge
  template_id           = var.template_id
  ssh_public_key        = var.ssh_public_key
  cloud_init_snippet_id = local.cloud_init_snippet_id
  security_groups       = local.sg_names
  env_vlan_tag          = var.env_vlan_tag
  pool_id               = "imp-${var.environment}"
  db_target_node        = var.environment == "prod" ? var.prod_db_node : ""
}

# ---------------------------------------------------------------------------
# Shared VMs (exist across all environments)
# Only created when deploy_shared = true (e.g. shared.tfvars)
# ---------------------------------------------------------------------------

module "vault" {
  source = "./modules/proxmox-vm"
  count  = var.deploy_shared ? 1 : 0

  name                     = "imp-vault"
  target_node              = var.target_node
  cores                    = 2
  memory                   = 2048
  disk_size                = 20
  network_bridge           = var.network_bridge
  template_id              = var.template_id
  ssh_public_key           = var.ssh_public_key
  vlan_tag                 = 87
  tags                     = ["shared", "vault", "imp"]
  protection               = true
  pool_id                  = "imp-shared"
  cpu_type                 = "host"
  cloud_init_snippet_id    = local.cloud_init_snippet_id
  firewall_security_groups = [
    local.sg_names.ssh,
    local.sg_names.icmp,
    local.sg_names.monitoring,
    local.sg_names.vault,
  ]
}

module "runner" {
  source = "./modules/proxmox-vm"
  count  = var.deploy_shared ? 1 : 0

  name                     = "imp-runner"
  target_node              = var.target_node
  cores                    = 4
  memory                   = 8192
  disk_size                = 50
  network_bridge           = var.network_bridge
  template_id              = var.template_id
  ssh_public_key           = var.ssh_public_key
  vlan_tag                 = 87
  additional_vlans         = [100, 110, 120]
  tags                     = ["shared", "runner", "imp"]
  protection               = false
  pool_id                  = "imp-shared"
  cpu_type                 = "host"
  cloud_init_snippet_id    = local.cloud_init_snippet_id
  firewall_security_groups = [
    local.sg_names.ssh,
    local.sg_names.icmp,
    local.sg_names.monitoring,
  ]
}

module "orchestrator" {
  source = "./modules/proxmox-vm"
  count  = var.deploy_shared ? 1 : 0

  name                     = "imp-orchestrator"
  target_node              = var.target_node
  cores                    = 4
  memory                   = 4096
  disk_size                = 40
  network_bridge           = var.network_bridge
  template_id              = var.template_id
  ssh_public_key           = var.ssh_public_key
  vlan_tag                 = 87
  additional_vlans         = [100, 110, 120]
  tags                     = ["shared", "orchestrator", "imp"]
  protection               = true
  pool_id                  = "imp-shared"
  cpu_type                 = "host"
  cloud_init_snippet_id    = local.cloud_init_snippet_id
  firewall_security_groups = [
    local.sg_names.ssh,
    local.sg_names.icmp,
    local.sg_names.monitoring,
    local.sg_names.orchestrator,
  ]
}
