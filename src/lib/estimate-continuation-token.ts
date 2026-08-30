import crypto from 'node:crypto';

export interface EstimateContinuationTurn {
  role: 'user' | 'assistant';
  content: unknown;
}

export interface EstimateContinuationData {
  siteId: string;
  turn: number;
  schemaVersion: '2026-08-30';
  expiresAt: number; // Unix epoch ms
  history: unknown[]; // Array of top-level Responses API items (user messages + assistant output items)
}

function getContinuationSecret(): Buffer {
  const secret = process.env.ESTIMATE_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('ESTIMATE_TOKEN_SECRET or SUPABASE_SERVICE_ROLE_KEY must be set in production');
  }
  const effectiveSecret = secret || 'default-dev-estimate-continuation-secret-32-chars!!';
  return crypto.createHash('sha256').update(`lgq:estimate-continuation-v2:${effectiveSecret}`).digest();
}

/**
 * Creates an opaque, server-signed and AES-256-GCM encrypted continuation token
 * carrying verified conversation history for stateless OpenAI multi-turn estimation.
 */
export function createContinuationToken(data: Omit<EstimateContinuationData, 'schemaVersion' | 'expiresAt'> & { ttlMs?: number }): string {
  const key = getContinuationSecret();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const payload: EstimateContinuationData = {
    siteId: data.siteId,
    turn: data.turn,
    schemaVersion: '2026-08-30',
    expiresAt: Date.now() + (data.ttlMs ?? 30 * 60 * 1000), // Default 30 min TTL
    history: data.history,
  };

  const jsonStr = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(jsonStr, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts and verifies the opaque continuation token, ensuring it matches
 * the active siteId, has not expired, and has a valid structure.
 */
export function verifyContinuationToken(token: string | null | undefined, expectedSiteId: string): EstimateContinuationData | null {
  if (!token || typeof token !== 'string') return null;

  try {
    const parts = token.split(':');
    if (parts.length !== 3) return null;
    const [ivHex, tagHex, dataHex] = parts;

    const key = getContinuationSecret();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));

    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
    const parsed: EstimateContinuationData = JSON.parse(decrypted.toString('utf8'));

    if (parsed.schemaVersion !== '2026-08-30') return null;
    if (Date.now() > parsed.expiresAt) return null;
    if (expectedSiteId && parsed.siteId !== expectedSiteId) return null;
    if (!Array.isArray(parsed.history)) return null;

    return parsed;
  } catch {
    return null;
  }
}
