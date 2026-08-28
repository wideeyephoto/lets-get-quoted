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

export function formatFieldNoteConfirmation(ref: string, clientName: string): string {
  const cleanRef = sanitizeGsm7Text(ref);
  const cleanName = sanitizeGsm7Text(clientName);
  return sanitizeGsm7Text(`[LGQ] ${cleanRef} (${cleanName}): Logged field note.`);
}

export function formatCrewNoteConfirmation(ref: string, clientName: string, crewName: string): string {
  const cleanRef = sanitizeGsm7Text(ref);
  const cleanName = sanitizeGsm7Text(clientName);
  const cleanCrew = sanitizeGsm7Text(crewName);
  return sanitizeGsm7Text(`[LGQ] ${cleanRef} (${cleanName}): Logged field note from ${cleanCrew}.`);
}

export function formatFieldCostConfirmation(
  ref: string,
  clientName: string,
  amount: number,
  category: string,
): string {
  const cleanRef = sanitizeGsm7Text(ref);
  const cleanName = sanitizeGsm7Text(clientName);
  const cleanCat = sanitizeGsm7Text(category || 'material');
  return sanitizeGsm7Text(`[LGQ] ${cleanRef} (${cleanName}): Logged $${amount.toFixed(2)} ${cleanCat} cost.`);
}

export function formatCrewCostConfirmation(
  ref: string,
  clientName: string,
  amount: number,
  category: string,
  crewName: string,
): string {
  const cleanRef = sanitizeGsm7Text(ref);
  const cleanName = sanitizeGsm7Text(clientName);
  const cleanCat = sanitizeGsm7Text(category || 'material');
  const cleanCrew = sanitizeGsm7Text(crewName);
  return sanitizeGsm7Text(`[LGQ] ${cleanRef} (${cleanName}): Logged $${amount.toFixed(2)} ${cleanCat} cost from ${cleanCrew}.`);
}

export function formatFieldTaskConfirmation(
  ref: string,
  clientName: string,
  taskTitle: string,
): string {
  const cleanRef = sanitizeGsm7Text(ref);
  const cleanName = sanitizeGsm7Text(clientName);
  const cleanTask = sanitizeGsm7Text(taskTitle).slice(0, 50);
  return sanitizeGsm7Text(`[LGQ] ${cleanRef} (${cleanName}): Added task "${cleanTask}".`);
}

export function formatCrewTaskConfirmation(
  ref: string,
  clientName: string,
  taskTitle: string,
  crewName: string,
): string {
  const cleanRef = sanitizeGsm7Text(ref);
  const cleanName = sanitizeGsm7Text(clientName);
  const cleanTask = sanitizeGsm7Text(taskTitle).slice(0, 40);
  const cleanCrew = sanitizeGsm7Text(crewName);
  return sanitizeGsm7Text(`[LGQ] ${cleanRef} (${cleanName}): Added task "${cleanTask}" from ${cleanCrew}.`);
}

export function formatFieldTaskCompletedConfirmation(
  ref: string,
  clientName: string,
  taskTitle: string,
  crewName?: string,
): string {
  const cleanRef = sanitizeGsm7Text(ref);
  const cleanName = sanitizeGsm7Text(clientName);
  const cleanTask = sanitizeGsm7Text(taskTitle).slice(0, 40);
  const fromClause = crewName ? ` by ${sanitizeGsm7Text(crewName)}` : '';
  return sanitizeGsm7Text(`[LGQ] ${cleanRef} (${cleanName}): Marked task "${cleanTask}" completed${fromClause}.`);
}

export function formatFieldLeadConfirmation(clientName: string): string {
  const cleanName = sanitizeGsm7Text(clientName);
  return sanitizeGsm7Text(`[LGQ] Created new lead for ${cleanName}.`);
}

export function formatFieldScheduleConfirmation(ref: string, clientName: string, when: string): string {
  const cleanRef = sanitizeGsm7Text(ref);
  const cleanName = sanitizeGsm7Text(clientName);
  const cleanWhen = sanitizeGsm7Text(when);
  return sanitizeGsm7Text(`[LGQ] ${cleanRef} (${cleanName}): Scheduled for ${cleanWhen}.`);
}

export function formatFieldClientConfirmation(clientName: string): string {
  const cleanName = sanitizeGsm7Text(clientName);
  return sanitizeGsm7Text(`[LGQ] Updated client profile for ${cleanName}.`);
}

export function formatFieldCrewConfirmation(ref: string, clientName: string, crewName: string): string {
  const cleanRef = sanitizeGsm7Text(ref);
  const cleanName = sanitizeGsm7Text(clientName);
  const cleanCrew = sanitizeGsm7Text(crewName);
  return sanitizeGsm7Text(`[LGQ] Assigned ${cleanCrew} to ${cleanRef} (${cleanName}).`);
}

export function formatFieldAmbiguityClarification(candidates: Array<{ ref: string; address?: string | null }>): string {
  const summary = candidates
    .map((c) => `${c.ref}${c.address ? ` (${c.address})` : ''}`)
    .join(' or ');
  const cleanSummary = sanitizeGsm7Text(summary).slice(0, 70);
  return sanitizeGsm7Text(`[LGQ] Multiple matching jobs found: ${cleanSummary}. Please reply with address or job ref.`);
}
