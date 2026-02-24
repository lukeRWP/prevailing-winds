'use client';

import { useContext } from 'react';
import { AppContext, type AppContextType } from '@/lib/app-context';

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return ctx;
}
