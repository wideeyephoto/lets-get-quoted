import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { parseUnsubscribeToken, suppressEmail } from '@/lib/email-suppression';
import { logWebhookFailure } from '@/lib/webhook-failures';

export const dynamic = 'force-dynamic';

// RFC 8058 one-click unsubscribe target named in the List-Unsubscribe header.
// Gmail/Yahoo/Apple Mail POST here directly (body: List-Unsubscribe=One-Click)
// when a recipient taps the native "Unsubscribe" button — no page, no session.
// Verifies the signed token and records the opt-out with the service-role client.
export async function POST(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get('token');
    const decoded = parseUnsubscribeToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid unsubscribe token' }, { status: 400 });
    }
    const admin = createAdminClient();
    const ok = await suppressEmail(admin, decoded.accountId, decoded.email, 'one_click_unsubscribe');
    if (!ok) {
      await logWebhookFailure({
        source: 'resend',
        eventType: 'one_click_unsubscribe',
        referenceId: `${decoded.accountId}:${decoded.email}`,
        errorMessage: 'suppressEmail returned false during one-click unsubscribe',
      });
      return NextResponse.json({ error: 'Failed to record unsubscribe' }, { status: 500 });
    }
  } catch (err) {
    console.error('One-click unsubscribe error:', err);
    await logWebhookFailure({
      source: 'resend',
      eventType: 'one_click_unsubscribe',
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Internal error processing unsubscribe' }, { status: 500 });
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
