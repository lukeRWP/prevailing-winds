# ---------------------------------------------------------------------------
# UniFi Firewall Rules — Inter-VLAN policy
# Created once from the shared workspace.
#
# Policy:
#   - Management (VLAN 87) can reach all environment VLANs (runner/vault access)
#   - Environment VLANs can reach management VLAN on port 8200 only (Vault API)
#   - Cross-environment traffic is dropped (dev cannot reach qa or prod)
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# UniFi Firewall Rules — Inter-VLAN policy
# TODO: Re-enable once filipowm/unifi provider supports UniFi Network v9+
# rule_index API. The v9+ API changed firewall rule management and the
# current rule_index values cause FirewallRuleIndexOutOfRange errors.
# ---------------------------------------------------------------------------
# For now, inter-VLAN routing is allowed by default on the UDM Pro.
# Isolation rules will be added when the provider supports the new API.
