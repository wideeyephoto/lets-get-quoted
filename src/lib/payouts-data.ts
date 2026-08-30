import type { SupabaseClient } from '@supabase/supabase-js';
import { getStripeClient } from '@/lib/stripe';
import Stripe from 'stripe';

export type StripePayoutItem = {
  id: string;
  amount: number;
  currency: string;
  status: 'paid' | 'pending' | 'in_transit' | 'canceled' | 'failed';
  arrivalDate: string;
  created: string;
  destination: string | null;
  method: string | null;
  description: string | null;
  failureMessage: string | null;
};

export type PayoutsAccountOverview = {
  connected: boolean;
  stripeAccountId: string | null;
  payoutsPaused: boolean;
  availableBalanceDollars: number;
  pendingBalanceDollars: number;
  instantPayoutEligible: boolean;
  recentPayouts: StripePayoutItem[];
  available: boolean;
};

export async function loadStripePayoutsOverview(
  supabase: SupabaseClient,
  accountId: string,
): Promise<PayoutsAccountOverview> {
  try {
    const { data: account } = await supabase
      .from('accounts')
      .select('stripe_connect_id, connect_onboarded, connect_disabled_at')
      .eq('id', accountId)
      .maybeSingle();

    if (!account?.stripe_connect_id || !account.connect_onboarded) {
      return {
        connected: false,
        stripeAccountId: account?.stripe_connect_id ?? null,
        payoutsPaused: Boolean(account?.connect_disabled_at),
        availableBalanceDollars: 0,
        pendingBalanceDollars: 0,
        instantPayoutEligible: false,
        recentPayouts: [],
        available: true,
      };
    }

    const stripe = getStripeClient();
    const connectId = account.stripe_connect_id;

    // Fetch live balance and recent payouts from Stripe
    const [balanceRes, payoutsRes] = await Promise.allSettled([
      stripe.balance.retrieve({}, { stripeAccount: connectId }),
      stripe.payouts.list({ limit: 25 }, { stripeAccount: connectId }),
    ]);

    let availableDollars = 0;
    let pendingDollars = 0;
    let instantEligible = false;

    if (balanceRes.status === 'fulfilled') {
      const b = balanceRes.value;
      const availCents = b.available?.reduce((sum, item) => sum + (item.currency === 'usd' ? item.amount : 0), 0) ?? 0;
      const pendCents = b.pending?.reduce((sum, item) => sum + (item.currency === 'usd' ? item.amount : 0), 0) ?? 0;
      const instantCents = b.instant_available?.reduce((sum, item) => sum + (item.currency === 'usd' ? item.amount : 0), 0) ?? 0;

      availableDollars = availCents / 100;
      pendingDollars = pendCents / 100;
      instantEligible = instantCents > 0;
    }

    const recentPayouts: StripePayoutItem[] = [];
    if (payoutsRes.status === 'fulfilled') {
      for (const p of payoutsRes.value.data) {
        let dest = 'Bank Account';
        if (p.destination && typeof p.destination === 'object') {
          const bank = p.destination as Stripe.BankAccount;
          dest = `${bank.bank_name || 'Bank'} ••••${bank.last4 || ''}`;
        }

        recentPayouts.push({
          id: p.id,
          amount: (p.amount || 0) / 100,
          currency: p.currency?.toUpperCase() || 'USD',
          status: p.status as StripePayoutItem['status'],
          arrivalDate: new Date(p.arrival_date * 1000).toISOString(),
          created: new Date(p.created * 1000).toISOString(),
          destination: dest,
          method: p.method || 'standard',
          description: p.description || null,
          failureMessage: p.failure_message || null,
        });
      }
    }

    return {
      connected: true,
      stripeAccountId: connectId,
      payoutsPaused: Boolean(account.connect_disabled_at),
      availableBalanceDollars: Math.round(availableDollars * 100) / 100,
      pendingBalanceDollars: Math.round(pendingDollars * 100) / 100,
      instantPayoutEligible: instantEligible,
      recentPayouts,
      available: true,
    };
  } catch (error) {
    console.error('Failed to load Stripe payouts overview:', error);
    return {
      connected: false,
      stripeAccountId: null,
      payoutsPaused: false,
      availableBalanceDollars: 0,
      pendingBalanceDollars: 0,
      instantPayoutEligible: false,
      recentPayouts: [],
      available: false,
    };
  }
}
