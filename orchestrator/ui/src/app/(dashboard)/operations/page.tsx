'use client';

import { useEffect, useState, useCallback } from 'react';
import { OperationsTable } from '@/components/operations/operations-table';
import { OperationFilters } from '@/components/operations/operation-filters';
import { RefreshCw } from 'lucide-react';
import { useApp } from '@/hooks/use-app';
import { AppSection } from '@/components/layout/app-section';
import type { AppSummary } from '@/lib/app-context';
import type { Operation } from '@/types/api';

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

  const fetchOps = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '50', app: app.name });
      if (env) params.set('env', env);
      if (status) params.set('status', status);

      const res = await fetch(`/api/proxy/_x_/ops?${params}`);
      const data = await res.json();
      if (data.success) {
        let ops = data.data as Operation[];
        if (type) ops = ops.filter((o) => o.type === type);
        setOperations(ops);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [app.name, env, status, type]);

  useEffect(() => {
    fetchOps();
    const interval = setInterval(fetchOps, 10000);
    return () => clearInterval(interval);
  }, [fetchOps, refreshKey]);

  return (
    <div className="space-y-4">
      <OperationFilters
        env={env}
        status={status}
        type={type}
        onEnvChange={setEnv}
        onStatusChange={setStatus}
        onTypeChange={setType}
      />
      {loading && operations.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading operations...</p>
      ) : (
        <OperationsTable operations={operations} />
      )}
    </div>
  );
}
