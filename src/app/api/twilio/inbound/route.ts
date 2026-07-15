import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { normalizeUsPhone } from '@/lib/phone';
import { validateTwilioSignature } from '@/lib/sms';

export const runtime = 'nodejs';

const OPT_OUT = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);
const OPT_IN = new Set(['START', 'UNSTOP']);

function twiml(message?: string) {
  const body = message ? `<Message>${message}</Message>` : '';
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, { headers: { 'Content-Type': 'text/xml' } });
}

export async function POST(request: Request) {
  if (!request.headers.get('x-twilio-signature')) return NextResponse.json({ error: 'Invalid signature.' }, { status: 403 });
  const data = await request.formData();
  if (!validateTwilioSignature(request, data)) return NextResponse.json({ error: 'Invalid signature.' }, { status: 403 });
  const phone = normalizeUsPhone(String(data.get('From') || ''));
  const keyword = String(data.get('Body') || '').trim().toUpperCase().split(/\s+/)[0];
  const twilioOptOutType = String(data.get('OptOutType') || '').toUpperCase();
  if (phone && (OPT_OUT.has(keyword) || OPT_IN.has(keyword))) {
    const optedOut = OPT_OUT.has(keyword);
    await createAdminClient().from('sms_consent').update({
      status: optedOut ? 'opted_out' : 'opted_in',
      opted_out_at: optedOut ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq('phone_number', phone);
  }

  // Messaging Services with Advanced Opt-Out send their own keyword response.
  if (twilioOptOutType) return twiml();
  if (OPT_OUT.has(keyword)) return twiml('Let\'s Get Quoted: You are unsubscribed from payment texts. Reply START to resume.');
  if (OPT_IN.has(keyword)) return twiml('Let\'s Get Quoted: Payment text messages have resumed. Reply STOP to opt out.');
  if (keyword === 'HELP') return twiml('Let\'s Get Quoted support: hello@letsgetquoted.com. Reply STOP to opt out. Message and data rates may apply.');
  return twiml();
}