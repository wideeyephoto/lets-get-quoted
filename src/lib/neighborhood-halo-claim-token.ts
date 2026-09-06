import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_VERSION = 1;
const DEFAULT_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

export type HaloClaimTokenPayload = {
  version: typeof TOKEN_VERSION;
  campaignId: string;
  accountId: string;
  expiresAt: number;
};

function signingKey(): Buffer {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to sign Neighborhood Halo claim tokens.');
  }

  // Domain separation keeps these public-form capabilities distinct from every
  // other HMAC that uses the same server-only root secret.
  return createHash('sha256')
    .update('lgq:neighborhood-halo-claim:v1\0', 'utf8')
    .update(serviceRoleKey, 'utf8')
    .digest();
}

function signatureFor(encodedPayload: string): Buffer {
  return createHmac('sha256', signingKey()).update(encodedPayload, 'utf8').digest();
}

export function createHaloClaimToken(
  campaignId: string,
  accountId: string,
  options: { expiresAt?: number } = {},
): string {
  const normalizedCampaignId = campaignId.trim();
  const normalizedAccountId = accountId.trim();
  if (!normalizedCampaignId || !normalizedAccountId) {
    throw new Error('A campaign and account are required to create a Neighborhood Halo claim token.');
  }

  const expiresAt = options.expiresAt ?? Date.now() + DEFAULT_TOKEN_TTL_MS;
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) {
    throw new Error('Neighborhood Halo claim token expiry must be in the future.');
  }

  const payload: HaloClaimTokenPayload = {
    version: TOKEN_VERSION,
    campaignId: normalizedCampaignId,
    accountId: normalizedAccountId,
    expiresAt,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = signatureFor(encodedPayload).toString('base64url');
  return `${encodedPayload}.${signature}`;
}

/**
 * Verifies an untrusted public-form capability before any service-role client
 * is created. Returns the signed tenant binding on success and null for every
 * malformed, tampered, expired, or misconfigured case.
 */
export function verifyHaloClaimToken(
  token: string | null | undefined,
  expectedCampaignId: string,
  now = Date.now(),
): HaloClaimTokenPayload | null {
  if (!token || !expectedCampaignId) return null;

  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encodedPayload, encodedSignature] = parts;
    if (
      !encodedPayload
      || !encodedSignature
      || !BASE64URL_PATTERN.test(encodedPayload)
      || !BASE64URL_PATTERN.test(encodedSignature)
    ) {
      return null;
    }

    const provided = Buffer.from(encodedSignature, 'base64url');
    const expected = signatureFor(encodedPayload);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

    const parsed = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as Partial<HaloClaimTokenPayload>;
    if (
      parsed.version !== TOKEN_VERSION
      || typeof parsed.campaignId !== 'string'
      || parsed.campaignId !== expectedCampaignId
      || typeof parsed.accountId !== 'string'
      || !parsed.accountId
      || typeof parsed.expiresAt !== 'number'
      || !Number.isSafeInteger(parsed.expiresAt)
      || parsed.expiresAt <= now
    ) {
      return null;
    }

    return parsed as HaloClaimTokenPayload;
  } catch {
    return null;
  }
}
