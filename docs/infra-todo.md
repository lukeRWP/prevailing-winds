# Infrastructure TODO

Remaining infrastructure items from the security audit. These require environment access, network changes, or coordination with ops.

---

## Critical

- [ ] **INFRA-C5: Plaintext Proxmox API token and UniFi API key** — `terraform/terraform.tfvars` contains plaintext secrets (gitignored, but on-disk unencrypted).
  - Fix: Encrypt with `sops` or use environment variables. Add git-secrets pre-commit hook.
  - Effort: Medium

## High

- [ ] **INFRA-H19: QA Ansible vault file not encrypted** — `inventories/qa/group_vars/all/vault.yml` is plaintext with placeholder passwords. Dev vault IS encrypted.
  - Fix: `ansible-vault encrypt inventories/qa/group_vars/all/vault.yml`, add pre-commit hook
  - Effort: Low

- [ ] **DB-H17: No point-in-time recovery capability** — Only full logical dumps. No binary log backup, no retention policy, no offsite storage.
  - Fix: Enable binary logging, implement binlog backup alongside logical dumps, add S3 offsite storage
  - Effort: Medium

## Medium

- [ ] **INFRA-M34: TLS verification disabled for Proxmox/UniFi providers** — `providers.tf` has `insecure = true` for Proxmox, `allow_insecure = true` for UniFi.
  - Fix: Deploy proper TLS certs on Proxmox, configure CA trust
  - Effort: Medium

- [x] **INFRA-M35: Cross-environment lateral movement via shared VLAN** — ~~All environments share VLAN 87.~~ Fixed: Each environment now has its own VLAN (100/110/120). Proxmox cluster firewall + per-VM security groups enforce isolation. Cross-VLAN traffic dropped by default. SSH restricted to management CIDR only. (Commits `614c167`, `f9bb612`)
  - Remaining: UniFi inter-VLAN firewall rules need activation after Proxmox recovery

- [ ] **INFRA-M38: 365-day SSL certs with no rotation** — All self-signed certs expire in 1 year with no automated rotation or expiry monitoring.
  - Fix: Implement cert rotation automation, add Prometheus alerting
  - Effort: Medium

- [ ] **INFRA-M41: No offsite backup replication** — DB backups stored only on DB VM at `/opt/${app_name}-db/backups/`. Disk failure loses data + backups.
  - Fix: Automate replication to MinIO/S3
  - Effort: Medium

## Low

- [ ] **INFRA-L23: No Alertmanager configured** — Prometheus alerts fire but `targets: []` means no delivery.
  - Fix: Configure Alertmanager with email/Slack for critical alerts
  - Effort: Low
