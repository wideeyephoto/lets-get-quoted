import 'server-only';

import {
  FunctionCallingConfigMode,
  GoogleGenAI,
  Type,
  type FunctionDeclaration,
  type Part,
} from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { APP_ORIGIN } from '@/lib/app-origin';
import {
  formatFieldAmbiguityClarification,
  formatFieldCostConfirmation,
  formatFieldLeadConfirmation,
  formatFieldNoteConfirmation,
  formatFieldReceiptConfirmation,
  formatFieldTaskConfirmation,
  sanitizeGsm7Text,
} from '@/lib/sms-field-templates';
import type { SmsInboundActionClaim } from '@/lib/sms-inbound-action-worker';
import { normalizeUsPhone } from '@/lib/phone';
import {
  beginSmsFieldIntakeUsage,
  commitSmsFieldIntakeUsage,
} from '@/lib/sms-field-intake-usage';
import {
  buildAuthenticatedSmsMediaRequest,
  type SmsProviderId,
} from '@/lib/sms-provider';

export interface OwnerFieldActionResult {
  handled: boolean;
  outcome: 'completed' | 'ambiguity' | 'no_action' | 'error';
  intent?: string;
  targetId?: string | null;
  confirmationText?: string;
  errorMessage?: string;
}

export type FieldIntakeActionResult = OwnerFieldActionResult;

function snakeCaseFieldKey(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function normalizeFieldValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeFieldValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      snakeCaseFieldKey(key),
      normalizeFieldValue(nested),
    ]),
  );
}

/**
 * Gemini tool declarations use ergonomic camelCase names, while the atomic
 * Postgres field-action contract consumes snake_case JSON keys. Keep that
 * translation at the worker/RPC boundary so every current and future tool is
 * covered consistently.
 */
export function normalizeFieldActionParams(
  args: Record<string, unknown>,
): Record<string, unknown> {
  return normalizeFieldValue(args) as Record<string, unknown>;
}

const FIELD_COST_TYPES = new Set(['material', 'labor', 'sub', 'receipt', 'other']);

export function fieldCostValidationError(
  params: Record<string, unknown>,
): string | null {
  const amount = params.amount;
  if (
    typeof amount !== 'number'
    || !Number.isFinite(amount)
    || amount <= 0
    || amount > 1_000_000
  ) {
    return 'Field intake cost amount must be a positive number no greater than 1000000';
  }
  const costType = typeof params.cost_type === 'string'
    ? params.cost_type.trim()
    : 'material';
  if (!FIELD_COST_TYPES.has(costType)) return 'Field intake cost type is invalid';
  params.cost_type = costType;
  return null;
}

type AssistantFunctionDeclaration = Omit<FunctionDeclaration, 'parameters'> & {
  parameters: NonNullable<FunctionDeclaration['parameters']>;
};

// Common tool declarations accessible to both Crew and Owner
const COMMON_FIELD_TOOLS: AssistantFunctionDeclaration[] = [
  {
    name: 'append_internal_note',
    description: 'Logs an internal note, progress update, gate code, or site observation to the job timeline (kept strictly private from customer-facing scope).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        jobId: {
          type: Type.STRING,
          description: 'The exact ID of the target job.',
        },
        note: {
          type: Type.STRING,
          description: 'The internal note or observation from the field.',
        },
      },
      required: ['jobId', 'note'],
    },
  },
  {
    name: 'log_cost',
    description: 'Logs a job cost (material expense, dump fee, receipt, supply purchase) against a specific job for accurate margin tracking.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        jobId: {
          type: Type.STRING,
          description: 'The exact ID of the target job.',
        },
        amount: {
          type: Type.NUMBER,
          description: 'Dollar amount of the cost (e.g. 75 for $75.00 or extracted receipt total).',
        },
        label: {
          type: Type.STRING,
          description: 'Description of the expense (e.g. "3 bags of cement", "Dump fee", "Home Depot: 2x4s and screws").',
        },
        costType: {
          type: Type.STRING,
          description: 'Cost category: "material", "labor", "sub", "receipt", or "other".',
        },
        vendor: {
          type: Type.STRING,
          description: 'Store or vendor name if extracted from receipt photo (e.g. "Home Depot", "Lowe\'s", "Ferguson").',
        },
        itemsSummary: {
          type: Type.STRING,
          description: 'Concise summary of items purchased from receipt photo (e.g. "2x4s and deck screws").',
        },
      },
      required: ['jobId', 'amount', 'label'],
    },
  },
  {
    name: 'add_job_task',
    description: 'Adds a punch list / checklist task or to-do item for the job.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        jobId: {
          type: Type.STRING,
          description: 'The exact ID of the target job.',
        },
        title: {
          type: Type.STRING,
          description: 'Checklist task description (e.g. "Pick up 4 bags of mortar", "Check permit on site").',
        },
      },
      required: ['jobId', 'title'],
    },
  },
  {
    name: 'report_ambiguity',
    description: 'Call when multiple records could match the reference, asking the sender to clarify.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        candidateJobIds: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'List of matching job IDs that are ambiguous.',
        },
      },
      required: ['candidateJobIds'],
    },
  },
  {
    name: 'no_action',
    description: 'Call when the text message is not a job/lead/client/crew command (e.g. casual conversational chatter).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        reason: {
          type: Type.STRING,
          description: 'Brief reason why no action was taken.',
        },
      },
      required: ['reason'],
    },
  },
];

// Owner-only administrative tools
const OWNER_ONLY_TOOLS: AssistantFunctionDeclaration[] = [
  {
    name: 'create_lead',
    description: 'Captures a new prospect or client inquiry in the leads pipeline. Also use this when the owner says to create a new job or estimate for a person who has no existing job: stage the request as a lead for review; do not claim that a job or quote was created.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        clientName: {
          type: Type.STRING,
          description: 'Client or prospect name.',
        },
        clientPhone: {
          type: Type.STRING,
          description: 'Client phone number if provided.',
        },
        address: {
          type: Type.STRING,
          description: 'Site address if mentioned.',
        },
        notes: {
          type: Type.STRING,
          description: 'Required complete intake summary. Preserve every dictated detail, especially work scope, address/location, and any dollar estimate or quoted amount, even when also present in another field.',
        },
      },
      required: ['clientName', 'notes'],
    },
  },
];

export const CREW_FIELD_TOOLS_DECLARATION: AssistantFunctionDeclaration[] = COMMON_FIELD_TOOLS;

export const OWNER_FIELD_TOOLS_DECLARATION: AssistantFunctionDeclaration[] = [
  ...COMMON_FIELD_TOOLS.filter((t) => t.name !== 'report_ambiguity' && t.name !== 'no_action'),
  ...OWNER_ONLY_TOOLS,
  COMMON_FIELD_TOOLS.find((t) => t.name === 'report_ambiguity')!,
  COMMON_FIELD_TOOLS.find((t) => t.name === 'no_action')!,
];

interface JobSummaryContext {
  id: string;
  ref: string;
  clientName: string;
  clientPhone: string | null;
  address: string | null;
  scope: string | null;
  status: string;
  quotedAmount: number;
  scheduledFor: string | null;
  scheduledTime: string | null;
}

interface ClientSummaryContext {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
}

interface CrewSummaryContext {
  id: string;
  name: string;
  phone: string | null;
  roleLabel: string | null;
}

const MAX_FIELD_MEDIA_ATTACHMENTS = 10;
const MAX_FIELD_MEDIA_RAW_BYTES = 15 * 1024 * 1024;
const FIELD_MEDIA_DOWNLOAD_CONCURRENCY = 2;
const FIELD_MEDIA_TIMEOUT_MS = 10_000;

interface FieldMediaByteBudget {
  remainingBytes: number;
}

async function cancelBody(body: ReadableStream<Uint8Array> | null): Promise<void> {
  try {
    await body?.cancel();
  } catch {
    // Cancellation is best-effort after rejecting an unneeded response body.
  }
}

async function readMediaBodyWithinBudget(
  response: Response,
  budget: FieldMediaByteBudget,
): Promise<Buffer | null> {
  const rawContentLength = response.headers.get('content-length');
  if (rawContentLength && /^\d+$/.test(rawContentLength)) {
    const contentLength = Number(rawContentLength);
    if (!Number.isSafeInteger(contentLength) || contentLength > budget.remainingBytes) {
      await cancelBody(response.body);
      return null;
    }
  }

  const reader = response.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value?.byteLength) continue;
    if (value.byteLength > budget.remainingBytes) {
      try {
        await reader.cancel();
      } catch {
        // The byte cap has already failed closed; cancellation is best-effort.
      }
      return null;
    }
    budget.remainingBytes -= value.byteLength;
    totalBytes += value.byteLength;
    chunks.push(value);
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), totalBytes);
}

async function fetchAuthenticatedMediaPart(
  url: string,
  provider: SmsProviderId,
  budget: FieldMediaByteBudget,
): Promise<{ mimeType: string; data: string; kind: 'audio' | 'image' } | null> {
  try {
    const request = buildAuthenticatedSmsMediaRequest(url, provider);
    if (!request || budget.remainingBytes <= 0) return null;

    const res = await fetch(request.url, {
      headers: request.headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(FIELD_MEDIA_TIMEOUT_MS),
    });
    if (!res.ok) {
      await cancelBody(res.body);
      return null;
    }

    let contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();

    // Fallback detection from extension if content-type header is generic or missing
    if (!contentType || contentType === 'application/octet-stream') {
      if (url.match(/\.(jpg|jpeg)(\?.*)?$/i)) contentType = 'image/jpeg';
      else if (url.match(/\.png(\?.*)?$/i)) contentType = 'image/png';
      else if (url.match(/\.webp(\?.*)?$/i)) contentType = 'image/webp';
      else if (url.match(/\.heic(\?.*)?$/i)) contentType = 'image/heic';
      else if (url.match(/\.(mp3|m4a|wav|aac|ogg|amr|webm)(\?.*)?$/i)) contentType = 'audio/mp4';
    }

    const isImage = contentType.startsWith('image/');
    const isAudio = contentType.startsWith('audio/');
    if (!isImage && !isAudio) {
      await cancelBody(res.body);
      return null;
    }

    const buffer = await readMediaBodyWithinBudget(res, budget);
    if (!buffer) return null;

    return {
      mimeType: contentType,
      data: buffer.toString('base64'),
      kind: isImage ? 'image' : 'audio',
    };
  } catch (err) {
    console.error('Failed to fetch authenticated media part:', err);
    return null;
  }
}

async function fetchAuthenticatedMediaParts(
  urls: string[],
  provider: SmsProviderId,
): Promise<Array<{ mimeType: string; data: string; kind: 'audio' | 'image' } | null>> {
  const limitedUrls = urls.slice(0, MAX_FIELD_MEDIA_ATTACHMENTS);
  const results = new Array<Awaited<ReturnType<typeof fetchAuthenticatedMediaPart>>>(
    limitedUrls.length,
  ).fill(null);
  const budget: FieldMediaByteBudget = { remainingBytes: MAX_FIELD_MEDIA_RAW_BYTES };
  let nextIndex = 0;

  async function downloadNext(): Promise<void> {
    while (budget.remainingBytes > 0) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= limitedUrls.length) return;
      results[index] = await fetchAuthenticatedMediaPart(
        limitedUrls[index]!,
        provider,
        budget,
      );
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(FIELD_MEDIA_DOWNLOAD_CONCURRENCY, limitedUrls.length) },
      () => downloadNext(),
    ),
  );
  return results;
}

/**
 * Asynchronously processes an inbound field intake task (Owner or Crew) claimed from the queue.
 */
export async function processOwnerFieldClaim(
  claim: SmsInboundActionClaim,
  admin: SupabaseClient,
): Promise<OwnerFieldActionResult> {
  if (claim.senderPurpose !== 'lgq_shared') {
    return {
      handled: false,
      outcome: 'error',
      errorMessage: 'Owner field intake requires the LGQ shared sender',
    };
  }

  try {
    const { data: leaseExtended, error: leaseError } = await admin.rpc(
      'extend_sms_inbound_action_field_lease',
      {
        p_task_id: claim.taskId,
        p_claim_token: claim.claimToken,
      },
    );

    if (leaseError || leaseExtended !== true) {
      return {
        handled: false,
        outcome: 'error',
        errorMessage: leaseError?.message
          ? `Unable to extend field intake lease: ${leaseError.message}`
          : 'Field intake lease is no longer active',
      };
    }
  } catch (err) {
    return {
      handled: false,
      outcome: 'error',
      errorMessage: `Unable to extend field intake lease: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // The receipt stores routing/provenance only. The durable action task owns
  // the exact sms_messages FK that carries the inbound body and attachments.
  const { data: task, error: taskError } = await admin
    .from('sms_inbound_action_tasks')
    .select('webhook_receipt_id, sms_message_id, account_id, sender_number_id')
    .eq('id', claim.taskId)
    .eq('account_id', claim.accountId)
    .eq('sender_number_id', claim.senderNumberId)
    .maybeSingle();

  if (taskError || !task?.webhook_receipt_id || !task.sms_message_id) {
    return {
      handled: false,
      outcome: 'error',
      errorMessage: taskError?.message || 'Inbound action task has no linked SMS message',
    };
  }

  const { data: receipt, error: receiptError } = await admin
    .from('sms_webhook_receipts')
    .select('id, to_number')
    .eq('id', task.webhook_receipt_id)
    .eq('provider', claim.provider)
    .eq('webhook_kind', 'inbound')
    .eq('provider_event_id', claim.providerEventId)
    .eq('processing_state', 'processed')
    .eq('disposition', 'routed')
    .eq('account_id', claim.accountId)
    .eq('sender_number_id', claim.senderNumberId)
    .eq('sms_message_id', task.sms_message_id)
    .eq('from_number', claim.fromNumber)
    .maybeSingle();

  if (receiptError || !receipt?.to_number) {
    return {
      handled: false,
      outcome: 'error',
      errorMessage: receiptError?.message || 'Inbound action receipt binding is invalid',
    };
  }

  const { data: message, error: messageError } = await admin
    .from('sms_messages')
    .select('id, body, media_urls, account_id, sender_number_id, provider, provider_id, phone_number, direction')
    .eq('id', task.sms_message_id)
    .eq('account_id', claim.accountId)
    .eq('sender_number_id', claim.senderNumberId)
    .eq('provider', claim.provider)
    .eq('provider_id', claim.providerEventId)
    .eq('phone_number', claim.fromNumber)
    .eq('direction', 'inbound')
    .maybeSingle();

  if (messageError || !message) {
    return {
      handled: false,
      outcome: 'error',
      errorMessage: messageError?.message || 'Linked inbound SMS message was not found',
    };
  }

  const accountId = claim.accountId;
  const rawBody = typeof message.body === 'string' ? message.body.trim() : '';
  const mediaUrls = Array.isArray(message.media_urls) ? (message.media_urls as string[]) : [];

  // Establish immutable sender/receipt provenance before any account-wide
  // context read. The atomic RPC repeats these checks under locks immediately
  // before either an owner mutation or the crew unsupported-action response.
  const senderNormalized = normalizeUsPhone(claim.fromNumber);
  if (!senderNormalized) {
    return {
      handled: false,
      outcome: 'error',
      errorMessage: 'Field intake sender is not the currently authorized account owner',
    };
  }

  const { data: sender, error: senderError } = await admin
    .from('sms_sender_numbers')
    .select('id')
    .eq('id', claim.senderNumberId)
    .eq('provider', claim.provider)
    .eq('e164_number', receipt.to_number)
    .eq('purpose', 'lgq_shared')
    .eq('provisioning_status', 'active')
    .eq('assignment_state', 'assigned')
    .eq('inbound_ready', true)
    .is('account_id', null)
    .is('suspended_at', null)
    .maybeSingle();

  if (senderError || !sender) {
    return {
      handled: false,
      outcome: 'error',
      errorMessage: senderError?.message || 'LGQ shared sender is no longer active',
    };
  }

  const { data: stoppedSenderRows, error: senderPreferenceError } = await admin
    .from('sms_sender_keyword_preferences')
    .select('sender_number_id')
    .eq('sender_number_id', claim.senderNumberId)
    .eq('phone_number', senderNormalized)
    .eq('status', 'opted_out')
    .limit(1);

  if (senderPreferenceError || (stoppedSenderRows?.length ?? 0) > 0) {
    return {
      handled: false,
      outcome: 'error',
      errorMessage: senderPreferenceError?.message || 'Field intake sender has opted out',
    };
  }

  const { data: account, error: accountError } = await admin
    .from('accounts')
    .select('id, business_name, alert_phone, high_value_sms_enabled, suspended_at')
    .eq('id', accountId)
    .is('suspended_at', null)
    .maybeSingle();

  if (accountError || !account) {
    return {
      handled: false,
      outcome: 'error',
      errorMessage: accountError?.message || 'Field intake account was not found',
    };
  }

  const ownerAlertNormalized = account.alert_phone ? normalizeUsPhone(account.alert_phone) : null;
  const isOwner = account.high_value_sms_enabled === true
    && !!ownerAlertNormalized
    && senderNormalized === ownerAlertNormalized;

  if (!isOwner) {
    const reason = 'Crew field commands are temporarily unavailable by text';
    const confirmationText = sanitizeGsm7Text(
      '[LGQ] Crew field commands are temporarily unavailable by text. Ask the account owner to make this update.',
    );
    const { data: rpcOutcome, error: rpcError } = await admin.rpc(
      'apply_authorized_sms_field_action',
      {
        p_task_id: claim.taskId,
        p_claim_token: claim.claimToken,
        p_intent: 'no_action',
        p_params: { reason: 'crew_field_intake_not_supported' },
        p_transcript: rawBody,
        p_confirmation_text: confirmationText,
      },
    );
    if (rpcError) {
      return {
        handled: false,
        outcome: 'error',
        errorMessage: `Crew field intake authorization failed: ${rpcError.message}`,
      };
    }
    return {
      handled: true,
      outcome: 'no_action',
      intent: 'no_action',
      targetId: (rpcOutcome as Record<string, unknown>)?.target_id as string | null,
      confirmationText,
      errorMessage: reason,
    };
  }

  const { data: ownerConsent, error: ownerConsentError } = await admin
    .from('sms_consent')
    .select('id, sms_consent_scopes!inner(consent_scope)')
    .eq('account_id', accountId)
    .eq('phone_number', senderNormalized)
    .eq('status', 'opted_in')
    .is('opted_out_at', null)
    .eq('sms_consent_scopes.consent_scope', 'owner')
    .maybeSingle();

  if (ownerConsentError || !ownerConsent) {
    return {
      handled: false,
      outcome: 'error',
      errorMessage: ownerConsentError?.message || 'Owner field intake consent is missing or revoked',
    };
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return { handled: false, outcome: 'error', errorMessage: 'GEMINI_API_KEY is not configured' };
  }

  const businessName = account?.business_name && account.business_name !== 'My Business'
    ? account.business_name
    : "Let's Get Quoted";

  // Do not load the crew roster into model context. The live shared-number AI
  // rail remains owner-only until crew job context is assignment-scoped.
  const [rawJobs, rawClients] = await Promise.all([
    admin
      .from('jobs')
      .select('id, ref, client_name, client_phone, address, scope, status, quoted_amount, scheduled_for, scheduled_time')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(25),
    admin
      .from('clients')
      .select('id, name, phone, email, address')
      .eq('account_id', accountId)
      .order('updated_at', { ascending: false })
      .limit(25),
  ]);

  const contextError = rawJobs.error || rawClients.error;
  if (contextError) {
    return {
      handled: false,
      outcome: 'error',
      errorMessage: contextError.message || 'Field intake context could not be loaded',
    };
  }

  const activeJobs: JobSummaryContext[] = (rawJobs.data ?? []).map((j) => ({
    id: j.id,
    ref: j.ref,
    clientName: j.client_name ?? '',
    clientPhone: j.client_phone ?? null,
    address: j.address ?? null,
    scope: j.scope ?? null,
    status: j.status ?? 'in_progress',
    quotedAmount: Number(j.quoted_amount ?? 0),
    scheduledFor: j.scheduled_for ?? null,
    scheduledTime: j.scheduled_time ?? null,
  }));

  const activeClients: ClientSummaryContext[] = (rawClients.data ?? []).map((c) => ({
    id: c.id,
    name: c.name ?? '',
    phone: c.phone ?? null,
    email: c.email ?? null,
    address: c.address ?? null,
  }));

  const callerName = 'Owner';

  const ai = new GoogleGenAI({ apiKey });
  const todayStr = new Date().toISOString().slice(0, 10);

  const availableTools = OWNER_FIELD_TOOLS_DECLARATION;
  const allowedFunctionNames = availableTools
    .map((tool) => tool.name)
    .filter((name): name is string => typeof name === 'string');

  const roleInstruction = `You are an AI assistant for the business owner of "${businessName}". You may append internal job notes, log job costs, add job tasks, and capture new leads.`;

  const systemInstruction = `You are Let's Get Quoted's autonomous AI field intake worker for "${businessName}".
CURRENT DATE: ${todayStr}
SENDER: ${callerName}

${roleInstruction}

ACTIVE CONTRACTOR JOBS ON FILE:
${JSON.stringify(activeJobs, null, 2)}

ACTIVE CLIENTS:
${JSON.stringify(activeClients, null, 2)}

INSTRUCTIONS:
1. Accurately identify the target job or client record from the message context (name, street address, job reference, or today's schedule).
   - OWNER NEW-RECORD RULE: if the owner says "create a new job" or "create an estimate" for a person who has no existing job in the supplied context, invoke create_lead. This rail stages the request in Leads for review; it does not create a job or send a quote.
   - For create_lead, notes are mandatory. Preserve the complete request, including every stated address/location, work scope, and dollar estimate/amount. Never turn a new-person request into no_action merely because the owner called it a job.
2. RECEIPT & EXPENSE OCR RULES:
   - When an image attachment is provided (store receipt, supply invoice, dump/gas slip):
     a) OCR the store/vendor name (e.g. Home Depot, Lowe's, Ferguson, ABC Supply), total dollar amount (including tax), and concise item summary.
     b) Match to the target job named in the caption, or if only 1 active job is scheduled today, default to that job.
     c) Invoke log_cost with the extracted amount, vendor, itemsSummary, and label (e.g. "<Vendor>: <itemsSummary>").
     d) If multiple active jobs are open and no job is specified, invoke report_ambiguity with the candidate job IDs.
3. Select and invoke the single most appropriate tool function call.
4. Transcribe and execute field actions faithfully.`;

  const parts: Part[] = [];
  let isVoiceMemo = false;
  let hasImage = false;

  const mediaParts = await fetchAuthenticatedMediaParts(mediaUrls, claim.provider);

  for (const mediaPart of mediaParts) {
    if (mediaPart) {
      parts.push({
        inlineData: {
          mimeType: mediaPart.mimeType,
          data: mediaPart.data,
        },
      });
      if (mediaPart.kind === 'audio') isVoiceMemo = true;
      if (mediaPart.kind === 'image') hasImage = true;
    }
  }

  if (rawBody) {
    parts.push({ text: `${callerName} message: "${rawBody}"` });
  } else if (hasImage) {
    parts.push({
      text: `${callerName} sent a receipt/photo attachment. Extract store vendor, total amount with tax, purchased items, and log the material cost against the target job.`,
    });
  } else if (isVoiceMemo) {
    parts.push({ text: `${callerName} sent a voice memo. Transcribe and execute any field actions requested.` });
  }

  if (parts.length === 0) {
    return { handled: false, outcome: 'error', errorMessage: 'No text, image, or audio content' };
  }

  try {
    const usage = await beginSmsFieldIntakeUsage(admin, {
      accountId: claim.accountId,
      taskId: claim.taskId,
    });
    if (usage.kind === 'unavailable') {
      throw new Error('AI intake usage ledger is unavailable');
    }
    if (usage.kind === 'no_credits') {
      const reason = 'No AI Intake credits are available';
      const confirmationText = sanitizeGsm7Text(
        '[LGQ] No AI Intake credits remain, so no change was made. Add credits in the dashboard, then resend this field message.',
      );
      const { data: rpcOutcome, error: rpcError } = await admin.rpc('apply_authorized_sms_field_action', {
        p_task_id: claim.taskId,
        p_claim_token: claim.claimToken,
        p_intent: 'no_action',
        p_params: { reason },
        p_transcript: rawBody,
        p_confirmation_text: confirmationText,
      });
      if (rpcError) {
        throw new Error(`apply_authorized_sms_field_action RPC failed: ${rpcError.message}`);
      }
      return {
        handled: true,
        outcome: 'no_action',
        intent: 'no_action',
        targetId: (rpcOutcome as Record<string, unknown>)?.target_id as string | null,
        confirmationText,
        errorMessage: reason,
      };
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: [{ role: 'user', parts }],
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: availableTools }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY,
            allowedFunctionNames,
          },
        },
        temperature: 0.1,
      },
    });

    // A credit is spent only after the provider answered, but before any
    // domain mutation. A failed/indeterminate commit leaves the task retryable
    // and can never produce an applied-but-unmetered field action.
    if (!(await commitSmsFieldIntakeUsage(admin, usage.lease))) {
      throw new Error('AI intake usage reservation could not be committed');
    }

    const transcript = response.text || rawBody;
    const functionCalls = response.functionCalls;
    const missingFunctionCall = !functionCalls || functionCalls.length === 0;
    const call = functionCalls?.[0] ?? {
      name: 'no_action',
      args: { reason: 'Field intake model returned no function call' },
    };
    const toolName = call.name;
    const args = (call.args ?? {}) as Record<string, unknown>;
    const actionParams = normalizeFieldActionParams(args);

    if (!toolName || !availableTools.some((tool) => tool.name === toolName)) {
      return {
        handled: false,
        outcome: 'error',
        errorMessage: `Field intake model selected unsupported action: ${toolName || 'unknown'}`,
      };
    }

    if (toolName === 'log_cost') {
      const validationError = fieldCostValidationError(actionParams);
      if (validationError) {
        return {
          handled: false,
          outcome: 'error',
          errorMessage: validationError,
        };
      }
    }

    if (toolName === 'create_lead') {
      const modelNotes = String(actionParams.notes ?? '').trim();
      const originalMessage = rawBody.trim();
      // Function-call schemas are strong guidance, not a data-retention boundary.
      // Keep the original owner text alongside the model summary so an address,
      // scope detail, or dollar amount can never disappear during extraction.
      actionParams.notes = originalMessage && !modelNotes.includes(originalMessage)
        ? `${modelNotes}\n\nOriginal owner message: ${originalMessage}`.trim()
        : (modelNotes || originalMessage);

      if (!String(actionParams.notes ?? '').trim()) {
        return {
          handled: false,
          outcome: 'error',
          errorMessage: 'New lead intake requires notes preserving the owner request',
        };
      }
    }

    let confirmationText = '';
    const targetJob = activeJobs.find((j) => j.id === actionParams.job_id);
    const ref = targetJob?.ref ?? 'Job';
    const clientName = targetJob?.clientName ?? 'Client';
    const reviewUrl = `${APP_ORIGIN}/field/intake/${claim.taskId}`;

    if (toolName === 'append_internal_note') {
      confirmationText = formatFieldNoteConfirmation(ref, clientName, reviewUrl);
    } else if (toolName === 'log_cost') {
      const amount = Number(actionParams.amount ?? 0);
      const label = String(actionParams.label ?? 'material');
      const vendor = actionParams.vendor ? String(actionParams.vendor) : undefined;
      const itemsSummary = actionParams.items_summary ? String(actionParams.items_summary) : undefined;
      if (vendor) {
        confirmationText = formatFieldReceiptConfirmation(ref, clientName, amount, vendor, itemsSummary, reviewUrl);
      } else {
        confirmationText = formatFieldCostConfirmation(ref, clientName, amount, label, reviewUrl);
      }
    } else if (toolName === 'add_job_task') {
      const title = String(actionParams.title ?? 'Task');
      confirmationText = formatFieldTaskConfirmation(ref, clientName, title, reviewUrl);
    } else if (toolName === 'create_lead') {
      const leadName = String(actionParams.client_name ?? 'New Prospect');
      confirmationText = formatFieldLeadConfirmation(leadName, reviewUrl);
    } else if (toolName === 'report_ambiguity') {
      const candidateIds = Array.isArray(actionParams.candidate_job_ids)
        ? (actionParams.candidate_job_ids as string[])
        : [];
      const candidates = activeJobs
        .filter((j) => candidateIds.includes(j.id))
        .map((j) => ({ ref: j.ref, address: j.address }));
      confirmationText = formatFieldAmbiguityClarification(candidates);
    }

    // Guarantee pure GSM-7 ASCII output
    confirmationText = sanitizeGsm7Text(confirmationText);

    // Call atomic execution RPC
    const { data: rpcOutcome, error: rpcError } = await admin.rpc('apply_authorized_sms_field_action', {
      p_task_id: claim.taskId,
      p_claim_token: claim.claimToken,
      p_intent: toolName,
      p_params: actionParams,
      p_transcript: transcript,
      p_confirmation_text: confirmationText,
    });

    if (rpcError) {
      throw new Error(`apply_authorized_sms_field_action RPC failed: ${rpcError.message}`);
    }

    // A forced function call can still be absent if the provider returns an
    // anomalous response. Finalize that claim durably as no_action so it is not
    // retried or dead-lettered. The provider answered, so the task's AI credit
    // was committed above even though no domain record changed.
    if (missingFunctionCall) {
      return {
        handled: true,
        outcome: 'no_action',
        intent: 'no_action',
        targetId: (rpcOutcome as Record<string, unknown>)?.target_id as string | null,
        confirmationText,
        errorMessage: String(actionParams.reason ?? ''),
      };
    }

    return {
      handled: true,
      outcome: toolName === 'report_ambiguity'
        ? 'ambiguity'
        : toolName === 'no_action'
          ? 'no_action'
          : 'completed',
      intent: toolName,
      targetId: (rpcOutcome as Record<string, unknown>)?.target_id as string | null,
      confirmationText,
      errorMessage: toolName === 'no_action' ? String(actionParams.reason ?? '') : undefined,
    };
  } catch (err) {
    console.error('Field intake processing error:', err);
    return {
      handled: false,
      outcome: 'error',
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

export const processFieldIntakeClaim = processOwnerFieldClaim;
