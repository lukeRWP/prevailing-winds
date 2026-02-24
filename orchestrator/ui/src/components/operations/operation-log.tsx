'use client';

import { useEffect, useRef, useState } from 'react';
import { Copy, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConnectionState } from '@/hooks/use-event-source';

const CONNECTION_LABELS: Record<ConnectionState, { label: string; color: string }> = {
  connecting: { label: 'Connecting...', color: 'text-amber-400' },
  open: { label: 'Streaming', color: 'text-blue-400' },
  closed: { label: 'Complete', color: 'text-zinc-400' },
  error: { label: 'Disconnected', color: 'text-red-400' },
};

interface OperationLogProps {
  lines: string[];
  connectionState: ConnectionState;
  staticOutput?: string;
}

export function OperationLog({ lines, connectionState, staticOutput }: OperationLogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Combine static output with streamed lines
  const allLines = staticOutput
    ? [...staticOutput.split('\n'), ...lines]
    : lines;

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [allLines.length, autoScroll]);

  function handleScroll() {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(atBottom);
  }

  function copyLog() {
    navigator.clipboard.writeText(allLines.join('\n'));
  }

  const connInfo = CONNECTION_LABELS[connectionState];

  return (
    <div className="rounded-lg border border-border bg-zinc-950 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-zinc-900/50">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'h-2 w-2 rounded-full',
              connectionState === 'open'
                ? 'bg-blue-500 animate-pulse'
                : connectionState === 'connecting'
                  ? 'bg-amber-500 animate-pulse'
                  : connectionState === 'error'
                    ? 'bg-red-500'
                    : 'bg-zinc-500'
            )}
          />
          <span className={cn('text-[10px] font-medium', connInfo.color)}>
            {connInfo.label}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {allLines.length} lines
          </span>
        </div>
        <div className="flex items-center gap-1">
          {!autoScroll && (
            <button
              onClick={() => {
                setAutoScroll(true);
                containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: 'smooth' });
              }}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Scroll to bottom"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={copyLog}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Copy log"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Log content */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-3 max-h-[600px] min-h-[200px]"
      >
        <pre className="text-xs font-mono leading-relaxed">
          {allLines.length === 0 ? (
            <span className="text-muted-foreground">Waiting for output...</span>
          ) : (
            allLines.map((line, i) => (
              <div key={i} className="flex gap-3 hover:bg-zinc-800/50">
                <span className="text-zinc-600 select-none w-8 text-right shrink-0">
                  {i + 1}
                </span>
                <span
                  className={cn(
                    'whitespace-pre-wrap break-all',
                    line.includes('ERROR') || line.includes('error') || line.includes('FAILED')
                      ? 'text-red-400'
                      : line.includes('TASK') || line.includes('PLAY')
                        ? 'text-blue-400'
                        : line.includes('ok:') || line.includes('changed:')
                          ? 'text-emerald-400'
                          : line.includes('skipping:')
                            ? 'text-amber-400'
                            : 'text-zinc-300'
                  )}
                >
                  {line}
                </span>
              </div>
            ))
          )}
        </pre>
      </div>
    </div>
  );
}
