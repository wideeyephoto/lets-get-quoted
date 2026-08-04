// Google Search Console verification for a contractor's own site.
//
// Every published site now serves its own sitemap.xml (see ./site-pages), and
// nothing was submitting it. Search Console is how you submit one — and to add a
// property you have to prove you own it, by DNS record or by a meta tag on the
// homepage.
//
// DNS is not available to most of these contractors: a site on
// <them>.letsgetquoted.com is a subdomain of OUR domain, and they cannot add a
// TXT record to it. The meta tag is the only route they can complete
// themselves, which makes this small field the difference between having a
// sitemap and having a sitemap anybody reads.
//
// Pure and dependency-free.

// Google's tokens are base64url-ish. Deliberately strict: this value ends up in
// a <meta> tag, and the narrowest character set that accepts every real token is
// also the one that makes the field useless for anything else. React escapes
// attribute values anyway, so this is about catching a bad paste, not about
// trusting the escaping less — but a field that can only ever hold a
// verification token is one nobody has to think about again.
const TOKEN = /^[A-Za-z0-9_-]{8,128}$/;

// Owners paste the whole tag as often as the token; Google's own instructions
// show them the tag. Pull the content attribute out rather than telling someone
// they did it wrong.
const META_TAG = /<meta[^>]*name=["']?google-site-verification["']?[^>]*content=["']([^"']+)["'][^>]*>/i;
const META_TAG_REVERSED = /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']?google-site-verification["']?[^>]*>/i;

/** The token from a bare token or a pasted <meta> tag. '' when there isn't one. */
export function parseVerificationToken(input: string | null | undefined): string {
  const raw = String(input ?? '').trim();
  if (!raw) return '';

  const tag = raw.match(META_TAG) ?? raw.match(META_TAG_REVERSED);
  const value = (tag ? tag[1] : raw).trim();
  return TOKEN.test(value) ? value : '';
}

/**
 * A message for the owner, or null when the value is fine. Mirrors
 * postalCodeProblem in lib/terms — say what's wrong at the field, not after a
 * failed save.
 */
export function verificationTokenProblem(input: string | null | undefined): string | null {
  const raw = String(input ?? '').trim();
  if (!raw) return null; // Blank is valid: this is optional.
  if (parseVerificationToken(raw)) return null;
  if (/^https?:\/\//i.test(raw)) return 'That looks like a web address. Paste the verification code, or the whole <meta> tag Google gave you.';
  if (raw.includes('<')) return "That doesn't look like Google's verification tag. Copy the whole line Google shows you, including the content=\"…\" part.";
  return 'That doesn\'t look like a verification code. It\'s a long string of letters, numbers, dashes and underscores.';
}
