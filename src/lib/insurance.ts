/**
 * Proof of insurance — what it says, and when it stops being worth saying.
 *
 * Pure. No database, no storage. The one rule this file exists to enforce is
 * that an EXPIRED certificate is never shown to a homeowner: it isn't a stale
 * asset, it's a false assurance they relied on when they signed. Everything
 * else here is presentation.
 */

/** How many days out the owner starts getting told to renew. */
export const RENEWAL_WARNING_DAYS = 45;

export type InsuranceRecord = {
  path: string | null;
  filename: string | null;
  carrier: string | null;
  policyNumber: string | null;
  coverageAmount: number | null;
  /** 'YYYY-MM-DD', or null if the contractor didn't give one. */
  expiresOn: string | null;
  showOnQuotes: boolean;
};

export type InsuranceState =
  | { kind: 'none' }
  /** On file, no expiry given — shown, because most of the value is the document. */
  | { kind: 'undated' }
  | { kind: 'valid'; daysLeft: number }
  | { kind: 'expiring'; daysLeft: number }
  | { kind: 'expired'; daysAgo: number }
  /** On file and in date, but the owner has switched it off. */
  | { kind: 'hidden' };

/** Whole days between two 'YYYY-MM-DD' keys. Calendar days, not elapsed hours. */
export function daysBetween(fromKey: string, toKey: string): number {
  const from = Date.parse(`${fromKey}T00:00:00Z`);
  const to = Date.parse(`${toKey}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

/**
 * What state the certificate is in, from the OWNER's point of view.
 *
 * 'hidden' is deliberately distinct from 'none' — Settings has to be able to say
 * "you have one, it just isn't going out", which is a different sentence from
 * "you haven't uploaded one".
 */
export function insuranceState(record: InsuranceRecord | null, todayKey: string): InsuranceState {
  if (!record || !record.path) return { kind: 'none' };
  if (record.expiresOn) {
    const daysLeft = daysBetween(todayKey, record.expiresOn);
    // Expiry beats the switch. An expired certificate is not "hidden", it is
    // out of date, and that is what the owner needs to be told.
    if (daysLeft < 0) return { kind: 'expired', daysAgo: -daysLeft };
    if (!record.showOnQuotes) return { kind: 'hidden' };
    if (daysLeft <= RENEWAL_WARNING_DAYS) return { kind: 'expiring', daysLeft };
    return { kind: 'valid', daysLeft };
  }
  if (!record.showOnQuotes) return { kind: 'hidden' };
  return { kind: 'undated' };
}

/**
 * Does this go in front of a homeowner?
 *
 * The one gate. Expired never shows — not greyed out, not "expired on", not at
 * all. A homeowner reading a certificate on a quote is reading it as current,
 * and there is no way to caption that into being true.
 */
export function showsToClient(record: InsuranceRecord | null, todayKey: string): boolean {
  const state = insuranceState(record, todayKey);
  return state.kind === 'valid' || state.kind === 'expiring' || state.kind === 'undated';
}

/** "$1,000,000" — coverage is always a round headline figure, never cents. */
export function coverageLabel(amount: number | null): string | null {
  if (amount === null || !Number.isFinite(amount) || amount <= 0) return null;
  return `$${Math.round(amount).toLocaleString('en-US')}`;
}

/** "March 2027" — a month is the honest precision for something a year out. */
export function expiryLabel(expiresOn: string | null): string | null {
  if (!expiresOn) return null;
  const parsed = new Date(`${expiresOn}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/**
 * The line a homeowner reads on the quote.
 *
 * Built from whatever the contractor actually gave us, in decreasing order of
 * what a homeowner cares about: that there is cover, how much, who with, until
 * when. The policy NUMBER is never in here — it is on the certificate for
 * anyone who opens it, and putting it in the summary line invites it into a
 * screenshot for no gain.
 */
export function clientSummary(record: InsuranceRecord): string {
  const parts: string[] = [];
  const coverage = coverageLabel(record.coverageAmount);
  if (coverage) parts.push(`${coverage} general liability`);
  if (record.carrier?.trim()) parts.push(`with ${record.carrier.trim()}`);
  const expiry = expiryLabel(record.expiresOn);
  if (expiry) parts.push(`valid through ${expiry}`);
  return parts.length ? parts.join(' · ') : 'Certificate of insurance on file';
}

/** What Settings tells the owner. One sentence, and it always says what to do. */
export function ownerNote(state: InsuranceState): string {
  switch (state.kind) {
    case 'none':
      return 'No certificate on file. Upload one and it goes out with every quote.';
    case 'expired':
      return `This certificate expired ${state.daysAgo} day${state.daysAgo === 1 ? '' : 's'} ago, so it has stopped going out with quotes. Upload the renewal to start again.`;
    case 'expiring':
      return `Expires in ${state.daysLeft} day${state.daysLeft === 1 ? '' : 's'}. It stops going out with quotes on the day it lapses, so upload the renewal before then.`;
    case 'hidden':
      return 'On file, but switched off — quotes go out without it.';
    case 'undated':
      return 'Going out with every quote. Add the expiry date and we’ll stop showing it the day it lapses.';
    case 'valid':
      return 'Going out with every quote.';
  }
}
