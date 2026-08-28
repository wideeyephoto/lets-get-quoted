import 'server-only';

import { GoogleGenAI, Type, type FunctionDeclaration, type Part } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  formatCrewCostConfirmation,
  formatCrewNoteConfirmation,
  formatCrewReceiptConfirmation,
  formatCrewTaskConfirmation,
  formatFieldAmbiguityClarification,
  formatFieldClientConfirmation,
  formatFieldCostConfirmation,
  formatFieldCrewConfirmation,
  formatFieldLeadConfirmation,
  formatFieldNoteConfirmation,
  formatFieldQuoteSentConfirmation,
  formatFieldQuoteWithSendPrompt,
  formatFieldReceiptConfirmation,
  formatFieldScheduleConfirmation,
  formatFieldTaskCompletedConfirmation,
  formatFieldTaskConfirmation,
  sanitizeGsm7Text,
} from '@/lib/sms-field-templates';
import type { SmsInboundActionClaim } from '@/lib/sms-inbound-action-worker';
import { normalizeUsPhone } from '@/lib/phone';

export interface OwnerFieldActionResult {
  handled: boolean;
  outcome: 'completed' | 'ambiguity' | 'no_action' | 'error';
  intent?: string;
  targetId?: string | null;
  confirmationText?: string;
  errorMessage?: string;
}

export type FieldIntakeActionResult = OwnerFieldActionResult;

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
    name: 'complete_job_task',
    description: 'Marks an existing checklist / punch list task completed on the job.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        jobId: {
          type: Type.STRING,
          description: 'The exact ID of the target job.',
        },
        title: {
          type: Type.STRING,
          description: 'The title or keywords of the completed task (e.g. "Rough-in plumbing", "Framing").',
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
    name: 'reschedule_job',
    description: 'Reschedules a job or estimate visit to a new date and optional time.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        jobId: {
          type: Type.STRING,
          description: 'The exact ID of the target job.',
        },
        scheduled_for: {
          type: Type.STRING,
          description: 'New scheduled date in YYYY-MM-DD format.',
        },
        scheduled_time: {
          type: Type.STRING,
          description: 'New arrival time in HH:MM format (optional).',
        },
      },
      required: ['jobId', 'scheduled_for'],
    },
  },
  {
    name: 'update_client',
    description: 'Updates client contact information (phone, email, address) or adds notes to their client profile.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        client_id: {
          type: Type.STRING,
          description: 'The exact ID of the client.',
        },
        phone: {
          type: Type.STRING,
          description: 'Updated phone number (optional).',
        },
        email: {
          type: Type.STRING,
          description: 'Updated email address (optional).',
        },
        address: {
          type: Type.STRING,
          description: 'Updated address (optional).',
        },
        notes: {
          type: Type.STRING,
          description: 'Notes to append to client profile (optional).',
        },
      },
      required: ['client_id'],
    },
  },
  {
    name: 'assign_crew',
    description: 'Assigns a crew member to a specific job.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        jobId: {
          type: Type.STRING,
          description: 'The exact ID of the target job.',
        },
        crew_id: {
          type: Type.STRING,
          description: 'The exact ID of the crew member to assign.',
        },
      },
      required: ['jobId', 'crew_id'],
    },
  },
  {
    name: 'create_lead',
    description: 'Captures a new prospect or client inquiry dictated from the road into the leads pipeline.',
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
          description: 'Description of work requested or conversation summary.',
        },
      },
      required: ['clientName'],
    },
  },
  {
    name: 'add_quote_line_item',
    description: 'Adds an extra line item or change order to an existing job quote and recalculates total.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        jobId: {
          type: Type.STRING,
          description: 'The exact ID of the target job.',
        },
        amount: {
          type: Type.NUMBER,
          description: 'Dollar amount of the line item (e.g. 450 for $450.00).',
        },
        description: {
          type: Type.STRING,
          description: 'Description of the additional work or change order.',
        },
      },
      required: ['jobId', 'amount', 'description'],
    },
  },
  {
    name: 'send_client_quote_link',
    description: 'Sends an SMS to the customer with their updated quote approval link (triggered when owner replies "SEND", "YES", "SEND IT", "TEXT CLIENT").',
    parameters: {
      type: Type.OBJECT,
      properties: {
        jobId: {
          type: Type.STRING,
          description: 'The exact ID of the target job.',
        },
      },
      required: ['jobId'],
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

async function fetchAuthenticatedMediaPart(
  url: string,
  provider: string,
): Promise<{ mimeType: string; data: string; kind: 'audio' | 'image' } | null> {
  try {
    const headers: Record<string, string> = {};

    if (provider === 'twilio' && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      const basicAuth = Buffer.from(
        `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`,
      ).toString('base64');
      headers.Authorization = `Basic ${basicAuth}`;
    } else if (provider === 'signalwire' && process.env.SIGNALWIRE_PROJECT_ID && process.env.SIGNALWIRE_API_TOKEN) {
      const basicAuth = Buffer.from(
        `${process.env.SIGNALWIRE_PROJECT_ID}:${process.env.SIGNALWIRE_API_TOKEN}`,
      ).toString('base64');
      headers.Authorization = `Basic ${basicAuth}`;
    }

    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;

    let contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();

    // Fallback detection from extension if content-type header is generic or missing
    if (!contentType || contentType === 'application/octet-stream') {
      if (url.match(/\.(jpg|jpeg)(\?.*)?$/i)) contentType = 'image/jpeg';
      else if (url.match(/\.png(\?.*)?$/i)) contentType = 'image/png';
      else if (url.match(/\.webp(\?.*)?$/i)) contentType = 'image/webp';
      else if (url.match(/\.heic(\?.*)?$/i)) contentType = 'image/heic';
      else if (url.match(/\.(mp3|m4a|wav|aac|ogg|amr|webm)(\?.*)?$/i)) contentType = 'audio/mp4';
      else contentType = 'image/jpeg'; // MMS default
    }

    const arrayBuffer = await res.arrayBuffer();

    // Enforce 20MB limit for inline Gemini multimodal payload
    if (arrayBuffer.byteLength > 20 * 1024 * 1024) {
      console.warn('Media attachment exceeds 20MB limit, skipping.');
      return null;
    }

    const buffer = Buffer.from(arrayBuffer);
    const isImage = contentType.startsWith('image/');
    const isAudio = contentType.startsWith('audio/');

    if (!isImage && !isAudio) {
      return null;
    }

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

/**
 * Asynchronously processes an inbound field intake task (Owner or Crew) claimed from the queue.
 */
export async function processOwnerFieldClaim(
  claim: SmsInboundActionClaim,
  admin: SupabaseClient,
): Promise<OwnerFieldActionResult> {
  const { data: receipt } = await admin
    .from('sms_webhook_receipts')
    .select('id, provider, provider_event_id, account_id, from_number, message_body, media_urls')
    .eq('id', claim.providerEventId ? claim.taskId : '')
    .maybeSingle();

  // Fallback to claim context if receipt table query differs in test mocks
  const rawReceipt = receipt ?? {
    id: claim.taskId,
    account_id: claim.accountId,
    from_number: claim.fromNumber,
    message_body: '',
    media_urls: [],
  };

  const accountId = claim.accountId;
  const rawBody = (rawReceipt.message_body || '').trim();
  const mediaUrls = Array.isArray(rawReceipt.media_urls) ? (rawReceipt.media_urls as string[]) : [];

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return { handled: false, outcome: 'no_action', errorMessage: 'GEMINI_API_KEY is not configured' };
  }

  // Determine sender role: Alert Phone (Owner) vs Crew Member
  const { data: account } = await admin
    .from('accounts')
    .select('id, business_name, alert_phone, owner_name')
    .eq('id', accountId)
    .maybeSingle();

  const businessName = account?.business_name && account.business_name !== 'My Business'
    ? account.business_name
    : "Let's Get Quoted";

  // Load active contractor jobs, clients, and crew for fuzzy matching and role determination
  const [rawJobs, rawClients, rawCrew] = await Promise.all([
    admin
      .from('jobs')
      .select('id, ref, client_name, client_phone, address, scope, status, quoted_amount, scheduled_for, scheduled_time')
      .eq('account_id', accountId)
      .order('updated_at', { ascending: false })
      .limit(25),
    admin
      .from('clients')
      .select('id, name, phone, email, address')
      .eq('account_id', accountId)
      .order('updated_at', { ascending: false })
      .limit(25),
    admin
      .from('crew')
      .select('id, name, phone, role_label')
      .eq('account_id', accountId)
      .eq('active', true)
      .limit(25),
  ]);

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

  const activeCrew: CrewSummaryContext[] = (rawCrew.data ?? []).map((cr) => ({
    id: cr.id,
    name: cr.name ?? '',
    phone: cr.phone ?? null,
    roleLabel: cr.role_label ?? null,
  }));

  const senderNormalized = normalizeUsPhone(claim.fromNumber);
  const ownerAlertNormalized = account?.alert_phone ? normalizeUsPhone(account.alert_phone) : null;
  const isOwner = !!(ownerAlertNormalized && senderNormalized === ownerAlertNormalized);

  const matchedCrew = !isOwner
    ? activeCrew.find((c) => c.phone && normalizeUsPhone(c.phone) === senderNormalized)
    : null;
  const isCrew = !!matchedCrew;
  const callerName = isOwner ? (account?.owner_name || 'Owner') : (matchedCrew?.name || 'Field Crew');

  const ai = new GoogleGenAI({ apiKey });
  const todayStr = new Date().toISOString().slice(0, 10);

  const availableTools = isOwner ? OWNER_FIELD_TOOLS_DECLARATION : CREW_FIELD_TOOLS_DECLARATION;

  const roleInstruction = isOwner
    ? `You are an AI assistant for the business owner of "${businessName}". You have full authority to append notes, log costs, add tasks, complete tasks, reschedule jobs, update client profiles, assign crew, or create new leads.`
    : `You are an AI assistant for field crew member "${callerName}" at "${businessName}". You can append internal job notes, log material/labor expenses, add punch list tasks, and mark assigned tasks complete.`;

  const systemInstruction = `You are Let's Get Quoted's autonomous AI field intake worker for "${businessName}".
CURRENT DATE: ${todayStr}
SENDER: ${callerName}

${roleInstruction}

ACTIVE CONTRACTOR JOBS ON FILE:
${JSON.stringify(activeJobs, null, 2)}

ACTIVE CLIENTS:
${JSON.stringify(activeClients, null, 2)}

ACTIVE CREW:
${JSON.stringify(activeCrew, null, 2)}

INSTRUCTIONS:
1. Accurately identify the target job or client record from the message context (name, street address, job reference, or today's schedule).
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

  for (const url of mediaUrls) {
    const mediaPart = await fetchAuthenticatedMediaPart(url, claim.provider);
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
    return { handled: false, outcome: 'no_action', errorMessage: 'No text, image, or audio content' };
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: [{ role: 'user', parts }],
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: availableTools }],
        temperature: 0.1,
      },
    });

    const transcript = response.text || rawBody;
    const functionCalls = response.functionCalls;

    if (!functionCalls || functionCalls.length === 0) {
      return { handled: false, outcome: 'no_action' };
    }

    const call = functionCalls[0];
    const toolName = call.name;
    const args = (call.args ?? {}) as Record<string, unknown>;

    if (toolName === 'no_action') {
      return { handled: false, outcome: 'no_action', errorMessage: String(args.reason ?? '') };
    }

    let confirmationText = '';
    const targetJob = activeJobs.find((j) => j.id === args.jobId);
    const ref = targetJob?.ref ?? 'Job';
    const clientName = targetJob?.clientName ?? 'Client';

    if (toolName === 'append_internal_note') {
      confirmationText = isCrew
        ? formatCrewNoteConfirmation(ref, clientName, callerName)
        : formatFieldNoteConfirmation(ref, clientName);
    } else if (toolName === 'log_cost') {
      const amount = Number(args.amount ?? 0);
      const label = String(args.label ?? 'material');
      const vendor = args.vendor ? String(args.vendor) : undefined;
      const itemsSummary = args.itemsSummary ? String(args.itemsSummary) : undefined;
      if (vendor) {
        confirmationText = isCrew
          ? formatCrewReceiptConfirmation(ref, clientName, amount, vendor, callerName)
          : formatFieldReceiptConfirmation(ref, clientName, amount, vendor, itemsSummary);
      } else {
        confirmationText = isCrew
          ? formatCrewCostConfirmation(ref, clientName, amount, label, callerName)
          : formatFieldCostConfirmation(ref, clientName, amount, label);
      }
    } else if (toolName === 'add_job_task') {
      const title = String(args.title ?? 'Task');
      confirmationText = isCrew
        ? formatCrewTaskConfirmation(ref, clientName, title, callerName)
        : formatFieldTaskConfirmation(ref, clientName, title);
    } else if (toolName === 'complete_job_task') {
      const title = String(args.title ?? 'Task');
      confirmationText = formatFieldTaskCompletedConfirmation(ref, clientName, title, isCrew ? callerName : undefined);
    } else if (toolName === 'reschedule_job') {
      const when = String(args.scheduled_for ?? 'scheduled date');
      confirmationText = formatFieldScheduleConfirmation(ref, clientName, when);
    } else if (toolName === 'update_client') {
      const targetClient = activeClients.find((c) => c.id === args.client_id);
      const cName = targetClient?.name ?? 'Client';
      confirmationText = formatFieldClientConfirmation(cName);
    } else if (toolName === 'assign_crew') {
      const targetCrew = activeCrew.find((cr) => cr.id === args.crew_id);
      const crewName = targetCrew?.name ?? 'Crew member';
      confirmationText = formatFieldCrewConfirmation(ref, clientName, crewName);
    } else if (toolName === 'create_lead') {
      const leadName = String(args.clientName ?? 'New Prospect');
      confirmationText = formatFieldLeadConfirmation(leadName);
    } else if (toolName === 'add_quote_line_item') {
      const amount = Number(args.amount ?? 0);
      const currentQuoted = targetJob?.quotedAmount ?? 0;
      const totalAmount = currentQuoted + amount;
      confirmationText = formatFieldQuoteWithSendPrompt(ref, clientName, amount, totalAmount);
    } else if (toolName === 'send_client_quote_link') {
      confirmationText = formatFieldQuoteSentConfirmation(ref, clientName, targetJob?.clientPhone);
    } else if (toolName === 'report_ambiguity') {
      const candidateIds = Array.isArray(args.candidateJobIds) ? (args.candidateJobIds as string[]) : [];
      const candidates = activeJobs
        .filter((j) => candidateIds.includes(j.id))
        .map((j) => ({ ref: j.ref, address: j.address }));
      confirmationText = formatFieldAmbiguityClarification(candidates);
    }

    // Guarantee pure GSM-7 ASCII output
    confirmationText = sanitizeGsm7Text(confirmationText);

    // Call atomic execution RPC
    const { data: rpcOutcome, error: rpcError } = await admin.rpc('apply_owner_field_action', {
      p_task_id: claim.taskId,
      p_claim_token: claim.claimToken,
      p_intent: toolName,
      p_params: args,
      p_transcript: transcript,
      p_confirmation_text: confirmationText,
    });

    if (rpcError) {
      throw new Error(`apply_owner_field_action RPC failed: ${rpcError.message}`);
    }

    return {
      handled: true,
      outcome: toolName === 'report_ambiguity' ? 'ambiguity' : 'completed',
      intent: toolName,
      targetId: (rpcOutcome as Record<string, unknown>)?.target_id as string | null,
      confirmationText,
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
