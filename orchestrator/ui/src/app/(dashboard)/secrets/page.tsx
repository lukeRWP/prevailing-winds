'use client';

import { useState, useEffect, useCallback } from 'react';
import { Shield, RefreshCw, Sparkles } from 'lucide-react';
import { useApp } from '@/hooks/use-app';
import { AppSection } from '@/components/layout/app-section';
import { SecretTable } from '@/components/secrets/secret-table';
import { cn } from '@/lib/utils';
import type { AppSummary } from '@/lib/app-context';

export default function SecretsPage() {
  const { apps, role } = useApp();
  const isAdmin = role === 'admin';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Secrets</h1>
        <p className="text-sm text-muted-foreground">
          Vault secrets injected as environment variables during deployment
        </p>
      </div>

      {isAdmin && <InfraSecrets />}

      {apps.map((app) => (
        <AppSection key={app.name} app={app}>
          <AppSecrets appName={app.name} environments={app.environments} />
        </AppSection>
      ))}
    </div>
  );
}

// --- Infrastructure Secrets (admin only) ---

function InfraSecrets() {
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchSecrets = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/_x_/infra/secrets');
      const data = await res.json();
      if (data.success) {
        setSecrets(data.data.secrets || {});
        setError('');
      } else {
        setError(data.message || 'Failed to load');
      }
    } catch {
      setError('Failed to fetch infrastructure secrets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSecrets(); }, [fetchSecrets]);

  async function handleUpdate(key: string, value: string) {
    const res = await fetch('/api/proxy/_u_/infra/secrets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secrets: { [key]: value } }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    await fetchSecrets();
  }

  async function handleDelete(key: string) {
    const res = await fetch(`/api/proxy/_d_/infra/secrets/${encodeURIComponent(key)}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    await fetchSecrets();
  }

  async function handleAdd(key: string, value: string) {
    await handleUpdate(key, value);
  }

  return (
    <div className="rounded-lg border border-border/60 bg-card/20 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/40 bg-accent/10">
        <Shield className="h-4 w-4 text-amber-400" />
        <span className="text-xs font-bold text-amber-400">Infrastructure Secrets</span>
        <span className="text-[10px] text-muted-foreground">secret/data/pw/infra</span>
        <span className="text-[10px] text-muted-foreground ml-auto">{Object.keys(secrets).length} key{Object.keys(secrets).length !== 1 ? 's' : ''}</span>
      </div>
      <div className="p-4">
        {error ? (
          <p className="text-xs text-red-400">{error}</p>
        ) : (
          <SecretTable
            secrets={secrets}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onAdd={handleAdd}
            loading={loading}
          />
        )}
      </div>
    </div>
  );
}

// --- Per-App Secrets ---

function AppSecrets({ appName, environments }: { appName: string; environments: string[] }) {
  const [activeTab, setActiveTab] = useState<string>('app');
  const tabs = ['app', ...environments];

  return (
    <div className="space-y-3">
      <div className="flex gap-1 border-b border-border/40 pb-px">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors',
              activeTab === tab
                ? 'bg-accent text-foreground border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab === 'app' ? 'App-level' : tab.toUpperCase()}
          </button>
        ))}
      </div>

      <SecretScope appName={appName} scope={activeTab} />
    </div>
  );
}

function SecretScope({ appName, scope }: { appName: string; scope: string }) {
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg] = useState('');

  const isEnv = scope !== 'app';
  const readPath = isEnv
    ? `/api/proxy/_x_/apps/${appName}/envs/${scope}/secrets`
    : `/api/proxy/_x_/apps/${appName}/secrets`;
  const writePath = isEnv
    ? `/api/proxy/_u_/apps/${appName}/envs/${scope}/secrets`
    : `/api/proxy/_u_/apps/${appName}/secrets`;
  const deleteBase = isEnv
    ? `/api/proxy/_d_/apps/${appName}/envs/${scope}/secrets`
    : `/api/proxy/_d_/apps/${appName}/secrets`;

  const fetchSecrets = useCallback(async () => {
    try {
      const res = await fetch(readPath);
      const data = await res.json();
      if (data.success) {
        setSecrets(data.data.secrets || {});
        setError('');
      } else {
        setError(data.message || 'Failed to load');
      }
    } catch {
      setError('Failed to fetch secrets');
    } finally {
      setLoading(false);
    }
  }, [readPath]);

  useEffect(() => {
    setLoading(true);
    setSecrets({});
    setGenMsg('');
    fetchSecrets();
  }, [fetchSecrets]);

  async function handleUpdate(key: string, value: string) {
    const res = await fetch(writePath, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secrets: { [key]: value } }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    await fetchSecrets();
  }

  async function handleDelete(key: string) {
    const res = await fetch(`${deleteBase}/${encodeURIComponent(key)}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    await fetchSecrets();
  }

  async function handleAdd(key: string, value: string) {
    await handleUpdate(key, value);
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenMsg('');
    try {
      const res = await fetch(`/api/proxy/_y_/apps/${appName}/envs/${scope}/secrets/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        setGenMsg(data.data.created ? 'Secrets generated.' : 'Secrets already exist.');
        await fetchSecrets();
      } else {
        setGenMsg(data.message || 'Generation failed');
      }
    } catch {
      setGenMsg('Failed to generate secrets');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground font-mono">
          secret/data/apps/{appName}{isEnv ? `/${scope}` : ''}
        </span>
        <div className="flex items-center gap-2">
          {genMsg && (
            <span className="text-[10px] text-muted-foreground">{genMsg}</span>
          )}
          {isEnv && (
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            >
              <Sparkles className={cn('h-3 w-3', generating && 'animate-spin')} />
              Generate
            </button>
          )}
          <button
            onClick={() => { setLoading(true); fetchSecrets(); }}
            disabled={loading}
            className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>
      ) : (
        <SecretTable
          secrets={secrets}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onAdd={handleAdd}
          loading={loading}
        />
      )}
    </div>
  );
}
