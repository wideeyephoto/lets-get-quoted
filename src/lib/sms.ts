import { createAdminClient } from '@/lib/auth';
import { formatMoney } from '@/lib/jobs';
import { createHmac, timingSafeEqual } from 'crypto';

export type PaymentSmsEvent = 'payment_requested' | 'payment_paid' | 'payment_failed' | 'payment_refunded';

type SmsPayment = {
  id: string;
  account_id: string;
  amount: number;
  label: string | null;
  homeowner_phone: string | null;
  sms_consent: boolean;
  account: { business_name: string } | null;
};

function paymentLink(paymentId: string) {
  const origin = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');
  return `${origin}/pay/${paymentId}`;
}

function messageFor(payment: SmsPayment, eventType: PaymentSmsEvent) {
  const business = payment.account?.business_name || 'Your contractor';
  const amount = formatMoney(Number(payment.amount));
  const label = payment.label || 'payment';
  const link = paymentLink(payment.id);
  if (eventType === 'payment_requested') return `${business}: Your ${label} of ${amount} is ready. Pay securely: ${link} Reply STOP to opt out.`;
  if (eventType === 'payment_paid') return `${business}: We received your ${amount} ${label}. Thank you.`;
  if (eventType === 'payment_failed') return `${business}: Your ${amount} ${label} was not completed. Try again: ${link} Reply STOP to opt out.`;
  return `${business}: Your ${amount} ${label} has been refunded. Contact us with any questions.`;
}

function twilioConfiguration() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || (!messagingServiceSid && !from)) return null;
  return { accountSid, authToken, messagingServiceSid, from };
}

async function sendTwilioMessage(to: string, body: string) {
  const configuration = twilioConfiguration();
  if (!configuration) throw new Error('SMS provider is not configured.');
  const data = new URLSearchParams({ To: to, Body: body });
  if (configuration.messagingServiceSid) data.set('MessagingServiceSid', configuration.messagingServiceSid);
  else data.set('From', configuration.from!);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (appUrl?.startsWith('https://')) data.set('StatusCallback', `${appUrl}/api/twilio/status`);

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${configuration.accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${configuration.accountSid}:${configuration.authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: data,
  });
  const result = await response.json() as { sid?: string; message?: string };
  if (!response.ok || !result.sid) throw new Error(result.message || 'SMS provider rejected the message.');
  return result.sid;
}

export async function recordSmsConsent(accountId: string, phone: string) {
  const admin = createAdminClient();
  const { data: existing, error: lookupError } = await admin
    .from('sms_consent')
    .select('status')
    .eq('account_id', accountId)
    .eq('phone_number', phone)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing?.status === 'opted_out') {
    throw new Error('This homeowner opted out of texts. They must text START before receiving another payment message.');
  }

  const now = new Date().toISOString();
  const { error } = await admin.from('sms_consent').upsert({
    account_id: accountId,
    phone_number: phone,
    status: 'opted_in',
    source: 'payment_request',
    consented_at: now,
    opted_out_at: null,
    updated_at: now,
  }, { onConflict: 'account_id,phone_number' });
  if (error) throw error;
}

export async function sendPaymentSmsEvent(paymentId: string, eventType: PaymentSmsEvent) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('payments')
    .select('id, account_id, amount, label, homeowner_phone, sms_consent, account:accounts(business_name)')
    .eq('id', paymentId)
    .maybeSingle();
  if (error || !data) throw error ?? new Error('Payment not found for SMS.');
  const payment = data as unknown as SmsPayment;
  if (!payment.sms_consent || !payment.homeowner_phone) return { status: 'skipped' as const };

  const { data: consent } = await admin.from('sms_consent').select('status').eq('account_id', payment.account_id).eq('phone_number', payment.homeowner_phone).maybeSingle();
  const body = messageFor(payment, eventType);
  if (consent?.status === 'opted_out') {
    await admin.from('sms_events').upsert({ account_id: payment.account_id, payment_id: payment.id, event_type: eventType, phone_number: payment.homeowner_phone, status: 'opted_out', body }, { onConflict: 'payment_id,event_type', ignoreDuplicates: true });
    return { status: 'opted_out' as const };
  }

  const { data: event, error: eventError } = await admin.from('sms_events').insert({
    account_id: payment.account_id,
    payment_id: payment.id,
    event_type: eventType,
    phone_number: payment.homeowner_phone,
    status: 'pending',
    body,
  }).select('id').single();
  if (eventError) {
    if (eventError.code === '23505') return { status: 'duplicate' as const };
    throw eventError;
  }

  try {
    const providerId = await sendTwilioMessage(payment.homeowner_phone, body);
    await admin.from('sms_events').update({ status: 'sent', provider_id: providerId, sent_at: new Date().toISOString() }).eq('id', event.id);
    return { status: 'sent' as const };
  } catch (sendError) {
    const reason = sendError instanceof Error ? sendError.message : 'SMS delivery failed.';
    await admin.from('sms_events').update({ status: 'failed', error_reason: reason }).eq('id', event.id);
    console.error(`SMS ${eventType} failed for payment ${payment.id}:`, reason);
    return { status: 'failed' as const, error: reason };
  }
}

export function validateTwilioSignature(request: Request, data: FormData) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = request.headers.get('x-twilio-signature');
  if (!authToken || !signature) return false;

  const forwardedProto = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const url = new URL(request.url);
  if (forwardedProto) url.protocol = `${forwardedProto}:`;
  if (forwardedHost) url.host = forwardedHost;
  const sortedEntries = [...data.entries()]
    .map(([key, value]) => [key, String(value)] as const)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
  const payload = sortedEntries.reduce((result, [key, value]) => `${result}${key}${value}`, url.toString());
  const expected = createHmac('sha1', authToken).update(payload).digest('base64');
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}

export async function retryFailedPaymentSmsEvent(paymentId: string, eventType: PaymentSmsEvent) {
  const admin = createAdminClient();
  const { error } = await admin
    .from('sms_events')
    .delete()
    .eq('payment_id', paymentId)
    .eq('event_type', eventType)
    .eq('status', 'failed');
  if (error) throw error;
  return sendPaymentSmsEvent(paymentId, eventType);
}