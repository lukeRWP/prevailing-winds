# VLAN Migration Runbook — Dev (VLAN 87 → VLAN 100)

> **Note:** This runbook was written for IMP as the first managed app. Resource prefixes have since been updated: shared resources use `pw-`, app resources use `${app_name}-` (default "imp").

Run all commands from `terraform/` unless otherwise noted.

---

## Step 0: Create terraform.tfvars

```bash
cd infra/terraform

cat > terraform.tfvars <<'EOF'
proxmox_api_url   = "https://<PROXMOX_HOST>:8006"
proxmox_api_token = "<USER>@<REALM>!<TOKEN_ID>=<SECRET>"
ssh_public_key    = "ssh-ed25519 AAAA... your-key"
unifi_api_key     = "<YOUR_UNIFI_API_KEY>"
EOF
```

---

## Step 1: Initialize Terraform

```bash
terraform init
```

If the S3 backend isn't configured yet or you want local state first:

```bash
terraform init -backend=false
```

---

## Step 2: Verify API Connectivity

```bash
# Test Proxmox API
curl -sk https://<PROXMOX_HOST>:8006/api2/json/version \
  -H "Authorization: PVEAPIToken=<USER>@<REALM>!<TOKEN_ID>=<SECRET>"

# Test UniFi API — list networks
curl -sk https://10.0.5.254/proxy/network/api/s/default/rest/networkconf \
  -H "X-API-KEY: <YOUR_UNIFI_API_KEY>"
```

Both should return JSON. If Proxmox returns version info and UniFi returns network configs, you're good.

---

## Step 3: Apply Shared Workspace (VLANs, Pools, Security Groups)

```bash
terraform workspace select default 2>/dev/null || terraform workspace new default
```

Create `environments/shared.tfvars`:

```bash
cat > environments/shared.tfvars <<'EOF'
environment              = "shared"
deploy_shared            = true
manage_cluster_resources = true
env_vlan_tag             = 87
env_cidr                 = "10.0.5.0/24"
target_node              = "prx002"
EOF
```

Preview what the shared workspace will create:

```bash
terraform plan -var-file=environments/shared.tfvars
```

**Expected resources:**
- 4 resource pools (`imp-shared`, `imp-dev`, `imp-qa`, `imp-prod`)
- 3 UniFi networks (VLANs 100, 110, 120)
- 3 UniFi firewall rule sets (mgmt→env, env→vault, cross-env isolation)
- Per-environment security groups + egress groups
- Shared VMs (Vault, Runner) if `deploy_shared=true`

If the plan looks clean:

```bash
terraform apply -var-file=environments/shared.tfvars
```

---

## Step 4: Verify VLANs Were Created

```bash
curl -sk https://10.0.5.254/proxy/network/api/s/default/rest/networkconf \
  -H "X-API-KEY: <YOUR_UNIFI_API_KEY>" | python3 -m json.tool | grep -A2 '"name": "IMP-'
```

You should see `IMP-DEV` (VLAN 100), `IMP-QA` (VLAN 110), `IMP-PROD` (VLAN 120).

### CRITICAL CHECKPOINT

Before proceeding, verify the VLANs are **trunked to your Proxmox hosts**:

1. Open the UniFi UI → Network → Settings → Ports on the switch(es) connected to prx001/prx002
2. Confirm the port profiles include VLANs 100, 110, 120 (either "All" or a custom profile)

**If trunk ports aren't configured, VMs moved to VLAN 100 will lose all connectivity.**

---

## Step 5: Create Dev Tfvars

```bash
cat > environments/dev.tfvars <<'EOF'
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

# Update these with your actual VLAN 7 external IPs
vm_external_ips = {
  client = "10.0.3.XX"
  server = "10.0.3.XX"
}
EOF
```

---

## Step 6: Snapshot Dev VMs (Safety Net)

From Proxmox or via API:

```bash
for vmid in 107 109 110 111; do
  curl -sk -X POST "https://<PROXMOX_HOST>:8006/api2/json/nodes/prx002/qemu/${vmid}/snapshot" \
    -H "Authorization: PVEAPIToken=<USER>@<REALM>!<TOKEN_ID>=<SECRET>" \
    -d "snapname=pre-vlan-migration" \
    -d "description=Before VLAN 87 to 100 migration"
  echo "Snapshotted VM ${vmid}"
done
```

Or in the Proxmox UI: select each VM → Snapshots → Take Snapshot.

---

## Step 7: Plan Dev Migration

```bash
terraform workspace select dev 2>/dev/null || terraform workspace new dev

terraform plan -var-file=environments/dev.tfvars
```

**Expected changes:**
- 4 VMs: `vlan_id` changes from `87` → `100`
- DHCP reservations: old IPs → new 10.0.100.x IPs
- DNS records: point to new IPs
- VM tuning additions: `cpu.type`, `disk.iothread`, `pool_id`, etc.

**Red flags — STOP if you see:**
- Any `destroy` + `create` (should be in-place updates only)
- Changes to resources you don't recognize
- More than ~4 VMs being modified

---

## Step 8: Apply Dev Migration

```bash
terraform apply -var-file=environments/dev.tfvars
```

**VMs will briefly lose connectivity** as NICs switch from VLAN 87 to VLAN 100. This is expected. Allow 1-2 minutes for DHCP to reassign.

---

## Step 9: Verify Connectivity

Wait 1-2 minutes for DHCP, then from the runner or management VLAN:

```bash
# Ping all dev VMs
for ip in 10.0.100.10 10.0.100.11 10.0.100.12 10.0.100.13; do
  echo -n "$ip: "
  ping -c 1 -W 2 $ip >/dev/null 2>&1 && echo "OK" || echo "UNREACHABLE"
done

# Verify SSH
ssh deploy@10.0.100.11 'hostname && uptime'
```

If VMs are unreachable after 2 minutes, check:

1. VLAN trunk on switch ports (UniFi UI)
2. `qm config <vmid>` on Proxmox to verify `net0` shows `tag=100`
3. Inside VM (via Proxmox console): `ip addr` should show 10.0.100.x

---

## Step 10: Re-provision with Ansible

```bash
cd ../ansible

ansible-playbook playbooks/site.yml \
  -i inventories/dev/hosts.yml \
  --vault-password-file ~/.ansible-vault-pass \
  --become
```

This applies:
- Updated UFW rules (allowing `management_cidr` cross-VLAN access)
- Reconfigured service bindings for the new network
- Updated nginx backend references

---

## Step 11: Post-Migration Verification

```bash
# API health check
curl -sf http://10.0.100.11:2727/health/live && echo "API OK" || echo "API FAIL"

# Nginx proxy check
curl -sk https://web.dev.razorwire-productions.com/health && echo "Nginx OK" || echo "Nginx FAIL"

# Environment isolation (should FAIL — that's correct)
ssh deploy@10.0.100.11 'ping -c 1 -W 2 10.0.110.10 2>&1' \
  && echo "ISOLATION BROKEN" || echo "Isolation OK - dev cannot reach QA"

# Runner → Dev connectivity from management VLAN
ssh deploy@10.0.5.41 'ping -c 1 -W 2 10.0.100.11 2>&1' \
  && echo "Runner->Dev OK" || echo "Runner->Dev FAIL"

# MinIO connectivity
ssh deploy@10.0.100.11 'curl -sk https://10.0.100.13:9000/minio/health/live' \
  && echo "MinIO OK" || echo "MinIO FAIL"

# MySQL connectivity
ssh deploy@10.0.100.11 'mysqladmin -h 10.0.100.12 -u imp_api_001 -p status' \
  && echo "MySQL OK" || echo "MySQL FAIL"

# GitHub Actions deploy (trigger a test push or run manually)
# Verify the CI workflow reaches 10.0.100.11 for health check
```

---

## Step 12: Re-gitignore Tfvars

Once everything is confirmed working:

```bash
# terraform.tfvars is already covered by .gitignore
# Ensure environments/*.tfvars with real values are not committed
# The example.tfvars is safe to keep tracked
```

---

## Rollback Procedure

If anything goes wrong at any step:

### Option A: Terraform Revert

```bash
cd infra/terraform
terraform workspace select dev

cat > environments/dev-rollback.tfvars <<'EOF'
environment  = "dev"
target_node  = "prx002"
env_vlan_tag = 87
env_cidr     = "10.0.5.0/24"

vm_ips = {
  client = "10.0.5.42"
  server = "10.0.5.43"
  db     = "10.0.5.44"
  minio  = "10.0.5.45"
}
EOF

terraform apply -var-file=environments/dev-rollback.tfvars

# Then re-run Ansible with old inventory
cd ../ansible
git checkout HEAD -- inventories/dev/hosts.yml
ansible-playbook playbooks/site.yml -i inventories/dev/hosts.yml --become
```

### Option B: Snapshot Restore (Last Resort)

In Proxmox UI: select each VM → Snapshots → Rollback to `pre-vlan-migration`.

---

## Expected Downtime

- **Step 8 (apply):** 1-2 minutes while VMs switch VLANs and get new DHCP leases
- **Step 10 (Ansible):** Services restart during provisioning (~2-3 minutes)
- **Total:** ~5 minutes
