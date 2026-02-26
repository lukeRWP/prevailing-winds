moved {
  from = module.imp_vms
  to   = module.app_vms
}

module "app_vms" {
  source = "./modules/environment"

  app_name                = var.app_name
  environment             = var.environment
  target_node             = var.target_node
  network_bridge          = var.network_bridge
  template_id             = var.template_id
  ssh_public_key          = var.ssh_public_key
  cloud_init_snippet_id   = local.cloud_init_snippet_id
  security_groups         = local.sg_names
  env_vlan_tag            = var.env_vlan_tag
  pool_id                 = "${var.app_name}-${var.environment}"
  db_target_node          = var.environment == "prod" ? var.prod_db_node : ""
  vm_ips                  = var.vm_ips
  vm_external_ips         = var.vm_external_ips
  enable_external_network = var.environment == "prod"
}

# ---------------------------------------------------------------------------
# Shared VMs (exist across all environments)
# Only created when deploy_shared = true (e.g. shared.tfvars)
# ---------------------------------------------------------------------------

module "vault" {
  source = "./modules/proxmox-vm"
  count  = var.deploy_shared ? 1 : 0

  name                     = "pw-vault"
  target_node              = var.target_node
  cores                    = 2
  memory                   = 2048
  disk_size                = 20
  network_bridge           = var.network_bridge
  template_id              = var.template_id
  ssh_public_key           = var.ssh_public_key
  vlan_tag                 = 87
  tags                     = ["shared", "vault", "pw"]
  protection               = true
  pool_id                  = "pw-shared"
  cpu_type                 = "host"
  cloud_init_snippet_id    = local.cloud_init_snippet_id
  internal_ip              = var.vault_ip
  firewall_security_groups = [
    local.sg_names.ssh,
    local.sg_names.icmp,
    local.sg_names.monitoring,
    local.sg_names.vault,
    local.sg_names.egress_base,
  ]
}

module "runner" {
  source = "./modules/proxmox-vm"
  count  = var.deploy_shared ? 1 : 0

  name                     = "pw-runner"
  target_node              = var.target_node
  cores                    = 4
  memory                   = 8192
  disk_size                = 50
  network_bridge           = var.network_bridge
  template_id              = var.template_id
  ssh_public_key           = var.ssh_public_key
  vlan_tag                 = 87
  additional_vlans         = [100, 110, 120]
  tags                     = ["shared", "runner", "pw"]
  protection               = false
  pool_id                  = "pw-shared"
  cpu_type                 = "host"
  cloud_init_snippet_id    = local.cloud_init_snippet_id
  internal_ip              = var.runner_ip
  additional_vlan_ips      = var.runner_env_ips
  firewall_security_groups = [
    local.sg_names.ssh,
    local.sg_names.icmp,
    local.sg_names.monitoring,
    local.sg_names.egress_base,
    local.sg_names.egress_runner,
  ]
}

module "orchestrator" {
  source = "./modules/proxmox-vm"
  count  = var.deploy_shared ? 1 : 0

  name                     = "pw-orchestrator"
  target_node              = var.target_node
  cores                    = 4
  memory                   = 4096
  disk_size                = 40
  network_bridge           = var.network_bridge
  template_id              = var.template_id
  ssh_public_key           = var.ssh_public_key
  vlan_tag                 = 87
  additional_vlans         = [100, 110, 120]
  tags                     = ["shared", "orchestrator", "pw"]
  protection               = true
  pool_id                  = "pw-shared"
  cpu_type                 = "host"
  cloud_init_snippet_id    = local.cloud_init_snippet_id
  internal_ip              = var.orchestrator_ip
  additional_vlan_ips      = var.orchestrator_env_ips
  firewall_security_groups = [
    local.sg_names.ssh,
    local.sg_names.icmp,
    local.sg_names.monitoring,
    local.sg_names.orchestrator,
    local.sg_names.egress_base,
    local.sg_names.egress_orchestrator,
  ]
}
