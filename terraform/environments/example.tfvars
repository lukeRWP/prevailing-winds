# Copy to <environment>.tfvars (e.g. dev.tfvars, qa.tfvars, prod.tfvars)
# These files are gitignored — do NOT commit real values
#
# VLAN-per-environment topology:
#   shared = VLAN 87  (10.0.5.0/24)   — Vault, Runner
#   dev    = VLAN 100 (10.0.100.0/24) — Dev VMs
#   qa     = VLAN 110 (10.0.110.0/24) — QA VMs
#   prod   = VLAN 120 (10.0.120.0/24) — Prod VMs

environment  = "dev"
target_node  = "prx002"
env_vlan_tag = 100
env_cidr     = "10.0.100.0/24"

vm_ips = {
  client = "10.0.100.10"
  server = "10.0.100.11"
  db     = "10.0.100.12"
  minio  = "10.0.100.13"
}

# External NIC IPs on VLAN 7 (only for client and server)
vm_external_ips = {
  client = "10.0.3.x"
  server = "10.0.3.x"
}

# --- Shared workspace only (shared.tfvars) ---
# deploy_shared          = true
# manage_cluster_resources = true
# environment            = "shared"
# env_vlan_tag           = 87
# env_cidr               = "10.0.5.0/24"

# --- Prod workspace only (prod.tfvars) ---
# prod_db_node = "prx001"   # Anti-affinity: DB on different node than server
