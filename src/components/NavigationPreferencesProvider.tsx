'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { NavigationPreferences, NavView, NavigationCatalog } from '@/lib/navigation/types';
import { CATALOG_GROUPS, CATALOG_ITEMS } from '@/lib/navigation/catalog';
import { getPresetCatalog } from '@/lib/navigation/presets';
import { saveNavigationPreferencesAction } from '@/app/dashboard/navigation-actions';

interface NavigationContextValue {
  preferences: NavigationPreferences;
  eligibleNavIds: string[];
  catalog: NavigationCatalog;
  updatePreferences: (updater: (prev: NavigationPreferences) => NavigationPreferences) => Promise<void>;
  isLoading: boolean;
}

const defaultPreferences: NavigationPreferences = {
  selectedView: 'balanced',
  favoriteIds: [],
  customLayout: null,
};

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationPreferencesProvider({
  children,
  accountStatus,
}: {
  children: React.ReactNode;
  accountStatus: any;
}) {
  const [preferences, setPreferences] = useState<NavigationPreferences>(
    accountStatus?.navPreferences ?? defaultPreferences
  );

  useEffect(() => {
    if (accountStatus?.navPreferences) {
      setPreferences(accountStatus.navPreferences);
    }
  }, [accountStatus?.navPreferences]);

  const updatePreferences = useCallback(async (updater: (prev: NavigationPreferences) => NavigationPreferences) => {
    setPreferences(prev => {
      const next = updater(prev);
      saveNavigationPreferencesAction(next).catch(err => {
        console.error('Failed to sync nav preferences:', err);
        // We could revert here in a real implementation, but fire-and-forget is fine for now
      });
      return next;
    });
  }, []);

  // Filter catalog based on eligibility
  const eligibleIds = new Set(accountStatus?.eligibleNavIds ?? []);
  
  const eligibleItems = CATALOG_ITEMS.filter(item => eligibleIds.has(item.id));
  
  const catalog = getPresetCatalog(preferences, {
    groups: CATALOG_GROUPS,
    items: eligibleItems
  });

  return (
    <NavigationContext.Provider value={{
      preferences,
      eligibleNavIds: accountStatus?.eligibleNavIds ?? [],
      catalog,
      updatePreferences,
      isLoading: !accountStatus
    }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigationPreferences() {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    throw new Error('useNavigationPreferences must be used within NavigationPreferencesProvider');
  }
  return ctx;
}
