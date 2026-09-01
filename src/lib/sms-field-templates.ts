/**
 * Deterministic ASCII confirmation templates for field intake SMS.
 *
 * CRITICAL CARRIER INVARIANT:
 * Every character must belong to the GSM 7-bit basic character set.
 * Emojis, curly quotes, and em-dashes silently promote the entire SMS
 * to UCS-2 (lowering the segment limit from 160 to 70 characters and
 * multiplying carrier billing costs).
 */

// Clean any accidental non-GSM7 characters to pure ASCII
export function sanitizeGsm7Text(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[—–]/g, '-')
    .replace(/[^\x20-\x7E\r\n]/g, '')
    .trim();
}

export function attachFieldReviewLink(baseText: string, reviewUrl?: string): string {
  const cleanBase = sanitizeGsm7Text(baseText);
  if (!reviewUrl) return cleanBase;
  const cleanUrl = sanitizeGsm7Text(reviewUrl);
  return sanitizeGsm7Text(`${cleanBase} Review: ${cleanUrl}`);
}

export function formatFieldNoteConfirmation(ref: string, clientName: string, reviewUrl?: string): string {
  const cleanRef = sanitizeGsm7Text(ref);
  const cleanName = sanitizeGsm7Text(clientName);
  const base = `[LGQ] ${cleanRef} (${cleanName}): Logged field note.`;
  return attachFieldReviewLink(base, reviewUrl);
}

export function formatCrewNoteConfirmation(ref: string, clientName: string, crewName: string, reviewUrl?: string): string {
  const cleanRef = sanitizeGsm7Text(ref);
  const cleanName = sanitizeGsm7Text(clientName);
  const cleanCrew = sanitizeGsm7Text(crewName);
  const base = `[LGQ] ${cleanRef} (${cleanName}): Logged field note from ${cleanCrew}.`;
  return attachFieldReviewLink(base, reviewUrl);
}

export function formatFieldCostConfirmation(
  ref: string,
  clientName: string,
  amount: number,
  category: string,
  reviewUrl?: string,
): string {
  const cleanRef = sanitizeGsm7Text(ref);
  const cleanName = sanitizeGsm7Text(clientName);
  const cleanCat = sanitizeGsm7Text(category || 'material');
  const base = `[LGQ] ${cleanRef} (${cleanName}): Logged $${amount.toFixed(2)} ${cleanCat} cost.`;
  return attachFieldReviewLink(base, reviewUrl);
}

export function formatFieldReceiptConfirmation(
  ref: string,
  clientName: string,
  amount: number,
  vendor?: string,
  summary?: string,
  reviewUrl?: string,
): string {
  const cleanRef = sanitizeGsm7Text(ref);
  const cleanName = sanitizeGsm7Text(clientName);
  const cleanVendor = vendor ? sanitizeGsm7Text(vendor) : '';
  const cleanSummary = summary ? sanitizeGsm7Text(summary) : '';
  
  if (cleanVendor && cleanSummary) {
    const text = `[LGQ] ${cleanRef} (${cleanName}): Logged $${amount.toFixed(2)} ${cleanVendor} receipt (${cleanSummary}).`;
    if (!reviewUrl && text.length <= 160) return sanitizeGsm7Text(text);
    if (reviewUrl) return attachFieldReviewLink(text, reviewUrl);
  }
  if (cleanVendor) {
    const text = `[LGQ] ${cleanRef} (${cleanName}): Logged $${amount.toFixed(2)} ${cleanVendor} receipt.`;
    if (!reviewUrl && text.length <= 160) return sanitizeGsm7Text(text);
    if (reviewUrl) return attachFieldReviewLink(text, reviewUrl);
  }
  const base = `[LGQ] ${cleanRef} (${cleanName}): Logged $${amount.toFixed(2)} material receipt.`;
  return attachFieldReviewLink(base, reviewUrl);
}

export function formatCrewCostConfirmation(
  ref: string,
  clientName: string,
  amount: number,
  category: string,
  crewName: string,
  reviewUrl?: string,
): string {
  const cleanRef = sanitizeGsm7Text(ref);
  const cleanName = sanitizeGsm7Text(clientName);
  const cleanCat = sanitizeGsm7Text(category || 'material');
  const cleanCrew = sanitizeGsm7Text(crewName);
  const base = `[LGQ] ${cleanRef} (${cleanName}): Logged $${amount.toFixed(2)} ${cleanCat} cost from ${cleanCrew}.`;
  return attachFieldReviewLink(base, reviewUrl);
}

export function formatCrewReceiptConfirmation(
  ref: string,
  clientName: string,
  amount: number,
  vendor: string,
  crewName: string,
  reviewUrl?: string,
): string {
  const cleanRef = sanitizeGsm7Text(ref);
  const cleanName = sanitizeGsm7Text(clientName);
  const cleanVendor = sanitizeGsm7Text(vendor || 'material');
  const cleanCrew = sanitizeGsm7Text(crewName);
  const base = `[LGQ] ${cleanRef} (${cleanName}): Logged $${amount.toFixed(2)} ${cleanVendor} receipt from ${cleanCrew}.`;
  return attachFieldReviewLink(base, reviewUrl);
}

export function formatFieldTaskConfirmation(
  ref: string,
  clientName: string,
  taskTitle: string,
  reviewUrl?: string,
): string {
  const cleanRef = sanitizeGsm7Text(ref);
  const cleanName = sanitizeGsm7Text(clientName);
  const cleanTask = sanitizeGsm7Text(taskTitle).slice(0, 50);
  const base = `[LGQ] ${cleanRef} (${cleanName}): Added task "${cleanTask}".`;
  return attachFieldReviewLink(base, reviewUrl);
}

export function formatCrewTaskConfirmation(
  ref: string,
  clientName: string,
  taskTitle: string,
  crewName: string,
  reviewUrl?: string,
): string {
  const cleanRef = sanitizeGsm7Text(ref);
  const cleanName = sanitizeGsm7Text(clientName);
  const cleanTask = sanitizeGsm7Text(taskTitle).slice(0, 40);
  const cleanCrew = sanitizeGsm7Text(crewName);
  const base = `[LGQ] ${cleanRef} (${cleanName}): Added task "${cleanTask}" from ${cleanCrew}.`;
  return attachFieldReviewLink(base, reviewUrl);
}

export function formatFieldTaskCompletedConfirmation(
  ref: string,
  clientName: string,
  taskTitle: string,
  crewName?: string,
  reviewUrl?: string,
): string {
  const cleanRef = sanitizeGsm7Text(ref);
  const cleanName = sanitizeGsm7Text(clientName);
  const cleanTask = sanitizeGsm7Text(taskTitle).slice(0, 40);
  const fromClause = crewName ? ` by ${sanitizeGsm7Text(crewName)}` : '';
  const base = `[LGQ] ${cleanRef} (${cleanName}): Marked task "${cleanTask}" completed${fromClause}.`;
  return attachFieldReviewLink(base, reviewUrl);
}

export function formatFieldLeadConfirmation(clientName: string, reviewUrl?: string): string {
  const cleanName = sanitizeGsm7Text(clientName);
  const base = `[LGQ] Created new lead for ${cleanName}.`;
  return attachFieldReviewLink(base, reviewUrl);
}

export function formatFieldScheduleConfirmation(ref: string, clientName: string, when: string, reviewUrl?: string): string {
  const cleanRef = sanitizeGsm7Text(ref);
  const cleanName = sanitizeGsm7Text(clientName);
  const cleanWhen = sanitizeGsm7Text(when);
  const base = `[LGQ] ${cleanRef} (${cleanName}): Scheduled for ${cleanWhen}.`;
  return attachFieldReviewLink(base, reviewUrl);
}

export function formatFieldClientConfirmation(clientName: string, reviewUrl?: string): string {
  const cleanName = sanitizeGsm7Text(clientName);
  const base = `[LGQ] Updated client profile for ${cleanName}.`;
  return attachFieldReviewLink(base, reviewUrl);
}

export function formatFieldCrewConfirmation(ref: string, clientName: string, crewName: string, reviewUrl?: string): string {
  const cleanRef = sanitizeGsm7Text(ref);
  const cleanName = sanitizeGsm7Text(clientName);
  const cleanCrew = sanitizeGsm7Text(crewName);
  const base = `[LGQ] Assigned ${cleanCrew} to ${cleanRef} (${cleanName}).`;
  return attachFieldReviewLink(base, reviewUrl);
}

export function formatFieldAmbiguityClarification(candidates: Array<{ ref: string; address?: string | null }>): string {
  const summary = candidates
    .map((c) => `${c.ref}${c.address ? ` (${c.address})` : ''}`)
    .join(' or ');
  const cleanSummary = sanitizeGsm7Text(summary).slice(0, 70);
  return sanitizeGsm7Text(`[LGQ] Multiple matching jobs found: ${cleanSummary}. Please reply with address or job ref.`);
}

export function formatFieldQuoteWithSendPrompt(
  ref: string,
  clientName: string,
  amount: number,
  totalAmount?: number,
  reviewUrl?: string,
): string {
  const cleanRef = sanitizeGsm7Text(ref);
  const cleanName = sanitizeGsm7Text(clientName);
  const totalPart = totalAmount ? ` (Total $${totalAmount.toFixed(2)})` : '';
  const text = `[LGQ] ${cleanRef} (${cleanName}): Added $${amount.toFixed(2)} item${totalPart}. Reply SEND to text approval link to client.`;
  if (reviewUrl) return attachFieldReviewLink(text, reviewUrl);
  if (text.length <= 160) return sanitizeGsm7Text(text);
  return sanitizeGsm7Text(`[LGQ] ${cleanRef}: Added $${amount.toFixed(2)}. Reply SEND to text client.`);
}

export function formatFieldQuoteSentConfirmation(
  ref: string,
  clientName: string,
  clientPhone?: string | null,
): string {
  const cleanRef = sanitizeGsm7Text(ref);
  const cleanName = sanitizeGsm7Text(clientName);
  const phonePart = clientPhone ? ` (${sanitizeGsm7Text(clientPhone)})` : '';
  return sanitizeGsm7Text(`[LGQ] ${cleanRef}: Updated quote approval link sent to ${cleanName}${phonePart}.`);
}

export function formatFieldVcard(businessName: string, phoneNumber: string): string {
  const cleanBusiness = sanitizeGsm7Text(businessName).replace(/[\r\n;,]/g, ' ').trim() || 'Contractor';
  const cleanPhone = phoneNumber.trim();
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:Field Line;${cleanBusiness};;;`,
    `FN:${cleanBusiness} Field Updates`,
    `ORG:${cleanBusiness}`,
    `TEL;TYPE=CELL,VOICE,TEXT,PREF:${cleanPhone}`,
    `NOTE:Let's Get Quoted AI Voice & Text-to-Job Field Intake Line. Text or voice memo job notes, gate codes, tasks, or material receipt photos to ${cleanPhone}.`,
    'URL:https://letsgetquoted.com',
    'END:VCARD',
  ].join('\r\n');
}
