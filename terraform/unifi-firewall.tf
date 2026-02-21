# ---------------------------------------------------------------------------
# UniFi Firewall Rules — Inter-VLAN policy
# Created once from the shared workspace.
#
# Policy:
#   - Management (VLAN 87) can reach all environment VLANs (runner/vault access)
#   - Environment VLANs can reach management VLAN on port 8200 only (Vault API)
#   - Cross-environment traffic is dropped (dev cannot reach qa or prod)
# ---------------------------------------------------------------------------

# Allow management VLAN → all environment VLANs (SSH, Ansible, monitoring)
resource "unifi_firewall_rule" "mgmt_to_envs" {
  for_each = var.manage_cluster_resources ? local.env_vlans : {}

  name       = "IMP: mgmt to ${each.key}"
  action     = "accept"
  ruleset    = "LAN_IN"
  rule_index = 2000 + each.value.vlan_id

  protocol         = "all"
  src_network_id   = data.unifi_network.internal.id
  dst_network_id   = unifi_network.env_vlans[each.key].id
}

# Allow environment VLANs → management VLAN on Vault API (port 8200)
resource "unifi_firewall_rule" "envs_to_vault" {
  for_each = var.manage_cluster_resources ? local.env_vlans : {}

  name       = "IMP: ${each.key} to vault"
  action     = "accept"
  ruleset    = "LAN_IN"
  rule_index = 2100 + each.value.vlan_id

  protocol         = "tcp"
  dst_port         = 8200
  src_network_id   = unifi_network.env_vlans[each.key].id
  dst_network_id   = data.unifi_network.internal.id
}

# Block cross-environment traffic (dev↔qa, dev↔prod, qa↔prod)
locals {
  # Generate all pairs but filter out self-pairs (dev-to-dev)
  # Then sort them to ensure deterministic indexing
  isolation_pairs = sort([
    for pair in setproduct(keys(local.env_vlans), keys(local.env_vlans)) :
    "${pair[0]}-to-${pair[1]}"
    if pair[0] != pair[1]
  ])
}

resource "unifi_firewall_rule" "isolate_envs" {
  for_each = var.manage_cluster_resources ? toset(local.isolation_pairs) : toset([])

  # Parse src/dst from the key (e.g. "dev-to-prod")
  name       = "IMP: block ${split("-to-", each.key)[0]} to ${split("-to-", each.key)[1]}"
  action     = "drop"
  ruleset    = "LAN_IN"
  
  # Use dense indexing starting at 2400
  rule_index = 2400 + index(local.isolation_pairs, each.key)

  protocol         = "all"
  src_network_id   = unifi_network.env_vlans[split("-to-", each.key)[0]].id
  dst_network_id   = unifi_network.env_vlans[split("-to-", each.key)[1]].id
}
