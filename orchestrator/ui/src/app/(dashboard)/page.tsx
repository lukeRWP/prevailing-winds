'use client';

import { useEffect, useState } from 'react';
import { Activity, Globe, Server, Clock } from 'lucide-react';
import { useApp } from '@/hooks/use-app';
import { StatCard } from '@/components/dashboard/stat-card';
import { EnvironmentCard } from '@/components/dashboard/environment-card';
import { RecentOperations } from '@/components/dashboard/recent-operations';
import type { EnvironmentStatus, Operation, HealthStatus } from '@/types/api';

interface DashboardData {
  health: HealthStatus | null;
  envStatuses: Record<string, EnvironmentStatus>;
  operations: Operation[];
  loading: boolean;
}

export default function DashboardPage() {
  const { currentApp, loading: appLoading } = useApp();
  const [data, setData] = useState<DashboardData>({
    health: null,
    envStatuses: {},
    operations: [],
    loading: true,
  });

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const [healthRes, envsRes, opsRes] = await Promise.allSettled([
          fetch('/api/proxy/health/status').then((r) => r.json()),
          fetch(`/api/proxy/_x_/apps/${currentApp}`).then((r) => r.json()),
          fetch(`/api/proxy/_x_/ops?limit=10&app=${currentApp}`).then((r) => r.json()),
        ]);

        const health =
          healthRes.status === 'fulfilled' && healthRes.value.success
            ? healthRes.value.data
            : null;

        const operations =
          opsRes.status === 'fulfilled' && opsRes.value.success
            ? opsRes.value.data
            : [];

        // Fetch status for each environment
        const envStatuses: Record<string, EnvironmentStatus> = {};
        if (envsRes.status === 'fulfilled' && envsRes.value.success) {
          const envNames = Object.keys(envsRes.value.data.environments || {});
          const statusResults = await Promise.allSettled(
            envNames.map(async (env) => {
              const res = await fetch(`/api/proxy/_x_/apps/${currentApp}/envs/${env}/status`);
              const d = await res.json();
              return d.success ? { env, status: d.data } : null;
            })
          );
          statusResults.forEach((r) => {
            if (r.status === 'fulfilled' && r.value) {
              envStatuses[r.value.env] = r.value.status;
            }
          });
        }

        setData({ health, envStatuses, operations, loading: false });
      } catch {
        setData((prev) => ({ ...prev, loading: false }));
      }
    }

    if (currentApp) fetchDashboard();
    const interval = setInterval(fetchDashboard, 30000);
    return () => clearInterval(interval);
  }, [currentApp]);

  const envEntries = Object.entries(data.envStatuses);
  const totalVms = envEntries.reduce((sum, [, s]) => sum + (s.vms?.length || 0), 0);
  const runningVms = envEntries.reduce(
    (sum, [, s]) => sum + (s.vms?.filter((v) => v.status === 'running').length || 0),
    0
  );
  const successOps = data.operations.filter((o) => o.status === 'success').length;
  const successRate =
    data.operations.length > 0
      ? Math.round((successOps / data.operations.length) * 100)
      : 0;

  const uptimeHours = data.health ? Math.floor(data.health.uptime / 3600) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          Infrastructure overview and management
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Environments"
          value={envEntries.length}
          icon={Globe}
          description={`${totalVms} total VMs`}
        />
        <StatCard
          label="VMs Running"
          value={`${runningVms}/${totalVms}`}
          icon={Server}
          description={runningVms === totalVms ? 'All healthy' : 'Some offline'}
        />
        <StatCard
          label="Recent Ops"
          value={data.operations.length}
          icon={Activity}
          description={`${successRate}% success rate`}
        />
        <StatCard
          label="Uptime"
          value={data.loading ? '--' : `${uptimeHours}h`}
          icon={Clock}
          description="Orchestrator"
        />
      </div>

      {/* Environments */}
      <div>
        <h2 className="text-sm font-medium text-foreground mb-3">Environments</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {envEntries.map(([name, status]) => (
            <EnvironmentCard
              key={name}
              name={name}
              vlan={status.vlan}
              cidr={status.cidr}
              vms={status.vms || []}
              pipeline={status.pipeline}
            />
          ))}
          {data.loading && envEntries.length === 0 && (
            <div className="col-span-3 rounded-lg border border-border bg-card p-6 text-center">
              <p className="text-sm text-muted-foreground">Loading environments...</p>
            </div>
          )}
        </div>
      </div>

      {/* Recent Operations */}
      <RecentOperations operations={data.operations} />
    </div>
  );
}
