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

interface RecentOperationsProps {
  operations: Operation[];
}

export function RecentOperations({ operations }: RecentOperationsProps) {
  if (operations.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="text-xs text-muted-foreground">No recent operations</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">Recent Operations</h3>
          <Link
            href="/operations"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            View all
          </Link>
        </div>
      </div>
      <div className="divide-y divide-border">
        {operations.map((op) => {
          const style = STATUS_STYLES[op.status] || STATUS_STYLES.cancelled;
          return (
            <Link
              key={op.id}
              href={`/operations/${op.id}`}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50 transition-colors"
            >
              <div className={cn('h-2 w-2 rounded-full shrink-0', style.dot)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground truncate">
                    {op.type}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {op.env?.toUpperCase()}
                  </span>
                </div>
              </div>
              <span className={cn('text-[10px] font-medium shrink-0', style.text)}>
                {op.status}
              </span>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {formatRelativeTime(op.created_at)}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}
