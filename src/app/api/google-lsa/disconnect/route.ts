import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient, requireOwnerContext } from '@/lib/auth';
import { deleteGoogleLsaConnection } from '@/lib/google-lsa/connection';
import { revokeGoogleToken } from '@/lib/google-lsa/oauth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const { accountId } = await requireOwnerContext();

  try {
    const { data } = await createAdminClient()
      .from('google_lsa_connections')
      .select('refresh_token')
      .eq('account_id', accountId)
      .maybeSingle();
    const refreshToken = (data as { refresh_token?: string } | null)?.refresh_token;
    if (refreshToken) await revokeGoogleToken(refreshToken);
  } catch {
    // A missing migration or an unreachable revoke endpoint never prevents the
    // local credential from being removed.
  }

  await deleteGoogleLsaConnection(accountId).catch(() => undefined);
  return NextResponse.redirect(
    new URL('/dashboard/settings?google_lsa=disconnected#google-local-services', request.nextUrl.origin),
    { status: 303 },
  );
}
