'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Menu, ChevronDown } from 'lucide-react';
import { useApp } from '@/hooks/use-app';
import { useChanges } from '@/lib/changes-context';

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
  '/config': 'Config',
};

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const pathname = usePathname();
  const { currentApp, setCurrentApp, apps, role, loading } = useApp();
  const { hasPendingChanges, pendingChanges } = useChanges();

  const segments = pathname.split('/').filter(Boolean);
  const title =
    segments.length === 0
      ? 'Dashboard'
      : BREADCRUMB_MAP[`/${segments[0]}`] || segments[0];

  const currentAppData = apps.find((a) => a.name === currentApp);
  const appDisplayName = currentAppData?.displayName || currentApp;
  const showSelector = role === 'admin' && apps.length > 1;

  return (
    <header className="flex items-center gap-4 border-b border-border bg-background px-4 py-3 md:px-6">
      <button
        onClick={onMenuClick}
        className="md:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex items-center gap-2 text-sm flex-1">
        <span className="text-muted-foreground">PW</span>
        <span className="text-muted-foreground">/</span>

        {/* App selector or static name */}
        {loading ? (
          <span className="text-muted-foreground">...</span>
        ) : showSelector ? (
          <div className="relative">
            <select
              value={currentApp}
              onChange={(e) => setCurrentApp(e.target.value)}
              className="appearance-none bg-transparent pr-5 font-medium text-foreground cursor-pointer hover:text-primary transition-colors focus:outline-none text-sm"
            >
              {apps.map((app) => (
                <option key={app.name} value={app.name}>
                  {app.displayName || app.name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
          </div>
        ) : (
          <span className="font-medium text-foreground">{appDisplayName}</span>
        )}

        {segments.length > 0 && (
          <>
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
        )}
      </div>

      {/* Pending changes badge */}
      {hasPendingChanges && (
        <Link
          href="/config"
          className="flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-400 hover:bg-amber-500/20 transition-colors shrink-0"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
          {pendingChanges.length} pending
        </Link>
      )}
    </header>
  );
}
