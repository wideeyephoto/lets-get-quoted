import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Per-customer referral codes, signed rather than stored.
 *
 * A referral code answers exactly one question — "which of this account's
 * clients sent this person?" — so it is HMAC(accountId.clientId) with the
 * client id carried in the code itself. There is no referral_codes table, no
 * unique index, no generator, no collision retry and no backfill, because there
 * is nothing to look up: verifying is recomputing.
 *
 * THE CODE IS NOT A CREDENTIAL. It grants no access to anything. It is proof of
 * one fact, that this link was minted for this client of this account, and the
 * worst thing a forged one can do is misattribute a lead — which is why the
 * signature exists, and why nothing downstream may treat a verified code as
 * authentication.
 *
 * IT IS BOUND TO THE ACCOUNT, NOT JUST THE CLIENT. Signing the client id alone
 * would produce a code that verifies arithmetically on every tenant's booking
 * form, leaving a query filter as the only thing standing between a code minted
 * by one contractor and an attribution recorded against another. The account id
 * costs nothing to include and removes the class of bug outright.
 *
 * NO `|| ''`, EVER — the same rule, and for the same reason, as
 * src/lib/lead-verification.ts. A missing secret must mean "we cannot check",
 * which fails closed to "not referred". It must never silently become a key
 * anybody can guess, because a code signed with a guessable key is worse than
 * no code: it looks like proof.
 *
 * THE PREVIOUS-KEY CHAIN IS NOT THAT SAME MISTAKE. These codes go out inside
 * customers' text messages and emails, where they sit for months. A rotation
 * with no overlap silently invalidates every link already in the wild, and the
 * failure is invisible — the links keep loading, they just stop attributing.
 * LGQ_REFERRAL_SECRET_PREVIOUS is accepted on verify only, never on mint, and
 * when both are unset there is no key and the answer is "no".
 */

/** 16 raw bytes of uuid, base64url, unpadded. */
const PAYLOAD_CHARS = 22;
/** ~132 bits of tag. Long enough that forging is not a strategy, short enough
 *  that the whole code still fits in a text message next to a URL. */
const TAG_CHARS = 22;

/**
 * String.raw, NOT a plain template literal.
 *
 * In a cooked template `\.` is an unrecognised escape and collapses to a bare
 * `.` — the any-char metacharacter. This shape then admitted 22 chars, ANY
 * character, 22 chars; a visitor could pass `A*22 + '=' + B*22`, which has no
 * literal dot, so the split below produced one element and `tag` was undefined,
 * while base64url treated the '=' as padding and decoded the first 22 chars to
 * exactly 16 bytes — so the uuid guard passed and Buffer.from(undefined) threw.
 * On the one function in this file that may never throw, reached straight from
 * a query parameter on a public booking page. Every character whose low byte is
 * 0x3D did it too, not just '='.
 */
const CODE_SHAPE = new RegExp(String.raw`^[A-Za-z0-9_-]{${PAYLOAD_CHARS}}\.[A-Za-z0-9_-]{${TAG_CHARS}}$`);

function referralSecret(): string | null {
  return process.env.LGQ_REFERRAL_SECRET || null;
}

/** Verify-only. Accepted while a rotation is in flight so links already sent
 *  keep attributing; never used to mint. */
function referralSecretPrevious(): string | null {
  return process.env.LGQ_REFERRAL_SECRET_PREVIOUS || null;
}

/** True when codes can be minted and checked at all. Callers that would render
 *  a referral link check this first and render nothing rather than throwing. */
export function isReferralConfigured(): boolean {
  return referralSecret() !== null;
}

/**
 * Any spelling of a uuid -> the canonical lowercase hyphenated one, or null.
 *
 * BOTH SIDES SIGN THIS, and that is the whole point of it existing. Verify can
 * only ever recover the canonical form — it rebuilds the uuid from 16 raw bytes
 * — so a mint that signed the caller's raw string would produce a code that
 * never verifies the moment anybody passed an uppercase or unhyphenated id.
 * That link goes out in a customer's text message, loads fine, and silently
 * attributes to nobody, forever, with no error anywhere.
 */
function canonicalClientId(clientId: string): string | null {
  const hex = clientId.replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) return null;
  return uuidFromHex(hex);
}

function uuidFromHex(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** A canonical uuid -> 22 base64url chars. */
function packClientId(canonical: string): string {
  return Buffer.from(canonical.replace(/-/g, ''), 'hex').toString('base64url');
}

/** The inverse, and the reason the tag is computed over the DECODED uuid rather
 *  than over the payload string: base64url has spare bits in its last
 *  character, so several payload spellings decode to the same 16 bytes. Signing
 *  what the code MEANS rather than how it was spelled makes that harmless. */
function unpackClientId(payload: string): string | null {
  const raw = Buffer.from(payload, 'base64url');
  if (raw.length !== 16) return null;
  return uuidFromHex(raw.toString('hex'));
}

function tagFor(secret: string, accountId: string, canonicalClient: string): string {
  return createHmac('sha256', secret).update(`${accountId}.${canonicalClient}`).digest('base64url').slice(0, TAG_CHARS);
}

function tagMatches(expected: string, provided: unknown): boolean {
  // Buffer.from(undefined) throws, and this is reached from a public page with
  // a value a stranger typed. Refuse rather than trust the shape check upstream.
  if (typeof provided !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  // timingSafeEqual throws on a length mismatch, so the guard is required and
  // not merely an optimization.
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Throws when no secret is configured.
 *
 * Minting is the side that must never degrade quietly: the caller checks
 * isReferralConfigured() and skips the whole feature, rather than putting a
 * link nobody can verify into a customer's inbox.
 */
export function mintReferralCode(accountId: string, clientId: string): string {
  const secret = referralSecret();
  if (!secret) throw new Error('Referral secret is not configured.');
  const canonical = canonicalClientId(clientId);
  if (!canonical) throw new Error('A referral code needs a uuid client id.');
  return `${packClientId(canonical)}.${tagFor(secret, accountId, canonical)}`;
}

/**
 * The referring client's id, or null.
 *
 * NEVER THROWS. The input is a query parameter typed by an anonymous visitor,
 * so every malformed shape — wrong length, wrong charset, not a uuid, no dot,
 * tampered tag — is an ordinary "not referred" rather than a 500 on a
 * contractor's public booking page. It is called before the required-field
 * checks in submitBookingAction, so a throw here destroys the whole submission
 * after the visitor has filled in every step of the form.
 */
export function referrerFromCode(accountId: string, raw: string | null | undefined): string | null {
  if (!raw || !CODE_SHAPE.test(raw)) return null;
  // Fail closed. "Cannot verify" is not "verified".
  const secret = referralSecret();
  if (!secret) return null;

  const [payload, tag, ...rest] = raw.split('.');
  // Implied by CODE_SHAPE today, and deliberately checked anyway: the shape is
  // one regex edit away from admitting these again, and the last time it did,
  // the result was an uncaught TypeError on a public page.
  if (!payload || !tag || rest.length > 0) return null;

  const clientId = unpackClientId(payload);
  if (!clientId) return null;

  if (tagMatches(tagFor(secret, accountId, clientId), tag)) return clientId;

  const previous = referralSecretPrevious();
  if (previous && tagMatches(tagFor(previous, accountId, clientId), tag)) return clientId;

  return null;
}

/** The share link: a booking URL that carries the code. */
export function referralLink(bookingUrl: string, code: string): string {
  return `${bookingUrl}${bookingUrl.includes('?') ? '&' : '?'}ref=${encodeURIComponent(code)}`;
}
