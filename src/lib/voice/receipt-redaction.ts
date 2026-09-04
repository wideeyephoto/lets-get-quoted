import type { VoiceReceipt } from '@/lib/voice/provider';

const REDACTED = '[REDACTED]';
const MAX_DEPTH = 8;
const MAX_NODES = 2_000;
const MAX_ARRAY_ITEMS = 100;
const MAX_OBJECT_KEYS = 100;
const MAX_STRING_LENGTH = 20_000;
// Every supported six-token OTP form is far shorter than this window. Scan a
// bounded suffix past the persisted string limit so truncation cannot retain a
// prefix of a code that crosses the 20k boundary.
const OTP_REDACTION_LOOKAHEAD = 256;
const SPOKEN_DIGIT = '(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)';
const OTP_CONTEXT = '(?:authorization(?:\\s+code)?|verification(?:\\s+code)?|security(?:\\s+code)?|one[ -]?time(?:\\s+(?:code|password|passcode))?|otp(?:\\s+code)?|pin(?:\\s+code)?|passcode|code)';
const CONTEXTUAL_OTP = new RegExp(
  `(${OTP_CONTEXT}\\b(?:\\s+(?:is|was|equals))?\\s*(?:[:#=-]\\s*)?)(?:(?:[0-9][\\s,-]*){5}[0-9](?![\\s,-]*[0-9])|${SPOKEN_DIGIT}(?:[\\s,-]+${SPOKEN_DIGIT}){5}(?![\\s,-]+${SPOKEN_DIGIT}\\b))`,
  'gi',
);
// Treat a complete numeric/separator run as one unit. Counting the digits in
// the maximal run catches bare grouped OTPs (for example, 123-456 or
// 12 34 56) without redacting a complete ten-digit phone number or matching
// only the trailing six digits of one.
const NUMERIC_DIGIT_RUN = /[0-9](?:[0-9\s,./-]*[0-9])?/g;
const SPOKEN_DIGIT_RUN = new RegExp(
  `\\b${SPOKEN_DIGIT}\\b(?:[\\s,-]+${SPOKEN_DIGIT}\\b)*`,
  'gi',
);
const SECRET_FIELD_NAMES = new Set([
  'code',
  'otp',
  'pin',
  'verification_code',
  'authorization_code',
  'one_time_code',
  'one_time_password',
]);

function truncateRedactedVoiceText(value: string): string {
  let end = MAX_STRING_LENGTH;
  const markerStart = value.lastIndexOf(REDACTED, end);
  if (markerStart >= 0 && markerStart + REDACTED.length > end) {
    // Never split the replacement marker created for a secret that crossed the
    // source boundary. The fixed marker is the only permitted bounded overrun.
    end = markerStart + REDACTED.length;
  }
  return `${value.slice(0, end)} [TRUNCATED]`;
}

/** Remove common typed and ASR-rendered OTP forms without damaging phone numbers. */
export function redactVoiceOtpText(value: string): string {
  const truncated = value.length > MAX_STRING_LENGTH;
  const bounded = truncated
    ? value.slice(0, MAX_STRING_LENGTH + OTP_REDACTION_LOOKAHEAD)
    : value;
  const redacted = bounded
    .replace(CONTEXTUAL_OTP, `$1${REDACTED}`)
    .replace(NUMERIC_DIGIT_RUN, (run) => (
      run.replace(/[^0-9]/g, '').length === 6 ? REDACTED : run
    ))
    // Inspect each maximal ASR number-word run as a unit. Exactly six tokens
    // is an OTP; a ten-token phone number (or any other length) stays intact.
    .replace(SPOKEN_DIGIT_RUN, (run) => (
      run.split(/[\s,-]+/).length === 6 ? REDACTED : run
    ));
  return truncated ? truncateRedactedVoiceText(redacted) : redacted;
}

type SanitizeState = { nodes: number };

function sanitizeValue(
  value: unknown,
  state: SanitizeState,
  depth: number,
  key: string | null,
): unknown {
  const normalizedKey = key
    ?.trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[\s-]+/g, '_') ?? null;
  if (normalizedKey && SECRET_FIELD_NAMES.has(normalizedKey)) return REDACTED;
  if (typeof value === 'string') return redactVoiceOtpText(value);
  if (typeof value === 'number') {
    if (Number.isInteger(value) && value >= 100_000 && value <= 999_999) return REDACTED;
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'boolean' || value === null) return value;
  if (value === undefined) return null;
  if (depth >= MAX_DEPTH || state.nodes >= MAX_NODES) return REDACTED;

  state.nodes += 1;
  if (Array.isArray(value)) {
    return Object.freeze(value.slice(0, MAX_ARRAY_ITEMS).map((entry) => (
      sanitizeValue(entry, state, depth + 1, null)
    )));
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .slice(0, MAX_OBJECT_KEYS)
      .map(([entryKey, entry]) => [
        entryKey,
        sanitizeValue(entry, state, depth + 1, entryKey),
      ] as const);
    return Object.freeze(Object.fromEntries(entries));
  }
  return null;
}

/**
 * Sanitize model/provider JSON with fixed recursion, node, array, key, and
 * string bounds. An exact `code` argument is always removed, even when it is
 * not formatted as six digits.
 */
export function sanitizeVoiceReceiptValue(value: unknown): unknown {
  return sanitizeValue(value, { nodes: 0 }, 0, null);
}

/** Provider-neutral receipt defense used both at ingest and at settlement. */
export function sanitizeVoiceReceipt(receipt: VoiceReceipt): VoiceReceipt {
  const structured = receipt.structuredPostPrompt == null
    ? null
    : sanitizeVoiceReceiptValue(receipt.structuredPostPrompt);
  const structuredPostPrompt = structured && typeof structured === 'object' && !Array.isArray(structured)
    ? structured as Readonly<Record<string, unknown>>
    : null;
  const callLog = receipt.callLog == null
    ? null
    : Object.freeze(receipt.callLog.slice(0, MAX_ARRAY_ITEMS).map((turn) => Object.freeze({
      role: turn.role == null ? null : redactVoiceOtpText(turn.role),
      content: redactVoiceOtpText(turn.content),
      timestamp: turn.timestamp,
    })));

  return Object.freeze({
    ...receipt,
    summary: receipt.summary == null ? null : redactVoiceOtpText(receipt.summary),
    structuredPostPrompt,
    callLog,
  });
}
