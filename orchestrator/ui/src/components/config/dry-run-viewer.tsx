'use client';

import { useMemo } from 'react';

interface DryRunViewerProps {
  before: string;
  after: string;
}

/**
 * Shows a side-by-side or unified diff view of manifest YAML changes.
 * Highlights added (green), removed (red), and unchanged (dimmed) lines.
 */
export function DryRunViewer({ before, after }: DryRunViewerProps) {
  const diff = useMemo(() => computeDiff(before, after), [before, after]);

  if (diff.length === 0) {
    return (
      <div className="rounded-md border border-border bg-zinc-950 p-4 text-center">
        <p className="text-xs text-muted-foreground">No changes detected.</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-zinc-950 overflow-hidden">
      <div className="px-3 py-1.5 border-b border-zinc-800 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground font-mono">manifest diff</span>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="text-emerald-400">+{diff.filter((l) => l.type === 'add').length}</span>
          <span className="text-red-400">-{diff.filter((l) => l.type === 'remove').length}</span>
        </div>
      </div>
      <div className="overflow-x-auto max-h-96 overflow-y-auto">
        <pre className="text-[10px] leading-relaxed">
          {diff.map((line, i) => (
            <div
              key={i}
              className={
                line.type === 'add' ? 'bg-emerald-500/10 text-emerald-300' :
                line.type === 'remove' ? 'bg-red-500/10 text-red-300' :
                'text-zinc-500'
              }
            >
              <span className="inline-block w-5 text-right mr-2 select-none opacity-50">
                {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
              </span>
              {line.content}
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}

interface DiffLine {
  type: 'add' | 'remove' | 'same';
  content: string;
}

/**
 * Simple line-by-line diff computation.
 * For real production use, consider a proper diff algorithm.
 */
function computeDiff(before: string, after: string): DiffLine[] {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  const result: DiffLine[] = [];

  const beforeSet = new Set(beforeLines);
  const afterSet = new Set(afterLines);

  // Simple approach: find lines unique to before (removed) and after (added)
  let bi = 0;
  let ai = 0;

  while (bi < beforeLines.length || ai < afterLines.length) {
    if (bi < beforeLines.length && ai < afterLines.length && beforeLines[bi] === afterLines[ai]) {
      result.push({ type: 'same', content: beforeLines[bi] });
      bi++;
      ai++;
    } else if (bi < beforeLines.length && !afterSet.has(beforeLines[bi])) {
      result.push({ type: 'remove', content: beforeLines[bi] });
      bi++;
    } else if (ai < afterLines.length && !beforeSet.has(afterLines[ai])) {
      result.push({ type: 'add', content: afterLines[ai] });
      ai++;
    } else {
      // Lines differ but exist in both — treat as remove + add
      if (bi < beforeLines.length) {
        result.push({ type: 'remove', content: beforeLines[bi] });
        bi++;
      }
      if (ai < afterLines.length) {
        result.push({ type: 'add', content: afterLines[ai] });
        ai++;
      }
    }
  }

  return result;
}
