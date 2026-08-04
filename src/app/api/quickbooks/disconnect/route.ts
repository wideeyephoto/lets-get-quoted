import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient, requireOwnerContext } from '@/lib/auth';
import { revokeToken } from '@/lib/quickbooks/oauth';
import { deleteConnection } from '@/lib/quickbooks/connection';

// The "Disconnect URL" registered on the Intuit app, and the target of the
// Disconnect button in Settings.
//
// POST only. A GET disconnect is a link any page could prefetch, and browsers
// and mail clients do prefetch links.
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const { accountId } = await requireOwnerContext();

  // Revoke at Intuit first, so a contractor who disconnects has actually
  // withdrawn our access rather than only hidden it from themselves. Best
  // effort — the local row is what grants us access, so it goes either way.
  try {
    const { data } = await createAdminClient()
      .from('quickbooks_connections')
      .select('refresh_token')
      .eq('account_id', accountId)
      .maybeSingle();
    const token = (data as { refresh_token?: string } | null)?.refresh_token;
    if (token) await revokeToken(token);
  } catch {
    // A missing table or unreadable row still means "remove what we have".
  }

  await deleteConnection(accountId);
  return NextResponse.redirect(new URL('/dashboard/settings?quickbooks=disconnected#quickbooks', request.nextUrl.origin), { status: 303 });
}
