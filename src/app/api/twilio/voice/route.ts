import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { validateTwilioSignature } from '@/lib/sms';

export const runtime = 'nodejs';

function escapeXml(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function xml(inner: string) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, { headers: { 'Content-Type': 'text/xml' } });
}
function appOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL || `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com'}`;
  return raw.replace(/\/$/, '');
}

// Voice webhook for a contractor's tracking number. Rings their real line; the
// dial's action callback (voice/status) handles a no-answer by texting the caller
// back and logging a missed-call lead. Point the number's Voice URL here.
export async function POST(request: Request) {
  const data = await request.formData();
  if (!validateTwilioSignature(request, data)) return NextResponse.json({ error: 'Invalid signature.' }, { status: 403 });

  const to = String(data.get('To') ?? '');
  const admin = createAdminClient();
  const { data: account } = await admin
    .from('accounts')
    .select('id, call_forward_number, call_tracking_verified_at')
    .eq('call_tracking_number', to)
    .maybeSingle();

  // call_textback_enabled is deliberately NOT read here.
  //
  // It used to be, and switching the automation off stopped the dial entirely:
  // a contractor who put the tracking number on their van and later turned this
  // off had callers reaching a recording saying nobody could take the call. The
  // switch governs the TEXT, which is what it says it does — see
  // voice/status, where it is now enforced. A phone number keeps being a phone
  // number.
  if (!account || !account.call_forward_number) {
    return xml('<Say>Sorry, we can&apos;t take your call right now. Please try again later.</Say>');
  }

  // First real call on this number is the only proof the Voice webhook is
  // pointed at us — nothing else is visible from our side. Stamped once, best
  // effort: failing to record it must never drop somebody's call.
  if (!account.call_tracking_verified_at) {
    admin
      .from('accounts')
      .update({ call_tracking_verified_at: new Date().toISOString() })
      .eq('id', account.id)
      .is('call_tracking_verified_at', null)
      .then(undefined, () => {});
  }

  const action = `${appOrigin()}/api/twilio/voice/status?account=${account.id}`;
  // callerId is the (owned) tracking number so the contractor sees a consistent
  // caller; timeout then fires the action callback for the missed-call text-back.
  return xml(
    `<Dial timeout="20" callerId="${escapeXml(to)}" action="${escapeXml(action)}" method="POST"><Number>${escapeXml(String(account.call_forward_number))}</Number></Dial>`,
  );
}
