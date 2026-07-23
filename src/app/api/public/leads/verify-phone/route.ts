import { randomInt } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { leadVerificationToken } from '@/lib/lead-verification';
import { normalizeUsPhone } from '@/lib/phone';
import { getSiteContent } from '@/lib/site-content';
import { isSmsConfigured, sendVerificationCodeSms } from '@/lib/sms';

export const runtime = 'nodejs';

// Stateless one-time codes: the code is texted to the visitor and never
// returned to the browser — the browser only holds an HMAC token binding
// (phone, code, expiry). The lead intake recomputes the HMAC to verify, so
// there is no codes table and nothing to clean up.
const CODE_TTL_MS = 10 * 60 * 1000;

const requestLog = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const history = (requestLog.get(key) ?? []).filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);
  history.push(now);
  requestLog.set(key, history);
  return history.length > RATE_LIMIT_MAX;
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests — wait a minute and try again.' }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const siteId = typeof body?.siteId === 'string' ? body.siteId.slice(0, 80) : '';
  const phone = normalizeUsPhone(typeof body?.phone === 'string' ? body.phone : '');
  if (!siteId || !phone) {
    return NextResponse.json({ error: 'Enter a valid phone number first.' }, { status: 400 });
  }
  if (isRateLimited(`phone:${phone}`)) {
    return NextResponse.json({ error: 'Too many codes sent to this number — wait a minute.' }, { status: 429 });
  }

  const admin = createAdminClient();
  const { data: site } = await admin
    .from('sites')
    .select('id, company_name, content')
    .eq('id', siteId)
    .eq('published', true)
    .maybeSingle();
  if (!site) return NextResponse.json({ error: 'Site not found.' }, { status: 404 });

  const filters = getSiteContent(site.content as Record<string, unknown>).leadFilters;
  if (!filters.phoneVerification || !isSmsConfigured()) {
    // Verification is off (or texting isn't set up) — tell the client to
    // proceed without it rather than dead-ending the visitor.
    return NextResponse.json({ skipped: true });
  }

  const code = String(randomInt(100000, 1000000));
  const expiresAt = Date.now() + CODE_TTL_MS;
  try {
    await sendVerificationCodeSms({ phone, businessName: site.company_name || 'your contractor', code });
  } catch (error) {
    console.error('Verification SMS failed:', error);
    return NextResponse.json({ error: 'Could not text that number — double-check it and try again.' }, { status: 502 });
  }
  return NextResponse.json({ token: leadVerificationToken(phone, code, expiresAt), expiresAt });
}
