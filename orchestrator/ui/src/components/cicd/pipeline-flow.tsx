'use client';

import { cn } from '@/lib/utils';
import { CheckCircle2, Circle, Loader2, XCircle, ArrowRight } from 'lucide-react';

export interface PipelineStep {
  name: string;
  status: 'success' | 'failed' | 'running' | 'pending' | 'skipped';
  duration?: string;
}

const STATUS_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  success: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
  failed: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30' },
  running: { icon: Loader2, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30' },
  pending: { icon: Circle, color: 'text-zinc-500', bg: 'bg-zinc-500/10 border-zinc-500/30' },
  skipped: { icon: Circle, color: 'text-zinc-600', bg: 'bg-zinc-800/50 border-zinc-700/30' },
};

interface PipelineFlowProps {
  steps: PipelineStep[];
  compact?: boolean;
}

export function PipelineFlow({ steps, compact }: PipelineFlowProps) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-2">
      {steps.map((step, i) => {
        const config = STATUS_CONFIG[step.status] || STATUS_CONFIG.pending;
        const Icon = config.icon;
        return (
          <div key={step.name} className="flex items-center gap-1 shrink-0">
            <div
              className={cn(
                'rounded-lg border px-3 py-2 flex items-center gap-2',
                config.bg,
                compact && 'px-2 py-1'
              )}
            >
              <Icon
                className={cn(
                  'h-3.5 w-3.5 shrink-0',
                  config.color,
                  step.status === 'running' && 'animate-spin'
                )}
              />
              <div>
                <p className={cn('text-xs font-medium text-foreground', compact && 'text-[10px]')}>
                  {step.name}
                </p>
                {step.duration && (
                  <p className="text-[10px] text-muted-foreground">{step.duration}</p>
                )}
              </div>
            </div>
            {i < steps.length - 1 && (
              <ArrowRight className="h-3 w-3 text-zinc-600 shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}
