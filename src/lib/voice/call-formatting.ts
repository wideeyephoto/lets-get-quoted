/** `1:05`, or `—` when the receipt could not say. */
export function formatCallLength(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—';
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export interface StructuredVoiceSummary {
  caller_name?: string | null;
  caller_phone?: string | null;
  service_address?: string | null;
  work_requested?: string | null;
  urgency?: 'emergency' | 'urgent' | 'normal' | null;
  is_emergency?: boolean;
  hazard_type?: string | null;
  requested_slot?: string | null;
  booked_slot?: string | null;
  transfer_requested?: boolean;
  follow_up_action?: 'callback_required' | 'booked' | 'quote_needed' | 'none' | null;
  confidence?: number;
}

export interface ParsedVoiceCallSummary {
  structured: StructuredVoiceSummary | null;
  displaySummary: string;
  callerName: string | null;
  workRequested: string | null;
  serviceAddress: string | null;
  slot: string | null;
  isBooked: boolean;
}

export function parseVoiceCallSummary(rawSummary: string | null): ParsedVoiceCallSummary {
  if (!rawSummary || !rawSummary.trim()) {
    return {
      structured: null,
      displaySummary: '',
      callerName: null,
      workRequested: null,
      serviceAddress: null,
      slot: null,
      isBooked: false,
    };
  }

  const trimmed = rawSummary.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as StructuredVoiceSummary;
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        const callerName = parsed.caller_name?.trim() || null;
        const workRequested = parsed.work_requested?.trim() || null;
        const serviceAddress = parsed.service_address?.trim() || null;
        const slot = parsed.booked_slot?.trim() || parsed.requested_slot?.trim() || null;
        const isBooked = Boolean(parsed.booked_slot || parsed.follow_up_action === 'booked');

        const parts: string[] = [];
        if (workRequested) parts.push(workRequested);
        if (serviceAddress) parts.push(`at ${serviceAddress}`);
        if (slot) parts.push(isBooked ? `(Booked: ${slot})` : `(Requested: ${slot})`);
        if (parsed.hazard_type) parts.push(`[Hazard: ${parsed.hazard_type}]`);

        const displaySummary = parts.length > 0 ? parts.join(' ') : (workRequested || trimmed);

        return {
          structured: parsed,
          displaySummary,
          callerName,
          workRequested,
          serviceAddress,
          slot,
          isBooked,
        };
      }
    } catch {
      // Fall through to plain text if JSON.parse fails
    }
  }

  return {
    structured: null,
    displaySummary: trimmed,
    callerName: null,
    workRequested: trimmed,
    serviceAddress: null,
    slot: null,
    isBooked: false,
  };
}

export type VoiceCallOutcome =
  | 'in_progress'
  | 'ai_handled'
  | 'transfer_attempted'
  | 'transferred_and_answered'
  | 'caller_abandoned'
  | 'no_input'
  | 'voicemail_fallback'
  | 'provider_failure'
  | 'completed'
  | 'transferred'
  | 'voicemail'
  | 'abandoned'
  | 'failed'
  | 'unknown';

export type VoiceCallDisposition =
  | 'unreviewed'
  | 'needs_callback'
  | 'callback_scheduled'
  | 'contacted'
  | 'qualified'
  | 'converted'
  | 'not_a_fit'
  | 'spam'
  | 'resolved';

export function formatOutcomeLabel(outcome: VoiceCallOutcome): string {
  switch (outcome) {
    case 'ai_handled':
      return 'AI Handled';
    case 'transfer_attempted':
      return 'Transfer Attempted';
    case 'transferred_and_answered':
    case 'transferred':
      return 'Transferred';
    case 'caller_abandoned':
    case 'abandoned':
      return 'Caller Abandoned';
    case 'no_input':
      return 'No Input';
    case 'voicemail_fallback':
    case 'voicemail':
      return 'Voicemail';
    case 'in_progress':
      return 'In Progress';
    case 'provider_failure':
    case 'failed':
      return 'Provider Failure';
    case 'completed':
      return 'Completed';
    default:
      return 'Unknown';
  }
}

export function formatDispositionLabel(disposition: VoiceCallDisposition): string {
  switch (disposition) {
    case 'unreviewed':
      return 'Unreviewed';
    case 'needs_callback':
      return 'Needs Callback';
    case 'callback_scheduled':
      return 'Callback Scheduled';
    case 'contacted':
      return 'Contacted';
    case 'qualified':
      return 'Qualified';
    case 'converted':
      return 'Converted';
    case 'not_a_fit':
      return 'Not a Fit';
    case 'spam':
      return 'Spam';
    case 'resolved':
      return 'Resolved';
    default:
      return 'Unreviewed';
  }
}

/**
 * Detects if a transcript turn's content represents internal backend artifacts,
 * SWAIG/SWML tool executions, or post-prompt structured intake JSON summaries
 * rather than natural human conversation.
 */
export function isBackendJargonOrJson(rawContent: string): boolean {
  const text = rawContent.trim();
  if (!text) return true;

  // 1. Strip markdown code fences if present (e.g. ```json ... ``` or ``` ... ```)
  const unquoted = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  // 2. Direct JSON object/array test
  if (
    (unquoted.startsWith('{') && unquoted.endsWith('}')) ||
    (unquoted.startsWith('[') && unquoted.endsWith(']'))
  ) {
    try {
      const parsed = JSON.parse(unquoted);
      if (typeof parsed === 'object' && parsed !== null) {
        return true;
      }
    } catch {
      // Not strictly valid JSON, but let other checks catch malformed tool/jargon strings
    }
  }

  // 3. Known tool / schema / SWAIG signatures
  const lower = text.toLowerCase();
  if (
    lower.startsWith('swaig') ||
    lower.includes('{"function"') ||
    lower.includes('"function":') ||
    lower.includes('{"argument"') ||
    lower.includes('"argument":') ||
    lower.includes('{"response"') ||
    lower.includes('"response":') ||
    lower.includes('{"action"') ||
    lower.includes('"action":') ||
    lower.includes('{"output"') ||
    lower.includes('"output":') ||
    lower.includes('{"result"') ||
    lower.includes('"result":') ||
    lower.includes('{"swml"') ||
    lower.includes('"swml":') ||
    lower.includes('{"status"') ||
    lower.includes('"status":')
  ) {
    if (text.includes('{') || text.includes('}') || text.includes('(') || lower.startsWith('swaig')) {
      return true;
    }
  }

  // 4. Post-prompt structured summary extraction signatures
  // (e.g., caller_name, work_requested, hazard_type, follow_up_action)
  const structuredFieldCount = [
    'caller_name',
    'caller_phone',
    'service_address',
    'work_requested',
    'hazard_type',
    'follow_up_action',
    'requested_slot',
    'booked_slot',
    'transfer_requested',
  ].filter((key) => lower.includes(key)).length;

  if (structuredFieldCount >= 2) {
    return true;
  }

  // 5. Embedded JSON block (e.g., "Summary: { ... }" or "{ ... } (end of call)")
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (typeof parsed === 'object' && parsed !== null) {
        const remaining = text.replace(jsonMatch[0], '').trim();
        if (remaining.length < 50 || lower.includes('summary') || lower.includes('intake') || lower.includes('post_prompt')) {
          return true;
        }
      }
    } catch {
      // not valid JSON
    }
  }

  return false;
}

