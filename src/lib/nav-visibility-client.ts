'use client';

import { useCallback, useEffect, useState } from 'react';

export const NAV_VISIBILITY_STORAGE_KEY = 'lgq_nav_visibility';
export const NAV_VISIBILITY_COOKIE = 'lgq_nav_visibility';
export const NAV_VISIBILITY_EVENT = 'lgq-nav-visibility-change';

export type NavVisibilityDecision = {
  visible: string[];
  demoted: string[];
  hiddenCount: number;
};

export function parseNavVisibilityDecision(value: unknown): NavVisibilityDecision | null {
  if (!value) return null;
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray(parsed.visible) &&
      Array.isArray(parsed.demoted) &&
      typeof parsed.hiddenCount === 'number'
    ) {
      return {
        visible: parsed.visible.map(String),
        demoted: parsed.demoted.map(String),
        hiddenCount: parsed.hiddenCount,
      };
    }
  } catch {
    // Ignore JSON parse errors
  }
  return null;
}

export function readStoredNavVisibility(): NavVisibilityDecision | null {
  if (typeof window === 'undefined') return null;
  try {
    const fromStorage = window.localStorage.getItem(NAV_VISIBILITY_STORAGE_KEY);
    if (fromStorage !== null) {
      const parsed = parseNavVisibilityDecision(fromStorage);
      if (parsed) return parsed;
    }
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${NAV_VISIBILITY_COOKIE}=([^;]*)`));
    if (match) {
      return parseNavVisibilityDecision(decodeURIComponent(match[1]));
    }
  } catch {
    // Sandboxed iframe or private browsing
  }
  return null;
}

export function writeStoredNavVisibility(decision: NavVisibilityDecision): void {
  if (typeof window === 'undefined') return;
  try {
    const json = JSON.stringify(decision);
    window.localStorage.setItem(NAV_VISIBILITY_STORAGE_KEY, json);
    // 30 days cookie
    document.cookie = `${NAV_VISIBILITY_COOKIE}=${encodeURIComponent(json)}; path=/; max-age=2592000; SameSite=Lax`;
    window.dispatchEvent(new CustomEvent(NAV_VISIBILITY_EVENT, { detail: { decision } }));
  } catch {
    // Ignore storage errors
  }
}

export function useNavVisibility(serverDefault: NavVisibilityDecision | null = null) {
  const [decision, setDecision] = useState<NavVisibilityDecision | null>(() => {
    if (typeof window !== 'undefined') {
      return readStoredNavVisibility() ?? serverDefault;
    }
    return serverDefault;
  });

  const sync = useCallback(() => {
    const stored = readStoredNavVisibility();
    if (stored) {
      setDecision(stored);
    }
  }, []);

  useEffect(() => {
    sync();

    const onCustomEvent = (event: Event) => {
      const custom = event as CustomEvent<{ decision?: NavVisibilityDecision }>;
      if (custom.detail?.decision) {
        setDecision(custom.detail.decision);
      } else {
        sync();
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === NAV_VISIBILITY_STORAGE_KEY) {
        sync();
      }
    };

    window.addEventListener(NAV_VISIBILITY_EVENT, onCustomEvent);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(NAV_VISIBILITY_EVENT, onCustomEvent);
      window.removeEventListener('storage', onStorage);
    };
  }, [sync]);

  return {
    nav: decision,
    setNav: writeStoredNavVisibility,
  };
}
