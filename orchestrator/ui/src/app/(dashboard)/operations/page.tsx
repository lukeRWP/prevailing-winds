'use client';

import { useEffect, useState, useCallback } from 'react';
import { OperationsTable } from '@/components/operations/operations-table';
import { OperationFilters } from '@/components/operations/operation-filters';
import { RefreshCw } from 'lucide-react';
import { useApp } from '@/hooks/use-app';
import { AppSection } from '@/components/layout/app-section';
import type { AppSummary } from '@/lib/app-context';
import type { Operation, CommitInfo } from '@/types/api';

const PAGE_SIZE = 50;

export default function OperationsPage() {
  const { apps } = useApp();
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Operations</h1>
          <p className="text-sm text-muted-foreground">View and manage orchestrator operations</p>
        </div>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {apps.map((app) => (
        <AppSection key={app.name} app={app}>
          <AppOperations app={app} refreshKey={refreshKey} />
        </AppSection>
      ))}
    </div>
  );
}

function AppOperations({ app, refreshKey }: { app: AppSummary; refreshKey: number }) {
  const [operations, setOperations] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(true);
  const [env, setEnv] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [commitInfoMap, setCommitInfoMap] = useState<Record<string, CommitInfo>>({});

  const fetchOps = useCallback(async (offset = 0, append = false) => {
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), app: app.name, offset: String(offset) });
      if (env) params.set('env', env);
      if (status) params.set('status', status);

      const res = await fetch(`/api/proxy/_x_/ops?${params}`);
      const data = await res.json();
      if (data.success) {
        let ops = data.data as Operation[];
        if (type) ops = ops.filter((o) => o.type === type);
        if (append) {
          setOperations((prev) => [...prev, ...ops]);
        } else {
          setOperations(ops);
        }
        setHasMore(data.data.length === PAGE_SIZE);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [app.name, env, status, type]);

  useEffect(() => {
    fetchOps();
    const interval = setInterval(() => fetchOps(), 10000);
    return () => clearInterval(interval);
  }, [fetchOps, refreshKey]);

  // Fetch commit info for SHA refs
  useEffect(() => {
    const shaRefs = operations
      .map((op) => op.ref)
      .filter((ref): ref is string => !!ref && /^[0-9a-f]{7,40}$/.test(ref))
      .filter((sha) => !commitInfoMap[sha]);
    const unique = [...new Set(shaRefs)].slice(0, 20);
    if (unique.length === 0 || !app.name) return;

    fetch(`/api/proxy/_x_/apps/${app.name}/git/commits?shas=${unique.join(',')}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data) {
          setCommitInfoMap((prev) => ({ ...prev, ...data.data }));
        }
      })
      .catch(() => { /* silent */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operations.map((o) => o.ref).join(','), app.name]);

  function handleLoadMore() {
    setLoadingMore(true);
    fetchOps(operations.length, true);
  }

  // Client-side search filter
  const filtered = search
    ? operations.filter((op) => {
        const q = search.toLowerCase();
        return (
          op.ref?.toLowerCase().includes(q) ||
          op.type.toLowerCase().includes(q) ||
          op.initiated_by?.toLowerCase().includes(q) ||
          op.id.toLowerCase().includes(q) ||
          op.env?.toLowerCase().includes(q)
        );
      })
    : operations;

  return (
    <div className="space-y-4">
      <OperationFilters
        env={env}
        status={status}
        type={type}
        search={search}
        onEnvChange={setEnv}
        onStatusChange={setStatus}
        onTypeChange={setType}
        onSearchChange={setSearch}
      />
      {loading && operations.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading operations...</p>
      ) : (
        <>
          <OperationsTable operations={filtered} commitInfoMap={commitInfoMap} />
          {hasMore && !search && (
            <div className="text-center">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="rounded-md border border-border bg-card px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
              >
                {loadingMore ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
