import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import { loadBusinessName } from '@/lib/business-name';
import { normalizeUsPhone } from '@/lib/phone';
import { recordAccountEvent } from '@/lib/account-events';
import { logOutboundMessage } from '@/lib/messages';
import { sendOwnerEstimateAcceptedSms } from '@/lib/sms';
import { coordOf, type LatLng } from '@/lib/distance';
import { expandScheduledJobs, isMissingEndDateColumn, SPAN_COLUMNS, SPAN_COLUMNS_BEFORE_END_DATE, type SchedulableJob } from '@/lib/jobs';
import { greetingName } from '@/lib/estimate-offers';
import {
  LOOKAHEAD_DAYS,
  parseRescheduleReply,
  rankDaySuggestions,
  storedWindowLabel,
  type CandidateDay,
  type DaySuggestion,
  type RescheduleOffer,
} from '@/lib/reschedule-offers';

// Everything the reschedule-offer flow touches in the database.
//
// Split from the pure module for the same reason estimate-offers is: the rules —
// which day, how near is near, what a reply means — stay testable without a
// database, and the two callers that must agree (the plan page and the inbound
// webhook) agree by sharing this code rather than by both being careful.

const OFFER_FIELDS =
  'id, account_id, job_id, crew_id, status, from_date, to_date, window_start, window_end, arrival_time, ' +
  'discount_percent, near_miles, saved_miles, saved_minutes, phone, body, sent_at, replied_at, reply_body, forwarded_at';

/** Thrown when the migration hasn't been applied — the page degrades, it doesn't break. */
export class RescheduleUnavailableError extends Error {}

function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === '42P01';
}

function isMissingColumn(error: { code?: string } | null): boolean {
  return error?.code === '42703';
}

function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1, (d ?? 1) + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export type RescheduleContext = {
  /** False before the migration lands; the menu item hides rather than erroring. */
  available: boolean;
  /** Live and recently-answered offers for the day being planned. */
  offers: RescheduleOffer[];
  /** Job ids with an offer still waiting on a reply — the never-twice guardrail. */
  pendingJobIds: Set<string>;
};

export async function loadRescheduleContext(
  supabase: SupabaseClient,
  accountId: string,
  dateKey: string,
): Promise<RescheduleContext> {
  const { data, error } = await supabase
    .from('reschedule_offers')
    .select(OFFER_FIELDS)
    .eq('account_id', accountId)
    .eq('from_date', dateKey)
    .order('sent_at', { ascending: false });

  // Pre-migration: no offers, no panel, no error. Everything else about planning
  // the day still works.
  if (error) {
    if (isMissingTable(error)) return { available: false, offers: [], pendingJobIds: new Set() };
    throw error;
  }

  const offers = (data ?? []) as unknown as RescheduleOffer[];
  return {
    available: true,
    offers,
    pendingJobIds: new Set(offers.filter((offer) => offer.status === 'sent').map((offer) => offer.job_id)),
  };
}

/**
 * Which days ahead the truck already passes near this address.
 *
 * Reads the calendar as it stands — every scheduled job for the next few weeks,
 * expanded across the days its hours span, so a six-day patio counts as an
 * anchor on all six. The job being moved is excluded from its own comparison for
 * the obvious reason.
 */
export async function findBetterDays(
  supabase: SupabaseClient,
  accountId: string,
  input: { jobId: string; at: LatLng | null; fromDate: string; workDayHours: number; windows: Array<{ startMinutes: number; endMinutes: number }> },
): Promise<DaySuggestion[]> {
  if (!input.at) return [];

  const from = addDays(input.fromDate, 1);
  const to = addDays(input.fromDate, LOOKAHEAD_DAYS);

  const query = (columns: string) =>
    supabase
      .from('jobs')
      .select(`${columns}, lat, lng`)
      .eq('account_id', accountId)
      .neq('status', 'archived')
      .neq('id', input.jobId)
      .not('scheduled_for', 'is', null)
      .not('lat', 'is', null)
      .gte('scheduled_for', from)
      .lte('scheduled_for', to);

  // Same pre-migration guard the availability query uses — a failed select here
  // would silently drop every anchor and suggest no day at all.
  const withEndDate = await query(SPAN_COLUMNS);
  const rows = isMissingEndDateColumn(withEndDate.error) ? (await query(SPAN_COLUMNS_BEFORE_END_DATE)).data : withEndDate.data;

  const anchorRows = (rows ?? []) as unknown as Array<SchedulableJob & { lat: number | null; lng: number | null }>;

  const byDate = new Map<string, LatLng[]>();
  for (const occurrence of expandScheduledJobs(anchorRows, input.workDayHours)) {
    const coord = coordOf(occurrence);
    if (!coord) continue;
    const list = byDate.get(occurrence.scheduled_for) ?? [];
    list.push(coord);
    byDate.set(occurrence.scheduled_for, list);
  }

  const days: CandidateDay[] = [...byDate.entries()].map(([dateKey, anchors]) => ({
    dateKey,
    anchors,
    openWindows: input.windows,
  }));

  return rankDaySuggestions({ at: input.at, days });
}

// -- Sending -------------------------------------------------------------------

export type CreateRescheduleInput = {
  accountId: string;
  jobId: string;
  crewId: string | null;
  fromDate: string;
  toDate: string;
  windowStart: string;
  windowEnd: string;
  arrivalTime: string;
  discountPercent: number;
  nearMiles: number | null;
  savedMiles: number | null;
  savedMinutes: number | null;
  phone: string;
  body: string;
};

/**
 * Records the offer before the text goes out.
 *
 * Same ordering as estimate offers and for the same reason: the partial unique
 * index on (job_id) where status = 'sent' is what stops a double-tap texting the
 * same customer twice, and it can only do that if the row exists first. A failed
 * send deletes it again.
 */
export async function createRescheduleOffer(
  supabase: SupabaseClient,
  input: CreateRescheduleInput,
): Promise<RescheduleOffer> {
  const { data, error } = await supabase
    .from('reschedule_offers')
    .insert({
      account_id: input.accountId,
      job_id: input.jobId,
      crew_id: input.crewId,
      status: 'sent',
      from_date: input.fromDate,
      to_date: input.toDate,
      window_start: input.windowStart,
      window_end: input.windowEnd,
      arrival_time: input.arrivalTime,
      discount_percent: input.discountPercent,
      near_miles: input.nearMiles,
      saved_miles: input.savedMiles,
      saved_minutes: input.savedMinutes,
      phone: input.phone,
      body: input.body,
    })
    .select(OFFER_FIELDS)
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('You have already asked this customer to move — wait for their answer.');
    if (isMissingTable(error) || isMissingColumn(error)) {
      throw new RescheduleUnavailableError('Reschedule offers are not set up on this database yet.');
    }
    throw error;
  }
  return data as unknown as RescheduleOffer;
}

/** Undoes an offer whose text never left. Hard delete — see estimate-offers. */
export async function deleteRescheduleOffer(supabase: SupabaseClient, accountId: string, offerId: string): Promise<void> {
  const { error } = await supabase
    .from('reschedule_offers')
    .delete()
    .eq('account_id', accountId)
    .eq('id', offerId)
    .eq('status', 'sent');
  if (error) console.error('Reschedule offer rollback failed:', error.message);
}

/** Withdraws the ask without contacting the customer again. */
export async function cancelRescheduleOffer(supabase: SupabaseClient, accountId: string, offerId: string): Promise<void> {
  const { error } = await supabase
    .from('reschedule_offers')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', offerId)
    .eq('status', 'sent');
  if (error) throw error;
}

// -- Answering -----------------------------------------------------------------

export type ReplyOutcome = { handled: boolean; reply: string | null };

type OfferWithJob = RescheduleOffer & {
  job: { id: string; ref: string | null; client_name: string | null; quoted_amount: number | null; scheduled_for: string | null } | null;
  account: { business_name: string | null; alert_phone: string | null } | null;
};

/**
 * The customer texted back.
 *
 * Runs on the service-role client from the Twilio webhook. Never throws: an
 * inbound webhook that errors gets retried, and a retry here would mean a second
 * confirmation text for one yes — or worse, a second discount.
 */
export async function resolveRescheduleReply(phone: string, rawBody: string): Promise<ReplyOutcome> {
  const nothing: ReplyOutcome = { handled: false, reply: null };
  try {
    const admin = createAdminClient();
    const normalized = normalizeUsPhone(phone) ?? phone.trim();

    const { data, error } = await admin
      .from('reschedule_offers')
      .select(
        `${OFFER_FIELDS}, job:jobs(id, ref, client_name, quoted_amount, scheduled_for), account:accounts(business_name, alert_phone)`,
      )
      .eq('phone', normalized)
      .eq('status', 'sent')
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return nothing;
    const offer = data as unknown as OfferWithJob;
    const decision = parseRescheduleReply(rawBody);
    // The site's name first, and never the "My Business" placeholder — this
    // goes into an auto-reply a homeowner reads. See src/lib/business-name.ts.
    const businessName = await loadBusinessName(admin, offer.account_id, 'your contractor');
    const clientName = greetingName(offer.job?.client_name ?? null);
    const windowLabel = storedWindowLabel(offer);
    const newDay = friendlyDate(offer.to_date);

    // Anything that isn't a clear yes or no is a message for the contractor, not
    // an answer. The offer stays open — they may still say yes — and the text is
    // already in the inbox by the time we get here.
    if (decision === 'unclear') {
      if (offer.forwarded_at) return { handled: true, reply: null };
      await admin
        .from('reschedule_offers')
        .update({ forwarded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', offer.id);
      return replyTo(admin, offer, `Thanks ${clientName} — we've passed that to ${businessName} and they'll come back to you shortly.`);
    }

    if (decision === 'decline') {
      await admin
        .from('reschedule_offers')
        .update({
          status: 'declined',
          replied_at: new Date().toISOString(),
          reply_body: rawBody.slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq('id', offer.id)
        .eq('status', 'sent');
      await notifyOwner(offer, `${offer.job?.client_name || 'A customer'} said NO to moving ${offer.job?.ref ?? 'their job'} — it stays where it is.`);
      // Nothing about their booking changed, and saying so plainly is the point:
      // the one fear a "can we move you" text creates is that it already moved.
      return replyTo(admin, offer, `No problem ${clientName} — you're still booked for your original time. Nothing has changed.`);
    }

    // A yes. Move the job, then record the discount on it. In that order: if the
    // move fails there is nothing to discount, whereas a discount recorded
    // against a job that never moved is money given away for nothing.
    const moved = await applyAcceptedReschedule(admin, offer);
    if (!moved) {
      await notifyOwner(offer, `${offer.job?.client_name || 'A customer'} said YES to moving ${offer.job?.ref ?? 'their job'} to ${newDay} but we could not move it. Do it by hand.`);
      return replyTo(admin, offer, `Thanks ${clientName}! ${businessName} has your reply and will confirm the new time with you shortly.`);
    }

    await notifyOwner(
      offer,
      `${offer.job?.client_name || 'A customer'} said YES — ${offer.job?.ref ?? 'their job'} moved to ${newDay}, ${offer.discount_percent}% off applied.`,
    );
    return replyTo(
      admin,
      offer,
      `You're moved, ${clientName} — ${newDay}, ${windowLabel}. The ${offer.discount_percent}% comes off your final bill. Thanks for being flexible.`,
    );
  } catch (error) {
    console.error('Reschedule offer reply failed:', error instanceof Error ? error.message : error);
    return nothing;
  }
}

/**
 * Moves the job and records what it cost to move it.
 *
 * The discount goes on the JOB, not just the offer row, because the invoice is
 * what has to honour it and that may be raised weeks later by somebody reading
 * the job and nothing else. `agreed_at` is kept so the line on the bill can say
 * when this was agreed rather than asserting it out of nowhere.
 */
async function applyAcceptedReschedule(admin: SupabaseClient, offer: OfferWithJob): Promise<boolean> {
  const now = new Date().toISOString();

  const { error: jobError } = await admin
    .from('jobs')
    .update({
      scheduled_for: offer.to_date,
      scheduled_time: offer.arrival_time,
      reschedule_discount_percent: offer.discount_percent,
      reschedule_discount_note: `Agreed to move from ${offer.from_date} to ${offer.to_date}`,
      reschedule_discount_agreed_at: now,
      // No updated_at here: `jobs` does not have one. Including it failed the
      // whole write, and PostgREST reports that as an unknown column rather
      // than as an error about the columns that mattered.
    })
    .eq('id', offer.job_id)
    .eq('account_id', offer.account_id);

  if (jobError) {
    console.error('Reschedule accepted but the job could not be moved:', jobError.message);
    return false;
  }

  await admin
    .from('reschedule_offers')
    .update({ status: 'accepted', replied_at: now, reply_body: 'YES', updated_at: now })
    .eq('id', offer.id);

  await recordAccountEvent({
    accountId: offer.account_id,
    kind: 'automation_toggled',
    summary: `${offer.job?.client_name || 'A customer'} agreed to move ${offer.job?.ref ?? 'a job'} to ${offer.to_date} for ${offer.discount_percent}% off`,
    meta: {
      source: 'reschedule_offer',
      offer_id: offer.id,
      job_id: offer.job_id,
      from_date: offer.from_date,
      to_date: offer.to_date,
      discount_percent: offer.discount_percent,
    },
  });

  return true;
}

async function replyTo(admin: SupabaseClient, offer: OfferWithJob, message: string): Promise<ReplyOutcome> {
  try {
    await logOutboundMessage(admin, offer.account_id, offer.phone, message);
  } catch (error) {
    console.error('Reschedule reply log failed:', error instanceof Error ? error.message : error);
  }
  return { handled: true, reply: message };
}

async function notifyOwner(offer: OfferWithJob, message: string): Promise<void> {
  const alertPhone = offer.account?.alert_phone;
  if (!alertPhone) return;
  // accountId so the sender can check whether this owner replied STOP —
  // consent rows are keyed (account_id, phone_number).
  await sendOwnerEstimateAcceptedSms({ accountId: offer.account_id, alertPhone, message });
}

function friendlyDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}
