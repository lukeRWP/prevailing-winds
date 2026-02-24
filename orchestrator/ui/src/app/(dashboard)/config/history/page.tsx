'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { useApp } from '@/hooks/use-app';
import { cn } from '@/lib/utils';

interface ChangeSet {
  id: string;
  app: string;
  changes: Array<{ target: string; description: string; source: string }>;
  status: string;
  createdAt: string;
  appliedBy: string | null;
}

export default function ChangeHistoryPage() {
  const { currentApp, apps } = useApp();
  const appData = apps.find((a) => a.name === currentApp);
  const [history, setHistory] = useState<ChangeSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [rollbackId, setRollbackId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function fetchHistory() {
    try {
      const res = await fetch(`/api/proxy/_x_/apps/${currentApp}/changes/history`);
      const data = await res.json();
      if (data.success) setHistory(data.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (currentApp) fetchHistory();
  }, [currentApp]);

  async function handleRollback(id: string) {
    setError('');
    try {
      const res = await fetch(`/api/proxy/_y_/apps/${currentApp}/changes/${id}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        setRollbackId(null);
        fetchHistory();
      } else {
        setError(data.message || 'Rollback failed');
      }
    } catch {
      setError('Rollback request failed');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/config"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to config
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Change History</h1>
          {appData && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-primary/15 text-primary">
              {appData.displayName || currentApp}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">Applied configuration change sets with rollback</p>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-lg border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">Loading history...</p>
        </div>
      ) : history.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">No change history yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {history.map((cs) => (
            <div key={cs.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className={cn(
                    'text-[10px] font-bold px-1.5 py-0.5 rounded uppercase',
                    cs.status === 'applied' ? 'bg-emerald-500/20 text-emerald-400' :
                    cs.status === 'rolled_back' ? 'bg-zinc-500/20 text-zinc-400' :
                    'bg-blue-500/20 text-blue-400'
                  )}>
                    {cs.status.replace('_', ' ')}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(cs.createdAt).toLocaleString()}
                  </span>
                  {cs.appliedBy && (
                    <span className="text-[10px] text-muted-foreground font-mono">{cs.appliedBy}</span>
                  )}
                </div>
                {cs.status === 'applied' && (
                  rollbackId === cs.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-amber-400">Confirm rollback?</span>
                      <button
                        onClick={() => handleRollback(cs.id)}
                        className="text-[10px] text-red-400 hover:text-red-300 font-medium"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setRollbackId(null)}
                        className="text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setRollbackId(cs.id)}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Rollback
                    </button>
                  )
                )}
              </div>
              <div className="space-y-1">
                {cs.changes.slice(0, 5).map((c, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    <span className="font-mono text-foreground">{c.target}</span>
                    {c.description && ` — ${c.description}`}
                  </p>
                ))}
                {cs.changes.length > 5 && (
                  <p className="text-[10px] text-muted-foreground">
                    ...and {cs.changes.length - 5} more change(s)
                  </p>
                )}
              </div>
              <p className="text-[9px] text-muted-foreground mt-2 font-mono">{cs.id}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
