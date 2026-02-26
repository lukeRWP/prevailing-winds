'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Database, Copy, Check, Eye, EyeOff, RefreshCw, ArrowRightLeft,
  HardDrive, ArchiveRestore, FileUp, Wrench, Table,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApp } from '@/hooks/use-app';
import { AppSection } from '@/components/layout/app-section';
import { ConfirmationDialog } from '@/components/actions/confirmation-dialog';
import type { AppSummary } from '@/lib/app-context';
import type { DbConnectionInfo } from '@/types/api';

export default function DatabasesPage() {
  const { apps } = useApp();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Databases</h1>
        <p className="text-sm text-muted-foreground">Connection info, sync, and database management</p>
      </div>

      {apps.map((app) => (
        <AppSection key={app.name} app={app}>
          <AppDatabases app={app} />
        </AppSection>
      ))}
    </div>
  );
}

function AppDatabases({ app }: { app: AppSummary }) {
  const envNames = app.environments || [];
  const [activeEnv, setActiveEnv] = useState(envNames[0] || 'dev');

  return (
    <div className="space-y-4">
      {/* Env tabs */}
      <div className="flex gap-1 border-b border-border">
        {envNames.map((env) => (
          <button
            key={env}
            onClick={() => setActiveEnv(env)}
            className={cn(
              'px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px',
              activeEnv === env
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {env.toUpperCase()}
          </button>
        ))}
      </div>

      <EnvDatabases appName={app.name} envName={activeEnv} allEnvs={envNames} />
    </div>
  );
}

function EnvDatabases({ appName, envName, allEnvs }: { appName: string; envName: string; allEnvs: string[] }) {
  const router = useRouter();
  const [connInfo, setConnInfo] = useState<DbConnectionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPasswords, setShowPasswords] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [syncSource, setSyncSource] = useState('');
  const [syncOpen, setSyncOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setConnInfo(null);
    fetch(`/api/proxy/_x_/apps/${appName}/envs/${envName}/db/connection`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setConnInfo(data.data);
      })
      .catch(() => { /* silent */ })
      .finally(() => setLoading(false));
  }, [appName, envName]);

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  async function triggerAction(action: string, body?: Record<string, unknown>) {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/proxy/_y_/apps/${appName}/envs/${envName}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      });
      const data = await res.json();
      if (data.success && data.data?.opId) {
        router.push(`/operations/${data.data.opId}`);
      }
    } catch { /* silent */ } finally {
      setActionLoading(false);
    }
  }

  async function handleSync() {
    if (!syncSource) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/proxy/_y_/apps/${appName}/envs/${envName}/db/seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceEnv: syncSource, vars: { force: true } }),
      });
      const data = await res.json();
      if (data.success && data.data?.opId) {
        router.push(`/operations/${data.data.opId}`);
      }
    } catch { /* silent */ } finally {
      setActionLoading(false);
      setSyncOpen(false);
    }
  }

  if (loading) {
    return <p className="text-xs text-muted-foreground py-4">Loading connection info...</p>;
  }

  if (!connInfo) {
    return (
      <div className="rounded-md border border-border bg-card/50 p-6 text-center">
        <p className="text-xs text-muted-foreground">No database connection info available for {envName.toUpperCase()}</p>
      </div>
    );
  }

  const mysqlCli = `mysql -h ${connInfo.host} -P ${connInfo.port} -u ${connInfo.user} -p'${connInfo.password || '***'}' ${connInfo.databases[0] || ''}`;
  const jdbcUrl = `jdbc:mysql://${connInfo.host}:${connInfo.port}/${connInfo.databases[0] || ''}?useSSL=false`;
  const genericUri = `mysql://${connInfo.user}:${connInfo.password || '***'}@${connInfo.host}:${connInfo.port}/${connInfo.databases[0] || ''}`;

  return (
    <div className="space-y-4">
      {/* Connection Info */}
      <div className="rounded-md border border-border bg-card/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1.5">
            <Database className="h-3 w-3" />
            Connection Info
          </h4>
          <button
            onClick={() => setShowPasswords(!showPasswords)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {showPasswords ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {showPasswords ? 'Hide' : 'Show'} passwords
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ConnField label="Host" value={connInfo.host} onCopy={() => copyToClipboard(connInfo.host, 'host')} copied={copied === 'host'} />
          <ConnField label="Port" value={String(connInfo.port)} onCopy={() => copyToClipboard(String(connInfo.port), 'port')} copied={copied === 'port'} />
          <ConnField label="User" value={connInfo.user} onCopy={() => copyToClipboard(connInfo.user, 'user')} copied={copied === 'user'} />
          <ConnField
            label="Password"
            value={showPasswords ? (connInfo.password || '—') : '••••••••'}
            onCopy={() => connInfo.password && copyToClipboard(connInfo.password, 'password')}
            copied={copied === 'password'}
            mono
          />
          {connInfo.rootPassword && (
            <ConnField
              label="Root Password"
              value={showPasswords ? connInfo.rootPassword : '••••••••'}
              onCopy={() => copyToClipboard(connInfo.rootPassword!, 'root')}
              copied={copied === 'root'}
              mono
            />
          )}
          {connInfo.sslUser && (
            <>
              <ConnField label="SSL User" value={connInfo.sslUser} onCopy={() => copyToClipboard(connInfo.sslUser!, 'sslUser')} copied={copied === 'sslUser'} />
              <ConnField
                label="SSL Password"
                value={showPasswords ? (connInfo.sslPassword || '—') : '••••••••'}
                onCopy={() => connInfo.sslPassword && copyToClipboard(connInfo.sslPassword, 'sslPwd')}
                copied={copied === 'sslPwd'}
                mono
              />
            </>
          )}
        </div>

        {/* Databases list */}
        <div className="mt-3 pt-3 border-t border-border/50">
          <p className="text-[10px] text-muted-foreground mb-1.5">Databases ({connInfo.databases.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {connInfo.databases.map((db) => (
              <span key={db} className="inline-flex items-center gap-1 rounded border border-border bg-accent/30 px-2 py-0.5 text-[10px] font-mono text-foreground">
                <Table className="h-2.5 w-2.5 text-muted-foreground" />
                {db}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Connection Strings */}
      <div className="rounded-md border border-border bg-card/50 p-4">
        <h4 className="text-xs font-medium text-muted-foreground uppercase mb-3">Connection Strings</h4>
        <div className="space-y-2">
          <ConnString label="MySQL CLI" value={mysqlCli} onCopy={() => copyToClipboard(mysqlCli, 'cli')} copied={copied === 'cli'} />
          <ConnString label="JDBC URL" value={jdbcUrl} onCopy={() => copyToClipboard(jdbcUrl, 'jdbc')} copied={copied === 'jdbc'} />
          <ConnString label="URI" value={genericUri} onCopy={() => copyToClipboard(genericUri, 'uri')} copied={copied === 'uri'} />
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Quick Actions */}
        <div className="rounded-md border border-border bg-card/50 p-4">
          <h4 className="text-xs font-medium text-muted-foreground uppercase mb-3 flex items-center gap-1.5">
            <Wrench className="h-3 w-3" />
            Actions
          </h4>
          <div className="flex flex-wrap gap-2">
            <ActionButton
              icon={HardDrive}
              label="Backup"
              onClick={() => triggerAction('db/backup')}
              disabled={actionLoading}
            />
            <ActionButton
              icon={ArchiveRestore}
              label="Restore"
              onClick={() => triggerAction('db/restore')}
              disabled={actionLoading}
            />
            <ActionButton
              icon={Database}
              label="Setup"
              onClick={() => triggerAction('db/setup')}
              disabled={actionLoading}
              className="text-amber-400 border-amber-500/30"
            />
            <ActionButton
              icon={FileUp}
              label="Migrate"
              onClick={() => triggerAction('db/migrate')}
              disabled={actionLoading}
            />
          </div>
        </div>

        {/* Sync */}
        <div className="rounded-md border border-border bg-card/50 p-4">
          <h4 className="text-xs font-medium text-muted-foreground uppercase mb-3 flex items-center gap-1.5">
            <ArrowRightLeft className="h-3 w-3" />
            Sync Data
          </h4>
          <p className="text-[10px] text-muted-foreground mb-2">
            Copy database from another environment into {envName.toUpperCase()}. Sensitive data will be sanitized.
          </p>
          <div className="flex items-center gap-2">
            <select
              value={syncSource}
              onChange={(e) => setSyncSource(e.target.value)}
              className="rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select source...</option>
              {allEnvs.filter((e) => e !== envName).map((e) => (
                <option key={e} value={e}>{e.toUpperCase()}</option>
              ))}
            </select>
            <button
              onClick={() => syncSource && setSyncOpen(true)}
              disabled={!syncSource || actionLoading}
              className="flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowRightLeft className="h-3 w-3" />
              Sync to {envName.toUpperCase()}
            </button>
          </div>
        </div>
      </div>

      <ConfirmationDialog
        open={syncOpen}
        title={`Sync ${syncSource.toUpperCase()} → ${envName.toUpperCase()}`}
        description={`This will overwrite ALL databases in ${envName.toUpperCase()} with data from ${syncSource.toUpperCase()}. Sensitive data (passwords, sessions, tokens) will be sanitized. This cannot be undone.`}
        severity="danger"
        confirmText={`Sync to ${envName.toUpperCase()}`}
        requireTyping={envName}
        onConfirm={handleSync}
        onCancel={() => setSyncOpen(false)}
        loading={actionLoading}
      />
    </div>
  );
}

function ConnField({ label, value, onCopy, copied, mono }: {
  label: string; value: string; onCopy: () => void; copied: boolean; mono?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
      <div className="flex items-center gap-1.5 group">
        <p className={cn('text-xs text-foreground truncate', mono && 'font-mono')}>{value}</p>
        <button
          onClick={onCopy}
          className="shrink-0 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>
    </div>
  );
}

function ConnString({ label, value, onCopy, copied }: {
  label: string; value: string; onCopy: () => void; copied: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-16 shrink-0">{label}</span>
      <code className="flex-1 text-[10px] font-mono text-foreground bg-accent/30 rounded px-2 py-1 truncate">
        {value}
      </code>
      <button
        onClick={onCopy}
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
      >
        {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  );
}

function ActionButton({ icon: Icon, label, onClick, disabled, className }: {
  icon: React.ElementType; label: string; onClick: () => void; disabled: boolean; className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50',
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}
