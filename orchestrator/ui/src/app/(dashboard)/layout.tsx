'use client';

import { useState } from 'react';
import { AppProvider } from '@/lib/app-context';
import { ChangesProvider } from '@/lib/changes-context';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { MobileNav } from '@/components/layout/mobile-nav';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <AppProvider>
      <ChangesProvider>
        <div className="flex h-screen overflow-hidden bg-background">
          <Sidebar />
          <MobileNav open={mobileOpen} onClose={() => setMobileOpen(false)} />

          <div className="flex flex-1 flex-col overflow-hidden">
            <Header onMenuClick={() => setMobileOpen(true)} />
            <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
          </div>
        </div>
      </ChangesProvider>
    </AppProvider>
  );
}
