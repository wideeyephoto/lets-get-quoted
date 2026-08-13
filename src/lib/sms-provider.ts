import { createHmac, timingSafeEqual } from 'crypto';

/**
 * EVERY provider-shaped fact in the application lives in this file.
 *
 * That is the whole point of it. Before, the REST endpoint, the auth scheme,
 * the signature algorithm and the header name were spread between lib/sms.ts
 * and four route files, and the only way to find them was to grep for the word
 * "twilio" — which finds the comments and misses the couplings, because the
 * couplings are things like the literal string `MessagingServiceSid` and the
 * assumption that a response body is JSON.
 *
 * WHY A CONFIG STRUCT AND NOT AN INTERFACE WITH TWO IMPLEMENTATIONS.
 *
 * Twilio and SignalWire agree on nearly all of it: a form-encoded POST with
 * PascalCase To/Body/From/MessagingServiceSid/StatusCallback, a `sid` on
 * success, HMAC-SHA1-base64 over the URL followed by sorted key+value pairs,
 * and the same <Message>/<Dial>/<Number>/<Say> verbs coming back. They
 * disagree on about six values. A class per provider would restate every
 * agreement in order to isolate the disagreements, and would hide which six
 * they are. A struct makes the differences the only thing in the file.
 *
 * WHAT IS DELIBERATELY NOT HERE. TwiML/cXML generation — the verbs in use are
 * shared, so abstracting them buys nothing. And number provisioning: SignalWire
 * does that on a different API surface entirely (Relay REST, /api/relay/rest),
 * not the 2010-04-01 compatibility surface this file speaks.
 */

export type SmsProviderId = 'twilio' | 'signalwire';

export type SmsProviderConfig = {
  id: SmsProviderId;

  /** HTTP Basic username. Twilio: the Account SID. SignalWire: the Project ID (a UUID). */
  authUser: string;
  /** HTTP Basic password. Twilio: the Auth Token. SignalWire: the API Token. */
  authPassword: string;

  /**
   * The {AccountSid} PATH SEGMENT of the REST URL.
   *
   * Kept separate from authUser even though both providers currently make them
   * equal, because Twilio's own recommended scheme does not: an API Key SID
   * goes in the username while the Account SID stays in the path, and a
   * subaccount call uses parent credentials against a child path. Collapsing
   * these into one field is a rewrite waiting to happen the first time somebody
   * stops using the account token directly.
   */
  accountPath: string;

  /**
   * The HMAC key for INBOUND webhook signatures.
   *
   * On Twilio this is the same string as authPassword — the auth token does
   * double duty. On SignalWire the credentials page exposes a signing key
   * distinct from the API token, so this is its own field rather than
   * authPassword reused. Conflating them is how TWILIO_AUTH_TOKEN ended up
   * doing three unrelated jobs.
   */
  signingKey: string;

  /** Lowercased header this provider signs into. */
  signatureHeader: string;

  /** Fully-built create-message endpoint. */
  messagesUrl: string;

  /**
   * A pool of sending numbers, sent as the `MessagingServiceSid` parameter on
   * both providers — but the VALUE is not the same kind of thing. Twilio wants
   * a Messaging Service SID, `MG` + 32 hex, 34 characters. SignalWire wants a
   * Number Group id, a 36-character hyphenated UUID provisioned through
   * /api/relay/rest/number_groups, which is not this API. Never validate the
   * shape of this string; never move it between providers.
   */
  senderPoolId?: string;

  /** Single sending number, used when there is no pool. */
  from?: string;
};

const TWILIO_HEADER = 'x-twilio-signature';
const SIGNALWIRE_HEADER = 'x-signalwire-signature';

// ABOUT THE `.json` SUFFIX ON BOTH URLs BELOW.
//
// Twilio's 2010-04-01 API returns XML unless the resource path ends in `.json`,
// so it is mandatory there. SignalWire's current reference shows the bare path
// with no suffix and documents no content-negotiation mechanism at all — the
// `.json` examples that used to exist live on two doc hosts that now redirect
// away. Its own responses carry a `.json`-suffixed `uri` field, which is the
// only real evidence either way.
//
// So: send `.json` to both, and make parseSendResponse read a <Sid> out of XML
// if that guess turns out to be wrong. A wrong suffix must not look like a
// failed send — see the note on that function for why that specific mistake is
// the expensive one.

function twilioConfig(): SmsProviderConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const senderPoolId = process.env.TWILIO_MESSAGING_SERVICE_SID || undefined;
  const from = process.env.TWILIO_FROM_NUMBER || undefined;
  if (!accountSid || !authToken || (!senderPoolId && !from)) return null;
  return {
    id: 'twilio',
    authUser: accountSid,
    authPassword: authToken,
    accountPath: accountSid,
    signingKey: authToken,
    signatureHeader: TWILIO_HEADER,
    messagesUrl: `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
    senderPoolId,
    from,
  };
}

function signalwireConfig(): SmsProviderConfig | null {
  // The Space host is SignalWire's alone — Twilio has no equivalent — which is
  // what makes it a safe thing to infer the provider from. You cannot have a
  // working SignalWire config without it, so "provider = signalwire, no space"
  // is not a state that can be reached.
  const space = (process.env.SIGNALWIRE_SPACE_URL || '')
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
  const projectId = process.env.SIGNALWIRE_PROJECT_ID;
  const apiToken = process.env.SIGNALWIRE_API_TOKEN;
  const senderPoolId = process.env.SIGNALWIRE_NUMBER_GROUP_ID || undefined;
  const from = process.env.SIGNALWIRE_FROM_NUMBER || undefined;
  if (!space || !projectId || !apiToken || (!senderPoolId && !from)) return null;
  return {
    id: 'signalwire',
    authUser: projectId,
    authPassword: apiToken,
    accountPath: projectId,
    // Falls back to the API token deliberately. SignalWire's credentials page
    // exposes a separate signing key, but their prose docs never state which
    // secret signs a webhook, and their own SDK's validateRequest takes "the
    // auth token". One of the two is right; both are secrets we hold; and
    // exactly one is tried per request, chosen here at config time rather than
    // guessed per request. If inbound starts returning `mismatch` on the health
    // card, set SIGNALWIRE_SIGNING_KEY explicitly — that is the whole fix.
    signingKey: process.env.SIGNALWIRE_SIGNING_KEY || apiToken,
    signatureHeader: SIGNALWIRE_HEADER,
    messagesUrl: `https://${space}/api/laml/2010-04-01/Accounts/${encodeURIComponent(projectId)}/Messages.json`,
    senderPoolId,
    from,
  };
}

/** Every provider whose credentials are completely present, incumbent first. */
export function configuredSmsProviders(): SmsProviderConfig[] {
  return [twilioConfig(), signalwireConfig()].filter((config): config is SmsProviderConfig => config !== null);
}

/**
 * The provider outbound messages go through, or null when none is usable.
 *
 * Replaces twilioConfiguration(). Resolution is INFERRED from which credentials
 * are present, because that makes the broken states unrepresentable: there is
 * no way to select a provider whose secrets are absent, which is the failure a
 * database toggle or a bare env flag invites.
 *
 * LGQ_SMS_PROVIDER exists for exactly one situation — the migration window,
 * when BOTH credential sets are deliberately present because inbound has to
 * validate webhooks signed by either. It is a tiebreaker and nothing else.
 *
 * Two rules that look small and are not:
 *
 *   - An explicit request for a provider that is not configured returns NULL,
 *     not the other provider. Quietly sending through the incumbent would put
 *     customer texts on the wrong number, under the wrong A2P registration,
 *     while the operator believes they have cut over.
 *
 *   - With both configured and no tiebreaker set, the INCUMBENT wins. Never
 *     drift toward the new thing on your own; a cutover is a decision somebody
 *     makes, not one that happens because a second set of variables appeared.
 */
export function smsProviderConfig(): SmsProviderConfig | null {
  const requested = (process.env.LGQ_SMS_PROVIDER || '').trim().toLowerCase();
  const available = configuredSmsProviders();
  if (requested === 'twilio' || requested === 'signalwire') {
    return available.find((config) => config.id === requested) ?? null;
  }
  return available[0] ?? null;
}

/** Whether this deployment can send a text at all. */
export function isSmsProviderConfigured(): boolean {
  return smsProviderConfig() !== null;
}

function appOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  // http origins get no callback: the provider would post delivery status in
  // the clear to an address it cannot verify, and localhost is not reachable
  // from their side anyway.
  return raw?.startsWith('https://') ? raw : null;
}

export type SendRequest = { url: string; headers: Record<string, string>; body: URLSearchParams };

/**
 * Everything about a send except the network call.
 *
 * Split out so the URL, the auth header and the body — which ARE the provider
 * coupling — can be asserted on in a test with no fetch stub and no possible
 * egress. A test that has to mock fetch to check a URL is a test that can send
 * a real message the day somebody's mock stops matching.
 */
export function buildSendRequest(config: SmsProviderConfig, to: string, body: string): SendRequest {
  const data = new URLSearchParams({ To: to, Body: body });
  if (config.senderPoolId) data.set('MessagingServiceSid', config.senderPoolId);
  else if (config.from) data.set('From', config.from);

  const origin = appOrigin();
  if (origin) data.set('StatusCallback', `${origin}/api/sms/status`);

  return {
    url: config.messagesUrl,
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.authUser}:${config.authPassword}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: data,
  };
}

/**
 * A provider's answer, turned into an id or a reason — never into a throw from
 * the parser itself.
 *
 * THE BUG THIS REPLACES. The old code did `await response.json()`
 * unconditionally. A 502 HTML page from a CDN, a proxy timeout, a plain-text
 * gateway error — any of them made JSON.parse throw, and the string that ended
 * up in sms_events.error_reason was "Unexpected token < in JSON at position 0",
 * which tells whoever reads it precisely nothing about a text that did not
 * arrive. It matters more now: SignalWire's error envelope is not documented,
 * so assuming a `message` field is a guess.
 *
 * THE XML FALLBACK IS NOT DEFENSIVE PROGRAMMING FOR ITS OWN SAKE. If the
 * `.json` suffix turns out not to be honored, the provider returns 200 with an
 * XML body describing a message it really did send. Treating that as a failure
 * would be the worst available outcome: the caller records a failure and a
 * retry sends the customer a second copy. Reading the <Sid> out costs four
 * lines and turns a duplicate-text incident into a log line.
 */
// Every field either provider is known to put an explanation in. `message` is
// Twilio's; the other two are guesses, because SignalWire's error envelope is
// not documented — which is the reason the excerpt fallback below exists.
type ProviderEnvelope = { sid?: unknown; message?: unknown; error_message?: unknown; detail?: unknown };

export function parseSendResponse(ok: boolean, status: number, raw: string): { providerId: string } | { error: string } {
  let parsed: ProviderEnvelope | null = null;
  try {
    parsed = JSON.parse(raw) as ProviderEnvelope;
  } catch {
    parsed = null;
  }

  const sid = typeof parsed?.sid === 'string' && parsed.sid ? parsed.sid : xmlSid(raw);
  if (ok && sid) return { providerId: sid };

  const reported = [parsed?.message, parsed?.error_message, parsed?.detail].find(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  );
  if (reported) return { error: reported };

  // No usable envelope. Say what actually happened — the status, and enough of
  // the body to recognize a Cloudflare page or an HTML login redirect.
  const excerpt = raw.trim().replace(/\s+/g, ' ').slice(0, 200);
  if (ok) return { error: `SMS provider returned ${status} with no message id${excerpt ? `: ${excerpt}` : '.'}` };
  return { error: `SMS provider rejected the message (HTTP ${status})${excerpt ? `: ${excerpt}` : '.'}` };
}

function xmlSid(raw: string): string | null {
  const match = /<Sid>([^<]+)<\/Sid>/i.exec(raw);
  return match ? match[1].trim() : null;
}

/** The one egress point in the application. */
export async function sendProviderMessage(to: string, body: string): Promise<string> {
  const config = smsProviderConfig();
  if (!config) throw new Error('SMS provider is not configured.');
  const request = buildSendRequest(config, to, body);

  const response = await fetch(request.url, { method: 'POST', headers: request.headers, body: request.body });
  // Read as text, once. Reading as JSON is what threw on non-JSON bodies, and a
  // Response body can only be consumed one time — so there was no second chance
  // to see what actually came back.
  const raw = await response.text();
  const result = parseSendResponse(response.ok, response.status, raw);
  if ('error' in result) throw new Error(result.error);
  return result.providerId;
}

// -- inbound signatures --------------------------------------------------------

export type SignatureCheck =
  | { ok: true; provider: SmsProviderId }
  | { ok: false; reason: 'missing-header' | 'secret-not-configured' | 'mismatch' };

/**
 * Whether this webhook really came from the provider it claims to be.
 *
 * THE RULE: the header selects exactly one secret. It never selects zero, and
 * it never selects two.
 *
 * This is not "try every key we hold and accept whichever verifies". The header
 * chooses WHICH key must verify, not WHETHER one must. There is no branch that
 * skips the HMAC, and no branch that retries against a different secret after a
 * mismatch. An attacker who sets the header controls only which of two secrets
 * they have to forge against, and they hold neither.
 *
 * Both providers use the same primitive — HMAC-SHA1, base64, over the full URL
 * followed by every form field as key+value, sorted. That is confirmed by
 * reading both SDKs, not by assuming compatibility; SignalWire's prose docs
 * never state the algorithm at all, which is exactly why `mismatch` is a
 * distinguishable outcome and shows up on the admin health card.
 *
 * The three reasons are separate because they mean different things at 2am.
 * `secret-not-configured` means a provider console was pointed at this app
 * before its signing key was deployed — a five-second fix if the log says so,
 * and a two-hour outage if the log just says "invalid signature".
 */
/**
 * Is there a signature to check at all?
 *
 * Separate from validateWebhookSignature so a route can reject before calling
 * request.formData() — an unauthenticated caller should not get us to parse a
 * multipart body for them.
 */
export function hasSignatureHeader(request: Request): boolean {
  return request.headers.get(SIGNALWIRE_HEADER) !== null || request.headers.get(TWILIO_HEADER) !== null;
}

export function validateWebhookSignature(request: Request, data: FormData): SignatureCheck {
  // SignalWire's SDK reads its own header and falls back to Twilio's, so it may
  // send both. Prefer the specific one; either way only one key is tried.
  const signalwire = request.headers.get(SIGNALWIRE_HEADER);
  const twilio = request.headers.get(TWILIO_HEADER);

  const claim = signalwire
    ? { provider: 'signalwire' as const, signature: signalwire, key: signalwireConfig()?.signingKey }
    : twilio
      ? { provider: 'twilio' as const, signature: twilio, key: twilioConfig()?.signingKey ?? process.env.TWILIO_AUTH_TOKEN }
      : null;

  if (!claim) return { ok: false, reason: 'missing-header' };
  if (!claim.key) return { ok: false, reason: 'secret-not-configured' };

  const key = claim.key;
  const suffix = sortedFormPairs(data);
  const matches = candidateUrls(request).some((url) => timingSafeMatch(sign(key, url + suffix), claim.signature));
  return matches ? { ok: true, provider: claim.provider } : { ok: false, reason: 'mismatch' };
}

/**
 * Form fields as one concatenated key+value string, sorted by key then value.
 *
 * Sorted with a plain code-unit comparison, which is what both SDKs do
 * (`Array.prototype.sort()` with no comparator). This used to be
 * `localeCompare`, which agrees with code-unit ordering for every field name
 * these providers actually send — so nothing was broken — but only by luck:
 * the two orderings differ whenever an uppercase letter is compared against a
 * lowercase one at the same position, and the provider decides the field names,
 * not us.
 */
function sortedFormPairs(data: FormData): string {
  return [...data.entries()]
    .map(([key, value]) => [key, String(value)] as const)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0,
    )
    .reduce((result, [key, value]) => `${result}${key}${value}`, '');
}

/**
 * The URL the provider signed, as best we can reconstruct it behind a proxy.
 *
 * Two candidates, with and without an explicit default port. Both vendors' SDKs
 * hedge the same way and SignalWire's carries a comment saying signature
 * generation on their back end is inconsistent about it. This is a bounded,
 * named hedge over the ONE key the header already selected — two spellings of
 * the same URL, not a second secret.
 */
function candidateUrls(request: Request): string[] {
  const url = new URL(request.url);
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
  if (forwardedProto) url.protocol = `${forwardedProto}:`;
  if (forwardedHost) url.host = forwardedHost;

  // Built by string concatenation, NOT by setting url.port.
  //
  // WHATWG URL normalizes a default port out of existence: assigning
  // `url.port = '443'` to an https URL leaves url.port as '' and toString()
  // unchanged, so the "hedge" was two identical strings and hedged nothing.
  // Both vendors' SDKs assemble this by hand for the same reason.
  const canonical = url.toString();
  const authority = `${url.protocol}//${url.hostname}`;
  const tail = `${url.pathname}${url.search}${url.hash}`;
  const alternate = url.port
    ? `${authority}${tail}` // an explicit non-default port: try it removed
    : `${authority}:${url.protocol === 'https:' ? '443' : '80'}${tail}`; // none: try the default made explicit

  return [canonical, alternate];
}

function sign(key: string, payload: string): string {
  return createHmac('sha1', key).update(payload).digest('base64');
}

function timingSafeMatch(expected: string, provided: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

// -- what the operator can see -------------------------------------------------

export type SmsProviderSummary = {
  active: SmsProviderId | null;
  /** Set when LGQ_SMS_PROVIDER names a provider whose credentials are absent. */
  requestedButUnconfigured: string | null;
  configured: SmsProviderId[];
  senderMode: 'pool' | 'single-number' | null;
  /** Headers an inbound webhook may present today. During a cutover, both. */
  acceptedSignatureHeaders: string[];
  /** False when NEXT_PUBLIC_APP_URL is not https, in which case no delivery status is ever received. */
  statusCallbacksEnabled: boolean;
};

/**
 * What is true about messaging right now, for the admin health card.
 *
 * Deliberately a read, not a control. The credentials live in the environment
 * — a sending token in Postgres is a token in every pg_dump, every dashboard
 * session and every service-role read, which in this codebase means every admin
 * page and every webhook route — so a database toggle could only ever point at
 * secrets it does not hold, and would let one click select a provider that
 * cannot send. The flip is `LGQ_SMS_PROVIDER` plus a deploy: an atomic,
 * timestamped, revertible boundary, which is what you want the day a status
 * callback signed by the old provider arrives four minutes after the change.
 *
 * The single most useful line here during a cutover is acceptedSignatureHeaders.
 */
export function smsProviderSummary(): SmsProviderSummary {
  const requested = (process.env.LGQ_SMS_PROVIDER || '').trim().toLowerCase();
  const configured = configuredSmsProviders();
  const active = smsProviderConfig();
  const named = requested === 'twilio' || requested === 'signalwire';
  return {
    active: active?.id ?? null,
    requestedButUnconfigured: named && !active ? requested : null,
    configured: configured.map((config) => config.id),
    senderMode: active ? (active.senderPoolId ? 'pool' : 'single-number') : null,
    acceptedSignatureHeaders: configured.map((config) => config.signatureHeader),
    statusCallbacksEnabled: appOrigin() !== null,
  };
}
