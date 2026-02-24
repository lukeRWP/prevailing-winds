'use client';

import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

const BREADCRUMB_MAP: Record<string, string> = {
  '/': 'Dashboard',
  '/topology': 'Topology',
  '/environments': 'Environments',
  '/operations': 'Operations',
  '/networking': 'Networking',
  '/cicd': 'CI/CD',
  '/logs': 'Logs',
  '/metrics': 'Metrics',
  '/actions': 'Actions',
};

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const pathname = usePathname();

  const segments = pathname.split('/').filter(Boolean);
  const title =
    segments.length === 0
      ? 'Dashboard'
      : BREADCRUMB_MAP[`/${segments[0]}`] || segments[0];

  return (
    <header className="flex items-center gap-4 border-b border-border bg-background px-4 py-3 md:px-6">
      <button
        onClick={onMenuClick}
        className="md:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex items-center gap-2 text-sm">
        {segments.length > 0 ? (
          <>
            <span className="text-muted-foreground">PW</span>
            <span className="text-muted-foreground">/</span>
            <span className="font-medium text-foreground">{title}</span>
            {segments.length > 1 && (
              <>
                <span className="text-muted-foreground">/</span>
                <span className="font-medium text-foreground">
                  {segments.slice(1).join(' / ')}
                </span>
              </>
            )}
          </>
        ) : (
          <span className="font-medium text-foreground">Dashboard</span>
        )}
      </div>
    </header>
  );
}
