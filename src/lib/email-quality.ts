// Judging an email address BEFORE anything is sent to it.
//
// Why this exists: sending reputation is earned per domain and lost to hard
// bounces. Every address a contractor collects gets mailed repeatedly — the
// quote, the invoice, the reminder, the review ask, the campaign — so one dead
// address typed into an intake form isn't one bad send, it's a bad send every
// time that customer's record is touched. Enough of them and legitimate mail
// starts landing in spam for every contractor on the platform, because they
// share the sending domain.
//
// The three sources of dead addresses, in the order they actually occur:
//   1. TYPOS. By far the biggest, and the only one the person would fix
//      themselves if asked. "gmial.com" is not malice, it's a slip.
//   2. PLACEHOLDERS. A contractor testing their own site types test@test.com.
//      A homeowner who doesn't want email but is asked for one types the same.
//   3. DISPOSABLE inboxes, which accept mail and then stop existing.
//
// PURE — no I/O, no DB, no network. Runs identically on the public form (where
// it can offer a correction while the person is still standing there) and on
// the server (where it is the one that counts, because a form can be bypassed).
//
// What this deliberately does NOT do is claim an address is real. Nothing short
// of a delivery attempt can. It rejects what is provably unusable and flags what
// is probably junk; the honest confirmation is a bounce webhook — see
// email_suppression.

export type EmailVerdict = {
  /** Structurally usable. False means never send to it — it cannot deliver. */
  valid: boolean;
  /**
   * Deliverable-looking but not worth mailing: a placeholder, a disposable
   * inbox, or a role address nobody reads. The lead is still kept — this only
   * decides whether the ADDRESS gets used.
   */
  junk: boolean;
  /** Machine key for the reason, or null when the address looks fine. */
  reason: 'malformed' | 'placeholder' | 'disposable' | 'role' | null;
  /** One sentence for a human, or null. */
  note: string | null;
  /**
   * The address they probably meant — "dana@gmial.com" -> "dana@gmail.com".
   * Only ever a SUGGESTION: offered to the person typing, never applied for
   * them. Silently "fixing" an address sends mail to a stranger.
   */
  suggestion: string | null;
};

// Structural check, stricter than the "something@something.something" regex
// this replaces. That one accepted "a@b.c", "x@-.io" and "a..b@c.com", all of
// which are either undeliverable or a typo.
const LOCAL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;

// Inboxes built to be thrown away. Not exhaustive and never will be — this is
// the common tail, and the bounce webhook catches what it misses.
const DISPOSABLE_DOMAINS = new Set([
  '10minutemail.com', '20minutemail.com', 'guerrillamail.com', 'guerrillamail.info', 'sharklasers.com',
  'mailinator.com', 'mailinator.net', 'yopmail.com', 'yopmail.fr', 'trashmail.com', 'trashmail.net',
  'temp-mail.org', 'tempmail.com', 'tempmailo.com', 'throwawaymail.com', 'getnada.com', 'nada.email',
  'dispostable.com', 'maildrop.cc', 'fakeinbox.com', 'mytemp.email', 'moakt.com', 'emailondeck.com',
  'spamgourmet.com', 'mailnesia.com', 'inboxkitten.com', 'burnermail.io', 'tempr.email', 'discard.email',
]);

// Addresses that are a way of declining to give one. The local part alone isn't
// enough — "test@brokepipes.com" could be a real mailbox — so a placeholder is
// a junk local part on a junk domain, or a local part nobody types by accident.
const PLACEHOLDER_LOCALS = new Set([
  'test', 'testing', 'test1', 'test123', 'asdf', 'asdfasdf', 'qwerty', 'aaa', 'abc', 'abc123',
  'noemail', 'no-email', 'none', 'nothing', 'na', 'n/a', 'nope', 'nomail', 'no', 'x', 'xx', 'xxx',
  'fake', 'fakeemail', 'dontemail', 'donotemail', 'unknown', 'anonymous', 'blah', 'foo', 'bar',
]);
// NOTE: mail.com and email.com are NOT here. They look like filler and they are
// real, widely-used free providers — a customer at one is a customer.
const PLACEHOLDER_DOMAINS = new Set([
  'test.com', 'test.net', 'test.org', 'testing.com', 'example.com', 'example.net', 'example.org',
  'asdf.com', 'abc.com', 'none.com', 'nowhere.com', 'fake.com', 'fakeemail.com', 'noemail.com',
  'nomail.com', 'domain.com', 'sample.com', 'yourdomain.com',
]);

// Shared mailboxes. Real, but they belong to an organization rather than a
// person: they draw complaints and are a poor target for a review request.
const ROLE_LOCALS = new Set([
  'admin', 'administrator', 'billing', 'contact', 'info', 'help', 'hello', 'sales', 'support',
  'postmaster', 'webmaster', 'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'abuse',
]);

// The handful of domains that account for most consumer email, and the misses
// people actually make on them. Only offered when the typo is one edit away, so
// a legitimate small domain is never second-guessed.
const COMMON_DOMAINS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com',
  'comcast.net', 'live.com', 'msn.com', 'sbcglobal.net', 'att.net', 'verizon.net', 'me.com',
  'protonmail.com', 'proton.me', 'ymail.com', 'charter.net', 'cox.net', 'bellsouth.net',
  'mail.com', 'email.com',
];

// Every domain this module has an opinion about. A domain we RECOGNIZE is never
// offered a correction, whatever it's one edit away from — "mail.com" is one
// insert from "gmail.com" and is a real provider with real customers behind it.
// Knowing what something is beats guessing what it resembles.
const KNOWN_DOMAINS = new Set<string>([...COMMON_DOMAINS, ...PLACEHOLDER_DOMAINS, ...DISPOSABLE_DOMAINS]);

/**
 * Damerau-Levenshtein, capped. The transposition case is the whole reason this
 * isn't plain Levenshtein: "gmial" for "gmail" is one slip of two fingers and
 * the commonest typo there is, but plain Levenshtein scores a swap as two
 * edits, which puts every transposed domain out of reach of a one-edit cap.
 */
function editDistance(a: string, b: string, cap: number): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const rows: number[][] = [Array.from({ length: b.length + 1 }, (_, j) => j)];
  for (let i = 1; i <= a.length; i += 1) {
    const row = new Array<number>(b.length + 1);
    row[0] = i;
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(rows[i - 1][j] + 1, row[j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, rows[i - 2][j - 2] + 1);
      }
      row[j] = value;
      if (value < best) best = value;
    }
    rows.push(row);
    if (best > cap) return cap + 1;
  }
  return rows[a.length][b.length];
}

/**
 * "dana@gmial.com" → "dana@gmail.com". Null when the domain is already common,
 * or is nothing like one.
 *
 * Deliberately conservative. A wrong suggestion on a real address is worse than
 * no suggestion: the person accepts it, and their quote goes to somebody else.
 */
export function suggestEmailFix(address: string): string | null {
  const at = address.lastIndexOf('@');
  if (at <= 0) return null;
  const local = address.slice(0, at);
  const domain = address.slice(at + 1).toLowerCase();
  // Nothing to correct about a domain we already recognize.
  if (!domain || KNOWN_DOMAINS.has(domain)) return null;

  // Exactly one edit, transpositions included. Two would start reaching real,
  // different domains — and a wrong suggestion that gets accepted sends the
  // quote to a stranger, which is worse than not offering one.
  for (const candidate of COMMON_DOMAINS) {
    if (editDistance(domain, candidate, 1) <= 1) return `${local}@${candidate}`;
  }
  return null;
}

/**
 * Judge an address. Never throws; an empty value is simply not valid.
 *
 * `valid: false` means the string cannot be delivered to and should be refused
 * at the form. `junk: true` means it probably can be delivered to but shouldn't
 * be mailed — the lead is kept either way, because a phone number is usually
 * how this work gets won and losing the whole inquiry over a typed-in
 * "none@none.com" is a far worse outcome than not emailing them.
 */
export function classifyEmail(input: string | null | undefined): EmailVerdict {
  const address = (input ?? '').toString().trim();
  const fail = (reason: EmailVerdict['reason'], note: string): EmailVerdict => ({
    valid: false, junk: false, reason, note, suggestion: null,
  });

  if (!address || address.length > 254) return fail('malformed', 'That email address doesn’t look right.');

  const at = address.lastIndexOf('@');
  if (at <= 0 || at === address.length - 1) return fail('malformed', 'That email address doesn’t look right.');

  const local = address.slice(0, at);
  const domain = address.slice(at + 1).toLowerCase();

  if (local.length > 64 || !LOCAL.test(local)) return fail('malformed', 'That email address doesn’t look right.');

  const labels = domain.split('.');
  // A domain needs at least a name and a TLD, every label has to be a legal
  // label, and a one-letter TLD does not exist — "a@b.c" is always a typo.
  if (labels.length < 2 || labels.some((label) => !LABEL.test(label)) || labels[labels.length - 1].length < 2) {
    return fail('malformed', 'That email address doesn’t look right.');
  }
  if (/^\d+$/.test(labels[labels.length - 1])) return fail('malformed', 'That email address doesn’t look right.');

  const suggestion = suggestEmailFix(`${local}@${domain}`);
  const localLower = local.toLowerCase();

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return {
      valid: true, junk: true, reason: 'disposable',
      note: 'This is a temporary inbox that stops working after a while.',
      suggestion: null,
    };
  }
  if (PLACEHOLDER_DOMAINS.has(domain) || PLACEHOLDER_LOCALS.has(localLower)) {
    return {
      valid: true, junk: true, reason: 'placeholder',
      note: 'This looks like a filler address rather than a real inbox.',
      suggestion,
    };
  }
  if (ROLE_LOCALS.has(localLower)) {
    return {
      valid: true, junk: true, reason: 'role',
      note: 'This is a shared company mailbox, not a person.',
      suggestion: null,
    };
  }

  return { valid: true, junk: false, reason: null, note: null, suggestion };
}

/** Convenience for the form: does this pass, and if not what do we say? */
export function emailFieldError(input: string | null | undefined): string | null {
  const verdict = classifyEmail(input);
  return verdict.valid ? null : verdict.note;
}

/**
 * Worth putting in a bulk send: deliverable AND not junk.
 *
 * The gate for MARKETING, which is where junk addresses do their damage — a
 * hundred bad addresses in one campaign is a bounce spike, and a spike is what
 * mailbox providers act on. Transactional mail is deliberately NOT held to
 * this: a quote or an invoice is something the customer is waiting for, and a
 * contractor who typed a role address on purpose should still be able to send
 * one. Only `valid` guards those paths.
 */
export function isMailable(input: string | null | undefined): boolean {
  const verdict = classifyEmail(input);
  return verdict.valid && !verdict.junk;
}
