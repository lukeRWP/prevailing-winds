import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { Operation } from '@/types/api';

const STATUS_STYLES: Record<string, { dot: string; text: string }> = {
  success: { dot: 'bg-emerald-500', text: 'text-emerald-400' },
  failed: { dot: 'bg-red-500', text: 'text-red-400' },
  running: { dot: 'bg-blue-500 animate-pulse', text: 'text-blue-400' },
  queued: { dot: 'bg-amber-500', text: 'text-amber-400' },
  cancelled: { dot: 'bg-zinc-500', text: 'text-zinc-400' },
};

interface OperationsTableProps {
  operations: Operation[];
}

export function OperationsTable({ operations }: OperationsTableProps) {
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
                  <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono">
                    {op.ref || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {op.duration_ms ? formatDuration(op.duration_ms) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {formatDate(op.created_at)}
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

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remaining = sec % 60;
  return `${min}m ${remaining}s`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
