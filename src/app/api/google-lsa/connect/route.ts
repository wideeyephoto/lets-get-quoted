import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireOwnerContext } from '@/lib/auth';
import { buildGoogleAuthorizeUrl, googleLsaConfigured } from '@/lib/google-lsa/oauth';
import {
  buildGoogleLsaState,
  GOOGLE_LSA_STATE_COOKIE,
} from '@/lib/google-lsa/state';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { accountId, userId } = await requireOwnerContext();
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010';
  if (!googleLsaConfigured()) {
    return NextResponse.redirect(new URL('/dashboard/settings?google_lsa=unconfigured#google-local-services', base));
  }

  const nonce = randomBytes(24).toString('base64url');
  const state = buildGoogleLsaState(
    accountId,
    userId,
    nonce,
    '/dashboard/settings#google-local-services',
  );
  const response = NextResponse.redirect(buildGoogleAuthorizeUrl(state));
  response.cookies.set(GOOGLE_LSA_STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return response;
}
