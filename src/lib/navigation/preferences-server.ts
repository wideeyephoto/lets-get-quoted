import { SupabaseClient } from '@supabase/supabase-js';
import { NavigationPreferences, NavView } from './types';
import { CATALOG_ITEMS } from './catalog';

export interface PreferencesRow {
  account_id: string;
  user_id: string;
  schema_version: number;
  catalog_version: string;
  selected_view: NavView;
  favorite_ids: string[];
  custom_layout: NavigationPreferences['customLayout'];
  revision: number;
}

export async function getNavigationPreferences(
  admin: SupabaseClient,
  accountId: string,
  userId: string
): Promise<{ preferences: NavigationPreferences | null; revision: number; exists: boolean }> {
  const { data, error } = await admin
    .from('navigation_preferences')
    .select('selected_view, favorite_ids, custom_layout, revision')
    .eq('account_id', accountId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Failed to load navigation preferences', error);
    return { preferences: null, revision: 0, exists: false };
  }

  if (!data) {
    return { preferences: null, revision: 0, exists: false };
  }

  return {
    preferences: {
      selectedView: data.selected_view as NavView,
      favoriteIds: data.favorite_ids,
      customLayout: data.custom_layout,
    },
    revision: data.revision,
    exists: true,
  };
}

export function getEligibleNavIds(isOwner: boolean, capabilities: ReadonlySet<string>): string[] {
  const context = { isOwner, capabilities: capabilities as Set<string> };
  return CATALOG_ITEMS
    .filter(item => !item.isEligible || item.isEligible(context))
    .map(item => item.id);
}
