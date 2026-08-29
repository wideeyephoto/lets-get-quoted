import 'server-only';

import { getStripeClient } from '@/lib/stripe';
import { APP_ORIGIN } from '@/lib/app-origin';

/**
 * 2-Way Dedicated Business Number & 10DLC Carrier Registration Setup Fee.
 * $49.99 one-time fee charged upon application.
 */
export const MESSAGING_SETUP_FEE_CENTS = 4999;
export const MESSAGING_SETUP_FEE_USD = '$49.99';

export type CreateMessagingSetupCheckoutInput = Readonly<{
  accountId: string;
  userId: string;
  userEmail: string;
  businessName: string;
  returnOrigin?: string;
  submissionKey: string;
}>;

export async function createMessagingSetupCheckoutSession(
  input: CreateMessagingSetupCheckoutInput,
): Promise<{ sessionId: string; url: string }> {
  const stripe = getStripeClient();
  const origin = input.returnOrigin || APP_ORIGIN;

  const successUrl = `${origin}/dashboard/messages/dedicated-number?done=submitted&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/dashboard/messages/dedicated-number?error=cancelled`;

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: input.userEmail,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: MESSAGING_SETUP_FEE_CENTS,
          product_data: {
            name: '2-Way Dedicated Number & 10DLC Registration Setup',
            description:
              'One-time setup fee for 10DLC mobile carrier brand & campaign vetting, local dedicated phone number provisioning, and 2-way inbox activation.',
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      purpose: 'messaging_dedicated_number_setup',
      accountId: input.accountId,
      userId: input.userId,
      businessName: input.businessName,
      submissionKey: input.submissionKey,
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  if (!session.url) {
    throw new Error('Stripe failed to return a checkout URL for dedicated number setup.');
  }

  return {
    sessionId: session.id,
    url: session.url,
  };
}

export async function verifyMessagingSetupCheckoutSession(
  sessionId: string,
  expectedAccountId?: string,
): Promise<{ paid: boolean; customerEmail: string | null; amountPaidCents: number }> {
  if (!sessionId || !sessionId.startsWith('cs_')) {
    return { paid: false, customerEmail: null, amountPaidCents: 0 };
  }

  try {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (expectedAccountId && session.metadata?.accountId && session.metadata.accountId !== expectedAccountId) {
      return { paid: false, customerEmail: null, amountPaidCents: 0 };
    }

    const paid = session.payment_status === 'paid';
    return {
      paid,
      customerEmail: session.customer_details?.email || session.customer_email || null,
      amountPaidCents: session.amount_total ?? 0,
    };
  } catch (err) {
    console.error('[messaging-setup-checkout] Failed to verify checkout session:', err);
    return { paid: false, customerEmail: null, amountPaidCents: 0 };
  }
}
