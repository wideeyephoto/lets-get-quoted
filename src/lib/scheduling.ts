import { createHash, randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import { listCrew, listCrewIdsForJob } from '@/lib/crew';
import { formatJobSchedule } from '@/lib/jobs';
import { recordSmsConsent, sendCrewScheduleSelectedSms, sendSchedulingOptionsSms } from '@/lib/sms';
import { createJobFeedEvent } from '@/lib/job-feed';

export type ScheduleOption = {
  date: string;
  time: string | null;
};

export type JobScheduleRequest = {
  id: string;
  account_id: string;
  job_id: string;
  token_hash: string;
  client_phone: string | null;
  options: ScheduleOption[];
  status: 'open' | 'selected' | 'needs_more_options' | 'revoked';
  selected_index: number | null;
  selected_date: string | null;
  selected_time: string | null;
  client_notes: string | null;
  sent_at: string | null;
  responded_at: string | null;
  expires_at: string | null;
  created_at: string;
};

export type PublicScheduleRequest = JobScheduleRequest & {
  businessName: string;
  job: {
    id: string;
    ref: string;
    client_name: string;
    address: string | null;
  };
};

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function createAccessToken(): string {
  return randomBytes(32).toString('base64url');
}

function normalizeOptions(options: ScheduleOption[]): ScheduleOption[] {
  return options
    .map((option) => ({ date: option.date.trim(), time: option.time?.trim() || null }))
    .filter((option) => option.date)
    .slice(0, 3);
}

export function formatScheduleOption(option: ScheduleOption): string {
  return formatJobSchedule(option.date, option.time);
}

export async function createScheduleRequest(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  input: { clientPhone: string; options: ScheduleOption[] }
): Promise<{ request: JobScheduleRequest; token: string }> {
  const options = normalizeOptions(input.options);
  if (options.length !== 3) throw new Error('Add exactly 3 scheduling options before texting the client.');

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('id, account_id, ref, client_name, client_phone')
    .eq('account_id', accountId)
    .eq('id', jobId)
    .maybeSingle();
  if (jobError || !job) throw jobError ?? new Error('Job not found for this account.');

  const token = createAccessToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const { error: revokeError } = await supabase
    .from('job_schedule_requests')
    .update({ status: 'revoked' })
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .eq('status', 'open');
  if (revokeError) throw revokeError;

  const { data, error } = await supabase
    .from('job_schedule_requests')
    .insert({
      account_id: accountId,
      job_id: jobId,
      token_hash: hashToken(token),
      client_phone: input.clientPhone,
      options,
      status: 'open',
      sent_at: now.toISOString(),
      expires_at: expiresAt,
    })
    .select('*')
    .single();
  if (error || !data) throw error ?? new Error('Unable to create scheduling request.');

  return { request: data as JobScheduleRequest, token };
}

export async function createAndSendScheduleRequest(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  input: { clientPhone: string; options: ScheduleOption[] }
): Promise<JobScheduleRequest> {
  const { request, token } = await createScheduleRequest(supabase, accountId, jobId, input);

  const [{ data: account }, { data: site }, { data: job }] = await Promise.all([
    supabase.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
    supabase.from('sites').select('company_name').eq('account_id', accountId).maybeSingle(),
    supabase.from('jobs').select('ref, client_name, client_phone').eq('account_id', accountId).eq('id', jobId).maybeSingle(),
  ]);

  await recordSmsConsent(accountId, input.clientPhone, 'schedule_request');
  await sendSchedulingOptionsSms({
    phone: input.clientPhone,
    businessName: site?.company_name || account?.business_name || "Let's Get Quoted contractor",
    jobRef: job?.ref ?? 'job',
    clientName: job?.client_name ?? 'client',
    token,
  });

  return request;
}

export async function getPublicScheduleRequest(token: string): Promise<PublicScheduleRequest | null> {
  const admin = createAdminClient();
  const tokenHash = hashToken(token);
  const now = new Date().toISOString();

  const { data: request, error } = await admin
    .from('job_schedule_requests')
    .select('*')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (error || !request) return null;

  const scheduleRequest = request as JobScheduleRequest;
  if (scheduleRequest.status === 'revoked' || (scheduleRequest.expires_at && scheduleRequest.expires_at < now)) return null;

  const [{ data: account }, { data: site }, { data: job }] = await Promise.all([
    admin.from('accounts').select('business_name').eq('id', scheduleRequest.account_id).maybeSingle(),
    admin.from('sites').select('company_name').eq('account_id', scheduleRequest.account_id).maybeSingle(),
    admin
      .from('jobs')
      .select('id, ref, client_name, address')
      .eq('account_id', scheduleRequest.account_id)
      .eq('id', scheduleRequest.job_id)
      .maybeSingle(),
  ]);

  if (!job) return null;

  return {
    ...scheduleRequest,
    businessName: site?.company_name || account?.business_name || "Let's Get Quoted contractor",
    job,
  } as PublicScheduleRequest;
}

export async function selectScheduleOption(token: string, optionIndex: number, notes: string | null): Promise<PublicScheduleRequest> {
  const request = await getPublicScheduleRequest(token);
  if (!request) throw new Error('This scheduling link is no longer available.');
  if (request.status !== 'open') return request;

  const option = request.options[optionIndex];
  if (!option) throw new Error('Choose a valid scheduling option.');

  const admin = createAdminClient();
  const respondedAt = new Date().toISOString();

  const { error: requestError } = await admin
    .from('job_schedule_requests')
    .update({
      status: 'selected',
      selected_index: optionIndex,
      selected_date: option.date,
      selected_time: option.time,
      client_notes: notes,
      responded_at: respondedAt,
    })
    .eq('id', request.id);
  if (requestError) throw requestError;

  const { error: jobError } = await admin
    .from('jobs')
    .update({ scheduled_for: option.date, scheduled_time: option.time, status: 'in_progress' })
    .eq('account_id', request.account_id)
    .eq('id', request.job_id);
  if (jobError) throw jobError;

  await createJobFeedEvent(admin, request.account_id, request.job_id, {
    kind: 'job_scheduled',
    title: 'Client selected a service date',
    body: `${request.job.client_name} selected ${formatScheduleOption(option)}.${notes ? ` Notes: ${notes}` : ''}`,
    visibility: 'client',
    meta: { selected_date: option.date, selected_time: option.time, client_notes: notes },
  });

  try {
    const [assignedCrewIds, crewMembers] = await Promise.all([
      listCrewIdsForJob(admin, request.account_id, request.job_id),
      listCrew(admin, request.account_id, { activeOnly: true }),
    ]);
    const assignedCrewIdSet = new Set(assignedCrewIds);
    const assignedCrew = crewMembers.filter((member) => assignedCrewIdSet.has(member.id));

    for (const member of assignedCrew) {
      try {
        await sendCrewScheduleSelectedSms({
          phone: member.phone,
          crewName: member.name,
          businessName: request.businessName,
          jobRef: request.job.ref,
          clientName: request.job.client_name,
          address: request.job.address,
          scheduledFor: option.date,
          scheduledTime: option.time,
        });
      } catch (error) {
        console.error(`Crew schedule SMS failed for crew ${member.id} on job ${request.job_id}:`, error);
      }
    }
  } catch (error) {
    console.error(`Unable to notify crew for schedule request ${request.id}:`, error);
  }

  return { ...request, status: 'selected', selected_index: optionIndex, selected_date: option.date, selected_time: option.time, client_notes: notes, responded_at: respondedAt };
}

export async function requestDifferentScheduleOptions(token: string, notes: string | null): Promise<PublicScheduleRequest> {
  const request = await getPublicScheduleRequest(token);
  if (!request) throw new Error('This scheduling link is no longer available.');
  if (request.status !== 'open') return request;

  const admin = createAdminClient();
  const respondedAt = new Date().toISOString();

  const { error } = await admin
    .from('job_schedule_requests')
    .update({ status: 'needs_more_options', client_notes: notes, responded_at: respondedAt })
    .eq('id', request.id);
  if (error) throw error;

  await createJobFeedEvent(admin, request.account_id, request.job_id, {
    kind: 'job_scheduled',
    title: 'Client requested different schedule options',
    body: notes || 'The client asked for different dates or times.',
    visibility: 'client',
    meta: { client_notes: notes, needs_more_options: true },
  });

  return { ...request, status: 'needs_more_options', client_notes: notes, responded_at: respondedAt };
}
