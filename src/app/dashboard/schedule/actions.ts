'use server';

import { revalidatePath } from 'next/cache';
import { requireOwnerContext } from '@/lib/auth';
import { createAvailabilityBlock, createRecurringAvailabilityBlocks, deleteAvailabilityBlock, type RepeatFrequency } from '@/lib/availability-blocks';
import { confirmedSmsBody, declinedSmsBody, requestedWhenLabel } from '@/lib/booking-requests';
import { isMissingColumnError } from '@/lib/jobs';
import { sendBookingDecisionSms } from '@/lib/sms';

// Block off a day / date range as busy — it drops out of online booking and shows
// blocked on the calendar.
export async function addAvailabilityBlockAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const startDate = String(formData.get('startDate') ?? '').trim();
  const endDate = String(formData.get('endDate') ?? '').trim();
  const reason = String(formData.get('reason') ?? '').trim();
  await createAvailabilityBlock(supabase, accountId, { startDate, endDate, reason });
  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/schedule/booking');
}

// Repeating time off — the same weekday every week, fortnight, or month. Laid
// down as individual blocks (see the lib), so nothing else has to learn a new
// shape of data.
export async function addRecurringBlockAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const startDate = String(formData.get('startDate') ?? '').trim();
  const raw = String(formData.get('frequency') ?? 'weekly');
  const frequency: RepeatFrequency = raw === 'biweekly' || raw === 'monthly' ? raw : 'weekly';
  const occurrences = Number(formData.get('occurrences') ?? 8);
  const reason = String(formData.get('reason') ?? '').trim();
  await createRecurringAvailabilityBlocks(supabase, accountId, { startDate, frequency, occurrences, reason });
  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/schedule/booking');
}

export async function removeAvailabilityBlockAction(id: string) {
  const { supabase, accountId } = await requireOwnerContext();
  await deleteAvailabilityBlock(supabase, accountId, id);
  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/schedule/booking');
}

// Remove every block sharing a reason — how you undo a repeat in one go, since
// a repeat is laid down as one block per date.
export async function removeBlocksByReasonAction(reason: string) {
  const { supabase, accountId } = await requireOwnerContext();
  const trimmed = reason.trim();
  // An empty reason is the default for quick blocks, so matching on it would
  // wipe every unlabelled day at once.
  if (!trimmed) return;
  await supabase.from('availability_blocks').delete().eq('account_id', accountId).eq('reason', trimmed);
  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/schedule/booking');
}

// The master switch for the public booking page. Applied on its own rather than
// through the save bar: pausing is urgent, and it shouldn't need a second click.
export async function setBookingEnabledAction(enabled: boolean) {
  const { supabase, accountId } = await requireOwnerContext();
  const { error } = await supabase.from('accounts').update({ booking_enabled: enabled }).eq('id', accountId);
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/schedule/booking');
}

// ---------------------------------------------------------------------------
// Online booking requests: the contractor's yes or no.
//
// A self-serve booking arrives as a job with scheduled_for NULL and the chosen
// window on booking_requested_*. It is on nobody's calendar. These two actions
// are the only way out of that state, and confirming is the single moment the
// appointment becomes real.
// ---------------------------------------------------------------------------

type BookingDecisionRow = {
  client_phone?: string | null;
  booking_requested_date?: string | null;
  booking_requested_time?: string | null;
  booking_requested_end_time?: string | null;
  booking_alt_date?: string | null;
  booking_alt_time?: string | null;
  booking_alt_end_time?: string | null;
  booking_confirmed_at?: string | null;
  booking_declined_at?: string | null;
};

const DECISION_COLUMNS =
  'id, client_phone, booking_requested_date, booking_requested_time, booking_requested_end_time, booking_confirmed_at, booking_declined_at';

/**
 * The request as both decisions need to see it, second choice included.
 *
 * The alt columns arrive with their own migration and a select that names them
 * before it has run fails outright — which would take confirm and decline down
 * for every request, including the ones that have no backup at all. So it is
 * asked for once with them and once without.
 */
async function readBookingDecisionRow(
  supabase: Awaited<ReturnType<typeof requireOwnerContext>>['supabase'],
  accountId: string,
  jobId: string,
): Promise<BookingDecisionRow | null> {
  const get = (columns: string) =>
    supabase.from('jobs').select(columns).eq('id', jobId).eq('account_id', accountId).maybeSingle();
  const withAlt = await get(`${DECISION_COLUMNS}, booking_alt_date, booking_alt_time, booking_alt_end_time`);
  const { data, error } = isMissingColumnError(withAlt.error) ? await get(DECISION_COLUMNS) : withAlt;
  if (error) throw new Error(error.message);
  // Runtime column list (see above) defeats PostgREST's row inference.
  return (data ?? null) as unknown as BookingDecisionRow | null;
}

/**
 * Put one of the requested slots on the calendar and tell the customer.
 *
 * ORDER MATTERS. The calendar write happens first and the text second, because
 * the text says "confirmed" and must never be the thing that is true when the
 * booking isn't. The SMS is best-effort for the same reason in reverse: a
 * failed send must not undo an appointment the owner has agreed to.
 *
 * The update is guarded on the row still being pending, so a double-click or a
 * second tab cannot confirm twice and send the customer two texts.
 */
export async function confirmBookingRequestAction(jobId: string, choice: 'first' | 'alt' = 'first') {
  const { supabase, accountId } = await requireOwnerContext();

  const job = await readBookingDecisionRow(supabase, accountId, jobId);
  if (!job?.booking_requested_date) return;
  if (job.booking_confirmed_at || job.booking_declined_at) return;

  // Which window is being agreed to. Falling back to the first choice when
  // there is no backup on the record is what makes a stale button — a panel
  // rendered before the migration, or a second tab — confirm the time the
  // customer definitely asked for rather than nothing at all.
  const useAlt = choice === 'alt' && Boolean(job.booking_alt_date);
  const dateKey = useAlt ? (job.booking_alt_date as string) : job.booking_requested_date;
  const time = useAlt ? job.booking_alt_time ?? null : job.booking_requested_time ?? null;
  const endTime = useAlt ? job.booking_alt_end_time ?? null : job.booking_requested_end_time ?? null;

  const { data: updated, error } = await supabase
    .from('jobs')
    .update({
      scheduled_for: dateKey,
      scheduled_time: time,
      booking_confirmed_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .eq('account_id', accountId)
    .is('booking_confirmed_at', null)
    .is('booking_declined_at', null)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(error.message);
  // Somebody else got there first. Not an error — just nothing left to do.
  if (!updated) return;

  if (job.client_phone) {
    const { data: account } = await supabase.from('accounts').select('business_name').eq('id', accountId).maybeSingle();
    const businessName = (account as { business_name?: string } | null)?.business_name || 'Your contractor';
    await sendBookingDecisionSms({
      accountId,
      toPhone: job.client_phone,
      // The window that was actually booked, not the first one on the record.
      // A customer who offered two times and gets "confirmed for" the one they
      // did not expect needs the text to name it, or they turn up on Tuesday.
      message: confirmedSmsBody(businessName, requestedWhenLabel(dateKey, time, endTime)),
    });
  }

  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/jobs');
  revalidatePath(`/dashboard/jobs/${jobId}`);
}

/**
 * Turn the request down, freeing the slot for someone else.
 *
 * The job is archived rather than deleted: the customer, their number and what
 * they asked for are a lead the owner may still want to call, and a booking that
 * vanishes leaves no way to explain a text the customer already received.
 */
export async function declineBookingRequestAction(jobId: string) {
  const { supabase, accountId } = await requireOwnerContext();

  const job = await readBookingDecisionRow(supabase, accountId, jobId);
  if (!job?.booking_requested_date) return;
  if (job.booking_confirmed_at || job.booking_declined_at) return;

  const { data: updated, error } = await supabase
    .from('jobs')
    .update({ booking_declined_at: new Date().toISOString(), status: 'archived' })
    .eq('id', jobId)
    .eq('account_id', accountId)
    .is('booking_confirmed_at', null)
    .is('booking_declined_at', null)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!updated) return;

  if (job.client_phone) {
    const { data: account } = await supabase.from('accounts').select('business_name').eq('id', accountId).maybeSingle();
    const businessName = (account as { business_name?: string } | null)?.business_name || 'Your contractor';
    await sendBookingDecisionSms({
      accountId,
      toPhone: job.client_phone,
      // Both windows are being turned down at once, so the text has to say so.
      // "Can't make Thu, Aug 6" to somebody who also offered Friday reads as an
      // answer about half their question.
      message: declinedSmsBody(
        businessName,
        requestedWhenLabel(job.booking_requested_date, job.booking_requested_time ?? null, job.booking_requested_end_time ?? null),
        job.booking_alt_date
          ? requestedWhenLabel(job.booking_alt_date, job.booking_alt_time ?? null, job.booking_alt_end_time ?? null)
          : null,
      ),
    });
  }

  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/jobs');
}
