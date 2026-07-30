import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { validateTwilioSignature, sendMissedCallTextBack } from '@/lib/sms';
import { normalizeUsPhone } from '@/lib/phone';
import { createLead } from '@/lib/leads';

export const runtime = 'nodejs';

function xml(inner = '') {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, { headers: { 'Content-Type': 'text/xml' } });
}

const MISSED = new Set(['no-answer', 'busy', 'failed', 'canceled']);

// Dial-completion callback from /api/twilio/voice. On an unanswered call, text
// the caller back and log a missed-call lead so the owner can follow up.
export async function POST(request: Request) {
  const data = await request.formData();
  if (!validateTwilioSignature(request, data)) return NextResponse.json({ error: 'Invalid signature.' }, { status: 403 });

  const accountId = new URL(request.url).searchParams.get('account');
  const dialStatus = String(data.get('DialCallStatus') ?? '');
  const caller = normalizeUsPhone(String(data.get('From') ?? ''));

  if (accountId && caller && MISSED.has(dialStatus)) {
    const admin = createAdminClient();
    try {
      // Dedupe against a status-callback retry / repeat calls in a short window.
      const since = new Date(Date.now() - 10 * 60_000).toISOString();
      const { data: recent } = await admin
        .from('leads')
        .select('id')
        .eq('account_id', accountId)
        .eq('source', 'missed_call')
        .eq('phone', caller)
        .gte('created_at', since)
        .limit(1)
        .maybeSingle();

      if (!recent) {
        const [{ data: site }, { data: account }] = await Promise.all([
          admin.from('sites').select('company_name').eq('account_id', accountId).maybeSingle(),
          admin.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
        ]);
        const businessName = (site?.company_name as string | undefined) || (account?.business_name as string | undefined) || 'us';
        await createLead(admin, accountId, {
          source: 'missed_call',
          name: `Missed call — ${caller}`,
          phone: caller,
          message: 'Missed call captured automatically. An auto text-back was sent.',
          sourcePage: '/call',
          triage: { score: 'warm', flags: [], contactPreference: 'any' },
        });
        await sendMissedCallTextBack({ accountId, phone: caller, businessName });
      }
    } catch (error) {
      console.error('Missed-call text-back failed:', error instanceof Error ? error.message : error);
    }
  }

  return xml(); // empty response ends the call cleanly
}
