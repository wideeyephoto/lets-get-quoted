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

export async function connectStripeAction() {
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
  const url = await createOnboardingLink(
    stripeAccountId,
    `${origin}/dashboard/stripe-return`,
    `${origin}/dashboard/stripe-return`
  );

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
