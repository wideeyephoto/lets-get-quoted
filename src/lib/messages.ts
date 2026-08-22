import type { SupabaseClient } from '@supabase/supabase-js';
import { cityFromAddress, streetFromAddress } from '@/lib/lead-detail-labels';
import { formatPhoneDashes, normalizeUsPhone } from '@/lib/phone';

export type SmsDirection = 'inbound' | 'outbound';

export type SmsDeliveryStatus =
  | 'pending'
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'opted_out'
  | 'indeterminate'
  | 'cancelled'
  | 'suppressed';

export type SmsMessage = {
  id: string;
  account_id: string;
  phone_number: string;
  direction: SmsDirection;
  body: string;
  provider_id: string | null;
  provider?: 'twilio' | 'signalwire' | null;
  sender_number_id?: string | null;
  sms_event_id?: string | null;
  /** Durable provider state. Missing on historical rows means provider-accepted. */
  delivery_status?: SmsDeliveryStatus | null;
  created_at: string;
  /** Null means unread. Only ever set on inbound — our own copy is not mail. */
  read_at?: string | null;
  /** Twilio-hosted MMS attachments. See the migration on why they are not copied. */
  media_urls?: string[] | null;
};

export type Conversation = {
  phone: string;
  name: string | null;
  /**
   * What to CALL this thread in a list — never null, the number as a last
   * resort. Separate from `name` because `name` must stay a real person's name:
   * starterRepliesFor() greets with it, and a street there opens a reply with
   * "Hi 1418".
   */
  label: string;
  lastBody: string;
  lastAt: string;
  lastDirection: SmsDirection;
  /** Lets a just-enqueued reply remain visible and truthful after redirect. */
  lastDeliveryStatus: SmsDeliveryStatus | null;
  /** Inbound messages in this thread the owner hasn't opened. */
  unread: number;
  /** So a thread whose last message is a photo doesn't preview as blank. */
  lastHasMedia: boolean;
};

type ManualSmsEventProjection = {
  id: string;
  account_id: string;
  phone_number: string;
  body: string;
  provider_id: string | null;
  provider?: 'twilio' | 'signalwire' | null;
  sender_number_id?: string | null;
  status: string;
  queued_at?: string | null;
  created_at: string;
};

export type MessagingReadResult<T> =
  | { kind: 'ready'; data: T }
  | { kind: 'unavailable'; data: T };

/** Current consent-backed destinations for the manual compose picker. */
export async function loadCurrentSmsConsentPhones(
  supabase: SupabaseClient,
  accountId: string,
): Promise<MessagingReadResult<string[]>> {
  try {
    const [baseResult, scopeResult] = await Promise.all([
      supabase
        .from('sms_consent')
        .select('phone_number,status,consented_at,opted_out_at')
        .eq('account_id', accountId)
        .eq('status', 'opted_in')
        .not('consented_at', 'is', null)
        .is('opted_out_at', null),
      supabase
        .from('sms_consent_scopes')
        .select('phone_number,consent_scope')
        .eq('account_id', accountId)
        .eq('consent_scope', 'customer'),
    ]);
    if (baseResult.error || scopeResult.error) return { kind: 'unavailable', data: [] };

    // The base ledger is contact-wide STOP state. It is not proof that this
    // person is a homeowner: owners and crew intentionally share that ledger.
    // The compose picker requires both facts and never offers a crew/owner
    // number merely because it is globally opted in.
    const customerPhones = new Set<string>();
    for (const row of scopeResult.data ?? []) {
      const phone = normalizeUsPhone(String(row.phone_number ?? ''));
      if (phone && row.consent_scope === 'customer') customerPhones.add(phone);
    }
    const phones = new Set<string>();
    for (const row of baseResult.data ?? []) {
      const phone = normalizeUsPhone(String(row.phone_number ?? ''));
      if (phone
          && customerPhones.has(phone)
          && row.status === 'opted_in'
          && row.consented_at
          && !row.opted_out_at) phones.add(phone);
    }
    return { kind: 'ready', data: [...phones] };
  } catch {
    return { kind: 'unavailable', data: [] };
  }
}

const DELIVERY_STATUSES = new Set<SmsDeliveryStatus>([
  'pending', 'queued', 'sending', 'sent', 'delivered', 'failed',
  'opted_out', 'indeterminate', 'cancelled', 'suppressed',
]);

function deliveryStatus(value: unknown): SmsDeliveryStatus | null {
  return typeof value === 'string' && DELIVERY_STATUSES.has(value as SmsDeliveryStatus)
    ? (value as SmsDeliveryStatus)
    : null;
}

/** Copy for an outbound transcript row; historical mirrors were only written after acceptance. */
export function outboundDeliveryLabel(status: SmsDeliveryStatus | null | undefined): string {
  switch (status) {
    case 'pending':
    case 'queued': return 'Queued';
    case 'sending': return 'Sending';
    case 'delivered': return 'Delivered';
    case 'failed': return 'Failed';
    case 'indeterminate': return 'Delivery unknown';
    case 'opted_out':
    case 'cancelled':
    case 'suppressed': return 'Not sent';
    case 'sent':
    default: return 'Sent';
  }
}

/**
 * Overlay owner-readable manual-delivery events on the accepted-message mirror.
 *
 * `complete_sms_delivery` writes `sms_messages.id = sms_events.id`, so an
 * accepted callback collapses to one bubble. Before that boundary the event is
 * the durable transcript row: queued, failed, or indeterminate sends must not
 * disappear on redirect and invite the owner to send the same text again.
 */
export function mergeManualSmsEventProjection(
  messageRows: SmsMessage[],
  eventRows: ManualSmsEventProjection[],
  ascending = true,
): SmsMessage[] {
  const merged = messageRows.map((row) => ({ ...row }));
  const byEventId = new Map<string, SmsMessage>();
  for (const row of merged) {
    if (typeof row.id === 'string' && row.id) byEventId.set(row.id, row);
    if (typeof row.sms_event_id === 'string' && row.sms_event_id) byEventId.set(row.sms_event_id, row);
  }

  for (const event of eventRows) {
    const status = deliveryStatus(event.status);
    const mirrored = byEventId.get(event.id);
    if (mirrored) {
      mirrored.delivery_status = status;
      mirrored.sms_event_id = event.id;
      mirrored.provider = event.provider ?? mirrored.provider ?? null;
      mirrored.sender_number_id = event.sender_number_id ?? mirrored.sender_number_id ?? null;
      continue;
    }
    const projected: SmsMessage = {
      id: event.id,
      account_id: event.account_id,
      phone_number: event.phone_number,
      direction: 'outbound',
      body: event.body,
      provider_id: event.provider_id ?? null,
      provider: event.provider ?? null,
      sender_number_id: event.sender_number_id ?? null,
      sms_event_id: event.id,
      delivery_status: status,
      created_at: event.queued_at ?? event.created_at,
      read_at: null,
      media_urls: null,
    };
    merged.push(projected);
    byEventId.set(event.id, projected);
  }

  const direction = ascending ? 1 : -1;
  return merged.sort((left, right) =>
    direction * (Date.parse(left.created_at) - Date.parse(right.created_at)));
}

async function loadManualSmsEvents(
  supabase: SupabaseClient,
  accountId: string,
  phone?: string,
  limit?: number,
): Promise<MessagingReadResult<ManualSmsEventProjection[]>> {
  try {
    let query = supabase
      .from('sms_events')
      .select('id, account_id, phone_number, body, provider_id, provider, sender_number_id, status, queued_at, created_at')
      .eq('account_id', accountId)
      .eq('message_kind', 'inbox-reply');
    if (phone) query = query.eq('phone_number', phone);
    query = query.order('created_at', { ascending: false });
    if (limit) query = query.limit(limit);
    const { data, error } = await query;
    return error
      ? { kind: 'unavailable', data: [] }
      : { kind: 'ready', data: (data ?? []) as ManualSmsEventProjection[] };
  } catch {
    // A missing overlay is not equivalent to there being no queued message.
    // Fail closed so a reload cannot invite a duplicate manual send while the
    // durable delivery ledger is temporarily unreadable.
    return { kind: 'unavailable', data: [] };
  }
}

/**
 * Resolve only an active, provider-matched dedicated number.
 *
 * The From number, existing conversations, and consent rows are deliberately
 * absent. They are facts about a contact, not ownership of the number the
 * contact replied to. A shared LGQ number therefore returns null and is sent to
 * operator review by the webhook inbox instead of guessing a contractor.
 */
export async function resolveAccountForInbound(
  admin: SupabaseClient,
  toNumber: string,
  provider: 'twilio' | 'signalwire',
): Promise<string | null> {
  const normalizedTo = normalizeUsPhone(toNumber);
  if (!normalizedTo) return null;
  const { data, error } = await admin
    .from('sms_sender_numbers')
    .select('account_id')
    .eq('provider', provider)
    .eq('e164_number', normalizedTo)
    .eq('purpose', 'contractor_dedicated')
    .eq('provisioning_status', 'active')
    .eq('assignment_state', 'assigned')
    .eq('inbound_ready', true)
    .is('suspended_at', null)
    .maybeSingle();
  if (error || !data?.account_id) return null;
  return String(data.account_id);
}

export async function logInboundMessage(
  admin: SupabaseClient,
  input: {
    accountId: string;
    phone: string;
    body: string;
    provider: 'twilio' | 'signalwire';
    providerId: string;
    senderNumberId: string;
    mediaUrls?: string[];
  },
): Promise<void> {
  const media = (input.mediaUrls ?? []).filter(Boolean);
  const row: Record<string, unknown> = {
    account_id: input.accountId,
    phone_number: input.phone,
    direction: 'inbound',
    body: input.body,
    provider_id: input.providerId,
    provider: input.provider,
    sender_number_id: input.senderNumberId,
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
/** Who a phone number belongs to, as far as this workspace knows. */
export type ContactIdentity = {
  /** A real person's name, or null. Safe to greet with. */
  name: string | null;
  /** Freeform, one column — there are no separate street/city fields. */
  address: string | null;
};

/**
 * What to CALL a phone number in the inbox.
 *
 * The number used to be the heading whatever else we knew about them, which is
 * the least recognisable thing on the row: an owner reads "Dana Whitfield" or
 * "1418 Maplewood Ave" instantly and a ten-digit number never. Fall through in
 * the order an owner would ask: who, then where exactly, then which town, and
 * the number only when we genuinely know nothing else.
 *
 * DO NOT feed the result to starterRepliesFor(). It greets by first name, so a
 * street or a town there opens a reply with "Hi 1418" or "Hi Royal Oak". That is
 * why `name` survives beside this as its own field rather than being replaced.
 */
export function contactLabel(
  identity: ContactIdentity | null | undefined,
  phone: string,
): string {
  const name = (identity?.name ?? '').trim();
  if (name) return name;
  const address = identity?.address ?? null;
  return streetFromAddress(address) ?? cityFromAddress(address) ?? formatPhoneDashes(phone);
}

/**
 * Every phone number this workspace can put a name or an address to.
 *
 * READS CLIENTS, WHICH IT DID NOT. The thread pane resolves its heading from
 * `clients` (see messageContext) while this map read only jobs and leads, so a
 * customer who existed solely in the address book was a bare phone number in
 * the list and a full name in the panel beside it — the same conversation,
 * labelled two different ways on one screen.
 *
 * Precedence runs leads → jobs → clients, weakest first. A lead is what someone
 * typed into a form once; a job is more current; the client record is the book
 * the owner curates and the one the pane already shows, so it wins and the two
 * halves of the screen agree.
 */
export async function buildContactIdentityMap(
  supabase: SupabaseClient,
  accountId: string,
): Promise<Map<string, ContactIdentity>> {
  const [{ data: jobs }, { data: leads }, { data: clients }] = await Promise.all([
    supabase.from('jobs').select('client_name, client_phone, address').eq('account_id', accountId).not('client_phone', 'is', null),
    supabase.from('leads').select('name, phone, address').eq('account_id', accountId).not('phone', 'is', null),
    supabase.from('clients').select('name, phone, address').eq('account_id', accountId).not('phone', 'is', null),
  ]);

  const map = new Map<string, ContactIdentity>();
  // Merged field by field rather than row by row: a job with an address but no
  // usable name should not erase the name a lead supplied, and vice versa.
  const absorb = (phone: unknown, name: unknown, address: unknown) => {
    const key = normalizeUsPhone(String(phone ?? ''));
    if (!key) return;
    const existing = map.get(key) ?? { name: null, address: null };
    const nextName = typeof name === 'string' && name.trim() ? name.trim() : null;
    const nextAddress = typeof address === 'string' && address.trim() ? address.trim() : null;
    map.set(key, {
      name: nextName ?? existing.name,
      address: nextAddress ?? existing.address,
    });
  };

  for (const lead of leads ?? []) absorb(lead.phone, lead.name, lead.address);
  for (const job of jobs ?? []) absorb(job.client_phone, job.client_name, job.address);
  for (const client of clients ?? []) absorb(client.phone, client.name, client.address);
  return map;
}

/**
 * Names only, for callers that must not be handed a street.
 *
 * @see contactLabel for what the inbox displays.
 */
export async function buildContactNameMap(supabase: SupabaseClient, accountId: string): Promise<Map<string, string>> {
  const identities = await buildContactIdentityMap(supabase, accountId);
  const map = new Map<string, string>();
  for (const [phone, identity] of identities) {
    if (identity.name) map.set(phone, identity.name);
  }
  return map;
}

/**
 * LGQ's own lanes. A number with one of these purposes belongs to the platform,
 * not to the contractor.
 *
 * WHY THIS INBOX MUST EXCLUDE THEM. `sms_messages` is scoped by account_id
 * alone, so the moment owner alerts started actually sending (2026-08-22) the
 * contractor's own mobile appeared in their customer inbox as a thread —
 * complete with "View customer", a Call button, and a reply box explaining that
 * "customer replies require an approved, active dedicated number". None of that
 * is true of a conversation between the contractor and LGQ. It is a
 * notification, not a customer.
 *
 * Owner and crew traffic still exists, is still auditable, and still reaches the
 * phone; it simply is not a customer conversation and does not belong in the
 * list of them.
 */
const PLATFORM_LANE_PURPOSES = ['lgq_shared', 'lgq_dispatch'] as const;

async function platformLaneSenderIds(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase
    .from('sms_sender_numbers')
    .select('id')
    .in('purpose', PLATFORM_LANE_PURPOSES as unknown as string[]);
  // FAIL OPEN. If the lane list is unreadable, showing an extra thread is a
  // cosmetic problem; hiding the contractor's real customer threads is not.
  if (error) return [];
  return (data ?? []).map((row) => String((row as { id: unknown }).id));
}

/**
 * Drop platform-lane rows from a sms_messages query.
 *
 * THE NULL TRAP: `NOT IN (...)` evaluates to NULL for a NULL column, so a bare
 * `.not('sender_number_id', 'in', ...)` would also discard every legacy message
 * whose sender was never recorded — which is most of the contractor's history.
 * Nulls are kept explicitly.
 */
function excludePlatformLanes<Q extends { or: (filter: string) => Q }>(
  query: Q,
  platformIds: readonly string[],
): Q {
  if (platformIds.length === 0) return query;
  return query.or(`sender_number_id.is.null,sender_number_id.not.in.(${platformIds.join(',')})`);
}

// Latest message per phone, newest thread first. Reduces a recent slice in JS
// (no SQL distinct-on) — fine for the volumes a single contractor handles.
export async function loadConversations(
  supabase: SupabaseClient,
  accountId: string,
): Promise<MessagingReadResult<Conversation[]>> {
  // Columns listed explicitly so a pre-migration database (no read_at /
  // media_urls) still returns rows; the fallback below drops the new ones.
  const platformIds = await platformLaneSenderIds(supabase);
  // Filtered in the QUERY, not afterwards in JS: the slice is capped at 500, so
  // post-filtering would let platform notifications push real customer threads
  // out of the window entirely.
  const rows = async (columns: string) =>
    excludePlatformLanes(
      supabase
        .from('sms_messages')
        .select(columns)
        .eq('account_id', accountId),
      platformIds,
    )
      .order('created_at', { ascending: false })
      .limit(500);

  const full = await rows('id, account_id, phone_number, body, direction, provider_id, provider, sender_number_id, sms_event_id, created_at, read_at, media_urls');
  // Whether this database HAS the unread column, as opposed to having no unread
  // messages. Without the distinction a pre-migration database reads every
  // inbound message as unread — because read_at is simply absent — and the
  // thread badges would contradict the nav count, which correctly says zero.
  const hasReadState = !full.error;
  const fallback = hasReadState
    ? null
    : await rows('id, account_id, phone_number, body, direction, provider_id, created_at');
  if (!hasReadState && fallback?.error) return { kind: 'unavailable', data: [] };
  const data = (hasReadState ? full.data : fallback?.data) as
    | Array<Record<string, unknown>>
    | null;

  const manualEvents = await loadManualSmsEvents(supabase, accountId, undefined, 500);
  if (manualEvents.kind === 'unavailable') return { kind: 'unavailable', data: [] };

  const projectedRows = mergeManualSmsEventProjection(
    (data ?? []) as SmsMessage[],
    manualEvents.data,
    false,
  );

  const identities = await buildContactIdentityMap(supabase, accountId);
  const seen = new Map<string, Conversation>();
  for (const row of projectedRows) {
    const phone = String(row.phone_number);
    const media = Array.isArray(row.media_urls) ? (row.media_urls as string[]) : [];
    const existing = seen.get(phone);
    if (!existing) {
      const identity = identities.get(phone) ?? null;
      seen.set(phone, {
        phone,
        name: identity?.name ?? null,
        label: contactLabel(identity, phone),
        lastBody: String(row.body ?? ''),
        lastAt: String(row.created_at),
        lastDirection: row.direction as SmsDirection,
        lastDeliveryStatus: row.delivery_status ?? null,
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
  return { kind: 'ready', data: [...seen.values()] };
}

/** Compatibility wrapper for non-UI callers that intentionally accept [] on failure. */
export async function listConversations(supabase: SupabaseClient, accountId: string): Promise<Conversation[]> {
  return (await loadConversations(supabase, accountId)).data;
}

/** Inbound messages across every thread that the owner hasn't opened. Drives the nav badge. */
export async function countUnreadMessages(supabase: SupabaseClient, accountId: string): Promise<number> {
  try {
    // Same exclusion as the thread list, or the badge counts messages the list
    // will not show and the two contradict each other.
    const platformIds = await platformLaneSenderIds(supabase);
    const { count, error } = await excludePlatformLanes(
      supabase
        .from('sms_messages')
        .select('id', { head: true, count: 'exact' })
        .eq('account_id', accountId)
        .eq('direction', 'inbound')
        .is('read_at', null),
      platformIds,
    );
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
export async function markThreadRead(
  supabase: SupabaseClient,
  accountId: string,
  phone: string,
  readThrough?: string,
): Promise<boolean> {
  try {
    let query = supabase
      .from('sms_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('account_id', accountId)
      .eq('phone_number', phone)
      .eq('direction', 'inbound')
      .is('read_at', null);
    if (readThrough) query = query.lte('created_at', readThrough);
    // Ask for the touched IDs so a policy/schema mismatch that silently updates
    // zero rows does not make the client refresh the same unread state forever.
    const { data, error } = await query.select('id');
    return !error && (data?.length ?? 0) > 0;
  } catch {
    // Pre-migration. The thread still opens; it just cannot be marked.
    return false;
  }
}

export async function loadConversationMessages(
  supabase: SupabaseClient,
  accountId: string,
  phone: string,
): Promise<MessagingReadResult<SmsMessage[]>> {
  // Excluded here too. Without it, opening a thread by phone number would still
  // render the platform's own messages — and the contractor's mobile is exactly
  // the number most likely to appear in both.
  const platformIds = await platformLaneSenderIds(supabase);
  const [messages, events] = await Promise.all([
    excludePlatformLanes(
      supabase
        .from('sms_messages')
        .select('*')
        .eq('account_id', accountId)
        .eq('phone_number', phone),
      platformIds,
    ).order('created_at', { ascending: true }),
    loadManualSmsEvents(supabase, accountId, phone),
  ]);
  if (messages.error || events.kind === 'unavailable') {
    return { kind: 'unavailable', data: [] };
  }
  return {
    kind: 'ready',
    data: mergeManualSmsEventProjection((messages.data ?? []) as SmsMessage[], events.data, true),
  };
}

/** Compatibility wrapper for callers that intentionally accept [] on failure. */
export async function getConversationMessages(supabase: SupabaseClient, accountId: string, phone: string): Promise<SmsMessage[]> {
  return (await loadConversationMessages(supabase, accountId, phone)).data;
}
