import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { normalizeUsPhone } from '@/lib/phone';
import { validateTwilioSignature } from '@/lib/sms';
import { logInboundMessage } from '@/lib/messages';
import { confirmUpcomingAppointment } from '@/lib/reminders';
import { resolveOfferReply } from '@/lib/estimate-offers-data';
import { resolveRescheduleReply } from '@/lib/reschedule-offers-data';
import { logWebhookFailure } from '@/lib/webhook-failures';

export const runtime = 'nodejs';

const OPT_OUT = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);
const OPT_IN = new Set(['START', 'UNSTOP']);
// Reply keywords that confirm an upcoming appointment (from the reminder text).
const CONFIRM = new Set(['C', 'CONFIRM', 'CONFIRMED', 'YES']);

// Escape XML metacharacters so a DB-sourced name/business/label (interpolated
// below) can't malform the TwiML with a stray &, <, or >.
function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function twiml(message?: string) {
  const body = message ? `<Message>${escapeXml(message)}</Message>` : '';
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, { headers: { 'Content-Type': 'text/xml' } });
}

export async function POST(request: Request) {
  if (!request.headers.get('x-twilio-signature')) {
    await logWebhookFailure({ source: 'twilio_inbound', errorMessage: 'Missing x-twilio-signature header' });
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 403 });
  }
  const data = await request.formData();
  if (!validateTwilioSignature(request, data)) {
    await logWebhookFailure({
      source: 'twilio_inbound',
      referenceId: String(data.get('MessageSid') || '') || null,
      errorMessage: 'Signature validation failed',
    });
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 403 });
  }
  // A signature-verified request that then throws mid-dispatch still has to
  // come back as valid, empty TwiML — never an error status — or Twilio will
  // retry the whole webhook and a customer could get a duplicate auto-reply.
  // Same reasoning as the individual try/catches below, just covering the
  // rest of the body too.
  try {
    return await dispatchInboundSms(data);
  } catch (err) {
    console.error('Twilio inbound webhook handler threw:', err);
    await logWebhookFailure({
      source: 'twilio_inbound',
      referenceId: String(data.get('MessageSid') || '') || null,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return twiml();
  }
}

async function dispatchInboundSms(data: FormData): Promise<NextResponse> {
  const phone = normalizeUsPhone(String(data.get('From') || ''));
  // The number they texted. On one shared platform number this tells us nothing
  // yet, but it is the ONLY signal that identifies a contractor exactly, so it
  // is read and passed down rather than left for later — see the routing in
  // resolveAccountForInbound.
  const toNumber = String(data.get('To') || '').trim() || null;
  const rawBody = String(data.get('Body') || '').trim();
  const keyword = rawBody.toUpperCase().split(/\s+/)[0];
  const twilioOptOutType = String(data.get('OptOutType') || '').toUpperCase();

  // Photos. Twilio sends NumMedia plus MediaUrl0..N, and this webhook ignored
  // all of it — so a homeowner sending a picture of a leaking valve produced a
  // message with no indication anything was attached.
  //
  // Capped at Twilio's own maximum of 10 rather than trusting NumMedia, which
  // arrives as form data on a public endpoint and would otherwise size a loop.
  const mediaCount = Math.min(Math.max(0, Number(data.get('NumMedia')) || 0), 10);
  const mediaUrls: string[] = [];
  for (let index = 0; index < mediaCount; index += 1) {
    const url = String(data.get(`MediaUrl${index}`) || '').trim();
    if (url.startsWith('https://')) mediaUrls.push(url);
  }

  // Store every real inbound message (not the opt-out/opt-in keywords) into the
  // two-way inbox. Best-effort: never let a logging failure break the webhook,
  // or Twilio would retry and the customer could get a duplicate auto-reply.
  //
  // A picture with no caption is still a message — hence the body OR media test,
  // where it used to require a body and dropped photo-only texts entirely.
  if (phone && (rawBody || mediaUrls.length > 0) && !OPT_OUT.has(keyword) && !OPT_IN.has(keyword) && keyword !== 'HELP') {
    try {
      await logInboundMessage(createAdminClient(), {
        phone,
        body: rawBody,
        providerId: String(data.get('MessageSid') || '') || null,
        mediaUrls,
        toNumber,
      });
    } catch (error) {
      console.error('Failed to log inbound SMS:', error instanceof Error ? error.message : error);
    }
  }

  // An outstanding estimate offer answers first.
  //
  // It shares the word YES with appointment confirmation below, and it has to
  // win: an offer is a question we asked this person minutes ago about a slot we
  // are actively holding for them, so their "yes" is far more likely to mean
  // that than to mean "confirm the appointment I already have". Opt-out and HELP
  // keywords are excluded so STOP can never be read as an answer.
  if (phone && rawBody && !OPT_OUT.has(keyword) && !OPT_IN.has(keyword) && keyword !== 'HELP') {
    const outcome = await resolveOfferReply(phone, rawBody);
    if (outcome.handled) return twiml(outcome.reply ?? undefined);

    // Then an outstanding "can we move you" — same argument, one step weaker.
    // It also shares YES with appointment confirmation, and it has to win for
    // the same reason: we asked this person a direct question and are waiting on
    // the answer. It sits BELOW estimate offers because an estimate offer holds
    // a slot on a clock, so if somehow both are open, the one with a deadline
    // gets the yes.
    //
    // Ordering matters against CONFIRM below in the other direction too: read as
    // a confirmation, a "yes" meant for this would tell the customer their
    // ORIGINAL appointment is confirmed — the exact opposite of what they just
    // agreed to, and they would not find out until nobody turned up.
    const moved = await resolveRescheduleReply(phone, rawBody);
    if (moved.handled) return twiml(moved.reply ?? undefined);
  }

  // Appointment confirmation: "C"/"confirm"/"yes" marks the client's upcoming
  // scheduled job confirmed and replies. If there's nothing to confirm, fall
  // through — the text was already logged as an ordinary inbound message.
  if (phone && CONFIRM.has(keyword)) {
    try {
      const result = await confirmUpcomingAppointment(createAdminClient(), phone, toNumber);
      if (result.confirmed && result.job) {
        const greeting = result.job.clientFirst ? `Thanks ${result.job.clientFirst}` : 'Thanks';
        return twiml(`${greeting} — your appointment ${result.job.whenLabel} with ${result.job.businessName} is confirmed. See you then!`);
      }
    } catch (error) {
      console.error('Appointment confirmation failed:', error instanceof Error ? error.message : error);
    }
  }

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
  if (OPT_OUT.has(keyword)) return twiml('Let\'s Get Quoted: You are unsubscribed and will no longer receive texts. Reply START to resume.');
  if (OPT_IN.has(keyword)) return twiml('Let\'s Get Quoted: You are re-subscribed and will receive texts again. Reply STOP to opt out.');
  if (keyword === 'HELP') return twiml('Let\'s Get Quoted support: hello@letsgetquoted.com. Reply STOP to opt out. Message and data rates may apply.');
  return twiml();
}