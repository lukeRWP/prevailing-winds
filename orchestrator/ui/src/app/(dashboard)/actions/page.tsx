'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Rocket, Server, Database, Power, HardDrive } from 'lucide-react';
import { ConfirmationDialog } from '@/components/actions/confirmation-dialog';
import { useApp } from '@/hooks/use-app';
import { AppSection } from '@/components/layout/app-section';
import { cn } from '@/lib/utils';
import type { AppSummary } from '@/lib/app-context';

type Severity = 'normal' | 'warning' | 'danger';

interface ActionConfig {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  severity: Severity;
  apiPath: (env: string) => string;
  method: string;
  fields: Array<{ key: string; label: string; type: 'select' | 'text'; options?: string[] }>;
  requireTyping?: boolean;
}

function getActions(app: string, environments: string[]): ActionConfig[] {
  const envOptions = environments.length > 0 ? environments : ['dev', 'qa', 'prod'];
  return [
    {
      id: 'deploy', label: 'Deploy', description: 'Deploy application to an environment',
      icon: Rocket, severity: 'normal',
      apiPath: (env) => `/api/proxy/_y_/apps/${app}/envs/${env}/deploy`, method: 'POST',
      fields: [
        { key: 'env', label: 'Environment', type: 'select', options: envOptions },
        { key: 'ref', label: 'Git Ref', type: 'text' },
      ],
    },
    {
      id: 'provision', label: 'Provision', description: 'Run Ansible provision on environment VMs',
      icon: Server, severity: 'warning',
      apiPath: (env) => `/api/proxy/_y_/apps/${app}/envs/${env}/provision`, method: 'POST',
      fields: [{ key: 'env', label: 'Environment', type: 'select', options: envOptions }],
    },
    {
      id: 'infra-plan', label: 'Infra Plan', description: 'Preview Terraform changes',
      icon: HardDrive, severity: 'normal',
      apiPath: (env) => `/api/proxy/_y_/apps/${app}/envs/${env}/infra/plan`, method: 'POST',
      fields: [{ key: 'env', label: 'Environment', type: 'select', options: envOptions }],
    },
    {
      id: 'infra-apply', label: 'Infra Apply', description: 'Apply Terraform changes',
      icon: HardDrive, severity: 'warning',
      apiPath: (env) => `/api/proxy/_y_/apps/${app}/envs/${env}/infra/apply`, method: 'POST',
      fields: [{ key: 'env', label: 'Environment', type: 'select', options: envOptions }],
    },
    {
      id: 'db-setup', label: 'DB Setup', description: 'Initialize database schemas',
      icon: Database, severity: 'warning',
      apiPath: (env) => `/api/proxy/_y_/apps/${app}/envs/${env}/db/setup`, method: 'POST',
      fields: [{ key: 'env', label: 'Environment', type: 'select', options: envOptions }],
    },
    {
      id: 'db-backup', label: 'DB Backup', description: 'Backup all databases',
      icon: Database, severity: 'normal',
      apiPath: (env) => `/api/proxy/_y_/apps/${app}/envs/${env}/db/backup`, method: 'POST',
      fields: [{ key: 'env', label: 'Environment', type: 'select', options: envOptions }],
    },
    {
      id: 'start', label: 'Start', description: 'Start all VMs in an environment',
      icon: Power, severity: 'normal',
      apiPath: (env) => `/api/proxy/_y_/apps/${app}/envs/${env}/start`, method: 'POST',
      fields: [{ key: 'env', label: 'Environment', type: 'select', options: envOptions }],
    },
    {
      id: 'stop', label: 'Stop', description: 'Stop all VMs in an environment',
      icon: Power, severity: 'warning',
      apiPath: (env) => `/api/proxy/_y_/apps/${app}/envs/${env}/stop`, method: 'POST',
      fields: [{ key: 'env', label: 'Environment', type: 'select', options: envOptions }],
    },
    {
      id: 'destroy', label: 'Destroy', description: 'Destroy all infrastructure for an environment. This is irreversible!',
      icon: Power, severity: 'danger',
      apiPath: (env) => `/api/proxy/_y_/apps/${app}/envs/${env}/infra/destroy`, method: 'POST',
      fields: [{ key: 'env', label: 'Environment', type: 'select', options: envOptions }],
      requireTyping: true,
    },
  ];
}

export default function ActionsPage() {
  const { apps } = useApp();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Actions</h1>
        <p className="text-sm text-muted-foreground">Trigger deploys, builds, and infrastructure operations</p>
      </div>

      {apps.map((app) => (
        <AppSection key={app.name} app={app}>
          <AppActions app={app} />
        </AppSection>
      ))}
    </div>
  );
}

function AppActions({ app }: { app: AppSummary }) {
  const router = useRouter();
  const actions = useMemo(() => getActions(app.name, app.environments), [app.name, app.environments]);

  const [selectedAction, setSelectedAction] = useState<ActionConfig | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function selectAction(action: ActionConfig) {
    setSelectedAction(action);
    setFormData({ env: app.environments[0] || 'dev' });
    setError('');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setConfirmOpen(true);
  }

  async function executeAction() {
    if (!selectedAction) return;
    setLoading(true);
    setError('');

    try {
      const env = formData.env || app.environments[0] || 'dev';
      const body: Record<string, string> = {};
      if (formData.ref) body.ref = formData.ref;

      const res = await fetch(selectedAction.apiPath(env), {
        method: selectedAction.method,
        headers: { 'Content-Type': 'application/json' },
        body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
      });

      const data = await res.json();
      if (data.success && data.data?.id) {
        router.push(`/operations/${data.data.id}`);
      } else {
        setError(data.message || 'Action failed');
      }
    } catch {
      setError('Failed to execute action');
    } finally {
      setLoading(false);
      setConfirmOpen(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {actions.map((action) => {
          const Icon = action.icon;
          const isSelected = selectedAction?.id === action.id;
          return (
            <button
              key={action.id}
              onClick={() => selectAction(action)}
              className={cn(
                'rounded-md border bg-card/50 p-3 text-left transition-colors',
                isSelected ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-zinc-600',
                action.severity === 'danger' && 'hover:border-red-500/50'
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">{action.label}</span>
                {action.severity === 'danger' && (
                  <span className="text-[9px] bg-red-500/20 text-red-400 px-1 py-0.5 rounded">destructive</span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">{action.description}</p>
            </button>
          );
        })}
      </div>

      {selectedAction && (
        <div className="rounded-md border border-border bg-card/50 p-3">
          <h3 className="text-xs font-medium text-foreground mb-3">
            Configure: {selectedAction.label}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-3">
            {selectedAction.fields.map((field) => (
              <div key={field.key} className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground">{field.label}</label>
                {field.type === 'select' ? (
                  <select
                    value={formData[field.key] || ''}
                    onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                    className="w-full rounded-md border border-border bg-input px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {field.options?.map((opt) => (
                      <option key={opt} value={opt}>{opt.toUpperCase()}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={formData[field.key] || ''}
                    onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                    placeholder={field.key === 'ref' ? 'master' : ''}
                    className="w-full rounded-md border border-border bg-input px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                )}
              </div>
            ))}

            {error && <p className="text-xs text-red-400">{error}</p>}

            <button
              type="submit"
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Execute {selectedAction.label}
            </button>
          </form>
        </div>
      )}

      {selectedAction && (
        <ConfirmationDialog
          open={confirmOpen}
          title={`Execute ${selectedAction.label}?`}
          description={`This will ${selectedAction.description.toLowerCase()} for ${app.displayName || app.name} — ${(formData.env || 'dev').toUpperCase()}.`}
          severity={selectedAction.severity}
          confirmText={`Execute ${selectedAction.label}`}
          requireTyping={selectedAction.requireTyping ? formData.env : undefined}
          onConfirm={executeAction}
          onCancel={() => setConfirmOpen(false)}
          loading={loading}
        />
      )}
    </div>
  );
}
