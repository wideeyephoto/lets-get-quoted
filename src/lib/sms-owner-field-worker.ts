import 'server-only';

import { randomUUID } from 'node:crypto';
import { GoogleGenAI, Type, type FunctionDeclaration, type Part } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { enqueueSmsDelivery } from '@/lib/sms-delivery';
import { parseQuoteItems, type QuoteItem } from '@/lib/jobs';

export interface OwnerFieldIntakeResult {
  handled: boolean;
  outcome: 'field_action_applied' | 'ambiguity_clarification_sent' | 'no_action' | 'error';
  actionKind?: string;
  targetJobId?: string | null;
  confirmationText?: string;
  errorMessage?: string;
}

type AssistantFunctionDeclaration = Omit<FunctionDeclaration, 'parameters'> & {
  parameters: NonNullable<FunctionDeclaration['parameters']>;
};

export const OWNER_FIELD_TOOLS_DECLARATION: AssistantFunctionDeclaration[] = [
  {
    name: 'update_job',
    description: 'Updates a job record properties such as status, scheduled date/time, or appends notes/updates to the job description.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        jobId: {
          type: Type.STRING,
          description: 'The exact ID of the target job.',
        },
        status: {
          type: Type.STRING,
          description: 'Updated status: "new_lead", "in_progress", "complete", or "archived".',
        },
        appendNotes: {
          type: Type.STRING,
          description: 'Field notes, scope updates, or notes from the contractor to append to the job.',
        },
        scheduledFor: {
          type: Type.STRING,
          description: 'Scheduled start date in YYYY-MM-DD format (if rescheduling).',
        },
        scheduledTime: {
          type: Type.STRING,
          description: 'Scheduled arrival time in HH:MM format (if rescheduling).',
        },
        confirmationMessage: {
          type: Type.STRING,
          description: 'Concise 1-segment SMS confirmation message (under 140 chars) to text back to the contractor.',
        },
      },
      required: ['jobId', 'confirmationMessage'],
    },
  },
  {
    name: 'add_quote_line_item',
    description: 'Adds an itemized material, labor, or add-on charge line item to an existing quote/job and recalculates total.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        jobId: {
          type: Type.STRING,
          description: 'The exact ID of the target job.',
        },
        label: {
          type: Type.STRING,
          description: 'Description of the item or labor (e.g. "Drywall patch", "Extra copper pipe", "Permit fee").',
        },
        amount: {
          type: Type.NUMBER,
          description: 'Amount in dollars to add (e.g. 350 for $350.00).',
        },
        kind: {
          type: Type.STRING,
          description: '"base" for standard quote item or "addon" for optional upgrade.',
        },
        confirmationMessage: {
          type: Type.STRING,
          description: 'Concise 1-segment SMS confirmation message (under 140 chars) to text back to the contractor.',
        },
      },
      required: ['jobId', 'label', 'amount', 'confirmationMessage'],
    },
  },
  {
    name: 'add_job_task',
    description: 'Adds a punch list / checklist task or to-do item to the job for crew or owner tracking.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        jobId: {
          type: Type.STRING,
          description: 'The exact ID of the target job.',
        },
        title: {
          type: Type.STRING,
          description: 'Checklist task description (e.g. "Pick up 4 bags of mortar", "Confirm paint color with client").',
        },
        confirmationMessage: {
          type: Type.STRING,
          description: 'Concise 1-segment SMS confirmation message (under 140 chars) to text back to the contractor.',
        },
      },
      required: ['jobId', 'title', 'confirmationMessage'],
    },
  },
  {
    name: 'create_quick_lead',
    description: 'Creates a brand new job / lead when the contractor dictates a new prospect or client request from the field.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        clientName: {
          type: Type.STRING,
          description: 'Client or homeowner name.',
        },
        clientPhone: {
          type: Type.STRING,
          description: 'Client phone number if provided.',
        },
        address: {
          type: Type.STRING,
          description: 'Job site address if provided.',
        },
        scope: {
          type: Type.STRING,
          description: 'Description of the work requested or quote needed.',
        },
        amount: {
          type: Type.NUMBER,
          description: 'Estimated or agreed dollar amount if discussed.',
        },
        confirmationMessage: {
          type: Type.STRING,
          description: 'Concise 1-segment SMS confirmation message (under 140 chars) to text back to the contractor.',
        },
      },
      required: ['clientName', 'scope', 'confirmationMessage'],
    },
  },
  {
    name: 'report_ambiguity',
    description: 'Call when multiple jobs could match the contractor reference (e.g. two jobs for "Smith"), asking the contractor to clarify which job they mean.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        message: {
          type: Type.STRING,
          description: 'Clarification SMS message (under 140 chars) asking the contractor to specify the address or job ref.',
        },
      },
      required: ['message'],
    },
  },
  {
    name: 'no_action',
    description: 'Call when the text message is not a job record update or command (e.g. casual conversational chatter or unrelated inquiries).',
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

async function fetchAudioPart(url: string): Promise<{ mimeType: string; data: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || 'audio/mp4';
    const buffer = Buffer.from(await res.arrayBuffer());
    return {
      mimeType: contentType.split(';')[0].trim(),
      data: buffer.toString('base64'),
    };
  } catch (err) {
    console.error('Failed to fetch MMS audio part:', err);
    return null;
  }
}

/**
 * Processes an inbound SMS or voice memo from an authenticated contractor owner
 * to perform real-time natural language updates to their job records.
 */
export async function processOwnerFieldIntakeReceipt(
  receiptId: string,
  admin: SupabaseClient,
): Promise<OwnerFieldIntakeResult> {
  const { data: receipt, error: receiptError } = await admin
    .from('sms_webhook_receipts')
    .select('id, provider, provider_event_id, account_id, from_number, to_number, message_body, media_urls, sender_number_id')
    .eq('id', receiptId)
    .maybeSingle();

  if (receiptError || !receipt || !receipt.account_id) {
    return { handled: false, outcome: 'no_action', errorMessage: 'Receipt or account not found' };
  }

  const accountId = receipt.account_id;
  const fromNumber = receipt.from_number;
  const rawBody = String(receipt.message_body ?? '').trim();
  const mediaUrls = Array.isArray(receipt.media_urls) ? (receipt.media_urls as string[]) : [];

  // Check if there is either text or an audio attachment
  if (!rawBody && mediaUrls.length === 0) {
    return { handled: false, outcome: 'no_action', errorMessage: 'Empty message body and no media' };
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return { handled: false, outcome: 'no_action', errorMessage: 'GEMINI_API_KEY is not configured' };
  }

  // Load contractor account info
  const { data: account } = await admin
    .from('accounts')
    .select('id, business_name, alert_phone')
    .eq('id', accountId)
    .maybeSingle();

  const businessName = account?.business_name && account.business_name !== 'My Business'
    ? account.business_name
    : "Let's Get Quoted";

  // Load recent / active contractor jobs for grounding
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
1. Match the contractor's natural language reference (e.g. "Smith job", "Job 102", "the job on Main St", "yesterday's quote") against the active jobs list.
2. If the reference is clear, execute the appropriate tool:
   - "update_job": To mark complete, change status, reschedule, or append notes/updates.
   - "add_quote_line_item": When adding a dollar amount, extra materials, labor, or change order to a quote/job.
   - "add_job_task": To add a checklist task or punch list item.
   - "create_quick_lead": If they are capturing a brand new client inquiry or quote on the road.
3. If the reference is AMBIGUOUS (e.g. multiple jobs match "Miller"), call "report_ambiguity" with a message asking them to clarify which address or job ID.
4. If the message is purely conversational or not a job action, call "no_action".
5. For all confirmations: Keep confirmationMessage short, professional, and within 140 characters (1 SMS segment).`;

  const parts: Part[] = [];

  // If audio media is present, fetch audio for multimodal transcription
  let isVoiceMemo = false;
  for (const url of mediaUrls) {
    if (url.match(/\.(mp3|m4a|wav|aac|ogg|amr|webm)(\?.*)?$/i) || url.includes('/recordings/') || url.includes('/media/')) {
      const audioPart = await fetchAudioPart(url);
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
    parts.push({ text: 'Contractor sent a voice memo. Transcribe and execute any job actions requested in the audio.' });
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

    if (toolName === 'report_ambiguity') {
      const clarifyText = String(args.message ?? 'We found multiple jobs matching that request. Please reply with the address or job ID.');
      // Enqueue clarification SMS to contractor
      await enqueueSmsDelivery({
        accountId,
        phoneNumber: fromNumber,
        body: clarifyText,
        messageKind: 'owner-field-clarification',
        billingCategory: 'owner_alert',
        senderPurpose: 'lgq_shared',
        context: 'owner',
        eventType: 'owner_field_clarification',
        idempotencyKey: `owner-field-ambiguity:${receiptId}`,
      }, admin);

      return {
        handled: true,
        outcome: 'ambiguity_clarification_sent',
        confirmationText: clarifyText,
      };
    }

    let confirmationText = '';
    let targetJobId: string | null = null;

    if (toolName === 'update_job') {
      const jobId = String(args.jobId);
      targetJobId = jobId;
      const status = args.status ? String(args.status) : undefined;
      const appendNotes = args.appendNotes ? String(args.appendNotes) : undefined;
      const scheduledFor = args.scheduledFor ? String(args.scheduledFor) : undefined;
      const scheduledTime = args.scheduledTime ? String(args.scheduledTime) : undefined;
      confirmationText = String(args.confirmationMessage ?? 'Job updated.');

      const { data: existingJob } = await admin
        .from('jobs')
        .select('*')
        .eq('id', jobId)
        .eq('account_id', accountId)
        .maybeSingle();

      if (existingJob) {
        const updatePayload: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };

        if (status) updatePayload.status = status;
        if (scheduledFor) updatePayload.scheduled_for = scheduledFor;
        if (scheduledTime) updatePayload.scheduled_time = scheduledTime;
        if (appendNotes) {
          updatePayload.scope = existingJob.scope
            ? `${existingJob.scope}\n\n[Field Note]: ${appendNotes}`
            : `[Field Note]: ${appendNotes}`;
        }

        await admin
          .from('jobs')
          .update(updatePayload)
          .eq('id', jobId)
          .eq('account_id', accountId);

        // Record in job_feed
        await admin.from('job_feed').insert({
          account_id: accountId,
          job_id: jobId,
          kind: isVoiceMemo ? 'field_voice_note' : 'field_sms_update',
          title: `Field Update: ${appendNotes ? appendNotes.slice(0, 40) : status ?? 'Updated'}`,
          body: appendNotes || `Job status set to ${status}`,
          author: 'Owner (via Field SMS)',
          meta: {
            rawMessage: rawBody,
            mediaUrls,
            isVoiceMemo,
            tool: 'update_job',
          },
        });
      }
    } else if (toolName === 'add_quote_line_item') {
      const jobId = String(args.jobId);
      targetJobId = jobId;
      const label = String(args.label);
      const amount = Number(args.amount);
      const kind = args.kind === 'addon' ? 'addon' : 'base';
      confirmationText = String(args.confirmationMessage ?? `Added ${label} ($${amount})`);

      const { data: existingJob } = await admin
        .from('jobs')
        .select('id, quote_items, quoted_amount')
        .eq('id', jobId)
        .eq('account_id', accountId)
        .maybeSingle();

      if (existingJob) {
        const existingItems: QuoteItem[] = parseQuoteItems(existingJob.quote_items);
        const newItem: QuoteItem = {
          id: randomUUID(),
          label,
          amount,
          kind,
          selected: kind === 'base',
          recommended: false,
        };
        const updatedItems = [...existingItems, newItem];
        const newQuotedAmount = updatedItems
          .filter((i) => i.kind === 'base')
          .reduce((sum, i) => sum + i.amount, 0);

        await admin
          .from('jobs')
          .update({
            quote_items: updatedItems,
            quoted_amount: newQuotedAmount,
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId)
          .eq('account_id', accountId);

        // Record in job_feed
        await admin.from('job_feed').insert({
          account_id: accountId,
          job_id: jobId,
          kind: isVoiceMemo ? 'field_voice_note' : 'field_sms_update',
          title: `Added item: ${label}`,
          body: `Added line item: ${label} ($${amount})`,
          amount,
          author: 'Owner (via Field SMS)',
          meta: {
            rawMessage: rawBody,
            mediaUrls,
            isVoiceMemo,
            tool: 'add_quote_line_item',
          },
        });
      }
    } else if (toolName === 'add_job_task') {
      const jobId = String(args.jobId);
      targetJobId = jobId;
      const title = String(args.title);
      confirmationText = String(args.confirmationMessage ?? `Added task: ${title}`);

      await admin.from('job_tasks').insert({
        account_id: accountId,
        job_id: jobId,
        title,
        done: false,
      });

      await admin.from('job_feed').insert({
        account_id: accountId,
        job_id: jobId,
        kind: isVoiceMemo ? 'field_voice_note' : 'field_sms_update',
        title: `Added checklist task: ${title}`,
        body: title,
        author: 'Owner (via Field SMS)',
        meta: {
          rawMessage: rawBody,
          mediaUrls,
          isVoiceMemo,
          tool: 'add_job_task',
        },
      });
    } else if (toolName === 'create_quick_lead') {
      const clientName = String(args.clientName);
      const clientPhone = args.clientPhone ? String(args.clientPhone) : null;
      const address = args.address ? String(args.address) : null;
      const scope = String(args.scope);
      const amount = args.amount ? Number(args.amount) : 0;
      confirmationText = String(args.confirmationMessage ?? `Created lead for ${clientName}`);

      const newRef = `J-${Date.now().toString().slice(-4)}`;
      const quoteItems: QuoteItem[] = amount > 0 ? [{ id: randomUUID(), label: scope, amount, kind: 'base', selected: true, recommended: false }] : [];

      const { data: newJob } = await admin
        .from('jobs')
        .insert({
          account_id: accountId,
          ref: newRef,
          client_name: clientName,
          client_phone: clientPhone,
          address,
          scope,
          status: 'new_lead',
          quoted_amount: amount,
          quote_items: quoteItems,
        })
        .select('id')
        .single();

      if (newJob) {
        targetJobId = newJob.id;
        await admin.from('job_feed').insert({
          account_id: accountId,
          job_id: newJob.id,
          kind: isVoiceMemo ? 'field_voice_note' : 'field_sms_update',
          title: `Created from Field: ${clientName}`,
          body: `New lead created via Field SMS: ${scope}`,
          author: 'Owner (via Field SMS)',
          meta: {
            rawMessage: rawBody,
            mediaUrls,
            isVoiceMemo,
            tool: 'create_quick_lead',
          },
        });
      }
    }

    if (confirmationText) {
      await enqueueSmsDelivery({
        accountId,
        phoneNumber: fromNumber,
        body: confirmationText,
        messageKind: 'owner-field-update-confirm',
        billingCategory: 'owner_alert',
        senderPurpose: 'lgq_shared',
        context: 'owner',
        eventType: 'owner_field_update_confirm',
        idempotencyKey: `owner-field-confirm:${receiptId}`,
      }, admin);
    }

    return {
      handled: true,
      outcome: 'field_action_applied',
      actionKind: toolName,
      targetJobId,
      confirmationText,
    };
  } catch (err) {
    console.error('Error processing owner field intake via Gemini:', err);
    return {
      handled: false,
      outcome: 'error',
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}
