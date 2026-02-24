import Link from 'next/link';
import { Network, Globe } from 'lucide-react';
import type { Vlan } from '@/lib/networking-data';

const ENV_COLORS: Record<string, string> = {
  dev: 'border-l-blue-500',
  qa: 'border-l-amber-500',
  prod: 'border-l-emerald-500',
};

export function VlanCard({ vlan }: { vlan: Vlan }) {
  const Icon = vlan.name === 'External' ? Globe : Network;
  const borderColor = vlan.environment ? ENV_COLORS[vlan.environment] || 'border-l-zinc-500' : 'border-l-zinc-500';

  return (
    <Link
      href={`/networking/vlans/${vlan.id}`}
      className={`block rounded-lg border border-border bg-card p-4 hover:border-zinc-600 transition-colors border-l-4 ${borderColor}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{vlan.name}</span>
        </div>
        <span className="text-xs text-muted-foreground font-mono">VLAN {vlan.id}</span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground font-mono">{vlan.cidr}</p>
      <p className="mt-1 text-xs text-muted-foreground">{vlan.purpose}</p>
      {vlan.dhcpStart && (
        <p className="mt-1 text-[10px] text-muted-foreground font-mono">
          DHCP: {vlan.dhcpStart} – {vlan.dhcpStop}
        </p>
      )}
    </Link>
  );
}
