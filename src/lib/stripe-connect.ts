import type { SupabaseClient } from '@supabase/supabase-js';
import { getStripeClient } from './stripe';

// -- Connect onboarding (v2 Accounts API, Recipient configuration) -----------
// Per Stripe's marketplace/destination-charge guidance: the platform is the
// merchant of record, so connected accounts only need the Recipient
// configuration (to receive transfers), not Merchant/card_payments.

export async function createOrGetRecipientAccount(
  supabase: SupabaseClient,
  accountId: string,
  businessName: string,
  contactEmail: string | null
): Promise<string> {
  const { data: account, error } = await supabase
    .from('accounts')
    .select('stripe_connect_id')
    .eq('id', accountId)
    .single();

  if (error) {
    throw error;
  }

  if (account?.stripe_connect_id) {
    return account.stripe_connect_id;
  }

  const stripe = getStripeClient();

  const created = await stripe.v2.core.accounts.create({
    display_name: businessName,
    contact_email: contactEmail ?? undefined,
    dashboard: 'express',
    identity: { country: 'US' },
    configuration: {
      recipient: {
        capabilities: {
          stripe_balance: { stripe_transfers: { requested: true } },
        },
      },
    },
    defaults: {
      responsibilities: {
        fees_collector: 'application',
        losses_collector: 'application',
      },
    },
  });

  const { error: updateError } = await supabase
    .from('accounts')
    .update({ stripe_connect_id: created.id })
    .eq('id', accountId);

  if (updateError) {
    throw updateError;
  }

  return created.id;
}

export async function createOnboardingLink(
  stripeAccountId: string,
  returnUrl: string,
  refreshUrl: string
): Promise<string> {
  const stripe = getStripeClient();

  const link = await stripe.v2.core.accountLinks.create({
    account: stripeAccountId,
    use_case: {
      type: 'account_onboarding',
      account_onboarding: {
        configurations: ['recipient'],
        return_url: returnUrl,
        refresh_url: refreshUrl,
      },
    },
  });

  return link.url;
}

export async function getRecipientTransferStatus(stripeAccountId: string): Promise<string | null> {
  const account = await getStripeClient().v2.core.accounts.retrieve(stripeAccountId, {
    include: ['configuration.recipient'],
  });

  return account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status ?? null;
}

// Refreshes connect_onboarded based on the recipient's live capability status.
// Called when the owner returns from the hosted onboarding flow.
export async function refreshAccountOnboardingStatus(
  supabase: SupabaseClient,
  accountId: string,
  stripeAccountId: string
): Promise<boolean> {
  const status = await getRecipientTransferStatus(stripeAccountId);
  const onboarded = status === 'active';

  const { error } = await supabase
    .from('accounts')
    .update({ connect_onboarded: onboarded })
    .eq('id', accountId);

  if (error) {
    throw error;
  }

  return onboarded;
}
