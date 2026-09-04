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

