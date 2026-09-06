import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { normalizeSupabaseUrl } from '@/lib/supabase-url';
import { normalizeUsPhone } from '@/lib/phone';
import { linkCrewUserByPhone } from '@/lib/crew-auth';
import { writeFieldAccount, clearFieldAccount } from '@/lib/field-account';
import { recordLoginEvent } from '@/lib/login-events';
import { clientIpFrom } from '@/lib/rate-limit';

// Verifies a crew member's phone OTP on the server so session cookies are
// written securely, links their auth user to their crew record(s), and routes
// them to the field app (/field).
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

  const cookieStore = await cookies();
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
    const linked = await linkCrewUserByPhone(data.user.id, phone);
    if (linked.length === 0) {
      return NextResponse.json(
        { error: "That mobile number isn't on an active crew roster. Ask your manager to add you." },
        { status: 403 },
      );
    }

    if (linked.length === 1) {
      await writeFieldAccount(linked[0]);
      await recordLoginEvent({
        accountId: linked[0],
        userId: data.user.id,
        method: 'phone',
        ip: clientIpFrom(request.headers),
        userAgent: request.headers.get('user-agent'),
      });
      return NextResponse.json({ ok: true, redirect: '/field' });
    } else {
      await clearFieldAccount();
      return NextResponse.json({ ok: true, redirect: '/field/choose' });
    }
  } catch (err) {
    console.error('Crew phone linking error:', err);
    return NextResponse.json({ error: 'Signed in, but crew setup failed. Please try again.' }, { status: 500 });
  }
}
