'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

type AppShellContextValue = {
  isNavOpen: boolean;
  closeNav: () => void;
  toggleNav: () => void;
};

const AppShellContext = createContext<AppShellContextValue | null>(null);

export function AppShellProvider({ children }: { children: ReactNode }) {
  const [isNavOpen, setIsNavOpen] = useState(false);

  const value = useMemo<AppShellContextValue>(
    () => ({
      isNavOpen,
      closeNav: () => setIsNavOpen(false),
      toggleNav: () => setIsNavOpen((open) => !open),
    }),
    [isNavOpen],
  );

  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}

export function useAppShell() {
  const context = useContext(AppShellContext);

  if (!context) {
    throw new Error('useAppShell must be used within AppShellProvider');
  }

  return context;
}