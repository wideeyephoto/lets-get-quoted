'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/auth';
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit';
import { createJobFeedEvent } from '@/lib/job-feed';
import { resolveJobAccess } from '@/lib/change-order-client';
import { chooseOption } from '@/lib/selections-data';

/**
 * The homeowner picks.
 *
 * Public in every sense that matters, so: rate limited, and the option is
 * confirmed to belong to both this selection AND this job before anything is
 * written. Without both checks a valid link for one job could record a choice
 * against another customer's board.
 *
 * The feed entry is client-visible and quotes the product reference. "You picked
 * Accessible Beige SW7036 on 12 March" is the sentence this whole feature exists
 * to be able to say.
 */
export async function chooseSelectionAction(
  token: string,
  selectionId: string,
  formData: FormData,
): Promise<{ ok: boolean; message?: string }> {
  const admin = createAdminClient();
  const ip = clientIpFrom(headers());
  if (!(await checkRateLimit(admin, `selection:ip:${ip}`, 30, 60))) {
    return { ok: false, message: 'Too many attempts — wait a minute and try again.' };
  }

  const access = await resolveJobAccess(token);
  if (!access) return { ok: false, message: 'This link is no longer valid. Give your contractor a call.' };

  const optionId = String(formData.get('optionId') ?? '').trim();
  if (!optionId) return { ok: false, message: 'Pick one of the options first.' };

  const result = await chooseOption(admin, access.accountId, {
    selectionId,
    optionId,
    jobId: access.jobId,
    byName: String(formData.get('byName') ?? ''),
  });
  if (!result.ok || !result.snapshot) return { ok: false, message: result.message };

  try {
    const snapshot = result.snapshot;
    await createJobFeedEvent(admin, access.accountId, access.jobId, {
      kind: 'selection_chosen',
      title: `Chosen: ${snapshot.name}`,
      body: snapshot.reference
        ? `${snapshot.name} (${snapshot.reference}) — chosen by ${String(formData.get('byName') ?? '').trim()}.`
        : `${snapshot.name} — chosen by ${String(formData.get('byName') ?? '').trim()}.`,
      visibility: 'client',
      sourceTable: 'job_selections',
      sourceId: selectionId,
    });
  } catch (error) {
    console.error('Selection feed event failed:', error instanceof Error ? error.message : error);
  }

  revalidatePath(`/client/jobs/${token}`);
  return { ok: true };
}

/** Longer than a question, shorter than an essay. */
const MAX_QUESTION = 600;

/**
 * "Can I see this one in person first?"
 *
 * The board offered exactly two moves: confirm, or nothing. Real people have a
 * third — they want to ask something before committing — and with nowhere to
 * put it the honest ones phone up and the rest simply don't answer, which reads
 * from the contractor's side as a customer ignoring them.
 *
 * It lands in the job feed rather than changing the selection: a question is not
 * a decision, and it must not look like one.
 */
export async function askAboutSelectionAction(
  token: string,
  selectionId: string,
  formData: FormData,
): Promise<{ ok: boolean; message?: string }> {
  const admin = createAdminClient();
  const ip = clientIpFrom(headers());
  // Tighter than choosing: this one writes free text somebody else reads.
  if (!(await checkRateLimit(admin, `selection-ask:ip:${ip}`, 10, 300))) {
    return { ok: false, message: 'That is a lot of questions at once — give it a few minutes.' };
  }

  const access = await resolveJobAccess(token);
  if (!access) return { ok: false, message: 'This link is no longer valid. Give your contractor a call.' };

  const question = String(formData.get('question') ?? '').trim().slice(0, MAX_QUESTION);
  if (!question) return { ok: false, message: 'Type your question first.' };

  // Belongs to THIS job. Without it, a valid link for one job could post a
  // question onto another customer's board.
  const { data: selection } = await admin
    .from('job_selections')
    .select('id, title')
    .eq('account_id', access.accountId)
    .eq('id', selectionId)
    .eq('job_id', access.jobId)
    .maybeSingle();
  if (!selection) return { ok: false, message: 'That choice is not on this job.' };

  try {
    await createJobFeedEvent(admin, access.accountId, access.jobId, {
      kind: 'selection_question',
      title: `Question about ${selection.title}`,
      body: question,
      // Client-visible so the customer can see their own question was received.
      // A message that vanishes on submit is one people send three times.
      visibility: 'client',
      sourceTable: 'job_selections',
      sourceId: selectionId,
    });
  } catch (error) {
    console.error('Selection question failed:', error instanceof Error ? error.message : error);
    return { ok: false, message: 'Could not send that just now. Please try again.' };
  }

  revalidatePath(`/client/jobs/${token}`);
  return { ok: true };
}
