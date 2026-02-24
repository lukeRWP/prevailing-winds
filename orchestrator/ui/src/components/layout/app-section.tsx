'use client';

import type { ReactNode } from 'react';
import type { AppSummary } from '@/lib/app-context';

interface AppSectionProps {
  app: AppSummary;
  children: ReactNode;
}

export function AppSection({ app, children }: AppSectionProps) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/20 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/40 bg-accent/10">
        <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-primary/15 text-primary">
          {app.displayName || app.name}
        </span>
        {app.repo && (
          <span className="text-[10px] text-muted-foreground font-mono truncate hidden md:inline">
            {app.repo}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
          {app.environments.length} env{app.environments.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  );
}
