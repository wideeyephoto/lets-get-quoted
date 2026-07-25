import type { SupabaseClient } from '@supabase/supabase-js';

export type MessageTemplate = {
  id: string;
  account_id: string;
  title: string;
  body: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

// Saved canned replies for the two-way inbox. Defensive: an un-migrated DB
// degrades to an empty list rather than throwing.
export async function listMessageTemplates(supabase: SupabaseClient, accountId: string): Promise<MessageTemplate[]> {
  const { data, error } = await supabase
    .from('message_templates')
    .select('*')
    .eq('account_id', accountId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return [];
  return (data ?? []) as MessageTemplate[];
}

export async function createMessageTemplate(supabase: SupabaseClient, accountId: string, input: { title: string; body: string }): Promise<MessageTemplate> {
  const { data, error } = await supabase
    .from('message_templates')
    .insert({ account_id: accountId, title: input.title.trim(), body: input.body.trim() })
    .select('*')
    .single();
  if (error || !data) throw error ?? new Error('Unable to save the template.');
  return data as MessageTemplate;
}

export async function deleteMessageTemplate(supabase: SupabaseClient, accountId: string, templateId: string): Promise<void> {
  const { error } = await supabase.from('message_templates').delete().eq('account_id', accountId).eq('id', templateId);
  if (error) throw error;
}
