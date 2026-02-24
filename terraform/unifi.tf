# ---------------------------------------------------------------------------
# UniFi Network — DHCP reservations and DNS records for app VMs
# Maps Proxmox VM MAC addresses to fixed IPs via UniFi controller
# ---------------------------------------------------------------------------

data "unifi_network" "internal" {
  name = var.internal_network_name
}

# Look up environment-specific network (created by unifi-networks.tf in shared workspace)
data "unifi_network" "env" {
  count = var.environment != "shared" && var.env_vlan_tag != 87 ? 1 : 0
  name  = "${upper(var.app_name)}-${upper(var.environment)}"
}

# Look up external network for VLAN 7 DHCP reservations
data "unifi_network" "external" {
  count = length(var.vm_external_ips) > 0 ? 1 : 0
  name  = var.external_network_name
}

locals {
  # Use environment-specific network if available, otherwise fall back to management VLAN
  env_network_id = (
    var.env_vlan_tag != 87 && length(data.unifi_network.env) > 0
    ? data.unifi_network.env[0].id
    : data.unifi_network.internal.id
  )
}

# ---------------------------------------------------------------------------
# Shared VM reservations (vault, runner) — only in shared workspace
# ---------------------------------------------------------------------------

resource "unifi_user" "vault" {
  count = var.deploy_shared ? 1 : 0

  mac        = lower(module.vault[0].mac_address[0])
  name       = "pw-vault"
  note       = "PW Vault server (VM ${module.vault[0].vm_id})"
  fixed_ip   = var.vault_ip
  network_id = data.unifi_network.internal.id
}

resource "unifi_user" "runner" {
  count = var.deploy_shared ? 1 : 0

  mac        = lower(module.runner[0].mac_address[0])
  name       = "pw-runner"
  note       = "PW GitHub Actions runner (VM ${module.runner[0].vm_id})"
  fixed_ip   = var.runner_ip
  network_id = data.unifi_network.internal.id
}

# ---------------------------------------------------------------------------
# Environment VM reservations — internal NIC (environment VLAN)
# ---------------------------------------------------------------------------

resource "unifi_user" "env_vms" {
  # Use var.vm_ips (not module.app_vms.vm_ids) so for_each keys survive
  # terraform destroy — module outputs become {} when VMs are destroyed,
  # which would orphan the DHCP reservations in UniFi.
  for_each = var.environment != "shared" ? var.vm_ips : {}

  mac        = lower(module.app_vms.mac_addresses[each.key][0])
  name       = "${var.app_name}-${each.key}-${var.environment}"
  note       = "${var.app_name} ${each.key} ${var.environment} (${each.value})"
  fixed_ip   = each.value
  network_id = local.env_network_id
}

# ---------------------------------------------------------------------------
# Environment VM reservations — external NIC (VLAN 7)
# Only for client and server VMs that have a second NIC
# ---------------------------------------------------------------------------

resource "unifi_user" "env_vms_external" {
  for_each = var.environment != "shared" ? var.vm_external_ips : {}

  mac        = lower(module.app_vms.mac_addresses[each.key][1])
  name       = "${var.app_name}-${each.key}-${var.environment}-ext"
  note       = "${var.app_name} ${each.key} ${var.environment} external NIC (VM ${module.app_vms.vm_ids[each.key]})"
  fixed_ip   = each.value
  network_id = data.unifi_network.external[0].id
}

# ---------------------------------------------------------------------------
# DNS Records — A records for all VMs + service aliases
# ---------------------------------------------------------------------------

locals {
  # Service alias mapping: VM role → friendly service name
  service_aliases = {
    client = "web"
    server = "api"
    db     = "db"
    minio  = "minio"
  }
}

# --- Shared VM host records (vault, runner) ---

resource "unifi_dns_record" "vault" {
  count = var.deploy_shared ? 1 : 0

  name   = "pw-vault.${var.dns_domain}"
  type   = "A"
  record = var.vault_ip
  ttl    = 300
}

resource "unifi_dns_record" "vault_alias" {
  count = var.deploy_shared ? 1 : 0

  name   = "vault.${var.dns_domain}"
  type   = "A"
  record = var.vault_ip
  ttl    = 300
}

resource "unifi_dns_record" "runner" {
  count = var.deploy_shared ? 1 : 0

  name   = "pw-runner.${var.dns_domain}"
  type   = "A"
  record = var.runner_ip
  ttl    = 300
}

# --- Environment VM host records (app-client-dev, app-server-dev, etc.) ---

resource "unifi_dns_record" "env_vms" {
  for_each = var.environment != "shared" ? var.vm_ips : {}

  name   = "${var.app_name}-${each.key}-${var.environment}.${var.dns_domain}"
  type   = "A"
  record = each.value
  ttl    = 300
}

# --- Environment service aliases (web.dev, api.dev, db.dev, minio.dev) ---

resource "unifi_dns_record" "env_aliases" {
  for_each = var.environment != "shared" ? var.vm_ips : {}

  name   = "${local.service_aliases[each.key]}.${var.environment}.${var.dns_domain}"
  type   = "A"
  record = each.value
  ttl    = 300
}
