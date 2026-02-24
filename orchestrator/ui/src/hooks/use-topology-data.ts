'use client';

import { useState, useEffect, useCallback } from 'react';
import type { EnvironmentStatus } from '@/types/api';

interface EnvironmentBasic {
  name: string;
  vlan: number;
  cidr: string;
  gateway?: string;
  hosts: Record<string, { ip: string; externalIp?: string }>;
}

interface UseTopologyDataResult {
  environments: EnvironmentBasic[];
  envStatuses: Record<string, EnvironmentStatus>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useTopologyData(app: string, pollInterval = 15000): UseTopologyDataResult {
  const [environments, setEnvironments] = useState<EnvironmentBasic[]>([]);
  const [envStatuses, setEnvStatuses] = useState<Record<string, EnvironmentStatus>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      // Fetch app details to get environment manifest with host IPs
      const appRes = await fetch(`/api/proxy/_x_/apps/${app}`);
      if (!appRes.ok) throw new Error('Failed to fetch app details');
      const appData = await appRes.json();

      if (!appData.success) throw new Error(appData.message || 'API error');

      const appManifest = appData.data;
      const envNames = Object.keys(appManifest.environments || {});

      // Transform manifest environments to our format
      const envs: EnvironmentBasic[] = envNames.map((name) => {
        const manifest = appManifest.environments[name];
        return {
          name,
          vlan: manifest.vlan,
          cidr: manifest.cidr,
          gateway: manifest.gateway,
          hosts: manifest.hosts,
        };
      });
      setEnvironments(envs);

      // Fetch status for each environment in parallel
      const statusResults = await Promise.allSettled(
        envNames.map(async (env) => {
          const res = await fetch(`/api/proxy/_x_/apps/${app}/envs/${env}/status`);
          if (!res.ok) return null;
          const data = await res.json();
          return data.success ? { env, status: data.data } : null;
        })
      );

      const statuses: Record<string, EnvironmentStatus> = {};
      statusResults.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          statuses[result.value.env] = result.value.status;
        }
      });
      setEnvStatuses(statuses);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load topology data');
    } finally {
      setLoading(false);
    }
  }, [app]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, pollInterval);
    return () => clearInterval(interval);
  }, [fetchData, pollInterval]);

  return { environments, envStatuses, loading, error, refresh: fetchData };
}
