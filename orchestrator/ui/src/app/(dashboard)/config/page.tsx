'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Pencil, Check, X, History } from 'lucide-react';
import { useApp } from '@/hooks/use-app';
import { useChanges } from '@/lib/changes-context';
import { ChangeReviewPanel } from '@/components/config/change-review-panel';
import { cn } from '@/lib/utils';
import type { AppDetails } from '@/types/api';

export default function ConfigPage() {
  const { currentApp } = useApp();
  const { addChange, hasPendingChanges } = useChanges();
  const [app, setApp] = useState<AppDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);

  useEffect(() => {
    async function fetchApp() {
      try {
        const res = await fetch(`/api/proxy/_x_/apps/${currentApp}`);
        const data = await res.json();
        if (data.success) setApp(data.data);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    if (currentApp) fetchApp();
  }, [currentApp]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Configuration</h1>
          <p className="text-sm text-muted-foreground">Application manifest and infrastructure config</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">Loading configuration...</p>
        </div>
      </div>
    );
  }

  if (!app) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Configuration</h1>
          <p className="text-sm text-muted-foreground">Application manifest and infrastructure config</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">App not found</p>
        </div>
      </div>
    );
  }

  const envNames = Object.keys(app.environments || {});
  const roles = Object.keys(app.vmTemplate?.roles || {});

  function handleFieldChange(target: string, value: string, previous: string) {
    if (value === previous) return;
    addChange({ target, value, previous });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Configuration</h1>
          <p className="text-sm text-muted-foreground">
            Application manifest for {app.displayName || app.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/config/history"
            className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <History className="h-3.5 w-3.5" />
            History
          </Link>
          {hasPendingChanges && (
            <button
              onClick={() => setReviewOpen(true)}
              className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-400 hover:bg-amber-500/20 transition-colors"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              Review Changes
            </button>
          )}
        </div>
      </div>

      {/* General */}
      <Section title="General">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ReadOnlyField label="Name" value={app.name} mono />
          <EditableField
            label="Display Name"
            value={app.displayName}
            target="displayName"
            onChange={handleFieldChange}
          />
          <ReadOnlyField label="Repository" value={app.repo} mono />
          <ReadOnlyField label="Vault Prefix" value={app.vaultPrefix} mono />
        </div>
      </Section>

      {/* VM Template — Roles */}
      <Section title="VM Roles">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {roles.map((role) => {
            const ansibleRoles = app.vmTemplate.roles[role] || [];
            const hc = app.vmTemplate.healthChecks?.[role];
            return (
              <div key={role} className="rounded-md border border-border bg-accent/20 p-3">
                <span className="text-xs font-bold text-foreground font-mono">{role}</span>
                <div className="mt-2 space-y-1">
                  {ansibleRoles.map((r) => (
                    <span key={r} className="inline-block text-[10px] bg-accent text-muted-foreground px-1.5 py-0.5 rounded mr-1 mb-1">
                      {r}
                    </span>
                  ))}
                </div>
                {hc && (
                  <div className="mt-2 pt-2 border-t border-border">
                    <p className="text-[10px] text-muted-foreground">
                      Health: {hc.type === 'tcp' ? `TCP :${hc.port}` : `${hc.scheme || 'http'}://...${hc.path} :${hc.port}`}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* Environments */}
      <Section title="Environments">
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-accent/30">
                <th className="px-4 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">Env</th>
                <th className="px-4 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">VLAN</th>
                <th className="px-4 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">CIDR</th>
                <th className="px-4 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">Gateway</th>
                <th className="px-4 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">Hosts</th>
                <th className="px-4 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">Pipeline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {envNames.map((envName) => {
                const env = app.environments[envName];
                const hostCount = Object.keys(env.hosts || {}).length;
                return (
                  <tr key={envName} className="hover:bg-accent/20">
                    <td className="px-4 py-2">
                      <span className={cn(
                        'text-xs font-bold px-2 py-0.5 rounded-full',
                        envName === 'prod' ? 'bg-emerald-500/20 text-emerald-400' :
                        envName === 'qa' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-blue-500/20 text-blue-400'
                      )}>
                        {envName.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <InlineEdit
                        value={String(env.vlan)}
                        target={`environments.${envName}.vlan`}
                        onChange={(t, v, p) => handleFieldChange(t, v, p)}
                        mono
                      />
                    </td>
                    <td className="px-4 py-2">
                      <InlineEdit
                        value={env.cidr}
                        target={`environments.${envName}.cidr`}
                        onChange={(t, v, p) => handleFieldChange(t, v, p)}
                        mono
                      />
                    </td>
                    <td className="px-4 py-2">
                      <InlineEdit
                        value={env.gateway}
                        target={`environments.${envName}.gateway`}
                        onChange={(t, v, p) => handleFieldChange(t, v, p)}
                        mono
                      />
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{hostCount} VMs</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {env.pipeline?.autoDeployBranch && <span className="font-mono">{env.pipeline.autoDeployBranch}</span>}
                      {env.pipeline?.deployOnTag && <span className="font-mono">{env.pipeline.deployOnTag}</span>}
                      {env.pipeline?.requiresApproval && <span className="ml-1 text-amber-400">approval</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Host Details per Environment */}
      {envNames.map((envName) => {
        const env = app.environments[envName];
        const hosts = env.hosts || {};
        return (
          <Section key={envName} title={`${envName.toUpperCase()} Hosts`}>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              {Object.entries(hosts).map(([role, host]) => (
                <div key={role} className="rounded-md border border-border bg-accent/20 p-3">
                  <span className="text-xs font-bold text-foreground font-mono">{role}</span>
                  <div className="mt-2 space-y-2">
                    <EditableField
                      label="IP"
                      value={host.ip}
                      target={`environments.${envName}.hosts.${role}.ip`}
                      onChange={handleFieldChange}
                      mono
                      small
                    />
                    {host.externalIp && (
                      <EditableField
                        label="External"
                        value={host.externalIp}
                        target={`environments.${envName}.hosts.${role}.externalIp`}
                        onChange={handleFieldChange}
                        mono
                        small
                      />
                    )}
                    <EditableField
                      label="Proxmox Node"
                      value={host.proxmoxNode}
                      target={`environments.${envName}.hosts.${role}.proxmoxNode`}
                      onChange={handleFieldChange}
                      mono
                      small
                    />
                  </div>
                </div>
              ))}
            </div>
          </Section>
        );
      })}

      {/* Change Review Panel */}
      <ChangeReviewPanel open={reviewOpen} onClose={() => setReviewOpen(false)} />
    </div>
  );
}

// --- Sub-components ---

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-medium text-foreground mb-3">{title}</h2>
      {children}
    </div>
  );
}

function ReadOnlyField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className={cn('text-sm text-foreground', mono && 'font-mono text-xs')}>{value}</p>
    </div>
  );
}

function EditableField({
  label, value, target, onChange, mono, small,
}: {
  label: string;
  value: string;
  target: string;
  onChange: (target: string, value: string, previous: string) => void;
  mono?: boolean;
  small?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function startEdit() {
    setDraft(value);
    setEditing(true);
  }

  function save() {
    onChange(target, draft, value);
    setEditing(false);
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  if (editing) {
    return (
      <div>
        <p className={cn('text-muted-foreground mb-0.5', small ? 'text-[10px]' : 'text-xs')}>{label}</p>
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
            autoFocus
            className={cn(
              'rounded border border-primary bg-input px-1.5 py-0.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring',
              mono && 'font-mono',
              small ? 'text-[10px] w-28' : 'text-xs w-40'
            )}
          />
          <button onClick={save} className="p-0.5 text-emerald-400 hover:text-emerald-300">
            <Check className="h-3 w-3" />
          </button>
          <button onClick={cancel} className="p-0.5 text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group">
      <p className={cn('text-muted-foreground mb-0.5', small ? 'text-[10px]' : 'text-xs')}>{label}</p>
      <div className="flex items-center gap-1">
        <p className={cn('text-foreground', mono && 'font-mono', small ? 'text-[10px]' : 'text-sm')}>{value}</p>
        <button
          onClick={startEdit}
          className="p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground transition-opacity"
        >
          <Pencil className="h-2.5 w-2.5" />
        </button>
      </div>
    </div>
  );
}

function InlineEdit({
  value, target, onChange, mono,
}: {
  value: string;
  target: string;
  onChange: (target: string, value: string, previous: string) => void;
  mono?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function startEdit() {
    setDraft(value);
    setEditing(true);
  }

  function save() {
    onChange(target, draft, value);
    setEditing(false);
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
          autoFocus
          className={cn(
            'rounded border border-primary bg-input px-1.5 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring w-32',
            mono && 'font-mono'
          )}
        />
        <button onClick={save} className="p-0.5 text-emerald-400 hover:text-emerald-300">
          <Check className="h-3 w-3" />
        </button>
        <button onClick={cancel} className="p-0.5 text-muted-foreground hover:text-foreground">
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-1">
      <span className={cn('text-xs', mono && 'font-mono', 'text-muted-foreground')}>{value}</span>
      <button
        onClick={startEdit}
        className="p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground transition-opacity"
      >
        <Pencil className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}
