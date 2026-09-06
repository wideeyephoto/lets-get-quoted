import { NextResponse } from 'next/server';
import { requireOwnerContext } from '@/lib/auth';
import { getStripeClient } from '@/lib/stripe';
import { createOnboardingLink } from '@/lib/stripe-connect';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { supabase, accountId } = await requireOwnerContext();

    const { data: account, error } = await supabase
      .from('accounts')
      .select('stripe_connect_id, connect_onboarded')
      .eq('id', accountId)
      .maybeSingle();

    if (error || !account?.stripe_connect_id) {
      return NextResponse.redirect(new URL('/dashboard/settings#payments', request.url), {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
      });
    }

    const origin = new URL(request.url).origin;

    if (!account.connect_onboarded) {
      const onboardingUrl = await createOnboardingLink(
        account.stripe_connect_id,
        `${origin}/dashboard/stripe-return`,
        `${origin}/dashboard/stripe-return`
      );
      return NextResponse.redirect(onboardingUrl, {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
      });
    }

    const stripe = getStripeClient();
    const loginLink = await stripe.accounts.createLoginLink(account.stripe_connect_id);

    return NextResponse.redirect(loginLink.url, {
      status: 303,
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (err: any) {
    const digest = (err as { digest?: unknown } | null)?.digest;
    if (typeof digest === 'string' && (digest.startsWith('NEXT_REDIRECT') || digest === 'NEXT_NOT_FOUND')) {
      throw err;
    }

    console.error('Failed to create Stripe Express dashboard login link:', err);
    return NextResponse.redirect(new URL('/dashboard/payments?error=stripe_login_failed', request.url), {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  }
}
