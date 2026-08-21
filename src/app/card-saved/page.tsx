import { createAdminClient } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Public landing after a client finishes (or cancels) the hosted card-setup
 * flow for a recurring plan. No session, no charge.
 *
 * WHAT WAS WRONG. This page decided it had succeeded by looking at one thing:
 * whether `?status=cancelled` was absent. Everything else -- including a card
 * setup that completed in Stripe and was never recorded on our side -- got
 *
 *   "You're all set ✓
 *    Your card is saved securely with Stripe. Each scheduled visit will be
 *    billed automatically."
 *
 * That is an assertion about a fact the page had not checked. The card is
 * recorded by `storeSavedCardFromSetup`, called from the
 * checkout.session.completed webhook, and it can fail on its own: the
 * SetupIntent may carry no payment method, the webhook may error, or -- much the
 * commonest -- it simply has not arrived yet, because Stripe redirects the
 * browser and delivers the webhook independently.
 *
 * So a customer could be told automatic billing was set up, the plan would have
 * no card on it, and the first anyone would learn of it is a failed installment
 * weeks later.
 *
 * THREE STATES, NOT TWO. The success_url carries `?plan=`, so this page can
 * simply look. Cancelled says so. A recorded card says so, and names the card,
 * because "we have it" is worth far more than "it worked". A card not yet
 * recorded says exactly that -- not an error, because the overwhelmingly likely
 * cause is a webhook a second behind the redirect, and telling somebody their
 * card failed when it did not is its own defect.
 *
 * The plan id is a UUID the customer was sent, and the only thing read against
 * it is whether a card is on file and its brand and last four -- which is the
 * card they typed in a moment ago. Same posture as /pay/[id], which shows an
 * amount and a business name to anybody holding the payment id.
 */

type CardState =
  | { kind: 'cancelled' }
  | { kind: 'saved'; brand: string | null; last4: string | null }
  | { kind: 'not_yet' };

async function readCardState(planId: string | undefined, cancelled: boolean): Promise<CardState> {
  if (cancelled) return { kind: 'cancelled' };
  // No plan on the URL means nothing can be checked. Treated as not-yet rather
  // than as success: this page must never claim a card it has not seen.
  if (!planId) return { kind: 'not_yet' };

  const { data, error } = await createAdminClient()
    .from('recurring_plans')
    .select('stripe_payment_method_id, card_brand, card_last4')
    .eq('id', planId)
    .maybeSingle();

  // A read failure is not evidence of success either.
  if (error || !data?.stripe_payment_method_id) return { kind: 'not_yet' };
  return { kind: 'saved', brand: data.card_brand ?? null, last4: data.card_last4 ?? null };
}

export default async function CardSavedPage({
  searchParams,
}: {
  searchParams: { status?: string; plan?: string };
}) {
  const state = await readCardState(searchParams.plan, searchParams.status === 'cancelled');

  return (
    <main className="wide-shell workspace-shell payment-shell">
      <section className="workspace-hero panel payment-hero">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Automatic billing</p>

          {state.kind === 'cancelled' ? (
            <>
              <h1 className="workspace-title">Card setup cancelled</h1>
              <p className="workspace-lead">
                No card was saved and nothing was charged. If you meant to set up automatic billing, just open the
                link your contractor sent you again.
              </p>
            </>
          ) : state.kind === 'saved' ? (
            <>
              <h1 className="workspace-title">You&apos;re all set ✓</h1>
              <p className="workspace-lead">
                {state.brand && state.last4
                  ? `We have your ${state.brand} ending ${state.last4}, saved securely with Stripe.`
                  : 'Your card is saved securely with Stripe.'}
                {' '}Each scheduled visit will be billed automatically — you&apos;ll get a receipt every time. You can
                ask your contractor to stop automatic billing at any point.
              </p>
            </>
          ) : (
            <>
              {/* Not an error. The likeliest cause by far is a webhook arriving a
                  second behind the browser, and telling somebody their card
                  failed when it did not is its own defect. */}
              <h1 className="workspace-title">Just confirming your card</h1>
              <p className="workspace-lead">
                Your details went to Stripe and we&apos;re waiting for them to confirm — this usually takes a few
                seconds. Refresh this page in a moment and it should say you&apos;re all set.
              </p>
              <p className="workspace-lead">
                Nothing has been charged. If it still says this after a minute or two, reply to the message your
                contractor sent the link in, so they can check it before your next visit.
              </p>
            </>
          )}

          <div className="actions workspace-actions">
            {state.kind === 'not_yet' ? (
              <a className="btn primary" href={searchParams.plan ? `/card-saved?plan=${encodeURIComponent(searchParams.plan)}` : '/card-saved'}>
                Refresh
              </a>
            ) : null}
            <a className="btn secondary" href="/privacy">Privacy Policy</a>
            <a className="btn secondary" href="/sms-terms">SMS Terms</a>
          </div>
        </div>
      </section>
    </main>
  );
}
