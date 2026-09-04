/**
 * Field Intake Quality & Confidence Evaluation Engine
 *
 * Replaces synthetic precision numbers with deterministic, explainable
 * extraction quality scoring and actionable human-in-the-loop status tiers.
 */

export type FieldConfidenceLevel = 'ready' | 'review' | 'low';

export interface FieldConfidenceVerdict {
  score: number; // 0 to 100
  level: FieldConfidenceLevel;
  label: string; // e.g. "Ready to Apply", "Needs Review", "Low Clarity"
  badgeText: string; // e.g. "✓ Ready to Apply", "⚠️ Needs Review", "❓ Low Clarity"
  reasons: string[];
  isActionable: boolean;
}

export interface FieldNoteEvaluationOptions {
  type?: 'sms' | 'voice' | 'receipt';
  matchedJobRef?: string;
  extractedItemsCount?: number;
  isLead?: boolean;
  hasPhone?: boolean;
}

const US_PHONE_REGEX = /(?:\+?1[-. ]?)?\(?([2-9][0-9]{2})\)?[-. ]?([2-9][0-9]{2})[-. ]?([0-9]{4})/;
const DOLLAR_AMOUNT_REGEX = /\$\s*(\d+(?:,\d{3})*(?:\.\d{2})?)|\b(\d+)\s*(?:dollars|bucks)\b/i;
const SCHEDULE_TIME_REGEX = /\b(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)|morning|afternoon|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tues|wed|thu|fri|sat|sun)\b/i;
const TRADE_ACTION_REGEX = /\b(?:change order|inspection|rough|passed|punch list|quote|estimate|repaired|replaced|installed|caulk|drywall|wire|breaker|panel|freon|refrigerant|drain|roof|shingle|decking|paint|trim|subdecking|gfci|pex|capacitor)\b/i;
const CLIENT_OR_JOB_REGEX = /\b(?:Job\s+J-\d+|New Lead[:\s]+[A-Z][a-z]+|Miller|Johnson|Smith|Davis|Wilson|Taylor|Clark|Jenkins|Adams|Vance|White|Scott|Parker)\b/i;

/**
 * Evaluate inbound field text or transcript to determine extraction quality,
 * confidence score, and operational readiness status.
 */
export function evaluateFieldNoteConfidence(
  rawText: string,
  options: FieldNoteEvaluationOptions = {}
): FieldConfidenceVerdict {
  const text = (rawText || '').trim();
  if (!text) {
    return {
      score: 0,
      level: 'low',
      label: 'Low Clarity',
      badgeText: '❓ Low Clarity',
      reasons: ['No message body or recording found'],
      isActionable: false,
    };
  }

  let score = 25; // baseline
  const reasons: string[] = [];

  const lower = text.toLowerCase();
  const isLeadCandidate =
    options.isLead ||
    lower.includes('lead') ||
    lower.includes('new customer') ||
    lower.includes('prospect');

  // 1. Phone number presence
  const phoneMatch = Boolean(text.match(US_PHONE_REGEX) || options.hasPhone);
  if (phoneMatch) {
    score += 25;
    reasons.push('Verified 10-digit phone number');
  } else if (isLeadCandidate) {
    score -= 20;
    reasons.push('Missing callback phone for new lead');
  }

  // 2. Client / Job Identification
  const hasJobRef = Boolean(options.matchedJobRef && options.matchedJobRef.trim());
  const clientMatch = text.match(CLIENT_OR_JOB_REGEX);
  if (hasJobRef || clientMatch) {
    score += 20;
    reasons.push(
      hasJobRef
        ? `Matched to existing job: ${options.matchedJobRef}`
        : 'Client or job reference identified'
    );
  } else {
    score -= 10;
    reasons.push('Unlinked client or job identity');
  }

  // 3. Actionable Scope & Trade Task
  const tradeMatch = text.match(TRADE_ACTION_REGEX);
  if (tradeMatch) {
    score += 20;
    reasons.push('Clear trade service or milestone action parsed');
  }

  // 4. Financials / Dollar Values (or Receipt type)
  const dollarMatch = text.match(DOLLAR_AMOUNT_REGEX);
  if (dollarMatch) {
    score += 15;
    reasons.push(`Explicit pricing/cost detected ($${dollarMatch[1] || dollarMatch[2]})`);
  } else if (options.type === 'receipt') {
    score -= 25;
    reasons.push('Missing clear total amount on receipt');
  }

  // 5. Scheduling Window / Time
  const timeMatch = text.match(SCHEDULE_TIME_REGEX);
  if (timeMatch) {
    score += 15;
    reasons.push(`Target schedule window parsed (${timeMatch[0]})`);
  }

  // 6. Extracted Items Bonus
  if (options.extractedItemsCount && options.extractedItemsCount >= 2) {
    score += 5;
    reasons.push(`Extracted ${options.extractedItemsCount} structured field updates`);
  }

  // 7. Length and brevity checks
  if (text.length < 20 && !phoneMatch && !dollarMatch) {
    score -= 15;
    reasons.push('Note too short or lacking context');
  }

  // Clamp score between 10 and 99 (never claiming 100% infallible precision)
  const normalizedScore = Math.max(10, Math.min(99, Math.round(score)));

  let level: FieldConfidenceLevel = 'ready';
  let label = 'Ready to Apply';
  let badgeText = '✓ Ready to Apply';

  if (normalizedScore >= 80) {
    level = 'ready';
    label = 'Ready to Apply';
    badgeText = '✓ Ready to Apply';
  } else if (normalizedScore >= 55) {
    level = 'review';
    label = 'Needs Review';
    badgeText = '⚠️ Needs Review';
  } else {
    level = 'low';
    label = 'Low Clarity';
    badgeText = '❓ Low Clarity';
  }

  return {
    score: normalizedScore,
    level,
    label,
    badgeText,
    reasons,
    isActionable: level === 'ready' || level === 'review',
  };
}
