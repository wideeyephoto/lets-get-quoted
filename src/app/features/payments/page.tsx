import type { Metadata } from 'next';
import ExampleFrame from '@/components/marketing/example-frame';
import SuiteFeaturePage, {
  Panel,
  PanelActions,
  PanelHead,
  PanelNote,
  PanelRows,
} from '@/components/marketing/suite-feature-page';
import { ACH_MIN_AMOUNT } from '@/lib/payments';
import { DEFAULT_PLAN } from '@/lib/payment-plan-math';
import { FEE_TIERS, STRIPE_PROCESSING_NOTE } from '@/lib/pricing';

export const metadata: Metadata = {
  title: 'Contractor Payments and Deposits',
  description:
    'Take deposits, balances and 0%-interest payment plans through Stripe, into your own account. No subscription — you pay only when a homeowner pays you.',
  alternates: { canonical: 'https://letsgetquoted.com/features/payments' },
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/features/payments',
    siteName: "Let's Get Quoted",
    title: 'Get paid on the job, not thirty days after it.',
    description:
      'Deposits, balances and 0%-interest installments through Stripe, into your account. No subscription — you pay only when a homeowner pays you.',
    images: [{ url: '/features/og-payments.jpg', width: 1200, height: 630, alt: 'Contractor payments, deposits and payment plans' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Get paid on the job, not thirty days after it.',
    description:
      'Deposits, balances and 0%-interest installments through Stripe, into your account. No subscription — you pay only when a homeowner pays you.',
    images: ['/features/og-payments.jpg'],
  },
};

const ACH_LABEL = `$${ACH_MIN_AMOUNT.toLocaleString('en-US')}`;

export default function PaymentsFeaturePage() {
  return (
    <SuiteFeaturePage
      breadcrumb={{ name: 'Payments', path: '/features/payments' }}
      eyebrow="Payments through Stripe"
      title={
        <>
          Get paid on the job, <em>not thirty days after it.</em>
        </>
      }
      lede="Take a deposit when the quote is approved and the balance when the work is done. The money goes to your Stripe account, and you pay a percentage only when a homeowner actually pays you."
      /* The three facts that decide it, above the button. The exact rate was
         4,000px down the page in the closing band, which is the wrong place for
         the number somebody is trying to find. Read from FEE_TIERS, so it
         cannot drift from /pricing. */
      heroChips={[
        `${FEE_TIERS[0].rate}–${FEE_TIERS[FEE_TIERS.length - 1].rate} platform fee`,
        `Stripe's ${STRIPE_PROCESSING_NOTE}`,
        'Only when a homeowner pays you',
      ]}
      heroNote={`Card numbers never touch us — Stripe holds them. Bank debit is offered automatically on payments of ${ACH_LABEL} or more, where a flat capped fee beats a card percentage.`}
      /* No /demo/payments screen exists, so "See the payment flow" would be a
         button that lands somewhere adjacent — worse than none. The contextual
         action here is the thing the page is actually selling, pointed at
         signup; the second action stays on the page rather than repeating it. */
      primary={{ label: 'Start taking deposits' }}
      secondary={{ label: 'Every way you can be paid', href: '#capabilities' }}
      demo={
        <ExampleFrame
          label="One approved quote, split into a deposit and installments."
          note="Invented job. The mechanism is real: a plan allocates the approved total and can never increase it, and the installments are 0% — no interest, no fee, no credit check."
        >
          <Panel>
            <PanelHead title="Payment plan · Whitfield" pill="Deposit paid" tone="good" />
            <PanelRows
              rows={[
                { label: 'Approved total', value: '$10,880' },
                { label: `Deposit · ${DEFAULT_PLAN.depositPercent}%, paid Tue`, value: '$5,440' },
                { label: `${DEFAULT_PLAN.installmentCount} installments · ${DEFAULT_PLAN.frequency}`, value: '$1,360 each' },
                { label: 'Interest and fees added', value: '$0', strong: true },
              ]}
            />
            <PanelNote>
              Installments run against the card saved when the deposit was taken. A decline is
              classified and retried, or routed to a card-update link — it does not become a
              phone call you have to remember to make.
            </PanelNote>
            <PanelActions labels={['Send the link', 'Download invoice']} />
          </Panel>
        </ExampleFrame>
      }
      proof={[
        { title: 'Straight to your Stripe', body: 'Your account, your payout schedule.' },
        { title: '0% payment plans', body: 'No interest, no credit check, no advance.' },
        { title: `Bank debit at ${ACH_LABEL}+`, body: 'Offered where it beats a card fee.' },
        { title: `From ${FEE_TIERS[0].rate} to ${FEE_TIERS[FEE_TIERS.length - 1].rate}`, body: 'The fee falls as your volume grows.' },
      ]}
      story={{
        eyebrow: 'You only pay when you get paid',
        title: 'A subscription charges you in the months you are slow.',
        body: 'There is no monthly plan here. The platform fee is a percentage of money a homeowner actually hands you, it is marginal across yearly volume the way tax brackets are, and it falls as you grow. A quiet January costs you nothing, which is the only pricing shape that makes sense for work that has seasons.',
      }}
      benefits={[
        {
          title: 'Ask for the deposit while they are still saying yes',
          body: 'The approved quote already has a total and a customer, so the deposit request is a link, not an invoice you build afterwards. You can require it to be paid before the job is scheduled or before work starts.',
        },
        {
          title: 'Offer installments without financing anybody',
          body: 'Split an approved total into a deposit and fixed installments at 0%. It is not lending: no interest, no fees, no credit check and no advance to you. The plan allocates the quote total and can never increase it.',
        },
        {
          title: 'Keep the books straight either way',
          body: 'Itemized invoices with tax, discounts and sequential references, downloadable as PDF and locked once paid. Cash and cheques are logged so they reconcile properly, and refunds and chargebacks are tracked rather than remembered.',
        },
      ]}
      stepsEyebrow="From approved to in the bank"
      stepsTitle="Four steps, and none of them is an emailed invoice."
      steps={[
        {
          title: 'Connect Stripe once',
          body: 'Payouts go to your own account on your own schedule. We never see or store a card number.',
        },
        {
          title: 'Take the deposit',
          body: 'A hosted checkout link from the approved quote. Card, or bank debit when the amount makes that the cheaper option.',
        },
        {
          title: 'Bill the rest the way the job runs',
          body: 'Stage payments as the work reaches them, or a plan that charges the saved card on a fixed schedule.',
        },
        {
          title: 'Close it out',
          body: 'The invoice locks when it is paid. Refunds are full or partial, tracked, and the customer is texted automatically.',
        },
      ]}
      catalog={['payments']}
      catalogEyebrow="Every way you can be paid"
      catalogTitle="Ten things that happen between “approved” and “paid”."
      catalogNote="All of them attach to the job the quote was approved on, which is why the invoice, the deposit and the balance are never three different records to keep in step."
      faq={[
        {
          q: 'Whose money is it, and when?',
          a: 'Yours, into your own Stripe account, on Stripe’s payout schedule. We do not hold your funds and we never see card numbers — Stripe does that part, which is also why the compliance burden is not yours.',
        },
        {
          /* The half of this that a contractor reads past. "No advance paid to
             you" is doing enormous work in one clause: the obvious assumption
             about a payment plan is that somebody fronts the money and collects
             from the customer afterwards, which is what every consumer
             financing product does. Nothing here does. Said plainly, because
             finding it out in month two is a very expensive surprise. */
          q: 'Do payment plans pay me up front?',
          a: 'No — and this is the thing to be clear about before you offer one. Nobody advances you the money. You receive the deposit when it is paid and each installment as it is charged, on the schedule the customer agreed to, so a plan spreads your income exactly as much as it spreads their payments. It is not financing: no interest, no fee, no credit check, no third party buying the receivable. It splits a total the customer already approved and can never increase it.',
        },
        {
          q: 'Why does bank debit only show up sometimes?',
          a: `It is offered automatically on one-off payments of ${ACH_LABEL} or more. Bank debit has a flat capped fee, so on a large job it costs meaningfully less than a card percentage; on a small one it is slower for no saving.`,
        },
        {
          q: 'What happens when a card declines?',
          a: 'It is classified rather than just failed. Some declines are retried, and the ones that will not succeed are routed to a card-update link for the customer — so a lapsed card becomes a message they can act on instead of an invoice quietly going unpaid.',
        },
        {
          q: 'What exactly do I pay?',
          a: `A platform fee on money a homeowner actually pays you, plus Stripe's standard processing (${STRIPE_PROCESSING_NOTE}). The platform fee is marginal across your trailing-year volume, like tax brackets: ${FEE_TIERS.map((tier) => `${tier.rate} on ${tier.rangeLabel}`).join(', ')}. No subscription, no setup fee, and nothing at all in a month where nobody pays you.`,
        },
      ]}
      cta={{
        title: 'Take the deposit before you load the truck.',
        note: `No subscription and no setup fee. The platform fee is ${FEE_TIERS[0].rate} of what you collect and falls to ${FEE_TIERS[FEE_TIERS.length - 1].rate} as your volume grows, plus Stripe processing (${STRIPE_PROCESSING_NOTE}).`,
      }}
    />
  );
}
