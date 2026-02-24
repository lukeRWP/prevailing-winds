'use client';

import { useState } from 'react';
import { AlertTriangle, Trash2, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

type Severity = 'normal' | 'warning' | 'danger';

const SEVERITY_CONFIG: Record<Severity, { icon: React.ElementType; border: string; bg: string; button: string }> = {
  normal: {
    icon: Zap,
    border: 'border-blue-500/30',
    bg: 'bg-blue-500/10',
    button: 'bg-primary text-primary-foreground hover:opacity-90',
  },
  warning: {
    icon: AlertTriangle,
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/10',
    button: 'bg-amber-600 text-white hover:bg-amber-700',
  },
  danger: {
    icon: Trash2,
    border: 'border-red-500/30',
    bg: 'bg-red-500/10',
    button: 'bg-red-600 text-white hover:bg-red-700',
  },
};

interface ConfirmationDialogProps {
  open: boolean;
  title: string;
  description: string;
  severity: Severity;
  confirmText?: string;
  requireTyping?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function ConfirmationDialog({
  open,
  title,
  description,
  severity,
  confirmText = 'Confirm',
  requireTyping,
  onConfirm,
  onCancel,
  loading,
}: ConfirmationDialogProps) {
  const [typed, setTyped] = useState('');

  if (!open) return null;

  const config = SEVERITY_CONFIG[severity];
  const Icon = config.icon;
  const canConfirm = !requireTyping || typed === requireTyping;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60" onClick={onCancel} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className={cn('w-full max-w-md rounded-lg border bg-card p-6 shadow-xl', config.border)}>
          <div className="flex items-center gap-3 mb-4">
            <div className={cn('rounded-full p-2', config.bg)}>
              <Icon className="h-5 w-5 text-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground">{title}</h3>
          </div>

          <p className="text-sm text-muted-foreground mb-4">{description}</p>

          {requireTyping && (
            <div className="mb-4">
              <p className="text-xs text-muted-foreground mb-2">
                Type <span className="font-mono font-bold text-foreground">{requireTyping}</span> to confirm:
              </p>
              <input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder={requireTyping}
              />
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              onClick={onCancel}
              className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onConfirm();
                setTyped('');
              }}
              disabled={!canConfirm || loading}
              className={cn(
                'rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                config.button
              )}
            >
              {loading ? 'Processing...' : confirmText}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
