import { NextResponse, type NextRequest } from 'next/server';
import { requireOwnerContext } from '@/lib/auth';
import { discoverGoogleLsaCustomers } from '@/lib/google-lsa/api';
import { saveGoogleLsaAuthorization } from '@/lib/google-lsa/connection';
import { exchangeGoogleCode } from '@/lib/google-lsa/oauth';
import {
  GOOGLE_LSA_STATE_COOKIE,
  verifyGoogleLsaState,
} from '@/lib/google-lsa/state';

export const dynamic = 'force-dynamic';

function back(request: NextRequest, notice: string): NextResponse {
  const url = new URL('/dashboard/settings', request.nextUrl.origin);
  url.searchParams.set('google_lsa', notice);
  url.hash = 'google-local-services';
  const response = NextResponse.redirect(url);
  response.cookies.delete(GOOGLE_LSA_STATE_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const { accountId, userId } = await requireOwnerContext();
  const params = request.nextUrl.searchParams;
  if (params.get('error')) return back(request, 'cancelled');

  const state = params.get('state') ?? '';
  const nonce = request.cookies.get(GOOGLE_LSA_STATE_COOKIE)?.value ?? '';
  if (!verifyGoogleLsaState(state, accountId, userId, nonce)) return back(request, 'state');

  const code = params.get('code');
  if (!code) return back(request, 'failed');
  try {
    const tokens = await exchangeGoogleCode(code);
    const discovered = await discoverGoogleLsaCustomers({ accessToken: tokens.accessToken });
    await saveGoogleLsaAuthorization({
      accountId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessExpiresIn: tokens.accessExpiresIn,
      connectedBy: userId,
      candidates: discovered.map((candidate) => ({
        customerId: candidate.customerId,
        customerName: candidate.descriptiveName,
        timeZone: candidate.timeZone,
        loginCustomerId: candidate.loginCustomerId,
        campaignId: candidate.campaign.id,
        campaignMode: candidate.campaignKind,
      })),
    });
    return back(request, 'connected');
  } catch (error) {
    // OAuth codes and token responses never reach the browser or logs.
    console.error('Google Local Services callback failed:', error instanceof Error ? error.message : 'Unknown error');
    return back(request, 'failed');
  }
}
