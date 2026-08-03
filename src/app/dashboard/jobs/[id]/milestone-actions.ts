'use server';

import { revalidatePath } from 'next/cache';
import { requireOwnerContext } from '@/lib/auth';
import { getJob } from '@/lib/jobs';
import { createJobTask } from '@/lib/job-tasks';
import { addInvoiceItem, createInvoice, listInvoices, selectPrimaryInvoice } from '@/lib/invoices';
import { createJobFeedEvent, createPaymentFeedEvent } from '@/lib/job-feed';
import { uploadJobPhoto, isJobPhotoFile } from '@/lib/job-photo-storage';
import { normalizeUsPhone } from '@/lib/phone';
import { recordSmsConsent, sendPaymentSmsEvent } from '@/lib/sms';
import {
  addMilestonePhoto, assignTaskToMilestone, createMilestone, deleteMilestone,
  deleteMilestonePhoto, requestMilestonePayment, updateMilestone,
} from '@/lib/milestones-data';
import { MILESTONE_PRESETS, presetAmounts, type MilestoneKind, type PhotoPhase } from '@/lib/milestones';

// Owner-side actions for Proof-to-Pay milestones. Everything that decides
// whether money can be asked for lives in lib/milestones-data; this layer is
// auth, form parsing and telling the owner what happened.

type ActionResult = { ok: true } | { ok: false; message: string };

function fail(error: unknown, fallback: string): ActionResult {
  return { ok: false, message: error instanceof Error ? error.message : fallback };
}

export async function createMilestoneAction(jobId: string, formData: FormData): Promise<ActionResult> {
  const { supabase, accountId } = await requireOwnerContext();
  try {
    await createMilestone(supabase, accountId, jobId, {
      title: String(formData.get('title') ?? '').trim() || 'Milestone',
      scope: String(formData.get('scope') ?? ''),
      amount: Number(formData.get('amount')),
      kind: (String(formData.get('kind') ?? 'stage') as MilestoneKind),
      requireBeforePhotos: Number(formData.get('requireBefore')),
      requireAfterPhotos: Number(formData.get('requireAfter')),
      sortOrder: Number(formData.get('sortOrder')) || 0,
    });
    revalidatePath(`/dashboard/jobs/${jobId}`);
    return { ok: true };
  } catch (error) {
    return fail(error, 'Could not create the milestone.');
  }
}

/**
 * Lay out a standard set of stages across the quote.
 *
 * For the contractor who wants staged payments but has never had to decide
 * where the stages go. Refuses when milestones already exist rather than
 * doubling them up.
 */
export async function seedMilestonesAction(jobId: string): Promise<ActionResult> {
  const { supabase, accountId } = await requireOwnerContext();
  try {
    const { count } = await supabase
      .from('job_milestones')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('job_id', jobId);
    if ((count ?? 0) > 0) return { ok: false, message: 'This job already has milestones.' };

    const job = await getJob(supabase, accountId, jobId);
    if (!job) return { ok: false, message: 'Job not found.' };

    const amounts = presetAmounts(Number(job.quoted_amount) || 0);
    for (const [index, preset] of MILESTONE_PRESETS.entries()) {
      await createMilestone(supabase, accountId, jobId, {
        title: preset.title,
        scope: preset.scope,
        amount: amounts[index],
        kind: preset.kind,
        // A deposit is taken before anyone is on site, so it asks for nothing.
        // Every stage after it wants an "after" picture of what was done.
        requireBeforePhotos: preset.kind === 'deposit' ? 0 : 0,
        requireAfterPhotos: preset.kind === 'deposit' ? 0 : 1,
        sortOrder: index,
      });
    }
    revalidatePath(`/dashboard/jobs/${jobId}`);
    return { ok: true };
  } catch (error) {
    return fail(error, 'Could not set up milestones.');
  }
}

export async function updateMilestoneAction(jobId: string, milestoneId: string, formData: FormData): Promise<ActionResult> {
  const { supabase, accountId } = await requireOwnerContext();
  try {
    await updateMilestone(supabase, accountId, milestoneId, {
      title: String(formData.get('title') ?? '').trim(),
      scope: String(formData.get('scope') ?? ''),
      amount: Number(formData.get('amount')),
      kind: (String(formData.get('kind') ?? 'stage') as MilestoneKind),
      requireBeforePhotos: Number(formData.get('requireBefore')),
      requireAfterPhotos: Number(formData.get('requireAfter')),
    });
    revalidatePath(`/dashboard/jobs/${jobId}`);
    return { ok: true };
  } catch (error) {
    return fail(error, 'Could not save the milestone.');
  }
}

export async function deleteMilestoneAction(jobId: string, milestoneId: string): Promise<ActionResult> {
  const { supabase, accountId } = await requireOwnerContext();
  try {
    await deleteMilestone(supabase, accountId, milestoneId);
    revalidatePath(`/dashboard/jobs/${jobId}`);
    return { ok: true };
  } catch (error) {
    return fail(error, 'Could not remove the milestone.');
  }
}

/** Add a checklist item that counts as proof for this milestone. */
export async function addMilestoneTaskAction(jobId: string, milestoneId: string, formData: FormData): Promise<ActionResult> {
  const { supabase, accountId } = await requireOwnerContext();
  try {
    const title = String(formData.get('title') ?? '').trim();
    if (!title) return { ok: false, message: 'Give the checklist item a name.' };
    const task = await createJobTask(supabase, accountId, jobId, title);
    await assignTaskToMilestone(supabase, accountId, task.id, milestoneId);
    revalidatePath(`/dashboard/jobs/${jobId}`);
    return { ok: true };
  } catch (error) {
    return fail(error, 'Could not add the checklist item.');
  }
}

export async function attachMilestonePhotoAction(jobId: string, milestoneId: string, formData: FormData): Promise<ActionResult> {
  const { supabase, accountId } = await requireOwnerContext();
  try {
    const phase = String(formData.get('phase') ?? 'after') as PhotoPhase;
    if (phase !== 'before' && phase !== 'after') return { ok: false, message: 'Choose before or after.' };

    const files = formData.getAll('photos').filter(isJobPhotoFile);
    if (files.length === 0) return { ok: false, message: 'Choose at least one photo.' };

    const caption = String(formData.get('caption') ?? '');
    for (const file of files) {
      const path = await uploadJobPhoto(accountId, file);
      await addMilestonePhoto(supabase, accountId, { milestoneId, jobId, path, phase, caption });
    }
    revalidatePath(`/dashboard/jobs/${jobId}`);
    return { ok: true };
  } catch (error) {
    return fail(error, 'Could not attach the photo.');
  }
}

export async function removeMilestonePhotoAction(jobId: string, photoId: string): Promise<ActionResult> {
  const { supabase, accountId } = await requireOwnerContext();
  try {
    await deleteMilestonePhoto(supabase, accountId, photoId);
    revalidatePath(`/dashboard/jobs/${jobId}`);
    return { ok: true };
  } catch (error) {
    return fail(error, 'Could not remove the photo.');
  }
}

/**
 * Ask the homeowner to pay for a proven milestone.
 *
 * The gate is enforced inside requestMilestonePayment against the database, not
 * here and not in the browser — this layer just relays which blockers stopped
 * it, so the owner sees the same list the button was showing.
 */
export async function requestMilestonePaymentAction(
  jobId: string,
  milestoneId: string,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, accountId } = await requireOwnerContext();
  try {
    const invoices = await listInvoices(supabase, accountId, jobId);
    const invoice = selectPrimaryInvoice(invoices) ?? await createInvoice(supabase, accountId, jobId, 'draft');
    const job = await getJob(supabase, accountId, jobId);
    if (job && Number(invoice.total) <= 0 && Number(job.quoted_amount) > 0) {
      await addInvoiceItem(supabase, accountId, invoice.id, { description: 'Quoted job total', amount: Number(job.quoted_amount) });
    }

    const sendSms = formData.get('sendSms') === 'on';
    const phoneInput = String(formData.get('homeownerPhone') ?? '');
    const homeownerPhone = phoneInput ? normalizeUsPhone(phoneInput) : null;
    if (sendSms && !homeownerPhone) {
      return { ok: false, message: 'Enter a valid mobile number before texting the request.' };
    }
    if (sendSms && homeownerPhone) await recordSmsConsent(accountId, homeownerPhone);

    const result = await requestMilestonePayment(supabase, accountId, jobId, milestoneId, {
      invoiceId: invoice.id,
      homeownerPhone,
      smsConsent: sendSms,
    });
    if (!result.ok) return { ok: false, message: result.blockers.join(' ') };

    await createPaymentFeedEvent(supabase, result.payment.id, 'payment_requested');
    // A client-visible entry, because the whole point is that the homeowner can
    // see the work behind the ask rather than just the ask.
    await createJobFeedEvent(supabase, accountId, jobId, {
      kind: 'milestone_submitted',
      title: `${result.payment.label ?? 'Milestone'} complete`,
      body: 'The work for this stage is finished — photos and checklist are on your job page.',
      visibility: 'client',
      amount: Number(result.payment.amount) || null,
      sourceTable: 'job_milestones',
      sourceId: milestoneId,
    });
    if (sendSms) await sendPaymentSmsEvent(result.payment.id, 'payment_requested');

    revalidatePath(`/dashboard/jobs/${jobId}`);
    return { ok: true };
  } catch (error) {
    return fail(error, 'Could not request the payment.');
  }
}
