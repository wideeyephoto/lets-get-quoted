import type { LeadStatus } from './leads';

/**
 * One number for "how many leads", and its parts.
 *
 * The dashboard was showing three different lead figures at once, all called
 * leads, all correct, all different:
 *
 *   "2 website leads are waiting"  — new leads from the website form
 *   "5 leads waiting"              — new + contacted
 *   "8 open"                       — everything not won or lost
 *
 * Nobody can hold three denominators in their head, so the effect was that none
 * of them meant anything. This computes all of it once, from one list, and the
 * page shows the total with its breakdown underneath rather than three totals in
 * three places.
 *
 * The split that matters is WHOSE MOVE IT IS. New and contacted are yours —
 * somebody is waiting on you. Quoted is theirs — you have done your part and
 * chasing is a different, gentler job. Splitting on that rather than on status
 * is what turns a count into a decision.
 */

export type LeadLike = {
  status: LeadStatus;
  source?: string | null;
};

export type LeadSummary = {
  /** Everything still being worked. Won and lost are out — a won lead is a job. */
  open: number;
  /** The ball is with you. */
  needsYou: number;
  /** The ball is with the homeowner. */
  waitingOnCustomer: number;
  new: number;
  contacted: number;
  quoted: number;
  /**
   * New leads that arrived through the website form — the ones with a stranger
   * on the other end who has had no reply at all. A subset of `new`, not an
   * addition to it.
   */
  fromWebsite: number;
};

const WEBSITE_SOURCES = new Set(['website_form', 'website', 'quote_request']);

export function leadSummary(leads: LeadLike[]): LeadSummary {
  let fresh = 0;
  let contacted = 0;
  let quoted = 0;
  let fromWebsite = 0;

  for (const lead of leads) {
    if (lead.status === 'new') {
      fresh += 1;
      if (WEBSITE_SOURCES.has((lead.source ?? '').toLowerCase())) fromWebsite += 1;
    } else if (lead.status === 'contacted') {
      contacted += 1;
    } else if (lead.status === 'quoted') {
      quoted += 1;
    }
  }

  return {
    open: fresh + contacted + quoted,
    needsYou: fresh + contacted,
    waitingOnCustomer: quoted,
    new: fresh,
    contacted,
    quoted,
    fromWebsite,
  };
}

/** "8 open leads" / "1 open lead" — the headline, pluralised. */
export function leadHeadline(summary: LeadSummary): string {
  return `${summary.open} open lead${summary.open === 1 ? '' : 's'}`;
}

/**
 * The line under the headline that makes the total add up.
 *
 * Only the parts that are non-zero, because "0 waiting on the customer" is a
 * fact nobody needed and it crowds out the ones that matter. Reads as a list
 * that sums to the headline, which is the whole point — somebody should be able
 * to check our arithmetic at a glance and stop wondering which number is real.
 */
export function leadBreakdown(summary: LeadSummary): string {
  if (summary.open === 0) return 'Nothing waiting.';
  const parts: string[] = [];
  // Website-form leads are called out separately because they are the ones with
  // a stranger on the other end who has had no reply at all.
  if (summary.fromWebsite > 0) parts.push(`${summary.fromWebsite} new from your website`);
  const otherNew = summary.new - summary.fromWebsite;
  if (otherNew > 0) parts.push(`${otherNew} other new`);
  if (summary.contacted > 0) parts.push(`${summary.contacted} contacted`);
  if (summary.quoted > 0) parts.push(`${summary.quoted} quoted, waiting on the customer`);
  return parts.join(' · ');
}

/** What the rail's tooltip says, so the badge and the dashboard agree. */
export function leadRailTitle(summary: LeadSummary): string {
  if (summary.open === 0) return 'No open leads';
  if (summary.waitingOnCustomer === 0) return `${leadHeadline(summary)}, all needing you`;
  if (summary.needsYou === 0) return `${leadHeadline(summary)}, all waiting on the customer`;
  return `${leadHeadline(summary)} — ${summary.needsYou} need you, ${summary.waitingOnCustomer} waiting on the customer`;
}
