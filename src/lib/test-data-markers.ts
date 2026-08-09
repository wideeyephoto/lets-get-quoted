// Does a record look like something somebody typed to try the product out,
// rather than a customer who called?
//
// WHY THIS EXISTS. The Quick Stop demand panel multiplies a count of past work
// by the account's floor fee and shows the owner a dollar figure. Every row that
// isn't real work inflates that figure, and the rows that aren't real work are
// exactly the ones an owner creates first: they sign up, fill the booking form
// in themselves with their own name and a 555 number to see what the customer
// gets, and those two submissions sit in `leads` forever. An account whose only
// history is three of its own test bookings was being shown "$300 of same-day
// fees you missed", which is not a small error — it is the entire number.
//
// THERE IS NO FLAG TO READ. This codebase has no is_test or is_demo column and
// no synthetic marker; adding one would be a migration in service of a panel.
// The three markers below are not a convention anyone has to remember — they are
// descriptive of how such rows actually look, and they are the same three
// scripts/remove-demo-data.mjs already trusts enough to DELETE rows on:
//   - an @example.com address (RFC 2606 reserves it; no customer has one)
//   - a phone on the 555 exchange (reserved, never assigned to real service)
//   - a J-DEMO- job reference (what the seeder writes)
//
// THE FALSE-POSITIVE RULE, which is the whole difficulty. "Test" is a surname.
// "Test the sump pump before the rain" is a real job. So:
//   1. the name vocabulary is matched ONLY against the name field — never the
//      description, where "test the pressure" is ordinary trade English;
//   2. only as whole words, so "Testa", "Protest Plumbing" and "Demolition" are
//      untouched;
//   3. and only when the WHOLE name is placeholder — every token has to be a
//      placeholder word or a filler word like "user". "Test User" is caught;
//      "Brett Test", a man with a surname, is not, because "Brett" is neither.
// Anything this returns must be SHOWN AS A COUNT wherever it is used ("3 records
// that look like test data were left out"), never silently dropped. A number the
// owner can see and dispute is honest; one that quietly shrinks their history
// while claiming to have read all of it is the same failure this file exists to
// fix, pointed the other way.

export type TestRecordFields = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  /** A job reference such as "J-1031". Seeded demo jobs use a "J-DEMO-" prefix. */
  ref?: string | null;
};

/**
 * Words that are never a real person's whole name.
 *
 * Kept deliberately short. Every addition here is a bet that no customer in any
 * trade is called that, and the cost of losing the bet is a real job vanishing
 * from a panel that is meant to prove the feature works. "Sample", "Example" and
 * "Dummy" earn their place because on their own — not as part of a longer name —
 * they are never how somebody introduces themselves.
 */
const PLACEHOLDER_WORDS = new Set([
  'test',
  'tests',
  'testing',
  'demo',
  'sample',
  'example',
  'placeholder',
  'dummy',
  'fake',
  'asdf',
  'asdfasdf',
  'qwerty',
  'lorem',
  'ipsum',
]);

/**
 * Words that carry no identity on their own.
 *
 * These never trigger a match by themselves — "ABC Plumbing" and "The Client
 * Co" stay real. They exist only so that a placeholder word next to one of them
 * ("Test User", "Demo Customer 2") still reads as a whole placeholder name.
 */
const FILLER_WORDS = new Set([
  'user',
  'users',
  'customer',
  'client',
  'account',
  'data',
  'record',
  'entry',
  'name',
  'person',
  'the',
  'a',
  'an',
  'mr',
  'mrs',
  'ms',
  'dr',
  'jr',
  'sr',
  'one',
  'two',
  'three',
  'abc',
  'x',
  'xx',
  'xxx',
  'co',
  'inc',
  'llc',
]);

/**
 * Whole names that are placeholders even though each half is a real name.
 *
 * "John" is a name and "Doe" is a surname, so the token rule above can't catch
 * the pair — but nobody has ever booked a drain clearing as John Doe.
 */
const PLACEHOLDER_FULL_NAMES = new Set(['john doe', 'jane doe', 'jon doe']);

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** True when the name as a whole is a placeholder, not merely contains one. */
function placeholderName(name: string): boolean {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized) return false;
  if (PLACEHOLDER_FULL_NAMES.has(normalized)) return true;

  const tokens = nameTokens(normalized);
  if (tokens.length === 0) return false;
  // Only the vocabulary decides. A short or odd-looking name — "Ng", "X Æ", a
  // surname truncated by an intake form — is not evidence of anything, and
  // guessing from shape rather than from words is how a real customer gets
  // deleted from the owner's own history.
  let sawPlaceholder = false;
  for (const token of tokens) {
    if (PLACEHOLDER_WORDS.has(token)) {
      sawPlaceholder = true;
      continue;
    }
    if (FILLER_WORDS.has(token)) continue;
    // A real word — a first name, a surname, a trade. Whatever else is in
    // there, this is somebody's actual name with the word "test" in it.
    return false;
  }
  return sawPlaceholder;
}

/**
 * Which marker fired, as a short label — or null when the record looks real.
 *
 * Returns the reason rather than a bare boolean so a caller can say WHICH kind
 * of test data it left out if it wants to, and so the tests assert on the
 * specific rule instead of on "true".
 */
export function testRecordMarker(fields: TestRecordFields): string | null {
  const email = (fields.email ?? '').trim().toLowerCase();
  if (email.endsWith('@example.com')) return 'example.com email';

  // The 555 EXCHANGE specifically — digits four to six of a North American
  // number, which is what "555\d{4} at the end" pins down — and not the string
  // "555" appearing anywhere, which would condemn the perfectly real
  // 313-555-appearing-elsewhere numbers like 248-355-5012. Same regex
  // scripts/remove-demo-data.mjs deletes on.
  const digits = (fields.phone ?? '').replace(/\D/g, '');
  if (/555\d{4}$/.test(digits)) return '555 phone number';

  const ref = (fields.ref ?? '').trim().toUpperCase();
  if (ref.startsWith('J-DEMO-')) return 'demo job reference';

  if (placeholderName((fields.name ?? '').toString())) return 'placeholder name';

  return null;
}

/** Convenience wrapper for callers that only need to filter. */
export function looksLikeTestRecord(fields: TestRecordFields): boolean {
  return testRecordMarker(fields) !== null;
}
