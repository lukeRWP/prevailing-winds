# Infrastructure TODO

Remaining infrastructure items from the security audit. These require environment access, network changes, or coordination with ops.

---

## Critical

- [ ] **INFRA-C5: Plaintext Proxmox API token and UniFi API key** — `infra/terraform/terraform.tfvars` contains plaintext secrets (gitignored, but on-disk unencrypted).
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

- [ ] **INFRA-M35: Cross-environment lateral movement via shared VLAN** — All environments (dev/qa/prod) share VLAN 87. Dev VM can reach prod DB if credentials known.
  - Fix: Separate VLANs per environment or per-environment firewall rules
  - Effort: High

- [ ] **INFRA-M38: 365-day SSL certs with no rotation** — All self-signed certs expire in 1 year with no automated rotation or expiry monitoring.
  - Fix: Implement cert rotation automation, add Prometheus alerting
  - Effort: Medium

- [ ] **INFRA-M41: No offsite backup replication** — DB backups stored only on DB VM at `/opt/imp-db/backups/`. Disk failure loses data + backups.
  - Fix: Automate replication to MinIO/S3
  - Effort: Medium

## Low

- [ ] **INFRA-L23: No Alertmanager configured** — Prometheus alerts fire but `targets: []` means no delivery.
  - Fix: Configure Alertmanager with email/Slack for critical alerts
  - Effort: Low
