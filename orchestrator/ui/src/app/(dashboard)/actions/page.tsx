'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Rocket, Server, Database, Power, HardDrive } from 'lucide-react';
import { ConfirmationDialog } from '@/components/actions/confirmation-dialog';
import { useApp } from '@/hooks/use-app';
import { cn } from '@/lib/utils';

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
      id: 'deploy',
      label: 'Deploy',
      description: 'Deploy application to an environment',
      icon: Rocket,
      severity: 'normal',
      apiPath: (env) => `/api/proxy/_y_/apps/${app}/envs/${env}/deploy`,
      method: 'POST',
      fields: [
        { key: 'env', label: 'Environment', type: 'select', options: envOptions },
        { key: 'ref', label: 'Git Ref', type: 'text' },
      ],
    },
    {
      id: 'provision',
      label: 'Provision',
      description: 'Run Ansible provision on environment VMs',
      icon: Server,
      severity: 'warning',
      apiPath: (env) => `/api/proxy/_y_/apps/${app}/envs/${env}/provision`,
      method: 'POST',
      fields: [
        { key: 'env', label: 'Environment', type: 'select', options: envOptions },
      ],
    },
    {
      id: 'infra-plan',
      label: 'Infra Plan',
      description: 'Preview Terraform changes',
      icon: HardDrive,
      severity: 'normal',
      apiPath: (env) => `/api/proxy/_y_/apps/${app}/envs/${env}/infra/plan`,
      method: 'POST',
      fields: [
        { key: 'env', label: 'Environment', type: 'select', options: envOptions },
      ],
    },
    {
      id: 'infra-apply',
      label: 'Infra Apply',
      description: 'Apply Terraform changes',
      icon: HardDrive,
      severity: 'warning',
      apiPath: (env) => `/api/proxy/_y_/apps/${app}/envs/${env}/infra/apply`,
      method: 'POST',
      fields: [
        { key: 'env', label: 'Environment', type: 'select', options: envOptions },
      ],
    },
    {
      id: 'db-setup',
      label: 'DB Setup',
      description: 'Initialize database schemas',
      icon: Database,
      severity: 'warning',
      apiPath: (env) => `/api/proxy/_y_/apps/${app}/envs/${env}/db/setup`,
      method: 'POST',
      fields: [
        { key: 'env', label: 'Environment', type: 'select', options: envOptions },
      ],
    },
    {
      id: 'db-backup',
      label: 'DB Backup',
      description: 'Backup all databases',
      icon: Database,
      severity: 'normal',
      apiPath: (env) => `/api/proxy/_y_/apps/${app}/envs/${env}/db/backup`,
      method: 'POST',
      fields: [
        { key: 'env', label: 'Environment', type: 'select', options: envOptions },
      ],
    },
    {
      id: 'start',
      label: 'Start',
      description: 'Start all VMs in an environment',
      icon: Power,
      severity: 'normal',
      apiPath: (env) => `/api/proxy/_y_/apps/${app}/envs/${env}/start`,
      method: 'POST',
      fields: [
        { key: 'env', label: 'Environment', type: 'select', options: envOptions },
      ],
    },
    {
      id: 'stop',
      label: 'Stop',
      description: 'Stop all VMs in an environment',
      icon: Power,
      severity: 'warning',
      apiPath: (env) => `/api/proxy/_y_/apps/${app}/envs/${env}/stop`,
      method: 'POST',
      fields: [
        { key: 'env', label: 'Environment', type: 'select', options: envOptions },
      ],
    },
    {
      id: 'destroy',
      label: 'Destroy',
      description: 'Destroy all infrastructure for an environment. This is irreversible!',
      icon: Power,
      severity: 'danger',
      apiPath: (env) => `/api/proxy/_y_/apps/${app}/envs/${env}/infra/destroy`,
      method: 'POST',
      fields: [
        { key: 'env', label: 'Environment', type: 'select', options: envOptions },
      ],
      requireTyping: true,
    },
  ];
}

export default function ActionsPage() {
  const router = useRouter();
  const { currentApp, environments } = useApp();
  const actions = useMemo(() => getActions(currentApp, environments), [currentApp, environments]);

  const [selectedAction, setSelectedAction] = useState<ActionConfig | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function selectAction(action: ActionConfig) {
    setSelectedAction(action);
    setFormData({ env: environments[0] || 'dev' });
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
      const env = formData.env || environments[0] || 'dev';
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Actions</h1>
        <p className="text-sm text-muted-foreground">
          Trigger deploys, builds, and infrastructure operations
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {actions.map((action) => {
          const Icon = action.icon;
          const isSelected = selectedAction?.id === action.id;
          return (
            <button
              key={action.id}
              onClick={() => selectAction(action)}
              className={cn(
                'rounded-lg border bg-card p-4 text-left transition-colors',
                isSelected ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-zinc-600',
                action.severity === 'danger' && 'hover:border-red-500/50'
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">{action.label}</span>
                {action.severity === 'danger' && (
                  <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">
                    destructive
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{action.description}</p>
            </button>
          );
        })}
      </div>

      {/* Action Form */}
      {selectedAction && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-medium text-foreground mb-4">
            Configure: {selectedAction.label}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            {selectedAction.fields.map((field) => (
              <div key={field.key} className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
                {field.type === 'select' ? (
                  <select
                    value={formData[field.key] || ''}
                    onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                    className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {field.options?.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt.toUpperCase()}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={formData[field.key] || ''}
                    onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                    placeholder={field.key === 'ref' ? 'master' : ''}
                    className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                )}
              </div>
            ))}

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Execute {selectedAction.label}
            </button>
          </form>
        </div>
      )}

      {/* Confirmation Dialog */}
      {selectedAction && (
        <ConfirmationDialog
          open={confirmOpen}
          title={`Execute ${selectedAction.label}?`}
          description={`This will ${selectedAction.description.toLowerCase()} for ${(formData.env || 'dev').toUpperCase()}.`}
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
