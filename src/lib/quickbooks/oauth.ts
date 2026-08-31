// The QuickBooks Online OAuth round trip.
//
// Intuit's flow is ordinary OAuth 2.0 with two wrinkles that decide the shape of
// everything here:
//
//   1. The refresh token ROTATES. Every refresh returns a new one and
//      invalidates the old. Not writing it back does not fail now — it fails in
//      an hour, when the access token expires and the stored refresh token is
//      already dead. So the refresh path always persists both.
//
//   2. The refresh token expires after 100 DAYS, not 100 days of use. A
//      contractor who connects in January and does not open the page again until
//      May has a dead connection and no way to know why. Stored expiry lets the
//      UI say "reconnect" instead of showing an API error.
//
// Sandbox and production are different HOSTS for the API but the SAME host for
// authorization and token exchange. Getting that backwards produces a working
// connect flow whose first API call 401s, which is a confusing way to spend an
// afternoon.

export type QuickBooksEnvironment = 'sandbox' | 'production';

const AUTHORIZE_URL = 'https://appcenter.intuit.com/connect/oauth2';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke';

const API_HOST: Record<QuickBooksEnvironment, string> = {
  sandbox: 'https://sandbox-quickbooks.api.intuit.com',
  production: 'https://quickbooks.api.intuit.com',
};

// Accounting scope only. `com.intuit.quickbooks.payment` would let us move money
// and we have no reason to — Stripe does that. Asking for less is also the
// difference between an app assessment that asks a few questions and one that
// asks a great many.
const SCOPE = 'com.intuit.quickbooks.accounting';

export function quickBooksEnvironment(): QuickBooksEnvironment {
  return process.env.QUICKBOOKS_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
}

export function quickBooksApiHost(environment: QuickBooksEnvironment = quickBooksEnvironment()): string {
  return API_HOST[environment];
}

/** Configured means: we could actually start a connection right now. */
export function quickBooksConfigured(): boolean {
  return Boolean(process.env.QUICKBOOKS_CLIENT_ID && process.env.QUICKBOOKS_CLIENT_SECRET);
}

/**
 * Where Intuit should send the owner back to.
 *
 * Derived from the app's own configured URL, never from the request — a
 * redirect_uri taken from a caller-supplied host is how an OAuth code gets
 * delivered to somebody else's server. Must match a URI registered on the Intuit
 * app exactly, including the scheme and any trailing slash.
 */
export function quickBooksRedirectUri(): string {
  const explicit = (process.env.QUICKBOOKS_REDIRECT_URI ?? '').trim();
  if (explicit) return explicit;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim().replace(/\/+$/, '');
  const base = appUrl || `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com'}`;
  return `${base}/api/quickbooks/callback`;
}

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.QUICKBOOKS_CLIENT_ID ?? '',
    response_type: 'code',
    scope: SCOPE,
    redirect_uri: quickBooksRedirectUri(),
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

function basicAuthHeader(): string {
  const pair = `${process.env.QUICKBOOKS_CLIENT_ID ?? ''}:${process.env.QUICKBOOKS_CLIENT_SECRET ?? ''}`;
  return `Basic ${Buffer.from(pair).toString('base64')}`;
}

export type QuickBooksTokens = {
  accessToken: string;
  refreshToken: string;
  /** Seconds from now. */
  accessExpiresIn: number;
  refreshExpiresIn: number;
};

type IntuitTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  x_refresh_token_expires_in?: number;
  error?: string;
  error_description?: string;
};

async function requestTokens(body: URLSearchParams): Promise<QuickBooksTokens> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
    // Never cache a credential exchange.
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });


  const payload = (await response.json().catch(() => ({}))) as IntuitTokenResponse;
  if (!response.ok || !payload.access_token || !payload.refresh_token) {
    // Intuit's error bodies are terse and sometimes empty; include the status so
    // a 401 (bad client secret) is distinguishable from a 400 (bad/used code).
    const detail = payload.error_description || payload.error || `HTTP ${response.status}`;
    throw new Error(`QuickBooks token request failed: ${detail}`);
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    // Documented as 3600 and 8726400; defaulted rather than assumed so a missing
    // field can't be stored as an expiry of zero (permanently expired) or NaN.
    accessExpiresIn: Number(payload.expires_in) || 3600,
    refreshExpiresIn: Number(payload.x_refresh_token_expires_in) || 8_726_400,
  };
}

export async function exchangeCodeForTokens(code: string): Promise<QuickBooksTokens> {
  return requestTokens(new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: quickBooksRedirectUri(),
  }));
}

export async function refreshTokens(refreshToken: string): Promise<QuickBooksTokens> {
  return requestTokens(new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  }));
}

/**
 * Tell Intuit to forget the connection.
 *
 * Best-effort on purpose: if this fails we still drop our own row. Leaving a
 * contractor "connected" in our UI because Intuit was unreachable would mean
 * Disconnect visibly does nothing, and the local row is the thing that actually
 * grants us access.
 */
export async function revokeToken(token: string): Promise<boolean> {
  try {
    const response = await fetch(REVOKE_URL, {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ token }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * An access token is treated as expired a few minutes early.
 *
 * A token that passes this check then expires mid-request produces a 401 on a
 * write, and a half-applied sync is much worse than an extra refresh.
 */
export const ACCESS_TOKEN_SKEW_MS = 5 * 60 * 1000;

export function accessTokenExpired(expiresAt: string | Date, now: number = Date.now()): boolean {
  const time = expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();
  if (Number.isNaN(time)) return true;
  return time - ACCESS_TOKEN_SKEW_MS <= now;
}

/** No skew here: a refresh token this close to death still works, and the only remedy is the owner re-authorising. */
export function refreshTokenExpired(expiresAt: string | Date, now: number = Date.now()): boolean {
  const time = expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();
  if (Number.isNaN(time)) return true;
  return time <= now;
}

export function expiryFromNow(seconds: number, now: number = Date.now()): string {
  return new Date(now + seconds * 1000).toISOString();
}
