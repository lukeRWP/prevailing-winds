'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export interface ProposedChange {
  target: string;
  value: unknown;
  previous?: unknown;
}

export interface Change {
  id: string;
  source: 'user' | 'suggested';
  target: string;
  description: string;
  value: unknown;
  previous: unknown;
  executionMethod: string;
  risk: string;
}

export interface Warning {
  type: string;
  message: string;
}

export interface ChangePlan {
  changes: Change[];
  warnings: Warning[];
  dryRunAvailable: boolean;
}

export interface ApplyResult {
  dryRun?: boolean;
  changeSetId?: string;
  changesApplied: number;
  manifestBefore?: string;
  manifestAfter?: string;
}

interface ChangesContextType {
  pendingChanges: ProposedChange[];
  planResult: ChangePlan | null;
  applyResult: ApplyResult | null;
  loading: boolean;
  addChange: (change: ProposedChange) => void;
  removeChange: (target: string) => void;
  clearChanges: () => void;
  planChanges: (app: string) => Promise<ChangePlan>;
  applyChanges: (app: string, changes: Change[], dryRun: boolean) => Promise<ApplyResult>;
  hasPendingChanges: boolean;
}

const ChangesContext = createContext<ChangesContextType | null>(null);

export function ChangesProvider({ children }: { children: ReactNode }) {
  const [pendingChanges, setPendingChanges] = useState<ProposedChange[]>([]);
  const [planResult, setPlanResult] = useState<ChangePlan | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const [loading, setLoading] = useState(false);

  const addChange = useCallback((change: ProposedChange) => {
    setPendingChanges((prev) => {
      const filtered = prev.filter((c) => c.target !== change.target);
      return [...filtered, change];
    });
    // Clear stale plan/apply results when new changes are added
    setPlanResult(null);
    setApplyResult(null);
  }, []);

  const removeChange = useCallback((target: string) => {
    setPendingChanges((prev) => prev.filter((c) => c.target !== target));
  }, []);

  const clearChanges = useCallback(() => {
    setPendingChanges([]);
    setPlanResult(null);
    setApplyResult(null);
  }, []);

  const planChanges = useCallback(async (app: string): Promise<ChangePlan> => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/_y_/apps/${app}/changes/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes: pendingChanges }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Plan failed');
      setPlanResult(data.data);
      return data.data;
    } finally {
      setLoading(false);
    }
  }, [pendingChanges]);

  const applyChanges = useCallback(async (app: string, changes: Change[], dryRun: boolean): Promise<ApplyResult> => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/_y_/apps/${app}/changes/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes, dryRun }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Apply failed');
      const result = data.data as ApplyResult;
      setApplyResult(result);
      if (!dryRun) {
        // Clear pending changes after successful apply
        setPendingChanges([]);
        setPlanResult(null);
      }
      return result;
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <ChangesContext.Provider
      value={{
        pendingChanges,
        planResult,
        applyResult,
        loading,
        addChange,
        removeChange,
        clearChanges,
        planChanges,
        applyChanges,
        hasPendingChanges: pendingChanges.length > 0,
      }}
    >
      {children}
    </ChangesContext.Provider>
  );
}

export function useChanges() {
  const ctx = useContext(ChangesContext);
  if (!ctx) throw new Error('useChanges must be used inside ChangesProvider');
  return ctx;
}
