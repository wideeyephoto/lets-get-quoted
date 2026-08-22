import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import { loadBusinessName } from '@/lib/business-name';
import { getLeadTriage, isLeadSnoozed, LEAD_PRUNE_FLAGS, type LeadTriage } from '@/lib/leads';
import { normalizeUsPhone } from '@/lib/phone';
import { recordAccountEvent } from '@/lib/account-events';
import {
  displayStatus,
  greetingName,
  holdState,
  parseOfferReply,
  storedWindowLabel,
  type EstimateOffer,
  type OfferCandidateLead,
} from '@/lib/estimate-offers';
import { sendOwnerEstimateAcceptedSms } from '@/lib/sms';

// Everything the estimate-offer flow touches in the database.
//
// Split from the pure module so the rules — which gap, which lead, what window,
// what a reply means — stay testable without a database, and so the two callers
// that must agree (the plan page and the inbound webhook) agree by sharing this
// code rather than by both being careful.

const OFFER_FIELDS =
  'id, account_id, lead_id, crew_id, status, offer_date, window_start, window_end, arrival_time, visit_minutes, ' +
  'detour_miles, detour_minutes, after_stop_id, phone, body, hold_minutes, hold_expires_at, sent_at, replied_at, ' +
  'reply_body, forwarded_at, route_stop_id';

/** How stale a lead can be before "we're working in your area" reads as a cold call. */
const CANDIDATE_MAX_AGE_DAYS = 60;

/** Thrown when the migration hasn't been applied — the page degrades, it doesn't break. */
export class OffersUnavailableError extends Error {}

function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === '42P01';
}

export type OfferContext = {
  /** False before the migration lands; the panel hides itself rather than erroring. */
  available: boolean;
  /** This day's offers, whatever became of them. */
  offers: EstimateOffer[];
  /** Every lead this account has ever offered a slot — the never-twice guardrail. */
  offeredLeadIds: Set<string>;
  /** Open leads worth suggesting, before proximity is considered. */
  candidates: OfferCandidateLead[];
  /** Names for the leads behind this day's offers — they've left `candidates` by then. */
  offerLeadNames: Map<string, string>;
};

/**
 * Which leads are even askable.
 *
 * Anything already in motion is excluded — a lead with a visit booked, one
 * converted to a job, one snoozed or archived or declined. The point is to reach
 * people who are waiting on us, not to re-poke a pipeline that's already moving.
 */
function isAskable(row: { status: string; converted_job: string | null; quote_visit: unknown; triage: LeadTriage | null }): boolean {
  if (row.converted_job) return false;
  if (row.quote_visit) return false;
  if (row.status !== 'new' && row.status !== 'contacted') return false;
  const triage = getLeadTriage({ triage: row.triage });
  if (triage.archived) return false;
  if (triage.declinedReason) return false;
  if (isLeadSnoozed(triage)) return false;
  // Out of area, work they don't do, below their minimum, just researching —
  // triage already judged these not worth chasing. Driving to one is the last
  // thing we should suggest.
  if (triage.flags.some((flag) => LEAD_PRUNE_FLAGS.has(flag))) return false;
  return true;
}

export async function loadOfferContext(
  supabase: SupabaseClient,
  accountId: string,
  dateKey: string,
): Promise<OfferContext> {
  const empty: OfferContext = {
    available: false,
    offers: [],
    offeredLeadIds: new Set(),
    candidates: [],
    offerLeadNames: new Map(),
  };

  const { data: offerRows, error: offerError } = await supabase
    .from('estimate_offers')
    .select(OFFER_FIELDS)
    .eq('account_id', accountId)
    .order('sent_at', { ascending: false });

  // Pre-migration: no offers, no panel, no error. Every other part of planning
  // the day still works.
  if (offerError) {
    if (isMissingTable(offerError)) return empty;
    throw offerError;
  }

  const all = (offerRows ?? []) as unknown as EstimateOffer[];
  const cutoff = new Date(Date.now() - CANDIDATE_MAX_AGE_DAYS * 86400000).toISOString();

  const { data: leadRows, error: leadError } = await supabase
    .from('leads')
    .select('id, name, phone, address, project_type, lat, lng, status, converted_job, quote_visit, triage, created_at')
    .eq('account_id', accountId)
    .in('status', ['new', 'contacted'])
    .not('phone', 'is', null)
    .not('lat', 'is', null)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(200);
  if (leadError) throw leadError;

  const candidates = ((leadRows ?? []) as Array<Record<string, unknown>>)
    .filter((row) =>
      isAskable({
        status: String(row.status),
        converted_job: (row.converted_job as string | null) ?? null,
        quote_visit: row.quote_visit,
        triage: (row.triage as LeadTriage | null) ?? null,
      }),
    )
    .map((row) => ({
      id: String(row.id),
      name: (row.name as string | null) ?? null,
      phone: (row.phone as string | null) ?? null,
      address: (row.address as string | null) ?? null,
      projectType: (row.project_type as string | null) ?? null,
      lat: row.lat != null ? Number(row.lat) : null,
      lng: row.lng != null ? Number(row.lng) : null,
    }));

  // An offer's lead has usually left `candidates` by the time it matters — an
  // accepted one has a visit booked, and every offered one is excluded by the
  // never-twice rule — so the names for this day are fetched on their own.
  const offers = all.filter((offer) => offer.offer_date === dateKey);
  const offerLeadNames = new Map<string, string>();
  if (offers.length > 0) {
    const { data: named } = await supabase
      .from('leads')
      .select('id, name')
      .eq('account_id', accountId)
      .in('id', offers.map((offer) => offer.lead_id));
    for (const row of (named ?? []) as Array<{ id: string; name: string | null }>) {
      offerLeadNames.set(row.id, row.name?.trim() || 'Unnamed lead');
    }
  }

  return {
    available: true,
    offers,
    offeredLeadIds: new Set(all.map((offer) => offer.lead_id)),
    candidates,
    offerLeadNames,
  };
}

// -- Sending -------------------------------------------------------------------

export type CreateOfferInput = {
  accountId: string;
  leadId: string;
  crewId: string | null;
  dateKey: string;
  phone: string;
  body: string;
  windowStart: string;
  windowEnd: string;
  arrivalTime: string;
  visitMinutes: number;
  holdMinutes: number;
  detourMiles: number | null;
  detourMinutes: number | null;
  afterStopId: string | null;
};

/**
 * Records the offer and starts the hold.
 *
 * Written BEFORE the text goes out, and deliberately so: a unique index on
 * lead_id is what stops a double-tap or a retried request texting the same
 * homeowner twice, and it can only do that if the row exists first. If the send
 * then fails the caller deletes it again — see deleteOffer.
 */
export async function createOffer(supabase: SupabaseClient, input: CreateOfferInput): Promise<EstimateOffer> {
  const holdExpires = new Date(Date.now() + input.holdMinutes * 60000).toISOString();
  const { data, error } = await supabase
    .from('estimate_offers')
    .insert({
      account_id: input.accountId,
      lead_id: input.leadId,
      crew_id: input.crewId,
      status: 'held',
      offer_date: input.dateKey,
      window_start: input.windowStart,
      window_end: input.windowEnd,
      arrival_time: input.arrivalTime,
      visit_minutes: input.visitMinutes,
      detour_miles: input.detourMiles,
      detour_minutes: input.detourMinutes,
      after_stop_id: input.afterStopId,
      phone: input.phone,
      body: input.body,
      hold_minutes: input.holdMinutes,
      hold_expires_at: holdExpires,
    })
    .select(OFFER_FIELDS)
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('This lead has already been offered a slot — we only ever ask once.');
    if (isMissingTable(error)) throw new OffersUnavailableError('Estimate offers are not set up on this database yet.');
    throw error;
  }
  return data as unknown as EstimateOffer;
}

/**
 * Undoes a hold whose text never left.
 *
 * A hard delete, not a status: the unique index means a canceled row would lock
 * this lead out of ever being asked, and a provider hiccup is no reason to burn
 * the one offer they get. Only ever called when we know nothing was delivered.
 */
export async function deleteOffer(supabase: SupabaseClient, accountId: string, offerId: string): Promise<void> {
  const { error } = await supabase
    .from('estimate_offers')
    .delete()
    .eq('account_id', accountId)
    .eq('id', offerId)
    .eq('status', 'held');
  if (error) console.error('Estimate offer rollback failed:', error.message);
}

/** Releases the hold without contacting the homeowner again. */
export async function cancelOffer(supabase: SupabaseClient, accountId: string, offerId: string): Promise<void> {
  const { error } = await supabase
    .from('estimate_offers')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', offerId)
    .eq('status', 'held');
  if (error) throw error;
}

// -- Answering -----------------------------------------------------------------

export type ReplyOutcome = {
  /** True when this inbound text was an answer to an offer and we replied to it. */
  handled: boolean;
  reply: string | null;
};

type OfferWithLead = EstimateOffer & {
  lead: { id: string; name: string | null; address: string | null; project_type: string | null; lat: number | null; lng: number | null; status: string } | null;
  account: { business_name: string | null; alert_phone: string | null } | null;
};

/**
 * The homeowner texted back. Work out what they meant and do it.
 *
 * Runs only after the authenticated webhook inbox has resolved an active
 * dedicated To number to one account. The account predicate is not optional:
 * the same homeowner may legitimately know several contractors.
 */
export async function resolveOfferReply(accountId: string, phone: string, rawBody: string): Promise<ReplyOutcome> {
  const nothing: ReplyOutcome = { handled: false, reply: null };
  try {
    const admin = createAdminClient();
    const normalized = normalizeUsPhone(phone) ?? phone.trim();

    const { data, error } = await admin
      .from('estimate_offers')
      .select(
        `${OFFER_FIELDS}, lead:leads(id, name, address, project_type, lat, lng, status), account:accounts(business_name, alert_phone)`,
      )
      .eq('account_id', accountId)
      .eq('phone', normalized)
      .eq('status', 'held')
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return nothing;
    const offer = data as unknown as OfferWithLead;
    const decision = parseOfferReply(rawBody);
    // The site's name first, and never the "My Business" placeholder — this
    // goes into an auto-reply a homeowner reads. See src/lib/business-name.ts.
    const businessName = await loadBusinessName(admin, offer.account_id, 'your contractor');
    const windowLabel = storedWindowLabel(offer);
    const leadName = greetingName(offer.lead?.name ?? null);

    // Anything that isn't a clear yes or no is a message for the contractor, not
    // an answer. The offer keeps holding — they may still say yes — and the text
    // itself is already in the inbox by the time we get here.
    if (decision === 'unclear') {
      // One acknowledgement per offer, not one per message: someone typing three
      // questions in a row should not get three identical auto-replies.
      if (offer.forwarded_at) return { handled: true, reply: null };
      await admin
        .from('estimate_offers')
        .update({ forwarded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', offer.id);
      return replyTo(
        admin,
        offer,
        `Thanks ${leadName} — we've passed that straight to ${businessName} and they'll come back to you shortly.`,
      );
    }

    if (decision === 'decline') {
      await admin
        .from('estimate_offers')
        .update({
          status: 'declined',
          replied_at: new Date().toISOString(),
          reply_body: rawBody.slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq('id', offer.id)
        .eq('status', 'held');
      return replyTo(
        admin,
        offer,
        `No problem ${leadName} — thanks for letting us know. ${businessName} will be in touch about other times.`,
      );
    }

    // A yes. Whether it counts depends entirely on whether the hold is still
    // running: the slot may have been given to somebody else by now, and
    // confirming an appointment we can't keep is worse than saying we missed it.
    const stillHolding = holdState(offer).holding;
    if (!stillHolding) {
      await admin
        .from('estimate_offers')
        .update({
          status: 'accepted_late',
          replied_at: new Date().toISOString(),
          reply_body: rawBody.slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq('id', offer.id)
        .eq('status', 'held');

      // Still a lead saying yes — the contractor wants to know, even though the
      // slot went.
      await notifyOwner(offer, `${offer.lead?.name || 'A lead'} said YES to an estimate ${windowLabel} — but after the hold expired, so nothing was booked. Call them.`);
      return replyTo(
        admin,
        offer,
        `Thanks ${leadName}! That window has just passed, so we haven't booked it — but ${businessName} has your reply and will call you to sort a time.`,
      );
    }

    const stopId = await bookAcceptedOffer(admin, offer);
    if (!stopId) {
      // The booking write failed. Nothing confirming goes out — the honest reply
      // is that a person will pick this up, and the contractor is told to.
      await notifyOwner(offer, `${offer.lead?.name || 'A lead'} said YES to an estimate ${windowLabel} but we could not add it to your day. Book it manually.`);
      return replyTo(admin, offer, `Thanks ${leadName}! ${businessName} has your reply and will confirm the time with you shortly.`);
    }

    await notifyOwner(offer, `${offer.lead?.name || 'A lead'} said YES — estimate added to your day, ${windowLabel}.`);
    return replyTo(admin, offer, `You're booked, ${leadName}! ${businessName} will arrive between ${windowLabel}. See you then.`);
  } catch (error) {
    console.error('Estimate offer reply failed:', error instanceof Error ? error.message : error);
    return nothing;
  }
}

/**
 * Return a reply intent only. The authenticated inbound route queues it with
 * the exact inbound sender-number binding; provider acceptance then projects
 * the real outbound transcript. Writing sms_messages here would manufacture an
 * optimistic message before any carrier request existed.
 */
async function replyTo(_admin: SupabaseClient, _offer: OfferWithLead, message: string): Promise<ReplyOutcome> {
  return { handled: true, reply: message };
}

/**
 * Turns an accepted offer into a real stop on the day.
 *
 * The visit becomes a route stop rather than a job: nobody is paying for an
 * estimate, so it must not land in job counts or revenue — but it does cost real
 * time and real miles, which is exactly what a route stop is for. The lead keeps
 * the customer relationship, and gets its quote_visit set so the lead page tells
 * the same story.
 */
async function bookAcceptedOffer(admin: SupabaseClient, offer: OfferWithLead): Promise<string | null> {
  const now = new Date().toISOString();
  const name = offer.lead?.name?.trim() || 'Lead';

  const { data: stop, error: stopError } = await admin
    .from('route_stops')
    .insert({
      account_id: offer.account_id,
      crew_id: offer.crew_id,
      lead_id: offer.lead_id,
      scheduled_for: offer.offer_date,
      scheduled_time: offer.arrival_time,
      label: `Estimate — ${name}`,
      address: offer.lead?.address ?? null,
      lat: offer.lead?.lat ?? null,
      lng: offer.lead?.lng ?? null,
      minutes: offer.visit_minutes,
      kind: 'estimate',
      note: `Accepted by text. Promised ${storedWindowLabel(offer)}.`,
    })
    .select('id')
    .maybeSingle();

  if (stopError || !stop) {
    console.error('Estimate offer accepted but the stop could not be created:', stopError?.message);
    return null;
  }

  const stopId = String(stop.id);

  await admin
    .from('estimate_offers')
    .update({
      status: 'accepted',
      replied_at: now,
      reply_body: 'YES',
      route_stop_id: stopId,
      updated_at: now,
    })
    .eq('id', offer.id);

  // The lead's own record of the appointment. Best-effort: the stop is on the
  // day either way, and failing here must not undo a confirmed booking.
  const { error: leadError } = await admin
    .from('leads')
    .update({
      quote_visit: {
        scheduledFor: offer.offer_date,
        scheduledTime: offer.arrival_time,
        durationMinutes: offer.visit_minutes,
        notes: `Booked from a route-gap offer. Promised ${storedWindowLabel(offer)}.`,
        confirmationTextSentAt: now,
        scheduledAt: now,
      },
      status: offer.lead?.status === 'new' ? 'contacted' : offer.lead?.status,
      updated_at: now,
    })
    .eq('id', offer.lead_id)
    .eq('account_id', offer.account_id);
  if (leadError) console.error('Estimate offer lead update failed:', leadError.message);

  await recordAccountEvent({
    accountId: offer.account_id,
    kind: 'automation_toggled',
    summary: `${name} accepted an estimate slot for ${offer.offer_date} (${storedWindowLabel(offer)})`,
    meta: { source: 'estimate_offer', offer_id: offer.id, lead_id: offer.lead_id, route_stop_id: stopId },
  });

  return stopId;
}

/** Texts the contractor's own alert number. Best-effort, never blocks a reply. */
async function notifyOwner(offer: OfferWithLead, message: string): Promise<void> {
  const alertPhone = offer.account?.alert_phone;
  if (!alertPhone) return;
  // accountId so the sender can check whether this owner replied STOP —
  // consent rows are keyed (account_id, phone_number).
  await sendOwnerEstimateAcceptedSms({
    accountId: offer.account_id,
    alertPhone,
    message,
    idempotencyKey: `estimate-offer-owner:${offer.id}:reply`,
  });
}

/** Display helper shared by the panel: what an offer looks like right now. */
export function offerDisplay(offer: EstimateOffer, now = new Date()) {
  return { status: displayStatus(offer, now), hold: holdState(offer, now), windowLabel: storedWindowLabel(offer) };
}
