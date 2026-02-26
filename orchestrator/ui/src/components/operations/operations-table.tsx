import Link from 'next/link';
import { GitCommit, GitBranch, Tag, GitPullRequest } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Operation, CommitInfo } from '@/types/api';

const STATUS_STYLES: Record<string, { dot: string; text: string }> = {
  success: { dot: 'bg-emerald-500', text: 'text-emerald-400' },
  failed: { dot: 'bg-red-500', text: 'text-red-400' },
  running: { dot: 'bg-blue-500 animate-pulse', text: 'text-blue-400' },
  queued: { dot: 'bg-amber-500', text: 'text-amber-400' },
  cancelled: { dot: 'bg-zinc-500', text: 'text-zinc-400' },
};

interface OperationsTableProps {
  operations: Operation[];
  commitInfoMap?: Record<string, CommitInfo>;
}

export function OperationsTable({ operations, commitInfoMap = {} }: OperationsTableProps) {
  if (operations.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">No operations found</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-accent/30">
              <th className="px-4 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Type
              </th>
              <th className="px-4 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Environment
              </th>
              <th className="px-4 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Ref
              </th>
              <th className="px-4 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Initiated by
              </th>
              <th className="px-4 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Duration
              </th>
              <th className="px-4 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Created
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {operations.map((op) => {
              const style = STATUS_STYLES[op.status] || STATUS_STYLES.cancelled;
              const commitInfo = op.ref ? commitInfoMap[op.ref] : undefined;
              return (
                <tr key={op.id} className="hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-2.5">
                    <Link href={`/operations/${op.id}`} className="flex items-center gap-2">
                      <div className={cn('h-2 w-2 rounded-full shrink-0', style.dot)} />
                      <span className={cn('text-xs font-medium', style.text)}>
                        {op.status}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <Link href={`/operations/${op.id}`} className="text-xs text-foreground hover:underline">
                      {op.type}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {op.env?.toUpperCase() || '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <RefCell ref_={op.ref} commitInfo={commitInfo} />
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {op.initiated_by || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {op.duration_ms ? formatDuration(op.duration_ms) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    <span title={new Date(op.created_at).toLocaleString()}>
                      {formatRelative(op.created_at)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RefCell({ ref_, commitInfo }: { ref_?: string; commitInfo?: CommitInfo }) {
  if (!ref_) return <span className="text-xs text-muted-foreground">—</span>;

  const isSha = /^[0-9a-f]{7,40}$/.test(ref_);
  const isTag = /^v?\d+\.\d+/.test(ref_);

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1">
        {isSha ? (
          commitInfo?.url ? (
            <a href={commitInfo.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors">
              <GitCommit className="h-3 w-3 shrink-0" />
              {ref_.slice(0, 8)}
            </a>
          ) : (
            <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground">
              <GitCommit className="h-3 w-3 shrink-0" />
              {ref_.slice(0, 8)}
            </span>
          )
        ) : isTag ? (
          <span className="inline-flex items-center gap-1 text-xs text-amber-400">
            <Tag className="h-3 w-3 shrink-0" />
            {ref_}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-foreground">
            <GitBranch className="h-3 w-3 shrink-0" />
            {ref_}
          </span>
        )}
      </div>
      {commitInfo?.message && (
        <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[250px]">
          {commitInfo.message}
        </p>
      )}
      {commitInfo?.pr && (
        <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
          <GitPullRequest className="h-2.5 w-2.5 text-violet-400 shrink-0" />
          <a href={commitInfo.pr.url} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300">
            #{commitInfo.pr.number}
          </a>
          <span>{commitInfo.pr.branch} &rarr; {commitInfo.pr.baseBranch}</span>
        </p>
      )}
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

function formatRelative(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
