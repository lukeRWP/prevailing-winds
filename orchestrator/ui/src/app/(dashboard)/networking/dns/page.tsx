'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { DnsRecordsTable } from '@/components/networking/dns-records-table';
import { useApp } from '@/hooks/use-app';
import { AppSection } from '@/components/layout/app-section';
import { useNetworkingData } from '@/hooks/use-networking-data';
import { cn } from '@/lib/utils';
import type { AppSummary } from '@/lib/app-context';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'shared', label: 'Shared' },
  { key: 'vm', label: 'VM' },
  { key: 'alias', label: 'Alias' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

export default function DnsPage() {
  const { apps } = useApp();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');

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
        <h1 className="text-2xl font-bold tracking-tight text-foreground">DNS Records</h1>
        <p className="text-sm text-muted-foreground">A records across all environments</p>
      </div>

      {/* Global Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                filter === f.key
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search hostname or IP..."
          className="rounded-md border border-border bg-card px-3 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-64"
        />
      </div>

      {apps.map((app) => (
        <AppSection key={app.name} app={app}>
          <AppDns app={app} filter={filter} search={search} />
        </AppSection>
      ))}
    </div>
  );
}

function AppDns({ app, filter, search }: { app: AppSummary; filter: FilterKey; search: string }) {
  const { dnsRecords, loading } = useNetworkingData(app.name);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading DNS records...</p>;
  }

  const filtered = dnsRecords.filter((r) => {
    if (filter !== 'all' && r.category !== filter) return false;
    if (search && !r.hostname.toLowerCase().includes(search.toLowerCase()) && !r.ip.includes(search)) return false;
    return true;
  });

  if (filtered.length === 0) {
    return <p className="text-xs text-muted-foreground">No matching records.</p>;
  }

  return <DnsRecordsTable records={filtered} />;
}
