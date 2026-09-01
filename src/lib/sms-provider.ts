import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  beginTextCreditUsage,
  commitTextCreditUsage,
  releaseTextCreditUsage,
  textCreditMode,
  type TextCreditLease,
} from '@/lib/billing/text-credit-usage';
import { billsTextCredits, type SmsSendContext } from '@/lib/sms-billing-policy';
import { releaseUsageOverage } from '@/lib/billing/usage-overage';
import type { TextCreditOverage } from '@/lib/billing/text-credit-usage';
import { trustedProviderCallbackOrigin } from '@/lib/app-origin';

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

/**
 * A definite local billing decision made before a provider request can start.
 *
 * The durable worker uses this type to keep an exhausted workspace terminal
 * and pre-request. Direct callers still receive the same actionable message.
 */
export class SmsBillingRefusalError extends Error {
  override readonly name = 'SmsBillingRefusalError';

  constructor() {
    super('This workspace is out of text credits. Buy a top-up to keep texting.');
  }
}

/**
 * A provider response that proves the message was rejected, rather than a
 * transport failure whose outcome is unknown. Only response classes that are
 * safe to replay may set retryable.
 */
export class SmsProviderRejectedError extends Error {
  override readonly name = 'SmsProviderRejectedError';

  constructor(
    readonly status: number,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/**
 * Billing evidence persisted at the durable request boundary. A carrier call
 * may succeed while its response is lost, so the reservation/overage identity
 * must survive outside this process before the socket opens.
 */
export type SmsUsageEvidence =
  | Readonly<{
      kind: 'reservation';
      reservationId: string;
      finalizationKey: string;
    }>
  | Readonly<{ kind: 'overage'; overageKey: string }>
  | Readonly<{ kind: 'unmetered' }>;

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

/**
 * The one provider-host boundary shared by compatibility messaging and Relay
 * provisioning. Keeping the hostname rule here lets the architecture guard
 * continue proving that no second module can invent a provider destination.
 */
export function normalizeSignalWireSpaceOrigin(raw: string): string | null {
  const entered = raw.trim();
  if (!entered) return null;
  try {
    const parsed = new URL(entered.includes('://') ? entered : `https://${entered}`);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password
        || parsed.port || parsed.search || parsed.hash) return null;
    if (parsed.pathname !== '/' && parsed.pathname !== '') return null;
    // A Space is always hosted at <space>.signalwire.com. The provider's bare
    // marketing/API apex is not a customer Space and must never receive a
    // project's Basic credentials.
    const suffix = '.signalwire.com';
    if (!parsed.hostname.endsWith(suffix)) return null;
    const spaceSubdomain = parsed.hostname.slice(0, -suffix.length);
    if (!spaceSubdomain.split('.').every((label) => (
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)
    ))) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

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

export function twilioCallsUrl(accountSid: string): string {
  return `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Calls.json`;
}

function signalwireConfig(): SmsProviderConfig | null {
  // The Space host is SignalWire's alone — Twilio has no equivalent — which is
  // what makes it a safe thing to infer the provider from. You cannot have a
  // working SignalWire config without it, so "provider = signalwire, no space"
  // is not a state that can be reached.
  const spaceOrigin = normalizeSignalWireSpaceOrigin(process.env.SIGNALWIRE_SPACE_URL || '');
  const projectId = process.env.SIGNALWIRE_PROJECT_ID;
  const apiToken = process.env.SIGNALWIRE_API_TOKEN;
  const senderPoolId = process.env.SIGNALWIRE_NUMBER_GROUP_ID || undefined;
  const from = process.env.SIGNALWIRE_FROM_NUMBER || undefined;
  if (!spaceOrigin || !projectId || !apiToken || (!senderPoolId && !from)) return null;
  return {
    id: 'signalwire',
    authUser: projectId,
    authPassword: apiToken,
    accountPath: projectId,
    // Webhook authentication is a separate credential and never falls back to
    // the API token. Keeping the empty value on this outbound-only structure
    // lets a deployment send while its callback is intentionally still dark;
    // the verifier below reads SIGNALWIRE_SIGNING_KEY independently and fails
    // closed until it is present.
    signingKey: process.env.SIGNALWIRE_SIGNING_KEY || '',
    signatureHeader: SIGNALWIRE_HEADER,
    messagesUrl: `${spaceOrigin}/api/laml/2010-04-01/Accounts/${encodeURIComponent(projectId)}/Messages.json`,
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
  // Only an EMPTY selector may infer the incumbent. A typo during the
  // dual-credential cutover (for example `signalwir`) is still an explicit
  // operator choice; silently treating it as "unset" would put real traffic
  // back on Twilio's number and A2P registration.
  if (requested) return null;
  return available[0] ?? null;
}

/** Resolve an explicitly named outbound provider without fallback. */
export function smsProviderConfigFor(provider: SmsProviderId): SmsProviderConfig | null {
  return configuredSmsProviders().find((config) => config.id === provider) ?? null;
}

/** Whether this deployment can send a text at all. */
export function isSmsProviderConfigured(): boolean {
  return smsProviderConfig() !== null;
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
export function buildSendRequest(
  config: SmsProviderConfig,
  to: string,
  body: string,
  fromOverride?: string,
): SendRequest {
  const data = new URLSearchParams({ To: to, Body: body });
  if (fromOverride) data.set('From', fromOverride);
  else if (config.senderPoolId) data.set('MessagingServiceSid', config.senderPoolId);
  else if (config.from) data.set('From', config.from);

  const origin = trustedProviderCallbackOrigin();
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

// -- the off switch ------------------------------------------------------------

/**
 * The provider id written whenever a message was composed and addressed but
 * deliberately not delivered.
 *
 * Not a real SID and not mistakable for one while reading the ledger, which is
 * the whole reason it is a word. /api/sms/status refuses callbacks carrying it,
 * because provider_id has no unique constraint and one spoofed callback would
 * otherwise mark every simulated row in the database as failed.
 */
export const SIMULATED_PROVIDER_ID = 'simulated';

export type SmsSuppression = 'not-configured' | 'test' | 'preview' | 'switched-off';

export type SmsLaneSuppression = SmsSuppression
  | 'canary-account-not-enabled'
  | 'sender-purpose-not-enabled';

const SMS_ACCOUNT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The exact workspace allow-list shared by every SMS egress lane. */
export function smsCanaryAccounts(): ReadonlySet<string> {
  return new Set(
    (process.env.LGQ_SMS_CANARY_ACCOUNT_IDS || '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter((value) => SMS_ACCOUNT_ID.test(value)),
  );
}

/** Release switch for a sender-number purpose, shared by queued and synchronous egress. */
export function smsSenderPurposeEnabled(purpose: string | null): boolean {
  if (purpose === 'lgq_shared') return process.env.LGQ_SMS_SHARED_ENABLED === '1';
  if (purpose === 'lgq_dispatch') return process.env.LGQ_SMS_DISPATCH_ENABLED === '1';
  if (purpose === 'contractor_dedicated') {
    return process.env.LGQ_SMS_CONTRACTOR_MESSAGING_ENABLED === '1';
  }
  return false;
}

/**
 * Why outbound SMS must not leave this process right now, or null to send.
 *
 * WHY THIS LIVES HERE AND NOT IN THE SENDERS. It used to be one predicate,
 * `isLiveMessagingEnvironment`, consulted by exactly one of the thirty-odd send
 * functions — sendSubcontractorSms. The other twenty-nine checked only whether
 * a provider was configured, so a preview deploy or a staging box holding live
 * credentials WOULD text real customers payment reminders, arrival texts and
 * crew assignments while dutifully simulating subcontractor offers. The switch
 * read like a kill switch and covered about three percent of the sending.
 *
 * A guard that every caller has to remember is not a guard. This one sits at
 * the single fetch instead, so the thirty-first sender is covered on the day it
 * is written and by somebody who has never heard of this comment.
 *
 * ORDER IS DELIBERATE. `not-configured` is tested first and stays a throw,
 * because that is the ordinary local case and twenty-nine callers already
 * record it as a failure — turning it into a silent success would rewrite the
 * meaning of every one of those rows. The three below it are the opposite
 * situation: credentials that exist and work, and must not be used.
 */
export function outboundSmsSuppression(): SmsSuppression | null {
  if (!smsProviderConfig()) return 'not-configured';
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) return 'test';
  if (process.env.VERCEL_ENV === 'preview') return 'preview';
  if (process.env.LGQ_DISABLE_OUTBOUND_SMS === '1') return 'switched-off';
  return null;
}

/**
 * Full outbound lane admission, including the global/test/Preview switch,
 * account canary, and sender-purpose release gate. Carrier-generated reply XML is
 * egress too, so callback routes must use this rather than bypassing the worker.
 */
export function outboundSmsLaneSuppression(
  accountId: string | null,
  senderPurpose: string | null,
): SmsLaneSuppression | null {
  const global = outboundSmsSuppression();
  if (global) return global;
  const canaries = smsCanaryAccounts();
  if (canaries.size > 0
      && (!accountId || !canaries.has(accountId.trim().toLowerCase()))) {
    return 'canary-account-not-enabled';
  }
  if (!smsSenderPurposeEnabled(senderPurpose)) return 'sender-purpose-not-enabled';
  return null;
}

/**
 * The one egress point in the application, and therefore the one place a text
 * credit can be spent.
 *
 * `context` is REQUIRED rather than optional on purpose. Metering at the helper
 * layer would leave every future caller free to skip it; an optional argument
 * here would do the same thing more quietly, by making "unmetered" the default
 * for code nobody has written yet. Because it is required, a new outbound
 * message cannot reach a carrier until someone has said what kind of message it
 * is — and `sms-billing-policy.ts` says what that kind costs.
 */
export async function sendProviderMessage(
  to: string,
  body: string,
  context: SmsSendContext,
  options: Readonly<{
    provider?: SmsProviderId;
    from?: string;
    messageKey?: string;
    /**
     * Durable-worker compare-and-set performed after every local preflight and
     * immediately before the provider socket is opened. Ordinary direct callers
     * omit it and retain their existing behavior.
     */
    beforeRequest?: (usage: SmsUsageEvidence) => Promise<void>;
  }> = {},
): Promise<string> {
  const suppressed = outboundSmsSuppression();
  if (suppressed === 'not-configured') throw new Error('SMS provider is not configured.');
  if (suppressed) {
    // Composed, addressed, and going nowhere. Returning the sentinel rather
    // than throwing keeps the caller's ledger row honest: the message was
    // built and would have gone, which is a different fact from the provider
    // rejecting it, and the two must not land in the same column.
    //
    // Returning HERE, before any reservation, is also why nothing downstream
    // has to remember not to bill a suppressed message.
    console.info(`Outbound SMS suppressed (${suppressed}).`);
    return SIMULATED_PROVIDER_ID;
  }

  const config = options.provider
    ? smsProviderConfigFor(options.provider)
    : smsProviderConfig();
  if (!config) throw new Error('SMS provider is not configured.');

  // Hold the credits before the carrier call, spend them once it is accepted.
  // Dark by default: with the meter off there is no service-role client and no
  // ledger round trip, so a send costs exactly what it cost before.
  const mode = textCreditMode();
  let ledger: SupabaseClient | null = null;
  let lease: TextCreditLease | null = null;
  let overage: TextCreditOverage | null = null;
  if (mode !== 'off' && billsTextCredits(context) && context.accountId) {
    const { createAdminClient } = await import('@/lib/auth');
    ledger = createAdminClient();
    const decision = await beginTextCreditUsage(ledger, {
      accountId: context.accountId,
      body,
      // Fresh per send. Two deliberate sends of the same text are two texts,
      // and the carrier bills both.
      messageKey: options.messageKey ?? `sms:${randomUUID()}`,
    }, {
      mode,
      // Durable deliveries can be quarantined after an ambiguous provider
      // outcome. Keep their hold alive long enough for the minute-level
      // reconciliation worker and an ordinary platform outage; the direct
      // synchronous path retains its short 15-minute safety lease.
      reservationTtlMs: options.beforeRequest ? 24 * 60 * 60 * 1000 : undefined,
    });
    if (decision.outcome === 'refused') {
      throw new SmsBillingRefusalError();
    }
    if (decision.outcome === 'allowed') lease = decision.lease;
    // Out of allowance but within an authorized overage cap. Nothing is held in
    // the credit ledger -- the charge is already accrued -- so the only thing
    // left is to give it back if the carrier refuses the message.
    if (decision.outcome === 'allowed_overage') overage = decision.overage;
  }

  let requestAttempted = false;
  try {
    const request = buildSendRequest(config, to, body, options.from);
    const usage: SmsUsageEvidence = lease
      ? Object.freeze({
        kind: 'reservation' as const,
        reservationId: lease.reservationId,
        finalizationKey: lease.finalizationKey,
      })
      : overage
        ? Object.freeze({ kind: 'overage' as const, overageKey: overage.idempotencyKey })
        : Object.freeze({ kind: 'unmetered' as const });
    if (options.beforeRequest) await options.beforeRequest(usage);
    requestAttempted = true;
    const response = await fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
      signal: AbortSignal.timeout(10000),
    });
    // Read as text, once. Reading as JSON is what threw on non-JSON bodies, and a

    // Response body can only be consumed one time — so there was no second chance
    // to see what actually came back.
    let raw: string;
    try {
      raw = await response.text();
    } catch (error) {
      if (isDefinitiveProviderRejection(response.status)) {
        throw new SmsProviderRejectedError(
          response.status,
          `SMS provider rejected the message (HTTP ${response.status}).`,
          response.status === 429,
        );
      }
      throw error;
    }
    const result = parseSendResponse(response.ok, response.status, raw);
    if ('error' in result) {
      if (isDefinitiveProviderRejection(response.status)) {
        throw new SmsProviderRejectedError(
          response.status,
          result.error,
          response.status === 429,
        );
      }
      throw new Error(result.error);
    }
    if (ledger && lease && !await commitTextCreditUsage(ledger, lease)) {
      // Durable workers stored the lease before opening the socket and their
      // reconciliation pass will retry this exact finalization. Do not turn a
      // provider acceptance into a resend merely because the ledger reply was
      // unavailable.
      console.error('text credit commit is pending durable reconciliation');
    }
    return result.providerId;
  } catch (error) {
    const definitiveRejection = error instanceof SmsProviderRejectedError;
    if (ledger && lease) {
      if (!requestAttempted || definitiveRejection) {
        await releaseTextCreditUsage(ledger, lease, 'send_failed');
      } else if (!await commitTextCreditUsage(ledger, lease)) {
        console.error('indeterminate text credit commit is pending durable reconciliation');
      }
    }
    if (ledger && overage && context.accountId && (!requestAttempted || definitiveRejection)) {
      // Spread rather than restated. Listing the fields is how this one lost
      // `periodStart` when the type gained it -- the release then looked the
      // period up itself, found the wrong one, and gave nothing back.
      await releaseUsageOverage(ledger, { accountId: context.accountId, ...overage });
    }
    throw error;
  }
}

/**
 * A received non-timeout 4xx is positive evidence that the provider declined
 * this request. HTTP 408 is deliberately excluded: an intermediary can time out
 * after the provider accepted work, making replay unsafe just like socket loss.
 */
function isDefinitiveProviderRejection(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408;
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
 * Compatibility form callbacks use HMAC-SHA1/base64 over the full URL plus
 * sorted fields. SignalWire RELAY/SWML/JSON uses HMAC-SHA1/hex over the full
 * URL plus the exact raw body. Both paths follow SignalWire's current SDK test
 * vectors; a JSON object is never re-serialized for verification.
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

export function validateWebhookSignature(
  request: Request,
  body: FormData | string,
): SignatureCheck {
  // The header chooses exactly one independently configured verification key.
  // SignalWire's API token is intentionally not a fallback: its Dashboard
  // exposes a distinct Signing Key and the current SDK documents that key as
  // the webhook credential.
  const signalwire = request.headers.get(SIGNALWIRE_HEADER);
  const twilio = request.headers.get(TWILIO_HEADER);
  const claim = signalwire
    ? {
        provider: 'signalwire' as const,
        signature: signalwire,
        key: process.env.SIGNALWIRE_SIGNING_KEY,
      }
    : twilio
      ? {
          provider: 'twilio' as const,
          signature: twilio,
          key: process.env.TWILIO_AUTH_TOKEN,
        }
      : null;

  if (!claim) return { ok: false, reason: 'missing-header' };
  if (!claim.key) return { ok: false, reason: 'secret-not-configured' };

  const urls = candidateUrls(request);
  if (urls.length === 0) return { ok: false, reason: 'mismatch' };

  // Scheme A — SignalWire RELAY/SWML/JSON. The digest is lowercase hex over
  // the exact raw body. It cannot be reconstructed after JSON parsing.
  if (claim.provider === 'signalwire'
      && typeof body === 'string'
      && urls.some((url) => timingSafeMatch(
        signHex(claim.key!, url + body), claim.signature,
      ))) {
    return { ok: true, provider: claim.provider };
  }

  // Scheme B — Twilio/Compatibility form callbacks. A raw JSON callback may
  // use the documented URL-only signature only when the signed URL carries a
  // matching bodySHA256. Without that binding, a captured URL signature could
  // be replayed with attacker-chosen JSON. Raw form callbacks continue to sign
  // every sorted field, so their body is bound without the query parameter.
  const mediaType = request.headers.get('content-type')
    ?.split(';', 1)[0].trim().toLowerCase() ?? '';
  const rawForm = typeof body === 'string'
    && (mediaType === '' || mediaType === 'application/x-www-form-urlencoded');
  const matches = urls.some((url) => {
    if (typeof body !== 'string') {
      return timingSafeMatch(
        signBase64(claim.key!, url + sortedFormPairs(body)),
        claim.signature,
      );
    }
    if (rawForm && timingSafeMatch(
      signBase64(claim.key!, url + sortedRawFormPairs(body)),
      claim.signature,
    )) {
      return true;
    }
    return bodySha256Matches(url, body)
      && timingSafeMatch(signBase64(claim.key!, url), claim.signature);
  });
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
    // V8's sort is stable: repeated fields keep their submission order, as the
    // SignalWire and Twilio compatibility algorithms require.
    .sort(([leftKey], [rightKey]) => leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0)
    .reduce((result, [key, value]) => `${result}${key}${value}`, '');
}

function sortedRawFormPairs(rawBody: string): string {
  const pairs: Array<readonly [string, string]> = [];
  try {
    new URLSearchParams(rawBody).forEach((value, key) => pairs.push([key, value]));
  } catch {
    return '';
  }
  return pairs
    .sort(([leftKey], [rightKey]) => leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0)
    .reduce((result, [key, value]) => `${result}${key}${value}`, '');
}

function bodySha256Matches(url: string, rawBody: string): boolean {
  const expected = new URL(url).searchParams.get('bodySHA256');
  if (expected === null) return false;
  return timingSafeMatch(createHash('sha256').update(rawBody, 'utf8').digest('hex'), expected);
}

const SIGNED_PROVIDER_CALLBACK_PATHS: ReadonlySet<string> = new Set([
  '/api/sms/inbound',
  '/api/sms/status',
  '/api/sms/voice',
  '/api/sms/voice/status',
  '/api/twilio/inbound',
  '/api/twilio/status',
  '/api/twilio/voice',
  '/api/twilio/voice/status',
  '/api/voice/ai',
  '/api/voice/ai/status',
]);

/**
 * The exact public URL the provider signed.
 *
 * Authority is configuration, never request input: Host and X-Forwarded-* can
 * be supplied by the caller or rewritten by a proxy, so accepting either here
 * lets an attacker choose the string authenticated by the provider HMAC. Only
 * the request's exact allowlisted route and query survive reconstruction.
 *
 * Two candidates, with and without an explicit :443. Both vendors' SDKs hedge
 * the same way and SignalWire's carries a comment saying signature generation
 * on their back end is inconsistent about it. This remains a bounded spelling
 * hedge over one configured HTTPS origin, not a second authority or secret.
 */
function candidateUrls(request: Request): string[] {
  const origin = trustedProviderCallbackOrigin();
  if (!origin) return [];

  try {
    const received = new URL(request.url);
    if (received.hash || !SIGNED_PROVIDER_CALLBACK_PATHS.has(received.pathname)) return [];

    const tail = `${received.pathname}${received.search}`;
    const hostname = new URL(origin).hostname;
    return [`${origin}${tail}`, `https://${hostname}:443${tail}`];
  } catch {
    return [];
  }
}

function signBase64(key: string, payload: string): string {
  return createHmac('sha1', key).update(payload).digest('base64');
}

function signHex(key: string, payload: string): string {
  return createHmac('sha1', key).update(payload, 'utf8').digest('hex');
}

function timingSafeMatch(expected: string, provided: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

// -- what the operator can see -------------------------------------------------

export type SmsProviderSummary = {
  active: SmsProviderId | null;
  /** Set when LGQ_SMS_PROVIDER is invalid or names an unconfigured provider. */
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
  const acceptedSignatureHeaders = [
    process.env.TWILIO_AUTH_TOKEN ? TWILIO_HEADER : null,
    process.env.SIGNALWIRE_SIGNING_KEY ? SIGNALWIRE_HEADER : null,
  ].filter((header): header is string => header !== null);
  return {
    active: active?.id ?? null,
    requestedButUnconfigured: requested && !active ? requested : null,
    configured: configured.map((config) => config.id),
    senderMode: active ? (active.senderPoolId ? 'pool' : 'single-number') : null,
    acceptedSignatureHeaders,
    statusCallbacksEnabled: trustedProviderCallbackOrigin() !== null,
  };
}
