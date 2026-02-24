'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { FirewallRulesTable } from '@/components/networking/firewall-rules-table';
import { useApp } from '@/hooks/use-app';
import { AppSection } from '@/components/layout/app-section';
import { useNetworkingData, getGroupsByCategory } from '@/hooks/use-networking-data';
import { cn } from '@/lib/utils';
import type { AppSummary } from '@/lib/app-context';

const TABS = [
  { key: 'platform', label: 'Platform' },
  { key: 'application', label: 'Application' },
  { key: 'egress', label: 'Egress' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function FirewallPage() {
  const { apps } = useApp();
  const [activeTab, setActiveTab] = useState<TabKey>('platform');

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
          </button>
        ))}
      </div>

      {apps.map((app) => (
        <AppSection key={app.name} app={app}>
          <AppFirewall app={app} activeTab={activeTab} />
        </AppSection>
      ))}
    </div>
  );
}

function AppFirewall({ app, activeTab }: { app: AppSummary; activeTab: TabKey }) {
  const { securityGroups, loading } = useNetworkingData(app.name);
  const groups = getGroupsByCategory(securityGroups, activeTab);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading firewall rules...</p>;
  }

  if (groups.length === 0) {
    return <p className="text-xs text-muted-foreground">No {activeTab} rules.</p>;
  }

  return <FirewallRulesTable groups={groups} />;
}
