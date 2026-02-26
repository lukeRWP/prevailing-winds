'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, RotateCcw, XCircle, GitCommit, GitPullRequest, ExternalLink } from 'lucide-react';
import { OperationLog } from '@/components/operations/operation-log';
import { useEventSource } from '@/hooks/use-event-source';
import { cn } from '@/lib/utils';
import type { Operation, CommitInfo } from '@/types/api';

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
  const [commitInfo, setCommitInfo] = useState<CommitInfo | null>(null);

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

  // Fetch commit info for SHA ref
  useEffect(() => {
    if (!operation?.app || !operation?.ref) return;
    if (!/^[0-9a-f]{7,40}$/.test(operation.ref)) return;
    if (commitInfo?.sha === operation.ref) return;

    fetch(`/api/proxy/_x_/apps/${operation.app}/git/commits?shas=${operation.ref}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data?.[operation.ref!]) {
          setCommitInfo(data.data[operation.ref!]);
        }
      })
      .catch(() => { /* silent */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operation?.app, operation?.ref]);

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
  const vars = parseVars(operation.vars);

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
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Ref</p>
            <RefDisplay ref_={operation.ref} commitInfo={commitInfo} />
          </div>
          <MetaField label="Created" value={new Date(operation.created_at).toLocaleString()} />
          <MetaField
            label="Duration"
            value={operation.duration_ms ? formatDuration(operation.duration_ms) : '—'}
          />
          {operation.initiated_by && (
            <MetaField label="Initiated by" value={operation.initiated_by} />
          )}
          {operation.started_at && (
            <MetaField label="Started at" value={new Date(operation.started_at).toLocaleString()} />
          )}
          {operation.completed_at && (
            <MetaField label="Completed at" value={new Date(operation.completed_at).toLocaleString()} />
          )}
          {operation.error && (
            <div className="col-span-full">
              <p className="text-xs text-muted-foreground mb-1">Error</p>
              <p className="text-xs text-red-400 font-mono">{operation.error}</p>
            </div>
          )}
        </div>

        {/* Commit info banner */}
        {commitInfo && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <div className="flex items-center gap-3 flex-wrap">
              <a
                href={commitInfo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                <GitCommit className="h-3 w-3" />
                {commitInfo.message}
              </a>
              {commitInfo.pr && (
                <a
                  href={commitInfo.pr.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                >
                  <GitPullRequest className="h-3 w-3" />
                  PR #{commitInfo.pr.number}: {commitInfo.pr.title}
                </a>
              )}
              {commitInfo.author && (
                <span className="text-[10px] text-muted-foreground">by {commitInfo.author}</span>
              )}
            </div>
          </div>
        )}

        {/* Operation parameters */}
        {vars.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <p className="text-xs text-muted-foreground mb-2">Parameters</p>
            <div className="flex flex-wrap gap-2">
              {vars.map(([key, val]) => (
                <span
                  key={key}
                  className="inline-flex items-center gap-1 rounded border border-border bg-accent/30 px-2 py-0.5 text-[10px] font-mono text-foreground"
                >
                  <span className="text-muted-foreground">{key}:</span> {String(val)}
                </span>
              ))}
            </div>
          </div>
        )}
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

function RefDisplay({ ref_, commitInfo }: { ref_?: string; commitInfo?: CommitInfo | null }) {
  if (!ref_) return <p className="text-sm text-foreground">—</p>;

  const isSha = /^[0-9a-f]{7,40}$/.test(ref_);

  if (isSha && commitInfo?.url) {
    return (
      <a
        href={commitInfo.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 font-mono text-xs text-foreground hover:text-blue-400 transition-colors"
      >
        <GitCommit className="h-3 w-3 shrink-0" />
        {ref_.slice(0, 8)}
        <ExternalLink className="h-2.5 w-2.5 text-muted-foreground" />
      </a>
    );
  }

  return <p className={cn('text-sm text-foreground', isSha && 'font-mono text-xs')}>{isSha ? ref_.slice(0, 8) : ref_}</p>;
}

function MetaField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className={cn('text-sm text-foreground', mono && 'font-mono text-xs')}>{value}</p>
    </div>
  );
}

function parseVars(vars?: Record<string, unknown> | string): [string, unknown][] {
  if (!vars) return [];
  let parsed = vars;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch { return []; }
  }
  if (typeof parsed !== 'object' || parsed === null) return [];
  return Object.entries(parsed as Record<string, unknown>).filter(([, v]) => v != null);
}

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remaining = sec % 60;
  return `${min}m ${remaining}s`;
}
