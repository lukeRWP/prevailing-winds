'use client';

import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApp } from '@/hooks/use-app';
import { AppSection } from '@/components/layout/app-section';
import type { AppSummary } from '@/lib/app-context';
import type { Operation, LogEntry } from '@/types/api';

const LOG_LEVELS = ['all', 'error', 'warn', 'info', 'debug'] as const;

export default function LogsPage() {
  const { apps } = useApp();
  const [tab, setTab] = useState<'structured' | 'operations'>('structured');
  const [level, setLevel] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [envFilter, setEnvFilter] = useState('');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Logs</h1>
          <p className="text-sm text-muted-foreground">
            {tab === 'structured' ? 'Real-time structured logs from the orchestrator API' : 'Operation-level log entries'}
          </p>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 border-b border-border pb-1">
        <button
          onClick={() => setTab('structured')}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors',
            tab === 'structured' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Orchestrator Logs
        </button>
        <button
          onClick={() => setTab('operations')}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors',
            tab === 'operations' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Operation Logs
        </button>
      </div>

      {tab === 'structured' ? (
        <StructuredLogs />
      ) : (
        <>
          {/* Filters for operation logs */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex gap-1">
              {(['all', 'error', 'warning', 'info'] as const).map((l) => (
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
              <AppLogs app={app} level={level} search={search} envFilter={envFilter} />
            </AppSection>
          ))}
        </>
      )}
    </div>
  );
}

// --- Structured logs from ring buffer ---

function StructuredLogs() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '500' });
      if (level !== 'all') params.set('level', level);
      if (search) params.set('search', search);

      const res = await fetch(`/api/proxy/_x_/logs?${params}`);
      const data = await res.json();
      if (data.success) setEntries(data.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [level, search]);

  useEffect(() => {
    fetchLogs();
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 10000);
    return () => clearInterval(interval);
  }, [fetchLogs, autoRefresh]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-1">
          {LOG_LEVELS.map((l) => (
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
              {l === 'all' ? 'All' : l.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search context or message..."
            className="rounded-md border border-border bg-card pl-7 pr-3 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-64"
          />
        </div>
        <button
          onClick={() => setAutoRefresh(!autoRefresh)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md border transition-colors',
            autoRefresh
              ? 'border-emerald-500/50 text-emerald-400 bg-emerald-500/10'
              : 'border-border text-muted-foreground hover:text-foreground'
          )}
        >
          <RefreshCw className={cn('h-3 w-3', autoRefresh && 'animate-spin')} style={autoRefresh ? { animationDuration: '3s' } : undefined} />
          {autoRefresh ? 'Live' : 'Paused'}
        </button>
        <button
          onClick={fetchLogs}
          className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </button>
        <span className="text-[10px] text-muted-foreground">{entries.length} entries</span>
      </div>

      {/* Log output */}
      <div className="rounded-md border border-border bg-zinc-950 overflow-hidden max-h-[600px] overflow-y-auto">
        <div className="divide-y divide-zinc-800/50">
          {entries.map((entry, i) => (
            <div key={`${entry.time}-${i}`} className="flex gap-3 px-3 py-1 hover:bg-zinc-900/50 transition-colors font-mono">
              <span className="text-[10px] text-zinc-500 shrink-0 w-20">
                {entry.time?.slice(11, 19) || ''}
              </span>
              <span
                className={cn(
                  'text-[10px] font-bold shrink-0 w-12 uppercase',
                  entry.level === 'error' ? 'text-red-400'
                    : entry.level === 'warn' ? 'text-amber-400'
                    : entry.level === 'debug' ? 'text-zinc-500'
                    : 'text-emerald-400'
                )}
              >
                {entry.level}
              </span>
              <span className="text-[10px] text-blue-400 shrink-0 w-16 truncate">{entry.context}</span>
              <span className="text-xs text-zinc-300 truncate">{entry.msg}</span>
            </div>
          ))}
          {entries.length === 0 && (
            <div className="px-3 py-6 text-center">
              <p className="text-xs text-muted-foreground">
                {loading ? 'Loading logs...' : 'No log entries found'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Operation-level logs (existing) ---

function AppLogs({ app, level, search, envFilter }: {
  app: AppSummary; level: string; search: string; envFilter: string;
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
  }, [fetchLogs]);

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
