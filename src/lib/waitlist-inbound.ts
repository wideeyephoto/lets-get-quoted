import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeUsPhone } from '@/lib/phone';
import { loadBusinessName } from '@/lib/business-name';
import { enqueueSmsDelivery } from '@/lib/sms-delivery';
import { recordAccountEvent } from '@/lib/account-events';
import {
  dayWord,
  formatWaitlistWindowLabel,
  parseWaitlistOfferReply,
  type WaitlistOffer,
} from '@/lib/cancellation-waitlist';
import { resolveWaitlistOfferReply } from '@/lib/cancellation-waitlist-data';

export type WaitlistInboundReplyInput = {
  accountId?: string | null;
  fromPhone: string;
  body: string;
};

export type WaitlistInboundReplyResult = {
  handled: boolean;
  decision?: 'accepted' | 'declined' | 'ambiguous';
  offerId?: string;
  reason?: string;
};

/**
 * Evaluates an inbound SMS to see if it is a reply to an active, pending
 * cancellation waitlist offer. If so, resolves the offer, reschedules the job
 * (if accepted) or cascades to the next candidate (if declined), sends an
 * acknowledgement SMS to the customer, and audits the transition.
 */
export async function handleWaitlistInboundReply(
  admin: SupabaseClient,
  input: WaitlistInboundReplyInput,
): Promise<WaitlistInboundReplyResult> {
  const normalizedFrom = normalizeUsPhone(input.fromPhone);
  if (!normalizedFrom) {
    return { handled: false, reason: 'Invalid phone format' };
  }

  const now = new Date();
  const nowIso = now.toISOString();

  // Look for active pending offers for this phone number with valid holds
  let query = admin
    .from('waitlist_offers')
    .select('*')
    .eq('phone', normalizedFrom)
    .eq('status', 'pending')
    .gte('hold_expires_at', nowIso)
    .order('sent_at', { ascending: false });

  if (input.accountId) {
    query = query.eq('account_id', input.accountId);
  }

  const { data: activeOffers, error: fetchErr } = await query.limit(1);

  if (fetchErr) {
    console.error('Failed to query waitlist offers for inbound reply:', fetchErr);
    return { handled: false, reason: fetchErr.message };
  }

  const offer = (activeOffers && activeOffers.length > 0)
    ? (activeOffers[0] as unknown as WaitlistOffer)
    : null;

  if (!offer) {
    // Check if customer replied to a recently expired offer (within 24h)
    const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    let expiredQuery = admin
      .from('waitlist_offers')
      .select('*')
      .eq('phone', normalizedFrom)
      .in('status', ['expired', 'pending'])
      .gte('sent_at', cutoff24h)
      .order('sent_at', { ascending: false });

    if (input.accountId) {
      expiredQuery = expiredQuery.eq('account_id', input.accountId);
    }

    const { data: expiredOffers } = await expiredQuery.limit(1);
    if (expiredOffers && expiredOffers.length > 0) {
      const expired = expiredOffers[0] as unknown as WaitlistOffer;
      const parsed = parseWaitlistOfferReply(input.body);

      // Only respond if they actually replied YES or NO to the expired offer
      if (parsed.decision === 'accepted' || parsed.decision === 'declined') {
        const businessName = await loadBusinessName(admin, expired.account_id);
        const expiredNotice = `${businessName}: This opening is no longer available as the hold time elapsed. You remain on the waitlist for future openings. Reply STOP to opt out.`;

        await enqueueSmsDelivery({
          accountId: expired.account_id,
          phoneNumber: normalizedFrom,
          body: expiredNotice,
          messageKind: 'waitlist_offer',
          billingCategory: 'customer_message',
          context: 'customer',
          idempotencyKey: `waitlist-expired-reply:${expired.id}`,
        });

        return {
          handled: true,
          decision: parsed.decision,
          offerId: expired.id,
          reason: 'Offer hold expired',
        };
      }
    }

    return { handled: false, reason: 'No matching waitlist offer found' };
  }

  const reply = parseWaitlistOfferReply(input.body);

  if (reply.decision === 'accepted') {
    await resolveWaitlistOfferReply(admin, offer.id, input.body, offer.account_id);

    const businessName = await loadBusinessName(admin, offer.account_id);
    const todayKey = nowIso.split('T')[0];
    const dayText = dayWord(offer.opened_slot_date, todayKey);
    const windowLabel = formatWaitlistWindowLabel(offer.window_start, offer.window_end);

    const confirmationBody = `${businessName}: Great news! Your appointment is confirmed for ${dayText}, ${windowLabel}. See you then! Reply STOP to opt out.`;

    await enqueueSmsDelivery({
      accountId: offer.account_id,
      phoneNumber: normalizedFrom,
      body: confirmationBody,
      messageKind: 'waitlist_offer',
      billingCategory: 'customer_message',
      context: 'customer',
      idempotencyKey: `waitlist-accept-ack:${offer.id}`,
    });

    await recordAccountEvent({
      accountId: offer.account_id,
      kind: 'automation_toggled',
      summary: `Customer claimed newly opened spot on ${offer.opened_slot_date} (${windowLabel}) via SMS`,
    });

    return { handled: true, decision: 'accepted', offerId: offer.id };
  }

  if (reply.decision === 'declined') {
    await resolveWaitlistOfferReply(admin, offer.id, input.body, offer.account_id);

    const businessName = await loadBusinessName(admin, offer.account_id);
    const declineBody = `${businessName}: Thanks for letting us know! You're still on our waitlist and we will text you when another spot opens up. Reply STOP to opt out.`;

    await enqueueSmsDelivery({
      accountId: offer.account_id,
      phoneNumber: normalizedFrom,
      body: declineBody,
      messageKind: 'waitlist_offer',
      billingCategory: 'customer_message',
      context: 'customer',
      idempotencyKey: `waitlist-decline-ack:${offer.id}`,
    });

    await recordAccountEvent({
      accountId: offer.account_id,
      kind: 'automation_toggled',
      summary: `Customer declined waitlist spot on ${offer.opened_slot_date} via SMS (cascaded to next candidate)`,
    });

    return { handled: true, decision: 'declined', offerId: offer.id };
  }

  // Ambiguous response: record customer's text on the offer so contractor can review it
  await admin
    .from('waitlist_offers')
    .update({
      replied_at: nowIso,
      reply_body: input.body,
      updated_at: nowIso,
    })
    .eq('id', offer.id)
    .eq('account_id', offer.account_id);

  return { handled: true, decision: 'ambiguous', offerId: offer.id };
}
