/**
 * Reading an amount a person typed into a box that will charge somebody.
 *
 * WHY NOT `Number()`. `createDepositRequestAction` did exactly that, and the
 * guard beneath it is `if (amount <= 0) throw`. **`NaN <= 0` is false**, so
 * every unparseable amount walked straight through it -- and supabase-js
 * serialises NaN to `null`, onto a `numeric NOT NULL` column. So "$500" in the
 * amount field produced a raw not-null violation from Postgres, surfaced through
 * the dashboard error boundary, with the whole form lost.
 *
 * The inputs that do it are not exotic. `Number('$500')`, `Number('1,200')` and
 * `Number('12,50')` are all NaN, and typing a dollar sign into a field labelled
 * with a dollar sign is a thing people do.
 *
 * WHY NOT `parseMoney` FROM smart-import. That one strips every non-digit and
 * reads what is left: `'12,50'` becomes `1250`. For a CSV importer guessing at
 * somebody's spreadsheet that is a defensible shortcut. For a field that decides
 * what a customer is asked to pay it is a hundredfold error, and it would be
 * made silently.
 *
 * SO THIS REFUSES RATHER THAN GUESSES. It accepts the shapes people actually
 * type for a US dollar amount and rejects everything else, including the
 * genuinely ambiguous ones. A refusal the caller can turn into a sentence beats
 * a number nobody chose.
 */

export type MoneyInputResult =
  | Readonly<{ ok: true; amount: number }>
  | Readonly<{ ok: false; reason: 'empty' | 'unreadable' | 'not_positive' | 'too_precise' | 'too_large' }>;

/**
 * The largest amount this will accept, in dollars.
 *
 * Not a business rule about how big a job can be -- it is a typo guard. Ten
 * million is far past any single contractor payment, and a figure that size is
 * much more likely to be a slipped decimal or a pasted phone number than an
 * intention.
 */
export const MAX_PAYMENT_DOLLARS = 10_000_000;

/**
 * `$1,250.50` and `1250.5` and `1,250` are all fine. `12,50` is not.
 *
 * The comma rule is the whole point of the regex: commas are permitted only in
 * thousands positions, so a European decimal comma fails to parse rather than
 * being read as a thousands separator. `12,50` meaning twelve-fifty and `12,50`
 * read as twelve-fifty-hundred differ by a factor of a hundred, and there is no
 * way to tell from the string which was meant.
 */
const MONEY_SHAPE = /^\$?\s*(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?$/;

export function parsePaymentAmount(raw: unknown): MoneyInputResult {
  const text = String(raw ?? '').trim();
  if (text === '') return { ok: false, reason: 'empty' };

  // Caught before the shape test so the message can say what is wrong: a third
  // decimal place is a different mistake from a letter, and "cents only go to
  // two places" is actionable where "unreadable" is not.
  const tooPrecise = /^\$?\s*[\d,]+\.\d{3,}$/.test(text);
  if (tooPrecise) return { ok: false, reason: 'too_precise' };

  const match = MONEY_SHAPE.exec(text);
  if (!match) return { ok: false, reason: 'unreadable' };

  const amount = Number(`${match[1].replace(/,/g, '')}.${match[2] ?? '0'}`);

  // Belt and braces. The shape above cannot produce a non-finite number, and
  // this is the exact check whose absence caused the original defect, so it is
  // not being left to the regex alone.
  if (!Number.isFinite(amount)) return { ok: false, reason: 'unreadable' };
  if (amount <= 0) return { ok: false, reason: 'not_positive' };
  if (amount > MAX_PAYMENT_DOLLARS) return { ok: false, reason: 'too_large' };

  // Cents, exactly. The regex already limits the input to two decimal places;
  // this removes the binary-float residue from the division.
  return { ok: true, amount: Math.round(amount * 100) / 100 };
}

/** What to put in front of the person who typed it. */
export function paymentAmountError(reason: Exclude<MoneyInputResult, { ok: true }>['reason']): string {
  switch (reason) {
    case 'empty':
      return 'Enter the amount you want to collect.';
    case 'not_positive':
      return 'Enter an amount greater than zero.';
    case 'too_precise':
      return 'Amounts go to the cent — two decimal places at most.';
    case 'too_large':
      return `That is larger than ${MAX_PAYMENT_DOLLARS.toLocaleString('en-US')} dollars. Check for a stray digit or a misplaced decimal point.`;
    case 'unreadable':
    default:
      // Names the two that look fine and are not, because those are the ones
      // somebody stares at without seeing the problem.
      return 'That amount could not be read. Use digits, like 1250 or 1,250.50 — a comma is only a thousands separator, so write cents with a full stop.';
  }
}
