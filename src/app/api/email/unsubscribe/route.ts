import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { parseUnsubscribeToken, suppressEmail } from '@/lib/email-suppression';

export const dynamic = 'force-dynamic';

// RFC 8058 one-click unsubscribe target named in the List-Unsubscribe header.
// Gmail/Yahoo/Apple Mail POST here directly (body: List-Unsubscribe=One-Click)
// when a recipient taps the native "Unsubscribe" button — no page, no session.
// Verifies the signed token and records the opt-out with the service-role client.
export async function POST(request: Request) {
  // Always 200: mailbox providers treat a non-2xx one-click response as a failed
  // unsubscribe and may badge the sender. A bad token (or any unexpected error,
  // e.g. missing service-role env) simply means there's nothing to suppress.
  try {
    const token = new URL(request.url).searchParams.get('token');
    const decoded = parseUnsubscribeToken(token);
    if (decoded) {
      const admin = createAdminClient();
      await suppressEmail(admin, decoded.accountId, decoded.email, 'one_click_unsubscribe');
    }
  } catch (err) {
    console.error('One-click unsubscribe error (returning 200 anyway):', err);
  }
  return new NextResponse(null, { status: 200 });
}

// A few clients follow the header URL with a GET; send them to the friendly
// confirmation page rather than 405-ing.
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token');
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');
  const target = token ? `${base}/unsubscribe?token=${encodeURIComponent(token)}` : `${base}/unsubscribe?error=1`;
  return NextResponse.redirect(target, { status: 302 });
}
