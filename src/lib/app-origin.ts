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
function resolveSafeAppOrigin(): string {
  const raw = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return raw;
    }
  } catch {
    // Fall back to default localhost origin on malformed / placeholder environment variable
  }
  return 'http://localhost:3010';
}

export const APP_ORIGIN = resolveSafeAppOrigin();

type PublicOriginEnvironment = Readonly<Record<string, string | undefined>>;

function validHostname(value: string): boolean {
  return value.length > 0
    && value.length <= 253
    && value.split('.').every((label) => (
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)
    ));
}

/**
 * The HTTPS origin allowed to receive provider callbacks and callback secrets.
 *
 * Ordinary links may use APP_ORIGIN's localhost fallback. Provider callbacks
 * cannot: SignalWire can attach a reusable Basic credential and a call
 * transcript, while SMS delivery callbacks are the only durable carrier
 * evidence. Require an explicit, bare HTTPS origin inside LGQ's configured DNS
 * namespace so a typo cannot send either to an unrelated host.
 */
export function trustedProviderCallbackOrigin(
  env: PublicOriginEnvironment = process.env,
): string | null {
  let raw = (env.SIGNALWIRE_WEBHOOK_ORIGIN ?? env.PROVIDER_CALLBACK_ORIGIN ?? env.NEXT_PUBLIC_APP_URL ?? '').trim();
  const root = (env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'letsgetquoted.com')
    .trim().toLowerCase();
  if (!validHostname(root)) return null;

  if (!raw) return null;

  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.port
        || (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash
        || !validHostname(hostname)
        || (hostname !== root && !hostname.endsWith(`.${root}`))) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

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
