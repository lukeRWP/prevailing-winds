# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Prevailing Winds (PW) is the infrastructure-as-code platform that manages multi-environment deployments for the IMP application on a self-hosted Proxmox cluster. It provides:

- **Terraform**: VM provisioning on Proxmox, VLAN networks and firewall on UniFi
- **Ansible**: Configuration management (MySQL, MinIO, Node.js, Nginx, Vault, monitoring)
- **Orchestrator API**: REST API for lifecycle management (build, deploy, provision, destroy)
- **Security**: VLAN-per-environment isolation, Proxmox firewall, Vault secret management

## Repository Structure

```
prevailing-winds/
├── orchestrator/           # REST API for lifecycle management
│   ├── api/                # Express.js app (port 8500)
│   │   ├── index.js        # Entry point
│   │   └── src/
│   │       ├── routes/     # 8 route modules
│   │       ├── services/   # 12 service modules
│   │       ├── middleware/  # auth, validation, error handling
│   │       └── config.js   # Central configuration
│   └── apps/
│       └── imp/app.yml     # IMP application manifest
├── terraform/              # Infrastructure provisioning
│   ├── main.tf             # Root module (environments + shared VMs)
│   ├── security.tf         # Security module + group mappings
│   ├── unifi.tf            # DHCP reservations + DNS records
│   ├── unifi-networks.tf   # Environment VLAN definitions
│   ├── unifi-firewall.tf   # Inter-VLAN firewall policies
│   └── modules/
│       ├── proxmox-vm/     # Single VM resource (firewall, HA, multi-NIC)
│       ├── environment/    # 4-VM environment (client, server, db, minio)
│       └── security/       # Cluster firewall + security groups
├── ansible/
│   ├── playbooks/          # 14 playbooks (site, deploy, db, env lifecycle)
│   ├── roles/              # 15 roles (common, mysql, nginx, app-server, etc.)
│   └── inventories/        # Per-environment host configs (shared, dev, qa, prod)
├── scripts/                # deploy-orchestrator.sh, setup-terraform-backend.sh
├── systemd/                # Service unit files
└── docs/                   # INFRASTRUCTURE.md, infra-todo.md, VLAN-MIGRATION-RUNBOOK.md
```

## Network Architecture

| VLAN | CIDR | Purpose |
|------|------|---------|
| 87 | 10.0.5.0/24 | Management (orchestrator, vault, runner, Proxmox nodes) |
| 100 | 10.0.100.0/24 | Dev environment |
| 110 | 10.0.110.0/24 | QA environment |
| 120 | 10.0.120.0/24 | Prod environment |
| 7 | 10.0.1.0/24 | External/primary LAN (client ingress only) |

Each environment has 4 VMs: client (.10), server (.11), db (.12), minio (.13).

## Key Infrastructure

| Service | IP | Port | Notes |
|---------|-----|------|-------|
| Orchestrator | 10.0.5.42 | 8500 | REST API, VMID 112 |
| Vault | 10.0.5.40 | 8200 | HTTP (not HTTPS), secrets management |
| Proxmox (prx002) | 10.0.5.88 | 8006 | Primary node for VM management |
| GitHub Runner | 10.0.5.41 | - | CI/CD agent |
| PBS | 10.0.5.30 | 8007 | Proxmox Backup Server |

## Orchestrator API

The orchestrator is the central control plane for all infrastructure operations.

**Auth**: Bearer token (`ADMIN_TOKEN` env var or app-specific `APP_TOKEN_*`).

**API URL Prefixes** (same convention as IMP):
- `_x_` - GET operations
- `_y_` - POST operations

**Key Endpoints**:
```
GET  /health                                    # Liveness check
GET  /api/_x_/apps                              # List registered apps
GET  /api/_x_/apps/:app/envs                    # List environments
POST /api/_y_/apps/:app/envs/:env/build         # Full lifecycle build
POST /api/_y_/apps/:app/envs/:env/destroy       # Destroy environment
POST /api/_y_/apps/:app/envs/:env/deploy        # Deploy app code
POST /api/_y_/apps/:app/envs/:env/provision     # Ansible provisioning
POST /api/_y_/apps/:app/envs/:env/infra/plan    # Terraform plan
POST /api/_y_/apps/:app/envs/:env/infra/apply   # Terraform apply
POST /api/_y_/apps/:app/envs/:env/db/setup      # Database initialization
GET  /api/_x_/ops                               # List operations
GET  /api/_x_/ops/:id/stream                    # SSE output stream
```

**Operation Model**: All mutating endpoints return an `operationId`. Operations execute asynchronously in a per-environment serialized queue (SQLite-backed). Stream output via SSE.

## Terraform

**Providers**: `bpg/proxmox` (~0.95) + `filipowm/unifi` (~1.0)

**Workspaces**:
- `default` — Shared infra (Vault, Runner, security groups, cloud-init, VLANs, firewall)
- `dev`, `qa`, `prod` — Per-environment VMs

**State Backend**: S3-compatible (MinIO). Each workspace has isolated state.

**Modules**:
- `proxmox-vm` — Single VM: clone, CPU passthrough, multi-NIC, Proxmox firewall rules, HA enrollment
- `environment` — 4-VM set (client/server/db/minio) with role-specific security groups
- `security` — Cluster firewall policy + security groups (SSH, ICMP, monitoring, per-env app/db/minio, egress)

**CRITICAL**: The cluster firewall `input_policy=DROP` requires explicit cluster-level rules for node management (SSH, 8006, Corosync). Security groups only apply to VMs. See `docs/infra-todo.md` and `tasks/lessons.md` in the IMP repo for the lockout incident.

## Ansible

**Config**: SSH pipelining enabled, `deploy` user, strict host key checking disabled for initial provisioning.

**Key Playbooks**:
- `site.yml` — Full environment provisioning
- `shared.yml` — Vault + Runner provisioning
- `deploy-all.yml` — Application deployment with pre-flight validation and rollback
- `db-setup.yml` — Initialize all 13 IMP databases
- `env-start.yml` / `env-stop.yml` / `env-status.yml` — Environment lifecycle

**Key Roles**:
- `common` — Hostname, SSH hardening, UFW, Vault CLI, cloud-init cleanup
- `mysql` — MySQL 8.0, multi-database creation, SSL certs, user management
- `nginx` — Reverse proxy with TLS modes (none/selfsigned/letsencrypt)
- `app-server` — Capistrano-style release deployment, PM2 service
- `app-client` — Static web root with release rotation
- `vault` — HashiCorp Vault server
- `orchestrator` — Orchestrator service with multi-NIC netplan

**Inventories**: `inventories/{shared,dev,qa,prod}/hosts.yml` with `group_vars/all/` for environment-specific config. Sensitive values in Ansible-vault encrypted `vault.yml`.

## App Manifest

`orchestrator/apps/imp/app.yml` defines the IMP application:
- Build commands (client: Vite, server: npm ci + tarball)
- Database list (13 MySQL databases) and env var mappings
- VM topology with Ansible role assignments per VM type
- Health check endpoints per service
- Per-environment config (VLAN, CIDR, gateway, pipeline settings)

When modifying infrastructure for IMP, update the manifest — the orchestrator reads it to drive all operations.

## Security Model

**Defense in Depth** (4 layers):
1. **Proxmox cluster firewall** — `input_policy=DROP`, explicit allow rules for node management
2. **VM-level firewall** — Per-VM `input_policy=DROP` + `output_policy=DROP`, security groups control all traffic
3. **UFW on VMs** — Ansible-managed host firewall (management CIDR only for SSH)
4. **Application-level** — Vault-managed secrets, SSL/TLS for MySQL, rate limiting

**VLAN Isolation**: Each environment on its own VLAN. Cross-VLAN traffic dropped by default (Proxmox firewall + UniFi firewall rules). Only management VLAN can reach all environments.

## Common Operations

```bash
# Deploy orchestrator code to VM 112
qm guest exec 112 -- bash -c 'export HOME=/opt/orchestrator && bash /opt/orchestrator/pw-repo/scripts/deploy-orchestrator.sh'

# Apply shared infrastructure (security groups, VLANs, cloud-init)
curl -X POST http://10.0.5.42:8500/api/_y_/apps/imp/envs/shared/infra/apply \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Full environment build
curl -X POST http://10.0.5.42:8500/api/_y_/apps/imp/envs/dev/build \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ref": "master", "force": true}'
```

## Important Notes

- Always apply shared infra (`envs/shared/infra/apply`) before environment-specific infra
- The orchestrator runs on VMID 112 with multi-NIC access to all environment VLANs
- Vault runs plain HTTP on port 8200 (not HTTPS) — TLS is a documented TODO
- Terraform state is per-workspace in MinIO; don't mix workspaces
- Ansible uses a Python venv at `/opt/orchestrator/ansible-venv/`
- The `deploy` user is the standard SSH user on all VMs (cloud-init provisioned)

## Workflow Orchestration
### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately
- Use plan mode for verification steps, not just building
### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
### 3. Self-Improvement Loop
- After ANY correction from the user: update IMP repo `tasks/lessons.md` with the pattern
- Review lessons at session start for relevant project
### 4. Verification Before Done
- Never mark a task complete without proving it works
- Ask yourself: "Would a staff engineer approve this?"
### 5. Core Principles
- **Simplicity First**: Make every change as simple as possible
- **No Laziness**: Find root causes. No temporary fixes
- **Minimal Impact**: Changes should only touch what's necessary
