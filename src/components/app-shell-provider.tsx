'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type AppShellContextValue = {
  isNavOpen: boolean;
  closeNav: () => void;
  toggleNav: () => void;
};

const AppShellContext = createContext<AppShellContextValue | null>(null);

export function AppShellProvider({ children }: { children: ReactNode }) {
  const [isNavOpen, setIsNavOpen] = useState(false);

  // Stable identities — otherwise a new closeNav on every isNavOpen change
  // retriggers the "close nav on route change" effect in AppShell, which
  // instantly reclosed the menu the moment it opened (visible on narrow
  // widths, where the panel's visibility actually depends on isNavOpen).
  const closeNav = useCallback(() => setIsNavOpen(false), []);
  const toggleNav = useCallback(() => setIsNavOpen((open) => !open), []);

  const value = useMemo<AppShellContextValue>(
    () => ({ isNavOpen, closeNav, toggleNav }),
    [isNavOpen, closeNav, toggleNav],
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