'use server';

import { revalidatePath } from 'next/cache';
import { requireOfficeContext } from '@/lib/auth';
import { sendReviewReminder, setReviewRemindersStopped, setReviewResolved } from '@/lib/reviews';
import type { ReviewActionState } from '@/lib/review-activity';

/**
 * Every write the Reviews Command Center can make.
 *
 * THREE THINGS ARE TRUE OF ALL OF THEM.
 *
 * 1. `requireOfficeContext()` first, always. It returns the supabase client
 *    bound to the signed-in user's account, and every function below passes
 *    that accountId down to a query that filters on it. The `id` in the form
 *    body came from a browser and is not evidence of anything.
 *
 * 2. They return a message rather than throwing. These fire from buttons inside
 *    a list; an unhandled throw replaces the page with an error boundary and
 *    loses the owner's filters, which is a bad trade for "the text failed to
 *    send".
 *
 * 3. Only `remindReviewAction` sends anything. The other two are local state
 *    changes about the owner's own workflow, and neither reaches a customer.
 *
 * NOTE ON WHAT IS DELIBERATELY MISSING: there is no "assign" action. There is
 * no assignee model for reviews and inventing a column to back a control nobody
 * asked to be real would be the fake production action the brief rules out. The
 * button is rendered disabled with copy saying so.
 */

function idOf(formData: FormData): string {
  return String(formData.get('id') ?? '').trim();
}

/** Send the same review link again. Capped, cooled down, and consent-checked. */
export async function remindReviewAction(
  _prev: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const { supabase, accountId } = await requireOfficeContext('jobs.write');
  const id = idOf(formData);
  if (!id) return { status: 'error', message: 'Missing review request.' };

  const result = await sendReviewReminder(supabase, accountId, id);
  revalidatePath('/dashboard/reviews');
  return { status: result.ok ? 'ok' : 'error', message: result.message };
}

/** "Mark resolved" / "Reopen" on a piece of private feedback. */
export async function setResolvedAction(
  _prev: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const { supabase, accountId } = await requireOfficeContext('jobs.write');
  const id = idOf(formData);
  if (!id) return { status: 'error', message: 'Missing review request.' };

  const resolved = formData.get('resolved') === '1';
  try {
    await setReviewResolved(supabase, accountId, id, resolved);
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'Could not save that.' };
  }
  revalidatePath('/dashboard/reviews');
  return { status: 'ok', message: resolved ? 'Marked resolved.' : 'Reopened.' };
}

/**
 * Stop (or resume) reminders for one request.
 *
 * This is the OWNER's decision about one review ask. It is not the customer's
 * STOP — that lives in sms_consent, covers every message to that number, and
 * nothing here can clear it.
 */
export async function setRemindersStoppedAction(
  _prev: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const { supabase, accountId } = await requireOfficeContext('jobs.write');
  const id = idOf(formData);
  if (!id) return { status: 'error', message: 'Missing review request.' };

  const stopped = formData.get('stopped') === '1';
  try {
    await setReviewRemindersStopped(supabase, accountId, id, stopped);
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'Could not save that.' };
  }
  revalidatePath('/dashboard/reviews');
  return { status: 'ok', message: stopped ? 'Reminders stopped for this request.' : 'Reminders resumed.' };
}
