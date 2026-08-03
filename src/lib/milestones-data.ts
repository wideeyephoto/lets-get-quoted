import type { SupabaseClient } from '@supabase/supabase-js';
import { createJobPhotoLinks } from '@/lib/job-photo-storage';
import { createDepositRequest, type Payment } from '@/lib/payments';
import { getJob } from '@/lib/jobs';
import {
  canRequestPayment, milestoneProgressPct, milestoneReadiness, milestoneStatus,
  MILESTONE_STATUS_CLIENT_LABEL,
  type Milestone, type MilestoneKind, type MilestonePayment, type MilestonePhoto,
  type MilestoneProof, type MilestoneStatus, type PhotoPhase,
} from '@/lib/milestones';
import type { ClientMilestone } from '@/lib/job-feed';

// Storage and transitions for Proof-to-Pay milestones. The rules live in
// lib/milestones; this is what talks to the database.

export type MilestoneEntry = {
  milestone: Milestone;
  proof: MilestoneProof;
  payment: MilestonePayment | null;
  status: MilestoneStatus;
  blockers: string[];
  canRequest: boolean;
};

const MILESTONE_FIELDS =
  'id, title, scope, amount, sort_order, kind, require_before_photos, require_after_photos, submitted_at, payment_id';

function toMilestone(row: Record<string, unknown>): Milestone {
  return {
    id: row.id as string,
    title: (row.title as string) ?? '',
    scope: (row.scope as string | null) ?? null,
    amount: Number(row.amount) || 0,
    sortOrder: Number(row.sort_order) || 0,
    kind: ((row.kind as MilestoneKind) ?? 'stage'),
    requireBeforePhotos: Number(row.require_before_photos) || 0,
    requireAfterPhotos: Number(row.require_after_photos) || 0,
    submittedAt: (row.submitted_at as string | null) ?? null,
    paymentId: (row.payment_id as string | null) ?? null,
  };
}

/**
 * Every milestone on a job, with its proof and its payment.
 *
 * Photo URLs are signed here rather than by the caller: a milestone whose
 * pictures don't load is a milestone that can't do its job, and leaving that to
 * each of the three screens that render one is three chances to forget.
 *
 * Defensive on the whole read — before the migration this table does not exist,
 * and a job page must not 500 over a feature the account hasn't got yet.
 */
export async function listMilestones(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  options?: { signPhotos?: boolean },
): Promise<MilestoneEntry[]> {
  const { data: rows, error } = await supabase
    .from('job_milestones')
    .select(MILESTONE_FIELDS)
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error || !rows?.length) return [];

  const milestones = rows.map((row) => toMilestone(row as Record<string, unknown>));
  const ids = milestones.map((milestone) => milestone.id);
  const paymentIds = milestones.map((milestone) => milestone.paymentId).filter((id): id is string => Boolean(id));

  const [{ data: tasks }, { data: photos }, { data: payments }] = await Promise.all([
    supabase.from('job_tasks').select('id, title, done, milestone_id').in('milestone_id', ids),
    supabase.from('milestone_photos').select('id, milestone_id, path, phase, caption').in('milestone_id', ids)
      .order('created_at', { ascending: true }),
    paymentIds.length
      ? supabase.from('payments').select('id, status, amount').in('id', paymentIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ]);

  // One signing round trip for the whole job rather than one per milestone.
  let urlByPath = new Map<string, string>();
  if (options?.signPhotos !== false && photos?.length) {
    try {
      const links = await createJobPhotoLinks(accountId, photos.map((photo) => photo.path as string));
      urlByPath = new Map(links.map((link) => [link.path, link.url]));
    } catch {
      // A signing failure costs the pictures, not the page.
      urlByPath = new Map();
    }
  }

  const paymentById = new Map(
    (payments ?? []).map((payment) => [
      payment.id as string,
      { id: payment.id as string, status: payment.status as MilestonePayment['status'], amount: Number(payment.amount) || 0 },
    ]),
  );

  return milestones.map((milestone) => {
    const proof: MilestoneProof = {
      tasks: (tasks ?? [])
        .filter((task) => task.milestone_id === milestone.id)
        .map((task) => ({ id: task.id as string, title: task.title as string, done: Boolean(task.done) })),
      photos: (photos ?? [])
        .filter((photo) => photo.milestone_id === milestone.id)
        .map((photo): MilestonePhoto => ({
          id: photo.id as string,
          path: photo.path as string,
          phase: photo.phase as PhotoPhase,
          caption: (photo.caption as string | null) ?? null,
          url: urlByPath.get(photo.path as string),
        })),
    };
    const payment = milestone.paymentId ? paymentById.get(milestone.paymentId) ?? null : null;
    return {
      milestone,
      proof,
      payment,
      status: milestoneStatus(milestone, proof, payment),
      blockers: milestoneReadiness(milestone, proof).blockers,
      canRequest: canRequestPayment(milestone, proof, payment),
    };
  });
}

/**
 * Milestones as the homeowner sees them.
 *
 * Two rules shape this. First, a stage nobody has started is NOT shown: it is
 * the contractor's private plan for how they intend to invoice, and publishing
 * it invites an argument about work that hasn't happened. Second, none of the
 * contractor's machinery crosses over — no blockers, no photo quotas, no "ready
 * to bill". A customer shown "2 of 3 items still to tick off" has been handed
 * somebody else's to-do list and asked to police it.
 */
export async function loadClientMilestones(
  admin: SupabaseClient,
  accountId: string,
  jobId: string,
): Promise<ClientMilestone[]> {
  const entries = await listMilestones(admin, accountId, jobId);

  return entries
    .filter((entry) => entry.status !== 'planned')
    .map((entry) => {
      const { milestone, proof, payment, status } = entry;
      // The pay link appears only when a payment genuinely exists. Work that is
      // finished but not yet billed shows as progress, never as a demand.
      const payable = payment && ['requested', 'failed'].includes(payment.status);
      return {
        id: milestone.id,
        title: milestone.title,
        scope: milestone.scope,
        amount: Number(milestone.amount) || 0,
        status,
        statusLabel: MILESTONE_STATUS_CLIENT_LABEL[status],
        progressPct: milestoneProgressPct(milestone, proof),
        tasks: proof.tasks.map((task) => ({ title: task.title, done: task.done })),
        photos: proof.photos
          .filter((photo): photo is typeof photo & { url: string } => Boolean(photo.url))
          .map((photo) => ({ id: photo.id, phase: photo.phase, caption: photo.caption, url: photo.url })),
        payHref: payable ? `/pay/${payment.id}` : null,
        paidAt: null,
      };
    });
}

export type MilestoneInput = {
  title: string;
  scope?: string | null;
  amount: number;
  kind: MilestoneKind;
  requireBeforePhotos?: number;
  requireAfterPhotos?: number;
  sortOrder?: number;
};

export async function createMilestone(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  input: MilestoneInput,
): Promise<string> {
  // Same ownership check every other job-attached write does: RLS only proves
  // the row's account_id, not that this job belongs to that account.
  const job = await getJob(supabase, accountId, jobId);
  if (!job) throw new Error('Job not found for this account.');

  const { data, error } = await supabase
    .from('job_milestones')
    .insert({
      account_id: accountId,
      job_id: jobId,
      title: input.title.trim().slice(0, 120) || 'Milestone',
      scope: input.scope?.trim().slice(0, 1000) || null,
      amount: Math.max(0, Number(input.amount) || 0),
      kind: input.kind,
      require_before_photos: clampCount(input.requireBeforePhotos),
      require_after_photos: clampCount(input.requireAfterPhotos),
      sort_order: Number.isFinite(input.sortOrder) ? Number(input.sortOrder) : 0,
    })
    .select('id')
    .single();

  if (error || !data) throw error ?? new Error('Could not create the milestone.');
  return data.id as string;
}

function clampCount(value: unknown): number {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(10, Math.max(0, parsed));
}

/**
 * Edit a milestone.
 *
 * Amount and proof requirements are frozen once a payment exists: changing what
 * was required AFTER asking somebody to pay rewrites the terms of a bill they
 * are looking at. Title and scope stay editable — fixing a typo in a promise
 * does not change it.
 */
export async function updateMilestone(
  supabase: SupabaseClient,
  accountId: string,
  milestoneId: string,
  input: Partial<MilestoneInput>,
): Promise<void> {
  const { data: existing } = await supabase
    .from('job_milestones')
    .select('payment_id')
    .eq('account_id', accountId)
    .eq('id', milestoneId)
    .maybeSingle();

  const locked = Boolean(existing?.payment_id);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) patch.title = input.title.trim().slice(0, 120) || 'Milestone';
  if (input.scope !== undefined) patch.scope = input.scope?.trim().slice(0, 1000) || null;
  if (!locked) {
    if (input.amount !== undefined) patch.amount = Math.max(0, Number(input.amount) || 0);
    if (input.kind !== undefined) patch.kind = input.kind;
    if (input.requireBeforePhotos !== undefined) patch.require_before_photos = clampCount(input.requireBeforePhotos);
    if (input.requireAfterPhotos !== undefined) patch.require_after_photos = clampCount(input.requireAfterPhotos);
  }
  if (input.sortOrder !== undefined) patch.sort_order = Number(input.sortOrder) || 0;

  const { error } = await supabase
    .from('job_milestones')
    .update(patch)
    .eq('account_id', accountId)
    .eq('id', milestoneId);
  if (error) throw error;
}

/**
 * Remove a milestone.
 *
 * Refused once money has been asked for: deleting the stage would leave a
 * payment on the job with nothing explaining what it was for, which is exactly
 * the situation this feature exists to prevent.
 */
export async function deleteMilestone(
  supabase: SupabaseClient,
  accountId: string,
  milestoneId: string,
): Promise<void> {
  const { data: existing } = await supabase
    .from('job_milestones')
    .select('payment_id')
    .eq('account_id', accountId)
    .eq('id', milestoneId)
    .maybeSingle();
  if (existing?.payment_id) {
    throw new Error('This milestone has already been billed. Cancel the payment request first.');
  }

  // Release any checklist items back to the job rather than deleting them —
  // the work was still real, and quietly binning a crew's ticked list because
  // the billing stage was reorganised would be its own small betrayal.
  await supabase.from('job_tasks').update({ milestone_id: null }).eq('account_id', accountId).eq('milestone_id', milestoneId);

  const { error } = await supabase.from('job_milestones').delete().eq('account_id', accountId).eq('id', milestoneId);
  if (error) throw error;
}

/** Point an existing job task at a milestone, or release it back to the job. */
export async function assignTaskToMilestone(
  supabase: SupabaseClient,
  accountId: string,
  taskId: string,
  milestoneId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('job_tasks')
    .update({ milestone_id: milestoneId })
    .eq('account_id', accountId)
    .eq('id', taskId);
  if (error) throw error;
}

export async function addMilestonePhoto(
  supabase: SupabaseClient,
  accountId: string,
  input: { milestoneId: string; jobId: string; path: string; phase: PhotoPhase; caption?: string | null },
): Promise<void> {
  const { error } = await supabase.from('milestone_photos').insert({
    account_id: accountId,
    milestone_id: input.milestoneId,
    job_id: input.jobId,
    path: input.path,
    phase: input.phase,
    caption: input.caption?.trim().slice(0, 160) || null,
  });
  if (error) throw error;
}

export async function deleteMilestonePhoto(
  supabase: SupabaseClient,
  accountId: string,
  photoId: string,
): Promise<void> {
  // The storage object is deliberately left in place: it may also be attached
  // to the job's own gallery, and orphaning a file is cheaper than deleting a
  // picture somebody else is still using.
  const { error } = await supabase.from('milestone_photos').delete().eq('account_id', accountId).eq('id', photoId);
  if (error) throw error;
}

/**
 * Ask to be paid for a milestone.
 *
 * The gate is re-evaluated HERE, from the database, against the same function
 * the button uses. The disabled button is a courtesy; this is the rule. A
 * server action answers anyone who can construct the request, so a check that
 * only exists in the browser is not a check.
 */
export async function requestMilestonePayment(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  milestoneId: string,
  options: { invoiceId?: string; homeownerPhone?: string | null; smsConsent?: boolean },
): Promise<{ ok: false; blockers: string[] } | { ok: true; payment: Payment }> {
  const entries = await listMilestones(supabase, accountId, jobId, { signPhotos: false });
  const entry = entries.find((candidate) => candidate.milestone.id === milestoneId);
  if (!entry) return { ok: false, blockers: ['That milestone could not be found.'] };

  if (!entry.canRequest) {
    return {
      ok: false,
      blockers: entry.blockers.length > 0
        ? entry.blockers
        : ['A payment has already been requested for this milestone.'],
    };
  }

  const { milestone } = entry;
  const payment = await createDepositRequest(supabase, accountId, jobId, {
    // The stage name IS the payment label, so the homeowner's bank statement,
    // their pay page and their progress list all say the same thing.
    label: milestone.title,
    amount: milestone.amount,
    kind: milestone.kind,
    invoiceId: options.invoiceId,
    homeownerPhone: options.homeownerPhone ?? null,
    smsConsent: options.smsConsent ?? false,
  });

  const { error } = await supabase
    .from('job_milestones')
    .update({
      payment_id: payment.id,
      // Only stamped the first time. Re-requesting after a failure records the
      // new payment, but the moment the work was proven stays where it was.
      ...(milestone.submittedAt ? {} : { submitted_at: new Date().toISOString() }),
      updated_at: new Date().toISOString(),
    })
    .eq('account_id', accountId)
    .eq('id', milestoneId);
  if (error) throw error;

  return { ok: true, payment };
}
