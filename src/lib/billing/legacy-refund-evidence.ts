import type Stripe from 'stripe';

const id = (value: string | {id:string} | null): string | null => typeof value === 'string' ? value : value?.id ?? null;
const check = (value: unknown): void => { if (!value) throw new Error('Legacy refund evidence could not be verified.'); };

/** Refetch current platform evidence; an event's aggregate can include unfinished refunds. */
export async function resolveLegacyRefundEvidence(stripe: Stripe, input: {
  chargeId: string; paymentId: string; paymentIntent: string | null; amountCents: number; livemode: boolean;
}): Promise<number> {
  check(/^(ch|py)_[A-Za-z0-9_]+$/.test(input.chargeId) && !!input.paymentIntent && typeof input.livemode === 'boolean');
  const charge = await stripe.charges.retrieve(input.chargeId);
  check(charge.id === input.chargeId && charge.metadata.payment_id === input.paymentId
    && id(charge.payment_intent) === input.paymentIntent && charge.livemode === input.livemode
    && charge.currency === 'usd' && charge.paid && charge.captured
    && Number.isSafeInteger(input.amountCents) && input.amountCents > 0
    && charge.amount === input.amountCents && charge.amount_captured === input.amountCents);
  let total = 0;
  let cursor: string | undefined;
  const seen = new Set<string>();
  for (let page = 0; page < 10; page++) {
    const result = await stripe.refunds.list({charge:charge.id,limit:100,...(cursor ? {starting_after:cursor} : {})});
    check(typeof result.has_more === 'boolean' && Array.isArray(result.data));
    for (const refund of result.data) {
      check(!!refund.id && !seen.has(refund.id) && id(refund.charge) === charge.id
        && id(refund.payment_intent) === input.paymentIntent && refund.currency === charge.currency
        && Number.isSafeInteger(refund.amount) && refund.amount > 0);
      seen.add(refund.id);
      if (refund.status === 'succeeded') total += refund.amount;
      else check(['pending','requires_action','failed','canceled'].includes(refund.status ?? ''));
    }
    check(Number.isSafeInteger(total) && total <= input.amountCents);
    if (!result.has_more) return total;
    check(result.data.length > 0);
    cursor = result.data[result.data.length - 1].id;
  }
  throw new Error('Legacy refund evidence pagination is incomplete.');
}
