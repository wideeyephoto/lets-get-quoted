import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { escapeXml } from '@/lib/voice-call-bridge';
import { normalizeUsPhone } from '@/lib/phone';
import { validateWebhookSignature } from '@/lib/sms-provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function twimlResponse(content: string, status = 200) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n${content}\n</Response>`, {
    status,
    headers: { 'Content-Type': 'text/xml' },
  });
}

/**
 * Webhook security posture: validateTwilio webhook callback action.
 * Handles the Gather action from initiateSpeedToLeadCallBridge when the contractor presses 1.
 * Connects the contractor leg directly to the homeowner.
 */
export async function POST(request: Request) {
  const rawBody = await request.clone().text();
  const signature = validateWebhookSignature(request, rawBody);
  if (!signature.ok || signature.provider !== 'twilio') return twimlResponse('  <Hangup/>', 403);
  const url = new URL(request.url);
  const leadId = url.searchParams.get('leadId');
  const expires = Number(url.searchParams.get('expires'));
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(expires) || expires < now || expires > now + 300) return twimlResponse('  <Hangup/>', 403);

  let digits = '';
  let contractorPhone: string | null = null;
  let callId = '';
  try {
    const formData = await request.formData();
    digits = String(formData.get('Digits') ?? '').trim();
    contractorPhone = normalizeUsPhone(String(formData.get('To') ?? ''));
    callId = String(formData.get('CallSid') ?? '').trim();
  } catch {
    return twimlResponse('  <Hangup/>', 400);
  }

  if (digits !== '1' || !leadId) {
    return twimlResponse(
      '  <Say voice="Polly.Matthew">Connection cancelled. Lead details have been sent to you. Goodbye.</Say>\n  <Hangup/>'
    );
  }

  try {
    const admin = createAdminClient();
    const { data: lead, error } = await admin
      .from('leads')
      .select('phone, account_id, name')
      .eq('id', leadId)
      .maybeSingle();

    if (error || !lead || !lead.phone) {
      return twimlResponse(
        '  <Say voice="Polly.Matthew">Unable to locate the homeowner contact for this lead. Goodbye.</Say>\n  <Hangup/>'
      );
    }

    const { data: account, error: accountError } = await admin.from('accounts')
      .select('phone, alert_phone, call_forward_number').eq('id', lead.account_id).maybeSingle();
    const allowedPhones = [account?.phone, account?.alert_phone, account?.call_forward_number]
      .map((phone) => normalizeUsPhone(phone || '')).filter(Boolean);
    if (accountError || !callId || !contractorPhone || !allowedPhones.includes(contractorPhone)) {
      return twimlResponse('  <Hangup/>', 403);
    }

    const homeownerPhone = normalizeUsPhone(lead.phone);
    if (!homeownerPhone) {
      return twimlResponse(
        '  <Say voice="Polly.Matthew">The homeowner phone number is invalid. Goodbye.</Say>\n  <Hangup/>'
      );
    }

    // Attempt to locate the contractor's dedicated number or fallback to TWILIO_PHONE_NUMBER
    let callerId = process.env.TWILIO_PHONE_NUMBER || '';
    if (lead.account_id) {
      const { data: phoneRow } = await admin
        .from('signalwire_phone_numbers')
        .select('e164_number')
        .eq('account_id', lead.account_id)
        .eq('lifecycle_state', 'active')
        .maybeSingle();

      if (phoneRow?.e164_number) {
        callerId = phoneRow.e164_number;
      }
    }

    if (!normalizeUsPhone(callerId)) return twimlResponse('  <Hangup/>', 503);
    const cleanNumber = escapeXml(homeownerPhone);
    const cleanCallerId = escapeXml(callerId);

    return twimlResponse([
      '  <Say voice="Polly.Matthew">Connecting you now to the homeowner.</Say>',
      `  <Dial timeout="30" callerId="${cleanCallerId}">`,
      `    <Number>${cleanNumber}</Number>`,
      '  </Dial>',
    ].join('\n'));
  } catch (err) {
    console.error('Error in bridge-connect voice route:', err);
    return twimlResponse(
      '  <Say voice="Polly.Matthew">An error occurred while connecting the call. Goodbye.</Say>\n  <Hangup/>',
      500
    );
  }
}
