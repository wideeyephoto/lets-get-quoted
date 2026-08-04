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
  /** Null means unread. Only ever set on inbound — our own copy is not mail. */
  read_at?: string | null;
  /** Twilio-hosted MMS attachments. See the migration on why they are not copied. */
  media_urls?: string[] | null;
};

export type Conversation = {
  phone: string;
  name: string | null;
  lastBody: string;
  lastAt: string;
  lastDirection: SmsDirection;
  /** Inbound messages in this thread the owner hasn't opened. */
  unread: number;
  /** So a thread whose last message is a photo doesn't preview as blank. */
  lastHasMedia: boolean;
};

/**
 * Which contractor an inbound text belongs to.
 *
 * Every account sends from one shared platform number, so the text carries the
 * customer's number and nothing that says who it is for. This used to resolve
 * that by taking whichever account had most recently touched the customer's row
 * in the CONSENT ledger — and that row is written by creating a job or
 * requesting a payment, not by talking to anybody. Contractor A texts a
 * homeowner; contractor B, who also knows them, creates a job for them the next
 * day; the homeowner's reply to A is delivered to B. Two ordinary actions, and
 * a stranger reads somebody's message about their house.
 *
 * Three signals, strongest first:
 *
 *  1. THE NUMBER IT WAS SENT TO. If an account has claimed that number this is
 *     not a guess at all, and nothing below can overrule it. Nothing assigns
 *     numbers yet — see the migration — but this is where it plugs in, and it
 *     is checked first so the day it starts being set, routing becomes exact.
 *
 *  2. WHO THEY WERE LAST TALKING TO. An actual message in either direction is
 *     the only evidence about a conversation, and a reply belongs to the
 *     conversation it is replying to.
 *
 *  3. Consent recency, as before — reached only when nobody has ever exchanged
 *     a message with this number, where it is the sole remaining signal.
 */
export type InboundRouteCandidate = {
  accountId: string;
  /** Most recent message either way with this number, ISO, or null. */
  lastMessageAt: string | null;
  /** Consent-ledger recency, ISO, or null. */
  consentUpdatedAt: string | null;
};

/** Pure so the precedence can be pinned by a test rather than trusted. */
export function pickInboundAccount(
  candidates: InboundRouteCandidate[],
  claimedByToNumber?: string | null,
): string | null {
  if (claimedByToNumber) return claimedByToNumber;
  if (candidates.length === 0) return null;

  const talking = candidates.filter((entry) => entry.lastMessageAt);
  if (talking.length > 0) {
    return talking.reduce((best, entry) =>
      (entry.lastMessageAt as string) > (best.lastMessageAt as string) ? entry : best,
    ).accountId;
  }

  const consented = candidates.filter((entry) => entry.consentUpdatedAt);
  if (consented.length === 0) return null;
  return consented.reduce((best, entry) =>
    (entry.consentUpdatedAt as string) > (best.consentUpdatedAt as string) ? entry : best,
  ).accountId;
}

export async function resolveAccountForInbound(
  admin: SupabaseClient,
  phone: string,
  toNumber?: string | null,
): Promise<string | null> {
  // 1. The number it was addressed to, when somebody owns it.
  //
  // Defensive: on a database without the migration this column does not exist
  // and the query errors, which must fall through to the guess rather than
  // dropping the message.
  const normalizedTo = toNumber ? normalizeUsPhone(toNumber) : null;
  if (normalizedTo) {
    const { data: owner } = await admin
      .from('accounts')
      .select('id')
      .eq('sms_number', normalizedTo)
      .maybeSingle();
    if (owner?.id) return owner.id as string;
  }

  const [{ data: messages }, { data: consents }] = await Promise.all([
    admin
      .from('sms_messages')
      .select('account_id, created_at')
      .eq('phone_number', phone)
      .order('created_at', { ascending: false })
      .limit(50),
    admin.from('sms_consent').select('account_id, updated_at').eq('phone_number', phone),
  ]);

  const byAccount = new Map<string, InboundRouteCandidate>();
  const ensure = (accountId: string): InboundRouteCandidate => {
    let entry = byAccount.get(accountId);
    if (!entry) {
      entry = { accountId, lastMessageAt: null, consentUpdatedAt: null };
      byAccount.set(accountId, entry);
    }
    return entry;
  };

  // Ordered newest-first, so the first row seen for an account is its latest.
  for (const row of messages ?? []) {
    const entry = ensure(String((row as { account_id: string }).account_id));
    entry.lastMessageAt ??= String((row as { created_at: string }).created_at);
  }
  for (const row of consents ?? []) {
    ensure(String((row as { account_id: string }).account_id)).consentUpdatedAt = String(
      (row as { updated_at: string }).updated_at,
    );
  }

  return pickInboundAccount([...byAccount.values()]);
}

/** @deprecated Use resolveAccountForInbound, which can also read the To number. */
export async function resolveAccountForPhone(admin: SupabaseClient, phone: string): Promise<string | null> {
  return resolveAccountForInbound(admin, phone, null);
}

export async function logInboundMessage(
  admin: SupabaseClient,
  input: { phone: string; body: string; providerId?: string | null; mediaUrls?: string[]; toNumber?: string | null },
): Promise<void> {
  const accountId = await resolveAccountForInbound(admin, input.phone, input.toNumber);
  if (!accountId) return; // unknown sender — nothing to thread it onto
  const media = (input.mediaUrls ?? []).filter(Boolean);
  const row: Record<string, unknown> = {
    account_id: accountId,
    phone_number: input.phone,
    direction: 'inbound',
    body: input.body,
    provider_id: input.providerId ?? null,
  };
  if (media.length > 0) row.media_urls = media;

  const { error } = await admin.from('sms_messages').insert(row);
  // Pre-migration the media column does not exist yet, and dropping a customer's
  // message on the floor over a photo is far worse than losing the photo. Retry
  // without it rather than letting the insert fail.
  if (error && media.length > 0) {
    delete row.media_urls;
    await admin.from('sms_messages').insert(row);
  }
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
  // Columns listed explicitly so a pre-migration database (no read_at /
  // media_urls) still returns rows; the fallback below drops the new ones.
  const rows = async (columns: string) =>
    supabase
      .from('sms_messages')
      .select(columns)
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(500);

  const full = await rows('phone_number, body, direction, created_at, read_at, media_urls');
  // Whether this database HAS the unread column, as opposed to having no unread
  // messages. Without the distinction a pre-migration database reads every
  // inbound message as unread — because read_at is simply absent — and the
  // thread badges would contradict the nav count, which correctly says zero.
  const hasReadState = !full.error;
  const data = (hasReadState ? full.data : (await rows('phone_number, body, direction, created_at')).data) as
    | Array<Record<string, unknown>>
    | null;

  const nameMap = await buildContactNameMap(supabase, accountId);
  const seen = new Map<string, Conversation>();
  for (const row of data ?? []) {
    const phone = String(row.phone_number);
    const media = Array.isArray(row.media_urls) ? (row.media_urls as string[]) : [];
    const existing = seen.get(phone);
    if (!existing) {
      seen.set(phone, {
        phone,
        name: nameMap.get(phone) ?? null,
        lastBody: String(row.body ?? ''),
        lastAt: String(row.created_at),
        lastDirection: row.direction as SmsDirection,
        unread: 0,
        lastHasMedia: media.length > 0,
      });
    }
    // Counted over the whole slice, not just the newest row: a thread with three
    // unanswered texts should say three.
    if (hasReadState && row.direction === 'inbound' && !row.read_at) {
      const entry = seen.get(phone)!;
      entry.unread += 1;
    }
  }
  return [...seen.values()];
}

/** Inbound messages across every thread that the owner hasn't opened. Drives the nav badge. */
export async function countUnreadMessages(supabase: SupabaseClient, accountId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('sms_messages')
      .select('id', { head: true, count: 'exact' })
      .eq('account_id', accountId)
      .eq('direction', 'inbound')
      .is('read_at', null);
    if (error) return 0;
    return count ?? 0;
  } catch {
    // Pre-migration: no read_at column. A badge that cannot be computed is a
    // badge that isn't shown, never an error on the page it decorates.
    return 0;
  }
}

/**
 * Mark a thread read, as of now.
 *
 * Called when the owner opens it. Deliberately not "mark every message read":
 * a text arriving while they read stays unread, which is the honest answer —
 * they have not seen it.
 */
export async function markThreadRead(supabase: SupabaseClient, accountId: string, phone: string): Promise<void> {
  try {
    await supabase
      .from('sms_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('account_id', accountId)
      .eq('phone_number', phone)
      .eq('direction', 'inbound')
      .is('read_at', null);
  } catch {
    // Pre-migration. The thread still opens; it just cannot be marked.
  }
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
