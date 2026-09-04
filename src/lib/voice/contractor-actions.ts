import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { normalizeUsPhone } from '@/lib/phone';
import type { VoiceStaffCaller } from '@/lib/voice/caller-identity';

export const CONTRACTOR_VOICE_FUNCTIONS = new Set([
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
  stepUpVerified: boolean;
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
};

export type VoiceJobResolution =
  | { status: 'resolved'; job: VoiceJobCandidate }
  | { status: 'not_found'; job?: never }
  | { status: 'ambiguous'; job?: never }
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
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(?:job|project|customer|client)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

export async function resolveVoiceJob(
  admin: SupabaseClient,
  accountId: string,
  rawTarget: string,
  options: Readonly<{ allowedCallerPhone?: string | null }> = {},
): Promise<VoiceJobResolution> {
  const target = rawTarget.trim();
  if (!target) return { status: 'not_found' };

  let query = admin
    .from('jobs')
    .select('id, ref, client_name, client_phone, address')
    .eq('account_id', accountId)
    .is('deleted_at', null);
  if (options.allowedCallerPhone) {
    query = query.in('client_phone', phoneCandidates(options.allowedCallerPhone));
  }
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(201);

  if (error || !Array.isArray(data)) return { status: 'unavailable' };
  const jobs = data as VoiceJobCandidate[];

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
  if (exactRef.length > 1) return { status: 'ambiguous' };

  const numericTarget = normalized.match(/^\d+$/)?.[0] ?? null;
  if (numericTarget) {
    const refSuffix = jobs.filter((job) => {
      const ref = normalizeLookup(job.ref);
      return ref === numericTarget || ref.endsWith(` ${numericTarget}`) || ref === `j ${numericTarget}`;
    });
    if (refSuffix.length === 1) return { status: 'resolved', job: refSuffix[0] };
    if (refSuffix.length > 1) return { status: 'ambiguous' };
  }

  const exactHuman = jobs.filter((job) =>
    normalizeLookup(job.client_name) === normalized
    || (job.address ? normalizeLookup(job.address) === normalized : false),
  );
  if (exactHuman.length === 1) return { status: 'resolved', job: exactHuman[0] };
  if (exactHuman.length > 1) return { status: 'ambiguous' };

  // Speech-to-text often adds "the" or drops a street suffix. A containment
  // match is useful only when it produces exactly one candidate; otherwise the
  // assistant must ask for the job reference instead of guessing with LIMIT 1.
  if (normalized.length >= 4) {
    const partial = jobs.filter((job) => {
      const name = normalizeLookup(job.client_name);
      const address = job.address ? normalizeLookup(job.address) : '';
      return name.includes(normalized) || normalized.includes(name)
        || (address && (address.includes(normalized) || normalized.includes(address)));
    });
    if (partial.length === 1 && jobs.length < 201) return { status: 'resolved', job: partial[0] };
    if (partial.length > 0 || jobs.length >= 201) return { status: 'ambiguous' };
  }

  return { status: 'not_found' };
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
  const res = await context.admin.rpc('apply_voice_contractor_action', {
    p_account_id: context.accountId,
    p_provider_call_id: context.providerCallId,
    p_caller_number: context.caller.normalizedPhone,
    p_function_name: functionName,
    p_target_job_id: targetJobId,
    p_target_lead_id: targetLeadId,
    p_payload: payload,
  });

  const data = res?.data;
  const error = res?.error;

  if (error) {
    const code = typeof error.code === 'string' ? error.code : 'unknown';
    console.error('AI Voice contractor action failed:', { functionName, code });
    return { outcome: null, code };
  }
  const raw = Array.isArray(data) ? data[0] : data;
  return {
    outcome: raw && typeof raw === 'object' ? raw as RpcOutcome : null,
    code: raw && typeof raw === 'object' ? null : 'empty_result',
  };
}

function failedResponse(code: string | null): string {
  if (code === '42501' || code === '28000') {
    return 'Your dispatch authorization changed during this call, so I did not save anything. Please sign in or call from a verified staff number.';
  }
  if (code === 'P0002') {
    return 'That record is no longer available, so I did not change anything. Please give me its current exact reference.';
  }
  return 'I could not safely save that change, and nothing was confirmed. Please try again.';
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

  const rawOp = (text(args.operation ?? args.intent, 20) ?? '').toLowerCase();
  const isLeadCreate = fn === 'create_or_update_lead' && (rawOp === 'create' || rawOp === '');

  if (!isLeadCreate && context.stepUpVerified !== true) {
    return {
      handled: true,
      response: 'Before I can save that dispatch change, I need to text a six-digit verification code to the verified phone calling now.',
    };
  }

  if (!context.providerCallId || !context.caller.normalizedPhone) {
    return { handled: true, response: 'This call is missing its signed dispatch identity, so I did not save anything.' };
  }

  if (context.caller.role === 'crew'
      && (fn === 'update_job_details' || fn === 'create_or_update_lead')) {
    return {
      handled: true,
      response: 'That action requires owner or office authorization, so I did not change anything.',
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
    const lineItemLabel = text(args.line_item_label, 300);
    const lineItemPrice = numberValue(args.line_item_price);

    if (status && !['new_lead', 'in_progress', 'complete'].includes(status)) {
      return { handled: true, response: 'That job status is not supported, so I did not change the job.' };
    }
    if (scheduledDate && !isDateKey(scheduledDate)) {
      return { handled: true, response: 'That schedule date was not valid, so I did not change the job.' };
    }
    if (scheduledTime && !isClockTime(scheduledTime)) {
      return { handled: true, response: 'That schedule time was not valid, so I did not change the job.' };
    }
    if ((lineItemLabel === null) !== (lineItemPrice === null)
        || (lineItemPrice !== null && (lineItemPrice <= 0 || lineItemPrice > 1_000_000))) {
      return { handled: true, response: 'A quote item needs both a label and a positive dollar amount, so I did not change the quote.' };
    }
    if (!scope && !status && !scheduledDate && !scheduledTime && !lineItemLabel) {
      return { handled: true, response: 'What detail should I change on that job?' };
    }

    const payload: Record<string, unknown> = {};
    if (scope) payload.scope_append = scope;
    if (status) payload.status = status;
    if (scheduledDate) payload.scheduled_date = scheduledDate;
    if (scheduledTime) payload.scheduled_time = scheduledTime;
    if (lineItemLabel && lineItemPrice !== null) {
      payload.line_item_label = lineItemLabel;
      payload.line_item_price = Math.round(lineItemPrice * 100) / 100;
    }
    const result = await applyAction(context, fn, job.id, null, payload);
    if (!result.outcome) return { handled: true, response: failedResponse(result.code) };
    return {
      handled: true,
      response: `${replayPrefix(result.outcome)}I updated ${job.client_name}'s job (${job.ref}).`,
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
  return {
    handled: true,
    response: `${replayPrefix(result.outcome)}I added that ${isCaution ? 'caution' : 'note'} to ${job.client_name}'s job (${job.ref}).`,
  };
}
