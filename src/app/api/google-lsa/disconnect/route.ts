import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient, requireOwnerContext } from '@/lib/auth';
import { deleteGoogleLsaConnection } from '@/lib/google-lsa/connection';
import { revokeGoogleToken } from '@/lib/google-lsa/oauth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const { accountId } = await requireOwnerContext();
  let revokeConfirmed = false;

  try {
    const { data } = await createAdminClient()
      .from('google_lsa_connections')
      .select('refresh_token')
      .eq('account_id', accountId)
      .maybeSingle();
    const refreshToken = (data as { refresh_token?: string } | null)?.refresh_token;
    revokeConfirmed = refreshToken ? await revokeGoogleToken(refreshToken) : true;
  } catch {
    // Remote revocation is best-effort. Local deletion below is authoritative:
    // once that succeeds no future import can use the credential.
  }

  try {
    await deleteGoogleLsaConnection(accountId);
  } catch {
    return NextResponse.redirect(
      new URL('/dashboard/settings?google_lsa=disconnect-failed#google-local-services', request.nextUrl.origin),
      { status: 303 },
    );
  }
  return NextResponse.redirect(
    new URL(`/dashboard/settings?google_lsa=${revokeConfirmed ? 'disconnected' : 'disconnected-local'}#google-local-services`, request.nextUrl.origin),
    { status: 303 },
  );
}
