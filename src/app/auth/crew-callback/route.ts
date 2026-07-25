import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { normalizeSupabaseUrl } from '@/lib/supabase-url';
import { linkCrewUserByEmail } from '@/lib/crew-auth';

// Verifies a crew member's magic link, then links their auth user to their crew
// record(s) and grants a 'crew' membership. Deliberately does NOT call
// ensureAccountMembership (that would provision a brand-new owner account for a
// crew member who isn't on any roster).
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get('token_hash');

  try {
    if (!tokenHash) throw new Error('Invalid or missing token');

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
      },
    );

    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
    if (error || !data.user?.email) {
      throw new Error(error?.message || 'Unable to verify sign-in link');
    }

    const linked = await linkCrewUserByEmail(data.user.id, data.user.email);
    if (linked === 0) {
      // Signed in, but this email isn't on any crew roster.
      return NextResponse.redirect(new URL('/field/login?error=not-crew', requestUrl.origin));
    }

    return NextResponse.redirect(new URL('/field', requestUrl.origin));
  } catch (error) {
    console.error('Crew callback error:', error);
    const message = encodeURIComponent(error instanceof Error ? error.message : 'Failed to verify sign-in link');
    return NextResponse.redirect(new URL(`/field/login?error=${message}`, requestUrl.origin));
  }
}
