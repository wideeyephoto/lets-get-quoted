import type { SupabaseClient } from '@supabase/supabase-js';

// Keep owner lookup independent of the admin console's payment/mail imports.
export async function ownerEmailsForAccounts(admin: SupabaseClient, ids: string[], onError?: (context: string, error: unknown) => void): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!ids.length) return map;
  const { data, error } = await admin.rpc('owner_emails_for_accounts', { ids });
  if (error) {
    console.error('ownerEmailsForAccounts failed:', error);
    onError?.('owner email hydration', error);
    return map;
  }
  for (const row of (data ?? []) as { account_id: string; email: string | null }[]) {
    if (row.email) map.set(row.account_id, row.email);
  }
  return map;
}
