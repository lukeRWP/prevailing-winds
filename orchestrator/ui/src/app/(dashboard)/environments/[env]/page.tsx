'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Terminal, Play, Square, RotateCcw } from 'lucide-react';
import { VmCard } from '@/components/environments/vm-card';
import { ConfirmationDialog } from '@/components/actions/confirmation-dialog';
import { cn } from '@/lib/utils';
import { useApp } from '@/hooks/use-app';
import type { EnvironmentStatus, EnvironmentManifest } from '@/types/api';

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

  useEffect(() => {
    async function fetch_data() {
      try {
        const [statusRes, appRes] = await Promise.all([
          fetch(`/api/proxy/_x_/apps/${currentApp}/envs/${envName}/status`).then((r) => r.json()),
          fetch(`/api/proxy/_x_/apps/${currentApp}`).then((r) => r.json()),
        ]);

        if (statusRes.success) setStatus(statusRes.data);
        if (appRes.success) {
          setManifest(appRes.data.environments?.[envName] || null);
        }
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
    </div>
  );
}
