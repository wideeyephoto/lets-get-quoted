import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { ensureAccountMembership } from '@/lib/auth';
import { normalizeSupabaseUrl } from '@/lib/supabase-url';
import { normalizeUsPhone } from '@/lib/phone';

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
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    }
  );

  const { data, error } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' });
  if (error || !data.user || !data.session) {
    return NextResponse.json({ error: error?.message ?? 'That code could not be verified.' }, { status: 400 });
  }

  try {
    await ensureAccountMembership(data.user.id);
  } catch (err) {
    console.error('ensureAccountMembership error in phone verify:', err);
    return NextResponse.json({ error: 'Signed in, but account setup failed. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
