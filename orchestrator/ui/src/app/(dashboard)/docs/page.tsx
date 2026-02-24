'use client';

import { useState } from 'react';
import { BookOpen, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const SECTIONS = [
  { id: 'auth', title: 'Authentication' },
  { id: 'dashboard', title: 'Dashboard' },
  { id: 'topology', title: 'Topology' },
  { id: 'environments', title: 'Environments' },
  { id: 'operations', title: 'Operations' },
  { id: 'networking', title: 'Networking' },
  { id: 'cicd', title: 'CI/CD' },
  { id: 'logs', title: 'Logs' },
  { id: 'metrics', title: 'Metrics' },
  { id: 'actions', title: 'Actions' },
  { id: 'apps', title: 'Apps' },
  { id: 'secrets', title: 'Secrets' },
  { id: 'config', title: 'Config' },
  { id: 'manifest', title: 'App Manifest' },
  { id: 'api', title: 'API Reference' },
] as const;

export default function DocsPage() {
  const [active, setActive] = useState('auth');

  return (
    <div className="flex gap-6 h-[calc(100vh-4rem)]">
      {/* Sidebar TOC */}
      <nav className="hidden lg:block w-48 shrink-0 py-2 overflow-y-auto">
        <div className="flex items-center gap-2 px-3 mb-4">
          <BookOpen className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Usage Guide</span>
        </div>
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            onClick={() => setActive(s.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors',
              active === s.id
                ? 'bg-accent text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <ChevronRight className="h-3 w-3 shrink-0" />
            {s.title}
          </a>
        ))}
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-12 pr-2">
        <div className="max-w-3xl space-y-10">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Usage Guide</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Complete reference for the Prevailing Winds Dashboard
            </p>
          </div>

          <Section id="auth" title="Authentication">
            <P>The dashboard uses token-based authentication. Two token types exist:</P>
            <Table
              headers={['Token Type', 'Access']}
              rows={[
                ['Admin', 'Full access to all apps, secrets, and management operations'],
                ['App-scoped', 'Read/write access to a single application\'s resources only'],
              ]}
            />
            <P>
              Tokens are configured in the orchestrator environment. The login page accepts a bearer
              token which is stored as an HTTP-only cookie for the session.
            </P>
          </Section>

          <Section id="dashboard" title="Dashboard">
            <P>The home page shows a global health summary and per-application sections:</P>
            <Ul items={[
              'Global KPIs: registered app count, orchestrator uptime',
              'Per-app sections: environment status cards with VM counts, recent operations',
            ]} />
            <P>Each app\'s data is fetched independently and displayed in a labeled AppSection container.</P>
          </Section>

          <Section id="topology" title="Topology">
            <P>Interactive canvas showing the full infrastructure topology:</P>
            <Ul items={[
              'Management VLAN: shared infrastructure (Vault, Runner, Orchestrator)',
              'External VLAN: public ingress network',
              'App groups: when multiple apps exist, each is wrapped in a labeled container',
              'Environment groups: VLAN-isolated groups containing VM nodes',
              'VM nodes: clickable — shows IP, status, Proxmox node, and services',
            ]} />
            <P>Controls: zoom, pan, minimap, fit-to-view. Auto-refreshes every 15 seconds.</P>
          </Section>

          <Section id="environments" title="Environments">
            <P>
              Lists all environments across all registered apps, grouped by application.
              Click an environment card to drill into its detail page showing VM status, config,
              and available actions (deploy, provision, destroy).
            </P>
          </Section>

          <Section id="operations" title="Operations">
            <P>Lists all orchestrator operations grouped by app:</P>
            <Ul items={[
              'Filter by environment, status (queued/running/success/failed), and type',
              'Click an operation for full output log, duration, and metadata',
              'Operations are created by CI/CD pipelines or manual actions',
            ]} />
          </Section>

          <Section id="networking" title="Networking">
            <P>Derived from app manifests — shows the network architecture per app:</P>
            <Ul items={[
              'VLANs: all VLANs with CIDR, gateway, purpose. Click for detail page.',
              'Firewall Rules: security groups by category (platform, application, egress)',
              'DNS Records: A records across all environments. Filter by category and search.',
              'VLAN Detail: per-VLAN view with related DNS records and security groups',
            ]} />
          </Section>

          <Section id="cicd" title="CI/CD">
            <P>Per-app CI/CD pipeline visualization:</P>
            <Ul items={[
              'Pipeline flow: stages from code push through build, test, deploy',
              'Deployment tracker: per-environment deployment status and history',
              'Recent operations: latest CI/CD-triggered operations',
            ]} />
          </Section>

          <Section id="logs" title="Logs">
            <P>
              Terminal-style log viewer per app. Shows real-time operation logs streamed from the
              orchestrator. Filter by environment. Monospace output with timestamp formatting.
            </P>
          </Section>

          <Section id="metrics" title="Metrics">
            <Ul items={[
              'Global section: orchestrator health — uptime, memory, API version',
              'Per-app sections: operation counts, success/failure rates, operations by type',
              'External dashboards: links to Grafana/Prometheus if configured',
            ]} />
          </Section>

          <Section id="actions" title="Actions">
            <P>Manual infrastructure operations per app:</P>
            <Ul items={[
              'Available: Deploy, Provision, Terraform Plan/Apply, Build Env, Destroy Env',
              'Each action shows description, required parameters, and severity level',
              'Dangerous actions (destroy) require typing the environment name to confirm',
              'Actions create operations trackable on the Operations page',
            ]} />
          </Section>

          <Section id="apps" title="Apps">
            <P>Application registry management (admin only for writes):</P>
            <Ul items={[
              'View: card grid showing all registered apps with display name, repo, and env badges',
              'Register: click "Register App", provide name and paste full app.yml manifest',
              'Delete: click trash icon on app card — requires confirmation',
              'Navigate: click an app card to go to its Config page',
            ]} />
          </Section>

          <Section id="secrets" title="Secrets">
            <P>
              Full CRUD for HashiCorp Vault secrets. These are injected as environment variables
              during deployment via Ansible.
            </P>

            <H3>Infrastructure Secrets (admin only)</H3>
            <P>
              Shown at the top of the page at <Mono>secret/data/pw/infra</Mono>. Includes
              Proxmox API credentials, UniFi API credentials, SSH keys, and MinIO/S3 credentials.
            </P>

            <H3>Per-App Secrets</H3>
            <P>Each app has a tabbed interface with scopes:</P>
            <Table
              headers={['Tab', 'Vault Path', 'Description']}
              rows={[
                ['App-level', 'secret/data/apps/{app}', 'Shared across all environments'],
                ['DEV', 'secret/data/apps/{app}/dev', 'Dev-specific secrets'],
                ['QA', 'secret/data/apps/{app}/qa', 'QA-specific secrets'],
                ['PROD', 'secret/data/apps/{app}/prod', 'Production secrets'],
              ]}
            />

            <H3>Operations</H3>
            <Ul items={[
              'View: keys listed with masked values (••••••••)',
              'Reveal: click eye icon to show actual value',
              'Edit: hover row, click pencil icon for inline editing',
              'Delete: hover row, click trash icon — inline confirmation',
              'Add: click "Add Secret" to create a new key-value pair',
              'Generate: for env tabs, auto-creates MySQL, MinIO, auth, and encryption keys',
            ]} />

            <H3>Generated Secret Keys</H3>
            <Table
              headers={['Key', 'Description']}
              rows={[
                ['mysql_root_password', 'MySQL root password'],
                ['mysql_user', 'MySQL application user'],
                ['mysql_password', 'MySQL application password'],
                ['mysql_ssl_user / mysql_ssl_password', 'MySQL SSL credentials'],
                ['minio_access_key / minio_secret_key', 'MinIO/S3 credentials'],
                ['auth_secret_key', 'JWT/auth signing key'],
                ['cookie_secret', 'Session cookie encryption'],
                ['file_encryption_key', 'File-at-rest encryption'],
                ['sync_encryption_key', 'Data sync encryption'],
              ]}
            />
          </Section>

          <Section id="config" title="Config">
            <P>Application manifest editor for the current app:</P>
            <Ul items={[
              'General: name, display name, repository, vault prefix',
              'VM Roles: Ansible roles per VM type, health check config',
              'Environments table: VLAN, CIDR, gateway (inline editable), pipeline config',
              'Host details: per-environment cards with IP, external IP, Proxmox node',
              'Change review: pending edits tracked with diff, dry run, apply, and rollback',
            ]} />
            <P>
              <strong>Config History</strong> (<Mono>/config/history</Mono>): audit log of all
              manifest changes with rollback capability.
            </P>
          </Section>

          <Section id="manifest" title="App Manifest (app.yml)">
            <P>Each application is defined by a YAML manifest with these top-level fields:</P>
            <Table
              headers={['Field', 'Description']}
              rows={[
                ['name', 'Unique identifier (lowercase, hyphens allowed)'],
                ['displayName', 'Human-readable name'],
                ['repo', 'Git repository URL'],
                ['vaultPrefix', 'Vault KV path prefix for secrets'],
                ['ansibleGroups', 'Maps VM roles to Ansible inventory group names'],
                ['build', 'Build config — components with install/build/tarball steps'],
                ['databases', 'MySQL database list, schema prefix, env var mappings'],
                ['vmTemplate', 'VM roles (Ansible roles) and health check definitions'],
                ['environments', 'Per-env config: VLAN, CIDR, hosts, pipeline triggers'],
              ]}
            />
            <H3>Environment Pipeline Options</H3>
            <Table
              headers={['Field', 'Description']}
              rows={[
                ['autoDeployBranch', 'Auto-deploy when this branch is pushed (e.g. "master")'],
                ['deployOnTag', 'Deploy when tags match this pattern (e.g. "v*")'],
                ['requiresApproval', 'If true, deploys require manual approval'],
              ]}
            />
          </Section>

          <Section id="api" title="API Reference">
            <P>
              The orchestrator API is at <Mono>https://&lt;orchestrator&gt;:8500</Mono>. All
              endpoints require a Bearer token.
            </P>
            <H3>URL Prefix Convention</H3>
            <Table
              headers={['Prefix', 'HTTP Method']}
              rows={[
                ['_x_', 'GET (read)'],
                ['_y_', 'POST (create/action)'],
                ['_u_', 'PUT (update)'],
                ['_d_', 'DELETE'],
              ]}
            />
            <H3>Key Endpoints</H3>
            <Table
              headers={['Endpoint', 'Description']}
              rows={[
                ['GET /api/_x_/auth/whoami', 'Token introspection'],
                ['GET /api/_x_/apps', 'List all apps (admin)'],
                ['GET /api/_x_/apps/:app', 'App manifest details'],
                ['PUT /api/_u_/apps/:app/manifest', 'Register/update manifest (admin)'],
                ['DELETE /api/_d_/apps/:app', 'Delete app (admin)'],
                ['GET /api/_x_/apps/:app/envs/:env/status', 'Environment + VM status'],
                ['GET /api/_x_/apps/:app/secrets', 'App-level Vault secrets'],
                ['GET /api/_x_/apps/:app/envs/:env/secrets', 'Environment secrets'],
                ['PUT /api/_u_/apps/:app/secrets', 'Write/merge app secrets'],
                ['PUT /api/_u_/apps/:app/envs/:env/secrets', 'Write/merge env secrets'],
                ['DELETE /api/_d_/apps/:app/secrets/:key', 'Delete a secret key'],
                ['POST /api/_y_/apps/:app/envs/:env/secrets/generate', 'Generate standard secrets'],
                ['GET /api/_x_/infra/secrets', 'Infra secrets (admin)'],
                ['POST /api/_y_/apps/:app/envs/:env/deploy', 'Trigger deployment'],
                ['POST /api/_y_/apps/:app/envs/:env/provision', 'Ansible provisioning'],
                ['POST /api/_y_/apps/:app/envs/:env/plan', 'Terraform plan'],
                ['POST /api/_y_/apps/:app/envs/:env/apply', 'Terraform apply'],
                ['GET /api/_x_/ops', 'List operations'],
                ['GET /api/_x_/ops/:id', 'Operation details + output'],
                ['GET /health/status', 'Orchestrator health'],
              ]}
            />
          </Section>
        </div>
      </div>
    </div>
  );
}

// --- Primitives ---

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="text-lg font-semibold text-foreground mb-3 pb-2 border-b border-border/50">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-medium text-foreground mt-4 mb-1">{children}</h3>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground leading-relaxed">{children}</p>;
}

function Mono({ children }: { children: React.ReactNode }) {
  return <code className="text-xs font-mono bg-accent px-1.5 py-0.5 rounded text-foreground">{children}</code>;
}

function Ul({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1 ml-4">
      {items.map((item, i) => (
        <li key={i} className="text-sm text-muted-foreground leading-relaxed list-disc">{item}</li>
      ))}
    </ul>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-accent/30">
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-accent/20">
              {row.map((cell, j) => (
                <td key={j} className={cn('px-3 py-1.5 text-xs', j === 0 ? 'font-mono text-foreground' : 'text-muted-foreground')}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
