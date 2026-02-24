'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Network,
  Globe,
  Activity,
  FileText,
  BarChart3,
  Zap,
  GitBranch,
  Settings,
  Boxes,
  KeyRound,
  BookOpen,
  LogOut,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApp } from '@/hooks/use-app';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/topology', label: 'Topology', icon: Network },
  { href: '/environments', label: 'Environments', icon: Globe },
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

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
}

export function MobileNav({ open, onClose }: MobileNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentApp, apps } = useApp();
  const appData = apps.find((a) => a.name === currentApp);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
    onClose();
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 md:hidden"
        onClick={onClose}
      />

      {/* Drawer */}
      <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-border flex flex-col md:hidden animate-in slide-in-from-left duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
              PW
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-foreground">
                Prevailing Winds
              </span>
              {appData && (
                <span className="text-[10px] text-muted-foreground">
                  {appData.displayName || currentApp}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
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
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-border p-2">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-foreground transition-colors w-full"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}
