'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Terminal, Play, Square, RotateCcw, ArrowRightLeft } from 'lucide-react';
import { VmCard } from '@/components/environments/vm-card';
import { ConfirmationDialog } from '@/components/actions/confirmation-dialog';
import { cn } from '@/lib/utils';
import { useApp } from '@/hooks/use-app';
import type { EnvironmentStatus, EnvironmentManifest } from '@/types/api';

interface ClusterNode {
  node: string;
  status: string;
}

const ENV_BADGE: Record<string, string> = {
  dev: 'bg-blue-500/20 text-blue-400',
  qa: 'bg-amber-500/20 text-amber-400',
  prod: 'bg-emerald-500/20 text-emerald-400',
};

export default function EnvironmentDetailPage() {
  const params = useParams<{ env: string }>();
  const envName = params.env;
  const router = useRouter();
  const { currentApp, apps } = useApp();
  const appData = apps.find((a) => a.name === currentApp);

  const [status, setStatus] = useState<EnvironmentStatus | null>(null);
  const [manifest, setManifest] = useState<EnvironmentManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'stop' | 'restart' | null>(null);

  // Migration state
  const [nodes, setNodes] = useState<ClusterNode[]>([]);
  const [migrateTarget, setMigrateTarget] = useState<{ vmid: number; vmName: string; currentNode: string } | null>(null);
  const [migrateAllTarget, setMigrateAllTarget] = useState<string | null>(null);
  const [migrateLoading, setMigrateLoading] = useState(false);
  const [migrateResult, setMigrateResult] = useState<{ success: boolean; message: string } | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!currentApp) return;
    try {
      const res = await fetch(`/api/proxy/_x_/apps/${currentApp}/envs/${envName}/status`).then((r) => r.json());
      if (res.success) setStatus(res.data);
    } catch {
      // silent
    }
  }, [currentApp, envName]);

  useEffect(() => {
    async function fetch_data() {
      try {
        const [statusRes, appRes, nodesRes] = await Promise.all([
          fetch(`/api/proxy/_x_/apps/${currentApp}/envs/${envName}/status`).then((r) => r.json()),
          fetch(`/api/proxy/_x_/apps/${currentApp}`).then((r) => r.json()),
          fetch('/api/proxy/_x_/infra/nodes').then((r) => r.json()),
        ]);

        if (statusRes.success) setStatus(statusRes.data);
        if (appRes.success) {
          setManifest(appRes.data.environments?.[envName] || null);
        }
        if (nodesRes.success) setNodes(nodesRes.data || []);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    if (currentApp) fetch_data();
  }, [envName, currentApp]);

  const triggerAction = useCallback(async (action: 'start' | 'stop' | 'restart') => {
    if (!currentApp) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/proxy/_y_/apps/${currentApp}/envs/${envName}/${action}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success && data.data?.opId) {
        router.push(`/operations/${data.data.opId}`);
      }
    } catch {
      // silent
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  }, [currentApp, envName, router]);

  const getOtherNode = useCallback((currentNode: string) => {
    const onlineNodes = nodes.filter((n) => n.status === 'online' && n.node !== currentNode);
    return onlineNodes[0]?.node || null;
  }, [nodes]);

  const handleMigrateOne = useCallback(async () => {
    if (!currentApp || !migrateTarget) return;
    const targetNode = getOtherNode(migrateTarget.currentNode);
    if (!targetNode) return;

    setMigrateLoading(true);
    setMigrateResult(null);
    try {
      const res = await fetch(`/api/proxy/_y_/apps/${currentApp}/envs/${envName}/vms/migrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vmid: migrateTarget.vmid, targetNode }),
      });
      const data = await res.json();
      if (data.success) {
        setMigrateResult({ success: true, message: data.message || 'Migration complete' });
        await fetchStatus();
      } else {
        setMigrateResult({ success: false, message: data.message || 'Migration failed' });
      }
    } catch (err) {
      setMigrateResult({ success: false, message: 'Migration request failed' });
    } finally {
      setMigrateLoading(false);
    }
  }, [currentApp, envName, migrateTarget, getOtherNode, fetchStatus]);

  const handleMigrateAll = useCallback(async () => {
    if (!currentApp || !migrateAllTarget || !status?.vms) return;

    setMigrateLoading(true);
    setMigrateResult(null);
    const vmsToMigrate = status.vms.filter((vm) => vm.node !== migrateAllTarget);

    let migrated = 0;
    let failed = 0;
    for (const vm of vmsToMigrate) {
      try {
        const res = await fetch(`/api/proxy/_y_/apps/${currentApp}/envs/${envName}/vms/migrate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vmid: vm.vmid, targetNode: migrateAllTarget }),
        });
        const data = await res.json();
        if (data.success) migrated++;
        else failed++;
      } catch {
        failed++;
      }
    }

    setMigrateResult({
      success: failed === 0,
      message: `Migrated ${migrated}/${vmsToMigrate.length} VMs${failed > 0 ? ` (${failed} failed)` : ''}`,
    });
    await fetchStatus();
    setMigrateLoading(false);
  }, [currentApp, envName, migrateAllTarget, status, fetchStatus]);

  const badgeClass = ENV_BADGE[envName] || 'bg-zinc-500/20 text-zinc-400';

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">Loading environment...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div>
        <Link
          href="/environments"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to environments
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {envName.toUpperCase()}
          </h1>
          <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', badgeClass)}>
            {envName}
          </span>
          {appData && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-primary/15 text-primary">
              {appData.displayName || currentApp}
            </span>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => triggerAction('start')}
              disabled={actionLoading}
              className="flex items-center gap-1.5 rounded-md border border-emerald-500/50 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
            >
              <Play className="h-3 w-3" />
              Start
            </button>
            <button
              onClick={() => setConfirmAction('stop')}
              disabled={actionLoading}
              className="flex items-center gap-1.5 rounded-md border border-red-500/50 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
            >
              <Square className="h-3 w-3" />
              Stop
            </button>
            <button
              onClick={() => setConfirmAction('restart')}
              disabled={actionLoading}
              className="flex items-center gap-1.5 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/20 disabled:opacity-50 transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              Restart
            </button>
            {nodes.length > 1 && (
              <div className="relative">
                <select
                  onChange={(e) => {
                    if (e.target.value) setMigrateAllTarget(e.target.value);
                  }}
                  value=""
                  disabled={migrateLoading}
                  className="flex items-center gap-1.5 rounded-md border border-violet-500/50 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-400 hover:bg-violet-500/20 disabled:opacity-50 transition-colors appearance-none cursor-pointer pr-6"
                >
                  <option value="" disabled>Migrate All...</option>
                  {nodes.filter((n) => n.status === 'online').map((n) => (
                    <option key={n.node} value={n.node}>→ {n.node}</option>
                  ))}
                </select>
                <ArrowRightLeft className="h-3 w-3 absolute right-2 top-1/2 -translate-y-1/2 text-violet-400 pointer-events-none" />
              </div>
            )}
          </div>
        </div>
        {status && (
          <p className="text-sm text-muted-foreground mt-1">
            VLAN {status.vlan} · {status.cidr}
          </p>
        )}
      </div>

      {/* Pipeline Config */}
      {manifest?.pipeline && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-medium text-foreground mb-2">Pipeline</h3>
          <div className="flex gap-4 text-xs">
            {manifest.pipeline.autoDeployBranch && (
              <div>
                <span className="text-muted-foreground">Auto-deploy branch: </span>
                <span className="text-foreground font-mono">{manifest.pipeline.autoDeployBranch}</span>
              </div>
            )}
            {manifest.pipeline.deployOnTag && (
              <div>
                <span className="text-muted-foreground">Deploy on tag: </span>
                <span className="text-foreground font-mono">{manifest.pipeline.deployOnTag}</span>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Approval: </span>
              <span className="text-foreground">
                {manifest.pipeline.requiresApproval ? 'Required' : 'Not required'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* VM Cards */}
      <div>
        <h2 className="text-sm font-medium text-foreground mb-3">Virtual Machines</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {status?.vms?.map((vm) => {
            const hostConfig = manifest?.hosts?.[vm.role];
            return (
              <VmCard
                key={vm.name}
                role={vm.role}
                ip={hostConfig?.ip || 'unknown'}
                externalIp={hostConfig?.externalIp}
                status={vm.status}
                vmid={vm.vmid}
                proxmoxNode={vm.node}
                onMigrate={nodes.length > 1 ? (vmid, currentNode) => {
                  setMigrateTarget({ vmid, vmName: vm.name, currentNode });
                  setMigrateResult(null);
                } : undefined}
              />
            );
          })}
        </div>
      </div>

      {/* Server Logs Link */}
      <Link
        href={`/environments/${envName}/logs`}
        className="flex items-center gap-2 rounded-lg border border-border bg-card p-4 hover:bg-accent/50 transition-colors group"
      >
        <Terminal className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
        <div>
          <p className="text-sm font-medium text-foreground">Server Logs</p>
          <p className="text-xs text-muted-foreground">Stream live logs from VMs (App, MySQL, Nginx, MinIO)</p>
        </div>
      </Link>

      {/* Status Error */}
      {status?.vmsError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          VM status error: {status.vmsError}
        </div>
      )}

      {/* Confirmation Dialogs */}
      <ConfirmationDialog
        open={confirmAction === 'stop'}
        title={`Stop ${envName.toUpperCase()}`}
        description={`This will stop all services in the ${envName} environment (App Server, MySQL, MinIO, Nginx). The VMs will remain running.`}
        severity="warning"
        confirmText="Stop Environment"
        onConfirm={() => triggerAction('stop')}
        onCancel={() => setConfirmAction(null)}
        loading={actionLoading}
      />
      <ConfirmationDialog
        open={confirmAction === 'restart'}
        title={`Restart ${envName.toUpperCase()}`}
        description={`This will stop then start all services in the ${envName} environment in dependency order. Expect brief downtime.`}
        severity="warning"
        confirmText="Restart Environment"
        onConfirm={() => triggerAction('restart')}
        onCancel={() => setConfirmAction(null)}
        loading={actionLoading}
      />

      {/* Single VM Migration Dialog */}
      <ConfirmationDialog
        open={migrateTarget !== null}
        title={`Migrate VM`}
        description={
          migrateTarget
            ? `Migrate ${migrateTarget.vmName} from ${migrateTarget.currentNode} to ${getOtherNode(migrateTarget.currentNode) || '?'}? This performs a live migration — the VM stays running during the move.`
            : ''
        }
        severity="warning"
        confirmText="Migrate"
        onConfirm={handleMigrateOne}
        onCancel={() => { setMigrateTarget(null); setMigrateResult(null); }}
        loading={migrateLoading}
      />

      {/* Migrate All Dialog */}
      <ConfirmationDialog
        open={migrateAllTarget !== null}
        title={`Migrate All VMs`}
        description={
          migrateAllTarget
            ? `Migrate all ${envName.toUpperCase()} VMs to ${migrateAllTarget}? VMs already on that node will be skipped. This performs live migration — VMs stay running.`
            : ''
        }
        severity="warning"
        confirmText="Migrate All"
        onConfirm={handleMigrateAll}
        onCancel={() => { setMigrateAllTarget(null); setMigrateResult(null); }}
        loading={migrateLoading}
      />

      {/* Migration Result Toast */}
      {migrateResult && (
        <div className={cn(
          'fixed bottom-4 right-4 rounded-lg border px-4 py-3 text-sm shadow-lg',
          migrateResult.success
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
            : 'border-red-500/30 bg-red-500/10 text-red-400'
        )}>
          {migrateResult.message}
          <button
            onClick={() => setMigrateResult(null)}
            className="ml-3 text-xs opacity-60 hover:opacity-100"
          >
            dismiss
          </button>
        </div>
      )}
    </div>
  );
}
