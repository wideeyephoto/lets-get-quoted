import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { ensureAccountMembership, createAdminClient } from '@/lib/auth';
import { recordLoginEvent } from '@/lib/login-events';
import { clientIpFrom, checkRateLimitStrict } from '@/lib/rate-limit';
import { normalizeSupabaseUrl } from '@/lib/supabase-url';
import { normalizeUsPhone } from '@/lib/phone';

const VERIFY_IP_LIMIT = 20;
const VERIFY_PHONE_LIMIT = 5;
const VERIFY_WINDOW_SECONDS = 15 * 60; // 15 minutes

// Verifies a phone OTP on the SERVER so the session cookies are written by the
// server (via cookieStore.set) — mirroring /auth/callback for email. Doing this
// client-side wrote a session the server-side getUser() never accepted, so the
// dashboard bounced the user back to /login after a successful code entry.
export async function POST(request: Request) {
  let phone: string;
  let code: string;
  try {
    const body = (await request.json()) as { phone?: unknown; code?: unknown };
    phone = normalizeUsPhone(String(body.phone ?? '')) ?? '';
    code = String(body.code ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  if (!phone || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: 'Enter the six-digit code from the text message.' }, { status: 400 });
  }

  const ip = clientIpFrom(request.headers);
  const admin = createAdminClient();

  const withinIpLimit = await checkRateLimitStrict(admin, `verify:ip:${ip}`, VERIFY_IP_LIMIT, VERIFY_WINDOW_SECONDS);
  const withinPhoneLimit = await checkRateLimitStrict(admin, `verify:phone:${phone}`, VERIFY_PHONE_LIMIT, VERIFY_WINDOW_SECONDS);

  if (!withinIpLimit || !withinPhoneLimit) {
    return NextResponse.json({ error: 'Too many verification attempts. Wait a few minutes and try again.' }, { status: 429 });
  }

  const cookieStore = cookies();
  const supabase = createServerClient(
    normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) => 
            cookieStore.set(name, value, { 
              ...options, 
              httpOnly: true, 
              secure: process.env.NODE_ENV === 'production' 
            })
          );
        },
      },
    }
  );

  const { data, error } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' });
  if (error || !data.user || !data.session) {
    return NextResponse.json({ error: error?.message ?? 'That code could not be verified.' }, { status: 400 });
  }

  const { data: authData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (authData?.nextLevel === 'aal2' && authData.currentLevel === 'aal1') {
    return NextResponse.json({ ok: false, mfa_required: true, redirect: '/login/mfa-challenge' });
  }

  try {
    const membership = await ensureAccountMembership(data.user.id);
    // Null when this user holds a pending office invitation -- see
    // ensureAccountMembership.
    if (membership) {
      await recordLoginEvent({
        accountId: membership.account_id,
        userId: data.user.id,
        method: 'phone',
        ip: clientIpFrom(request.headers),
        userAgent: request.headers.get('user-agent'),
      });
    }
  } catch (err) {
    console.error('ensureAccountMembership error in phone verify:', err);
    return NextResponse.json({ error: 'Signed in, but account setup failed. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
