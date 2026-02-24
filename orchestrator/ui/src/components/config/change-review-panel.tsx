'use client';

import { useState } from 'react';
import { X, Play, Eye, Trash2, AlertTriangle, Check } from 'lucide-react';
import { useChanges, type Change, type Warning } from '@/lib/changes-context';
import { useApp } from '@/hooks/use-app';
import { DryRunViewer } from '@/components/config/dry-run-viewer';
import { cn } from '@/lib/utils';

interface ChangeReviewPanelProps {
  open: boolean;
  onClose: () => void;
}

export function ChangeReviewPanel({ open, onClose }: ChangeReviewPanelProps) {
  const { currentApp } = useApp();
  const {
    pendingChanges, planResult, applyResult, loading,
    removeChange, clearChanges, planChanges, applyChanges,
  } = useChanges();
  const [error, setError] = useState('');

  if (!open) return null;

  async function handlePlan() {
    setError('');
    try {
      await planChanges(currentApp);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Plan failed');
    }
  }

  async function handleApply(dryRun: boolean) {
    if (!planResult) return;
    setError('');
    try {
      await applyChanges(currentApp, planResult.changes, dryRun);
      if (!dryRun) {
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed');
    }
  }

  const riskColors: Record<string, string> = {
    low: 'text-emerald-400',
    medium: 'text-amber-400',
    high: 'text-red-400',
  };

  const methodLabels: Record<string, string> = {
    manifest: 'Manifest',
    terraform: 'Terraform',
    'proxmox-api': 'Proxmox API',
    ansible: 'Ansible',
    dns: 'DNS',
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />

      {/* Panel */}
      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-background border-l border-border flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">
            Change Review ({pendingChanges.length} pending)
          </h2>
          <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Pending Changes */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground mb-2 uppercase">Proposed Changes</h3>
            {pendingChanges.length === 0 ? (
              <p className="text-xs text-muted-foreground">No pending changes.</p>
            ) : (
              <div className="space-y-2">
                {pendingChanges.map((c) => (
                  <div key={c.target} className="flex items-start justify-between rounded-md border border-border bg-card p-2.5">
                    <div className="min-w-0">
                      <p className="text-xs font-mono text-foreground truncate">{c.target}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {c.previous !== undefined ? `${JSON.stringify(c.previous)} → ` : ''}
                        {JSON.stringify(c.value)}
                      </p>
                    </div>
                    <button
                      onClick={() => removeChange(c.target)}
                      className="p-1 text-muted-foreground hover:text-red-400 shrink-0"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Plan Result */}
          {planResult && (
            <>
              {/* Warnings */}
              {planResult.warnings.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-amber-400 mb-2 uppercase flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Warnings ({planResult.warnings.length})
                  </h3>
                  <div className="space-y-1">
                    {planResult.warnings.map((w: Warning, i: number) => (
                      <div key={i} className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[10px] text-amber-300">
                        <span className="font-bold uppercase">{w.type}:</span> {w.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* All Changes (user + suggested) */}
              <div>
                <h3 className="text-xs font-medium text-muted-foreground mb-2 uppercase">
                  Full Change Plan ({planResult.changes.length} changes)
                </h3>
                <div className="space-y-2">
                  {planResult.changes.map((c: Change) => (
                    <div
                      key={c.id}
                      className={cn(
                        'rounded-md border p-2.5',
                        c.source === 'suggested' ? 'border-blue-500/30 bg-blue-500/5' : 'border-border bg-card'
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {c.source === 'suggested' && (
                          <span className="text-[9px] bg-blue-500/20 text-blue-400 px-1 py-0.5 rounded uppercase">suggested</span>
                        )}
                        <span className={cn('text-[9px] uppercase font-bold', riskColors[c.risk] || 'text-muted-foreground')}>
                          {c.risk}
                        </span>
                        <span className="text-[9px] text-muted-foreground">
                          {methodLabels[c.executionMethod] || c.executionMethod}
                        </span>
                      </div>
                      <p className="text-xs text-foreground">{c.description}</p>
                      <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{c.target}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Apply Result (dry run) */}
          {applyResult?.dryRun && applyResult.manifestBefore && applyResult.manifestAfter && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground mb-2 uppercase">Dry Run — Manifest Diff</h3>
              <DryRunViewer before={applyResult.manifestBefore} after={applyResult.manifestAfter} />
            </div>
          )}

          {/* Apply Result (applied) */}
          {applyResult && !applyResult.dryRun && applyResult.changeSetId && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
              <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                <Check className="h-3.5 w-3.5" />
                Applied {applyResult.changesApplied} change(s)
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                Change set: {applyResult.changeSetId}
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-border p-4 space-y-2">
          {!planResult && pendingChanges.length > 0 && (
            <button
              onClick={handlePlan}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <Eye className="h-4 w-4" />
              {loading ? 'Computing...' : 'Preview Changes'}
            </button>
          )}

          {planResult && (
            <div className="flex gap-2">
              {planResult.dryRunAvailable && (
                <button
                  onClick={() => handleApply(true)}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                >
                  <Eye className="h-4 w-4" />
                  {loading ? 'Running...' : 'Dry Run'}
                </button>
              )}
              <button
                onClick={() => handleApply(false)}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                {loading ? 'Applying...' : 'Apply All'}
              </button>
            </div>
          )}

          {pendingChanges.length > 0 && (
            <button
              onClick={clearChanges}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              Clear all changes
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
