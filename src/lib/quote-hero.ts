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
 * The client's name, cased the way a person writes a name.
 *
 * `jobs.client_name` is typed by whoever took the call, and it arrives as
 * "dana whitfield" as often as "DANA WHITFIELD" — a phone keyboard with caps
 * lock on, or a laptop with none. Neither is what somebody wants to see at the
 * top of a document they are about to sign, and the page had no formatting on
 * it at all: the headline said "dana, here's your quote" and the line under it
 * said "Prepared for DANA WHITFIELD".
 *
 * THE ONE RULE: a word that already mixes cases is never touched. If it has an
 * uppercase letter AND a lowercase one, somebody chose that — McBride, DeLuca,
 * JoAnne, d'Arcy — and a title-caser that "fixes" those is worse than no
 * title-caser at all, because it gets somebody's own name wrong on a contract.
 * Only a word that is entirely one case is recased, because a word that is
 * entirely one case carries no information about how it should be written.
 *
 * WHAT IT DOES NOT DO. "mcbride" comes out "Mcbride", not "McBride". Knowing
 * which Mc/Mac names take an internal capital means knowing the name, and the
 * rule that gets McBride right turns Machado into MacHado. Recasing on
 * apostrophes and hyphens is safe — "o'neill" and "mary-jane" have only one
 * reading — so those are handled and the Scottish prefixes are not.
 */
export function properName(fullName: string | null | undefined): string | null {
  const words = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  return words
    .map((word) => {
      const upper = word.toUpperCase();
      const lower = word.toLowerCase();
      // No cased letters at all — a number, an ampersand, a Han character.
      if (upper === lower) return word;
      // Mixed case: deliberate. Left exactly as it was typed.
      if (word !== upper && word !== lower) return word;
      // Every letter that starts a word or follows a name's own punctuation.
      // Both apostrophes, because a phone keyboard produces the curly one.
      return lower.replace(/(^|[-'’.])(\p{L})/gu, (_, mark: string, letter: string) => mark + letter.toUpperCase());
    })
    .join(' ');
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
