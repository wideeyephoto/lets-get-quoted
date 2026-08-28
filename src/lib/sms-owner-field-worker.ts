import 'server-only';

import { GoogleGenAI, Type, type FunctionDeclaration, type Part } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  formatCrewCostConfirmation,
  formatCrewNoteConfirmation,
  formatCrewTaskConfirmation,
  formatFieldAmbiguityClarification,
  formatFieldClientConfirmation,
  formatFieldCostConfirmation,
  formatFieldCrewConfirmation,
  formatFieldLeadConfirmation,
  formatFieldNoteConfirmation,
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
          description: 'Dollar amount of the cost (e.g. 75 for $75.00).',
        },
        label: {
          type: Type.STRING,
          description: 'Description of the expense (e.g. "3 bags of cement", "Dump fee").',
        },
        costType: {
          type: Type.STRING,
          description: 'Cost category: "material", "labor", "sub", "receipt", or "other".',
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

async function fetchAuthenticatedAudioPart(
  url: string,
  provider: string,
): Promise<{ mimeType: string; data: string } | null> {
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

    const contentType = (res.headers.get('content-type') || 'audio/mp4').split(';')[0].trim();
    const arrayBuffer = await res.arrayBuffer();

    // Enforce 20MB limit for inline Gemini multimodal payload
    if (arrayBuffer.byteLength > 20 * 1024 * 1024) {
      console.warn('Audio attachment exceeds 20MB limit, skipping.');
      return null;
    }

    const buffer = Buffer.from(arrayBuffer);
    return {
      mimeType: contentType,
      data: buffer.toString('base64'),
    };
  } catch (err) {
    console.error('Failed to fetch authenticated audio part:', err);
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

  const rawReceipt = receipt || {
    id: claim.taskId,
    provider: claim.provider,
    account_id: claim.accountId,
    from_number: claim.fromNumber,
    message_body: '',
    media_urls: [],
  };

  const accountId = claim.accountId;
  const rawBody = String(rawReceipt.message_body ?? '').trim();
  const mediaUrls = Array.isArray(rawReceipt.media_urls) ? (rawReceipt.media_urls as string[]) : [];

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return { handled: false, outcome: 'no_action', errorMessage: 'GEMINI_API_KEY is not configured' };
  }

  // Load contractor business account details
  const { data: account } = await admin
    .from('accounts')
    .select('id, business_name, alert_phone')
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

  // Identify sender role: Owner vs Crew Member
  const normalizedFrom = normalizeUsPhone(claim.fromNumber || rawReceipt.from_number);
  const normalizedOwnerPhone = normalizeUsPhone(account?.alert_phone ?? '');
  const matchedCrew = activeCrew.find((cr) => normalizeUsPhone(cr.phone ?? '') === normalizedFrom);

  const isCrew = Boolean(matchedCrew && normalizedFrom !== normalizedOwnerPhone);
  const callerRole = isCrew ? 'crew' : 'owner';
  const callerName = isCrew ? (matchedCrew?.name || 'Crew Member') : 'Owner';

  const ai = new GoogleGenAI({ apiKey });
  const todayStr = new Date().toISOString().slice(0, 10);

  const availableTools = isCrew ? CREW_FIELD_TOOLS_DECLARATION : OWNER_FIELD_TOOLS_DECLARATION;

  const roleInstruction = isCrew
    ? `You are processing a field text or voice update from registered Crew Member "${callerName}" (${matchedCrew?.roleLabel || 'Field Team'}).
CREW CAPABILITIES:
- "append_internal_note": To log progress notes, job observations, gate codes, or site conditions on a job.
- "log_cost": To log material expenses, supply purchases, dump fees, or receipts for a job.
- "add_job_task": To add a checklist task or punch list item for a job.
- "complete_job_task": To mark a punch list / checklist task finished on a job (e.g. "Done with framing on Smith").
- "report_ambiguity": If multiple jobs could match the reference.
- "no_action": If conversational or non-job chatter.`
    : `You are processing a field text or voice update from the Business Owner / General Contractor.
OWNER CAPABILITIES:
- "append_internal_note": Log field notes or gate codes on jobs.
- "log_cost": Log material/dump costs on jobs.
- "add_job_task": Add punch list tasks on jobs.
- "complete_job_task": Mark punch list tasks done.
- "reschedule_job": Reschedule jobs/estimates.
- "update_client": Update client info/notes.
- "assign_crew": Assign crew to jobs.
- "create_lead": Ingest new prospective client inquiries.
- "report_ambiguity": If multiple jobs match.
- "no_action": Conversational.`;

  const systemInstruction = `You are the field voice/text AI assistant for the contractor business "${businessName}".
CURRENT DATE: ${todayStr}
SENDER: ${callerName} (${callerRole.toUpperCase()})

${roleInstruction}

ACTIVE CONTRACTOR JOBS ON FILE:
${JSON.stringify(activeJobs, null, 2)}

ACTIVE CLIENTS:
${JSON.stringify(activeClients, null, 2)}

ACTIVE CREW:
${JSON.stringify(activeCrew, null, 2)}

INSTRUCTIONS:
1. Accurately identify the target job or client record from the message context.
2. Select and invoke the single most appropriate tool function call.
3. Transcribe and execute field actions faithfully.`;

  const parts: Part[] = [];
  let isVoiceMemo = false;

  for (const url of mediaUrls) {
    if (url.match(/\.(mp3|m4a|wav|aac|ogg|amr|webm)(\?.*)?$/i) || url.includes('/recordings/') || url.includes('/media/')) {
      const audioPart = await fetchAuthenticatedAudioPart(url, claim.provider);
      if (audioPart) {
        parts.push({
          inlineData: {
            mimeType: audioPart.mimeType,
            data: audioPart.data,
          },
        });
        isVoiceMemo = true;
      }
    }
  }

  if (rawBody) {
    parts.push({ text: `${callerName} message: "${rawBody}"` });
  } else if (isVoiceMemo) {
    parts.push({ text: `${callerName} sent a voice memo. Transcribe and execute any field actions requested.` });
  }

  if (parts.length === 0) {
    return { handled: false, outcome: 'no_action', errorMessage: 'No text or audio content' };
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
      confirmationText = isCrew
        ? formatCrewCostConfirmation(ref, clientName, amount, label, callerName)
        : formatFieldCostConfirmation(ref, clientName, amount, label);
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
