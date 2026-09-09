import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { normalizeUsPhone } from '@/lib/phone';
import type { VoiceStaffCaller } from '@/lib/voice/caller-identity';
import { voiceRequestDeadline } from '@/lib/voice/timing';
import { spokenUsd } from '@/lib/voice/spoken-money';

export const CONTRACTOR_VOICE_FUNCTIONS = new Set([
  'lookup_jobs',
  'update_job_details',
  'update_job_scope',
  'create_or_update_lead',
  'log_crew_time_and_materials',
  'create_job_change_order',
  'append_job_caution_or_note',
  'add_caution_note',
]);

type ContractorActionContext = Readonly<{
  admin: SupabaseClient;
  accountId: string;
  providerCallId: string;
  caller: VoiceStaffCaller;
  functionName: string;
  args: Record<string, unknown>;
}>;

export type ContractorActionResult = Readonly<{
  handled: boolean;
  response?: string;
}>;

export type VoiceJobCandidate = {
  id: string;
  ref: string;
  client_name: string;
  client_phone?: string | null;
  address: string | null;
  scope?: string | null;
  status?: string | null;
  scheduled_for?: string | null;
  scheduled_time?: string | null;
  quoted_amount?: number | string | null;
};

export type VoiceJobResolution =
  | { status: 'resolved'; job: VoiceJobCandidate }
  | { status: 'not_found'; job?: never }
  | { status: 'ambiguous'; candidates: VoiceJobCandidate[]; totalCount?: number; job?: never }
  | { status: 'unavailable'; job?: never };

type RpcOutcome = {
  replayed?: boolean;
  action_id?: string;
  job_id?: string;
  job_ref?: string;
  lead_id?: string;
  target_name?: string;
  title?: string;
  operation?: string;
  hours?: number;
  material_cost?: number;
  is_caution?: boolean;
  saved?: { scope_append?: string; status?: string; scheduled_date?: string; scheduled_time?: string; note?: string; is_caution?: boolean };
};

function canonicalFunction(name: string): string {
  if (name === 'update_job_scope') return 'update_job_details';
  if (name === 'add_caution_note') return 'append_job_caution_or_note';
  return name;
}

function text(value: unknown, max = 4000): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ').trim();
  return clean && clean.length <= max ? clean : null;
}

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeLookup(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(?:job|project|customer|client)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Only a complete spoken J-reference, never a fuzzy customer-name rewrite. */
function spokenJobReference(value: string | null): string | null {
  const match = value?.trim().match(/^(?:job\s+)?jay(?:\s+(?:dash|hyphen))?\s+(?:([a-z]{1,12})(?:\s+(?:dash|hyphen))?\s+)?(\d(?:[\d\s]*\d)?)\.?$/i);
  if (!match) return null;
  const digits = match[2].replace(/\s/g, '');
  if (digits.length > 12) return null;
  return ['J', match[1]?.toUpperCase(), digits].filter(Boolean).join('-');
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isClockTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function phoneCandidates(phone: string): string[] {
  const digits = phone.replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return Array.from(new Set([
    phone,
    digits,
    ten,
    `+${digits}`,
    ten.length === 10 ? `${ten.slice(0, 3)}-${ten.slice(3, 6)}-${ten.slice(6)}` : '',
    ten.length === 10 ? `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}` : '',
  ].filter(Boolean)));
}

async function loadVoiceJobs(
  admin: SupabaseClient,
  accountId: string,
  target: string | null,
  options: Readonly<{ allowedCallerPhone?: string | null; timeoutMs?: number }> = {},
): Promise<{ jobs: VoiceJobCandidate[]; totalCount: number } | null> {
  const started = performance.now();
  try {
    const { data, error } = await voiceRequestDeadline(admin.rpc('search_voice_jobs', {
      p_account_id: accountId,
      p_query: target,
      p_phone_candidates: options.allowedCallerPhone ? phoneCandidates(options.allowedCallerPhone) : null,
    }), options.timeoutMs ?? 4000);
    if (error || !data || !Array.isArray(data.jobs)
        || !Number.isSafeInteger(data.total_count) || data.total_count < data.jobs.length
        || (data.total_count > 1 && data.jobs.length < 2)) return null;
    return { jobs: data.jobs as VoiceJobCandidate[], totalCount: data.total_count };
  } catch {
    return null;
  } finally {
    console.info('voice_dispatch_lookup_timing', { accountId, durationMs: Math.round(performance.now() - started) });
  }
}

function matchVoiceJobs(jobs: VoiceJobCandidate[], target: string): VoiceJobResolution {
  if (isUuid(target)) {
    const exactId = jobs.filter((job) => job.id.toLowerCase() === target.toLowerCase());
    return exactId.length === 1
      ? { status: 'resolved', job: exactId[0] }
      : { status: 'not_found' };
  }

  const normalized = normalizeLookup(target);
  if (!normalized) return { status: 'not_found' };

  const exactRef = jobs.filter((job) => normalizeLookup(job.ref) === normalized);
  if (exactRef.length === 1) return { status: 'resolved', job: exactRef[0] };
  if (exactRef.length > 1) return { status: 'ambiguous', candidates: exactRef };

  const numericTarget = normalized.match(/^\d+$/)?.[0] ?? null;
  if (numericTarget) {
    const refSuffix = jobs.filter((job) => {
      const ref = normalizeLookup(job.ref);
      return ref === numericTarget || ref.endsWith(` ${numericTarget}`) || ref === `j ${numericTarget}`;
    });
    if (refSuffix.length === 1) return { status: 'resolved', job: refSuffix[0] };
    if (refSuffix.length > 1) return { status: 'ambiguous', candidates: refSuffix };
  }

  const exactHuman = jobs.filter((job) =>
    normalizeLookup(job.client_name) === normalized
    || (job.address ? normalizeLookup(job.address) === normalized : false),
  );
  if (exactHuman.length === 1) return { status: 'resolved', job: exactHuman[0] };
  if (exactHuman.length > 1) return { status: 'ambiguous', candidates: exactHuman };

  // Speech-to-text often adds "the" or drops a street suffix. A containment
  // match is useful only when it produces exactly one candidate; otherwise the
  // assistant must ask for the job reference instead of guessing with LIMIT 1.
  if (normalized.length >= 4) {
    const partial = jobs.filter((job) => {
      const name = normalizeLookup(job.client_name);
      const address = job.address ? normalizeLookup(job.address) : '';
      return (name && (name.includes(normalized) || normalized.includes(name)))
        || (address && (address.includes(normalized) || normalized.includes(address)));
    });
    if (partial.length === 1) return { status: 'resolved', job: partial[0] };
    if (partial.length > 1) return { status: 'ambiguous', candidates: partial };
  }

  return { status: 'not_found' };
}

export async function resolveVoiceJob(
  admin: SupabaseClient,
  accountId: string,
  rawTarget: string,
  options: Readonly<{ allowedCallerPhone?: string | null }> = {},
): Promise<VoiceJobResolution> {
  const target = rawTarget.trim();
  if (!target) return { status: 'not_found' };
  const result = await loadVoiceJobs(admin, accountId, target, options);
  if (!result) return { status: 'unavailable' };
  const match = matchVoiceJobs(result.jobs, target);
  if (match.status === 'resolved' && result.totalCount > result.jobs.length) {
    // A bounded response cannot contradict the database's ambiguity evidence.
    return { status: 'ambiguous', candidates: result.jobs, totalCount: result.totalCount };
  }
  if (match.status === 'ambiguous' && result.totalCount > result.jobs.length) {
    return { ...match, totalCount: result.totalCount };
  }
  return match;
}

function jobChoices(jobs: VoiceJobCandidate[], detailsRequested = false, totalCount = jobs.length): string {
  const choices = jobs.slice(0, 3).map((job, index) => {
    const quote = detailsRequested ? spokenUsd(job.quoted_amount) : null;
    const details = [
      `Option ${index + 1}: ${job.ref}, ${job.client_name}`,
      job.scope ? `work: ${job.scope.slice(0, detailsRequested ? 240 : 70)}` : null,
      job.address ? `address: ${job.address}` : null,
      detailsRequested && job.status ? `status: ${job.status.replace(/_/g, ' ')}` : null,
      detailsRequested ? (job.scheduled_for ? `scheduled: ${job.scheduled_for}${job.scheduled_time ? ` at ${job.scheduled_time}` : ''}` : 'not scheduled') : null,
      quote === null ? null : `recorded quote: ${quote}`,
    ];
    return details.filter(Boolean).join('; ');
  });
  return `${choices.join('. ')}.${totalCount > 3 ? ` Showing three of ${totalCount} matches; ask for a client name or address to narrow the list.` : ''}`;
}

async function resolveCrewForLabor(
  admin: SupabaseClient,
  accountId: string,
  caller: VoiceStaffCaller,
  args: Record<string, unknown>,
): Promise<{ id: string; name: string } | null | 'ambiguous' | 'unavailable'> {
  if (caller.role === 'crew' && caller.crewId) {
    return { id: caller.crewId, name: caller.name };
  }

  const requestedId = text(args.crew_id, 100);
  const requestedName = text(args.crew_name, 200);
  if (!requestedId && !requestedName) return null;

  const { data, error } = await admin
    .from('crew')
    .select('id, name')
    .eq('account_id', accountId)
    .eq('active', true)
    .is('deleted_at', null)
    .is('access_revoked_at', null);
  if (error || !Array.isArray(data)) return 'unavailable';

  const matches = (data as Array<{ id: string; name: string }>).filter((crew) =>
    requestedId
      ? crew.id.toLowerCase() === requestedId.toLowerCase()
      : normalizeLookup(crew.name) === normalizeLookup(requestedName ?? ''),
  );
  if (matches.length > 1) return 'ambiguous';
  return matches[0] ?? null;
}

async function applyAction(
  context: ContractorActionContext,
  functionName: string,
  targetJobId: string | null,
  targetLeadId: string | null,
  payload: Record<string, unknown>,
): Promise<{ outcome: RpcOutcome | null; code: string | null }> {
  const params = {
    p_account_id: context.accountId,
    p_provider_call_id: context.providerCallId,
    p_caller_number: context.caller.normalizedPhone,
    p_function_name: functionName,
    p_target_job_id: targetJobId,
    p_target_lead_id: targetLeadId,
    p_payload: payload,
  };
  const started = performance.now();
  let code = 'unknown';
  try {
    const res = await voiceRequestDeadline(context.admin.rpc('apply_voice_contractor_action', params), 6000);
    const raw = Array.isArray(res?.data) ? res.data[0] : res?.data;
    if (!res?.error && raw && typeof raw === 'object' && raw.action_id) {
      return { outcome: raw as RpcOutcome, code: null };
    }
    code = typeof res?.error?.code === 'string' ? res.error.code : 'empty_result';
    // These PostgreSQL errors confirm that the atomic transaction was rejected.
    if (['42501', '28000', 'P0002', '22023', '23514', '23503'].includes(code)) return { outcome: null, code };
  } catch {
    code = 'transport_error';
  } finally {
    console.info('voice_dispatch_write_timing', {
      accountId: context.accountId, providerCallId: context.providerCallId,
      functionName, durationMs: Math.round(performance.now() - started),
    });
  }
  // Never repeat a write here. A timeout can race with a successful commit.
  try {
    const status = await voiceRequestDeadline(context.admin.rpc('get_voice_contractor_action_status', params), 2500);
    if (!status?.error && status?.data?.action_id) return { outcome: status.data as RpcOutcome, code: null };
  } catch { /* Keep the outcome explicitly unknown. */ }
  console.warn('voice_dispatch_save_unconfirmed', { functionName, code });
  return { outcome: null, code };
}

function failedResponse(code: string | null): string {
  if (code === '42501' || code === '28000') {
    return 'Your dispatch authorization changed during this call, so I did not save anything. Please sign in or call from a verified staff number.';
  }
  if (code === 'P0002') {
    return 'That record is no longer available, so I did not change anything. Please give me its current exact reference.';
  }
  if (['22023', '23514', '23503'].includes(code ?? '')) return 'The change was rejected and was not saved. Please check the details in the dashboard.';
  return 'I could not confirm whether that change saved. Do not repeat this update on this call or claim that nothing changed. Please check the job or lead in the dashboard before trying again.';
}

function replayPrefix(outcome: RpcOutcome): string {
  return outcome.replayed ? 'That exact action was already saved. ' : '';
}

export async function handleContractorVoiceAction(
  context: ContractorActionContext,
): Promise<ContractorActionResult> {
  if (!CONTRACTOR_VOICE_FUNCTIONS.has(context.functionName)) return { handled: false };
  const fn = canonicalFunction(context.functionName);
  const args = context.args;

  if (!context.providerCallId || !context.caller.normalizedPhone) {
    return { handled: true, response: 'This call is missing its signed dispatch identity, so I did not save anything.' };
  }

  if (context.caller.role === 'crew'
      && (fn === 'lookup_jobs' || fn === 'update_job_details' || fn === 'create_or_update_lead')) {
    return {
      handled: true,
      response: fn === 'lookup_jobs'
        ? 'Browsing client jobs requires owner or office authorization, so I did not disclose job details.'
        : 'That action requires owner or office authorization, so I did not change anything.',
    };
  }

  // The legacy RPC appends a positive price rather than replacing a total, and
  // writes unit_price items that the quote editor does not recognize. Refuse
  // price mutations at the tool boundary, including callbacks from older calls.
  if (fn === 'update_job_details' && [
    'line_item_label', 'line_item_price', 'quote_total', 'quoted_amount',
    'quotedAmount', 'quote_amount', 'quote_items', 'quoteItems',
    'discount', 'discount_amount', 'discount_percent', 'total', 'price', 'amount',
  ].some((key) => args[key] !== undefined && args[key] !== null && args[key] !== '')) {
    return {
      handled: true,
      response: 'I cannot change quote prices by phone. Nothing in this request was saved. Please open this job in the dashboard and use its quote editor to change the total, add priced items, or apply a discount. Do not describe the quote as changed.',
    };
  }

  if (fn === 'lookup_jobs') {
    let query = text(args.query ?? args.job_ref_or_client ?? args.client_name, 500);
    const deadline = performance.now() + 4000;
    let found = await loadVoiceJobs(context.admin, context.accountId, query);
    const spokenReference = spokenJobReference(query);
    // Preserve a literal name/address match. A second, read-only search is allowed
    // only after a proven empty result, within the original four-second budget.
    if (found?.totalCount === 0 && spokenReference) {
      const remaining = Math.floor(deadline - performance.now());
      const fallback = remaining > 0
        ? await loadVoiceJobs(context.admin, context.accountId, spokenReference, { timeoutMs: remaining }) : null;
      if (!fallback) found = null;
      else if (fallback.jobs.length && fallback.jobs.every(job => normalizeLookup(job.ref) === normalizeLookup(spokenReference))) {
        query = spokenReference;
        found = fallback;
      }
    }
    if (!found) return { handled: true, response: 'I could not finish a reliable job lookup. Please try again or open the jobs dashboard; I did not change anything.' };
    const { jobs } = found;
    const resolution = query ? matchVoiceJobs(jobs, query) : null;
    const matches = resolution?.status === 'resolved' ? [resolution.job]
      : resolution?.status === 'ambiguous' ? resolution.candidates
      : query ? [] : jobs.filter((job) => job.status !== 'complete' && job.status !== 'archived');
    if (matches.length === 0) return {
      handled: true,
      response: query
        ? `I found no jobs matching “${query}.” Please confirm the client name or address; nothing was changed.`
        : 'I found no current jobs in this workspace. Nothing was changed.',
    };
    return {
      handled: true,
      response: `I found ${found.totalCount} ${query ? 'matching' : 'current'} job${found.totalCount === 1 ? '' : 's'}. ${jobChoices(matches, args.include_details === true && matches.length === 1, found.totalCount)} ${matches.length > 1 ? 'Read at most three short choices and ask which job they mean. Map their choice to the exact job reference shown here.' : 'Use this exact job reference for any requested update.'} This lookup did not change anything.`,
    };
  }

  if (fn === 'create_or_update_lead') {
    const operation = (text(args.operation ?? args.intent, 20) ?? '').toLowerCase();
    if (operation !== 'create' && operation !== 'update') {
      return { handled: true, response: 'Should I create a new lead or update an existing lead?' };
    }

    const name = text(args.name ?? args.customer_name, 300);
    let phoneRaw = text(args.phone ?? args.customer_phone, 80);
    if (phoneRaw && /^(?:none|no|n\/a|na|null|unknown|not provided|no phone|doesn'?t have one|unspecified)$/i.test(phoneRaw.trim())) {
      phoneRaw = null;
    }
    const phone = phoneRaw ? normalizeUsPhone(phoneRaw) : null;
    const email = text(args.email, 320)?.toLowerCase() ?? null;
    const address = text(args.address ?? args.service_address, 1000);
    const projectType = text(args.project_type ?? args.service_description, 1000);
    let message = text(args.message ?? args.notes, 4000);
    const leadId = text(args.lead_id, 100);

    if (phoneRaw && !phone) {
      const noteTag = `[Caller phone note: ${phoneRaw}]`;
      message = message ? `${message}\n${noteTag}` : noteTag;
    }
    if (email && (!email.includes('@') || email.length > 320)) {
      return { handled: true, response: 'That email address was not valid, so I did not save the lead.' };
    }
    if (operation === 'create' && (!name || (!phone && !email && !address && !projectType && !message))) {
      return { handled: true, response: 'I need the customer name and at least one contact, address, or project detail before I can create the lead.' };
    }
    if (operation === 'update' && (!leadId || !isUuid(leadId))) {
      return { handled: true, response: 'To update an existing lead safely, I need its exact lead ID. I will not guess from a name.' };
    }

    const requestedDate = text(args.requested_date, 20);
    const requestedTime = text(args.requested_time, 20);
    if ((requestedDate && !isDateKey(requestedDate)) || (requestedTime && !isClockTime(requestedTime))) {
      return { handled: true, response: 'The requested quote-visit date or time was not valid, so I did not save it.' };
    }
    if ((requestedDate && !requestedTime) || (!requestedDate && requestedTime)) {
      return { handled: true, response: 'I need both the quote-visit date and time before I can schedule it.' };
    }

    const payload: Record<string, unknown> = { operation };
    if (name !== null) payload.name = name;
    if (phone !== null) payload.phone = phone;
    if (args.email !== undefined) payload.email = email;
    if (args.address !== undefined || args.service_address !== undefined) payload.address = address;
    if (args.project_type !== undefined || args.service_description !== undefined) payload.project_type = projectType;
    if (message !== null) payload.message = message;
    if (requestedDate && requestedTime) {
      payload.quote_visit = {
        scheduledFor: requestedDate,
        scheduledTime: requestedTime,
        durationMinutes: 60,
        notes: message,
        confirmationTextSentAt: null,
      };
    }

    const result = await applyAction(context, fn, null, operation === 'update' ? leadId! : null, payload);
    if (!result.outcome) return { handled: true, response: failedResponse(result.code) };
    const verb = result.outcome.operation === 'update' ? 'updated' : 'created';
    return {
      handled: true,
      response: `${replayPrefix(result.outcome)}I ${verb} the lead for ${result.outcome.target_name || name || 'that customer'}${requestedDate ? ` and set the quote visit for ${requestedDate} at ${requestedTime}` : ''}.`,
    };
  }

  const target = text(args.job_ref_or_client ?? args.job_id ?? args.client_name, 500);
  if (!target) {
    return { handled: true, response: 'Which exact job reference or customer address should I use?' };
  }
  const resolution = await resolveVoiceJob(context.admin, context.accountId, target);
  if (resolution.status === 'unavailable') {
    return { handled: true, response: 'I could not safely look up jobs right now, so I did not change anything.' };
  }
  if (resolution.status === 'ambiguous') {
    if (context.caller.role !== 'crew') {
      return {
        handled: true,
        response: `I found ${resolution.totalCount ?? resolution.candidates.length} possible jobs for “${target}.” ${jobChoices(resolution.candidates, false, resolution.totalCount)} Read the choices to the caller and ask which job to update. They can choose by description or option number; use that option's exact job reference when retrying the requested change. Nothing was changed.`,
      };
    }
    return { handled: true, response: `I found more than one possible job for “${target}.” Please give me the exact job reference.` };
  }
  if (resolution.status === 'not_found' || resolution.status !== 'resolved') {
    return { handled: true, response: `I could not find an active job matching “${target}.” Please give me the exact job reference.` };
  }
  const job = resolution.job;

  if (fn === 'update_job_details') {
    const scope = text(args.scope ?? args.scope_append, 4000);
    const status = text(args.status, 30);
    const scheduledDate = text(args.scheduled_date, 20);
    const scheduledTime = text(args.scheduled_time, 20);

    if (status && !['new_lead', 'in_progress', 'complete'].includes(status)) {
      return { handled: true, response: 'That job status is not supported, so I did not change the job.' };
    }
    if (scheduledDate && !isDateKey(scheduledDate)) {
      return { handled: true, response: 'That schedule date was not valid, so I did not change the job.' };
    }
    if (scheduledTime && !isClockTime(scheduledTime)) {
      return { handled: true, response: 'That schedule time was not valid, so I did not change the job.' };
    }
    if (!scope && !status && !scheduledDate && !scheduledTime) {
      return { handled: true, response: 'What detail should I change on that job?' };
    }

    const payload: Record<string, unknown> = {};
    if (scope) payload.scope_append = scope;
    if (status) payload.status = status;
    if (scheduledDate) payload.scheduled_date = scheduledDate;
    if (scheduledTime) payload.scheduled_time = scheduledTime;
    const result = await applyAction(context, fn, job.id, null, payload);
    if (!result.outcome) return { handled: true, response: failedResponse(result.code) };
    const saved = result.outcome.saved;
    const changes = saved ? [
      saved.scope_append ? `added scope: ${saved.scope_append.slice(0, 160)}` : null,
      saved.status ? `status is ${saved.status.replace(/_/g, ' ')}` : null,
      saved.scheduled_date ? `scheduled for ${saved.scheduled_date}` : null,
      saved.scheduled_time ? `time is ${saved.scheduled_time.slice(0, 5)}` : null,
    ].filter(Boolean).join('; ') : '';
    return {
      handled: true,
      response: `${replayPrefix(result.outcome)}I updated ${job.client_name}'s job (${job.ref})${changes ? `: ${changes}` : ''}.`,
    };
  }

  if (fn === 'log_crew_time_and_materials') {
    const hours = numberValue(args.hours);
    const materials = text(args.materials ?? args.material_description, 1000);
    const materialCost = numberValue(args.material_cost ?? args.amount);
    if ((hours === null || hours <= 0) && (materialCost === null || materialCost <= 0)) {
      return { handled: true, response: 'Tell me a positive number of labor hours or an itemized material cost to log.' };
    }
    if (hours !== null && (hours <= 0 || hours > 24)) {
      return { handled: true, response: 'Labor hours must be greater than zero and no more than 24 for one entry.' };
    }
    if ((materials === null) !== (materialCost === null)
        || (materialCost !== null && (materialCost <= 0 || materialCost > 1_000_000))) {
      return { handled: true, response: 'Materials need both a description and a positive dollar cost.' };
    }

    let crew: { id: string; name: string } | null = null;
    if (hours !== null && hours > 0) {
      const resolved = await resolveCrewForLabor(context.admin, context.accountId, context.caller, args);
      if (resolved === 'unavailable') {
        return { handled: true, response: 'I could not safely verify the crew member, so I did not log the labor.' };
      }
      if (resolved === 'ambiguous') {
        return { handled: true, response: 'More than one crew member matched that name. Please give me the exact crew member.' };
      }
      if (!resolved) {
        return { handled: true, response: 'Which crew member worked those hours?' };
      }
      crew = resolved;
    }

    const payload: Record<string, unknown> = {};
    if (hours !== null && hours > 0 && crew) {
      payload.hours = hours;
      payload.crew_id = crew.id;
      payload.crew_name = crew.name;
    }
    if (materialCost !== null && materials) {
      payload.material_cost = Math.round(materialCost * 100) / 100;
      payload.materials = materials;
    }
    const result = await applyAction(context, fn, job.id, null, payload);
    if (!result.outcome) return { handled: true, response: failedResponse(result.code) };
    const parts = [
      hours && hours > 0 ? `${hours} labor hour${hours === 1 ? '' : 's'}` : null,
      materialCost && materialCost > 0 ? `$${materialCost.toFixed(2)} in materials` : null,
    ].filter(Boolean);
    return {
      handled: true,
      response: `${replayPrefix(result.outcome)}I logged ${parts.join(' and ')} on ${job.client_name}'s job (${job.ref}).`,
    };
  }

  if (fn === 'create_job_change_order') {
    const title = text(args.title, 200);
    const description = text(args.description ?? args.note, 8000);
    if (!title || !description) {
      return { handled: true, response: 'I need both a short title and the full extra-work description before I can create a draft change order.' };
    }
    const payload: Record<string, unknown> = { title, description };
    if (context.caller.crewId) payload.crew_id = context.caller.crewId;
    payload.crew_name = context.caller.name;
    const result = await applyAction(context, fn, job.id, null, payload);
    if (!result.outcome) return { handled: true, response: failedResponse(result.code) };
    return {
      handled: true,
      response: `${replayPrefix(result.outcome)}I created the draft change order “${title}” on ${job.client_name}'s job (${job.ref}) for office review.`,
    };
  }

  const note = text(args.note ?? args.caution ?? args.message, 4000);
  if (!note) return { handled: true, response: 'What note or caution should I record?' };
  const lowerNote = note.toLowerCase();
  const isCaution = args.is_caution === true
    || ['caution', 'warning', 'danger', 'dog', 'gate', 'hazard'].some((word) => lowerNote.includes(word));
  const result = await applyAction(context, fn, job.id, null, { note, is_caution: isCaution });
  if (!result.outcome) return { handled: true, response: failedResponse(result.code) };
  const savedNote = text(result.outcome.saved?.note, 4000);
  const savedCaution = result.outcome.saved?.is_caution ?? result.outcome.is_caution ?? isCaution;
  return {
    handled: true,
    response: `${replayPrefix(result.outcome)}I added that ${savedCaution ? 'caution' : 'note'} to ${job.client_name}'s job (${job.ref}).${savedNote ? ` Saved text: “${savedNote.slice(0, 240)}${savedNote.length > 240 ? '…' : ''}”` : ''}`,
  };
}
