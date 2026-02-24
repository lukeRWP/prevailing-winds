# Prevailing Winds Dashboard — Usage Guide

The PW Dashboard is the central control plane for managing applications deployed on Proxmox infrastructure via Prevailing Winds. It provides visibility into environments, networking, secrets, operations, and CI/CD pipelines.

**Access**: `https://<orchestrator-ip>:3100` (default: `https://10.0.5.42:3100`)

## Authentication

The dashboard uses token-based authentication. Two token types exist:

| Token Type | Access |
|------------|--------|
| **Admin** | Full access to all apps, secrets, and management operations |
| **App-scoped** | Read/write access to a single application's resources only |

Tokens are configured in the orchestrator's environment. The login page accepts a bearer token which is stored as an HTTP-only cookie for the session.

## Pages

### Dashboard (`/`)

The home page shows a global health summary and per-application sections:

- **Global KPIs**: Registered app count, orchestrator uptime
- **Per-app sections**: Environment status cards with VM counts, recent operations

Each app's data is fetched independently and displayed in a labeled `AppSection` container.

### Topology (`/topology`)

Interactive ReactFlow canvas showing the full infrastructure topology:

- **Management VLAN**: Shared infrastructure (Vault, Runner, Orchestrator)
- **External VLAN**: Public ingress network
- **App groups**: When multiple apps are registered, each app's environments are wrapped in a labeled container
- **Environment groups**: VLAN-isolated groups containing VM nodes
- **VM nodes**: Clickable — shows IP, status, Proxmox node, and services

Controls: zoom, pan, minimap, fit-to-view. Data auto-refreshes every 15 seconds.

### Environments (`/environments`)

Lists all environments across all registered apps, grouped by application:

- Click an environment card to drill into its detail page
- Detail page (`/environments/[env]`) shows: VM status table, environment config, available actions (deploy, provision, destroy)

### Operations (`/operations`)

Lists all orchestrator operations (deploys, provisions, terraform plans, etc.) grouped by app:

- **Filters**: Environment, status (queued/running/success/failed), operation type
- Click an operation to see its full output log, duration, and metadata
- Operations are created by CI/CD pipelines or manual actions

### Networking (`/networking`)

Derived from app manifests — shows the network architecture per app:

- **VLANs**: All VLANs with CIDR, gateway, purpose. Click for detail page.
- **Firewall Rules** (`/networking/firewall`): Security groups organized by category (platform, application, egress). Ingress and egress rules with source/dest CIDRs.
- **DNS Records** (`/networking/dns`): A records across all environments. Filter by category (shared, VM, alias) and search by hostname/IP.
- **VLAN Detail** (`/networking/vlans/[id]`): Per-VLAN view with related DNS records and security groups.

### CI/CD (`/cicd`)

Per-app CI/CD pipeline visualization:

- **Pipeline flow**: Shows the stages from code push through build, test, deploy
- **Deployment tracker**: Per-environment deployment status and history
- **Recent operations**: Latest CI/CD-triggered operations

### Logs (`/logs`)

Terminal-style log viewer per app:

- Real-time operation logs streamed from the orchestrator
- Filter by environment
- Monospace output with timestamp formatting

### Metrics (`/metrics`)

- **Global section**: Orchestrator health — uptime, memory usage, API version
- **Per-app sections**: Operation counts, success/failure rates, operations by type breakdown
- **External dashboards**: Links to Grafana/Prometheus if configured

### Actions (`/actions`)

Manual infrastructure operations per app:

- **Available actions**: Deploy, Provision, Terraform Plan/Apply, Build Environment, Destroy Environment
- Each action shows: description, required parameters (env, ref/branch), severity level
- **Confirmation dialog**: Dangerous actions (destroy) require typing the environment name
- Actions create operations that can be tracked on the Operations page

### Apps (`/apps`)

Application registry management (admin only for write operations):

- **View**: Card grid showing all registered apps with display name, repo, and environment badges
- **Register**: Click "Register App" to add a new application. Provide a name and paste the full `app.yml` manifest content.
- **Delete**: Click the trash icon on an app card. Requires confirmation.
- **Navigate**: Click an app card to go to its Config page

### Secrets (`/secrets`)

Full CRUD management for HashiCorp Vault secrets. These secrets are injected as environment variables during deployment via Ansible.

#### Infrastructure Secrets (admin only)

Shown at the top of the page. These are shared secrets at `secret/data/pw/infra`:

- Proxmox API credentials
- UniFi API credentials
- SSH key pair
- MinIO/S3 credentials

#### Per-App Secrets

Each app has a tabbed interface:

| Tab | Vault Path | Description |
|-----|-----------|-------------|
| **App-level** | `secret/data/apps/{app}` | Secrets shared across all environments |
| **DEV** | `secret/data/apps/{app}/dev` | Dev-specific secrets |
| **QA** | `secret/data/apps/{app}/qa` | QA-specific secrets |
| **PROD** | `secret/data/apps/{app}/prod` | Production-specific secrets |

#### Secret Operations

- **View**: All secret keys are listed with masked values (`••••••••`)
- **Reveal**: Click the eye icon to show the actual value
- **Edit**: Hover over a row and click the pencil icon for inline editing
- **Delete**: Hover and click the trash icon — requires inline confirmation
- **Add**: Click "Add Secret" to create a new key-value pair
- **Generate**: For environment tabs, click "Generate" to auto-create the standard set (MySQL, MinIO, auth, encryption keys). Existing secrets are preserved unless forced.

#### Generated Secret Keys

The Generate button creates these keys per environment:

| Key | Description |
|-----|-------------|
| `mysql_root_password` | MySQL root password |
| `mysql_user` | MySQL application user |
| `mysql_password` | MySQL application password |
| `mysql_ssl_user` | MySQL SSL user |
| `mysql_ssl_password` | MySQL SSL password |
| `minio_access_key` | MinIO/S3 access key |
| `minio_secret_key` | MinIO/S3 secret key |
| `auth_secret_key` | JWT/auth signing key |
| `cookie_secret` | Session cookie encryption |
| `file_encryption_key` | File-at-rest encryption |
| `sync_encryption_key` | Data sync encryption |

### Config (`/config`)

Application manifest editor for the current app:

- **General**: Name, display name, repository, vault prefix
- **VM Roles**: Ansible roles assigned to each VM type, health check config
- **Environments table**: VLAN, CIDR, gateway (inline editable), host count, pipeline config
- **Host details**: Per-environment host cards with IP, external IP, Proxmox node (editable)
- **Change review**: Pending edits are tracked. Click "Review Changes" to see a diff, run a dry run, or apply changes. Changes are recorded with rollback support.

### Config History (`/config/history`)

Audit log of all manifest changes:

- Shows change sets with status (applied/rolled back), timestamp, and who applied them
- Each change set lists the affected fields
- **Rollback**: Click "Rollback" on any applied change set to revert it

## Multi-App Architecture

All pages display data grouped by application. When multiple apps are registered:

- Each page renders an **AppSection** per app with the app name, repository, and environment count
- Sub-components fetch data independently per app
- The topology canvas wraps each app's environments in a labeled container node
- The header shows an app selector dropdown (admin only) to switch the active app for single-app pages (Config, Environment Detail)

## App Manifest (`app.yml`)

Each application is defined by a YAML manifest. Here is the structure:

```yaml
name: myapp                              # Unique identifier (lowercase, hyphens ok)
displayName: "My Application"            # Human-readable name
repo: "git@github.com:org/repo.git"      # Git repository URL
vaultPrefix: "secret/apps/myapp"         # Vault KV path prefix

ansibleGroups:                           # Maps roles to Ansible inventory groups
  client: myapp_clients
  server: myapp_servers
  database: myapp_databases

build:                                   # Build configuration
  env: { NODE_ENV: development }
  components:
    client:
      dir: client
      install: "npm ci"
      build: "npm run build"
      tarball: { name: "client.tar.gz", from: "build", args: "-C build ." }
    server:
      dir: server
      install: "npm ci"
      tarball: { name: "server.tar.gz", includes: [index.js, package.json, src/] }

databases:                               # MySQL database configuration
  list: [MYAPP_MAIN, MYAPP_ADMIN]
  schemaPrefix: "MYAPP_"
  adminDb: "MYAPP_ADMIN"

vmTemplate:                              # VM roles and health checks
  roles:
    client: [common, node-exporter, nginx]
    server: [common, node-exporter, nodejs, app-server]
    database: [common, node-exporter, mysql]
  healthChecks:
    server: { path: "/health", port: 3000 }
    database: { type: tcp, port: 3306 }
    client: { path: "/", port: 443, scheme: https }

environments:                            # One block per environment
  dev:
    vlan: 100
    cidr: "10.0.100.0/24"
    gateway: "10.0.100.1"
    terraformWorkspace: "dev"
    hosts:
      client: { ip: "10.0.100.10", externalIp: "10.0.3.10", proxmoxNode: "prx001" }
      server: { ip: "10.0.100.11", proxmoxNode: "prx001" }
      database: { ip: "10.0.100.12", proxmoxNode: "prx001" }
    pipeline:
      autoDeployBranch: "master"         # Auto-deploy on push to this branch
      requiresApproval: false
  prod:
    vlan: 120
    cidr: "10.0.120.0/24"
    gateway: "10.0.120.1"
    terraformWorkspace: "prod"
    hosts:
      client: { ip: "10.0.120.10", externalIp: "10.0.3.30", proxmoxNode: "prx001" }
      server: { ip: "10.0.120.11", proxmoxNode: "prx001" }
      database: { ip: "10.0.120.12", proxmoxNode: "prx001" }
    pipeline:
      deployOnTag: "v*"                  # Deploy when tags matching this pattern are pushed
      requiresApproval: true             # Require manual approval before deploy
```

## API Reference

The orchestrator API is accessible at `https://<orchestrator-ip>:8500`. All endpoints require a Bearer token in the `Authorization` header.

### URL Prefix Convention

| Prefix | HTTP Method |
|--------|-------------|
| `_x_` | GET (read) |
| `_y_` | POST (create/action) |
| `_u_` | PUT (update) |
| `_d_` | DELETE |

### Key Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/_x_/auth/whoami` | Token introspection — role, authorized app, available apps |
| `GET /api/_x_/apps` | List all registered apps (admin only) |
| `GET /api/_x_/apps/:app` | App manifest details |
| `PUT /api/_u_/apps/:app/manifest` | Register/update app manifest (admin only) |
| `DELETE /api/_d_/apps/:app` | Delete an app (admin only) |
| `GET /api/_x_/apps/:app/envs/:env/status` | Environment status with VM health |
| `GET /api/_x_/apps/:app/secrets` | Read app-level Vault secrets |
| `GET /api/_x_/apps/:app/envs/:env/secrets` | Read environment Vault secrets |
| `PUT /api/_u_/apps/:app/secrets` | Write/merge app-level secrets |
| `PUT /api/_u_/apps/:app/envs/:env/secrets` | Write/merge environment secrets |
| `DELETE /api/_d_/apps/:app/secrets/:key` | Delete a secret key |
| `POST /api/_y_/apps/:app/envs/:env/secrets/generate` | Generate standard secrets |
| `GET /api/_x_/infra/secrets` | Read infra secrets (admin only) |
| `PUT /api/_u_/infra/secrets` | Write infra secrets (admin only) |
| `GET /api/_x_/apps/:app/networking` | Derived networking (VLANs, firewall, DNS) |
| `POST /api/_y_/apps/:app/envs/:env/deploy` | Trigger deployment |
| `POST /api/_y_/apps/:app/envs/:env/provision` | Trigger Ansible provisioning |
| `POST /api/_y_/apps/:app/envs/:env/plan` | Terraform plan |
| `POST /api/_y_/apps/:app/envs/:env/apply` | Terraform apply |
| `GET /api/_x_/ops` | List operations |
| `GET /api/_x_/ops/:id` | Operation details with output |
| `GET /health/status` | Orchestrator health and uptime |
