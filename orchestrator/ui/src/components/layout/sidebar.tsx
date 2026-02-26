'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  LayoutDashboard,
  Network,
  Globe,
  Database,
  Activity,
  FileText,
  BarChart3,
  Zap,
  GitBranch,
  Settings,
  Boxes,
  KeyRound,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { useApp } from '@/hooks/use-app';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/topology', label: 'Topology', icon: Network },
  { href: '/environments', label: 'Environments', icon: Globe },
  { href: '/databases', label: 'Databases', icon: Database },
  { href: '/operations', label: 'Operations', icon: Activity },
  { href: '/networking', label: 'Networking', icon: Network },
  { href: '/cicd', label: 'CI/CD', icon: GitBranch },
  { href: '/logs', label: 'Logs', icon: FileText },
  { href: '/metrics', label: 'Metrics', icon: BarChart3 },
  { href: '/actions', label: 'Actions', icon: Zap },
  { href: '/apps', label: 'Apps', icon: Boxes },
  { href: '/secrets', label: 'Secrets', icon: KeyRound },
  { href: '/config', label: 'Config', icon: Settings },
  { href: '/docs', label: 'Docs', icon: BookOpen },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { currentApp, apps } = useApp();
  const appData = apps.find((a) => a.name === currentApp);

  function handleLogout() {
    signOut({ callbackUrl: '/login' });
  }

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col border-r border-border bg-sidebar transition-all duration-200',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-4 border-b border-border">
        <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
          PW
        </div>
        {!collapsed && (
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-foreground truncate">
              Prevailing Winds
            </span>
            {appData && (
              <span className="text-[10px] text-muted-foreground truncate">
                {appData.displayName || currentApp}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 space-y-0.5 px-2 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-2 space-y-0.5">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-foreground transition-colors w-full"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-foreground transition-colors w-full"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 shrink-0" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4 shrink-0" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
