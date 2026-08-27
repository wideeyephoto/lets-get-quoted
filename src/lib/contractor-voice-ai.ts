import { callModel } from '@/lib/ai-model-call';
import type { QuoteItem } from '@/lib/jobs';

export type ParsedLeadVoiceData = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  projectType?: string | null;
  message?: string | null;
  score?: 'hot' | 'warm' | 'low' | null;
  estimatedHours?: number | null;
  requestedDate?: string | null;
  requestedTime?: string | null;
  flags?: string[];
};

export type ParsedJobVoiceData = {
  scope?: string | null;
  scopeAddition?: string | null;
  quoteItems?: Array<{
    label: string;
    amount: number;
    quantity?: number;
    unitPrice?: number;
    kind?: 'service' | 'material' | 'labor' | 'custom';
  }>;
  scheduledFor?: string | null;
  scheduledTime?: string | null;
  status?: 'new_lead' | 'in_progress' | 'complete' | null;
  feedNote?: string | null;
  tasks?: Array<{ title: string }>;
  costEstimate?: {
    type: 'labor' | 'material';
    description: string;
    amount?: number;
    hours?: number;
  } | null;
  changeOrder?: {
    title: string;
    note: string;
  } | null;
};

export type ContractorVoiceParseResponse = {
  targetType: 'lead' | 'job';
  intent: 'create_lead' | 'update_lead' | 'update_job' | 'create_change_order' | 'log_work';
  leadData?: ParsedLeadVoiceData | null;
  jobData?: ParsedJobVoiceData | null;
  actionSummary: string;
  confidence: number;
  unclearPoints?: string[];
};

export type ContractorVoiceContext = {
  accountId: string;
  targetType?: 'lead' | 'job' | 'auto';
  existingLead?: {
    id: string;
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    projectType?: string | null;
    message?: string | null;
    status?: string | null;
  } | null;
  existingJob?: {
    id: string;
    ref?: string;
    clientName?: string;
    address?: string | null;
    scope?: string | null;
    status?: string;
    scheduledFor?: string | null;
    scheduledTime?: string | null;
    quoteItems?: QuoteItem[];
  } | null;
};

function extractOutputText(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  const record = payload as {
    output_text?: unknown;
    output?: unknown[];
    choices?: Array<{ message?: { content?: string } }>;
  };
  if (typeof record?.output_text === 'string') return record.output_text;
  if (Array.isArray(record?.choices) && typeof record.choices[0]?.message?.content === 'string') {
    return record.choices[0].message.content;
  }
  const message = record?.output?.find(
    (item): item is { type: string; content?: unknown[] } => (item as { type?: string })?.type === 'message',
  );
  const textPart = message?.content?.find(
    (part): part is { type: string; text?: string } => (part as { type?: string })?.type === 'output_text',
  );
  if (typeof textPart?.text === 'string') return textPart.text;
  if (typeof record === 'object' && record !== null && ('targetType' in record || 'intent' in record)) {
    return JSON.stringify(record);
  }
  return '{}';
}

/**
 * Builds instructions for parsing contractor voice speech.
 */
export function buildContractorVoiceInstructions(context: ContractorVoiceContext): string[] {
  const lines: string[] = [
    'You are an expert AI field assistant for specialty trade contractors (roofing, electrical, plumbing, HVAC, masonry, carpentry, painting).',
    'A contractor or technician is speaking while on a jobsite, driving, or after a customer call.',
    'Your goal is to parse their spoken transcript accurately and extract structured fields to create or update a Lead or Job.',
    'Always output valid, well-formed JSON conforming strictly to the requested schema.',
    '',
    `Today's date is: ${new Date().toISOString().split('T')[0]}.`,
    'Interpret relative dates like "tomorrow", "this Friday", "next Tuesday", "Monday morning" relative to today.',
  ];

  if (context.existingLead) {
    lines.push(
      '',
      'CONTEXT - UPDATING EXISTING LEAD:',
      JSON.stringify(context.existingLead, null, 2),
      'Identify whether the contractor is updating contact info, adjusting the scope, setting appointment date/time, or changing lead urgency.',
    );
  } else if (context.existingJob) {
    lines.push(
      '',
      'CONTEXT - UPDATING EXISTING JOB:',
      JSON.stringify(context.existingJob, null, 2),
      'Identify what the contractor wants to update: scope additions, new line items & prices, scheduling date/time, status change (complete / in_progress), tasks, or extra work found (change orders).',
    );
  } else if (context.targetType === 'lead') {
    lines.push(
      '',
      'CONTEXT - CREATING A NEW LEAD:',
      'Extract client name, phone number, address, project type/description, estimated timeline/date, and urgency score (hot/warm/low).',
    );
  } else if (context.targetType === 'job') {
    lines.push(
      '',
      'CONTEXT - JOB UPDATE / WORK LOGGING:',
      'Extract job work scope, line items, schedule times, tasks, and notes.',
    );
  } else {
    lines.push(
      '',
      'CONTEXT - AUTO-DETECT:',
      'Determine whether the speaker is creating/updating a customer Lead, or updating a Job/Work order based on the context of their words.',
    );
  }

  lines.push(
    '',
    'SCHEMA TO RETURN AS RAW JSON:',
    '{',
    '  "targetType": "lead" | "job",',
    '  "intent": "create_lead" | "update_lead" | "update_job" | "create_change_order" | "log_work",',
    '  "leadData": {',
    '    "name": string | null,',
    '    "phone": string | null (normalize if possible, e.g. "555-123-4567"),',
    '    "email": string | null,',
    '    "address": string | null,',
    '    "projectType": string | null,',
    '    "message": string | null,',
    '    "score": "hot" | "warm" | "low" | null,',
    '    "estimatedHours": number | null,',
    '    "requestedDate": "YYYY-MM-DD" | null,',
    '    "requestedTime": string | null,',
    '    "flags": string[]',
    '  },',
    '  "jobData": {',
    '    "scope": string | null (full revised scope if replaced),',
    '    "scopeAddition": string | null (additional bullet or paragraph to append),',
    '    "quoteItems": [',
    '      {',
    '        "label": string,',
    '        "amount": number,',
    '        "quantity": number,',
    '        "unitPrice": number,',
    '        "kind": "service" | "material" | "labor" | "custom"',
    '      }',
    '    ],',
    '    "scheduledFor": "YYYY-MM-DD" | null,',
    '    "scheduledTime": string | null (e.g. "08:00", "13:30"),',
    '    "status": "new_lead" | "in_progress" | "complete" | null,',
    '    "feedNote": string | null (a crisp 1-2 sentence activity log entry),',
    '    "tasks": [ { "title": string } ],',
    '    "costEstimate": { "type": "labor" | "material", "description": string, "amount": number, "hours": number } | null,',
    '    "changeOrder": { "title": string, "note": string } | null',
    '  },',
    '  "actionSummary": string (1 concise sentence explaining what was updated/created),',
    '  "confidence": number (between 0.0 and 1.0),',
    '  "unclearPoints": string[]',
    '}',
  );

  return lines;
}

/**
 * Parses raw contractor voice transcription into structured action data.
 */
export async function parseContractorVoicePrompt(
  transcript: string,
  context: ContractorVoiceContext,
): Promise<ContractorVoiceParseResponse> {
  const cleanTranscript = (transcript || '').trim();
  if (!cleanTranscript) {
    throw new Error('No voice transcript provided.');
  }

  const instructions = buildContractorVoiceInstructions(context);

  const modelPayload = {
    model: 'gpt-4o-mini',
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: instructions.join('\n'),
      },
      {
        role: 'user',
        content: `Contractor spoken voice transcript:\n"""\n${cleanTranscript}\n"""`,
      },
    ],
  };

  const response = await callModel(modelPayload, {
    accountId: context.accountId,
    kind: 'contractor_voice_assist',
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`AI model call failed (${response.status}): ${errText}`);
  }

  const rawJson = await response.json();
  const parsedText = extractOutputText(rawJson);

  let result: ContractorVoiceParseResponse;
  try {
    result = JSON.parse(parsedText);
  } catch (err) {
    // If output is direct JSON
    if (typeof rawJson === 'object' && rawJson !== null && 'targetType' in rawJson) {
      result = rawJson as ContractorVoiceParseResponse;
    } else {
      throw new Error(`Failed to parse AI response as JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Sanitize defaults
  return {
    targetType: result.targetType || (context.targetType === 'job' ? 'job' : 'lead'),
    intent: result.intent || 'update_lead',
    leadData: result.leadData || null,
    jobData: result.jobData || null,
    actionSummary: result.actionSummary || 'Parsed voice instructions.',
    confidence: typeof result.confidence === 'number' ? result.confidence : 0.85,
    unclearPoints: Array.isArray(result.unclearPoints) ? result.unclearPoints : [],
  };
}
