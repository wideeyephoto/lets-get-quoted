'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { requireOwnerContext } from '@/lib/auth';
import { createOnboardingLink, createOrGetRecipientAccount, refreshAccountOnboardingStatus } from '@/lib/stripe-connect';

function getOrigin() {
  const h = headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('host');
  return `${proto}://${host}`;
}

// Everything the connect does except the redirect, so a caller can decide what
// happens when Stripe won't hand back a link.
async function createStripeOnboardingUrl(): Promise<string> {
  const { supabase, accountId } = await requireOwnerContext();

  const { data: account, error } = await supabase
    .from('accounts')
    .select('business_name')
    .eq('id', accountId)
    .single();

  if (error || !account) {
    throw error ?? new Error('Account not found.');
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const contactEmail = user?.email ?? null;

  const stripeAccountId = await createOrGetRecipientAccount(supabase, accountId, account.business_name, contactEmail);

  const origin = getOrigin();
  return createOnboardingLink(
    stripeAccountId,
    `${origin}/dashboard/stripe-return`,
    `${origin}/dashboard/stripe-return`
  );
}

export async function connectStripeAction() {
  redirect(await createStripeOnboardingUrl());
}

/**
 * The same connect, started from the dashboard-wide banner.
 *
 * Identical on the happy path. The difference is the failure: this banner sits
 * on every dashboard page, so an action that throws replaces whatever the owner
 * was in the middle of with an error screen. Settings is where the same button
 * lives with room to explain itself — and where this banner used to point.
 */
export async function connectStripeFromBannerAction() {
  let url: string;
  try {
    url = await createStripeOnboardingUrl();
  } catch {
    redirect('/dashboard/settings#payments');
  }
  redirect(url);
}

export async function refreshStripeStatusAction() {
  const { supabase, accountId } = await requireOwnerContext();

  const { data: account, error } = await supabase
    .from('accounts')
    .select('stripe_connect_id')
    .eq('id', accountId)
    .single();

  if (error || !account?.stripe_connect_id) {
    return;
  }

  await refreshAccountOnboardingStatus(supabase, accountId, account.stripe_connect_id);
}

// Unlinks the connected Stripe account locally (clears the stored id and
// flips connect_onboarded off) without deleting anything on Stripe's side —
// the underlying Express account is left alone. Reconnecting later creates a
// fresh Stripe account via createOrGetRecipientAccount, same as the existing
// stale/wrong-mode-id self-heal path already does.
export async function disconnectStripeAction() {
  const { supabase, accountId } = await requireOwnerContext();

  const { error } = await supabase
    .from('accounts')
    .update({ stripe_connect_id: null, connect_onboarded: false })
    .eq('id', accountId);

  if (error) {
    throw error;
  }
}
