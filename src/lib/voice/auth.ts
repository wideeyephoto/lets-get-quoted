import 'server-only';

import { timingSafeEqual } from 'node:crypto';

import {
  hasSignatureHeader,
  validateWebhookSignature,
  type SignatureCheck,
} from '@/lib/sms-provider';

/**
 * Authentication for the two SignalWire voice callbacks.
 *
 * They deliberately do not share a credential or a verification scheme:
 *
 * - inbound compatibility/SWML requests carry the provider HMAC;
 * - post-conversation receipts carry dedicated HTTP Basic credentials.
 *
 * Keeping that split here prevents a future route from applying the messaging
 * signature verifier to an unsigned JSON receipt, or accepting a receipt secret
 * as proof that an inbound call came from the provider.
 */

export const VOICE_RECEIPT_BASIC_ENV = 'LGQ_VOICE_RECEIPT_BASIC' as const;
export const SIGNALWIRE_PROJECT_ID_ENV = 'SIGNALWIRE_PROJECT_ID' as const;
export const SIGNALWIRE_SPACE_ID_ENV = 'SIGNALWIRE_SPACE_ID' as const;

const SIGNALWIRE_SCOPE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ServerEnvironment = Readonly<Record<string, string | undefined>>;

export type VoiceReceiptAuthorization = Readonly<{
  scheme: 'basic';
  username: string;
  password: string;
}>;

export type VoiceReceiptAuthorizationCheck =
  | Readonly<{ ok: true }>
  | Readonly<{
    ok: false;
    reason: 'not_configured' | 'missing' | 'malformed' | 'mismatch';
  }>;

export type SignalWireVoiceScope = Readonly<{
  projectId: string;
  spaceId: string;
}>;

/**
 * Exact provider tenancy the unsigned receipt must name. Both identifiers are
 * UUID resources observed in SignalWire's payload. A partial or malformed
 * scope is no scope at all: admission must not start a billable agent whose
 * receipt could not later be attributed safely.
 */
export function signalWireVoiceScope(
  env: ServerEnvironment = process.env,
): SignalWireVoiceScope | null {
  const projectId = (env[SIGNALWIRE_PROJECT_ID_ENV] ?? '').trim();
  const spaceId = (env[SIGNALWIRE_SPACE_ID_ENV] ?? '').trim();
  if (!SIGNALWIRE_SCOPE_ID.test(projectId) || !SIGNALWIRE_SCOPE_ID.test(spaceId)) return null;
  return Object.freeze({ projectId: projectId.toLowerCase(), spaceId: spaceId.toLowerCase() });
}

function constantTimeEquals(leftValue: string, rightValue: string): boolean {
  const left = Buffer.from(leftValue, 'utf8');
  const right = Buffer.from(rightValue, 'utf8');
  if (left.length !== right.length) {
    // Do a real comparison even on a length mismatch so this branch does not
    // turn the secret length into an early-return timing oracle.
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

/**
 * Parse the one environment value without ever placing it in a URL.
 *
 * Split on the first colon so a generated password may contain colons. Empty
 * usernames and passwords are rejected: SignalWire would still serialize
 * them, but they are not a credential worth trusting a billing receipt to.
 */
export function voiceReceiptAuthorization(
  env: ServerEnvironment = process.env,
): VoiceReceiptAuthorization | null {
  const raw = (env[VOICE_RECEIPT_BASIC_ENV] ?? '').trim();
  const separator = raw.indexOf(':');
  if (separator <= 0 || separator === raw.length - 1) return null;

  const username = raw.slice(0, separator);
  const password = raw.slice(separator + 1);
  return Object.freeze({ scheme: 'basic' as const, username, password });
}

/** Verify a SignalWire compatibility callback before parsing its form body. */
export function verifySignedVoiceWebhook(
  request: Request,
  rawBody: string,
): SignatureCheck {
  if (!hasSignatureHeader(request)) return { ok: false, reason: 'missing-header' };
  const check = validateWebhookSignature(request, rawBody);
  // /api/voice/ai renders SignalWire SWML and can incur SignalWire AI cost.
  // The shared compatibility verifier intentionally accepts Twilio during an
  // SMS cutover, but that must not let a valid callback from another carrier
  // cross this provider-specific admission boundary.
  return check.ok && check.provider !== 'signalwire'
    ? { ok: false, reason: 'mismatch' }
    : check;
}

/** Verify the end-of-call receipt's dedicated Basic credential. */
export function verifyVoiceReceiptAuthorization(
  request: Request,
  env: ServerEnvironment = process.env,
): VoiceReceiptAuthorizationCheck {
  const expected = voiceReceiptAuthorization(env);
  if (!expected) return Object.freeze({ ok: false as const, reason: 'not_configured' as const });

  const header = request.headers.get('authorization');
  if (!header) return Object.freeze({ ok: false as const, reason: 'missing' as const });

  const match = /^Basic\s+([^\s]+)$/i.exec(header);
  if (!match) return Object.freeze({ ok: false as const, reason: 'malformed' as const });

  let presented: string;
  try {
    presented = Buffer.from(match[1], 'base64').toString('utf8');
  } catch {
    return Object.freeze({ ok: false as const, reason: 'malformed' as const });
  }

  // Buffer's base64 decoder is intentionally permissive. Round-tripping keeps
  // malformed input from being accepted as a valid credential by accident.
  const canonical = Buffer.from(presented, 'utf8').toString('base64').replace(/=+$/, '');
  if (canonical !== match[1].replace(/=+$/, '')) {
    return Object.freeze({ ok: false as const, reason: 'malformed' as const });
  }

  const expectedRaw = `${expected.username}:${expected.password}`;
  return constantTimeEquals(presented, expectedRaw)
    ? Object.freeze({ ok: true as const })
    : Object.freeze({ ok: false as const, reason: 'mismatch' as const });
}

/** Presence-only diagnostics safe to show on the admin health page. */
export function voiceWebhookSecuritySummary(env: ServerEnvironment = process.env) {
  const projectId = (env[SIGNALWIRE_PROJECT_ID_ENV] ?? '').trim();
  const spaceId = (env[SIGNALWIRE_SPACE_ID_ENV] ?? '').trim();
  return Object.freeze({
    inboundSigningConfigured: Boolean((env.SIGNALWIRE_SIGNING_KEY ?? '').trim()),
    receiptBasicConfigured: voiceReceiptAuthorization(env) !== null,
    projectScopeConfigured: SIGNALWIRE_SCOPE_ID.test(projectId),
    spaceScopeConfigured: SIGNALWIRE_SCOPE_ID.test(spaceId),
  });
}
