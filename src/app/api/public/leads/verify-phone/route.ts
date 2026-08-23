import { randomInt } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { leadVerificationToken } from '@/lib/lead-verification';
import { loadLeadPhoneVerificationReadiness } from '@/lib/lead-phone-verification-readiness';
import { normalizeUsPhone } from '@/lib/phone';
import { getSiteContent } from '@/lib/site-content';
import { sendVerificationCodeSms } from '@/lib/sms';
import { checkRateLimitStrict, clientIpFrom } from '@/lib/rate-limit';

export const runtime = 'nodejs';

// Stateless one-time codes: the code is texted to the visitor and never
// returned to the browser — the browser only holds an HMAC token binding
// (phone, code, expiry). The lead intake recomputes the HMAC to verify, so
// there is no codes table and nothing to clean up.
const CODE_TTL_MS = 10 * 60 * 1000;

export async function POST(request: NextRequest) {
  const admin = createAdminClient();
  const ip = clientIpFrom(request.headers);
  // Durable, cross-instance limits. Fail CLOSED — this sends an SMS to an
  // attacker-supplied number, so a limiter error must block, not allow.
  if (!(await checkRateLimitStrict(admin, `verifyphone:ip:${ip}`, 5, 60))) {
    return NextResponse.json({ error: 'Too many requests — wait a minute and try again.' }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const siteId = typeof body?.siteId === 'string' ? body.siteId.slice(0, 80) : '';
  const phone = normalizeUsPhone(typeof body?.phone === 'string' ? body.phone : '');
  if (!siteId || !phone) {
    return NextResponse.json({ error: 'Enter a valid phone number first.' }, { status: 400 });
  }
  // Per-number: 5/min AND a hard 10/day cap to blunt SMS pumping / text-bombing.
  if (!(await checkRateLimitStrict(admin, `verifyphone:phone:${phone}`, 5, 60))) {
    return NextResponse.json({ error: 'Too many codes sent to this number — wait a minute.' }, { status: 429 });
  }
  if (!(await checkRateLimitStrict(admin, `verifyphone:phoneday:${phone}`, 10, 86_400))) {
    return NextResponse.json({ error: 'Daily limit reached for this number. Try again tomorrow.' }, { status: 429 });
  }

  const { data: site } = await admin
    .from('sites')
    .select('id, account_id, company_name, content')
    .eq('id', siteId)
    .eq('published', true)
    .maybeSingle();
  if (!site) return NextResponse.json({ error: 'Site not found.' }, { status: 404 });

  const filters = getSiteContent(site.content as Record<string, unknown>).leadFilters;
  // The token secret is checked HERE, before anything is sent. leadVerification
  // Token() throws when it is missing, and it is called after the text goes out
  // — so without this the visitor would receive a real code and then a 500,
  // having been charged a message segment for a token that was never minted.
  if (!filters.phoneVerification) {
    // Verification is off (or texting isn't set up) — tell the client to
    // proceed without it rather than dead-ending the visitor. The submission
    // itself records that the check could not run; see the lead route.
    return NextResponse.json({ skipped: true });
  }

  // Verification is contractor-branded homeowner traffic. If this site's
  // workspace cannot actually leave the durable queue before this code's
  // expiry, skip the check instead of dead-ending the homeowner.
  const accountId = typeof site.account_id === 'string' ? site.account_id : '';
  const messaging = await loadLeadPhoneVerificationReadiness(accountId, admin);
  if (messaging.kind !== 'ready') {
    return NextResponse.json({ skipped: true, reason: messaging.reason });
  }

  const code = String(randomInt(100000, 1000000));
  const expiresAt = Date.now() + CODE_TTL_MS;
  try {
    await sendVerificationCodeSms({
      accountId,
      senderNumberId: messaging.senderId,
      phone,
      businessName: site.company_name || 'your contractor',
      code,
      idempotencyKey: `lead-verification:${siteId}:${code}:${expiresAt}`,
    });
  } catch (error) {
    console.error('Verification SMS failed:', error);
    return NextResponse.json({ error: 'Could not text that number — double-check it and try again.' }, { status: 502 });
  }
  return NextResponse.json({ token: leadVerificationToken(phone, code, expiresAt), expiresAt });
}
