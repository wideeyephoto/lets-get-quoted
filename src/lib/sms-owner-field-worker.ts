import 'server-only';

import { GoogleGenAI, Type, type FunctionDeclaration, type Part } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  formatFieldAmbiguityClarification,
  formatFieldCostConfirmation,
  formatFieldLeadConfirmation,
  formatFieldNoteConfirmation,
  formatFieldTaskConfirmation,
  sanitizeGsm7Text,
} from '@/lib/sms-field-templates';
import type { SmsInboundActionClaim } from '@/lib/sms-inbound-action-worker';

export interface OwnerFieldActionResult {
  handled: boolean;
  outcome: 'completed' | 'ambiguity' | 'no_action' | 'error';
  intent?: string;
  targetId?: string | null;
  confirmationText?: string;
  errorMessage?: string;
}

type AssistantFunctionDeclaration = Omit<FunctionDeclaration, 'parameters'> & {
  parameters: NonNullable<FunctionDeclaration['parameters']>;
};

export const OWNER_FIELD_TOOLS_DECLARATION: AssistantFunctionDeclaration[] = [
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
          description: 'The internal note or observation from the contractor.',
        },
      },
      required: ['jobId', 'note'],
    },
  },
  {
    name: 'log_cost',
    description: 'Logs a job cost (material expense, dump fee, receipt, labor) against a specific job for accurate margin tracking.',
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
    name: 'report_ambiguity',
    description: 'Call when multiple jobs could match the reference (e.g. two jobs for "Smith"), asking the contractor to clarify.',
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
    description: 'Call when the text message is not a job command or field update (e.g. casual conversational chatter).',
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

/**
 * Safely downloads MMS audio attachment using authenticated provider credentials
 * when fetching from carrier endpoints, enforcing 20MB limit and audio MIME type.
 */
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
 * Asynchronously processes an owner field intake task claimed from the queue.
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

  // Load contractor business name
  const { data: account } = await admin
    .from('accounts')
    .select('id, business_name')
    .eq('id', accountId)
    .maybeSingle();

  const businessName = account?.business_name && account.business_name !== 'My Business'
    ? account.business_name
    : "Let's Get Quoted";

  // Load active contractor jobs for fuzzy matching
  const { data: rawJobs } = await admin
    .from('jobs')
    .select('id, ref, client_name, client_phone, address, scope, status, quoted_amount, scheduled_for, scheduled_time')
    .eq('account_id', accountId)
    .order('updated_at', { ascending: false })
    .limit(25);

  const activeJobs: JobSummaryContext[] = (rawJobs ?? []).map((j) => ({
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

  const ai = new GoogleGenAI({ apiKey });
  const todayStr = new Date().toISOString().slice(0, 10);

  const systemInstruction = `You are the field voice/text AI assistant for the contractor business "${businessName}".
A contractor / business owner is sending a text or voice memo from the road/job site to update their job records.

CURRENT DATE: ${todayStr}

ACTIVE CONTRACTOR JOBS ON FILE:
${JSON.stringify(activeJobs, null, 2)}

INSTRUCTIONS:
1. Identify the contractor's intent and target job:
   - "append_internal_note": If the contractor is dictating a field note, gate code, or site update.
   - "log_cost": If they mention material expense or cost (e.g. "used $75 of cement", "dump run was $120").
   - "add_job_task": If adding a checklist task or punch list item (e.g. "pick up grout").
   - "create_lead": If capturing a new prospect/customer inquiry.
   - "report_ambiguity": If multiple jobs match (e.g. two jobs for "Miller").
   - "no_action": If conversational greeting or non-job inquiry.
2. In addition to calling the tool, transcribe the contractor's voice/text accurately.`;

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
    parts.push({ text: `Contractor message: "${rawBody}"` });
  } else if (isVoiceMemo) {
    parts.push({ text: 'Contractor sent a voice memo. Transcribe and execute any field job actions requested.' });
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
        tools: [{ functionDeclarations: OWNER_FIELD_TOOLS_DECLARATION }],
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
      confirmationText = formatFieldNoteConfirmation(ref, clientName);
    } else if (toolName === 'log_cost') {
      const amount = Number(args.amount ?? 0);
      const label = String(args.label ?? 'material');
      confirmationText = formatFieldCostConfirmation(ref, clientName, amount, label);
    } else if (toolName === 'add_job_task') {
      const title = String(args.title ?? 'Task');
      confirmationText = formatFieldTaskConfirmation(ref, clientName, title);
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
    console.error('Owner field intake processing error:', err);
    return {
      handled: false,
      outcome: 'error',
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}
