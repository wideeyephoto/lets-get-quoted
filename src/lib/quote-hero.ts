import type { QuoteItem } from '@/lib/jobs';

/**
 * The top of the page a homeowner opens from a text.
 *
 * It used to say "Your quote" over the customer's full name set in display
 * caps — DANA WHITFIELD — which is how a record refers to somebody, not how you
 * greet them, and it told them nothing they did not already know. Everything
 * here is derived from what the contractor already filled in; nothing is
 * invented, and every piece degrades to silence rather than to a placeholder.
 */

/** How much of a line item can headline a page before it stops being a headline. */
const TYPE_MAX = 52;

/**
 * What this job IS, in the contractor's own words.
 *
 * There is no service-type column, and adding one would mean asking every
 * contractor to categorise work they already described. The first base line of
 * the quote is the description they wrote — "Cedar privacy fence, 120 ft" — and
 * it is better than any taxonomy we could offer them.
 *
 * Returns null rather than guessing when the quote has no items and the scope
 * is long-form prose: a headline that quotes the first 52 characters of a
 * paragraph reads like a bug, and "Your quote" is a perfectly good headline.
 */
export function projectTypeOf(items: QuoteItem[], scope: string | null): string | null {
  const base = items.find((item) => item.kind === 'base' && item.label.trim().length > 0);
  if (base) return trimType(base.label);

  // No line items — a legacy single-amount quote. The scope's first line is
  // usable ONLY if it is already short enough to be a title; anything longer is
  // a description of the work, not a name for it.
  const firstLine = (scope ?? '').split('\n')[0]?.trim() ?? '';
  if (firstLine.length > 0 && firstLine.length <= TYPE_MAX && !firstLine.endsWith('.')) return firstLine;
  return null;
}

function trimType(label: string): string {
  const clean = label.trim().replace(/\s+/g, ' ');
  if (clean.length <= TYPE_MAX) return clean;
  // Cut on a word, not mid-syllable, and say that it was cut.
  return `${clean.slice(0, TYPE_MAX).replace(/\s+\S*$/, '')}…`;
}

/**
 * Who this is for, said the way a person would say it.
 *
 * First name only, and never a fallback pronoun: "you, here's your quote" is
 * what you get when a greeting template meets a missing name, so a missing name
 * drops the greeting instead of filling it in.
 */
export function firstNameOf(fullName: string | null | undefined): string | null {
  const first = (fullName ?? '').trim().split(/\s+/)[0] ?? '';
  return first.length > 0 ? first : null;
}

/**
 * The headline. One sentence, and it changes once the answer is yes — a page
 * that still says "here's your quote" after somebody approved it is a page that
 * did not notice.
 */
export function quoteHeadline({
  firstName,
  projectType,
  approved,
}: {
  firstName: string | null;
  projectType: string | null;
  approved: boolean;
}): string {
  if (approved) return projectType ? `${projectType} — approved.` : 'Your quote is approved.';
  const subject = projectType ? `your quote for ${projectType}` : 'your quote';
  return firstName ? `${firstName}, here's ${subject}.` : `Here's ${subject}.`;
}
