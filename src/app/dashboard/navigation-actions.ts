'use server';

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getCurrentMembership } from '@/lib/auth';
import { NavigationPreferences } from '@/lib/navigation/types';

export async function saveNavigationPreferencesAction(preferences: NavigationPreferences) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  const membership = await getCurrentMembership(user.id);
  if (!membership.accountId) {
    throw new Error('No active account');
  }

  const adminClient = await createSupabaseServerClient(); // Wait, createSupabaseServerClient creates a client with RLS.
  // Because row-level security is enabled and allows insert/update for own active memberships,
  // we can use the regular authenticated client instead of admin.

  const { error } = await supabase
    .from('navigation_preferences')
    .upsert(
      {
        account_id: membership.accountId,
        user_id: user.id,
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
