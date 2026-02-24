'use client';

import { useState, useEffect, useCallback } from 'react';
import type { EnvironmentStatus } from '@/types/api';
import type { AppTopologyInput } from '@/components/topology/topology-builder';

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

// Fetches topology data for ALL apps, returning AppTopologyInput[] for the multi-app canvas
interface UseMultiAppTopologyResult {
  appsData: AppTopologyInput[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

interface AppInfo {
  name: string;
  displayName: string;
}

export function useMultiAppTopologyData(apps: AppInfo[], pollInterval = 15000): UseMultiAppTopologyResult {
  const [appsData, setAppsData] = useState<AppTopologyInput[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (apps.length === 0) {
      setLoading(false);
      return;
    }

    try {
      const results = await Promise.allSettled(
        apps.map(async (app) => {
          const appRes = await fetch(`/api/proxy/_x_/apps/${app.name}`);
          if (!appRes.ok) throw new Error(`Failed to fetch ${app.name}`);
          const appData = await appRes.json();
          if (!appData.success) throw new Error(appData.message || 'API error');

          const appManifest = appData.data;
          const envNames = Object.keys(appManifest.environments || {});

          const environments: EnvironmentBasic[] = envNames.map((name) => {
            const manifest = appManifest.environments[name];
            return {
              name,
              vlan: manifest.vlan,
              cidr: manifest.cidr,
              gateway: manifest.gateway,
              hosts: manifest.hosts,
            };
          });

          const statusResults = await Promise.allSettled(
            envNames.map(async (env) => {
              const res = await fetch(`/api/proxy/_x_/apps/${app.name}/envs/${env}/status`);
              if (!res.ok) return null;
              const data = await res.json();
              return data.success ? { env, status: data.data } : null;
            })
          );

          const envStatuses: Record<string, EnvironmentStatus> = {};
          statusResults.forEach((result) => {
            if (result.status === 'fulfilled' && result.value) {
              envStatuses[result.value.env] = result.value.status;
            }
          });

          return {
            appName: app.name,
            displayName: app.displayName,
            environments,
            envStatuses,
          } as AppTopologyInput;
        })
      );

      const successfulApps: AppTopologyInput[] = [];
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          successfulApps.push(result.value);
        }
      });

      setAppsData(successfulApps);
      setError(successfulApps.length === 0 ? 'Failed to load topology data for any app' : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load topology data');
    } finally {
      setLoading(false);
    }
  }, [apps]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, pollInterval);
    return () => clearInterval(interval);
  }, [fetchData, pollInterval]);

  return { appsData, loading, error, refresh: fetchData };
}
