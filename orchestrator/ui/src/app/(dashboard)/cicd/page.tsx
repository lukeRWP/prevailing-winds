'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { PipelineFlow, type PipelineStep } from '@/components/cicd/pipeline-flow';
import { DeploymentTracker } from '@/components/cicd/deployment-tracker';
import { GitActivity } from '@/components/cicd/git-activity';
import { useApp } from '@/hooks/use-app';
import { AppSection } from '@/components/layout/app-section';
import type { AppSummary } from '@/lib/app-context';
import type { Operation } from '@/types/api';

export default function CicdPage() {
  const { apps } = useApp();
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">CI/CD</h1>
          <p className="text-sm text-muted-foreground">Pipeline management and deployment tracking</p>
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
          <AppCicd app={app} refreshKey={refreshKey} />
        </AppSection>
      ))}
    </div>
  );
}

function AppCicd({ app, refreshKey }: { app: AppSummary; refreshKey: number }) {
  const [operations, setOperations] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/proxy/_x_/ops?limit=50&app=${app.name}`);
        const data = await res.json();
        if (data.success) setOperations(data.data);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [app.name, refreshKey]);

  const pipelineSteps = buildPipelineSteps(operations);
  const lastDeploy = operations.find((o) => o.type === 'deploy' && o.status === 'success');

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="space-y-4">
      {/* Pipeline Flow */}
      <div className="rounded-md border border-border bg-card/50 p-3">
        <h3 className="text-xs font-medium text-muted-foreground mb-2 uppercase">Pipeline</h3>
        <PipelineFlow steps={pipelineSteps} />
        {lastDeploy && (
          <p className="mt-2 text-xs text-muted-foreground">
            Last: {lastDeploy.ref || 'unknown'} · {lastDeploy.env?.toUpperCase()} ·{' '}
            {new Date(lastDeploy.created_at).toLocaleString()}
          </p>
        )}
      </div>

      {/* Git Activity — Releases & PRs */}
      <div>
        <h3 className="text-xs font-medium text-muted-foreground mb-2 uppercase">Git Activity</h3>
        <GitActivity appName={app.name} />
      </div>

      {/* Deployment Matrix */}
      <div>
        <h3 className="text-xs font-medium text-muted-foreground mb-2 uppercase">Deployment History</h3>
        <DeploymentTracker operations={operations} appName={app.name} />
      </div>

      {/* Recent Operations */}
      <div>
        <h3 className="text-xs font-medium text-muted-foreground mb-2 uppercase">Recent Operations</h3>
        <div className="rounded-md border border-border bg-card/50 overflow-hidden">
          <div className="divide-y divide-border">
            {operations
              .filter((o) => ['deploy', 'deploy-server', 'deploy-client', 'provision', 'infra-apply'].includes(o.type))
              .slice(0, 10)
              .map((op) => (
                <a
                  key={op.id}
                  href={`/operations/${op.id}`}
                  className="flex items-center justify-between px-3 py-2 hover:bg-accent/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <StatusDot status={op.status} />
                    <span className="text-xs font-medium text-foreground">{op.type}</span>
                    <span className="text-[10px] text-muted-foreground">{op.env?.toUpperCase()}</span>
                    {op.ref && <span className="text-[10px] text-muted-foreground font-mono">{op.ref}</span>}
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(op.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </a>
              ))}
            {operations.length === 0 && (
              <div className="px-3 py-4 text-center">
                <p className="text-xs text-muted-foreground">No CI/CD operations found</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    success: 'bg-emerald-500',
    failed: 'bg-red-500',
    running: 'bg-blue-500 animate-pulse',
    queued: 'bg-amber-500',
  };
  return <div className={`h-2 w-2 rounded-full shrink-0 ${colors[status] || 'bg-zinc-500'}`} />;
}

function buildPipelineSteps(operations: Operation[]): PipelineStep[] {
  const stepTypes = [
    { type: 'infra-apply', name: 'Infra Apply' },
    { type: 'provision', name: 'Provision' },
    { type: 'db-setup', name: 'DB Setup' },
    { type: 'deploy', name: 'Deploy' },
  ];

  return stepTypes.map(({ type, name }) => {
    const op = operations.find((o) => o.type === type);
    if (!op) return { name, status: 'pending' as const };

    const duration = op.duration_ms
      ? op.duration_ms < 60000
        ? `${Math.floor(op.duration_ms / 1000)}s`
        : `${Math.floor(op.duration_ms / 60000)}m`
      : undefined;

    return {
      name,
      status: op.status === 'success' ? 'success' as const
        : op.status === 'failed' ? 'failed' as const
        : op.status === 'running' ? 'running' as const
        : 'pending' as const,
      duration,
    };
  });
}
