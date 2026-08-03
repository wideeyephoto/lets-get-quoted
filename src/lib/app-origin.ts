// Where a link we send is allowed to point.
//
// Every URL this app emails or texts has to name a host, and that host is a
// trust boundary: whoever chooses it chooses where the recipient lands. Most of
// the app already reads it from config (the APP_ORIGIN line repeated across
// lib/booking, lib/dunning, lib/followups and friends). The two magic-link
// senders took it as a PARAMETER instead, which is a different thing entirely —
// a server action is a public HTTP endpoint, so "the caller" is not the login
// page, it is anyone.
//
// Posting sendMagicLinkAction a redirectUrl of https://evil.example produced a
// genuine Let's Get Quoted email, from our sending domain, to any address named,
// carrying a VALID one-time sign-in token addressed to the attacker's server.
// One click is a signed-in session in somebody else's hands. Reading the origin
// from config leaves no parameter to poison.

export const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');

// Characters a browser silently removes from a URL — C0 controls and DEL. They
// matter because they are stripped AFTER any check we write, so a tab tucked
// inside "/<tab>/evil" passes a naive startsWith("/") and then re-forms as
// "//evil" in the address bar once the browser cleans it up.
// Spelled with new RegExp so the class reads as escape sequences rather than
// raw control bytes, which are invisible in an editor and break on the next edit.
const URL_STRIPPED = new RegExp('[\u0000-\u001f\u007f]', 'g');

// Where to send somebody after they sign in, when the destination came out of a
// query string.
//
// A rooted same-site path is the only safe answer, and "starts with a slash" is
// NOT the same test: the URL parser reads //evil.example as protocol-relative,
// and /\evil.example identically, because backslashes are slashes in a special
// scheme. Both resolve clean off our domain against any base you give them.
//
// Anything that isn't a plain rooted path falls back rather than being repaired.
// A post-login redirect is the single most valuable place to land a phishing
// hop, and it is never worth guessing what a malformed one meant.
export function safeNextPath(value: string | null | undefined, fallback = '/dashboard'): string {
  if (!value) return fallback;
  // Strip first, then test, in the same order the browser does it.
  const stripped = value.replace(URL_STRIPPED, '').trim();
  if (!stripped.startsWith('/')) return fallback;
  if (stripped.startsWith('//') || stripped.startsWith('/\\')) return fallback;
  return stripped;
}
