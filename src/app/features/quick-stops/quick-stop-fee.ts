import { formatUsdExact, formatUsdRounded } from '@/lib/money-format';

/**
 * Reading and printing the priority fee the hero simulation asks for.
 *
 * WHY IT IS NOT IN THE COMPONENT. This is the one piece of the hero with real
 * branches — four accepted shapes and four rejected ones — and a component is
 * the worst place to test them from. Pure functions here, exercised directly by
 * test/quick-stop-hero.test.ts, and the panel only decides what to draw.
 *
 * WHAT A CONTRACTOR ACTUALLY TYPES. The field is prefilled and most people send
 * it untouched, so the shapes that matter are the ones somebody produces when
 * they do edit it: `145`, `$145` (typed the symbol that is already printed
 * beside the box), `145.00` (pasted from a price list) and `1,145` (typed the
 * separator their keyboard offers). All four mean the same number and all four
 * are accepted. Nothing here reaches the product — the panel is fixed demo data
 * and sends no offer.
 */

export type FeeReading = { ok: true; cents: number } | { ok: false; error: string };

/** The amount the field starts on. A number, so nothing has to parse it back. */
export const PREFILLED_FEE_CENTS = 14_500;

/**
 * One sentence per failure, and each one says what to do rather than what
 * happened. "Invalid input" tells somebody they are wrong; "Use a dollar
 * amount, like $145" tells them what to type.
 */
export const FEE_ERRORS = {
  blank: 'Enter the priority fee you want.',
  nonNumeric: 'Use a dollar amount, like $145.',
  notPositive: 'Enter an amount above $0.',
} as const;

/**
 * Accepts `145`, `$145`, `145.00` and `1,145`. Rejects blank, nonnumeric, zero
 * and negative.
 *
 * The order of the checks is the order somebody hits them: nothing typed, then
 * something that is not a number, then a number that is not an amount. A single
 * regex would collapse the last two into one message that fits neither.
 */
export function readPriorityFee(raw: string): FeeReading {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: FEE_ERRORS.blank };

  /* One leading symbol and any thousands separators come off. The symbol is
     already printed inside the field, so somebody typing it again is agreeing
     with the label rather than making a mistake. */
  const cleaned = trimmed.replace(/^\$\s*/, '').replace(/,/g, '');

  /* Signed amounts are caught BEFORE the shape check so they get the message
     about the amount rather than the one about the format — "-50" is a number
     somebody meant, just not one a fee can be. */
  if (/^[-+]/.test(cleaned)) {
    return { ok: false, error: cleaned.startsWith('-') ? FEE_ERRORS.notPositive : FEE_ERRORS.nonNumeric };
  }

  // Two decimal places at most: money, not a measurement.
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return { ok: false, error: FEE_ERRORS.nonNumeric };

  const cents = Math.round(Number(cleaned) * 100);
  if (!Number.isFinite(cents) || cents <= 0) return { ok: false, error: FEE_ERRORS.notPositive };

  return { ok: true, cents };
}

/**
 * `$145`, not `$145.00`.
 *
 * The two shared helpers each get it wrong on their own here and are right
 * together: formatUsdExact always prints the cents, which makes a round fee
 * look like an invoice line, and formatUsdRounded would round $145.50 to $146 —
 * changing a number somebody typed. Rounded only ever sees an already-whole
 * amount, so it never rounds anything.
 */
export function formatPriorityFee(cents: number): string {
  return cents % 100 === 0 ? formatUsdRounded(cents / 100) : formatUsdExact(cents / 100);
}
