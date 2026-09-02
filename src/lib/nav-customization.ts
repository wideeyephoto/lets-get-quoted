'use client';

import { useCallback, useEffect, useState } from 'react';

export const NAV_LOGO_POSITION_STORAGE_KEY = 'lgq_nav_logo_position';
export const NAV_LOGO_POSITION_COOKIE = 'lgq_nav_logo_position';
export const NAV_CUSTOMIZATION_EVENT = 'lgq-nav-customization-change';

export type NavLogoPosition = 'contractor_top' | 'standard';

export function parseNavLogoPosition(value: unknown): NavLogoPosition {
  if (value === 'contractor_top' || value === 'top' || value === true || value === 'true' || value === '1') {
    return 'contractor_top';
  }
  return 'standard';
}

export function isContractorLogoTop(position: NavLogoPosition): boolean {
  return position === 'contractor_top';
}

export function readStoredNavLogoPosition(): NavLogoPosition {
  if (typeof window === 'undefined') return 'standard';
  try {
    const fromStorage = window.localStorage.getItem(NAV_LOGO_POSITION_STORAGE_KEY);
    if (fromStorage !== null) {
      return parseNavLogoPosition(fromStorage);
    }
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${NAV_LOGO_POSITION_COOKIE}=([^;]*)`));
    if (match) {
      return parseNavLogoPosition(decodeURIComponent(match[1]));
    }
  } catch {
    // Ignore storage access errors in sandboxed environments
  }
  return 'standard';
}

export function writeStoredNavLogoPosition(position: NavLogoPosition): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(NAV_LOGO_POSITION_STORAGE_KEY, position);
    // Set cookie valid for 1 year
    document.cookie = `${NAV_LOGO_POSITION_COOKIE}=${encodeURIComponent(position)}; path=/; max-age=31536000; SameSite=Lax`;
    window.dispatchEvent(new CustomEvent(NAV_CUSTOMIZATION_EVENT, { detail: { position } }));
  } catch {
    // Ignore storage access errors
  }
}

export function useNavCustomization(serverDefault = false) {
  const [position, setPositionState] = useState<NavLogoPosition>(() => {
    if (typeof window !== 'undefined') {
      return readStoredNavLogoPosition();
    }
    return serverDefault ? 'contractor_top' : 'standard';
  });

  const sync = useCallback(() => {
    setPositionState(readStoredNavLogoPosition());
  }, []);

  useEffect(() => {
    sync();

    const onCustomEvent = (event: Event) => {
      const custom = event as CustomEvent<{ position?: NavLogoPosition }>;
      if (custom.detail?.position) {
        setPositionState(custom.detail.position);
      } else {
        sync();
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === NAV_LOGO_POSITION_STORAGE_KEY) {
        sync();
      }
    };

    window.addEventListener(NAV_CUSTOMIZATION_EVENT, onCustomEvent);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(NAV_CUSTOMIZATION_EVENT, onCustomEvent);
      window.removeEventListener('storage', onStorage);
    };
  }, [sync]);

  const setContractorLogoTop = useCallback((enabled: boolean) => {
    const nextPos: NavLogoPosition = enabled ? 'contractor_top' : 'standard';
    setPositionState(nextPos);
    writeStoredNavLogoPosition(nextPos);
  }, []);

  return {
    contractorLogoTop: isContractorLogoTop(position),
    position,
    setContractorLogoTop,
  };
}
