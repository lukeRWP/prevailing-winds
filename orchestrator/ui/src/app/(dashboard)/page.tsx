'use client';

import { useEffect, useState } from 'react';
import { Activity, Globe, Server, Clock } from 'lucide-react';
import { useApp } from '@/hooks/use-app';
import { AppSection } from '@/components/layout/app-section';
import { StatCard } from '@/components/dashboard/stat-card';
import { EnvironmentCard } from '@/components/dashboard/environment-card';
import { RecentOperations } from '@/components/dashboard/recent-operations';
import type { AppSummary } from '@/lib/app-context';
import type { EnvironmentStatus, Operation, HealthStatus } from '@/types/api';

export default function DashboardPage() {
  const { apps, loading: appLoading } = useApp();
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

  const uptimeHours = health ? Math.floor(health.uptime / 3600) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Infrastructure overview and management</p>
      </div>

      {/* Global KPI */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Applications"
          value={apps.length}
          icon={Globe}
          description={`${apps.reduce((s, a) => s + a.environments.length, 0)} total environments`}
        />
        <StatCard
          label="Uptime"
          value={appLoading ? '--' : `${uptimeHours}h`}
          icon={Clock}
          description="Orchestrator"
        />
      </div>

      {/* Per-app sections */}
      {apps.map((app) => (
        <AppSection key={app.name} app={app}>
          <DashboardAppContent app={app} />
        </AppSection>
      ))}
    </div>
  );
}

function DashboardAppContent({ app }: { app: AppSummary }) {
  const [envStatuses, setEnvStatuses] = useState<Record<string, EnvironmentStatus>>({});
  const [operations, setOperations] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [envsRes, opsRes] = await Promise.allSettled([
          fetch(`/api/proxy/_x_/apps/${app.name}`).then((r) => r.json()),
          fetch(`/api/proxy/_x_/ops?limit=10&app=${app.name}`).then((r) => r.json()),
        ]);

        const ops =
          opsRes.status === 'fulfilled' && opsRes.value.success
            ? opsRes.value.data
            : [];
        setOperations(ops);

        const statuses: Record<string, EnvironmentStatus> = {};
        if (envsRes.status === 'fulfilled' && envsRes.value.success) {
          const envNames = Object.keys(envsRes.value.data.environments || {});
          const statusResults = await Promise.allSettled(
            envNames.map(async (env) => {
              const res = await fetch(`/api/proxy/_x_/apps/${app.name}/envs/${env}/status`);
              const d = await res.json();
              return d.success ? { env, status: d.data } : null;
            })
          );
          statusResults.forEach((r) => {
            if (r.status === 'fulfilled' && r.value) {
              statuses[r.value.env] = r.value.status;
            }
          });
        }
        setEnvStatuses(statuses);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [app.name]);

  const envEntries = Object.entries(envStatuses);
  const totalVms = envEntries.reduce((sum, [, s]) => sum + (s.vms?.length || 0), 0);
  const runningVms = envEntries.reduce(
    (sum, [, s]) => sum + (s.vms?.filter((v) => v.status === 'running').length || 0),
    0
  );
  const successOps = operations.filter((o) => o.status === 'success').length;
  const successRate = operations.length > 0 ? Math.round((successOps / operations.length) * 100) : 0;

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-3">
        <StatCard label="VMs" value={`${runningVms}/${totalVms}`} icon={Server} description={runningVms === totalVms ? 'All healthy' : 'Some offline'} />
        <StatCard label="Recent Ops" value={operations.length} icon={Activity} description={`${successRate}% success`} />
        <StatCard label="Environments" value={envEntries.length} icon={Globe} description={`${totalVms} VMs`} />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
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
      </div>
      <RecentOperations operations={operations} />
    </div>
  );
}
