'use client';

import Link from 'next/link';
import { Shield, Globe, Server } from 'lucide-react';
import { VlanCard } from '@/components/networking/vlan-card';
import { useApp } from '@/hooks/use-app';
import { useNetworkingData, getAllFirewallRules } from '@/hooks/use-networking-data';

export default function NetworkingPage() {
  const { currentApp } = useApp();
  const { vlans, securityGroups, dnsRecords, loading } = useNetworkingData(currentApp);

  const allRules = getAllFirewallRules(securityGroups);
  const ingressRules = allRules.filter((r) => r.direction === 'IN');
  const egressRules = allRules.filter((r) => r.direction === 'OUT');

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Networking</h1>
          <p className="text-sm text-muted-foreground">VLANs, firewall rules, DNS, and DHCP management</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">Loading networking data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Networking</h1>
        <p className="text-sm text-muted-foreground">VLANs, firewall rules, DNS, and DHCP management</p>
      </div>

      {/* VLAN Cards */}
      <div>
        <h2 className="text-sm font-medium text-foreground mb-3">VLANs</h2>
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
          {vlans.map((vlan) => (
            <VlanCard key={vlan.id} vlan={vlan} />
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Link
          href="/networking/firewall"
          className="rounded-lg border border-border bg-card p-4 hover:border-zinc-600 transition-colors"
        >
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Firewall Rules</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {securityGroups.length} security groups · {ingressRules.length} ingress · {egressRules.length} egress
          </p>
        </Link>

        <Link
          href="/networking/dns"
          className="rounded-lg border border-border bg-card p-4 hover:border-zinc-600 transition-colors"
        >
          <div className="flex items-center gap-2 mb-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">DNS Records</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {dnsRecords.length} A records · TTL 300s
          </p>
        </Link>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Server className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Security Policy</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Default deny (input/output) · MAC filter · IP filter · Micro-segmented
          </p>
        </div>
      </div>
    </div>
  );
}
