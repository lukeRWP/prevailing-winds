'use client';

import { useState, useEffect, Fragment } from 'react';
import Link from 'next/link';
import {
  ChevronDown, ChevronRight, ExternalLink, Clock, User, AlertTriangle,
  GitCommit, GitBranch, Tag, Rocket, Server, Monitor, GitPullRequest,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Operation, CommitInfo } from '@/types/api';

interface DeploymentTrackerProps {
  operations: Operation[];
  appName: string;
}

interface DeploymentRow {
  ref: string;
  envs: Record<string, Operation>;
  type: string;
  initiated_by: string;
}

export function DeploymentTracker({ operations, appName }: DeploymentTrackerProps) {
  const [expandedRef, setExpandedRef] = useState<string | null>(null);
  const [commitInfoMap, setCommitInfoMap] = useState<Record<string, CommitInfo>>({});

  // Group deploy operations by ref, then by env
  const deployOps = operations.filter(
    (op) => op.type === 'deploy' || op.type === 'deploy-server' || op.type === 'deploy-client'
  );

  const rowMap = new Map<string, DeploymentRow>();
  deployOps.forEach((op) => {
    const ref = op.ref || 'unknown';
    if (!rowMap.has(ref)) {
      rowMap.set(ref, { ref, envs: {}, type: op.type, initiated_by: op.initiated_by || '' });
    }
    const row = rowMap.get(ref)!;
    const env = op.env || 'unknown';
    if (!row.envs[env] || new Date(op.created_at) > new Date(row.envs[env].created_at)) {
      row.envs[env] = op;
      row.type = op.type;
      row.initiated_by = op.initiated_by || row.initiated_by;
    }
  });

  const rows = Array.from(rowMap.values()).slice(0, 10);
  const envNames = ['dev', 'qa', 'prod'];

  // Collect unique SHA refs to fetch commit info for
  const shaRefs = rows
    .map((r) => r.ref)
    .filter((ref) => /^[0-9a-f]{7,40}$/.test(ref));

  useEffect(() => {
    if (shaRefs.length === 0 || !appName) return;
    const shasToFetch = shaRefs.filter((sha) => !commitInfoMap[sha]);
    if (shasToFetch.length === 0) return;

    fetch(`/api/proxy/_x_/apps/${appName}/git/commits?shas=${shasToFetch.join(',')}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data) {
          setCommitInfoMap((prev) => ({ ...prev, ...data.data }));
        }
      })
      .catch(() => { /* silent */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shaRefs.join(','), appName]);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-xs text-muted-foreground">No deployments found</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-accent/30">
              <th className="px-4 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">
                Deployment
              </th>
              {envNames.map((env) => (
                <th key={env} className="px-4 py-2 text-center text-[10px] font-medium text-muted-foreground uppercase">
                  {env}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const isExpanded = expandedRef === row.ref;
              const commitInfo = commitInfoMap[row.ref];
              return (
                <Fragment key={row.ref}>
                  <tr
                    className="hover:bg-accent/20 transition-colors cursor-pointer"
                    onClick={() => setExpandedRef(isExpanded ? null : row.ref)}
                  >
                    <td className="px-4 py-2 text-xs text-foreground">
                      <div className="flex items-center gap-2">
                        {isExpanded
                          ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                          : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                        }
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <TypeBadge type={row.type} />
                            <RefLabel ref_={row.ref} commitInfo={commitInfo} />
                          </div>
                          {commitInfo?.message && (
                            <p className="text-[11px] text-foreground mt-0.5 truncate max-w-[400px]">
                              {commitInfo.message}
                            </p>
                          )}
                          {commitInfo?.pr && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 truncate flex items-center gap-1">
                              <GitPullRequest className="h-2.5 w-2.5 text-violet-400 shrink-0" />
                              <span className="text-violet-400">#{commitInfo.pr.number}</span>
                              {' '}
                              <span className="text-muted-foreground">{commitInfo.pr.branch}</span>
                              {' → '}
                              <span className="text-muted-foreground">{commitInfo.pr.baseBranch}</span>
                            </p>
                          )}
                          {!commitInfo?.message && row.initiated_by && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                              by {row.initiated_by}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    {envNames.map((env) => {
                      const op = row.envs[env];
                      if (!op) {
                        return (
                          <td key={env} className="px-4 py-2 text-center text-xs text-zinc-600">
                            —
                          </td>
                        );
                      }
                      return (
                        <td key={env} className="px-4 py-2 text-center">
                          <DeployBadge status={op.status} time={op.created_at} />
                        </td>
                      );
                    })}
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={envNames.length + 1} className="px-0 py-0">
                        <ExpandedDetail envNames={envNames} envs={row.envs} commitInfo={commitInfo} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExpandedDetail({
  envNames,
  envs,
  commitInfo,
}: {
  envNames: string[];
  envs: Record<string, Operation>;
  commitInfo?: CommitInfo;
}) {
  const activeEnvs = envNames.filter((e) => envs[e]);
  if (activeEnvs.length === 0) return null;

  return (
    <div className="border-t border-border bg-accent/10 px-4 py-3">
      {/* Commit & PR links */}
      {commitInfo && (
        <div className="flex items-center gap-3 mb-3 pb-2 border-b border-border/50">
          <a
            href={commitInfo.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <GitCommit className="h-3 w-3" />
            View commit on GitHub
          </a>
          {commitInfo.pr && (
            <a
              href={commitInfo.pr.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <GitPullRequest className="h-3 w-3" />
              PR #{commitInfo.pr.number}: {commitInfo.pr.title}
            </a>
          )}
          {commitInfo.author && (
            <span className="text-[10px] text-muted-foreground">
              by {commitInfo.author}
            </span>
          )}
        </div>
      )}

      {/* Per-env details */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${activeEnvs.length}, 1fr)` }}
      >
        {activeEnvs.map((env) => {
          const op = envs[env];
          return (
            <div key={env} className="space-y-1.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                {env}
              </p>

              <div className="flex items-center gap-1.5">
                <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-xs text-foreground">{formatFullDate(op.created_at)}</span>
              </div>

              {op.initiated_by && (
                <div className="flex items-center gap-1.5">
                  <User className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground">{op.initiated_by}</span>
                </div>
              )}

              {op.duration_ms != null && (
                <p className="text-xs text-muted-foreground">
                  Duration: {formatDuration(op.duration_ms)}
                </p>
              )}

              {op.error && (
                <div className="flex items-start gap-1.5">
                  <AlertTriangle className="h-3 w-3 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-400 break-words">{op.error}</p>
                </div>
              )}

              <Link
                href={`/operations/${op.id}`}
                className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3 w-3" />
                View logs
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const config: Record<string, { label: string; icon: typeof Rocket; className: string }> = {
    'deploy': { label: 'Full Deploy', icon: Rocket, className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
    'deploy-server': { label: 'Server', icon: Server, className: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
    'deploy-client': { label: 'Client', icon: Monitor, className: 'bg-violet-500/15 text-violet-400 border-violet-500/30' },
  };
  const c = config[type] || config['deploy'];
  const Icon = c.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium shrink-0', c.className)}>
      <Icon className="h-2.5 w-2.5" />
      {c.label}
    </span>
  );
}

function RefLabel({ ref_, commitInfo }: { ref_: string; commitInfo?: CommitInfo }) {
  const isSha = /^[0-9a-f]{7,40}$/.test(ref_);
  const isTag = /^v?\d+\.\d+/.test(ref_);

  if (isSha) {
    const linkUrl = commitInfo?.url;
    const inner = (
      <span className="inline-flex items-center gap-1 font-mono text-muted-foreground">
        <GitCommit className="h-3 w-3 shrink-0" />
        {ref_.slice(0, 8)}
      </span>
    );
    if (linkUrl) {
      return (
        <a href={linkUrl} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors" onClick={(e) => e.stopPropagation()}>
          {inner}
        </a>
      );
    }
    return inner;
  }
  if (isTag) {
    return (
      <span className="inline-flex items-center gap-1 text-amber-400">
        <Tag className="h-3 w-3 shrink-0" />
        {ref_}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-foreground">
      <GitBranch className="h-3 w-3 shrink-0" />
      {ref_}
    </span>
  );
}

function DeployBadge({ status, time }: { status: string; time: string }) {
  const styles: Record<string, string> = {
    success: 'text-emerald-400',
    failed: 'text-red-400',
    running: 'text-blue-400',
    queued: 'text-amber-400',
  };
  const icons: Record<string, string> = {
    success: '\u2713',
    failed: '\u2717',
    running: '\u25CF',
    queued: '\u25CB',
  };

  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={cn('text-xs font-medium', styles[status] || 'text-zinc-400')}>
        {icons[status] || '?'} {status}
      </span>
      <span className="text-[10px] text-muted-foreground">
        {formatRelative(time)}
      </span>
    </div>
  );
}

function formatRelative(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remaining = sec % 60;
  return `${min}m ${remaining}s`;
}

function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
