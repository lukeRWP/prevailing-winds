'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Vlan, SecurityGroup, DnsRecord } from '@/lib/networking-data';

interface NetworkingData {
  vlans: Vlan[];
  securityGroups: SecurityGroup[];
  dnsRecords: DnsRecord[];
}

interface UseNetworkingDataResult extends NetworkingData {
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useNetworkingData(app: string): UseNetworkingDataResult {
  const [data, setData] = useState<NetworkingData>({ vlans: [], securityGroups: [], dnsRecords: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/proxy/_x_/apps/${app}/networking`);
      if (!res.ok) throw new Error('Failed to fetch networking data');
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'API error');
      setData(json.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load networking data');
    } finally {
      setLoading(false);
    }
  }, [app]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { ...data, loading, error, refresh: fetchData };
}

export function getAllFirewallRules(groups: SecurityGroup[]) {
  return groups.flatMap((sg) => sg.rules);
}

export function getGroupsByCategory(groups: SecurityGroup[], category: SecurityGroup['category']) {
  return groups.filter((sg) => sg.category === category);
}
