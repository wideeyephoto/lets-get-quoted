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

