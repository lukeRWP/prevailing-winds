# ---------------------------------------------------------------------------
# UniFi Networks — Per-environment VLANs
# Created once from the shared workspace. Environment workspaces reference
# these networks for DHCP reservation targeting.
# ---------------------------------------------------------------------------

locals {
  env_vlans = {
    dev  = { vlan_id = 100, subnet = "10.0.100.0/24", dhcp_start = "10.0.100.100", dhcp_stop = "10.0.100.199" }
    qa   = { vlan_id = 110, subnet = "10.0.110.0/24", dhcp_start = "10.0.110.100", dhcp_stop = "10.0.110.199" }
    prod = { vlan_id = 120, subnet = "10.0.120.0/24", dhcp_start = "10.0.120.100", dhcp_stop = "10.0.120.199" }
  }
}

resource "unifi_network" "env_vlans" {
  for_each = var.manage_cluster_resources ? local.env_vlans : {}

  name    = "IMP-${upper(each.key)}"
  purpose = "corporate"

  subnet       = each.value.subnet
  vlan_id      = each.value.vlan_id
  dhcp_enabled = true
  dhcp_start   = each.value.dhcp_start
  dhcp_stop    = each.value.dhcp_stop
  domain_name  = "${each.key}.imp.local"
}
