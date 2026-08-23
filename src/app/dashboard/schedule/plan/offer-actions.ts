'use server';

import { revalidatePath } from 'next/cache';
import { requireOwnerContext } from '@/lib/auth';
import { recordAccountEvent } from '@/lib/account-events';
import { normalizeUsPhone } from '@/lib/phone';
import { isPhoneOptedOut, recordSmsConsent, sendEstimateOfferSms } from '@/lib/sms';
import {
  composeOfferMessage,
  DEFAULT_ESTIMATE_MINUTES,
  DEFAULT_HOLD_MINUTES,
  ESTIMATE_VISIT_OPTIONS,
  HOLD_MINUTE_OPTIONS,
  minutesFromTime,
  offerBodyProblem,
  timeFromMinutes,
  windowProblem,
} from '@/lib/estimate-offers';
import { cancelOffer, createOffer, deleteOffer } from '@/lib/estimate-offers-data';

// Sending a lead an estimate offer, and taking the slot back.
//
// The one thing these actions never do is compose a message. The contractor read
// the text and pressed send; what arrives at the homeowner's phone is the body
// they approved inside an envelope they can see. Everything else here is the
// checking that has to happen server-side because a form can say anything.

export type OfferActionState = { ok: boolean; message: string | null };

export const IDLE_OFFER_STATE: OfferActionState = { ok: false, message: null };

function fail(message: string): OfferActionState {
  return { ok: false, message };
}

function revalidatePlan(): void {
  revalidatePath('/dashboard/schedule/plan');
  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/leads');
}

export async function sendEstimateOfferAction(
  _previous: OfferActionState,
  formData: FormData,
): Promise<OfferActionState> {
  const { supabase, accountId, userEmail } = await requireOwnerContext();

  const leadId = String(formData.get('leadId') ?? '').trim();
  const dateKey = String(formData.get('dateKey') ?? '').trim();
  const crewId = String(formData.get('crewId') ?? '').trim() || null;
  const body = String(formData.get('body') ?? '');
  const afterStopId = String(formData.get('afterStopId') ?? '').trim() || null;

  if (!leadId || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return fail('Something went wrong reading that suggestion. Reload the page and try again.');

  const bodyProblem = offerBodyProblem(body);
  if (bodyProblem) return fail(bodyProblem);

  const startMinutes = minutesFromTime(String(formData.get('windowStart') ?? ''));
  const endMinutes = minutesFromTime(String(formData.get('windowEnd') ?? ''));
  const arrivalMinutes = minutesFromTime(String(formData.get('arrivalTime') ?? ''));
  if (startMinutes == null || endMinutes == null || arrivalMinutes == null) return fail('That arrival window is not a real time.');
  const problem = windowProblem({ startMinutes, endMinutes, arrivalMinutes });
  if (problem) return fail(problem);

  // Only the values the panel actually offers. A hand-edited hold of eight hours
  // would reserve a slot the contractor never agreed to give up.
  const holdMinutes = Number(formData.get('holdMinutes'));
  const visitMinutes = Number(formData.get('visitMinutes'));
  const hold = (HOLD_MINUTE_OPTIONS as readonly number[]).includes(holdMinutes) ? holdMinutes : DEFAULT_HOLD_MINUTES;
  const visit = (ESTIMATE_VISIT_OPTIONS as readonly number[]).includes(visitMinutes) ? visitMinutes : DEFAULT_ESTIMATE_MINUTES;

  // The lead is re-read here rather than trusted from the form: the browser
  // knows an id, and the phone number we text has to come from the database.
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('id, name, phone, converted_job, quote_visit')
    .eq('account_id', accountId)
    .eq('id', leadId)
    .maybeSingle();
  if (leadError || !lead) return fail("Couldn't find that lead any more.");
  if (lead.converted_job || lead.quote_visit) return fail('That lead already has a visit booked — nothing was sent.');

  const phone = lead.phone ? normalizeUsPhone(String(lead.phone)) : null;
  if (!phone) return fail('There is no mobile number on that lead, so there is nobody to text.');
  if (await isPhoneOptedOut(accountId, phone)) return fail('That number has opted out of texts, so we did not send anything.');

  try {
    await recordSmsConsent(accountId, phone, 'estimate_offer');
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'That number cannot be texted.');
  }

  const detourMilesRaw = Number(formData.get('detourMiles'));
  const detourMinutesRaw = Number(formData.get('detourMinutes'));

  // Written before the text goes out — the unique index on lead_id is what makes
  // a double-tap physically unable to text the same homeowner twice.
  let offerId: string;
  try {
    const offer = await createOffer(supabase, {
      accountId,
      leadId,
      crewId,
      dateKey,
      phone,
      body: body.trim(),
      windowStart: timeFromMinutes(startMinutes),
      windowEnd: timeFromMinutes(endMinutes),
      arrivalTime: timeFromMinutes(arrivalMinutes),
      visitMinutes: visit,
      holdMinutes: hold,
      detourMiles: Number.isFinite(detourMilesRaw) ? detourMilesRaw : null,
      detourMinutes: Number.isFinite(detourMinutesRaw) ? Math.round(detourMinutesRaw) : null,
      afterStopId,
    });
    offerId = offer.id;
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Couldn't hold that slot, so nothing was sent.");
  }

  const { data: account } = await supabase.from('accounts').select('business_name').eq('id', accountId).maybeSingle();
  const businessName = (account?.business_name as string) || "Let's Get Quoted";
  const message = composeOfferMessage(businessName, body);

  let smsEventId: string;
  try {
    smsEventId = await sendEstimateOfferSms({
      accountId,
      toPhone: phone,
      message,
      idempotencyKey: `estimate-offer:${offerId}`,
    });
  } catch (error) {
    // No durable queue intent exists. Drop the record so the slot is released AND this lead
    // can be offered again — a provider hiccup must not burn the one ask we get.
    await deleteOffer(supabase, accountId, offerId);
    console.error('Estimate offer send failed:', error instanceof Error ? error.message : error);
    return fail("The text didn't send, so the slot has been released. Nothing reached them — try again.");
  }

  await recordAccountEvent({
    accountId,
    kind: 'automation_toggled',
    summary: `Queued an estimate-slot offer for ${lead.name || 'a lead'} on ${dateKey}, held ${hold} min`,
    actorEmail: userEmail,
    meta: { source: 'estimate_offer', offer_id: offerId, lead_id: leadId, hold_minutes: hold, sms_event_id: smsEventId },
  });

  revalidatePlan();
  return { ok: true, message: `Queued. ${lead.name || 'They'} have ${hold} minutes to reply once it arrives — the slot is yours until then.` };
}

export async function releaseEstimateOfferAction(
  _previous: OfferActionState,
  formData: FormData,
): Promise<OfferActionState> {
  const { supabase, accountId } = await requireOwnerContext();
  const offerId = String(formData.get('offerId') ?? '').trim();
  if (!offerId) return fail('Nothing to release.');

  try {
    await cancelOffer(supabase, accountId, offerId);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Couldn't release that slot.");
  }

  revalidatePlan();
  // Said plainly on purpose: the homeowner was asked a question and is not being
  // told it's withdrawn, so if they answer late they get the "that time's gone"
  // reply and you get told they were interested.
  return { ok: true, message: 'Slot released. We have not texted them again — if they reply late you will still hear about it.' };
}
