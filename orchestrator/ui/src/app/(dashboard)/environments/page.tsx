'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/hooks/use-app';
import { AppSection } from '@/components/layout/app-section';
import { EnvironmentCard } from '@/components/dashboard/environment-card';
import type { AppSummary } from '@/lib/app-context';
import type { EnvironmentStatus } from '@/types/api';

export default function EnvironmentsPage() {
  const { apps, setCurrentApp } = useApp();
  const router = useRouter();

  function handleEnvClick(appName: string, envName: string) {
    setCurrentApp(appName);
    router.push(`/environments/${envName}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Environments</h1>
        <p className="text-sm text-muted-foreground">Manage infrastructure environments</p>
      </div>

      {apps.map((app) => (
        <AppSection key={app.name} app={app}>
          <AppEnvironments app={app} onEnvClick={(env) => handleEnvClick(app.name, env)} />
        </AppSection>
      ))}
    </div>
  );
}

function AppEnvironments({ app, onEnvClick }: { app: AppSummary; onEnvClick: (env: string) => void }) {
  const [envStatuses, setEnvStatuses] = useState<Record<string, EnvironmentStatus>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchEnvs() {
      try {
        const appRes = await fetch(`/api/proxy/_x_/apps/${app.name}`);
        const appData = await appRes.json();
        if (!appData.success) return;

        const envNames = Object.keys(appData.data.environments || {});
        const results = await Promise.allSettled(
          envNames.map(async (env) => {
            const res = await fetch(`/api/proxy/_x_/apps/${app.name}/envs/${env}/status`);
            const d = await res.json();
            return d.success ? { env, status: d.data } : null;
          })
        );

        const statuses: Record<string, EnvironmentStatus> = {};
        results.forEach((r) => {
          if (r.status === 'fulfilled' && r.value) {
            statuses[r.value.env] = r.value.status;
          }
        });
        setEnvStatuses(statuses);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    fetchEnvs();
  }, [app.name]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading environments...</p>;
  }

  const entries = Object.entries(envStatuses);
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No environments configured.</p>;
  }

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {entries.map(([name, status]) => (
        <div key={name} className="cursor-pointer" onClick={() => onEnvClick(name)}>
          <EnvironmentCard
            name={name}
            vlan={status.vlan}
            cidr={status.cidr}
            vms={status.vms || []}
            pipeline={status.pipeline}
          />
        </div>
      ))}
    </div>
  );
}
