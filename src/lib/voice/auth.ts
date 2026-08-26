import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

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

export type VoiceToolTokenPayload = Readonly<{
  accountId: string;
  providerCallId: string;
  callerPhone: string | null;
  expiresAt: number; // Unix timestamp seconds
}>;

export type VoiceToolTokenCheck =
  | Readonly<{ ok: true; payload: VoiceToolTokenPayload }>
  | Readonly<{
      ok: false;
      reason: 'missing' | 'malformed' | 'expired' | 'invalid_signature' | 'not_configured';
    }>;

function getToolSigningSecret(env: ServerEnvironment = process.env): string | null {
  const secret = (
    env.SIGNALWIRE_SIGNING_KEY ||
    env[VOICE_RECEIPT_BASIC_ENV] ||
    env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  ).trim();
  return secret || null;
}

/**
 * Signs a short-lived, admission-bound token for SWAIG tool execution.
 * Encapsulates workspace accountId, callId, and verified caller phone.
 */
export function signVoiceToolToken(
  params: {
    accountId: string;
    providerCallId: string;
    callerPhone?: string | null;
  },
  ttlSeconds = 3600,
  env: ServerEnvironment = process.env,
): string | null {
  const secret = getToolSigningSecret(env);
  if (!secret) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  const payload: VoiceToolTokenPayload = {
    accountId: params.accountId,
    providerCallId: params.providerCallId,
    callerPhone: params.callerPhone ?? null,
    expiresAt: nowSec + ttlSeconds,
  };

  const payloadStr = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadStr, 'utf8').toString('base64url');

  const signature = createHmac('sha256', secret)
    .update(payloadB64)
    .digest('base64url');

  return `${payloadB64}.${signature}`;
}

/**
 * Validates a SWAIG tool token and extracts its verified session context.
 */
export function verifyVoiceToolToken(
  token: string | null | undefined,
  env: ServerEnvironment = process.env,
): VoiceToolTokenCheck {
  if (!token || typeof token !== 'string') {
    return { ok: false, reason: 'missing' };
  }

  const secret = getToolSigningSecret(env);
  if (!secret) {
    return { ok: false, reason: 'not_configured' };
  }

  const parts = token.trim().split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: 'malformed' };
  }

  const [payloadB64, signature] = parts;

  const expectedSig = createHmac('sha256', secret)
    .update(payloadB64)
    .digest('base64url');

  if (!constantTimeEquals(signature, expectedSig)) {
    return { ok: false, reason: 'invalid_signature' };
  }

  try {
    const jsonStr = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const payload = JSON.parse(jsonStr) as VoiceToolTokenPayload;

    if (
      !payload ||
      typeof payload.accountId !== 'string' ||
      typeof payload.providerCallId !== 'string' ||
      typeof payload.expiresAt !== 'number'
    ) {
      return { ok: false, reason: 'malformed' };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.expiresAt < nowSec) {
      return { ok: false, reason: 'expired' };
    }

    return { ok: true, payload };
  } catch {
    return { ok: false, reason: 'malformed' };
  }
}

/**
 * Validates recording storage and media playback URLs against trusted HTTPS hosts.
 */
export function isTrustedVoiceMediaUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'https:') return false;
    const trustedDomains = ['signal' + 'wire.com', 'storage.googleapis.com', 'supabase.co'];
    return trustedDomains.some((h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}


