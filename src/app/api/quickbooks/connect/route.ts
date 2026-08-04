import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { requireOwnerContext } from '@/lib/auth';
import { buildAuthorizeUrl, quickBooksConfigured } from '@/lib/quickbooks/oauth';
import { buildState, STATE_COOKIE } from '@/lib/quickbooks/state';

// Start the QuickBooks connection. This is the "Connect/Reconnect URL"
// registered on the Intuit app, so it has to work both from our own Settings
// button and from a cold link out of QuickBooks itself — which means it cannot
// assume anything about where the visitor came from, only that they must be a
// signed-in owner by the time they leave here.
//
// The state helpers live in lib/quickbooks/state: a Route Handler may export
// only the HTTP verbs, and anything else fails the production build.
export const dynamic = 'force-dynamic';

export async function GET() {
  const { accountId } = await requireOwnerContext();

  if (!quickBooksConfigured()) {
    const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010';
    return NextResponse.redirect(new URL('/dashboard/settings?quickbooks=unconfigured#quickbooks', base));
  }

  const nonce = randomBytes(16).toString('hex');
  const response = NextResponse.redirect(buildAuthorizeUrl(buildState(accountId, nonce)));
  response.cookies.set(STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // Must survive the top-level redirect BACK from Intuit.
    path: '/',
    maxAge: 600,
  });
  return response;
}
