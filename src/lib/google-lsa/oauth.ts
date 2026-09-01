import type { GoogleLsaFetch, GoogleOAuthTokens } from './types';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

export const GOOGLE_ADS_SCOPE = 'https://www.googleapis.com/auth/adwords';

/** Configured means both OAuth and Google Ads API requests can run. */
export function googleLsaConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_ADS_CLIENT_ID
      && process.env.GOOGLE_ADS_CLIENT_SECRET
      && process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
  );
}

/**
 * The redirect URI is app configuration, never request-derived input.
 * It must exactly match a URI registered in Google Cloud Console.
 */
export function googleLsaRedirectUri(): string {
  const explicit = (process.env.GOOGLE_LSA_REDIRECT_URI ?? '').trim();
  if (explicit) return explicit;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim().replace(/\/+$/, '');
  const base = appUrl || `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com'}`;
  return `${base}/api/google-lsa/callback`;
}

export function buildGoogleAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID ?? '',
    redirect_uri: googleLsaRedirectUri(),
    response_type: 'code',
    scope: GOOGLE_ADS_SCOPE,
    access_type: 'offline',
    // Google otherwise often omits a refresh token after a previous consent.
    prompt: 'consent',
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

type GoogleTokenWireResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

export class GoogleOAuthError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.name = 'GoogleOAuthError';
    this.status = status;
    this.code = code;
  }
}

/** A new authorization grant is useful only when Google says the grant itself is dead. */
export function googleOAuthRequiresReconnect(error: unknown): boolean {
  return error instanceof GoogleOAuthError && error.code === 'invalid_grant';
}

async function requestGoogleTokens(
  body: URLSearchParams,
  previousRefreshToken: string | null,
  fetchImpl: GoogleLsaFetch,
): Promise<GoogleOAuthTokens> {
  let response: Response;
  try {
    response = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Network request failed.';
    throw new GoogleOAuthError(`Google OAuth token request failed: ${detail}`, 0, null);
  }

  const payload = (await response.json().catch(() => ({}))) as GoogleTokenWireResponse;
  const refreshToken = payload.refresh_token || previousRefreshToken;
  if (!response.ok || !payload.access_token || !refreshToken) {
    const detail = payload.error_description || payload.error || `HTTP ${response.status}`;
    throw new GoogleOAuthError(
      `Google OAuth token request failed: ${detail}`,
      response.status,
      payload.error || null,
    );
  }

  return {
    accessToken: payload.access_token,
    // Google commonly omits refresh_token on refresh. Retaining the known-good
    // token is essential; replacing it with null breaks the next hourly refresh.
    refreshToken,
    accessExpiresIn: Number(payload.expires_in) || 3_600,
    scope: payload.scope || null,
    tokenType: payload.token_type || 'Bearer',
  };
}

export async function exchangeGoogleCode(
  code: string,
  fetchImpl: GoogleLsaFetch = fetch,
): Promise<GoogleOAuthTokens> {
  return requestGoogleTokens(new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_ADS_CLIENT_ID ?? '',
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET ?? '',
    redirect_uri: googleLsaRedirectUri(),
    grant_type: 'authorization_code',
  }), null, fetchImpl);
}

export async function refreshGoogleTokens(
  refreshToken: string,
  fetchImpl: GoogleLsaFetch = fetch,
): Promise<GoogleOAuthTokens> {
  return requestGoogleTokens(new URLSearchParams({
    refresh_token: refreshToken,
    client_id: process.env.GOOGLE_ADS_CLIENT_ID ?? '',
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET ?? '',
    grant_type: 'refresh_token',
  }), refreshToken, fetchImpl);
}

/** Best-effort remote revocation; callers should still delete their local connection. */
export async function revokeGoogleToken(
  token: string,
  fetchImpl: GoogleLsaFetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetchImpl(REVOKE_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ token }).toString(),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export const GOOGLE_ACCESS_TOKEN_SKEW_MS = 5 * 60 * 1_000;

export function googleAccessTokenExpired(expiresAt: string | Date, now: number = Date.now()): boolean {
  const time = expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();
  return Number.isNaN(time) || time - GOOGLE_ACCESS_TOKEN_SKEW_MS <= now;
}

export function googleExpiryFromNow(seconds: number, now: number = Date.now()): string {
  return new Date(now + seconds * 1_000).toISOString();
}
