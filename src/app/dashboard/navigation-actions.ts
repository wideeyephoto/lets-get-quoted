'use server';

import { requireDashboardShellContext } from '@/lib/auth';
import { NavigationPreferences } from '@/lib/navigation/types';

export async function saveNavigationPreferencesAction(preferences: NavigationPreferences) {
  const { supabase, accountId, userId } = await requireDashboardShellContext();

  const { error } = await supabase
    .from('navigation_preferences')
    .upsert(
      {
        account_id: accountId,
        user_id: userId,
        selected_view: preferences.selectedView,
        favorite_ids: preferences.favoriteIds,
        custom_layout: preferences.customLayout,
        revision: 1, // Will be incremented by the client optimistic UI if we wanted, or we just rely on updated_at
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_id, user_id' }
    );

  if (error) {
    console.error('Failed to save navigation preferences', error);
    throw new Error('Failed to save preferences');
  }

  return { success: true };
}
