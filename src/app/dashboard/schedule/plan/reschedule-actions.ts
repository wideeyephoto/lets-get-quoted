'use server';

import { revalidatePath } from 'next/cache';
import { requireOwnerContext } from '@/lib/auth';
import { recordAccountEvent } from '@/lib/account-events';
import { normalizeUsPhone } from '@/lib/phone';
import { isPhoneOptedOut, recordSmsConsent, sendEstimateOfferSms } from '@/lib/sms';
import { formatTimeMinutes, parseTimeMinutes } from '@/lib/route-plan';
import {
  composeRescheduleMessage,
  discountProblem,
  type RescheduleActionState,
  rescheduleBodyProblem,
} from '@/lib/reschedule-offers';
import { cancelRescheduleOffer, createRescheduleOffer, deleteRescheduleOffer, findBetterDays } from '@/lib/reschedule-offers-data';
import { bookingAvailabilityFromAccount } from '@/lib/booking-availability';

// Asking a customer to move day, and withdrawing the ask.
//
// Same shape as offer-actions and the same rule: these never compose a message.
// The contractor read the text and pressed send. Everything here is the checking
// that has to happen server-side because a form can say anything — and on this
// one the form can also say what a job costs, so the discount gets checked twice
// before it is allowed anywhere near an invoice.

export type RescheduleDaySuggestionView = {
  dateKey: string;
  dayLabel: string;
  nearLabel: string;
  windowStart: string;
  windowEnd: string;
  arrivalTime: string;
  windowLabel: string;
};

export type SuggestDaysResult =
  | { ok: true; suggestions: RescheduleDaySuggestionView[]; clientName: string | null; quotedAmount: number }
  | { ok: false; message: string };

/**
 * Which days ahead are worth offering this customer.
 *
 * Called when the owner opens the panel rather than computed for every stop on
 * page load: it reads three weeks of the calendar, and a route with a dozen
 * stops would do that a dozen times for panels nobody opens.
 */
export async function suggestRescheduleDaysAction(input: {
  jobId: string;
  fromDate: string;
}): Promise<SuggestDaysResult> {
  const { supabase, accountId } = await requireOwnerContext();

  const { data: job, error } = await supabase
    .from('jobs')
    .select('id, client_name, client_phone, quoted_amount, lat, lng, scheduled_for, status')
    .eq('account_id', accountId)
    .eq('id', input.jobId)
    .maybeSingle();
  if (error || !job) return { ok: false, message: "Couldn't find that job." };
  if (!job.client_phone) return { ok: false, message: 'There is no mobile number on this job, so there is nobody to ask.' };
  if (job.lat == null || job.lng == null) {
    // Without a location there is no "we'll already be nearby" to claim, and
    // that sentence is the whole offer. Better to say so than to send a text
    // whose central promise we cannot check.
    return { ok: false, message: "This job has no map location, so we can't tell which day we'd already be near them." };
  }

  const { data: account } = await supabase
    .from('accounts')
    .select('schedule_day_hours, booking_windows, workday_start, workday_end')
    .eq('id', accountId)
    .maybeSingle();
  const availability = bookingAvailabilityFromAccount(account);

  const suggestions = await findBetterDays(supabase, accountId, {
    jobId: input.jobId,
    at: { lat: Number(job.lat), lng: Number(job.lng) },
    fromDate: input.fromDate,
    workDayHours: availability.capacityHours,
    windows: arrivalWindows(availability),
  });

  return {
    ok: true,
    clientName: (job.client_name as string | null) ?? null,
    quotedAmount: Number(job.quoted_amount) || 0,
    suggestions: suggestions.map((suggestion) => ({
      dateKey: suggestion.dateKey,
      dayLabel: new Date(`${suggestion.dateKey}T00:00:00`).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      }),
      nearLabel:
        suggestion.nearMiles < 1
          ? "you're on that street already"
          : `${suggestion.nearMiles.toFixed(1)} mi from a stop you already have`,
      windowStart: formatTimeMinutes(suggestion.window.startMinutes),
      windowEnd: formatTimeMinutes(suggestion.window.endMinutes),
      arrivalTime: formatTimeMinutes(suggestion.window.arrivalMinutes),
      windowLabel: suggestion.window.label,
    })),
  };
}

/**
 * The arrival windows to offer on the new day.
 *
 * Taken from the owner's published booking windows rather than invented: these
 * are the bands they already tell customers they arrive in, so a reschedule
 * promises the same thing online booking does. Each window runs to the start of
 * the next one, or to the end of the workday for the last.
 */
function arrivalWindows(availability: ReturnType<typeof bookingAvailabilityFromAccount>): Array<{ startMinutes: number; endMinutes: number }> {
  const dayEnd = parseTimeMinutes(availability.workdayEnd) ?? 17 * 60;
  const starts = availability.windowTimes
    .map((time) => parseTimeMinutes(time))
    .filter((value): value is number => value != null)
    .sort((a, b) => a - b);

  if (starts.length === 0) {
    const dayStart = parseTimeMinutes(availability.workdayStart) ?? 8 * 60;
    return [{ startMinutes: dayStart, endMinutes: Math.max(dayStart + 180, dayEnd) }];
  }

  return starts.map((start, index) => ({
    startMinutes: start,
    endMinutes: index + 1 < starts.length ? starts[index + 1] : dayEnd,
  }));
}

function fail(message: string): RescheduleActionState {
  return { ok: false, message };
}

function revalidatePlan(): void {
  revalidatePath('/dashboard/schedule/plan');
  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/jobs');
}

export async function sendRescheduleOfferAction(
  _previous: RescheduleActionState,
  formData: FormData,
): Promise<RescheduleActionState> {
  const { supabase, accountId, userEmail } = await requireOwnerContext();

  const jobId = String(formData.get('jobId') ?? '').trim();
  const fromDate = String(formData.get('fromDate') ?? '').trim();
  const toDate = String(formData.get('toDate') ?? '').trim();
  const crewId = String(formData.get('crewId') ?? '').trim() || null;
  const body = String(formData.get('body') ?? '');

  const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!jobId || !isDate(fromDate) || !isDate(toDate)) {
    return fail('Something went wrong reading that suggestion. Reload the page and try again.');
  }
  if (toDate === fromDate) return fail('That is the day it is already on.');
  if (toDate < fromDate) return fail('You can only offer to move a job forward, not into the past.');

  const bodyProblem = rescheduleBodyProblem(body);
  if (bodyProblem) return fail(bodyProblem);

  const discountPercent = Number(formData.get('discountPercent'));
  const discountIssue = discountProblem(discountPercent);
  if (discountIssue) return fail(discountIssue);

  const startMinutes = parseTimeMinutes(String(formData.get('windowStart') ?? ''));
  const endMinutes = parseTimeMinutes(String(formData.get('windowEnd') ?? ''));
  const arrivalMinutes = parseTimeMinutes(String(formData.get('arrivalTime') ?? ''));
  if (startMinutes == null || endMinutes == null || arrivalMinutes == null) return fail('That arrival window is not a real time.');
  if (endMinutes <= startMinutes) return fail('That arrival window ends before it starts.');
  if (arrivalMinutes < startMinutes || arrivalMinutes > endMinutes) return fail('The planned arrival has to sit inside the window.');

  // The job is re-read rather than trusted from the form: the browser knows an
  // id, and both the number we text and the money this discount comes off have
  // to come from the database.
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('id, ref, client_name, client_phone, quoted_amount, scheduled_for, status')
    .eq('account_id', accountId)
    .eq('id', jobId)
    .maybeSingle();
  if (jobError || !job) return fail("Couldn't find that job any more.");
  if (job.status === 'complete' || job.status === 'archived') return fail('That job is already finished — there is nothing to move.');
  if (job.scheduled_for !== fromDate) {
    // Somebody moved it in another tab. Sending now would text a customer about
    // a day their job is no longer on.
    return fail('That job has already been moved somewhere else. Reload the page.');
  }

  const phone = job.client_phone ? normalizeUsPhone(String(job.client_phone)) : null;
  if (!phone) return fail('There is no mobile number on that job, so there is nobody to text.');
  if (await isPhoneOptedOut(accountId, phone)) return fail('That number has opted out of texts, so we did not send anything.');

  try {
    await recordSmsConsent(accountId, phone, 'reschedule_offer');
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'That number cannot be texted.');
  }

  const nearMiles = Number(formData.get('nearMiles'));
  const savedMiles = Number(formData.get('savedMiles'));
  const savedMinutes = Number(formData.get('savedMinutes'));

  // Written before the text goes out — the partial unique index on job_id is
  // what makes a double-tap physically unable to ask the same customer twice.
  let offerId: string;
  try {
    const offer = await createRescheduleOffer(supabase, {
      accountId,
      jobId,
      crewId,
      fromDate,
      toDate,
      windowStart: formatTimeMinutes(startMinutes),
      windowEnd: formatTimeMinutes(endMinutes),
      arrivalTime: formatTimeMinutes(arrivalMinutes),
      discountPercent,
      nearMiles: Number.isFinite(nearMiles) ? nearMiles : null,
      savedMiles: Number.isFinite(savedMiles) ? savedMiles : null,
      savedMinutes: Number.isFinite(savedMinutes) ? Math.round(savedMinutes) : null,
      phone,
      body: body.trim(),
    });
    offerId = offer.id;
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Couldn't record that offer, so nothing was sent.");
  }

  const { data: account } = await supabase.from('accounts').select('business_name').eq('id', accountId).maybeSingle();
  const businessName = (account?.business_name as string) || "Let's Get Quoted";
  const message = composeRescheduleMessage(businessName, body);

  try {
    await sendEstimateOfferSms({ accountId, toPhone: phone, message });
  } catch (error) {
    // The text never left. Drop the record so this job can be asked about again
    // — a provider hiccup must not lock a customer out of being offered a move.
    await deleteRescheduleOffer(supabase, accountId, offerId);
    console.error('Reschedule offer send failed:', error instanceof Error ? error.message : error);
    return fail("The text didn't send, so nothing was recorded. Nothing reached them — try again.");
  }

  await recordAccountEvent({
    accountId,
    kind: 'automation_toggled',
    summary: `Asked ${job.client_name || 'a customer'} to move ${job.ref ?? 'a job'} from ${fromDate} to ${toDate} for ${discountPercent}% off`,
    actorEmail: userEmail,
    meta: { source: 'reschedule_offer', offer_id: offerId, job_id: jobId, from_date: fromDate, to_date: toDate, discount_percent: discountPercent },
  });

  revalidatePlan();
  // Says what has NOT happened, deliberately. Until they answer, the job is
  // still on today and today's route still has to include it.
  return {
    ok: true,
    message: `Sent. Nothing moves until they reply — ${job.client_name || 'they'} are still on today's route for now.`,
  };
}

export async function withdrawRescheduleOfferAction(
  _previous: RescheduleActionState,
  formData: FormData,
): Promise<RescheduleActionState> {
  const { supabase, accountId } = await requireOwnerContext();
  const offerId = String(formData.get('offerId') ?? '').trim();
  if (!offerId) return fail('Nothing to withdraw.');

  try {
    await cancelRescheduleOffer(supabase, accountId, offerId);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Couldn't withdraw that offer.");
  }

  revalidatePlan();
  // Same honesty as releasing an estimate slot: the customer was asked a
  // question and is not being told it's withdrawn. If they say yes later they
  // get told to call, and you hear about it.
  return { ok: true, message: 'Withdrawn. We have not texted them again — if they reply late you will still hear about it.' };
}
