export interface CarrierComplianceResult {
  isCompliant: boolean;
  score: number; // 0 - 100
  violations: string[];
  warnings: string[];
  hasRequiredOptOut: boolean;
  hasBusinessIdentifier: boolean;
  safeModifiedCopy?: string;
}

const FORBIDDEN_CARRIER_KEYWORDS = /\b(cannabis|weed|cbd|thc|loan|fast cash|crypto|forex|viagra|gambling|casino)\b/i;

/**
 * Pre-flight compliance checker for outgoing 10DLC SMS broadcasts and speed-to-lead copy
 */
export function auditSmsCarrierCompliance(copy: string, businessName?: string): CarrierComplianceResult {
  const violations: string[] = [];
  const warnings: string[] = [];
  const lower = copy.toLowerCase();

  // 1. Check prohibited SHAFT / carrier blocked terms
  const match = copy.match(FORBIDDEN_CARRIER_KEYWORDS);
  if (match) {
    violations.push(`Contains carrier prohibited keyword: "${match[0]}"`);
  }

  // 2. Check required STOP opt-out phrasing
  const hasRequiredOptOut = lower.includes('stop') || lower.includes('opt out') || lower.includes('unsubscribe');
  if (!hasRequiredOptOut) {
    violations.push('Missing mandatory carrier opt-out phrasing (e.g. "Reply STOP to cancel")');
  }

  // 3. Check business identification
  const hasBusinessIdentifier = Boolean(businessName && lower.includes(businessName.toLowerCase())) || lower.includes('this is ');
  if (!hasBusinessIdentifier) {
    warnings.push('Recommended: explicitly state business name in first 100 characters');
  }

  const isCompliant = violations.length === 0;
  const score = isCompliant ? (warnings.length === 0 ? 100 : 85) : Math.max(20, 70 - violations.length * 25);

  let safeModifiedCopy = copy;
  if (!hasRequiredOptOut) {
    safeModifiedCopy = `${copy.trim()} Reply STOP to opt out.`;
  }

  return {
    isCompliant,
    score,
    violations,
    warnings,
    hasRequiredOptOut,
    hasBusinessIdentifier,
    safeModifiedCopy: isCompliant ? undefined : safeModifiedCopy,
  };
}
