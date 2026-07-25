import { createAdminClient } from '@/lib/auth';
import { getStripeClient } from '@/lib/stripe';

type PlanCustomerInput = {
  id: string;
  account_id: string;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  stripe_customer_id: string | null;
};

// Ensure a platform Stripe customer exists for this plan's client. Idempotent:
// returns the stored id if present, else creates one and persists it. The
// customer lives on the PLATFORM account (not the connected account) — later
// off-session charges then transfer to the connected account via destination
// charges, exactly like the one-off /pay flow.
export async function ensurePlanCustomer(plan: PlanCustomerInput): Promise<string> {
  if (plan.stripe_customer_id) return plan.stripe_customer_id;
  const stripe = getStripeClient();
  const customer = await stripe.customers.create({
    name: plan.client_name || undefined,
    email: plan.client_email || undefined,
    phone: plan.client_phone || undefined,
    metadata: { account_id: plan.account_id, recurring_plan_id: plan.id },
  });
  await createAdminClient()
    .from('recurring_plans')
    .update({ stripe_customer_id: customer.id, updated_at: new Date().toISOString() })
    .eq('id', plan.id);
  return customer.id;
}

// Hosted Stripe Checkout setup session that saves a card for off-session
// billing. Setup mode collects the mandate Stripe requires before a later
// merchant-initiated (off-session) charge is allowed.
export async function createCardSetupSession(plan: PlanCustomerInput, origin: string): Promise<string> {
  const stripe = getStripeClient();
  const customerId = await ensurePlanCustomer(plan);
  const session = await stripe.checkout.sessions.create({
    mode: 'setup',
    customer: customerId,
    payment_method_types: ['card'],
    metadata: { recurring_plan_id: plan.id, purpose: 'recurring_card' },
    setup_intent_data: { metadata: { recurring_plan_id: plan.id, purpose: 'recurring_card' } },
    success_url: `${origin}/card-saved?plan=${plan.id}`,
    cancel_url: `${origin}/card-saved?plan=${plan.id}&status=cancelled`,
  });
  if (!session.url) throw new Error('Stripe did not return a card setup URL.');
  return session.url;
}

// Webhook path: a setup session completed — persist the saved card (id + brand +
// last4) onto the plan so the recurring cron can charge it. Best-effort read of
// the card's brand/last4 for display; never throws on a missing card object.
export async function storeSavedCardFromSetup(setupIntentId: string, planId: string): Promise<void> {
  const stripe = getStripeClient();
  const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
  const pmId = typeof setupIntent.payment_method === 'string' ? setupIntent.payment_method : setupIntent.payment_method?.id ?? null;
  if (!pmId) return;

  let brand: string | null = null;
  let last4: string | null = null;
  try {
    const pm = await stripe.paymentMethods.retrieve(pmId);
    brand = pm.card?.brand ?? null;
    last4 = pm.card?.last4 ?? null;
  } catch (error) {
    console.error('Could not read saved card details:', error instanceof Error ? error.message : error);
  }

  await createAdminClient()
    .from('recurring_plans')
    .update({
      stripe_payment_method_id: pmId,
      card_brand: brand,
      card_last4: last4,
      updated_at: new Date().toISOString(),
    })
    .eq('id', planId);
}
