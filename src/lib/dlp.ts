/**
 * Data Loss Prevention (DLP) Guards
 *
 * Enforces server-boundary rejection of sensitive taxpayer identifiers (SSN, EIN)
 * and payment card PANs from free-text fields (notes, descriptions, CSV imports).
 */

export type SensitiveDataType = 'ssn' | 'ein' | 'payment_card';

export type DlpFinding = Readonly<{
  type: SensitiveDataType;
  maskedMatch: string;
  index: number;
}>;

export class DlpValidationError extends Error {
  readonly findings: readonly DlpFinding[];
  readonly fieldName: string;

  constructor(fieldName: string, findings: readonly DlpFinding[]) {
    const labels = [...new Set(findings.map((f) => {
      if (f.type === 'ssn') return 'Social Security Number (SSN)';
      if (f.type === 'ein') return 'Employer Identification Number (EIN)';
      return 'Payment Card Number';
    }))].join(', ');

    super(
      `${fieldName} contains sensitive confidential data (${labels}). For security and compliance, sensitive taxpayer and card data must not be entered into general notes or descriptions.`,
    );
    this.name = 'DlpValidationError';
    this.fieldName = fieldName;
    this.findings = findings;
  }
}

// Formatted SSN: XXX-XX-XXXX or XXX XX XXXX (excluding invalid area numbers 000, 666, 900-999)
const FORMATTED_SSN = /\b(?!(?:000|666|9\d\d))\d{3}[- ](?!(?:00))\d{2}[- ](?!(?:0000))\d{4}\b/g;

// Formatted EIN: XX-XXXXXXX
const FORMATTED_EIN = /\b\d{2}-\d{7}\b/g;

// Labeled SSN/EIN/TIN with 9 continuous digits: e.g. "SSN: 123456789", "TIN 123456789"
const LABELED_NINE_DIGIT = /\b(?:ssn|ein|tin|tax\s*id|social\s*security)\s*[:=]?\s*(\d{9})\b/gi;

function luhnCheck(cardDigits: string): boolean {
  const digits = cardDigits.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

const CARD_CANDIDATE = /\b(?:\d[ -]*?){13,19}\b/g;

/**
 * Scans a text string for sensitive identifiers.
 */
export function scanForSensitiveIdentifiers(text: string): DlpFinding[] {
  if (!text || typeof text !== 'string') return [];

  const findings: DlpFinding[] = [];

  // 1. Formatted SSNs
  let match: RegExpExecArray | null;
  const ssnRegex = new RegExp(FORMATTED_SSN);
  while ((match = ssnRegex.exec(text)) !== null) {
    const raw = match[0];
    findings.push({
      type: 'ssn',
      maskedMatch: `•••-••-${raw.slice(-4)}`,
      index: match.index,
    });
  }

  // 2. Formatted EINs
  const einRegex = new RegExp(FORMATTED_EIN);
  while ((match = einRegex.exec(text)) !== null) {
    const raw = match[0];
    findings.push({
      type: 'ein',
      maskedMatch: `••-•••${raw.slice(-4)}`,
      index: match.index,
    });
  }

  // 3. Labeled 9-digit TINs
  const labeledRegex = new RegExp(LABELED_NINE_DIGIT);
  while ((match = labeledRegex.exec(text)) !== null) {
    const digits = match[1];
    findings.push({
      type: 'ssn',
      maskedMatch: `•••••${digits.slice(-4)}`,
      index: match.index,
    });
  }

  // 4. Payment card PANs
  const cardRegex = new RegExp(CARD_CANDIDATE);
  while ((match = cardRegex.exec(text)) !== null) {
    const raw = match[0];
    const digits = raw.replace(/\D/g, '');
    if (digits.length >= 13 && digits.length <= 19 && luhnCheck(digits)) {
      findings.push({
        type: 'payment_card',
        maskedMatch: `••••••••••••${digits.slice(-4)}`,
        index: match.index,
      });
    }
  }

  return findings;
}

/**
 * Returns true if sensitive identifiers are detected.
 */
export function containsSensitiveIdentifiers(text: string): boolean {
  return scanForSensitiveIdentifiers(text).length > 0;
}

/**
 * Asserts that the input contains no sensitive identifiers. Throws DlpValidationError on violation.
 */
export function assertNoSensitiveIdentifiers(input: unknown, fieldName = 'This field'): void {
  if (!input) return;

  if (typeof input === 'string') {
    const findings = scanForSensitiveIdentifiers(input);
    if (findings.length > 0) {
      throw new DlpValidationError(fieldName, findings);
    }
    return;
  }

  if (Array.isArray(input)) {
    for (let i = 0; i < input.length; i++) {
      assertNoSensitiveIdentifiers(input[i], `${fieldName}[${i}]`);
    }
    return;
  }

  if (typeof input === 'object') {
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      assertNoSensitiveIdentifiers(value, `${fieldName}.${key}`);
    }
  }
}

/**
 * Redacts sensitive identifiers from text for safe logging or error reporting.
 */
export function redactSensitiveIdentifiers(text: string): string {
  if (!text || typeof text !== 'string') return text;

  let redacted = text.replace(FORMATTED_SSN, '[REDACTED_SSN]');
  redacted = redacted.replace(FORMATTED_EIN, '[REDACTED_EIN]');
  redacted = redacted.replace(LABELED_NINE_DIGIT, (match) => {
    return match.replace(/\d{9}/, '[REDACTED_TIN]');
  });
  redacted = redacted.replace(CARD_CANDIDATE, (match) => {
    const digits = match.replace(/\D/g, '');
    if (digits.length >= 13 && digits.length <= 19 && luhnCheck(digits)) {
      return '[REDACTED_CARD]';
    }
    return match;
  });

  return redacted;
}
