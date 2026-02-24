'use client';

import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApp } from '@/hooks/use-app';
import { AppSection } from '@/components/layout/app-section';
import type { AppSummary } from '@/lib/app-context';
import type { Operation } from '@/types/api';

const LEVELS = ['all', 'error', 'warning', 'info'] as const;

export default function LogsPage() {
  const { apps } = useApp();
  const [refreshKey, setRefreshKey] = useState(0);
  const [level, setLevel] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [envFilter, setEnvFilter] = useState('');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Logs</h1>
          <p className="text-sm text-muted-foreground">Operational logs from orchestrator operations</p>
        </div>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Global Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-1">
          {LEVELS.map((l) => (
            <button
              key={l}
              onClick={() => setLevel(l)}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                level === l
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              )}
            >
              {l === 'all' ? 'All' : l.charAt(0).toUpperCase() + l.slice(1)}
            </button>
          ))}
        </div>
        <select
          value={envFilter}
          onChange={(e) => setEnvFilter(e.target.value)}
          className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All Envs</option>
          <option value="dev">DEV</option>
          <option value="qa">QA</option>
          <option value="prod">PROD</option>
        </select>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search logs..."
            className="rounded-md border border-border bg-card pl-7 pr-3 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-64"
          />
        </div>
      </div>

      {apps.map((app) => (
        <AppSection key={app.name} app={app}>
          <AppLogs app={app} level={level} search={search} envFilter={envFilter} refreshKey={refreshKey} />
        </AppSection>
      ))}

      <p className="text-xs text-muted-foreground">
        Structured logging (Pino + OpenTelemetry) will be added in Phase 7 backend telemetry upgrade.
        Currently showing operation-level entries.
      </p>
    </div>
  );
}

function AppLogs({ app, level, search, envFilter, refreshKey }: {
  app: AppSummary; level: string; search: string; envFilter: string; refreshKey: number;
}) {
  const [operations, setOperations] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '50', app: app.name });
      if (envFilter) params.set('env', envFilter);
      if (level === 'error') params.set('status', 'failed');

      const res = await fetch(`/api/proxy/_x_/ops?${params}`);
      const data = await res.json();
      if (data.success) {
        let ops = data.data as Operation[];
        if (search) {
          ops = ops.filter(
            (o) =>
              o.type.includes(search) ||
              o.output?.toLowerCase().includes(search.toLowerCase()) ||
              o.error?.toLowerCase().includes(search.toLowerCase())
          );
        }
        setOperations(ops);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [app.name, level, search, envFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs, refreshKey]);

  return (
    <div className="rounded-md border border-border bg-zinc-950 overflow-hidden">
      <div className="divide-y divide-zinc-800">
        {operations.map((op) => (
          <a
            key={op.id}
            href={`/operations/${op.id}`}
            className="flex gap-3 px-3 py-1.5 hover:bg-zinc-900 transition-colors"
          >
            <span className="text-[10px] text-zinc-500 shrink-0 w-36 font-mono">
              {new Date(op.created_at).toISOString().replace('T', ' ').slice(0, 19)}
            </span>
            <span
              className={cn(
                'text-[10px] font-bold shrink-0 w-12 uppercase',
                op.status === 'failed' ? 'text-red-400'
                  : op.status === 'running' ? 'text-blue-400'
                  : op.status === 'success' ? 'text-emerald-400'
                  : 'text-amber-400'
              )}
            >
              {op.status === 'failed' ? 'ERR' : op.status === 'success' ? 'INFO' : 'WARN'}
            </span>
            <span className="text-xs text-zinc-400 shrink-0 w-12">{op.env?.toUpperCase()}</span>
            <span className="text-xs text-zinc-300 truncate">
              {op.type}{op.ref ? ` (${op.ref})` : ''}{op.error ? ` — ${op.error}` : ''}
            </span>
          </a>
        ))}
        {operations.length === 0 && (
          <div className="px-3 py-6 text-center">
            <p className="text-xs text-muted-foreground">
              {loading ? 'Loading logs...' : 'No log entries found'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
