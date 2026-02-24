'use client';

import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react';

export interface AppSummary {
  name: string;
  displayName: string;
  repo: string;
  infraPath: string;
  environments: string[];
}

export interface AppContextType {
  currentApp: string;
  setCurrentApp: (app: string) => void;
  apps: AppSummary[];
  role: 'admin' | 'app';
  environments: string[];
  loading: boolean;
  refreshApps: () => Promise<void>;
}

export const AppContext = createContext<AppContextType | null>(null);

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string, days = 365) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Strict`;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [currentApp, setCurrentAppState] = useState('');
  const [role, setRole] = useState<'admin' | 'app'>('app');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      try {
        const res = await fetch('/api/proxy/_x_/auth/whoami');
        const data = await res.json();
        if (!data.success || !data.data) return;

        const { role: authRole, authorizedApp, availableApps } = data.data;
        setRole(authRole);
        setApps(availableApps || []);

        // Determine initial app selection
        let selected = '';
        if (authRole === 'app' && authorizedApp) {
          // App-scoped token — always use authorized app
          selected = authorizedApp;
        } else if (availableApps?.length > 0) {
          // Admin — try cookie, fall back to first app
          const saved = getCookie('pw_app');
          const validSaved = saved && availableApps.some((a: AppSummary) => a.name === saved);
          selected = validSaved ? saved! : availableApps[0].name;
        }

        setCurrentAppState(selected);
        if (selected) setCookie('pw_app', selected);
      } catch {
        // Auth failed — likely redirected to login
      } finally {
        setLoading(false);
      }
    }

    init();
  }, []);

  const setCurrentApp = useCallback((app: string) => {
    setCurrentAppState(app);
    setCookie('pw_app', app);
  }, []);

  const refreshApps = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/_x_/auth/whoami');
      const data = await res.json();
      if (!data.success || !data.data) return;

      const { availableApps } = data.data;
      setApps(availableApps || []);

      // If current app was deleted, switch to first available
      if (currentApp && availableApps?.length > 0) {
        const stillExists = availableApps.some((a: AppSummary) => a.name === currentApp);
        if (!stillExists) {
          const newApp = availableApps[0].name;
          setCurrentAppState(newApp);
          setCookie('pw_app', newApp);
        }
      }
    } catch {
      // silent
    }
  }, [currentApp]);

  const currentAppData = apps.find((a) => a.name === currentApp);
  const environments = currentAppData?.environments || [];

  return (
    <AppContext.Provider value={{ currentApp, setCurrentApp, apps, role, environments, loading, refreshApps }}>
      {children}
    </AppContext.Provider>
  );
}
