import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import { loadBusinessName } from '@/lib/business-name';
import { normalizeUsPhone } from '@/lib/phone';
import { recordAccountEvent } from '@/lib/account-events';
import { coordOf, type LatLng } from '@/lib/distance';
import { enqueueSmsDelivery } from '@/lib/sms-delivery';
import {
  composeWaitlistOfferMessage,
  dayWord,
  draftWaitlistOfferBody,
  formatWaitlistWindowLabel,
  parseWaitlistOfferReply,
  rankWaitlistCandidates,
  type OpenedSlotWindow,
  type RankedWaitlistCandidate,
  type WaitlistEntry,
  type WaitlistOffer,
  type WaitlistOfferStatus,
  type WaitlistStatus,
  type WaitlistUrgency,
  type WaitlistWindow,
} from '@/lib/cancellation-waitlist';

export class WaitlistUnavailableError extends Error {}

function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === '42P01';
}

export type WaitlistContext = {
  available: boolean;
  entries: WaitlistEntry[];
  offers: WaitlistOffer[];
  activePendingOffers: WaitlistOffer[];
};

export async function loadWaitlistContext(
  supabase: SupabaseClient,
  accountId: string,
): Promise<WaitlistContext> {
  const [entriesRes, offersRes] = await Promise.all([
    supabase
      .from('cancellation_waitlist')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false }),
    supabase
      .from('waitlist_offers')
      .select('*')
      .eq('account_id', accountId)
      .order('sent_at', { ascending: false })
      .limit(50),
  ]);

  if (entriesRes.error) {
    if (isMissingTable(entriesRes.error)) {
      return { available: false, entries: [], offers: [], activePendingOffers: [] };
    }
    throw entriesRes.error;
  }

  const entries = (entriesRes.data ?? []) as unknown as WaitlistEntry[];
  const offers = (offersRes.data ?? []) as unknown as WaitlistOffer[];
  const activePendingOffers = offers.filter((o) => o.status === 'pending');

  return {
    available: true,
    entries,
    offers,
    activePendingOffers,
  };
}

export type CreateWaitlistInput = {
  clientId?: string | null;
  jobId?: string | null;
  leadId?: string | null;
  clientName: string;
  clientPhone: string;
  clientEmail?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  preferredDays?: number[];
  preferredWindow?: WaitlistWindow;
  earliestDate?: string | null;
  latestDate?: string | null;
  serviceName?: string | null;
  estimatedHours?: number;
  estimatedValue?: number | null;
  urgency?: WaitlistUrgency;
  notes?: string | null;
};

export async function addWaitlistEntry(
  supabase: SupabaseClient,
  accountId: string,
  input: CreateWaitlistInput,
): Promise<WaitlistEntry> {
  const normalizedPhone = normalizeUsPhone(input.clientPhone);
  if (!normalizedPhone) {
    throw new Error('Please enter a valid phone number.');
  }
  if (!input.clientName.trim()) {
    throw new Error('Client name is required.');
  }

  const { data: account } = await supabase
    .from('accounts')
    .select('cancellation_waitlist_enabled')
    .eq('id', accountId)
    .maybeSingle();

  if (!account?.cancellation_waitlist_enabled) {
    throw new Error('Cancellation waitlist is turned off for this account. Turn it on in schedule settings before adding entries.');
  }

  const row = {
    account_id: accountId,
    client_id: input.clientId ?? null,
    job_id: input.jobId ?? null,
    lead_id: input.leadId ?? null,
    client_name: input.clientName.trim(),
    client_phone: normalizedPhone,
    client_email: input.clientEmail?.trim() || null,
    address: input.address?.trim() || null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    preferred_days: input.preferredDays ?? [],
    preferred_window: input.preferredWindow ?? 'any',
    earliest_date: input.earliestDate || null,
    latest_date: input.latestDate || null,
    service_name: input.serviceName?.trim() || null,
    estimated_hours: input.estimatedHours && input.estimatedHours > 0 ? input.estimatedHours : 2.0,
    estimated_value: input.estimatedValue ?? 0,
    urgency: input.urgency ?? 'medium',
    notes: input.notes?.trim() || null,
    status: 'active' as WaitlistStatus,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('cancellation_waitlist')
    .insert(row)
    .select('*')
    .single();

  if (error) throw error;
  return data as unknown as WaitlistEntry;
}

export async function updateWaitlistEntry(
  supabase: SupabaseClient,
  accountId: string,
  id: string,
  updates: Partial<CreateWaitlistInput> & { status?: WaitlistStatus },
): Promise<WaitlistEntry> {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.clientName !== undefined) patch.client_name = updates.clientName.trim();
  if (updates.clientPhone !== undefined) patch.client_phone = normalizeUsPhone(updates.clientPhone) || updates.clientPhone;
  if (updates.clientEmail !== undefined) patch.client_email = updates.clientEmail?.trim() || null;
  if (updates.address !== undefined) patch.address = updates.address?.trim() || null;
  if (updates.lat !== undefined) patch.lat = updates.lat;
  if (updates.lng !== undefined) patch.lng = updates.lng;
  if (updates.preferredDays !== undefined) patch.preferred_days = updates.preferredDays;
  if (updates.preferredWindow !== undefined) patch.preferred_window = updates.preferredWindow;
  if (updates.earliestDate !== undefined) patch.earliest_date = updates.earliestDate || null;
  if (updates.latestDate !== undefined) patch.latest_date = updates.latestDate || null;
  if (updates.serviceName !== undefined) patch.service_name = updates.serviceName?.trim() || null;
  if (updates.estimatedHours !== undefined) patch.estimated_hours = updates.estimatedHours;
  if (updates.estimatedValue !== undefined) patch.estimated_value = updates.estimatedValue;
  if (updates.urgency !== undefined) patch.urgency = updates.urgency;
  if (updates.notes !== undefined) patch.notes = updates.notes?.trim() || null;
  if (updates.status !== undefined) patch.status = updates.status;

  const { data, error } = await supabase
    .from('cancellation_waitlist')
    .update(patch)
    .eq('id', id)
    .eq('account_id', accountId)
    .select('*')
    .single();

  if (error) throw error;
  return data as unknown as WaitlistEntry;
}

export async function removeWaitlistEntry(
  supabase: SupabaseClient,
  accountId: string,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from('cancellation_waitlist')
    .update({ status: 'removed', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('account_id', accountId);

  if (error) throw error;
}

/**
 * Finds and priority-ranks all qualified waitlisted customers for an opened slot.
 */
export async function findCandidatesForOpenedWindow(
  supabase: SupabaseClient,
  accountId: string,
  slot: OpenedSlotWindow,
): Promise<RankedWaitlistCandidate[]> {
  // 1. Fetch active waitlist entries
  const { data: entries, error } = await supabase
    .from('cancellation_waitlist')
    .select('*')
    .eq('account_id', accountId)
    .eq('status', 'active');

  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }

  const candidates = (entries ?? []) as unknown as WaitlistEntry[];
  if (candidates.length === 0) return [];

  // 2. Fetch existing scheduled jobs on that date to serve as route anchors
  const { data: dayJobs } = await supabase
    .from('jobs')
    .select('lat, lng')
    .eq('account_id', accountId)
    .eq('scheduled_for', slot.dateKey)
    .neq('status', 'archived')
    .not('lat', 'is', null);

  const anchors: LatLng[] = (dayJobs ?? [])
    .map((j) => coordOf(j as { lat: number | null; lng: number | null }))
    .filter((c): c is LatLng => c !== null);

  // 3. Rank candidates
  return rankWaitlistCandidates({
    candidates,
    slot,
    anchors,
    now: new Date(),
  });
}

/**
 * Creates a time-limited offer for the candidate, saves to waitlist_offers, and dispatches SMS.
 */
export async function createAndSendWaitlistOffer(
  supabase: SupabaseClient,
  accountId: string,
  input: {
    waitlistEntryId: string;
    slot: OpenedSlotWindow;
    rank: number;
    score: RankedWaitlistCandidate['score'];
    holdMinutes?: number;
    customBody?: string;
    autoCascade?: boolean;
    todayKey?: string;
  },
): Promise<WaitlistOffer> {
  const holdMinutes = input.holdMinutes ?? 30;
  const now = new Date();
  const holdExpiresAt = new Date(now.getTime() + holdMinutes * 60 * 1000).toISOString();

  // Load waitlist entry
  const { data: entryData, error: entryErr } = await supabase
    .from('cancellation_waitlist')
    .select('*')
    .eq('id', input.waitlistEntryId)
    .eq('account_id', accountId)
    .single();

  if (entryErr || !entryData) {
    throw new Error('Waitlist entry not found.');
  }
  const entry = entryData as unknown as WaitlistEntry;

  const { data: account } = await supabase
    .from('accounts')
    .select('cancellation_waitlist_enabled')
    .eq('id', accountId)
    .maybeSingle();

  if (!account?.cancellation_waitlist_enabled) {
    throw new Error('Cancellation waitlist is turned off for this account. Turn it on in schedule settings before sending offers.');
  }

  const businessName = await loadBusinessName(supabase, accountId);
  const todayKey = input.todayKey ?? now.toISOString().split('T')[0];
  const dayText = dayWord(input.slot.dateKey, todayKey);
  const windowLabel = formatWaitlistWindowLabel(input.slot.windowStart, input.slot.windowEnd);

  const bodyContent =
    input.customBody?.trim() ||
    draftWaitlistOfferBody({
      clientName: entry.client_name,
      dayText,
      windowLabel,
      serviceName: entry.service_name,
      holdMinutes,
    });

  const fullMessage = composeWaitlistOfferMessage(businessName, bodyContent);

  const offerRow = {
    account_id: accountId,
    waitlist_entry_id: entry.id,
    client_id: entry.client_id,
    job_id: entry.job_id,
    lead_id: entry.lead_id,
    opened_slot_date: input.slot.dateKey,
    window_start: input.slot.windowStart,
    window_end: input.slot.windowEnd,
    arrival_time: input.slot.arrivalTime || input.slot.windowStart,
    status: 'pending' as WaitlistOfferStatus,
    priority_rank: input.rank,
    priority_score: input.score.totalScore,
    score_breakdown: input.score,
    hold_minutes: holdMinutes,
    hold_expires_at: holdExpiresAt,
    auto_cascade: input.autoCascade ?? true,
    phone: entry.client_phone,
    body: fullMessage,
    sent_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  const { data: createdOffer, error: offerErr } = await supabase
    .from('waitlist_offers')
    .insert(offerRow)
    .select('*')
    .single();

  if (offerErr) throw offerErr;

  // Update waitlist entry status
  await supabase
    .from('cancellation_waitlist')
    .update({ status: 'offered', updated_at: now.toISOString() })
    .eq('id', entry.id);

  // Send SMS
  const toPhone = normalizeUsPhone(entry.client_phone);
  if (toPhone) {
    await enqueueSmsDelivery({
      accountId,
      phoneNumber: toPhone,
      body: fullMessage,
      messageKind: 'waitlist_offer',
      billingCategory: 'customer_message',
      context: 'customer',
      idempotencyKey: `waitlist-offer:${createdOffer.id}`,
    });
  }

  await recordAccountEvent({
    accountId,
    kind: 'automation_settings_changed',
    summary: `Offered newly opened slot on ${input.slot.dateKey} to ${entry.client_name} (Rank #${input.rank})`,
  });

  return createdOffer as unknown as WaitlistOffer;
}

/**
 * Resolves an inbound text reply or manual action on a waitlist offer.
 */
export async function resolveWaitlistOfferReply(
  supabase: SupabaseClient,
  offerId: string,
  rawReply: string,
): Promise<{ decision: 'accepted' | 'declined' | 'ambiguous'; offer: WaitlistOffer }> {
  const replyDecision = parseWaitlistOfferReply(rawReply);
  const now = new Date().toISOString();

  const { data: offerData, error: fetchErr } = await supabase
    .from('waitlist_offers')
    .select('*')
    .eq('id', offerId)
    .single();

  if (fetchErr || !offerData) throw new Error('Offer not found.');
  const offer = offerData as unknown as WaitlistOffer;

  if (offer.status !== 'pending') {
    return { decision: replyDecision.decision === 'accepted' ? 'accepted' : 'declined', offer };
  }

  if (replyDecision.decision === 'accepted') {
    // 1. Mark offer accepted
    const { data: updatedOffer } = await supabase
      .from('waitlist_offers')
      .update({
        status: 'accepted',
        replied_at: now,
        reply_body: rawReply,
        updated_at: now,
      })
      .eq('id', offerId)
      .select('*')
      .single();

    // 2. Mark waitlist entry fulfilled
    await supabase
      .from('cancellation_waitlist')
      .update({ status: 'fulfilled', updated_at: now })
      .eq('id', offer.waitlist_entry_id);

    // 3. If tied to a job, reschedule the job to this new date/time
    if (offer.job_id) {
      await supabase
        .from('jobs')
        .update({
          scheduled_for: offer.opened_slot_date,
          scheduled_time: offer.arrival_time,
          status: 'scheduled',
          updated_at: now,
        })
        .eq('id', offer.job_id);
    }

    return { decision: 'accepted', offer: (updatedOffer ?? offer) as WaitlistOffer };
  } else if (replyDecision.decision === 'declined') {
    // Mark offer declined & restore waitlist entry to active
    const { data: updatedOffer } = await supabase
      .from('waitlist_offers')
      .update({
        status: 'declined',
        replied_at: now,
        reply_body: rawReply,
        updated_at: now,
      })
      .eq('id', offerId)
      .select('*')
      .single();

    await supabase
      .from('cancellation_waitlist')
      .update({ status: 'active', updated_at: now })
      .eq('id', offer.waitlist_entry_id);

    // If auto_cascade, cascade to next candidate
    if (offer.auto_cascade) {
      await cascadeToNextCandidate(supabase, offer);
    }

    return { decision: 'declined', offer: (updatedOffer ?? offer) as WaitlistOffer };
  }

  return { decision: 'ambiguous', offer };
}

/**
 * Sweeps expired holds and cascades to the next qualified waitlist candidate.
 */
export async function expireHoldsAndCascade(
  supabase: SupabaseClient,
  accountId?: string,
): Promise<{ expiredCount: number; cascadedCount: number }> {
  const now = new Date().toISOString();

  let query = supabase
    .from('waitlist_offers')
    .select('*')
    .eq('status', 'pending')
    .lte('hold_expires_at', now);

  if (accountId) query = query.eq('account_id', accountId);

  const { data: expiredOffers, error } = await query;
  if (error || !expiredOffers) return { expiredCount: 0, cascadedCount: 0 };

  let expiredCount = 0;
  let cascadedCount = 0;

  for (const row of expiredOffers) {
    const offer = row as unknown as WaitlistOffer;

    // Mark offer expired
    await supabase
      .from('waitlist_offers')
      .update({ status: 'expired', updated_at: now })
      .eq('id', offer.id);

    // Restore waitlist entry to active
    await supabase
      .from('cancellation_waitlist')
      .update({ status: 'active', updated_at: now })
      .eq('id', offer.waitlist_entry_id);

    expiredCount++;

    if (offer.auto_cascade) {
      const cascaded = await cascadeToNextCandidate(supabase, offer);
      if (cascaded) cascadedCount++;
    }
  }

  return { expiredCount, cascadedCount };
}

async function cascadeToNextCandidate(
  supabase: SupabaseClient,
  previousOffer: WaitlistOffer,
): Promise<WaitlistOffer | null> {
  const { data: account } = await supabase
    .from('accounts')
    .select('cancellation_waitlist_enabled')
    .eq('id', previousOffer.account_id)
    .maybeSingle();

  if (!account?.cancellation_waitlist_enabled) {
    return null;
  }

  const slot: OpenedSlotWindow = {
    dateKey: previousOffer.opened_slot_date,
    windowStart: previousOffer.window_start,
    windowEnd: previousOffer.window_end,
    arrivalTime: previousOffer.arrival_time,
  };

  const candidates = await findCandidatesForOpenedWindow(supabase, previousOffer.account_id, slot);
  // Filter out candidates already offered or waitlist entry of the previous offer
  const eligible = candidates.filter((c) => c.entry.id !== previousOffer.waitlist_entry_id);
  if (eligible.length === 0) return null;

  const nextCandidate = eligible[0];
  return createAndSendWaitlistOffer(supabase, previousOffer.account_id, {
    waitlistEntryId: nextCandidate.entry.id,
    slot,
    rank: previousOffer.priority_rank + 1,
    score: nextCandidate.score,
    holdMinutes: previousOffer.hold_minutes,
    autoCascade: true,
  });
}

export async function cancelWaitlistOffer(
  supabase: SupabaseClient,
  accountId: string,
  offerId: string,
): Promise<void> {
  const { data: offer } = await supabase
    .from('waitlist_offers')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('id', offerId)
    .eq('account_id', accountId)
    .select('waitlist_entry_id')
    .single();

  if (offer?.waitlist_entry_id) {
    await supabase
      .from('cancellation_waitlist')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', offer.waitlist_entry_id);
  }
}
