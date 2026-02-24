import { cn } from '@/lib/utils';
import type { Operation } from '@/types/api';

interface DeploymentTrackerProps {
  operations: Operation[];
}

interface DeploymentRow {
  ref: string;
  envs: Record<string, { status: string; time: string }>;
}

export function DeploymentTracker({ operations }: DeploymentTrackerProps) {
  // Group deploy operations by ref, then by env
  const deployOps = operations.filter(
    (op) => op.type === 'deploy' || op.type === 'deploy-server' || op.type === 'deploy-client'
  );

  const rowMap = new Map<string, DeploymentRow>();
  deployOps.forEach((op) => {
    const ref = op.ref || 'unknown';
    if (!rowMap.has(ref)) {
      rowMap.set(ref, { ref, envs: {} });
    }
    const row = rowMap.get(ref)!;
    const env = op.env || 'unknown';
    // Keep the most recent deploy per ref+env
    if (!row.envs[env] || new Date(op.created_at) > new Date(row.envs[env].time)) {
      row.envs[env] = { status: op.status, time: op.created_at };
    }
  });

  const rows = Array.from(rowMap.values()).slice(0, 10);
  const envNames = ['dev', 'qa', 'prod'];

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
                Ref
              </th>
              {envNames.map((env) => (
                <th key={env} className="px-4 py-2 text-center text-[10px] font-medium text-muted-foreground uppercase">
                  {env}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.ref} className="hover:bg-accent/20 transition-colors">
                <td className="px-4 py-2 text-xs font-mono text-foreground">
                  {row.ref.length > 12 ? row.ref.slice(0, 12) + '...' : row.ref}
                </td>
                {envNames.map((env) => {
                  const deploy = row.envs[env];
                  if (!deploy) {
                    return (
                      <td key={env} className="px-4 py-2 text-center text-xs text-zinc-600">
                        —
                      </td>
                    );
                  }
                  return (
                    <td key={env} className="px-4 py-2 text-center">
                      <DeployBadge status={deploy.status} time={deploy.time} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
