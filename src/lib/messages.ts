import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeUsPhone } from '@/lib/phone';

export type SmsDirection = 'inbound' | 'outbound';

export type SmsMessage = {
  id: string;
  account_id: string;
  phone_number: string;
  direction: SmsDirection;
  body: string;
  provider_id: string | null;
  created_at: string;
};

export type Conversation = {
  phone: string;
  name: string | null;
  lastBody: string;
  lastAt: string;
  lastDirection: SmsDirection;
};

// Shared Twilio number means an inbound text only carries the customer's number,
// not which contractor it's for. Attribute it to the account that most recently
// texted this number (its consent-ledger row), which is where the conversation
// they're replying to lives. Null when we've never messaged them.
export async function resolveAccountForPhone(admin: SupabaseClient, phone: string): Promise<string | null> {
  const { data } = await admin
    .from('sms_consent')
    .select('account_id, updated_at')
    .eq('phone_number', phone)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.account_id as string | undefined) ?? null;
}

export async function logInboundMessage(admin: SupabaseClient, input: { phone: string; body: string; providerId?: string | null }): Promise<void> {
  const accountId = await resolveAccountForPhone(admin, input.phone);
  if (!accountId) return; // unknown sender — nothing to thread it onto
  await admin.from('sms_messages').insert({
    account_id: accountId,
    phone_number: input.phone,
    direction: 'inbound',
    body: input.body,
    provider_id: input.providerId ?? null,
  });
}

export async function logOutboundMessage(
  supabase: SupabaseClient,
  accountId: string,
  phone: string,
  body: string,
  providerId?: string | null,
): Promise<void> {
  await supabase.from('sms_messages').insert({
    account_id: accountId,
    phone_number: phone,
    direction: 'outbound',
    body,
    provider_id: providerId ?? null,
  });
}

// Build a phone → contact-name map from the account's jobs and leads, so threads
// show a name instead of a bare number. Keyed by normalized phone.
export async function buildContactNameMap(supabase: SupabaseClient, accountId: string): Promise<Map<string, string>> {
  const [{ data: jobs }, { data: leads }] = await Promise.all([
    supabase.from('jobs').select('client_name, client_phone').eq('account_id', accountId).not('client_phone', 'is', null),
    supabase.from('leads').select('name, phone').eq('account_id', accountId).not('phone', 'is', null),
  ]);
  const map = new Map<string, string>();
  for (const lead of leads ?? []) {
    const key = normalizeUsPhone(String(lead.phone));
    if (key && lead.name && !map.has(key)) map.set(key, String(lead.name));
  }
  // Jobs win over leads (more current), so set them last.
  for (const job of jobs ?? []) {
    const key = normalizeUsPhone(String(job.client_phone));
    if (key && job.client_name) map.set(key, String(job.client_name));
  }
  return map;
}

// Latest message per phone, newest thread first. Reduces a recent slice in JS
// (no SQL distinct-on) — fine for the volumes a single contractor handles.
export async function listConversations(supabase: SupabaseClient, accountId: string): Promise<Conversation[]> {
  const { data } = await supabase
    .from('sms_messages')
    .select('phone_number, body, direction, created_at')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(500);

  const nameMap = await buildContactNameMap(supabase, accountId);
  const seen = new Map<string, Conversation>();
  for (const row of data ?? []) {
    if (seen.has(row.phone_number)) continue;
    seen.set(row.phone_number, {
      phone: row.phone_number,
      name: nameMap.get(row.phone_number) ?? null,
      lastBody: row.body,
      lastAt: row.created_at,
      lastDirection: row.direction as SmsDirection,
    });
  }
  return [...seen.values()];
}

export async function getConversationMessages(supabase: SupabaseClient, accountId: string, phone: string): Promise<SmsMessage[]> {
  const { data } = await supabase
    .from('sms_messages')
    .select('*')
    .eq('account_id', accountId)
    .eq('phone_number', phone)
    .order('created_at', { ascending: true });
  return (data ?? []) as SmsMessage[];
}
