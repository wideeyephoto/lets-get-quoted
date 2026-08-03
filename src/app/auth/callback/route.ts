import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { ensureAccountMembership } from '@/lib/auth';
import { safeNextPath } from '@/lib/app-origin';
import { normalizeSupabaseUrl } from '@/lib/supabase-url';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  // `next` was passed to the URL constructor unfiltered, so an absolute one
  // simply won: /auth/callback?next=https://evil.example redirected there, with
  // the session cookie already set. This is the OAuth landing spot, which makes
  // it the most credible link in the app to hand somebody.
  const redirectUrl = new URL(safeNextPath(requestUrl.searchParams.get('next')), requestUrl.origin);

  if (code) {
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
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        try {
          await ensureAccountMembership(user.id);
        } catch (err) {
          console.error('ensureAccountMembership error in callback:', err);
          throw err;
        }
      }
    }
  }

  return NextResponse.redirect(redirectUrl);
}
