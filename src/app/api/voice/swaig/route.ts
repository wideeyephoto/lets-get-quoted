import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { voiceReceiptAuthorization } from '@/lib/voice/auth';
import { sendCallerVoiceBookingLinkSms } from '@/lib/sms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function verifySwaigAuth(request: Request): boolean {
  const expected = voiceReceiptAuthorization();
  if (!expected) return false;

  const authHeader = request.headers.get('authorization') || '';
  if (!authHeader.startsWith('Basic ')) return false;

  const b64 = authHeader.slice(6).trim();
  const decoded = Buffer.from(b64, 'base64').toString('utf8');
  const colonIndex = decoded.indexOf(':');
  if (colonIndex === -1) return false;

  const user = decoded.slice(0, colonIndex);
  const pass = decoded.slice(colonIndex + 1);

  return user === expected.username && pass === expected.password;
}

export async function POST(request: Request) {
  if (!verifySwaigAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const accountId = url.searchParams.get('account_id');

  if (!accountId) {
    return NextResponse.json({ error: 'Missing account_id' }, { status: 400 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ response: 'Invalid request payload format.' });
  }

  const fnName = String(body.function || body.action || '').trim();

  // Extract arguments from SWAIG format (which can be inside argument.parsed[0] or direct object)
  const rawArg = body.argument as Record<string, unknown> | undefined;
  const parsedArgList = rawArg?.parsed as unknown[] | undefined;
  const args: Record<string, unknown> = (Array.isArray(parsedArgList) && parsedArgList[0] && typeof parsedArgList[0] === 'object')
    ? (parsedArgList[0] as Record<string, unknown>)
    : (typeof rawArg === 'object' && rawArg !== null)
    ? rawArg
    : {};

  const admin = createAdminClient();

  if (fnName === 'send_booking_link') {
    const callerPhone = String(args.caller_phone || body.caller_id_number || '').trim();
    if (!callerPhone) {
      return NextResponse.json({
        response: 'I could not detect a mobile phone number to text. Could you please tell me your cell phone number?',
      });
    }

    // Resolve booking URL from site settings or default booking portal
    const { data: site } = await admin
      .from('sites')
      .select('subdomain, custom_domain')
      .eq('account_id', accountId)
      .maybeSingle();

    const origin = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.letsgetquoted.com').replace(/\/$/, '');
    let bookingUrl = `${origin}/request-quote`;

    if (site?.custom_domain) {
      bookingUrl = `https://${site.custom_domain}/quote`;
    } else if (site?.subdomain) {
      bookingUrl = `https://${site.subdomain}.letsgetquoted.com/quote`;
    }

    const callId = typeof body.call_id === 'string' ? body.call_id : undefined;
    const sendResult = await sendCallerVoiceBookingLinkSms({
      accountId,
      callerPhone,
      bookingUrl,
      idempotencyKey: callId ? `swaig-booking:${accountId}:${callId}` : undefined,
    });

    if (!sendResult.ok) {
      return NextResponse.json({
        response: "I attempted to send the text message, but we couldn't deliver to that number. We can continue taking down your information over the phone right now.",
      });
    }

    return NextResponse.json({
      response: "I've just texted a direct booking link to your mobile phone. You can use it anytime to choose an appointment slot, or we can continue our conversation right now.",
    });
  }

  if (fnName === 'check_contractor_availability') {
    const { data: voiceSettings } = await admin
      .from('voice_settings')
      .select('business_hours, emergency_enabled')
      .eq('account_id', accountId)
      .maybeSingle();

    const emergency = Boolean(voiceSettings?.emergency_enabled);

    return NextResponse.json({
      response: `Our standard service hours are Monday through Friday, 8:00 AM to 5:00 PM. ${
        emergency
          ? 'We also provide 24/7 priority emergency dispatch for urgent situations like leaks or hazards.'
          : 'For any after-hours requests, our team responds first thing the next business morning.'
      }`,
    });
  }

  return NextResponse.json({
    response: "I've noted that for our team.",
  });
}
