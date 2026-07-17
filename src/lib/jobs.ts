import type { SupabaseClient } from '@supabase/supabase-js';

export type JobStatus = 'new_lead' | 'in_progress' | 'complete' | 'archived';
export type CostType = 'material' | 'labor' | 'sub' | 'receipt' | 'other';

export type Job = {
  id: string;
  account_id: string;
  ref: string;
  client_name: string;
  client_phone: string | null;
  address: string | null;
  scope: string | null;
  status: JobStatus;
  scheduled_for: string | null;
  quoted_amount: number;
  photo_paths: string[];
  created_at: string;
};

// Pipeline order for job lists: new leads need attention first, in-progress
// work is actively being tracked, and completed/archived jobs are done —
// they sink to the bottom regardless of how recently they were touched.
export const JOB_STATUS_ORDER: Record<JobStatus, number> = {
  new_lead: 0,
  in_progress: 1,
  complete: 2,
  archived: 3,
};

export function sortJobsByStatus<T extends { status: JobStatus; created_at: string }>(jobs: T[]): T[] {
  return [...jobs].sort((a, b) => {
    const statusDiff = JOB_STATUS_ORDER[a.status] - JOB_STATUS_ORDER[b.status];
    if (statusDiff !== 0) return statusDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export type Cost = {
  id: string;
  account_id: string;
  job_id: string;
  type: CostType;
  category: string;
  description: string;
  amount: number;
  supplier: string | null;
  receipt_url: string | null;
  crew_id: string | null;
  hours: number | null;
  rate: number | null;
  created_at: string;
};

export type JobInput = {
  clientName: string;
  clientPhone?: string | null;
  address?: string | null;
  scope?: string | null;
  status?: JobStatus;
  scheduledFor?: string | null;
  quotedAmount?: number;
  photoPaths?: string[];
};

export type CostInput =
  | {
      type: 'labor';
      description: string;
      crewId?: string | null;
      hours: number;
      rate: number;
    }
  | {
      type: Exclude<CostType, 'labor'>;
      description: string;
      amount: number;
      supplier?: string | null;
      receiptUrl?: string | null;
    };

const COST_TYPE_CATEGORY: Record<CostType, string> = {
  material: 'Materials',
  labor: 'Labor',
  sub: 'Subcontractor',
  receipt: 'Receipt',
  other: 'Other',
};

// -- Margin calculation -------------------------------------------------
// Revenue is the job's quoted amount (the signed/agreed price) until
// invoicing (a later build step) provides a real paid/signed invoice total.
export type Margin = {
  revenue: number;
  materialsCost: number;
  laborCost: number;
  otherCost: number;
  totalCost: number;
  profit: number;
  margin: number; // 0..1 (or negative)
};

export function computeMargin(job: Pick<Job, 'quoted_amount'>, costs: Cost[]): Margin {
  const revenue = Number(job.quoted_amount) || 0;
  const materialsCost = costs
    .filter((c) => c.type === 'material' || c.type === 'sub' || c.type === 'receipt')
    .reduce((sum, c) => sum + Number(c.amount), 0);
  const laborCost = costs.filter((c) => c.type === 'labor').reduce((sum, c) => sum + Number(c.amount), 0);
  const otherCost = costs.filter((c) => c.type === 'other').reduce((sum, c) => sum + Number(c.amount), 0);
  const totalCost = materialsCost + laborCost + otherCost;
  const profit = revenue - totalCost;
  const margin = revenue ? profit / revenue : 0;

  return { revenue, materialsCost, laborCost, otherCost, totalCost, profit, margin };
}

export function formatMoney(n: number): string {
  return '$' + Math.round(n).toLocaleString();
}

export function formatPercent(n: number): string {
  return (n * 100).toFixed(0) + '%';
}

// -- Job ref generation ---------------------------------------------------
async function generateJobRef(supabase: SupabaseClient, accountId: string): Promise<string> {
  const { data } = await supabase
    .from('jobs')
    .select('ref')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(1);

  const lastRef = data?.[0]?.ref as string | undefined;
  const lastNumber = lastRef ? parseInt(lastRef.replace(/^J-/, ''), 10) : NaN;
  const nextNumber = Number.isFinite(lastNumber) ? lastNumber + 1 : 1001;

  return `J-${nextNumber}`;
}

// -- Jobs CRUD (uses a session-scoped client so RLS enforces isolation) ---
export async function listJobs(
  supabase: SupabaseClient,
  accountId: string,
  statusFilter?: JobStatus
): Promise<Job[]> {
  let query = supabase
    .from('jobs')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });

  if (statusFilter) {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return sortJobsByStatus((data ?? []) as Job[]);
}

export async function getJob(supabase: SupabaseClient, accountId: string, jobId: string): Promise<Job | null> {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('account_id', accountId)
    .eq('id', jobId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as Job) ?? null;
}

export async function createJob(supabase: SupabaseClient, accountId: string, input: JobInput): Promise<Job> {
  const ref = await generateJobRef(supabase, accountId);

  const { data, error } = await supabase
    .from('jobs')
    .insert({
      account_id: accountId,
      ref,
      client_name: input.clientName,
      client_phone: input.clientPhone ?? null,
      address: input.address ?? null,
      scope: input.scope ?? null,
      status: input.status ?? 'new_lead',
      scheduled_for: input.scheduledFor ?? null,
      quoted_amount: input.quotedAmount ?? 0,
      photo_paths: input.photoPaths ?? [],
    })
    .select('*')
    .single();

  if (error || !data) {
    throw error ?? new Error('Unable to create job');
  }

  return data as Job;
}

export async function updateJob(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  input: JobInput
): Promise<Job> {
  const { data, error } = await supabase
    .from('jobs')
    .update({
      client_name: input.clientName,
      client_phone: input.clientPhone ?? null,
      address: input.address ?? null,
      scope: input.scope ?? null,
      status: input.status ?? 'new_lead',
      scheduled_for: input.scheduledFor ?? null,
      quoted_amount: input.quotedAmount ?? 0,
    })
    .eq('account_id', accountId)
    .eq('id', jobId)
    .select('*')
    .single();

  if (error || !data) {
    throw error ?? new Error('Unable to update job');
  }

  return data as Job;
}

export async function deleteJob(supabase: SupabaseClient, accountId: string, jobId: string): Promise<void> {
  const { error } = await supabase.from('jobs').delete().eq('account_id', accountId).eq('id', jobId);

  if (error) {
    throw error;
  }
}

// Targeted update used by the schedule/calendar view — only touches
// scheduled_for so it can't accidentally clobber the rest of the job record.
export async function updateJobSchedule(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  scheduledFor: string | null
): Promise<Job> {
  const { data, error } = await supabase
    .from('jobs')
    .update({ scheduled_for: scheduledFor })
    .eq('account_id', accountId)
    .eq('id', jobId)
    .select('*')
    .single();

  if (error || !data) {
    throw error ?? new Error('Unable to update job schedule.');
  }

  return data as Job;
}

// Appends newly uploaded photo paths to the job's existing gallery.
export async function addJobPhotos(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  paths: string[]
): Promise<Job> {
  const job = await getJob(supabase, accountId, jobId);
  if (!job) throw new Error('Job not found.');

  const { data, error } = await supabase
    .from('jobs')
    .update({ photo_paths: [...job.photo_paths, ...paths] })
    .eq('account_id', accountId)
    .eq('id', jobId)
    .select('*')
    .single();

  if (error || !data) {
    throw error ?? new Error('Unable to add job photos.');
  }

  return data as Job;
}

// Removes a single photo path from the job's gallery (storage cleanup is
// handled by the caller via deleteJobPhotos).
export async function removeJobPhoto(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  path: string
): Promise<Job> {
  const job = await getJob(supabase, accountId, jobId);
  if (!job) throw new Error('Job not found.');

  const { data, error } = await supabase
    .from('jobs')
    .update({ photo_paths: job.photo_paths.filter((existing) => existing !== path) })
    .eq('account_id', accountId)
    .eq('id', jobId)
    .select('*')
    .single();

  if (error || !data) {
    throw error ?? new Error('Unable to remove job photo.');
  }

  return data as Job;
}

// -- Costs CRUD -------------------------------------------------------------
export async function listCosts(supabase: SupabaseClient, accountId: string, jobId: string): Promise<Cost[]> {
  const { data, error } = await supabase
    .from('costs')
    .select('*')
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as Cost[];
}

export async function createCost(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  input: CostInput
): Promise<Cost> {
  // Verify the job actually belongs to this account before attaching a cost to
  // it. RLS on `costs` only checks costs.account_id, not job_id/account_id
  // consistency, so without this check a caller could attach a cost row to a
  // job_id belonging to a different account (polluting that job's margin).
  const job = await getJob(supabase, accountId, jobId);
  if (!job) {
    throw new Error('Job not found for this account.');
  }

  const category = COST_TYPE_CATEGORY[input.type];

  const row: Record<string, unknown> =
    input.type === 'labor'
      ? {
          account_id: accountId,
          job_id: jobId,
          type: 'labor' as const,
          category,
          description: input.description,
          crew_id: input.crewId ?? null,
          hours: input.hours,
          rate: input.rate,
          // Labor amount is always server-computed as hours × rate — never
          // trust a client-supplied amount for labor line items.
          amount: Math.round(input.hours * input.rate * 100) / 100,
        }
      : {
          account_id: accountId,
          job_id: jobId,
          type: input.type,
          category,
          description: input.description,
          amount: input.amount,
          supplier: input.supplier ?? null,
          receipt_url: input.receiptUrl ?? null,
        };

  const { data, error } = await supabase.from('costs').insert(row).select('*').single();

  if (error || !data) {
    throw error ?? new Error('Unable to create cost');
  }

  return data as Cost;
}

export async function deleteCost(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  costId: string
): Promise<void> {
  const { error } = await supabase
    .from('costs')
    .delete()
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .eq('id', costId);

  if (error) {
    throw error;
  }
}
