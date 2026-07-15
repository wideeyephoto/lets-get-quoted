import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { normalizeSupabaseUrl } from './supabase-url';

export function createSupabaseServerClient() {
  const cookieStore = cookies();

  return createServerClient(
    normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll was called from a Server Component render, where cookies
            // can't be written. Safe to ignore because middleware.ts refreshes
            // the session (and its cookies) on every request.
          }
        },
      },
    }
  );
}
