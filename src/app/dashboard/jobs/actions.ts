'use server';

import { revalidatePath } from 'next/cache';
import { resolveCrewBurdenPct, getMinMarginPct, accountLoadedHourlyRate } from '@/lib/cost-truth-data';
import {
  billableLines,
  deterministicFindings,
  mergeFindings,
  normalizeLabel,
  type GuardLine,
  type QuoteFinding,
} from '@/lib/quote-guard';
import { findOmissions } from '@/lib/quote-guard-ai';
import { listServices } from '@/lib/services';
import { normalizeCostSource } from '@/lib/cost-truth';
import { readReceipt, type ReceiptRead } from '@/lib/receipt-ocr';
import { redirect } from 'next/navigation';
import { createAdminClient, requireOwnerContext } from '@/lib/auth';
import { loadBusinessName } from '@/lib/business-name';
import { checkRateLimit } from '@/lib/rate-limit';
import { draftQuote, loadDraftContext } from '@/lib/quote-draft-ai';
import { draftConfidenceNote, draftToQuoteItems, draftTotal, type SerializedDraft } from '@/lib/quote-draft';
import {
  createCost,
  createJob,
  deleteCost,
  deleteJob,
  getJob,
  formatJobQuoteSummary,
  parseQuoteItems,
  saveQuoteItems,
  updateJob,
  updateJobSchedule,
  type CostType,
  type JobStatus,
  type QuoteItem,
} from '@/lib/jobs';
import {
  createClientJobAccessToken,
  createJobFeedEvent,
  getActiveClientAccessCount,
  revokeClientJobAccess,
} from '@/lib/job-feed';
import { acceptSubscriptionForClient } from '@/lib/subscription-signup';
import { uploadJobPhoto } from '@/lib/job-photo-storage';
import { listCrew, listCrewIdsForJob, setJobCrewAssignments, toggleJobCrewAssignment } from '@/lib/crew';
import { normalizeUsPhone } from '@/lib/phone';
import { createAndSendScheduleRequest, formatScheduleOption, type ScheduleOption } from '@/lib/scheduling';
import { isPhoneOptedOut, recordSmsConsent, sendClientJobDashboardSms, sendCrewAssignmentSms, sendCrewScheduleSelectedSms, sendJobUpdateSms, sendReviewRequestSms } from '@/lib/sms';
import { sendReviewRequestEmail, sendReviewRequestConfirmationEmail } from '@/lib/email';
import { wantsConfirmation } from '@/lib/confirmation-prefs';
import { sendPushToCrew } from '@/lib/push';
import { isEmailSuppressed, resolveMarketingMailingAddress } from '@/lib/email-suppression';
import { createReviewInvite } from '@/lib/reviews';
import { googleReviewUrl } from '@/lib/review-routing';
import { createJobTask, setJobTaskDone, deleteJobTask } from '@/lib/job-tasks';
import { getSiteContent } from '@/lib/site-content';
import type { SupabaseClient } from '@supabase/supabase-js';

function parseAmount(value: FormDataEntryValue | null): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function optionalAmount(value: FormDataEntryValue | null): number | null {
  const text = (value ?? '').toString().trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function optionalText(value: FormDataEntryValue | null): string | null {
  const text = (value ?? '').toString().trim();
  return text.length > 0 ? text : null;
}

function scheduleOptionsFromForm(formData: FormData, prefix: string): ScheduleOption[] {
  const options: ScheduleOption[] = [1, 2, 3].map((index) => ({
    date: (formData.get(`${prefix}Date${index}`) ?? '').toString(),
    time: optionalText(formData.get(`${prefix}Time${index}`)),
  }));
  return options;
}

function parseJobStatus(value: unknown): JobStatus | null {
  return value === 'new_lead' || value === 'in_progress' || value === 'complete' || value === 'archived' ? value : null;
}

export async function createJobAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const clientPhone = optionalText(formData.get('clientPhone'));
  const sendClientText = formData.get('sendClientText') === 'on';
  const normalizedClientPhone = clientPhone ? normalizeUsPhone(clientPhone) : null;

  // A missing phone shouldn't block creating the job — the "Send Client Text"
  // option is best-effort. The job is created regardless; the dashboard text is
  // only sent below when a valid phone was provided.

  const photoFiles = formData.getAll('photos').filter((item): item is File => item instanceof File && item.size > 0);
  const photoPaths: string[] = [];
  for (const file of photoFiles) {
    photoPaths.push(await uploadJobPhoto(accountId, file));
  }

  const job = await createJob(supabase, accountId, {
    clientName: (formData.get('clientName') ?? '').toString().trim(),
    clientPhone,
    clientEmail: optionalText(formData.get('clientEmail')),
    address: optionalText(formData.get('address')),
    scope: optionalText(formData.get('scope')),
    status: (formData.get('status') as JobStatus) || 'new_lead',
    scheduledFor: optionalText(formData.get('scheduledFor')),
    scheduledTime: optionalText(formData.get('scheduledTime')),
    estimatedHours: optionalAmount(formData.get('estimatedHours')),
    quotedAmount: parseAmount(formData.get('quotedAmount')),
    photoPaths,
  });

  await createJobFeedEvent(supabase, accountId, job.id, {
    kind: 'job_created',
    title: `${job.ref} created`,
    body: formatJobQuoteSummary(job),
    visibility: 'client',
    sourceTable: 'jobs',
    sourceId: job.id,
  });

  const token = await createClientJobAccessToken(supabase, accountId, job.id, { clientPhone: job.client_phone, clientEmail: job.client_email });

  if (sendClientText && normalizedClientPhone) {
    const businessName = await loadBusinessName(supabase, accountId);
    await recordSmsConsent(accountId, normalizedClientPhone, 'client_job_dashboard');
    await sendClientJobDashboardSms({
      phone: normalizedClientPhone,
      businessName,
      jobRef: job.ref,
      token,
      accountId,
    });
  }

  revalidatePath('/dashboard/jobs');
  redirect(`/dashboard/jobs/${job.id}?tab=feed&clientToken=${token}`);
}

export async function updateJobAction(jobId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const clientFeedAccessEnabled = formData.get('clientFeedAccess') === 'on';

  const updatedJob = await updateJob(supabase, accountId, jobId, {
    clientName: (formData.get('clientName') ?? '').toString().trim(),
    clientPhone: optionalText(formData.get('clientPhone')),
    clientEmail: optionalText(formData.get('clientEmail')),
    address: optionalText(formData.get('address')),
    scope: optionalText(formData.get('scope')),
    status: (formData.get('status') as JobStatus) || 'new_lead',
    scheduledFor: optionalText(formData.get('scheduledFor')),
    scheduledUntil: optionalText(formData.get('scheduledUntil')),
    scheduledTime: optionalText(formData.get('scheduledTime')),
    estimatedHours: optionalAmount(formData.get('estimatedHours')),
    quotedAmount: parseAmount(formData.get('quotedAmount')),
  });

  const activeClientAccessCount = await getActiveClientAccessCount(supabase, accountId, jobId);
  if (!clientFeedAccessEnabled && activeClientAccessCount > 0) {
    await revokeClientJobAccess(supabase, accountId, jobId);
    await createJobFeedEvent(supabase, accountId, jobId, {
      kind: 'client_link_revoked',
      title: 'Client view links revoked',
      body: 'Active client view links for this job were revoked.',
      visibility: 'internal',
    });
  } else if (clientFeedAccessEnabled && activeClientAccessCount === 0) {
    await createClientJobAccessToken(supabase, accountId, jobId, { clientPhone: updatedJob.client_phone, clientEmail: updatedJob.client_email });
    await createJobFeedEvent(supabase, accountId, jobId, {
      kind: 'client_link_created',
      title: 'Client view link created',
      body: 'A client view link was created for this job.',
      visibility: 'internal',
    });
  }

  await createJobFeedEvent(supabase, accountId, jobId, {
    kind: 'job_update',
    title: 'Job details updated',
    body: `The job record for ${updatedJob.client_name} was updated.`,
    visibility: 'internal',
    meta: { status: updatedJob.status },
  });

  revalidatePath('/dashboard/jobs');
  revalidatePath(`/dashboard/jobs/${jobId}`);
}

/**
 * Work began.
 *
 * A timestamp AND a status move, because both were previously guesses: a job on
 * the calendar and a job with a crew in the driveway were the same row. The feed
 * entry is client-visible on purpose — "they've started" is the single most
 * common thing a homeowner rings up to ask.
 *
 * Idempotent. Pressing it twice must not re-date the start or post a second
 * entry; the second press is somebody checking it worked.
 */
export async function markJobStartedAction(jobId: string) {
  const { supabase, accountId } = await requireOwnerContext();
  const job = await getJob(supabase, accountId, jobId);
  if (!job) throw new Error('Job not found for this account.');
  if (job.status === 'archived') throw new Error('This job is archived.');

  if (!job.started_at) {
    const startedAt = new Date().toISOString();
    const { error } = await supabase
      .from('jobs')
      // Starting work IS being in progress. A job still sitting in new_lead
      // while somebody is on site is the contradiction this button exists to
      // remove — but a completed job that gets a start time recorded after the
      // fact must not be dragged back open.
      .update({ started_at: startedAt, ...(job.status === 'complete' ? {} : { status: 'in_progress' }) })
      .eq('account_id', accountId)
      .eq('id', jobId);
    if (error) throw error;

    await createJobFeedEvent(supabase, accountId, jobId, {
      kind: 'job_started',
      title: 'Work started',
      body: `Work started on ${job.ref}${job.address ? ` at ${job.address}` : ''}.`,
      visibility: 'client',
      meta: { startedAt, previousStatus: job.status },
    });
  }

  revalidatePath('/dashboard/jobs');
  revalidatePath(`/dashboard/jobs/${jobId}`);
}

/**
 * Pressed it on the wrong job.
 *
 * Clears the timestamp, puts the status back where it was, and deletes the feed
 * entry — the client saw "work started", so leaving a struck-through record of a
 * thing that didn't happen is worse than removing it.
 */
export async function undoJobStartedAction(jobId: string, eventId: string) {
  const { supabase, accountId } = await requireOwnerContext();
  const job = await getJob(supabase, accountId, jobId);
  if (!job) throw new Error('Job not found for this account.');

  const { data: event, error: eventError } = await supabase
    .from('job_feed')
    .select('id, kind, meta')
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .eq('id', eventId)
    .eq('kind', 'job_started')
    .maybeSingle();
  if (eventError) throw eventError;
  if (!event) throw new Error('Start event not found for this job.');

  const previousStatus = parseJobStatus((event.meta as { previousStatus?: unknown } | null)?.previousStatus);
  const { error: updateError } = await supabase
    .from('jobs')
    // Only the status this action changed is put back. A job completed since it
    // started must stay complete — undoing the start is not undoing the work.
    .update({ started_at: null, ...(previousStatus && job.status === 'in_progress' ? { status: previousStatus } : {}) })
    .eq('account_id', accountId)
    .eq('id', jobId);
  if (updateError) throw updateError;

  const { error: deleteError } = await supabase
    .from('job_feed')
    .delete()
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .eq('id', eventId)
    .eq('kind', 'job_started');
  if (deleteError) throw deleteError;

  revalidatePath('/dashboard/jobs');
  revalidatePath(`/dashboard/jobs/${jobId}`);
}

export async function markJobCompleteAction(jobId: string, formData?: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const job = await getJob(supabase, accountId, jobId);
  if (!job) throw new Error('Job not found for this account.');

  // The review pill on the complete button. Absent means the form didn't carry
  // one, and then the account setting decides exactly as it always has.
  const raw = formData?.get('sendReview');
  const sendReview = raw === null || raw === undefined ? null : String(raw) === 'on';

  if (job.status !== 'complete') {
    const { error } = await supabase
      .from('jobs')
      .update({ status: 'complete' })
      .eq('account_id', accountId)
      .eq('id', jobId);
    if (error) throw error;

    await createJobFeedEvent(supabase, accountId, jobId, {
      kind: 'job_completed',
      title: 'Job marked complete',
      body: `${job.ref} was marked complete.`,
      visibility: 'client',
      meta: { status: 'complete', previousStatus: job.status },
    });

    // The review ask. Best-effort and idempotent: only fires once per job, and
    // never blocks completion if the text/email send fails. The account toggle
    // column may not exist on un-migrated DBs, so the read is defensive
    // (treated as off on any error).
    //
    // The per-job pill OVERRIDES the account setting in both directions — ask
    // on this one job though automatic asks are off, or skip it though they are
    // on. That is the whole point of the pill: closing a job without texting
    // somebody used to mean going to Settings, turning the automation off,
    // coming back, completing, and turning it on again.
    //
    // What it does not override is deliverJobReviewRequest's own bail on a
    // missing review link, or the once-per-job check. Those are not
    // preferences.
    try {
      const { data: settings } = await supabase
        .from('accounts')
        .select('auto_review_request')
        .eq('id', accountId)
        .maybeSingle();
      const wantsReview = sendReview ?? Boolean(settings?.auto_review_request);
      if (wantsReview && !(await reviewAlreadyRequested(supabase, accountId, jobId))) {
        await deliverJobReviewRequest(supabase, accountId, job);
      }
    } catch (error) {
      console.error(`Auto review request skipped for job ${jobId}:`, error instanceof Error ? error.message : error);
    }
  }

  revalidatePath('/dashboard/jobs');
  revalidatePath(`/dashboard/jobs/${jobId}`);
}

export async function undoJobCompleteAction(jobId: string, eventId: string) {
  const { supabase, accountId } = await requireOwnerContext();
  const job = await getJob(supabase, accountId, jobId);
  if (!job) throw new Error('Job not found for this account.');

  const { data: event, error: eventError } = await supabase
    .from('job_feed')
    .select('id, kind, meta')
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .eq('id', eventId)
    .eq('kind', 'job_completed')
    .maybeSingle();

  if (eventError) throw eventError;
  if (!event) throw new Error('Completion event not found for this job.');

  const previousStatus = parseJobStatus((event.meta as { previousStatus?: unknown } | null)?.previousStatus) ?? 'in_progress';
  const { error: updateError } = await supabase
    .from('jobs')
    .update({ status: previousStatus })
    .eq('account_id', accountId)
    .eq('id', jobId);
  if (updateError) throw updateError;

  const { error: deleteError } = await supabase
    .from('job_feed')
    .delete()
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .eq('id', eventId)
    .eq('kind', 'job_completed');
  if (deleteError) throw deleteError;

  revalidatePath('/dashboard/jobs');
  revalidatePath(`/dashboard/jobs/${jobId}`);
}

export async function scheduleJobAction(jobId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const scheduledFor = optionalText(formData.get('scheduledFor'));

  if (!scheduledFor) redirect('/dashboard/schedule#unscheduled-jobs');

  const scheduledJob = await updateJobSchedule(supabase, accountId, jobId, scheduledFor, optionalText(formData.get('scheduledTime')));

  await createJobFeedEvent(supabase, accountId, jobId, {
    kind: 'job_scheduled',
    title: 'Job schedule updated',
    body: `Scheduled for ${scheduledJob.scheduled_for || 'a date to be determined'}.`,
    visibility: 'client',
    meta: { scheduled_for: scheduledJob.scheduled_for, scheduled_time: scheduledJob.scheduled_time },
  });

  revalidatePath('/dashboard/jobs');
  revalidatePath(`/dashboard/jobs/${jobId}`);
  revalidatePath('/dashboard/schedule');
}

export async function removeJobScheduleAction(jobId: string) {
  const { supabase, accountId } = await requireOwnerContext();
  const job = await getJob(supabase, accountId, jobId);
  if (!job) throw new Error('Job not found for this account.');

  await updateJobSchedule(supabase, accountId, jobId, null, null);

  await createJobFeedEvent(supabase, accountId, jobId, {
    kind: 'job_scheduled',
    title: 'Job removed from schedule',
    body: `${job.ref} was removed from the schedule.`,
    visibility: 'client',
    meta: { scheduled_for: null, scheduled_time: null, previous_scheduled_for: job.scheduled_for, previous_scheduled_time: job.scheduled_time },
  });

  revalidatePath('/dashboard/jobs');
  revalidatePath(`/dashboard/jobs/${jobId}`);
  revalidatePath('/dashboard/schedule');
}

export async function sendClientScheduleOptionsAction(jobId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const job = await getJob(supabase, accountId, jobId);
  if (!job) throw new Error('Job not found for this account.');

  const phoneInput = (formData.get('scheduleClientPhone') ?? '').toString();
  const clientPhone = normalizeUsPhone(phoneInput);
  if (!clientPhone) throw new Error('Enter a valid client mobile number before sending schedule options.');
  if (formData.get('scheduleSmsConsent') !== 'on') throw new Error('Confirm the client agreed to receive scheduling texts.');

  const options = scheduleOptionsFromForm(formData, 'schedule');

  const request = await createAndSendScheduleRequest(supabase, accountId, jobId, { clientPhone, options });
  const optionSummary = request.options.map((option, index) => `${index + 1}. ${formatScheduleOption(option)}`).join(' ');

  await createJobFeedEvent(supabase, accountId, jobId, {
    kind: 'job_scheduled',
    title: 'Schedule options sent',
    body: `Schedule options were texted to ${job.client_name}: ${optionSummary}`,
    visibility: 'client',
    meta: { schedule_request_id: request.id, options: request.options },
  });

  revalidatePath('/dashboard/jobs');
  revalidatePath(`/dashboard/jobs/${jobId}`);
  revalidatePath('/dashboard/schedule');
}

export async function deleteJobAction(jobId: string) {
  const { supabase, accountId } = await requireOwnerContext();

  await deleteJob(supabase, accountId, jobId);

  revalidatePath('/dashboard/jobs');
  redirect('/dashboard/jobs');
}

// `notify` (bound per submit button) controls whether newly-assigned crew get
// an assignment text. The assignment itself always saves; only the SMS is gated.
export async function updateJobCrewAction(jobId: string, notify: boolean, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  const crewIds = formData.getAll('crewIds').map(String);
  const { added } = await setJobCrewAssignments(supabase, accountId, jobId, crewIds);

  if (notify && added.length > 0) {
    const [job, businessName, crewMembers] = await Promise.all([
      getJob(supabase, accountId, jobId),
      loadBusinessName(supabase, accountId),
      listCrew(supabase, accountId),
    ]);

    if (job) {
      const newlyAssigned = crewMembers.filter((member) => added.includes(member.id));

      // Push the field app (best-effort, never throws) alongside the SMS — the
      // crew member gets a tappable alert that deep-links to the job.
      for (const member of newlyAssigned) {
        await sendPushToCrew(accountId, member.id, {
          title: 'New job assigned',
          body: `${job.client_name} · ${job.ref}`,
          url: `/field/jobs/${jobId}`,
          tag: `job-${jobId}`,
        });
      }

      let sentCount = 0;
      for (const member of newlyAssigned) {
        try {
          const result = await sendCrewAssignmentSms({
            accountId,
            crewId: member.id,
            phone: member.phone,
            crewName: member.name,
            businessName,
            jobRef: job.ref,
            clientName: job.client_name,
            address: job.address,
            scheduledFor: job.scheduled_for,
            scheduledTime: job.scheduled_time,
          });
          if (result?.status === 'sent') sentCount += 1;
        } catch (error) {
          console.error(`Crew assignment SMS failed for crew ${member.id} on job ${jobId}:`, error);
        }
      }

      // Only mark the crew notified when a text ACTUALLY went out — deliverCrewSms
      // returns a status (opted_out / failed) instead of throwing, so the status
      // must not flip to "notified" when nothing was delivered.
      if (sentCount > 0) {
        await createJobFeedEvent(supabase, accountId, jobId, {
          kind: 'job_update',
          title: 'Crew assignment text sent',
          body: `Texted ${sentCount} crew ${sentCount === 1 ? 'member' : 'members'} about their assignment to ${job.ref}.`,
          visibility: 'internal',
        });
      }
    }
  }

  revalidatePath(`/dashboard/jobs/${jobId}`);
}

// Quick single add/remove toggle used by the schedule calendar's click-to-
// assign popover — unlike updateJobCrewAction, this doesn't replace the
// whole assignment set, it just flips one crew member on one job.
export async function toggleJobCrewAction(jobId: string, crewId: string, notify = true): Promise<{ assigned: boolean }> {
  const { supabase, accountId } = await requireOwnerContext();

  const { assigned } = await toggleJobCrewAssignment(supabase, accountId, jobId, crewId);

  if (assigned && notify) {
    const [job, businessName, crewMembers] = await Promise.all([
      getJob(supabase, accountId, jobId),
      loadBusinessName(supabase, accountId),
      listCrew(supabase, accountId),
    ]);
    const member = crewMembers.find((candidate) => candidate.id === crewId);

    if (job && member) {
      await sendPushToCrew(accountId, member.id, {
        title: 'New job assigned',
        body: `${job.client_name} · ${job.ref}`,
        url: `/field/jobs/${jobId}`,
        tag: `job-${jobId}`,
      });
      try {
        const result = await sendCrewAssignmentSms({
          accountId,
          crewId: member.id,
          phone: member.phone,
          crewName: member.name,
          businessName,
          jobRef: job.ref,
          clientName: job.client_name,
          address: job.address,
          scheduledFor: job.scheduled_for,
          scheduledTime: job.scheduled_time,
        });
        // Only mark notified on a real send — opted_out / failed come back as a
        // status (not a throw), so the catch below can't gate this.
        if (result?.status === 'sent') {
          await createJobFeedEvent(supabase, accountId, jobId, {
            kind: 'job_update',
            title: 'Crew assignment text sent',
            body: `Texted ${member.name} about their assignment to ${job.ref}.`,
            visibility: 'internal',
          });
        }
      } catch (error) {
        console.error(`Crew assignment SMS failed for crew ${crewId} on job ${jobId}:`, error);
      }
    }
  }

  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/jobs');
  revalidatePath(`/dashboard/jobs/${jobId}`);

  return { assigned };
}

export async function textCrewJobDateAction(jobId: string) {
  const { supabase, accountId } = await requireOwnerContext();
  const [job, businessName, crewMembers, assignedCrewIds] = await Promise.all([
    getJob(supabase, accountId, jobId),
    loadBusinessName(supabase, accountId),
    listCrew(supabase, accountId, { activeOnly: true }),
    listCrewIdsForJob(supabase, accountId, jobId),
  ]);

  if (!job) throw new Error('Job not found for this account.');
  if (!job.scheduled_for) throw new Error('Schedule this job before texting the crew date.');

  const assignedCrewIdSet = new Set(assignedCrewIds);
  const assignedCrew = crewMembers.filter((member) => assignedCrewIdSet.has(member.id));
  if (assignedCrew.length === 0) throw new Error('Assign crew before texting the crew date.');

  for (const member of assignedCrew) {
    try {
      await sendCrewScheduleSelectedSms({
        accountId,
        crewId: member.id,
        phone: member.phone,
        crewName: member.name,
        businessName,
        jobRef: job.ref,
        clientName: job.client_name,
        address: job.address,
        scheduledFor: job.scheduled_for,
        scheduledTime: job.scheduled_time,
      });
    } catch (error) {
      console.error(`Crew date SMS failed for crew ${member.id} on job ${jobId}:`, error);
    }
  }

  await createJobFeedEvent(supabase, accountId, jobId, {
    kind: 'job_update',
    title: 'Crew date text sent',
    body: `Texted ${assignedCrew.length} crew ${assignedCrew.length === 1 ? 'member' : 'members'} the scheduled date for ${job.ref}.`,
    visibility: 'internal',
    meta: { crew_count: assignedCrew.length, scheduled_for: job.scheduled_for, scheduled_time: job.scheduled_time },
  });

  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/jobs');
  revalidatePath(`/dashboard/jobs/${jobId}`);
}

/**
 * Read a receipt photo into a draft cost. Never saves anything.
 *
 * Rate-limited because it burns a paid vision call per tap, and the failure mode
 * of an un-capped one is somebody's phone camera in burst mode.
 */
export async function readReceiptAction(dataUrl: string): Promise<{ ok: true; read: ReceiptRead } | { ok: false; error: string }> {
  const { supabase, accountId } = await requireOwnerContext();
  if (!(await checkRateLimit(supabase, `receipt:${accountId}`, 40, 60))) {
    return { ok: false, error: 'That’s a lot of receipts at once — give it a minute and try again.' };
  }
  // ~8MB of base64 is roughly a 6MB photo. Above that it's not a receipt.
  if (typeof dataUrl !== 'string' || dataUrl.length > 8_000_000) {
    return { ok: false, error: 'That image is too large. Try a photo of just the receipt.' };
  }

  const read = await readReceipt({ dataUrl });
  if (!read) return { ok: false, error: 'Couldn’t read that one. Enter the figures by hand.' };
  return { ok: true, read };
}

export async function createCostAction(jobId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  const type = (formData.get('type') as CostType) || 'material';
  const description = (formData.get('description') ?? '').toString().trim() || 'Cost item';
  // Where the number came from. Falls back to 'estimated' rather than
  // 'unspecified': a cost entered today by a person had SOME basis, and
  // 'unspecified' is reserved for rows recorded before the question was asked.
  const rawSource = normalizeCostSource(formData.get('costSource'));
  const source = rawSource === 'unspecified' ? 'estimated' : rawSource;

  if (type === 'labor') {
    const hours = parseAmount(formData.get('hours'));
    const rate = parseAmount(formData.get('rate'));

    if (hours <= 0 || rate <= 0) {
      throw new Error('Labor costs require both hours and an hourly rate greater than 0.');
    }

    const crewId = optionalText(formData.get('crewId'));
    const cost = await createCost(supabase, accountId, jobId, {
      type: 'labor',
      description,
      crewId,
      supplier: optionalText(formData.get('supplier')),
      hours,
      rate,
      source,
      burdenPct: await resolveCrewBurdenPct(supabase, accountId, crewId),
    });
    await createJobFeedEvent(supabase, accountId, jobId, {
      kind: 'cost_added',
      title: 'Cost added',
      body: description,
      visibility: 'internal',
      amount: Number(cost.amount),
      sourceTable: 'costs',
      sourceId: cost.id,
    });
  } else {
    const amount = parseAmount(formData.get('amount'));

    if (amount <= 0) {
      throw new Error('Cost amount must be greater than 0.');
    }

    const cost = await createCost(supabase, accountId, jobId, {
      type,
      description,
      amount,
      supplier: optionalText(formData.get('supplier')),
      source,
    });
    await createJobFeedEvent(supabase, accountId, jobId, {
      kind: 'cost_added',
      title: 'Cost added',
      body: description,
      visibility: 'internal',
      amount: Number(cost.amount),
      sourceTable: 'costs',
      sourceId: cost.id,
    });
  }

  revalidatePath(`/dashboard/jobs/${jobId}`);
}

export async function createManualJobFeedAction(jobId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  const title = (formData.get('title') ?? '').toString().trim() || 'Job update';
  const body = optionalText(formData.get('body'));
  const notifyClientSms = formData.get('notifyClientSms') === 'on';
  const visibility = formData.get('visibility') === 'client' || notifyClientSms ? 'client' : 'internal';

  await createJobFeedEvent(supabase, accountId, jobId, {
    kind: 'job_update',
    title,
    body,
    visibility,
  });

  if (notifyClientSms) {
    const [job, businessName] = await Promise.all([
      getJob(supabase, accountId, jobId),
      loadBusinessName(supabase, accountId),
    ]);
    // The update is already posted above; texting the client is best-effort.
    // The composer only offers the text option when a phone is on file, so a
    // missing number here just skips the SMS rather than failing the whole post.
    const clientPhone = job?.client_phone ? normalizeUsPhone(job.client_phone) : null;
    if (job && clientPhone) {
      await recordSmsConsent(accountId, clientPhone, 'job_update');
      await sendJobUpdateSms({
        phone: clientPhone,
        businessName,
        jobRef: job.ref,
        title,
        body,
        accountId,
      });
    }
  }

  revalidatePath(`/dashboard/jobs/${jobId}`);
}

export async function createClientJobLinkAction(jobId: string) {
  const { supabase, accountId } = await requireOwnerContext();
  const job = await getJob(supabase, accountId, jobId);
  if (!job) throw new Error('Job not found for this account.');

  const token = await createClientJobAccessToken(supabase, accountId, jobId, { clientPhone: job.client_phone });
  await createJobFeedEvent(supabase, accountId, jobId, {
    kind: 'client_link_created',
    title: 'Client view link created',
    body: 'A client view link was created for this job.',
    visibility: 'internal',
  });

  redirect(`/dashboard/jobs/${jobId}?tab=feed&clientToken=${token}`);
}

export async function revokeClientJobLinkAction(jobId: string) {
  const { supabase, accountId } = await requireOwnerContext();

  await revokeClientJobAccess(supabase, accountId, jobId);
  await createJobFeedEvent(supabase, accountId, jobId, {
    kind: 'client_link_revoked',
    title: 'Client view links revoked',
    body: 'Active client view links for this job were revoked.',
    visibility: 'internal',
  });

  revalidatePath(`/dashboard/jobs/${jobId}`);
}

export async function deleteCostAction(jobId: string, costId: string) {
  const { supabase, accountId } = await requireOwnerContext();

  await deleteCost(supabase, accountId, jobId, costId);

  revalidatePath(`/dashboard/jobs/${jobId}`);
}

// Save the itemized quote from the job-page builder. Items are validated and the
// job's quoted_amount is recomputed inside saveQuoteItems, so the margin panel
// and any future invoice stay in sync. Returns the new total for the builder to
// echo back.
export async function saveQuoteItemsAction(jobId: string, items: QuoteItem[]): Promise<{ ok: boolean; total: number; message?: string }> {
  const { supabase, accountId } = await requireOwnerContext();
  try {
    const job = await saveQuoteItems(supabase, accountId, jobId, Array.isArray(items) ? items : []);
    revalidatePath(`/dashboard/jobs/${jobId}`);
    return { ok: true, total: Number(job.quoted_amount) || 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save the quote.';
    return { ok: false, total: 0, message };
  }
}

// Draft an itemized quote from the job's scope, the owner's price book and what
// they've charged before.
//
// Returns the draft — it does NOT save. Nothing about a quote should reach a
// customer because a machine suggested it, so this fills the builder and the
// owner presses Save like they always did. Rate-limited because it spends money
// per call, and idempotent in the only sense that matters: running it twice
// costs two calls and changes nothing.
/**
 * Read a quote before it goes out. Saves nothing and changes nothing.
 *
 * Runs the arithmetic first and unconditionally, then asks the model what looks
 * absent. If the model can't run — no key, provider down — the contractor still
 * gets their margin and history checks rather than an error.
 */
export async function reviewQuoteAction(
  jobId: string,
  lines: { id: string; label: string; amount: number; kind: 'base' | 'addon' | 'subscription'; selected: boolean }[],
): Promise<{ ok: true; findings: QuoteFinding[]; aiRan: boolean } | { ok: false; message: string }> {
  const { supabase, accountId } = await requireOwnerContext();
  if (!(await checkRateLimit(createAdminClient(), `quote-guard:${accountId}`, 30, 3600))) {
    return { ok: false, message: 'That is a lot of reviews in an hour — give it a few minutes.' };
  }

  const job = await getJob(supabase, accountId, jobId);
  if (!job) return { ok: false, message: 'That job could not be found.' };

  const [services, { data: site }, minMarginPct, loadedRate] = await Promise.all([
    listServices(supabase, accountId, { activeOnly: false }),
    supabase.from('sites').select('content').eq('account_id', accountId).maybeSingle(),
    getMinMarginPct(supabase, accountId),
    accountLoadedHourlyRate(supabase, accountId),
  ]);

  // Match each quote label back to the price book so its COST is known. The
  // model is never involved in this: money comes from the book, exactly as it
  // does in the drafter.
  const byLabel = new Map(services.map((service) => [normalizeLabel(service.name), service]));
  const guardLines: GuardLine[] = lines.map((line) => {
    const match = byLabel.get(normalizeLabel(line.label));
    return {
      ...line,
      unitCost: match ? (match.unit_cost === null ? null : Number(match.unit_cost)) : null,
      unit: match?.unit ?? null,
    };
  });

  // Past quotes, for "you usually also include…". Labels only.
  const { data: past } = await supabase
    .from('jobs')
    .select('quote_items')
    .eq('account_id', accountId)
    .neq('id', jobId)
    .not('quote_items', 'is', null)
    .order('created_at', { ascending: false })
    .limit(60);
  const history = (past ?? []).map((row) => ({
    labels: parseQuoteItems(row.quote_items).filter((item) => item.kind !== 'subscription').map((item) => item.label),
  }));

  const scope = (job.scope ?? '').trim();
  const input = {
    lines: guardLines,
    scope,
    estimatedHours: job.estimated_hours == null ? null : Number(job.estimated_hours),
    loadedHourlyRate: loadedRate,
    minMarginPct,
    history,
  };

  const deterministic = deterministicFindings(input);
  const ai = await findOmissions({
    trade: getSiteContent(site?.content as Record<string, unknown> | null).trade.trim() || null,
    scope,
    labels: billableLines(guardLines).map((line) => line.label),
    estimatedHours: input.estimatedHours,
  });

  return { ok: true, findings: mergeFindings(deterministic, ai), aiRan: Boolean(process.env.OPENAI_API_KEY) && Boolean(scope) };
}

export async function draftQuoteAction(jobId: string): Promise<
  | { ok: true; draft: SerializedDraft }
  | { ok: false; reason: 'no-scope' | 'unavailable' | 'busy'; message: string }
> {
  const { supabase, accountId } = await requireOwnerContext();

  // 20 drafts an hour per account. Generous for a person, and a ceiling on what
  // a stuck retry loop can spend.
  const allowed = await checkRateLimit(createAdminClient(), `quote-draft:${accountId}`, 20, 3600);
  if (!allowed) {
    return { ok: false, reason: 'busy', message: 'That is a lot of drafts in an hour — give it a few minutes.' };
  }

  const context = await loadDraftContext(supabase, accountId, jobId);
  if (!context) return { ok: false, reason: 'unavailable', message: 'That job could not be found.' };
  if (!context.scope) {
    return {
      ok: false,
      reason: 'no-scope',
      message: 'Add a scope of work first — the draft is built from your description of the job.',
    };
  }

  const draft = await draftQuote(context);
  if (!draft) {
    return { ok: false, reason: 'unavailable', message: 'Could not draft a quote just now. Try again in a moment.' };
  }

  return {
    ok: true,
    draft: {
      items: draftToQuoteItems(draft.lines),
      // Provenance rides alongside the items rather than inside them: a
      // QuoteItem is what gets saved and shown to a client, and where a price
      // came from is between us and the contractor.
      provenance: draft.lines.map((line) => ({ source: line.source, note: line.note })),
      summary: draft.summary,
      assumptions: draft.assumptions,
      questions: draft.questions,
      needsMoreInfo: draft.needsMoreInfo,
      confidence: draftConfidenceNote(draft),
      total: draftTotal(draft.lines),
    },
  };
}

// Where a review request should point. Built from the Google Business Profile the
// owner linked in the website builder: a Place ID gives Google's canonical
// "write a review" deep link; failing that, the plain listing URL is a usable
// fallback. Null when no Google business is linked — then reviews have nowhere
// to land and the ask is suppressed. Read-only (never creates a site row).
export async function resolveAccountReviewUrl(
  supabase: SupabaseClient,
  accountId: string,
): Promise<string | null> {
  const { data: site } = await supabase
    .from('sites')
    .select('content')
    .eq('account_id', accountId)
    .maybeSingle();
  if (!site) return null;
  const { testimonials } = getSiteContent(site.content as Record<string, unknown>);
  return googleReviewUrl({ placeId: testimonials.googlePlaceId, listingUrl: testimonials.googleUrl });
}

// Core review-ask delivery, shared by the one-tap button and the auto-send-on-
// complete path. Picks the channel (text if a consented mobile is on file, else
// email), logs an internal feed event, and returns a result message instead of
// throwing so callers can surface exactly what happened. Does NOT revalidate —
// the caller owns that.
async function deliverJobReviewRequest(
  supabase: SupabaseClient,
  accountId: string,
  job: Awaited<ReturnType<typeof getJob>>,
): Promise<{ ok: boolean; message: string }> {
  if (!job) return { ok: false, message: 'Job not found.' };

  const reviewUrl = await resolveAccountReviewUrl(supabase, accountId);
  if (!reviewUrl) {
    return { ok: false, message: 'Link your Google Business Profile in the website builder first so the review has somewhere to go.' };
  }

  const businessName = await loadBusinessName(supabase, accountId);
  // Defensive: mailing_address may be missing on an un-migrated DB, so read it in
  // its own query that degrades to null rather than failing the review send.
  const { data: addressRow } = await supabase.from('accounts').select('mailing_address').eq('id', accountId).maybeSingle();
  const mailingAddress = resolveMarketingMailingAddress(addressRow?.mailing_address as string | null);
  const clientFirstName = (job.client_name || 'there').trim().split(/\s+/)[0] || 'there';

  // Optionally route the ask through the "how did we do?" page, which records a
  // rating for the owner and then offers BOTH a public review and a private
  // note. It is not a gate: the Google link is on that page for every rating.
  // Falls back to the direct Google link if it's switched off or the invite
  // can't be created — a fallback that can only ever widen access, never narrow it.
  let linkUrl = reviewUrl;
  const { data: pref } = await supabase.from('accounts').select('review_feedback_page_enabled').eq('id', accountId).maybeSingle();
  if (pref?.review_feedback_page_enabled) {
    try {
      const token = await createReviewInvite(supabase, accountId, job.id, job.client_name, reviewUrl);
      linkUrl = `${(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '')}/review/${token}`;
    } catch (error) {
      console.error(`Review invite failed for job ${job.id}; sending direct link:`, error instanceof Error ? error.message : error);
    }
  }

  const normalizedPhone = job.client_phone ? normalizeUsPhone(job.client_phone) : null;
  const canText = normalizedPhone ? !(await isPhoneOptedOut(accountId, normalizedPhone)) : false;

  let channel: 'sms' | 'email';
  let sentTo: string;
  try {
    if (canText && normalizedPhone) {
      await recordSmsConsent(accountId, normalizedPhone, 'review_request');
      await sendReviewRequestSms({ phone: normalizedPhone, businessName, clientName: clientFirstName, reviewUrl: linkUrl, accountId });
      channel = 'sms';
      sentTo = normalizedPhone;
    } else if (job.client_email) {
      // A marketing email must carry a physical postal address (CAN-SPAM): if the
      // only channel left is email but no mailing address is on file, don't send.
      if (!mailingAddress) {
        return { ok: false, message: 'Add your business mailing address in Settings to email review requests — it’s required by anti-spam law.' };
      }
      // Honor a marketing unsubscribe: if the only channel left is an email that
      // opted out, don't send (and say why) rather than mail them anyway.
      if (await isEmailSuppressed(supabase, accountId, job.client_email)) {
        return { ok: false, message: `${job.client_name} unsubscribed from emails and has no textable mobile on file, so the review ask can’t be sent.` };
      }
      await sendReviewRequestEmail({ recipientEmail: job.client_email, businessName, clientName: clientFirstName, reviewUrl: linkUrl, accountId, mailingAddress });
      channel = 'email';
      sentTo = job.client_email;
    } else {
      return { ok: false, message: 'No textable mobile or email on file for this client. Add one on the job first.' };
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'The review request could not be sent.';
    console.error(`Review request failed for job ${job.id}:`, reason);
    return { ok: false, message: reason };
  }

  await createJobFeedEvent(supabase, accountId, job.id, {
    kind: 'review_requested',
    title: channel === 'sms' ? 'Review request texted' : 'Review request emailed',
    body: `Asked ${job.client_name} for a Google review.`,
    visibility: 'internal',
    meta: { review_request: true, channel, to: sentTo },
  });

  return {
    ok: true,
    message: channel === 'sms' ? `Texted ${job.client_name} a review link.` : `Emailed ${job.client_name} a review link.`,
  };
}

// True once a review has already been requested for this job — used to keep
// auto-send idempotent so a client is never double-texted if a job flips back
// to in-progress and gets re-completed.
async function reviewAlreadyRequested(supabase: SupabaseClient, accountId: string, jobId: string): Promise<boolean> {
  const { data } = await supabase
    .from('job_feed')
    .select('id')
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .eq('kind', 'review_requested')
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

// One-tap post-job review ask. Texts a happy client a link to leave a Google
// review (email fallback when there's no textable mobile). Returns a result
// message instead of throwing so the button can report exactly what happened —
// texted, emailed, or why it couldn't send.
export async function requestJobReviewAction(jobId: string): Promise<{ ok: boolean; message: string }> {
  const { supabase, accountId } = await requireOwnerContext();
  const job = await getJob(supabase, accountId, jobId);
  const result = await deliverJobReviewRequest(supabase, accountId, job);
  if (result.ok) revalidatePath(`/dashboard/jobs/${jobId}`);

  // Receipt to the contractor, if they want one. Never fails the ask itself.
  if (result.ok && job) {
    try {
      if (await wantsConfirmation(supabase, accountId, 'review_confirmation_email')) {
        const [{ data: { user } }, businessName] = await Promise.all([
          supabase.auth.getUser(),
          loadBusinessName(supabase, accountId, 'Your business'),
        ]);
        if (user?.email) {
          const origin = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');
          const phone = job.client_phone ? normalizeUsPhone(job.client_phone) : null;
          await sendReviewRequestConfirmationEmail({
            recipientEmail: user.email,
            businessName,
            clientName: job.client_name,
            jobRef: job.ref,
            channel: phone ? 'sms' : job.client_email ? 'email' : 'none',
            sentTo: phone || job.client_email || null,
            jobUrl: `${origin}/dashboard/jobs/${jobId}`,
          });
        }
      }
    } catch (err) {
      console.error(`Review confirmation email failed for job ${jobId}:`, err);
    }
  }

  return result;
}

// -- Job checklist / punch list (owner side) --------------------------------

export async function addJobTaskAction(jobId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const title = (formData.get('title') ?? '').toString().trim();
  if (!title) return;
  const job = await getJob(supabase, accountId, jobId);
  if (!job) throw new Error('Job not found for this account.');
  await createJobTask(supabase, accountId, jobId, title);
  revalidatePath(`/dashboard/jobs/${jobId}`);
}

export async function setJobTaskDoneAction(jobId: string, taskId: string, done: boolean) {
  const { supabase, accountId } = await requireOwnerContext();
  await setJobTaskDone(supabase, accountId, taskId, done, 'Owner');
  revalidatePath(`/dashboard/jobs/${jobId}`);
}

export async function deleteJobTaskAction(jobId: string, taskId: string) {
  const { supabase, accountId } = await requireOwnerContext();
  await deleteJobTask(supabase, accountId, taskId);
  revalidatePath(`/dashboard/jobs/${jobId}`);
}

/**
 * The client said yes to a recurring plan, in person or on the phone.
 *
 * Until this existed the only way a subscription line item became a live plan
 * was the client tapping through their own quote page — so a plan agreed
 * verbally had nowhere to be recorded, and the job's status dropdown didn't
 * touch it.
 */
export async function acceptSubscriptionAction(jobId: string, formData: FormData) {
  const { accountId } = await requireOwnerContext();
  const itemId = (formData.get('itemId') ?? '').toString().trim();
  if (!itemId) throw new Error('Missing plan.');
  const startDate = (formData.get('startDate') ?? '').toString().trim();
  const mode = formData.get('mode') === 'prepay' ? 'prepay' : 'cycle';
  // Off unless the owner explicitly says the client has agreed to be charged
  // automatically — accepting on someone's behalf is not the same as holding
  // their card.
  const autoCharge = formData.get('autoCharge') === 'on';

  const { planId } = await acceptSubscriptionForClient(accountId, jobId, itemId, { startDate, mode, autoCharge });

  revalidatePath(`/dashboard/jobs/${jobId}`);
  revalidatePath('/dashboard/recurring');
  revalidatePath('/dashboard/schedule');
  // Straight to the plan: whatever they do next — send the card link, adjust the
  // cadence, check the projected visits — is on that page.
  redirect(`/dashboard/recurring?plan=${planId}`);
}
