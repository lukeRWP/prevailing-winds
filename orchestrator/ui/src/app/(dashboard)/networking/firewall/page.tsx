'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { FirewallRulesTable } from '@/components/networking/firewall-rules-table';
import { useApp } from '@/hooks/use-app';
import { useNetworkingData, getGroupsByCategory } from '@/hooks/use-networking-data';
import { cn } from '@/lib/utils';

const TABS = [
  { key: 'platform', label: 'Platform' },
  { key: 'application', label: 'Application' },
  { key: 'egress', label: 'Egress' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function FirewallPage() {
  const { currentApp } = useApp();
  const { securityGroups, loading } = useNetworkingData(currentApp);
  const [activeTab, setActiveTab] = useState<TabKey>('platform');

  const groups = getGroupsByCategory(securityGroups, activeTab);

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
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Firewall Rules</h1>
        <p className="text-sm text-muted-foreground">Proxmox security groups and firewall policy</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px',
              activeTab === tab.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
            <span className="ml-1.5 text-[10px] text-muted-foreground">
              ({getGroupsByCategory(securityGroups, tab.key).length})
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-lg border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">Loading firewall rules...</p>
        </div>
      ) : (
        <FirewallRulesTable groups={groups} />
      )}
    </div>
  );
}
