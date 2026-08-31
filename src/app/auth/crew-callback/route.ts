import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { normalizeSupabaseUrl } from '@/lib/supabase-url';
import { linkCrewUserByEmail } from '@/lib/crew-auth';
import { writeFieldAccount, clearFieldAccount } from '@/lib/field-account';

// Verifies a crew member's magic link, then links their auth user to their crew
// record(s) and grants a 'crew' membership. Deliberately does NOT call
// ensureAccountMembership (that would provision a brand-new owner account for a
// crew member who isn't on any roster).
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get('token_hash');
  // Which business invited them, when one did. An owner's invitation is
  // specific, so it decides the account rather than leaving somebody on two
  // rosters to guess which app they just opened.
  const invitedAccount = requestUrl.searchParams.get('account');

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
    if (linked.length === 0) {
      // Signed in, but this email isn't on any crew roster — or the one roster
      // it was on has had its field-app access taken away.
      return NextResponse.redirect(new URL('/field/login?error=not-crew', requestUrl.origin));
    }

    // Honour a business-specific invitation, but only for an account this
    // person is genuinely on: the parameter arrives from a URL, and a URL is
    // something anybody can edit.
    if (invitedAccount && linked.includes(invitedAccount)) {
      await writeFieldAccount(invitedAccount);
    } else if (linked.length === 1) {
      // Exactly one business: there is nothing to choose, and pinning it here
      // means a previous employer's stale cookie can't survive the new link.
      await writeFieldAccount(linked[0]);
    } else {
      // Two or more and no invitation naming one. Clear whatever was remembered
      // and let them say — /field/choose is where requireCrewContext sends them.
      await clearFieldAccount();
      return NextResponse.redirect(new URL('/field/choose', requestUrl.origin));
    }

    return NextResponse.redirect(new URL('/field', requestUrl.origin));
  } catch (error) {
    console.error('Crew callback error:', error);
    const message = encodeURIComponent(error instanceof Error ? error.message : 'Failed to verify sign-in link');
    return NextResponse.redirect(new URL(`/field/login?error=${message}`, requestUrl.origin));
  }
}
