'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOwnerContext } from '@/lib/auth';
import { getJob } from '@/lib/jobs';
import { ensureSmsConsentBaseline } from '@/lib/sms';
import { saveCrewStartAddress } from '@/lib/crew';
import {
  cancelSubcontractorRequest,
  chooseSubcontractor,
  createSubcontractorRequest,
  getSubcontractorRequest,
  reopenSubcontractorRequest,
  saveSubcontractorReview,
  sendSubcontractorRequest,
} from '@/lib/subcontractor-dispatch-data';
import {
  normalizeSelectionMode,
  offerMessageProblem,
  requestDraftProblem,
} from '@/lib/subcontractor-dispatch';
import { readSubcontractorForm, subcontractorColumns, subcontractorProblem } from '@/lib/subcontractor-form';

export type { CreateCrewState } from '@/lib/crew-add-state';
import type { CreateCrewState } from '@/lib/crew-add-state';

/**
 * Every surface that shows a subcontractor or a request, revalidated together.
 *
 * One list rather than a handful at each call site: adding a firm changes the
 * roster, the match list on every open composer and the counts on the Job
 * requests tab, and the last time these were written out by hand one of them
 * was missed and the tab showed a stale "0 open requests" over a live one.
 */
function revalidateDispatch(jobId?: string | null) {
  revalidatePath('/dashboard/crew');
  revalidatePath('/dashboard/crew/requests/new');
  if (jobId) revalidatePath(`/dashboard/jobs/${jobId}`);
  revalidatePath('/dashboard/jobs');
}

// -- the directory ---------------------------------------------------------------

/**
 * Add a subcontractor.
 *
 * Returns a value for every outcome rather than throwing, for the same reason
 * createCrewAction does: the drawer has to be able to keep a half-filled form on
 * screen and put the reason next to it. See lib/crew-add-state.
 */
export async function createSubcontractorAction(
  _previous: CreateCrewState,
  formData: FormData,
): Promise<CreateCrewState> {
  const values = readSubcontractorForm(formData);
  const problem = subcontractorProblem(values);
  if (problem) return { status: 'error', message: problem };

  try {
    const { supabase, accountId } = await requireOwnerContext();
    const { data, error } = await supabase
      .from('crew')
      .insert({ account_id: accountId, ...subcontractorColumns(values) })
      .select('id, name')
      .single();

    if (error || !data) {
      // 42703 / PGRST204 — the deploy is ahead of its migration. Say so plainly
      // rather than showing PostgREST's column name to a contractor.
      if (error?.code === '42703' || error?.code === 'PGRST204') {
        return {
          status: 'error',
          message: 'Subcontractors need the 2026-08-17 database migration. Ask your admin to run it, then try again.',
        };
      }
      throw error ?? new Error('That subcontractor could not be saved.');
    }

    // Where their day starts, so distance matching has something to measure
    // from. Precise-only and best-effort, exactly like a crew member's.
    const serviceAddress = (formData.get('baseAddress') ?? '').toString().trim();
    if (serviceAddress) await saveCrewStartAddress(supabase, accountId, data.id as string, serviceAddress);

    await ensureSmsConsentBaseline(accountId, values.phone, 'subcontractor_added').catch(() => {});

    revalidateDispatch();
    return {
      status: 'added',
      id: data.id as string,
      name: (data.name as string) ?? values.name,
      message: `${values.companyName || values.name} was added to your subcontractors.`,
      invite: 'skipped',
    };
  } catch (error) {
    console.error('createSubcontractorAction failed:', error);
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'That subcontractor could not be saved. Try again.',
    };
  }
}

export async function updateSubcontractorAction(crewId: string, formData: FormData) {
  const values = readSubcontractorForm(formData);
  const problem = subcontractorProblem(values);
  if (problem) throw new Error(problem);

  const { supabase, accountId } = await requireOwnerContext();
  const { error } = await supabase
    .from('crew')
    .update(subcontractorColumns(values))
    .eq('account_id', accountId)
    .eq('id', crewId)
    .is('deleted_at', null);
  if (error) throw error;

  const baseAddress = (formData.get('baseAddress') ?? '').toString().trim();
  await saveCrewStartAddress(supabase, accountId, crewId, baseAddress || null);
  await ensureSmsConsentBaseline(accountId, values.phone, 'subcontractor_added').catch(() => {});

  revalidateDispatch();
}

// -- requests ----------------------------------------------------------------------

function parseSkills(value: FormDataEntryValue | null): string[] {
  return (value ?? '')
    .toString()
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Create the request, then go to it. Two steps on purpose: picking recipients
 * needs a request to hang the offers off, and a draft that exists is one an
 * owner can come back to.
 */
export async function createRequestAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  const jobId = (formData.get('jobId') ?? '').toString().trim();
  const input = {
    jobId,
    workDescription: (formData.get('workDescription') ?? '').toString().trim(),
    generalLocation: (formData.get('generalLocation') ?? '').toString().trim(),
    payAmount: Number((formData.get('payAmount') ?? '').toString().replace(/[$,]/g, '')),
    expiresAt: (formData.get('expiresAt') ?? '').toString(),
    serviceDate: (formData.get('serviceDate') ?? '').toString().trim() || null,
    windowStart: (formData.get('windowStart') ?? '').toString().trim() || null,
    windowEnd: (formData.get('windowEnd') ?? '').toString().trim() || null,
    requiredTrade: (formData.get('requiredTrade') ?? '').toString().trim(),
  };

  // A datetime-local carries no zone, so it is read as the owner's own clock —
  // which is what they typed and what the sub will read in their text.
  const expiresAt = new Date(input.expiresAt);
  const problem = requestDraftProblem({ ...input, expiresAt: expiresAt.toISOString() });
  if (problem) throw new Error(problem);

  // The job has to belong to this account. requireOwnerContext gives us a
  // session client and RLS would refuse the insert anyway, but failing here
  // gives the owner a sentence instead of a foreign key violation.
  const job = await getJob(supabase, accountId, jobId);
  if (!job) throw new Error('That job is not on your account.');

  const request = await createSubcontractorRequest(supabase, accountId, {
    jobId,
    workDescription: input.workDescription,
    serviceDate: input.serviceDate,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    generalLocation: input.generalLocation,
    payAmount: input.payAmount,
    payKind: 'fixed',
    requiredTrade: input.requiredTrade,
    requiredSkills: parseSkills(formData.get('requiredSkills')),
    requiresLicense: formData.get('requiresLicense') !== null,
    requiresInsurance: formData.get('requiresInsurance') !== null,
    expiresAt: expiresAt.toISOString(),
    selectionMode: normalizeSelectionMode(formData.get('selectionMode')),
    documentPaths: formData.getAll('documentPaths').map((entry) => entry.toString()).filter(Boolean),
    messageBody: (formData.get('messageBody') ?? '').toString(),
  });

  revalidateDispatch(jobId);
  redirect(`/dashboard/crew/requests/${request.id}`);
}

/**
 * SEND. The explicit, final, one-way action.
 *
 * Nothing before this reaches a phone: ticking a recipient in the composer is a
 * checkbox and no more. That is a product rule, not an implementation detail —
 * an interface where selecting somebody texts them is an interface where a
 * mis-click costs an owner their reputation with a firm they need.
 */
export async function sendRequestAction(requestId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  const messageBody = (formData.get('messageBody') ?? '').toString();
  const messageProblem = offerMessageProblem(messageBody);
  if (messageProblem) throw new Error(messageProblem);

  const crewIds = formData.getAll('crewIds').map((entry) => entry.toString()).filter(Boolean);
  if (crewIds.length === 0) throw new Error('Pick at least one subcontractor before sending.');

  const result = await sendSubcontractorRequest(supabase, accountId, requestId, { crewIds, messageBody });
  revalidateDispatch(result.request.jobId);
  redirect(`/dashboard/crew/requests/${requestId}?sent=${result.sent}`);
}

export async function cancelRequestAction(requestId: string) {
  const { supabase, accountId } = await requireOwnerContext();
  const existing = await getSubcontractorRequest(supabase, accountId, requestId);
  await cancelSubcontractorRequest(supabase, accountId, requestId);
  revalidateDispatch(existing?.request.jobId ?? null);
  revalidatePath(`/dashboard/crew/requests/${requestId}`);
}

export async function reopenRequestAction(requestId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const raw = (formData.get('expiresAt') ?? '').toString();
  const expiresAt = new Date(raw);
  if (Number.isNaN(expiresAt.getTime())) throw new Error('Pick a new expiration before reopening.');

  const request = await reopenSubcontractorRequest(supabase, accountId, requestId, expiresAt.toISOString());
  revalidateDispatch(request.jobId);
  revalidatePath(`/dashboard/crew/requests/${requestId}`);
}

export async function chooseSubcontractorAction(requestId: string, offerId: string) {
  const { supabase, accountId } = await requireOwnerContext();
  const result = await chooseSubcontractor(supabase, accountId, requestId, offerId);
  if (result.status === 'already_claimed') throw new Error('This job has already been claimed.');
  const existing = await getSubcontractorRequest(supabase, accountId, requestId);
  revalidateDispatch(existing?.request.jobId ?? null);
  revalidatePath(`/dashboard/crew/requests/${requestId}`);
}

// -- the private review --------------------------------------------------------------

export async function saveSubcontractorReviewAction(jobId: string, crewId: string, formData: FormData) {
  const { supabase, accountId, userEmail } = await requireOwnerContext();

  const score = (key: string) => Number((formData.get(key) ?? '').toString()) || 0;
  await saveSubcontractorReview(
    supabase,
    accountId,
    {
      jobId,
      crewId,
      requestId: (formData.get('requestId') ?? '').toString().trim() || null,
      workQuality: score('workQuality'),
      communication: score('communication'),
      onTime: score('onTime'),
      cleanliness: score('cleanliness'),
      withinPrice: formData.get('withinPrice') !== null,
      hireAgain: formData.get('hireAgain') !== null,
      notes: (formData.get('notes') ?? '').toString(),
    },
    userEmail,
  );

  revalidatePath('/dashboard/crew');
  revalidatePath(`/dashboard/jobs/${jobId}`);
}
