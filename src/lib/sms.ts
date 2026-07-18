import { createAdminClient } from '@/lib/auth';
import { formatJobSchedule, formatMoney } from '@/lib/jobs';
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
  const contractor = payment.account?.business_name || 'Your contractor';
  const amount = formatMoney(Number(payment.amount));
  const label = payment.label || 'payment';
  const link = paymentLink(payment.id);
  const optOut = 'Reply STOP to opt out or HELP for help.';
  if (eventType === 'payment_requested') return `Let's Get Quoted: ${contractor} requested a ${label} of ${amount}. Pay securely: ${link}. ${optOut}`;
  if (eventType === 'payment_paid') return `Let's Get Quoted: Your ${label} of ${amount} to ${contractor} was received successfully. Thank you. ${optOut}`;
  if (eventType === 'payment_failed') return `Let's Get Quoted: Your ${label} of ${amount} to ${contractor} was not completed. Try again: ${link}. ${optOut}`;
  return `Let's Get Quoted: A refund of ${amount} from ${contractor} has been processed. ${optOut}`;
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

export async function recordSmsConsent(accountId: string, phone: string, source = 'payment_request') {
  const admin = createAdminClient();
  const { data: existing, error: lookupError } = await admin
    .from('sms_consent')
    .select('status')
    .eq('account_id', accountId)
    .eq('phone_number', phone)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing?.status === 'opted_out') {
    throw new Error('This homeowner opted out of texts. They must text START before receiving another message.');
  }

  const now = new Date().toISOString();
  const { error } = await admin.from('sms_consent').upsert({
    account_id: accountId,
    phone_number: phone,
    status: 'opted_in',
    source,
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

// Fire-and-forget notification for crew job assignments. Unlike payment SMS,
// this isn't tracked in the sms_events ledger (that table's schema is
// payment-specific) — the caller is expected to catch/log failures without
// blocking the assignment itself.
export async function sendCrewAssignmentSms(params: {
  phone: string;
  crewName: string;
  businessName: string;
  jobRef: string;
  clientName: string;
  address: string | null;
  scheduledFor: string | null;
  scheduledTime?: string | null;
}) {
  const addressNote = params.address ? ` at ${params.address}` : '';
  const scheduledNote = params.scheduledFor
    ? ` Scheduled ${formatJobSchedule(params.scheduledFor, params.scheduledTime)}.`
    : '';
  const body = `Let's Get Quoted: Hi ${params.crewName}, ${params.businessName} assigned you to job ${params.jobRef} — ${params.clientName}${addressNote}.${scheduledNote} Reply STOP to opt out.`;
  return sendTwilioMessage(params.phone, body);
}

export async function sendJobUpdateSms(params: {
  phone: string;
  businessName: string;
  jobRef: string;
  title: string;
  body: string | null;
}) {
  const updateBody = params.body ? ` ${params.body}` : '';
  const message = `Let's Get Quoted: ${params.businessName} posted an update for job ${params.jobRef}: ${params.title}.${updateBody} Reply STOP to opt out.`;
  return sendTwilioMessage(params.phone, message);
}