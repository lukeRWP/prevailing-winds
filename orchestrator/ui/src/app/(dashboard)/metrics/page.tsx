'use client';

import { useEffect, useState } from 'react';
import { Activity, Clock, CheckCircle2, BarChart3, ExternalLink } from 'lucide-react';
import { StatCard } from '@/components/dashboard/stat-card';
import { useApp } from '@/hooks/use-app';
import { AppSection } from '@/components/layout/app-section';
import type { AppSummary } from '@/lib/app-context';
import type { Operation, HealthStatus } from '@/types/api';

export default function MetricsPage() {
  const { apps } = useApp();
  const [health, setHealth] = useState<HealthStatus | null>(null);

  useEffect(() => {
    async function fetchHealth() {
      try {
        const res = await fetch('/api/proxy/health/status');
        const data = await res.json();
        if (data.success) setHealth(data.data);
      } catch {
        // silent
      }
    }
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Metrics</h1>
        <p className="text-sm text-muted-foreground">Orchestrator and infrastructure metrics</p>
      </div>

      {/* Orchestrator Health (global) */}
      {health && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-medium text-foreground mb-3">Orchestrator Health</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricField label="Uptime" value={formatUptime(health.uptime)} />
            <MetricField label="Memory (RSS)" value={`${Math.round(health.memory.rss / 1024 / 1024)}MB`} />
            <MetricField label="Heap Used" value={`${Math.round(health.memory.heapUsed / 1024 / 1024)}MB`} />
            <MetricField label="Registered Apps" value={String(health.apps)} />
          </div>
        </div>
      )}

      {/* Per-app metrics */}
      {apps.map((app) => (
        <AppSection key={app.name} app={app}>
          <AppMetrics appName={app.name} />
        </AppSection>
      ))}

      {/* Grafana Links (global) */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-medium text-foreground mb-3">External Dashboards</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Infrastructure metrics (CPU, memory, disk, network) are available in Grafana
          via Prometheus scraping node-exporter on each VM.
        </p>
        <div className="flex gap-3">
          <GrafanaLink label="Node Exporter" env="all" />
          <GrafanaLink label="MySQL" env="prod" />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Prometheus metrics (prom-client) and inline charts (Recharts) will be added in Phase 7/8.
      </p>
    </div>
  );
}

function AppMetrics({ appName }: { appName: string }) {
  const [operations, setOperations] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOps() {
      try {
        const res = await fetch(`/api/proxy/_x_/ops?limit=100&app=${appName}`);
        const data = await res.json();
        if (data.success) setOperations(data.data);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    fetchOps();
    const interval = setInterval(fetchOps, 30000);
    return () => clearInterval(interval);
  }, [appName]);

  const successOps = operations.filter((o) => o.status === 'success');
  const failedOps = operations.filter((o) => o.status === 'failed');
  const runningOps = operations.filter((o) => o.status === 'running');
  const successRate = operations.length > 0
    ? Math.round((successOps.length / operations.length) * 100)
    : 0;
  const avgDuration = successOps.length > 0
    ? Math.round(successOps.reduce((sum, o) => sum + (o.duration_ms || 0), 0) / successOps.length / 1000)
    : 0;

  const byType = operations.reduce<Record<string, { total: number; success: number; failed: number }>>((acc, op) => {
    if (!acc[op.type]) acc[op.type] = { total: 0, success: 0, failed: 0 };
    acc[op.type].total++;
    if (op.status === 'success') acc[op.type].success++;
    if (op.status === 'failed') acc[op.type].failed++;
    return acc;
  }, {});

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading metrics...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Ops" value={operations.length} icon={Activity} description="Last 100" />
        <StatCard label="Success Rate" value={`${successRate}%`} icon={CheckCircle2} description={`${successOps.length} ok, ${failedOps.length} failed`} />
        <StatCard label="Avg Duration" value={`${avgDuration}s`} icon={Clock} description="Successful ops" />
        <StatCard label="Active" value={runningOps.length} icon={BarChart3} description="Running now" />
      </div>

      <div className="rounded-md border border-border bg-card/50 overflow-hidden">
        <div className="px-3 py-2 border-b border-border">
          <h3 className="text-xs font-medium text-muted-foreground uppercase">Operations by Type</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-accent/20">
              <th className="px-3 py-1.5 text-left text-[10px] font-medium text-muted-foreground uppercase">Type</th>
              <th className="px-3 py-1.5 text-right text-[10px] font-medium text-muted-foreground uppercase">Total</th>
              <th className="px-3 py-1.5 text-right text-[10px] font-medium text-muted-foreground uppercase">Success</th>
              <th className="px-3 py-1.5 text-right text-[10px] font-medium text-muted-foreground uppercase">Failed</th>
              <th className="px-3 py-1.5 text-right text-[10px] font-medium text-muted-foreground uppercase">Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {Object.entries(byType)
              .sort((a, b) => b[1].total - a[1].total)
              .map(([type, stats]) => (
                <tr key={type} className="hover:bg-accent/20">
                  <td className="px-3 py-1.5 text-xs text-foreground">{type}</td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground text-right">{stats.total}</td>
                  <td className="px-3 py-1.5 text-xs text-emerald-400 text-right">{stats.success}</td>
                  <td className="px-3 py-1.5 text-xs text-red-400 text-right">{stats.failed}</td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground text-right">
                    {stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0}%
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MetricField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-medium text-foreground font-mono">{value}</p>
    </div>
  );
}

function GrafanaLink({ label, env }: { label: string; env: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-accent/30 px-3 py-2">
      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-xs text-foreground">{label}</span>
      <span className="text-[10px] text-muted-foreground">{env}</span>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
