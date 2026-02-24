'use client';

import { useEffect, useState } from 'react';
import { EnvironmentCard } from '@/components/dashboard/environment-card';
import type { EnvironmentStatus } from '@/types/api';

export default function EnvironmentsPage() {
  const [envStatuses, setEnvStatuses] = useState<Record<string, EnvironmentStatus>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchEnvs() {
      try {
        const appRes = await fetch('/api/proxy/_x_/apps/imp');
        const appData = await appRes.json();
        if (!appData.success) return;

        const envNames = Object.keys(appData.data.environments || {});
        const results = await Promise.allSettled(
          envNames.map(async (env) => {
            const res = await fetch(`/api/proxy/_x_/apps/imp/envs/${env}/status`);
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
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Environments</h1>
        <p className="text-sm text-muted-foreground">Manage infrastructure environments</p>
      </div>

      {loading ? (
        <div className="rounded-lg border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">Loading environments...</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {Object.entries(envStatuses).map(([name, status]) => (
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
      )}
    </div>
  );
}
