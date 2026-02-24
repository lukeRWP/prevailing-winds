'use client';

import { useMemo } from 'react';
import { InfrastructureCanvas } from '@/components/topology/infrastructure-canvas';
import { useMultiAppTopologyData } from '@/hooks/use-topology-data';
import { useApp } from '@/hooks/use-app';
import { RefreshCw } from 'lucide-react';

export default function TopologyPage() {
  const { apps } = useApp();

  const appInfos = useMemo(
    () => apps.map((a) => ({ name: a.name, displayName: a.displayName })),
    [apps]
  );

  const { appsData, loading, error, refresh } = useMultiAppTopologyData(appInfos);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex items-center justify-between px-1 pb-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Topology
          </h1>
          <p className="text-sm text-muted-foreground">
            Infrastructure topology — VMs, VLANs, and network connections
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mx-1 mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="flex-1 rounded-lg border border-border overflow-hidden">
        {loading && appsData.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-sm text-muted-foreground">
              Loading topology...
            </div>
          </div>
        ) : (
          <InfrastructureCanvas
            environments={[]}
            envStatuses={{}}
            appsData={appsData}
          />
        )}
      </div>
    </div>
  );
}
