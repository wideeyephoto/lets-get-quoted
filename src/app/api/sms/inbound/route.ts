import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { normalizeUsPhone } from '@/lib/phone';
import { hasSignatureHeader, validateWebhookSignature } from '@/lib/sms-provider';
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
// below) can't malform the reply markup with a stray &, <, or >.
function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function twiml(message?: string) {
  const body = message ? `<Message>${escapeXml(message)}</Message>` : '';
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, { headers: { 'Content-Type': 'text/xml' } });
}

// Rejections answer in the provider's own language too. A JSON error body to
// something that only speaks TwiML/cXML is not wrong so much as unreadable in
// the one log the operator will actually be looking at.
function rejected() {
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
    status: 403,
    headers: { 'Content-Type': 'text/xml' },
  });
}

export async function POST(request: Request) {
  if (!hasSignatureHeader(request)) {
    await logWebhookFailure({ source: 'sms_inbound', errorMessage: 'Missing provider signature header' });
    return rejected();
  }
  const data = await request.formData();
  const check = validateWebhookSignature(request, data);
  if (!check.ok) {
    // The REASON is logged, not just the fact. `secret-not-configured` means a
    // provider console was pointed here before its signing key was deployed —
    // a five-second fix when the log says so, and a long silent outage when the
    // log only says "invalid signature".
    await logWebhookFailure({
      source: 'sms_inbound',
      referenceId: String(data.get('MessageSid') || '') || null,
      errorMessage: `Signature validation failed: ${check.reason}`,
    });
    return rejected();
  }
  // A signature-verified request that then throws mid-dispatch still has to
  // come back as valid, empty markup — never an error status — or the provider
  // will retry the whole webhook and a customer could get a duplicate
  // auto-reply. Same reasoning as the individual try/catches below, just
  // covering the rest of the body too.
  try {
    return await dispatchInboundSms(data);
  } catch (err) {
    console.error('Inbound SMS webhook handler threw:', err);
    await logWebhookFailure({
      source: 'sms_inbound',
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
  // Advanced Opt-Out is a Twilio Messaging Service feature: when it answers a
  // STOP itself it tells us so here, and we must not send a second reply.
  // SignalWire has no counterpart, so on SignalWire this is always absent and
  // the keyword replies below are the only ones the customer gets — which is
  // the correct behavior either way, not a fallback.
  const providerOptOutType = String(data.get('OptOutType') || '').toUpperCase();

  // Photos. Providers send NumMedia plus MediaUrl0..N, and this webhook ignored
  // all of it — so a homeowner sending a picture of a leaking valve produced a
  // message with no indication anything was attached.
  //
  // Capped at 10 rather than trusting NumMedia, which arrives as form data on a
  // public endpoint and would otherwise size a loop. Ten is Twilio's per-message
  // maximum; SignalWire's is eight, so the cap stays correct for both.
  const mediaCount = Math.min(Math.max(0, Number(data.get('NumMedia')) || 0), 10);
  const mediaUrls: string[] = [];
  for (let index = 0; index < mediaCount; index += 1) {
    const url = String(data.get(`MediaUrl${index}`) || '').trim();
    if (url.startsWith('https://')) mediaUrls.push(url);
  }

  // Store every real inbound message (not the opt-out/opt-in keywords) into the
  // two-way inbox. Best-effort: never let a logging failure break the webhook,
  // or the provider would retry and the customer could get a duplicate
  // auto-reply.
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

  // The provider already sent its own keyword response — don't send a second.
  if (providerOptOutType) return twiml();
  if (OPT_OUT.has(keyword)) return twiml('Let\'s Get Quoted: You are unsubscribed and will no longer receive texts. Reply START to resume.');
  if (OPT_IN.has(keyword)) return twiml('Let\'s Get Quoted: You are re-subscribed and will receive texts again. Reply STOP to opt out.');
  if (keyword === 'HELP') return twiml('Let\'s Get Quoted support: hello@letsgetquoted.com. Reply STOP to opt out. Message and data rates may apply.');
  return twiml();
}
