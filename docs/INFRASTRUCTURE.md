# IMP Infrastructure

Complete infrastructure documentation for the IMP (Expansions Management Platform) deployment system. This covers the full stack from hypervisor to application services.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Network Architecture](#network-architecture)
- [VM Inventory](#vm-inventory)
- [Terraform — Infrastructure as Code](#terraform--infrastructure-as-code)
- [Ansible — Configuration Management](#ansible--configuration-management)
- [Security Model](#security-model)
- [DNS](#dns)
- [Deployment Pipeline](#deployment-pipeline)
- [Database Architecture](#database-architecture)
- [Monitoring & Observability](#monitoring--observability)
- [Operational Runbooks](#operational-runbooks)
- [Credential Reference](#credential-reference)

---

## Architecture Overview

```
                    ┌──────────────────────────────────────────────────┐
                    │              Proxmox VE Cluster                  │
                    │         prx001 + prx002 (HA pair)               │
                    │         HA Group: RWP-DC-PAIR                   │
                    │         Storage: RWP-STOR (Ceph RBD)            │
                    │         Template: VM 9999 (Ubuntu 24.04)        │
                    └──────────────────────────────────────────────────┘
                                         │
                    ┌────────────────────┬┴────────────────────┐
                    │                    │                      │
              ┌─────┴─────┐      ┌──────┴──────┐      ┌───────┴──────┐
              │  Shared    │      │  Dev Env    │      │  QA / Prod   │
              │  VLAN 87   │      │  VLAN 100   │      │  VLAN 110/120│
              ├───────────┤      ├─────────────┤      ├──────────────┤
              │ Vault     │      │ Client      │      │ Same 4-VM    │
              │ Runner    │      │ Server      │      │ pattern per  │
              └───────────┘      │ Database    │      │ environment  │
                                 │ MinIO       │      └──────────────┘
                                 └─────────────┘
```

**Tool chain:**
- **Proxmox VE 8.x** — Hypervisor (2-node cluster with Ceph storage)
- **Terraform** (bpg/proxmox + filipowm/unifi) — VM provisioning, firewall, DHCP, DNS
- **Cloud-init** — First-boot hardening (before Ansible runs)
- **Ansible** — OS configuration, service installation, application deployment
- **UniFi Network** — DHCP reservations, DNS records, VLAN management

**Defense-in-depth layers:**
1. Proxmox firewall (hypervisor-level, can't be bypassed from inside the VM)
2. Cloud-init hardening (runs at first boot: UFW, SSH lockdown, fail2ban)
3. Ansible `common` role (reinforces SSH, UFW, deploys credentials)
4. Per-service Ansible roles (role-specific firewall rules, service isolation)

---

## Network Architecture

### VLANs

| VLAN | Name | Subnet | Gateway | Purpose |
|------|------|--------|---------|---------|
| 87 | Management | 10.0.5.0/24 | 10.0.5.254 | Shared infra (Vault, Runner, Proxmox) |
| 100 | IMP-DEV | 10.0.100.0/24 | 10.0.100.254 | Dev environment VMs |
| 110 | IMP-QA | 10.0.110.0/24 | 10.0.110.254 | QA environment VMs |
| 120 | IMP-PROD | 10.0.120.0/24 | 10.0.120.254 | Production environment VMs |
| 7 | External | 10.0.3.0/24 | 10.0.3.254 | External/production ingress (HTTP/HTTPS) |

VLANs 100/110/120 are created via Terraform `unifi_network` resources. All environment VLANs are trunked to both Proxmox nodes.

### NIC Assignment

| VM Role | net0 (env VLAN) | net1 (VLAN 7) | Additional NICs |
|---------|----------------|---------------|-----------------|
| Vault | VLAN 87 (mgmt) | — | — |
| Runner | VLAN 87 (mgmt) | — | VLAN 100, 110, 120 (env access) |
| Client (web) | Env VLAN | External ingress (HTTP/HTTPS) | — |
| Server (API) | Env VLAN | External (firewall: DROP all) | — |
| Database | Env VLAN | — | — |
| MinIO | Env VLAN | — | — |

The Runner has multi-NIC access to all environment VLANs so it can run Ansible deployments directly without routing through the gateway. Additional NICs are configured via netplan (see github-runner role).

### Inter-VLAN Policy (UniFi Firewall)

| Source | Destination | Action | Notes |
|--------|-------------|--------|-------|
| Management (87) | Dev/QA/Prod VLANs | ALLOW | Runner + Vault access |
| Dev/QA/Prod VLANs | Management port 8200 | ALLOW | Vault API access |
| Dev ↔ QA | — | DROP | Environment isolation |
| Dev ↔ Prod | — | DROP | Environment isolation |
| QA ↔ Prod | — | DROP | Environment isolation |

These rules are managed in Terraform (`unifi-firewall.tf`).

### UniFi Controller

- **Controller IP:** 10.0.5.254
- **Auth:** API key
- **Managed resources:** DHCP reservations, DNS A records, VLAN networks, firewall rules
- **Management network name:** "Servers" (VLAN 87)
- **Environment networks:** "IMP-DEV" (100), "IMP-QA" (110), "IMP-PROD" (120)

---

## VM Inventory

### IP Allocation Map

Each environment uses consistent final octets: client=.10, server=.11, db=.12, minio=.13.

| Role | Shared (VLAN 87) | Dev (VLAN 100) | QA (VLAN 110) | Prod (VLAN 120) |
|------|------------------|----------------|---------------|-----------------|
| Vault | 10.0.5.40 | — | — | — |
| Runner | 10.0.5.41 | — | — | — |
| Client | — | 10.0.100.10 | 10.0.110.10 | 10.0.120.10 |
| Server | — | 10.0.100.11 | 10.0.110.11 | 10.0.120.11 |
| Database | — | 10.0.100.12 | 10.0.110.12 | 10.0.120.12 |
| MinIO | — | 10.0.100.13 | 10.0.110.13 | 10.0.120.13 |

Runner additional NICs (for direct env access): 10.0.100.1, 10.0.110.1, 10.0.120.1

### Proxmox Resource Pools

VMs are organized into resource pools for visibility and quota management:

| Pool | Contents |
|------|----------|
| `imp-shared` | Vault, Runner |
| `imp-dev` | Dev client, server, db, minio |
| `imp-qa` | QA client, server, db, minio |
| `imp-prod` | Prod client, server, db, minio |

### VM Specifications

| Role | Cores | Memory | Disk | Storage | CPU Type | IO Thread | Tags |
|------|-------|--------|------|---------|----------|-----------|------|
| Vault | 2 | 2 GB | 20 GB | RWP-STOR | host | No | shared, vault, imp |
| Runner | 4 | 8 GB | 50 GB | RWP-STOR | host | No | shared, runner, imp |
| Client | 2 | 1 GB | 10 GB | RWP-STOR | host | No | {env}, client, imp |
| Server | 4 | 8 GB | 30 GB | RWP-STOR | host | No | {env}, server, imp |
| Database | 4 | 8 GB | 100 GB | RWP-STOR | host | Yes | {env}, db, imp |
| MinIO | 2 | 4 GB | 200 GB | RWP-STOR | host | Yes | {env}, minio, imp |

**VM tuning notes:**
- `cpu.type = "host"` — Passes through host CPU features (AES-NI, AVX) for better performance
- `disk.iothread = true` — Dedicated I/O thread for DB and MinIO storage-intensive VMs
- `disk.discard = "on"` — Thin provisioning support for Ceph RBD
- `memory.floating = 0` — Ballooning disabled; VMs get guaranteed full memory allocation
- **Anti-affinity (prod):** Database runs on `prx001`, server on `prx002` for HA separation

### Proxmox VM IDs (Current)

| VM | ID | HA Group | Protection |
|----|----|----------|------------|
| imp-vault | 105 | RWP-DC-PAIR | Yes |
| imp-runner | 106 | RWP-DC-PAIR | No |
| imp-client-dev | 107 | RWP-DC-PAIR | No |
| imp-minio-dev | 109 | RWP-DC-PAIR | No |
| imp-server-dev | 110 | RWP-DC-PAIR | No |
| imp-db-dev | 111 | RWP-DC-PAIR | No |

Production VMs get `protection = true` (deletion protection).

---

## Terraform — Infrastructure as Code

### Directory Structure

```
infra/terraform/
├── versions.tf              # Provider version constraints
├── providers.tf             # Proxmox + UniFi provider config
├── variables.tf             # All input variables (with validation)
├── main.tf                  # Root module: shared VMs + environment module
├── outputs.tf               # VM IDs, MACs, IPs
├── security.tf              # Security module + local SG name map
├── cloud-init.tf            # Cloud-init snippet upload
├── pools.tf                 # Proxmox resource pools (imp-shared/dev/qa/prod)
├── unifi.tf                 # DHCP reservations + DNS records
├── unifi-networks.tf        # Environment VLAN networks (100/110/120)
├── unifi-firewall.tf        # Inter-VLAN firewall policy
├── terraform.tfvars         # Credentials (gitignored)
├── environments/
│   ├── example.tfvars       # Template for new environments
│   ├── shared.tfvars        # Shared infra variables
│   ├── dev.tfvars           # Dev environment variables
│   ├── qa.tfvars            # QA environment variables
│   └── prod.tfvars          # Prod environment variables
├── templates/
│   └── cloud-init-base.yml  # Cloud-init user data
└── modules/
    ├── proxmox-vm/
    │   └── main.tf          # Single VM: resource, firewall, HA, multi-NIC
    ├── environment/
    │   └── main.tf          # 4-VM environment orchestration (VLAN-aware)
    └── security/
        └── main.tf          # Per-env security groups + egress filtering
```

### Workspace Strategy

Terraform workspaces isolate state per environment. Shared resources (security groups, cloud-init snippet) are created once in the `default` workspace and referenced by name in others.

| Workspace | Purpose | Key Flags |
|-----------|---------|-----------|
| `default` | Shared infra (Vault, Runner, security groups, cloud-init, VLAN networks, firewall rules, resource pools) | `deploy_shared=true`, `manage_cluster_resources=true` |
| `dev` | Dev environment VMs (VLAN 100) | `env_vlan_tag=100` |
| `qa` | QA environment VMs (VLAN 110) | `env_vlan_tag=110` |
| `prod` | Production environment VMs (VLAN 120) | `env_vlan_tag=120` |

### Common Operations

```bash
cd infra/terraform

# Shared infrastructure
terraform workspace select default
terraform plan -var-file=environments/shared.tfvars
terraform apply -var-file=environments/shared.tfvars

# Dev environment
terraform workspace select dev
terraform plan -var-file=environments/dev.tfvars
terraform apply -var-file=environments/dev.tfvars

# Create new environment
terraform workspace new qa
terraform apply -var-file=environments/qa.tfvars
```

### Providers

| Provider | Source | Version | Purpose |
|----------|--------|---------|---------|
| proxmox | bpg/proxmox | ~> 0.95 | VM creation, firewall, HA enrollment |
| unifi | filipowm/unifi | ~> 1.0 | DHCP reservations, DNS records |

### Security Groups (Proxmox Firewall)

Created at cluster level, applied per-VM via Terraform. Security groups are now **per-environment** for micro-segmentation:

#### Shared Groups (applied to all environments)

| Security Group | Ports | Source | Applied To |
|----------------|-------|--------|------------|
| `imp-ssh` | TCP 22 | All env VLANs | All VMs |
| `imp-icmp` | ICMP | All env VLANs | All VMs |
| `imp-monitoring` | TCP 9100 | All env VLANs | All VMs |
| `imp-vault` | TCP 8200, 8201 | All env VLANs | Vault |
| `imp-web` | TCP 80, 443 | 0.0.0.0/0 | Client (external NIC) |

#### Per-Environment Groups

| Security Group | Ports | Source CIDR | Applied To |
|----------------|-------|-------------|------------|
| `imp-app-{env}` | TCP 2727 | Env VLAN + mgmt VLAN | Server |
| `imp-db-{env}` | TCP 3306 | Env VLAN + mgmt VLAN | Database |
| `imp-minio-{env}` | TCP 9000, 9001 | Env VLAN + mgmt VLAN | MinIO |

#### Egress Groups (output policy = DROP)

| Security Group | Ports | Dest | Applied To |
|----------------|-------|------|------------|
| `imp-egress-base` | DNS/53, NTP/123, HTTP/80, HTTPS/443, ICMP | 0.0.0.0/0 | All VMs |
| `imp-egress-app` | MySQL/3306, MinIO/9000, Vault/8200 | 0.0.0.0/0 | Server |
| `imp-egress-client` | TCP 2727 | 0.0.0.0/0 | Client (nginx → server) |

Per-VM firewall: `policy_in = DROP`, `policy_out = DROP`, MAC filtering enabled.

**Important:** Egress filtering (output policy = DROP) prevents compromised VMs from making arbitrary outbound connections. Each VM only gets the egress rules it needs.

### Cloud-init (First Boot)

Applied to every VM before Ansible runs:

- Installs `qemu-guest-agent`, `unattended-upgrades`, `fail2ban`, `ufw`
- SSH hardening: no root login, no password auth, max 3 auth tries
- UFW baseline: deny incoming, allow outgoing, allow SSH
- Disables root user

---

## Ansible — Configuration Management

### Directory Structure

```
infra/ansible/
├── ansible.cfg                    # SSH pipelining, YAML output
├── requirements.yml               # Galaxy collections
├── playbooks/
│   ├── site.yml                   # Full environment provisioning
│   ├── shared.yml                 # Vault + Runner provisioning
│   ├── deploy-all.yml             # Full app deployment with rollback
│   ├── deploy-server.yml          # Server-only deployment
│   ├── deploy-client.yml          # Client-only deployment
│   ├── db-setup.yml               # Database initialization
│   ├── db-migrate.yml             # Schema migrations
│   └── db-backup.yml              # Database backup
├── inventories/
│   ├── shared/
│   │   ├── hosts.yml              # Vault + Runner hosts
│   │   └── group_vars/all.yml     # vault_tls_disable, etc.
│   ├── dev/
│   │   ├── hosts.yml              # 4 dev VMs (VLAN 100)
│   │   └── group_vars/all/
│   │       ├── main.yml           # Environment config
│   │       └── vault.yml          # Encrypted secrets
│   ├── qa/
│   │   ├── hosts.yml              # 4 QA VMs (VLAN 110)
│   │   └── group_vars/all/
│   │       ├── main.yml           # Environment config
│   │       └── vault.yml          # Encrypted secrets
│   └── prod/
│       ├── hosts.yml              # 4 prod VMs (VLAN 120)
│       └── group_vars/all/
│           ├── main.yml           # Environment config
│           └── vault.yml          # Encrypted secrets
└── roles/
    ├── common/                    # Base OS: hostname, SSH, UFW, Vault CLI
    ├── node-exporter/             # Prometheus metrics agent
    ├── nodejs/                    # Node.js 22, PM2, native build deps
    ├── mysql/                     # MySQL 8.0, 13 databases, users
    ├── minio/                     # MinIO object storage, bucket
    ├── nginx/                     # Reverse proxy, TLS modes
    ├── app-server/                # Express backend dirs + systemd
    ├── app-client/                # React frontend web root
    ├── vault/                     # HashiCorp Vault server
    ├── github-runner/             # GitHub Actions self-hosted runner
    ├── prometheus/                # Metrics collection (planned)
    └── grafana/                   # Dashboards (planned)
```

### Playbook Reference

| Playbook | Inventory | Purpose | Usage |
|----------|-----------|---------|-------|
| `shared.yml` | shared | Provision Vault + Runner | `ansible-playbook playbooks/shared.yml -i inventories/shared/hosts.yml --become` |
| `site.yml` | dev/qa/prod | Provision all environment VMs | `ansible-playbook playbooks/site.yml -i inventories/dev/hosts.yml --become` |
| `deploy-all.yml` | dev/qa/prod | Deploy server + client apps | `ansible-playbook playbooks/deploy-all.yml -i inventories/dev/hosts.yml --become -e server_tarball=... -e client_tarball=...` |
| `deploy-server.yml` | dev/qa/prod | Deploy server only | `ansible-playbook playbooks/deploy-server.yml -i inventories/dev/hosts.yml --become -e server_tarball=...` |
| `deploy-client.yml` | dev/qa/prod | Deploy client only | `ansible-playbook playbooks/deploy-client.yml -i inventories/dev/hosts.yml --become -e client_tarball=...` |
| `db-setup.yml` | dev/qa/prod | Initialize databases | `ansible-playbook playbooks/db-setup.yml -i inventories/dev/hosts.yml --become` |
| `db-migrate.yml` | dev/qa/prod | Run migrations | `ansible-playbook playbooks/db-migrate.yml -i inventories/dev/hosts.yml --become -e migration_file=...` |
| `db-backup.yml` | dev/qa/prod | Backup databases | `ansible-playbook playbooks/db-backup.yml -i inventories/dev/hosts.yml --become` |

### Role Execution Order (site.yml)

```
1. [all hosts]        common          → hostname, packages, SSH, UFW, Vault CLI
2. [all hosts]        node-exporter   → Prometheus metrics agent (port 9100)
3. [imp_databases]    mysql           → MySQL 8.0, databases, users, schema
4. [imp_storage]      minio           → MinIO server, bucket creation
5. [imp_servers]      nodejs          → Node.js 22, PM2
6. [imp_servers]      app-server      → Directory structure, systemd unit
7. [imp_clients]      nodejs          → Node.js 22, PM2
8. [imp_clients]      nginx           → Reverse proxy, TLS
9. [imp_clients]      app-client      → Web root directory
10. [imp_monitoring]  prometheus      → Metrics collection (when hosts exist)
11. [imp_monitoring]  grafana         → Dashboards (when hosts exist)
```

### Role Details

#### common
Applies to every VM. Sets hostname, installs base packages (curl, wget, git, jq, htop, ufw), configures timezone (America/New_York), creates `deploy` user with passwordless sudo, hardens SSH (no root, no passwords), configures UFW (deny-by-default, allow SSH), installs Vault CLI. Supports `deploy_authorized_keys` list for adding multiple SSH keys to the deploy user (personal + CI deploy key).

#### mysql
Installs MySQL 8.0 on database VMs. Creates 13 IMP databases. Creates two users: `imp_api_001` (application user) and `imp_ssl_user` (SSL-required user), both with ALL privileges on all IMP databases. Loads schema from SQL init files.

**SSL certificate management** (two-path):
- If vault has certs (`vault_mysql_ca_pem` is non-empty): deploys CA, server, and client certs from vault
- If vault is empty and no certs exist on host: auto-generates a full CA + server + client certificate chain via openssl (2048-bit RSA, 3650-day validity)
- Client certs (ca.pem, client-cert.pem, client-key.pem) are fetched to the Ansible controller at `/tmp/imp-ssl-certs/` for distribution to the app-server

Stores root credentials in `/root/.my.cnf` for idempotent re-runs. Backups stored in `/opt/imp-db/backups`.

#### minio
Installs MinIO object storage. Downloads server binary and `mc` client. Creates `imp-files` default bucket. Runs as `minio-user` system account. API on port 9000, console UI on port 9001. Generates self-signed TLS certificates (EC P-256) for HTTPS and fetches `public.crt` to the Ansible controller at `/tmp/imp-ssl-certs/` for app-server trust.

#### nginx
Installs Nginx reverse proxy on client VMs. Three TLS modes:
- `none` — HTTP only (dev, internal networks)
- `selfsigned` — Self-signed cert for internal HTTPS
- `letsencrypt` — Let's Encrypt with auto-renewal (production)

Proxies `/api/` to the server VM on port 2727. Serves React SPA from `/var/www/imp-client` with `try_files` fallback. Security headers included (X-Frame-Options, X-Content-Type-Options, etc.).

#### app-server
Creates release-based deployment structure at `/opt/imp-server/`:
```
/opt/imp-server/
├── current → releases/20250215120000   # Symlink to active release
├── releases/                            # Timestamped release dirs
│   ├── 20250215120000/
│   └── 20250214090000/
└── shared/                              # Persistent across deploys
    ├── .env                             # App configuration
    ├── mysql-ssl/                       # MySQL client SSL certificates
    │   ├── ca.pem
    │   ├── client-cert.pem
    │   └── client-key.pem
    ├── minio-ca.crt                     # MinIO TLS cert for Node.js trust
    └── tessdata/                        # OCR language data
```
Runs as systemd service `imp-server` via PM2. Keeps last 3 releases for rollback.

**SSL/TLS trust chain:**
- MySQL client SSL certs are deployed from Ansible controller (fetched from DB VM during `site.yml`)
- MinIO's self-signed TLS cert (`minio-ca.crt`) is deployed from controller (fetched from MinIO VM)
- Systemd unit sets `NODE_EXTRA_CA_CERTS` and loads `EnvironmentFile` from shared `.env`
- Deploy includes `pm2 kill` before restart to flush PM2's cached environment variables

#### app-client
Creates `/var/www/imp-client` web root. Deployment extracts tarball `build/` directory and syncs to web root. Previous version backed up as `.bak` for rollback.

#### vault
Installs HashiCorp Vault server with file-based storage backend. TLS configurable (disabled in dev via `vault_tls_disable: true`). Runs as `vault` system user. Needs manual initialization and unsealing after first deploy.

#### github-runner
Installs GitHub Actions self-hosted runner with Docker support. Runner registration skipped if no token provided. Labels: `self-hosted,linux,x64,imp`. Includes Node.js 22 for running JavaScript actions, Ansible for CI deployments, and native build dependencies (cairo, pango, etc.).

**Multi-NIC network configuration:** When `runner_env_nics` is defined in the inventory, deploys a netplan configuration (`/etc/netplan/60-imp-env-vlans.yaml`) that gives the runner static IPs on each environment VLAN (100/110/120). This allows direct Ansible deployments to environment VMs without routing through the UniFi gateway.

#### nodejs
Installs Node.js 22 from NodeSource, PM2 process manager, and native build dependencies (cairo, pango, libjpeg, libgif, librsvg, poppler for PDF processing).

---

## Security Model

### Network Segmentation

```
┌─────────────────────────────────────────────────────┐
│                    Internet                          │
└────────────────────────┬────────────────────────────┘
                         │ VLAN 7 (10.0.3.0/24)
                         │ TCP 80, 443 only
                    ┌────┴─────┐
                    │  Client  │ ◄── External NIC (net1)
                    │  (nginx) │
                    └────┬─────┘
                         │ Environment VLAN (100/110/120)
          ┌──────────────┼──────────────┐
     ┌────┴─────┐   ┌───┴────┐   ┌─────┴────┐
     │  Server  │   │  MySQL │   │  MinIO   │
     │  :2727   │   │  :3306 │   │  :9000   │
     └──────────┘   └────────┘   └──────────┘
          Environment VLAN only — isolated from other envs

     ┌──────────────────────────────────────────────┐
     │  Management VLAN 87 (10.0.5.0/24)            │
     │  Vault :8200    Runner (multi-NIC to all envs)│
     └──────────────────────────────────────────────┘
```

**Environment isolation:** Dev, QA, and Prod VMs live on separate VLANs. Cross-environment traffic is blocked at the UniFi gateway. Only the management VLAN (Runner, Vault) can reach all environments.

### Firewall Layers

1. **UniFi gateway** — Inter-VLAN policy: management→env allow, cross-env DROP
2. **Proxmox firewall** — Per-VM, default DROP inbound **and outbound**, per-env security groups, MAC filtering
3. **Cloud-init UFW** — Deny-by-default baseline at first boot
4. **Ansible UFW** — Role-specific port allowances from `internal_cidr` (env VLAN) and `management_cidr` (10.0.5.0/24)

### SSH Hardening

- Root login disabled
- Password authentication disabled
- Max auth tries: 3
- Key-only authentication via `deploy` user
- Fail2ban installed (via cloud-init)

### SSH Keys

| Key | Purpose | Location |
|-----|---------|----------|
| Personal key | Manual SSH access + Ansible from dev machine | `terraform.tfvars` → `ssh_public_key` (injected via cloud-init) |
| CI deploy key | GitHub Actions → Ansible → VMs | `~/.ssh/imp-deploy-ci` (local), `DEPLOY_SSH_KEY` (GitHub secret) |

Both keys are authorized on the `deploy` user via cloud-init (personal) and Ansible `authorized_key` module (CI key via `deploy_authorized_keys` variable).

### Service Isolation

- Each service runs as a dedicated system user (vault, minio-user, runner, mysql, www-data)
- Systemd units with appropriate `User=` directives
- No service has root access

---

## DNS

All DNS records are managed via Terraform through the UniFi controller. Records are A records with 300-second TTL.

### Record Schema

| Pattern | Example | Target |
|---------|---------|--------|
| `imp-{role}.razorwire-productions.com` | imp-vault.razorwire-productions.com | 10.0.5.40 |
| `imp-{role}-{env}.razorwire-productions.com` | imp-client-dev.razorwire-productions.com | 10.0.100.10 |
| `{service}.razorwire-productions.com` | vault.razorwire-productions.com | 10.0.5.40 |
| `{service}.{env}.razorwire-productions.com` | web.dev.razorwire-productions.com | 10.0.100.10 |

### Service Alias Mapping

| VM Role | Service Alias |
|---------|--------------|
| client | web |
| server | api |
| db | db |
| minio | minio |
| vault | vault |

### Current DNS Records

**Shared (3 records):**
- `imp-vault.razorwire-productions.com` → 10.0.5.40
- `vault.razorwire-productions.com` → 10.0.5.40
- `imp-runner.razorwire-productions.com` → 10.0.5.41

**Dev (8 records):**
- `imp-client-dev.razorwire-productions.com` → 10.0.100.10
- `imp-server-dev.razorwire-productions.com` → 10.0.100.11
- `imp-db-dev.razorwire-productions.com` → 10.0.100.12
- `imp-minio-dev.razorwire-productions.com` → 10.0.100.13
- `web.dev.razorwire-productions.com` → 10.0.100.10
- `api.dev.razorwire-productions.com` → 10.0.100.11
- `db.dev.razorwire-productions.com` → 10.0.100.12
- `minio.dev.razorwire-productions.com` → 10.0.100.13

QA and Prod records are created automatically when those workspaces are applied.

---

## Deployment Pipeline

### CI/CD Pipeline (GitHub Actions)

Automated build and deploy on every push to `master`:

```
Push to master
    │
    ├── Build Client ──► npm ci + npm run build ──► tar -czf imp-client.tar.gz
    ├── Build Server ──► npm ci ──► tar -czf imp-server.tar.gz
    ├── Package DB ────► tar -czf imp-db.tar.gz SQL/
    │
    └── Deploy to Dev (after all builds pass)
         ├── Download artifacts
         ├── Configure SSH (deploy key from secret)
         ├── Write vault password
         ├── ansible-playbook deploy-all.yml
         └── Health check (http://10.0.100.11:2727/health/live)
```

**Workflow:** `.github/workflows/build.yml`

**Required GitHub Secrets:**

| Secret | Purpose |
|--------|---------|
| `DEPLOY_SSH_KEY` | ed25519 private key for SSH to VMs as `deploy` user |
| `ANSIBLE_VAULT_PASSWORD` | Decrypts `inventories/dev/group_vars/all/vault.yml` |

**Runner requirements** (pre-installed on imp-runner VM):
- Ansible (`apt install ansible`)
- Node.js 22 + native build dependencies (cairo, pango, etc.)
- Multi-NIC access to all environment VLANs (100/110/120) via netplan

### Application Deployment Flow

```
Build (local/CI)          Ansible Deploy              VM
─────────────────    ──────────────────────    ─────────────────
                     deploy-all.yml
npm run build ───►   1. Verify tarballs
tar czf ─────────►   2. Backup DB (prod)
                     3. Extract to releases/
                     4. Symlink shared files
                     5. npm ci --production
                     6. Update current symlink
                     7. pm2 kill (flush env cache)
                     8. Restart service
                     9. Health check ──────►   GET /health/live
                     10. Cleanup old releases
```

### Server Deployment

```bash
# Build
cd server && tar czf /tmp/imp-server.tar.gz .

# Deploy
ansible-playbook playbooks/deploy-server.yml \
  -i inventories/dev/hosts.yml --become \
  -e server_tarball=/tmp/imp-server.tar.gz
```

Creates a new timestamped release in `/opt/imp-server/releases/`, symlinks `.env`, `mysql-ssl`, and `tessdata` from `/opt/imp-server/shared/`, runs `npm ci --production`, updates the `current` symlink, and restarts the `imp-server` systemd service via PM2.

### Client Deployment

```bash
# Build
cd client && npm run build && tar czf /tmp/imp-client.tar.gz build/

# Deploy
ansible-playbook playbooks/deploy-client.yml \
  -i inventories/dev/hosts.yml --become \
  -e client_tarball=/tmp/imp-client.tar.gz
```

Backs up current `/var/www/imp-client` to `.bak`, extracts new `build/` directory, syncs with rsync, reloads nginx.

### Rollback

```bash
# Server: reverts to previous release symlink
ansible-playbook playbooks/deploy-server.yml \
  -i inventories/dev/hosts.yml --become \
  -e rollback=true

# Client: restores from .bak
ansible-playbook playbooks/deploy-client.yml \
  -i inventories/dev/hosts.yml --become \
  -e rollback=true
```

### Database Operations (Local Dev)

```bash
# Backup all IMP databases (excludes mysql/sys system databases)
task db:backup

# Restore from most recent backup
task db:migrate

# Restore from specific backup file
task db:migrate -- backups/backup-20260217_053959.sql

# Analyze backup without making changes
task db:migrate -- --dry-run

# Non-interactive restore (CI/scripts)
task db:migrate -- --force --skip-backup
```

**Migration features:**
- Auto-detects EMP-prefixed databases from older backups and renames to IMP
- Compares backup schema against init files, creates missing tables after import
- Applies pending migrations from `SQL/migrations/` (checks `schema_migrations` table)
- Creates safety backup before import (skip with `--skip-backup`)
- Filters out system databases from `--all-databases` dumps

**Scripts:** `scripts/db-backup.sh`, `scripts/db-migrate.sh`

### Database Operations (Remote via Ansible)

```bash
# Initialize (creates databases + runs SQL init files)
ansible-playbook playbooks/db-setup.yml \
  -i inventories/dev/hosts.yml --become

# Seed admin user, roles, permissions
ansible-playbook playbooks/seed-admin.yml \
  -i inventories/dev/hosts.yml --become

# Or via Taskfile
task deploy:db-init ENV=dev
task deploy:seed-admin ENV=dev
```

Backups stored in `/opt/imp-db/backups/` as gzipped SQL dumps.

---

## Database Architecture

### Databases (13)

| Database | Purpose |
|----------|---------|
| IMP_PROJECTS | Project management (single or multi-location) |
| IMP_PROGRAMS | Program collections |
| IMP_LOCATIONS | Physical site data |
| IMP_USERS | User management and authentication |
| IMP_MILESTONES | Critical path templates, instances, phases, tasks |
| IMP_CAPITAL | Budget codes and capital expense line items |
| IMP_ADMIN | Sync system, API logging, adapter configs, rate limiting |
| IMP_REPORTING | Reporting views and aggregations |
| IMP_ANALYTICS | Usage analytics and metrics |
| IMP_IMPORTS | Data import staging |
| IMP_EXPORTS | Data export staging |
| IMP_FILES | File metadata, tags, shares, audit trail |
| IMP_NOTES | Notes and annotations |

### MySQL Configuration

| Setting | Dev | QA/Prod |
|---------|-----|---------|
| Version | 8.0 | 8.0 |
| Port | 3306 | 3306 |
| Max connections | 200 | 200 |
| InnoDB buffer pool | 1 GB | 4 GB |
| SSL required | Yes | Yes |
| Binary logging | Yes | Yes |
| Slow query log | Yes (> 2s) | Yes (> 2s) |
| Binlog expiry | 7 days | 7 days |

### SSL/TLS Certificate Flow

```
mysql role (DB VM)                     app-server role (Server VM)
──────────────────                     ─────────────────────────────
Generate or deploy from vault:
  /etc/mysql/ssl/
    ca.pem
    server-cert.pem
    server-key.pem
    client-cert.pem
    client-key.pem
       │
       ├── fetch ca.pem ──────────►  /opt/imp-server/shared/mysql-ssl/ca.pem
       ├── fetch client-cert.pem ──► /opt/imp-server/shared/mysql-ssl/client-cert.pem
       └── fetch client-key.pem ──►  /opt/imp-server/shared/mysql-ssl/client-key.pem

minio role (MinIO VM)
─────────────────────
Generate self-signed TLS (EC P-256):
  /opt/minio/.minio/certs/
    public.crt
    private.key
       │
       └── fetch public.crt ──────► /opt/imp-server/shared/minio-ca.crt
                                     └── NODE_EXTRA_CA_CERTS (systemd)
```

Certs flow through the Ansible controller via `fetch` + `copy`. The `site.yml` playbook runs mysql and minio roles first (which fetch certs), then the app-server role (which deploys them).

### User Accounts

| User | Host | SSL Required | Privileges |
|------|------|-------------|------------|
| root | localhost | No | ALL |
| imp_api_001 | % | No | ALL on IMP_* databases |
| imp_ssl_user | % | Yes | ALL on IMP_* databases |

---

## Monitoring & Observability

### Current State

All VMs export Prometheus metrics via `node_exporter` on port 9100:
- CPU, memory, disk, network utilization
- Systemd service state
- Process metrics

### Planned (when monitoring VM is added)

- **Prometheus** (port 9090) — Scrapes all node exporters, 30-day retention
- **Grafana** (port 3000) — Dashboards with pre-provisioned Prometheus datasource
- **Alert rules** — Defined in `prometheus/templates/alert_rules.yml.j2`
- **IMP Node Dashboard** — Pre-built Grafana dashboard for system overview

### Service Health Checks

| Service | Endpoint | Expected |
|---------|----------|----------|
| App Server | `http://{server}:2727/health/live` | HTTP 200 |
| MinIO | `http://{minio}:9000/minio/health/live` | HTTP 200 |
| Vault | `http://{vault}:8200/v1/sys/health` | HTTP 200 (or 501 if sealed) |
| Nginx | `http://{client}:80/health` | Proxied to server |
| Node Exporter | `http://{any}:9100/metrics` | Prometheus metrics |

---

## Operational Runbooks

### Vault Initialization (One-Time)

```bash
ssh deploy@10.0.5.40

# Initialize Vault (produces 5 unseal keys + root token)
export VAULT_ADDR=http://127.0.0.1:8200
vault operator init

# Save the keys securely, then unseal (need 3 of 5 keys)
vault operator unseal <key-1>
vault operator unseal <key-2>
vault operator unseal <key-3>

# Verify
vault status
```

### Register GitHub Runner

1. Go to your GitHub repo → Settings → Actions → Runners → New self-hosted runner
2. Copy the registration token
3. Update `infra/ansible/inventories/shared/group_vars/all.yml`:
   ```yaml
   github_repo_url: "https://github.com/your-org/your-repo"
   github_runner_token: "<token>"
   ```
4. Re-run the shared playbook:
   ```bash
   ansible-playbook playbooks/shared.yml -i inventories/shared/hosts.yml --become
   ```

### Create a New Environment (QA/Prod)

```bash
cd infra/terraform

# 1. Ensure VLAN network exists (created in shared workspace)
terraform workspace select default
terraform plan -var-file=environments/shared.tfvars  # Should show VLAN network

# 2. Create workspace and provision VMs
terraform workspace new qa
terraform apply -var-file=environments/qa.tfvars
# qa.tfvars must set: env_vlan_tag=110, env_cidr="10.0.110.0/24",
# vm_ips with .10/.11/.12/.13 addresses

# 3. Ansible inventory should already exist at inventories/qa/
# Encrypt vault.yml with real secrets:
cd ../ansible
ansible-vault encrypt inventories/qa/group_vars/all/vault.yml

# 4. Provision
ansible-playbook playbooks/site.yml -i inventories/qa/hosts.yml --become
```

### SSH Access

```bash
# Shared infra (VLAN 87)
ssh deploy@10.0.5.40     # vault
ssh deploy@10.0.5.41     # runner

# Dev environment (VLAN 100)
ssh deploy@10.0.100.10   # client-dev
ssh deploy@10.0.100.11   # server-dev
ssh deploy@10.0.100.12   # db-dev
ssh deploy@10.0.100.13   # minio-dev

# QA environment (VLAN 110)
ssh deploy@10.0.110.10   # client-qa
ssh deploy@10.0.110.11   # server-qa

# Or use DNS names
ssh deploy@imp-vault.razorwire-productions.com
ssh deploy@api.dev.razorwire-productions.com
```

### Database Shell Access

```bash
ssh deploy@10.0.100.12   # dev db
sudo mysql   # Uses /root/.my.cnf for auth

# Or remotely (from same VLAN or management VLAN)
mysql -h db.dev.razorwire-productions.com -u imp_api_001 -p
```

### MinIO Console Access

From any machine on the same environment VLAN or management VLAN:
```
http://minio.dev.razorwire-productions.com:9001
```
Login with the access key and secret key from `dev/group_vars/all.yml`.

### Vault UI Access

```
http://vault.razorwire-productions.com:8200/ui
```

---

## Credential Reference

### Where Credentials Live

| Credential | Location | Format |
|------------|----------|--------|
| Terraform secrets | `infra/terraform/terraform.tfvars` | HCL (gitignored) |
| Proxmox API token | `terraform.tfvars` → `proxmox_api_token` | `user@realm!token=secret` |
| UniFi API key | `terraform.tfvars` → `unifi_api_key` | String |
| SSH public key (personal) | `terraform.tfvars` → `ssh_public_key` | ed25519 public key |
| SSH private key (CI deploy) | `~/.ssh/imp-deploy-ci` + GitHub secret `DEPLOY_SSH_KEY` | ed25519 private key |
| Ansible vault password | `~/.ansible-vault-pass` + GitHub secret `ANSIBLE_VAULT_PASSWORD` | Plaintext file |
| MySQL passwords | `inventories/{env}/group_vars/all/vault.yml` | Ansible vault encrypted |
| MinIO keys | `inventories/{env}/group_vars/all/vault.yml` | Ansible vault encrypted |
| SSL certificates | `inventories/{env}/group_vars/all/vault.yml` | Ansible vault encrypted (PEM) |
| App .env | `/opt/imp-server/shared/.env` (on VM) | Dotenv |

### GitHub Secrets

| Secret | Purpose | How to Set |
|--------|---------|------------|
| `DEPLOY_SSH_KEY` | CI deploy key private key | `gh secret set DEPLOY_SSH_KEY < ~/.ssh/imp-deploy-ci` |
| `ANSIBLE_VAULT_PASSWORD` | Decrypt vault.yml | `gh secret set ANSIBLE_VAULT_PASSWORD < ~/.ansible-vault-pass` |
| `NPM_ARTIFACTORY_TOKEN` | (Optional) Artifactory npm registry | Via GitHub UI |

### Service Ports Quick Reference

| Port | Service | Protocol | Access |
|------|---------|----------|--------|
| 22 | SSH | TCP | Env VLAN + management VLAN |
| 80 | HTTP | TCP | External (client VM only) |
| 443 | HTTPS | TCP | External (client VM only) |
| 2727 | IMP Server | TCP | Env VLAN + management VLAN |
| 3306 | MySQL | TCP | Env VLAN + management VLAN |
| 8200 | Vault API | TCP | All env VLANs + management |
| 8201 | Vault Cluster | TCP | Management VLAN |
| 9000 | MinIO API | TCP | Env VLAN + management VLAN |
| 9001 | MinIO Console | TCP | Env VLAN + management VLAN |
| 9090 | Prometheus | TCP | Monitoring network |
| 9100 | Node Exporter | TCP | All env VLANs |
| 3000 | Grafana | TCP | Management VLAN |
