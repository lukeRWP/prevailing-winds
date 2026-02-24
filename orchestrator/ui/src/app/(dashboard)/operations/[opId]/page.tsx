'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, RotateCcw, XCircle } from 'lucide-react';
import { OperationLog } from '@/components/operations/operation-log';
import { useEventSource } from '@/hooks/use-event-source';
import { cn } from '@/lib/utils';
import type { Operation } from '@/types/api';

const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  success: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  failed: { bg: 'bg-red-500/20', text: 'text-red-400' },
  running: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  queued: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  cancelled: { bg: 'bg-zinc-500/20', text: 'text-zinc-400' },
};

export default function OperationDetailPage() {
  const params = useParams<{ opId: string }>();
  const router = useRouter();
  const opId = params.opId;

  const [operation, setOperation] = useState<Operation | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Only stream if operation is running
  const streamUrl =
    operation?.status === 'running' ? `/api/proxy/_x_/ops/${opId}/stream` : null;

  const { data: streamLines, connectionState } = useEventSource(streamUrl);

  useEffect(() => {
    async function fetchOp() {
      try {
        const res = await fetch(`/api/proxy/_x_/ops/${opId}`);
        const data = await res.json();
        if (data.success) setOperation(data.data);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    fetchOp();

    // Poll for status updates when not streaming
    const interval = setInterval(fetchOp, 5000);
    return () => clearInterval(interval);
  }, [opId]);

  async function handleRetry() {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/proxy/_y_/ops/${opId}/retry`, { method: 'POST' });
      const data = await res.json();
      if (data.success && data.data?.id) {
        router.push(`/operations/${data.data.id}`);
      }
    } catch {
      // silent
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCancel() {
    setActionLoading(true);
    try {
      await fetch(`/api/proxy/_y_/ops/${opId}/cancel`, { method: 'POST' });
      // Refresh operation data
      const res = await fetch(`/api/proxy/_x_/ops/${opId}`);
      const data = await res.json();
      if (data.success) setOperation(data.data);
    } catch {
      // silent
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">Loading operation...</p>
      </div>
    );
  }

  if (!operation) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">Operation not found</p>
      </div>
    );
  }

  const badge = STATUS_BADGE[operation.status] || STATUS_BADGE.cancelled;

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div>
        <Link
          href="/operations"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to operations
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {operation.type}
            </h1>
            <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', badge.bg, badge.text)}>
              {operation.status}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {operation.status === 'failed' && (
              <button
                onClick={handleRetry}
                disabled={actionLoading}
                className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry
              </button>
            )}
            {operation.status === 'queued' && (
              <button
                onClick={handleCancel}
                disabled={actionLoading}
                className="flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
              >
                <XCircle className="h-3.5 w-3.5" />
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetaField label="Environment" value={operation.env?.toUpperCase() || '—'} />
          <MetaField label="Ref" value={operation.ref || '—'} mono />
          <MetaField label="Created" value={new Date(operation.created_at).toLocaleString()} />
          <MetaField
            label="Duration"
            value={operation.duration_ms ? formatDuration(operation.duration_ms) : '—'}
          />
          {operation.initiated_by && (
            <MetaField label="Initiated by" value={operation.initiated_by} />
          )}
          {operation.error && (
            <div className="col-span-full">
              <p className="text-xs text-muted-foreground mb-1">Error</p>
              <p className="text-xs text-red-400 font-mono">{operation.error}</p>
            </div>
          )}
        </div>
      </div>

      {/* Log Output */}
      <OperationLog
        lines={streamLines}
        connectionState={streamUrl ? connectionState : 'closed'}
        staticOutput={operation.output || undefined}
      />
    </div>
  );
}

function MetaField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className={cn('text-sm text-foreground', mono && 'font-mono text-xs')}>{value}</p>
    </div>
  );
}

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remaining = sec % 60;
  return `${min}m ${remaining}s`;
}
