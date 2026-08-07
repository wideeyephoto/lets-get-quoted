import type { SupabaseClient } from '@supabase/supabase-js';

// Staff annotations on an account: free-text notes and short categorization
// tags. Both small enough, and both edited from the same account-profile
// panel, to live in one module rather than two near-empty files. Distinct
// from clients.notes, which is a single owner-authored field on a customer
// record, not a staff log.

export type AccountNote = {
  id: string;
  account_id: string;
  body: string;
  created_by: string;
  created_at: string;
};

export async function listAccountNotes(admin: SupabaseClient, accountId: string): Promise<AccountNote[]> {
  const { data, error } = await admin
    .from('account_notes')
    .select('id, account_id, body, created_by, created_at')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('listAccountNotes failed:', error);
    return [];
  }
  return (data ?? []) as AccountNote[];
}

export async function addAccountNote(admin: SupabaseClient, accountId: string, createdBy: string, body: string): Promise<void> {
  const { error } = await admin.from('account_notes').insert({ account_id: accountId, body, created_by: createdBy });
  if (error) console.error('addAccountNote failed:', error);
}

export type AccountTag = {
  id: string;
  account_id: string;
  tag: string;
  created_by: string;
  created_at: string;
};

export async function listAccountTags(admin: SupabaseClient, accountId: string): Promise<AccountTag[]> {
  const { data, error } = await admin
    .from('account_tags')
    .select('id, account_id, tag, created_by, created_at')
    .eq('account_id', accountId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('listAccountTags failed:', error);
    return [];
  }
  return (data ?? []) as AccountTag[];
}

// A duplicate tag (unique(account_id, tag)) is a no-op, not an error — the
// staff member asking to add a tag that's already there should just see it
// still there, not a failed-save banner.
export async function addAccountTag(admin: SupabaseClient, accountId: string, createdBy: string, tag: string): Promise<void> {
  const cleaned = tag.trim().toLowerCase().slice(0, 40);
  if (!cleaned) return;
  const { error } = await admin.from('account_tags').insert({ account_id: accountId, tag: cleaned, created_by: createdBy });
  if (error && !error.message.toLowerCase().includes('duplicate')) console.error('addAccountTag failed:', error);
}

export async function removeAccountTag(admin: SupabaseClient, accountId: string, tagId: string): Promise<void> {
  const { error } = await admin.from('account_tags').delete().eq('id', tagId).eq('account_id', accountId);
  if (error) console.error('removeAccountTag failed:', error);
}
