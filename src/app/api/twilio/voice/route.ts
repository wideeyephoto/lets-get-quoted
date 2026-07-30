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
    .select('id, call_forward_number, call_textback_enabled')
    .eq('call_tracking_number', to)
    .maybeSingle();

  if (!account || !account.call_textback_enabled || !account.call_forward_number) {
    return xml('<Say>Sorry, we can&apos;t take your call right now. Please try again later.</Say>');
  }

  const action = `${appOrigin()}/api/twilio/voice/status?account=${account.id}`;
  // callerId is the (owned) tracking number so the contractor sees a consistent
  // caller; timeout then fires the action callback for the missed-call text-back.
  return xml(
    `<Dial timeout="20" callerId="${escapeXml(to)}" action="${escapeXml(action)}" method="POST"><Number>${escapeXml(String(account.call_forward_number))}</Number></Dial>`,
  );
}
