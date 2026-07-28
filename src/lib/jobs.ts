import type { SupabaseClient } from '@supabase/supabase-js';
import { findOrCreateClientId } from '@/lib/clients';
import { normalizeUsPhone } from '@/lib/phone';

export type JobStatus = 'new_lead' | 'in_progress' | 'complete' | 'archived';
export type CostType = 'material' | 'labor' | 'sub' | 'receipt' | 'other';

// A single line on an itemized quote. `base` items are always included; `addon`
// items are optional upsells the client can accept (`selected`). The quote total
// is base + selected add-ons — see computeQuoteTotal.
export type QuoteSubscriptionFrequency = 'weekly' | 'biweekly' | 'monthly';
export type QuoteItemKind = 'base' | 'addon' | 'subscription';
export type QuoteItem = {
  id: string;
  label: string;
  amount: number;
  kind: QuoteItemKind;
  selected: boolean;
  // Add-ons only: flags the upsell the contractor wants to nudge, shown to the
  // client as a "Recommended" badge. Never affects the total.
  recommended: boolean;
  // Subscriptions only: the recurring cadence the client signs up for on
  // approval. Excluded from the one-off quote total (it's a separate charge).
  frequency?: QuoteSubscriptionFrequency;
  // Optional expiration — number of billing cycles before the plan ends
  // (e.g. 12 monthly = a 1-year plan). 0/undefined = ongoing, no expiration.
  termCycles?: number;
  // Optional: with a term set, the client may prepay the whole term up front
  // for this % discount (e.g. 10). 0/undefined = no pay-in-full offer.
  prepayDiscountPercent?: number;
  // Subscriptions only: true once the client has signed up (per-cycle or
  // prepaid) so the signup prompt stops offering it.
  signedUp?: boolean;
};

export type Job = {
  id: string;
  account_id: string;
  ref: string;
  client_name: string;
  client_phone: string | null;
  client_email: string | null;
  address: string | null;
  scope: string | null;
  status: JobStatus;
  scheduled_for: string | null;
  scheduled_time: string | null;
  estimated_hours: number | null;
  quoted_amount: number;
  deposit_gate: 'before_schedule' | 'before_work' | null;
  quote_items: QuoteItem[] | null;
  client_id: string | null;
  photo_paths: string[];
  lat?: number | null;
  lng?: number | null;
  geocoded_at?: string | null;
  created_at: string;
};

// Pipeline order for job lists: new requests need attention first, in-progress
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
  client_charge_payment_id: string | null;
  client_charge_requested_at: string | null;
  crew_id: string | null;
  crew_name: string | null;
  crew_role_label: string | null;
  hours: number | null;
  rate: number | null;
  created_at: string;
};

export type JobInput = {
  clientName: string;
  clientPhone?: string | null;
  clientEmail?: string | null;
  address?: string | null;
  scope?: string | null;
  status?: JobStatus;
  scheduledFor?: string | null;
  scheduledTime?: string | null;
  estimatedHours?: number | null;
  quotedAmount?: number;
  photoPaths?: string[];
};

export type ListJobsOptions = {
  includeLeadQuotes?: boolean;
};

export type CostInput =
  | {
      type: 'labor';
      description: string;
      crewId?: string | null;
      supplier?: string | null;
      hours: number;
      rate: number;
    }
  | {
      type: Exclude<CostType, 'labor'>;
      description: string;
      amount: number;
      // Attribute a material/expense to the crew member who logged it. Set inline
      // at insert time (not a follow-up update) so crew RLS — which lets a crew
      // member insert/read only their OWN cost rows — accepts and returns it.
      crewId?: string | null;
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

export function formatJobQuoteSummary(
  job: Pick<Job, 'client_name' | 'address' | 'scope' | 'estimated_hours' | 'quoted_amount'>,
  options?: { includeHours?: boolean },
): string {
  // This summary is the body of the client-visible job_created feed event, so
  // the contractor can choose to keep estimated hours off the client's copy.
  const includeHours = options?.includeHours !== false;
  const details = [
    `Job was added for ${job.client_name}.`,
    `Quoted amount: ${formatMoney(Number(job.quoted_amount) || 0)}.`,
    includeHours ? (job.estimated_hours ? `Estimated hours: ${job.estimated_hours}.` : 'Estimated hours: not set.') : null,
    job.address ? `Address: ${job.address}.` : null,
    job.scope ? `Job description: ${job.scope}` : null,
  ].filter(Boolean);

  return details.join(' ');
}

export function formatPercent(n: number): string {
  return (n * 100).toFixed(0) + '%';
}

export function formatJobTime(time: string | null): string | null {
  if (!time) return null;
  const [hourValue, minuteValue] = time.split(':');
  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${suffix}`;
}

export function formatJobSchedule(scheduledFor: string | null, scheduledTime?: string | null): string {
  if (!scheduledFor) return 'Not yet scheduled';
  const date = new Date(`${scheduledFor}T00:00:00`);
  const dateLabel = Number.isNaN(date.getTime())
    ? scheduledFor
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeLabel = formatJobTime(scheduledTime ?? null);
  return timeLabel ? `${dateLabel} at ${timeLabel}` : dateLabel;
}

export function getJobScheduleSpanDays(
  job: Pick<Job, 'status' | 'estimated_hours'>,
  workDayHours: number
): number {
  if (job.status === 'complete' || job.status === 'archived') return 1;
  const dayHours = Number.isFinite(workDayHours) && workDayHours > 0 ? workDayHours : 8;
  const estimatedHours = Number(job.estimated_hours) || 0;
  return Math.max(1, Math.ceil(estimatedHours / dayHours));
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export type ScheduledJobOccurrence<T extends Pick<Job, 'scheduled_for' | 'status' | 'estimated_hours'>> = Omit<
  T,
  'scheduled_for'
> & {
  scheduled_for: string;
};

export function expandScheduledJobs<T extends Pick<Job, 'scheduled_for' | 'status' | 'estimated_hours'>>(
  jobs: T[],
  workDayHours: number
): ScheduledJobOccurrence<T>[] {
  const occurrences: ScheduledJobOccurrence<T>[] = [];

  for (const job of jobs) {
    if (!job.scheduled_for) continue;
    const spanDays = getJobScheduleSpanDays(job, workDayHours);
    for (let dayOffset = 0; dayOffset < spanDays; dayOffset++) {
      occurrences.push({
        ...job,
        scheduled_for: addDaysToDateKey(job.scheduled_for, dayOffset),
      } as ScheduledJobOccurrence<T>);
    }
  }

  return occurrences;
}

// -- Job ref generation ---------------------------------------------------
async function generateJobRef(supabase: SupabaseClient, accountId: string): Promise<string> {
  const { data } = await supabase
    .from('jobs')
    .select('ref')
    .eq('account_id', accountId);

  // Use the highest NUMERIC J-<n> ref across all of the account's jobs. Basing
  // it on the most-recently-created ref broke when that ref wasn't numeric
  // (e.g. a seed like "J-E2E"): parseInt -> NaN reset the counter to 1001 and
  // collided with the existing J-1001 (unique account_id+ref).
  let maxNumber = 1000;
  for (const row of data ?? []) {
    const match = /^J-(\d+)$/.exec((row as { ref?: string }).ref ?? '');
    if (match) maxNumber = Math.max(maxNumber, parseInt(match[1], 10));
  }

  return `J-${maxNumber + 1}`;
}

// -- Jobs CRUD (uses a session-scoped client so RLS enforces isolation) ---
export async function listJobs(
  supabase: SupabaseClient,
  accountId: string,
  statusFilter?: JobStatus,
  options: ListJobsOptions = {}
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

  let jobs = (data ?? []) as Job[];

  if (!options.includeLeadQuotes && jobs.length > 0) {
    const { data: quoteLeads, error: quoteLeadError } = await supabase
      .from('leads')
      .select('converted_job')
      .eq('account_id', accountId)
      .in('status', ['quoted', 'lost'])
      .in('converted_job', jobs.map((job) => job.id));

    if (quoteLeadError) {
      throw quoteLeadError;
    }

    const quoteOnlyJobIds = new Set((quoteLeads ?? []).map((lead) => lead.converted_job).filter(Boolean));
    // Only hide jobs that are still unapproved quotes (status 'new_lead' from a
    // quoted/lost lead — those live on the Leads page). Once a job is
    // in_progress, complete, or archived it's real work and must show on the
    // Jobs pipeline regardless of the originating lead's status; otherwise a
    // completed lead-job would disappear from Jobs entirely.
    jobs = jobs.filter((job) => !(quoteOnlyJobIds.has(job.id) && job.status === 'new_lead'));
  }

  return sortJobsByStatus(jobs);
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

// Normalize the raw quote_items jsonb into a clean QuoteItem[]. Defensive by
// design: the column is null on legacy jobs and could hold anything, so every
// field is coerced and bad rows are dropped rather than trusted.
export function parseQuoteItems(value: unknown): QuoteItem[] {
  if (!Array.isArray(value)) return [];
  const items: QuoteItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const record = raw as Record<string, unknown>;
    const label = typeof record.label === 'string' ? record.label.trim() : '';
    const amount = Number(record.amount);
    if (!label || !Number.isFinite(amount)) continue;
    const kind: QuoteItemKind = record.kind === 'addon' ? 'addon' : record.kind === 'subscription' ? 'subscription' : 'base';
    const frequency: QuoteSubscriptionFrequency = record.frequency === 'weekly' ? 'weekly' : record.frequency === 'biweekly' ? 'biweekly' : 'monthly';
    const termCycles = Math.max(0, Math.floor(Number(record.termCycles) || 0));
    const prepayDiscountPercent = Math.min(100, Math.max(0, Number(record.prepayDiscountPercent) || 0));
    items.push({
      id: typeof record.id === 'string' && record.id ? record.id : `qi-${items.length + 1}`,
      label,
      amount: Math.max(0, Math.round(amount * 100) / 100),
      kind,
      // Base + subscription rows are always "on"; an add-on counts only when selected.
      selected: kind === 'addon' ? record.selected === true : true,
      recommended: kind === 'addon' && record.recommended === true,
      ...(kind === 'subscription' ? { frequency, termCycles, prepayDiscountPercent, signedUp: record.signedUp === true } : {}),
    });
  }
  return items;
}

// The one-off quote total: every base item plus each selected add-on.
// Subscriptions are recurring charges, so they never count toward this total.
export function computeQuoteTotal(items: QuoteItem[]): number {
  const total = items.reduce((sum, item) => {
    if (item.kind === 'subscription') return sum;
    if (item.kind === 'base' || item.selected) return sum + item.amount;
    return sum;
  }, 0);
  return Math.round(total * 100) / 100;
}

// Persist an itemized quote and keep quoted_amount in lockstep with the computed
// total, so every downstream reader (margin panel, invoices, approval email)
// stays correct without knowing about line items. Empty items clears the
// itemized quote back to the legacy single-amount mode.
export async function saveQuoteItems(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  items: QuoteItem[],
): Promise<Job> {
  const clean = parseQuoteItems(items);
  const patch = clean.length > 0
    ? { quote_items: clean, quoted_amount: computeQuoteTotal(clean) }
    : { quote_items: null };
  const { data, error } = await supabase
    .from('jobs')
    .update(patch)
    .eq('account_id', accountId)
    .eq('id', jobId)
    .select('*')
    .single();
  if (error || !data) throw error ?? new Error('Unable to save the quote.');
  return data as Job;
}

export async function createJob(supabase: SupabaseClient, accountId: string, input: JobInput): Promise<Job> {
  // Retry on a duplicate-ref unique violation (23505): two near-simultaneous
  // creates can compute the same next ref; regenerating picks up the just-taken
  // one. Rethrow any other error immediately.
  for (let attempt = 0; attempt < 5; attempt++) {
    const ref = await generateJobRef(supabase, accountId);

    const { data, error } = await supabase
      .from('jobs')
      .insert({
        account_id: accountId,
        ref,
        client_name: input.clientName,
        client_phone: input.clientPhone ?? null,
        client_email: input.clientEmail ?? null,
        address: input.address ?? null,
        scope: input.scope ?? null,
        status: input.status ?? 'new_lead',
        scheduled_for: input.scheduledFor ?? null,
        scheduled_time: input.scheduledTime ?? null,
        estimated_hours: input.estimatedHours ?? null,
        quoted_amount: input.quotedAmount ?? 0,
        photo_paths: input.photoPaths ?? [],
      })
      .select('*')
      .single();

    if (!error && data) {
      const job = data as Job;
      // Link (or create) the unified client profile. Best-effort: a failure here
      // must never fail the job creation — the job just stays unlinked.
      try {
        const clientId = await findOrCreateClientId(supabase, accountId, {
          name: input.clientName,
          phone: input.clientPhone,
          email: input.clientEmail,
          address: input.address,
        });
        if (clientId) {
          await supabase.from('jobs').update({ client_id: clientId }).eq('id', job.id);
          job.client_id = clientId;
        }
      } catch (clientError) {
        console.error(`Client link failed for job ${job.id}:`, clientError instanceof Error ? clientError.message : clientError);
      }
      // Geocode the address for route-density anchoring. Best-effort + precise-
      // only (see geocode.ts); a failure/imprecise result leaves coords null. The
      // geocoder is dynamically imported so the server-only module never lands in
      // a client bundle that pulls a util (e.g. formatMoney) from this file.
      try {
        const { geocodeColumns } = await import('@/lib/geocode');
        const geo = await geocodeColumns(input.address);
        if (geo) {
          await supabase.from('jobs').update(geo).eq('id', job.id);
          job.lat = geo.lat;
          job.lng = geo.lng;
          job.geocoded_at = geo.geocoded_at;
        }
      } catch (geoError) {
        console.error(`Geocode failed for job ${job.id}:`, geoError instanceof Error ? geoError.message : geoError);
      }
      return job;
    }
    if (error?.code !== '23505') throw error ?? new Error('Unable to create job');
  }

  throw new Error('Unable to create job: could not allocate a unique job number. Please try again.');
}

// -- Bulk job import (CRM migration) -----------------------------------------
// Maps a spreadsheet of historical/active jobs onto the schema: links each to a
// client (match/create by phone->email), continues the J-#### ref sequence, and
// normalizes free-text status/date/amount. Deduped by a
// name+scope+date+amount signature so a re-import is safe.

export type JobImportRow = {
  clientName: string | null;
  clientPhone: string | null;
  clientEmail: string | null;
  address: string | null;
  scope: string | null;
  status: string | null;
  scheduledFor: string | null;
  estimatedHours: string | null;
  quotedAmount: string | null;
};

// Free-text status from another tool -> our enum. Unknown/blank defaults to
// 'complete' (a migration is mostly historical work).
export function mapImportedJobStatus(raw: string | null): JobStatus {
  const s = (raw ?? '').trim().toLowerCase();
  if (!s) return 'complete';
  if (/(complete|done|finish|paid|closed|won|invoiced)/.test(s)) return 'complete';
  if (/(progress|active|schedul|open|working|ongoing|current|start|book)/.test(s)) return 'in_progress';
  if (/(lead|new|estimat|quote|pending|proposal|bid|request)/.test(s)) return 'new_lead';
  if (/(archiv|cancel|lost|void|dead|declin|inactive)/.test(s)) return 'archived';
  return 'complete';
}

// Accept YYYY-MM-DD (ISO / Excel) or M/D/Y(Y) -> a YYYY-MM-DD date key, else null.
export function parseImportedDate(raw: string | null): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(s);
  if (us) {
    const mm = us[1].padStart(2, '0');
    const dd = us[2].padStart(2, '0');
    const yyyy = us[3].length === 2 ? `20${us[3]}` : us[3];
    if (Number(mm) >= 1 && Number(mm) <= 12 && Number(dd) >= 1 && Number(dd) <= 31) return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

function parseImportedHours(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(String(raw).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseImportedMoney(raw: string | null): number {
  if (!raw) return 0;
  const n = Number(String(raw).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : 0;
}

export async function importJobs(
  supabase: SupabaseClient,
  accountId: string,
  rows: JobImportRow[],
): Promise<{ imported: number; duplicates: number; skipped: number }> {
  // Existing jobs: the highest numeric ref (to continue J-#### past it) + a set
  // of dedupe signatures.
  const { data: existingJobs } = await supabase
    .from('jobs')
    .select('ref, client_name, scope, scheduled_for, quoted_amount')
    .eq('account_id', accountId);

  const sig = (name: string, scope: string, date: string | null, amount: number) =>
    `${name.trim().toLowerCase()}|${scope.trim().toLowerCase()}|${date ?? ''}|${amount}`;

  let maxRef = 1000;
  const signatures = new Set<string>();
  for (const j of existingJobs ?? []) {
    const m = /^J-(\d+)$/.exec((j as { ref?: string }).ref ?? '');
    if (m) maxRef = Math.max(maxRef, parseInt(m[1], 10));
    signatures.add(
      sig(String(j.client_name ?? ''), String(j.scope ?? ''), (j.scheduled_for as string | null) ?? null, Number(j.quoted_amount) || 0),
    );
  }

  // Resolve (and cache) the client profile per unique contact, so repeat
  // customers across the file link to one client instead of many.
  const clientCache = new Map<string, string | null>();
  async function resolveClientId(name: string, phone: string | null, email: string | null, address: string | null): Promise<string | null> {
    const np = phone ? normalizeUsPhone(phone) : null;
    const ne = email ? email.trim().toLowerCase() : null;
    const key = np ? `p:${np}` : ne ? `e:${ne}` : null;
    if (!key) return null; // nothing to key a client on -> leave the job unlinked
    const cached = clientCache.get(key);
    if (cached !== undefined) return cached;
    const id = await findOrCreateClientId(supabase, accountId, { name, phone, email, address });
    clientCache.set(key, id);
    return id;
  }

  const toInsert: Array<Record<string, unknown>> = [];
  let duplicates = 0;
  let skipped = 0;

  for (const row of rows) {
    const name = (row.clientName ?? '').trim();
    if (!name) {
      skipped += 1; // a job with no customer name can't be keyed/linked
      continue;
    }
    const scope = (row.scope ?? '').trim();
    const scheduledFor = parseImportedDate(row.scheduledFor);
    const quotedAmount = parseImportedMoney(row.quotedAmount);
    const signature = sig(name, scope, scheduledFor, quotedAmount);
    if (signatures.has(signature)) {
      duplicates += 1;
      continue;
    }
    signatures.add(signature);

    const clientId = await resolveClientId(name, row.clientPhone, row.clientEmail, row.address);
    maxRef += 1;
    toInsert.push({
      account_id: accountId,
      ref: `J-${maxRef}`,
      client_name: name,
      client_phone: row.clientPhone?.trim() || null,
      client_email: row.clientEmail?.trim() || null,
      address: row.address?.trim() || null,
      scope: scope || null,
      status: mapImportedJobStatus(row.status),
      scheduled_for: scheduledFor,
      estimated_hours: parseImportedHours(row.estimatedHours),
      quoted_amount: quotedAmount,
      client_id: clientId,
      photo_paths: [],
    });
  }

  let imported = 0;
  for (let i = 0; i < toInsert.length; i += 500) {
    const chunk = toInsert.slice(i, i + 500);
    const { data, error } = await supabase.from('jobs').insert(chunk).select('id');
    if (error) {
      console.error('Job import chunk failed:', error.message);
      skipped += chunk.length;
    } else {
      imported += (data ?? []).length;
    }
  }

  return { imported, duplicates, skipped };
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
      client_email: input.clientEmail ?? null,
      address: input.address ?? null,
      scope: input.scope ?? null,
      status: input.status ?? 'new_lead',
      scheduled_for: input.scheduledFor ?? null,
      scheduled_time: input.scheduledTime ?? null,
      estimated_hours: input.estimatedHours ?? null,
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
  scheduledFor: string | null,
  scheduledTime: string | null
): Promise<Job> {
  const { data, error } = await supabase
    .from('jobs')
    .update({ scheduled_for: scheduledFor, scheduled_time: scheduledTime })
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

export async function reorderJobPhotos(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  paths: string[]
): Promise<Job> {
  const job = await getJob(supabase, accountId, jobId);
  if (!job) throw new Error('Job not found.');

  const existing = job.photo_paths;
  const sameLength = paths.length === existing.length;
  const samePhotos = sameLength && paths.every((path) => existing.includes(path)) && new Set(paths).size === paths.length;
  if (!samePhotos) throw new Error('Photo order does not match this job.');

  const { data, error } = await supabase
    .from('jobs')
    .update({ photo_paths: paths })
    .eq('account_id', accountId)
    .eq('id', jobId)
    .select('*')
    .single();

  if (error || !data) {
    throw error ?? new Error('Unable to reorder job photos.');
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
  // Snapshot the crew member (name/role) for ANY cost type that's attributed to
  // one — labor always, and materials logged from the field app. Doing it here
  // (instead of a post-insert update on materials) means the crew_id is present
  // on the very first insert, which the crew RLS insert/read policies require.
  const crewSnapshot = input.crewId
    ? await supabase
        .from('crew')
        .select('name, role_label')
        .eq('account_id', accountId)
        .eq('id', input.crewId)
        .maybeSingle()
    : null;

  if (crewSnapshot?.error) throw crewSnapshot.error;

  const row: Record<string, unknown> =
    input.type === 'labor'
      ? {
          account_id: accountId,
          job_id: jobId,
          type: 'labor' as const,
          category,
          description: input.description,
          crew_id: input.crewId ?? null,
          crew_name: crewSnapshot?.data?.name ?? null,
          crew_role_label: crewSnapshot?.data?.role_label ?? null,
          supplier: input.supplier ?? null,
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
          crew_id: input.crewId ?? null,
          crew_name: crewSnapshot?.data?.name ?? null,
          crew_role_label: crewSnapshot?.data?.role_label ?? null,
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
