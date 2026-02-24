'use client';

import Link from 'next/link';
import { Shield, Globe, Server } from 'lucide-react';
import { VlanCard } from '@/components/networking/vlan-card';
import { useApp } from '@/hooks/use-app';
import { AppSection } from '@/components/layout/app-section';
import { useNetworkingData, getAllFirewallRules } from '@/hooks/use-networking-data';
import type { AppSummary } from '@/lib/app-context';

export default function NetworkingPage() {
  const { apps } = useApp();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Networking</h1>
        <p className="text-sm text-muted-foreground">VLANs, firewall rules, DNS, and DHCP management</p>
      </div>

      {apps.map((app) => (
        <AppSection key={app.name} app={app}>
          <AppNetworking app={app} />
        </AppSection>
      ))}
    </div>
  );
}

function AppNetworking({ app }: { app: AppSummary }) {
  const { vlans, securityGroups, dnsRecords, loading } = useNetworkingData(app.name);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading networking data...</p>;
  }

  const allRules = getAllFirewallRules(securityGroups);
  const ingressRules = allRules.filter((r) => r.direction === 'IN');
  const egressRules = allRules.filter((r) => r.direction === 'OUT');

  return (
    <div className="space-y-4">
      {/* VLANs */}
      <div>
        <h3 className="text-xs font-medium text-muted-foreground mb-2 uppercase">VLANs</h3>
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
          {vlans.map((vlan) => (
            <VlanCard key={vlan.id} vlan={vlan} />
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3 md:grid-cols-3">
        <Link
          href="/networking/firewall"
          className="rounded-md border border-border bg-card/50 p-3 hover:border-zinc-600 transition-colors"
        >
          <div className="flex items-center gap-2 mb-1">
            <Shield className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Firewall Rules</span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            {securityGroups.length} groups · {ingressRules.length} in · {egressRules.length} out
          </p>
        </Link>

        <Link
          href="/networking/dns"
          className="rounded-md border border-border bg-card/50 p-3 hover:border-zinc-600 transition-colors"
        >
          <div className="flex items-center gap-2 mb-1">
            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">DNS Records</span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            {dnsRecords.length} A records · TTL 300s
          </p>
        </Link>

        <div className="rounded-md border border-border bg-card/50 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Server className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Security Policy</span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Default deny · MAC filter · Micro-segmented
          </p>
        </div>
      </div>
    </div>
  );
}
