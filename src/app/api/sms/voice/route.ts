import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { hasSignatureHeader, validateWebhookSignature } from '@/lib/sms-provider';
import { logWebhookFailure } from '@/lib/webhook-failures';

export const runtime = 'nodejs';

function escapeXml(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function xml(inner: string, status = 200) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, {
    status,
    headers: { 'Content-Type': 'text/xml' },
  });
}
function appOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL || `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com'}`;
  return raw.replace(/\/$/, '');
}

// Voice webhook for a contractor's tracking number. Rings their real line; the
// dial's action callback (voice/status) handles a no-answer by texting the caller
// back and logging a missed-call lead. Point the number's Voice URL here.
export async function POST(request: Request) {
  // Both voice routes used to reject a bad signature with a bare JSON 403 and
  // no log anywhere. So a misconfigured signing key meant every call to a
  // tracking number was silently refused and missed-call text-back simply
  // stopped, with nothing on the Command Center and nothing in the failure
  // table to find. Part of why: webhook_failures.source had no value these
  // routes were allowed to write. It does now — 'sms_voice'.
  if (!hasSignatureHeader(request)) {
    await logWebhookFailure({ source: 'sms_voice', errorMessage: 'Missing provider signature header' });
    return xml('', 403);
  }
  const data = await request.formData();
  const check = validateWebhookSignature(request, data);
  if (!check.ok) {
    await logWebhookFailure({
      source: 'sms_voice',
      referenceId: String(data.get('CallSid') || '') || null,
      errorMessage: `Signature validation failed: ${check.reason}`,
    });
    return xml('', 403);
  }

  try {
    return await dispatchVoiceCall(request, data);
  } catch (err) {
    console.error('Voice webhook handler threw:', err);
    await logWebhookFailure({
      source: 'sms_voice',
      referenceId: String(data.get('CallSid') || '') || null,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    // A caller is on the line. Say something rather than returning a 500 that
    // the provider turns into dead air or a retry.
    return xml('<Say voice="man">Sorry, we can&apos;t take your call right now. Please try again later.</Say>');
  }
}

async function dispatchVoiceCall(request: Request, data: FormData): Promise<NextResponse> {
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
    // voice is pinned. <Say> defaults to a male voice on Twilio and a female
    // one on SignalWire, so leaving it unset means the recording a caller hears
    // changes gender the day the provider changes — a difference nobody would
    // think to test for and every returning caller would notice.
    return xml('<Say voice="man">Sorry, we can&apos;t take your call right now. Please try again later.</Say>');
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

  // Built from the request's OWN path rather than a literal.
  //
  // This route answers on two paths — /api/sms/voice and the permanent
  // /api/twilio/voice alias — and the action URL is inside the HMAC the
  // provider signs. A hard-coded literal means a call that arrived on the alias
  // gets an action URL in the other family, so the dial-completion leg is
  // signed over one URL and validated against another: a 403 on precisely the
  // callback that decides whether a missed call gets a text back.
  const action = `${appOrigin()}${new URL(request.url).pathname}/status?account=${account.id}`;
  // callerId is the (owned) tracking number so the contractor sees a consistent
  // caller; timeout then fires the action callback for the missed-call text-back.
  return xml(
    `<Dial timeout="20" callerId="${escapeXml(to)}" action="${escapeXml(action)}" method="POST"><Number>${escapeXml(String(account.call_forward_number))}</Number></Dial>`,
  );
}
