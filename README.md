# Prevailing Winds

Infrastructure-as-code platform for multi-environment deployment of the [IMP](https://github.com/lukeRWP/Expansions-Management) application on a self-hosted Proxmox cluster.

## What It Does

- **Provisions VMs** on Proxmox with VLAN-isolated networking (Terraform)
- **Configures services** — MySQL, MinIO, Node.js, Nginx, Vault, monitoring (Ansible)
- **Manages lifecycle** — build, deploy, provision, destroy via REST API (Orchestrator)
- **Enforces security** — firewall rules, secret management, certificate handling

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                  Proxmox Cluster                     │
│  ┌─────────┐  ┌─────────┐                           │
│  │ prx001  │  │ prx002  │   Ceph RBD Storage         │
│  └─────────┘  └─────────┘                           │
│                                                      │
│  VLAN 87 (Management)                               │
│  ┌────────────┐ ┌───────┐ ┌────────┐ ┌─────┐       │
│  │Orchestrator│ │ Vault │ │ Runner │ │ PBS │       │
│  │  :8500     │ │ :8200 │ │        │ │     │       │
│  └────────────┘ └───────┘ └────────┘ └─────┘       │
│                                                      │
│  VLAN 100/110/120 (Dev/QA/Prod)                     │
│  ┌────────┐ ┌────────┐ ┌──────┐ ┌───────┐          │
│  │ Client │ │ Server │ │  DB  │ │ MinIO │  × 3 envs│
│  │ :443   │ │ :2727  │ │:3306 │ │ :9000 │          │
│  └────────┘ └────────┘ └──────┘ └───────┘          │
└──────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Access to the management VLAN (10.0.5.0/24)
- Orchestrator admin token (`ADMIN_TOKEN`)

### Common Operations

```bash
# Check orchestrator health
curl http://10.0.5.42:8500/health

# Build a full environment (infra + provision + deploy)
curl -X POST http://10.0.5.42:8500/api/_y_/apps/imp/envs/dev/build \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ref": "master", "force": true}'

# Deploy application code only
curl -X POST http://10.0.5.42:8500/api/_y_/apps/imp/envs/dev/deploy \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ref": "master"}'

# Stream operation output
curl -N http://10.0.5.42:8500/api/_x_/ops/{operationId}/stream \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Or use the IMP repo's Taskfile shortcuts:
```bash
task deploy ENV=dev
task env:build ENV=dev
task ops:list
```

### Deploy Orchestrator Changes

```bash
# From Proxmox host (or via qm guest exec)
qm guest exec 112 -- bash -c \
  'export HOME=/opt/orchestrator && bash /opt/orchestrator/pw-repo/scripts/deploy-orchestrator.sh'
```

## Repository Structure

| Directory | Purpose |
|-----------|---------|
| `orchestrator/` | REST API for lifecycle management (Express.js, SQLite) |
| `terraform/` | Proxmox VM provisioning, UniFi networking, firewall rules |
| `ansible/` | Configuration management playbooks and roles |
| `scripts/` | Deployment and setup utilities |
| `systemd/` | Service unit files |
| `docs/` | Infrastructure documentation |

## Documentation

- **[INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md)** — Comprehensive infrastructure guide (networking, security, deployment patterns)
- **[infra-todo.md](docs/infra-todo.md)** — Outstanding infrastructure work items
- **[VLAN-MIGRATION-RUNBOOK.md](docs/VLAN-MIGRATION-RUNBOOK.md)** — VLAN migration procedures
- **[CLAUDE.md](CLAUDE.md)** — AI assistant guidance for working with this codebase

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Hypervisor | Proxmox VE (2-node cluster, Ceph RBD) |
| Networking | UniFi (VLANs, DHCP, DNS, firewall) |
| IaC | Terraform (bpg/proxmox + filipowm/unifi providers) |
| Config Mgmt | Ansible 2.20+ |
| Secrets | HashiCorp Vault |
| Monitoring | Prometheus + Node Exporter |
| Backup | Proxmox Backup Server |
| Orchestration | Custom Node.js REST API |

## Related

- [IMP Application](https://github.com/lukeRWP/Expansions-Management) — The application this platform deploys
