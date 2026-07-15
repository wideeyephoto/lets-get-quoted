import { NextResponse } from 'next/server';
import { ensureAccountMembership } from '@/lib/auth';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { normalizeSupabaseUrl } from '@/lib/supabase-url';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const next = requestUrl.searchParams.get('next') ?? '/dashboard';
  const safeNext = next.startsWith('/') ? next : '/dashboard';

  try {
    if (!tokenHash) {
      throw new Error('Invalid or missing token');
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
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'email',
    });

    if (error || !data.user) {
      throw new Error(error?.message || 'Unable to verify magic link');
    }

    await ensureAccountMembership(data.user.id);
    return NextResponse.redirect(new URL(safeNext, requestUrl.origin));
  } catch (error) {
    console.error('Magic link callback error:', error);
    const message = encodeURIComponent(error instanceof Error ? error.message : 'Failed to verify magic link');
    return NextResponse.redirect(new URL(`/login?error=${message}`, requestUrl.origin));
  }
}
