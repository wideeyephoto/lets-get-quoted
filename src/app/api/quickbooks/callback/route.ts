import { NextResponse, type NextRequest } from 'next/server';
import { requireOwnerContext } from '@/lib/auth';
import { exchangeCodeForTokens, quickBooksApiHost } from '@/lib/quickbooks/oauth';
import { saveConnection } from '@/lib/quickbooks/connection';
import { STATE_COOKIE, verifyState } from '@/lib/quickbooks/state';

// Where Intuit sends the owner back with an authorization code.
export const dynamic = 'force-dynamic';

const SETTINGS = '/dashboard/settings#quickbooks';

function back(request: NextRequest, params: Record<string, string>): NextResponse {
  const url = new URL(SETTINGS, request.nextUrl.origin);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = NextResponse.redirect(url);
  // One-shot: the nonce is spent whether this succeeded or not.
  response.cookies.delete(STATE_COOKIE);
  return response;
}

/** The company's own name, for the UI. Best-effort — a connection is still valid without it. */
async function fetchCompanyName(realmId: string, accessToken: string): Promise<string | null> {
  try {
    const response = await fetch(`${quickBooksApiHost()}/v3/company/${realmId}/companyinfo/${realmId}?minorversion=70`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { CompanyInfo?: { CompanyName?: string } };
    return payload.CompanyInfo?.CompanyName?.trim() || null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { accountId, userEmail } = await requireOwnerContext();
  const params = request.nextUrl.searchParams;

  // The owner pressed Cancel on Intuit's consent screen. Not an error.
  if (params.get('error')) {
    return back(request, { quickbooks: 'cancelled' });
  }

  const code = params.get('code');
  const realmId = params.get('realmId');
  const state = params.get('state') ?? '';
  const nonce = request.cookies.get(STATE_COOKIE)?.value ?? '';

  // Verified BEFORE the code is spent. The state is what ties this callback to
  // the account that started the flow — without it, a code obtained elsewhere
  // could be delivered here and attach someone else's books to this account.
  if (!verifyState(state, accountId, nonce)) {
    return back(request, { quickbooks: 'state' });
  }
  if (!code || !realmId) {
    return back(request, { quickbooks: 'failed' });
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const companyName = await fetchCompanyName(realmId, tokens.accessToken);
    await saveConnection({
      accountId,
      realmId,
      companyName,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessExpiresIn: tokens.accessExpiresIn,
      refreshExpiresIn: tokens.refreshExpiresIn,
      connectedBy: userEmail,
    });
    return back(request, { quickbooks: 'connected' });
  } catch (error) {
    // Deliberately not surfaced to the browser: Intuit's messages quote the
    // request back, and this one carried an authorization code.
    console.error('QuickBooks callback failed:', error);
    return back(request, { quickbooks: 'failed' });
  }
}
