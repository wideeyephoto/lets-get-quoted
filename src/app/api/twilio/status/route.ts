import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { validateTwilioSignature } from '@/lib/sms';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!request.headers.get('x-twilio-signature')) return NextResponse.json({ error: 'Invalid signature.' }, { status: 403 });
  const data = await request.formData();
  if (!validateTwilioSignature(request, data)) return NextResponse.json({ error: 'Invalid signature.' }, { status: 403 });
  const providerId = String(data.get('MessageSid') || '');
  const providerStatus = String(data.get('MessageStatus') || '');
  if (providerId && ['failed', 'undelivered'].includes(providerStatus)) {
    await createAdminClient().from('sms_events').update({
      status: 'failed',
      error_reason: String(data.get('ErrorMessage') || data.get('ErrorCode') || providerStatus),
    }).eq('provider_id', providerId);
  }
  return new NextResponse(null, { status: 204 });
}