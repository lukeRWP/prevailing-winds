'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Network } from 'lucide-react';
import { useApp } from '@/hooks/use-app';
import { useNetworkingData } from '@/hooks/use-networking-data';
import { cn } from '@/lib/utils';

export default function VlanDetailPage() {
  const params = useParams<{ vlanId: string }>();
  const vlanId = parseInt(params.vlanId, 10);
  const { currentApp } = useApp();
  const { vlans, securityGroups, dnsRecords, loading } = useNetworkingData(currentApp);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">Loading VLAN data...</p>
      </div>
    );
  }

  const vlan = vlans.find((v) => v.id === vlanId);

  if (!vlan) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">VLAN not found</p>
      </div>
    );
  }

  // Find security groups relevant to this VLAN
  const relevantGroups = securityGroups.filter((sg) =>
    sg.rules.some((r) => r.source?.startsWith(vlan.cidr.replace('/24', '')) || r.dest?.startsWith(vlan.cidr.replace('/24', '')))
  );

  // Find DNS records for this environment
  const envRecords = vlan.environment
    ? dnsRecords.filter((r) => r.environment === vlan.environment)
    : dnsRecords.filter((r) => r.category === 'shared');

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/networking"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to networking
        </Link>
        <div className="flex items-center gap-3">
          <Network className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            VLAN {vlan.id} — {vlan.name}
          </h1>
        </div>
      </div>

      {/* Details */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Detail label="CIDR" value={vlan.cidr} mono />
          <Detail label="Gateway" value={vlan.gateway} mono />
          <Detail label="Purpose" value={vlan.purpose} />
          {vlan.dhcpStart && (
            <Detail label="DHCP Range" value={`${vlan.dhcpStart} – ${vlan.dhcpStop}`} mono />
          )}
          {vlan.environment && (
            <Detail label="Environment" value={vlan.environment.toUpperCase()} />
          )}
        </div>
      </div>

      {/* DNS Records */}
      {envRecords.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-foreground mb-3">
            DNS Records ({envRecords.length})
          </h2>
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-accent/30">
                  <th className="px-4 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">Hostname</th>
                  <th className="px-4 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">IP</th>
                  <th className="px-4 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">Category</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {envRecords.map((r) => (
                  <tr key={r.hostname} className="hover:bg-accent/20">
                    <td className="px-4 py-2 text-xs font-mono text-foreground">{r.hostname}</td>
                    <td className="px-4 py-2 text-xs font-mono text-muted-foreground">{r.ip}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{r.category}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Related Security Groups */}
      {relevantGroups.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-foreground mb-3">
            Related Security Groups ({relevantGroups.length})
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {relevantGroups.map((sg) => (
              <div key={sg.name} className="rounded-lg border border-border bg-card p-3">
                <span className="text-xs font-bold text-foreground font-mono">{sg.name}</span>
                <p className="text-xs text-muted-foreground mt-1">{sg.description}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {sg.rules.length} rules · Applied to: {sg.appliedTo}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className={cn('text-sm text-foreground', mono && 'font-mono text-xs')}>{value}</p>
    </div>
  );
}
