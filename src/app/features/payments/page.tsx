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
import {
  FEATURE_PRICING_NOTE,
  PLAN_FEE_RANGE_LABEL,
  PUBLIC_PRICING_SUMMARY,
  STRIPE_PROCESSING_NOTE,
} from '@/lib/pricing';

export const metadata: Metadata = {
  title: 'Contractor Payments and Deposits',
  description:
    'Take deposits, balances and 0%-interest payment plans through Stripe, with contractor plans starting at $0/month.',
  alternates: { canonical: 'https://letsgetquoted.com/features/payments' },
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/features/payments',
    siteName: "Let's Get Quoted",
    title: 'Get paid on the job, not thirty days after it.',
    description:
      'Deposits, balances and 0%-interest installments through Stripe, with plans starting at $0/month.',
    images: [{ url: '/features/og-payments.jpg', width: 1200, height: 630, alt: 'Contractor payments, deposits and payment plans' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Get paid on the job, not thirty days after it.',
    description:
      'Deposits, balances and 0%-interest installments through Stripe, with plans starting at $0/month.',
    images: ['/features/og-payments.jpg'],
  },
};

import styles from '@/components/marketing/suite-feature-page.module.css';

type FlowStep = {
  step: string;
  title: string;
  body: string;
  mock?: React.ReactNode;
  image?: { src: string; alt: string; width: number; height: number };
};

const PAYMENTS_FLOW: FlowStep[] = [
  {
    step: 'Step 1',
    title: '1-Tap deposit checkout via Stripe',
    body: 'Homeowners pay directly from the approved quote on mobile with Apple Pay, Google Pay, or Credit Card. Funds route directly to your Stripe account.',
    mock: (
      <div className={styles.shotMockContainer}>
        <div className={styles.shotMockHeader}>
          <span className={styles.shotMockTitle}>Hosted Deposit Checkout &middot; Apple Pay &amp; Cards</span>
          <span className={styles.shotBadgeGood}>Stripe Connected</span>
        </div>
        <dl className={styles.shotKeyValues}>
          <div className={styles.shotKeyRow}>
            <dt>Deposit Required (50%)</dt>
            <dd style={{ color: '#50e3bd' }}>$5,440.00</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Payment Methods</dt>
            <dd>Apple Pay, Google Pay, Visa/MC, ACH</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Contractor Payout</dt>
            <dd>2-day rolling payout to your bank</dd>
          </div>
        </dl>
      </div>
    ),
  },
  {
    step: 'Step 2',
    title: '0%-interest payment plans with saved card auto-billing',
    body: 'Split larger contracts into a deposit and scheduled monthly installments. It is zero-interest, zero-credit-check, and charges the saved card on schedule.',
    mock: (
      <div className={styles.shotMockContainer}>
        <div className={styles.shotMockHeader}>
          <span className={styles.shotMockTitle}>0%-Interest Installments &middot; Whitfield</span>
          <span className={styles.shotBadgeGood}>4 Installments @ $1,360</span>
        </div>
        <dl className={styles.shotKeyValues}>
          <div className={styles.shotKeyRow}>
            <dt>Approved Scope</dt>
            <dd>$10,880.00 Total (0% interest, no lender)</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Deposit Paid</dt>
            <dd style={{ color: '#50e3bd' }}>$5,440.00 captured Tue</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Auto-Billing Schedule</dt>
            <dd>Monthly charges against saved card</dd>
          </div>
        </dl>
      </div>
    ),
  },
  {
    step: 'Step 3',
    title: 'Capped-fee ACH bank transfer for jobs $1,500+',
    body: 'Bank debit is presented automatically when the flat fee beats a card percentage. Saves meaningful processing dollars on big-ticket remodels.',
    mock: (
      <div className={styles.shotMockContainer}>
        <div className={styles.shotMockHeader}>
          <span className={styles.shotMockTitle}>Automatic Fee Optimization &middot; Quote J-104 ($10,880)</span>
          <span className={styles.shotBadgeGood}>ACH Capped Rate</span>
        </div>
        <dl className={styles.shotKeyValues}>
          <div className={styles.shotKeyRow}>
            <dt>Standard Card Fee (2.9% + 30¢)</dt>
            <dd style={{ color: '#ef4444' }}>~$315.82</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Direct Bank Debit (0.8% capped)</dt>
            <dd style={{ color: '#50e3bd' }}>$5.00 capped</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Contractor Net Savings</dt>
            <dd style={{ color: '#50e3bd', fontWeight: 800 }}>+$310.82 retained</dd>
          </div>
        </dl>
      </div>
    ),
  },
  {
    step: 'Step 4',
    title: 'Locked itemized invoices & immutable receipts',
    body: 'Invoices lock instantly upon payment. Sequential references, tax breakdowns, and automated receipts eliminate bookkeeping errors at tax time.',
    mock: (
      <div className={styles.shotMockContainer}>
        <div className={styles.shotMockHeader}>
          <span className={styles.shotMockTitle}>Invoice #INV-2026-894 &middot; Whitfield</span>
          <span className={styles.shotBadgeGood}>Paid in Full</span>
        </div>
        <dl className={styles.shotKeyValues}>
          <div className={styles.shotKeyRow}>
            <dt>Payment Method</dt>
            <dd>Visa &middot;&middot;&middot;&middot; 4242 (Stripe)</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Receipt & PDF</dt>
            <dd>Emailed + SMS link delivered</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Accounting Ledger</dt>
            <dd>Locked &middot; QuickBooks sync ready</dd>
          </div>
        </dl>
      </div>
    ),
  },
];

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
      heroChips={[
        `${PLAN_FEE_RANGE_LABEL} LGQ platform fee, depending on plan`,
        `Stripe's ${STRIPE_PROCESSING_NOTE}`,
        'Applied only to eligible payments collected through LGQ',
      ]}
      heroNote={`Card numbers never touch us — Stripe holds them. Bank debit is offered automatically on payments of ${ACH_LABEL} or more, where a flat capped fee beats a card percentage.`}
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
        { title: PLAN_FEE_RANGE_LABEL, body: 'Your selected plan sets the LGQ platform-fee rate.' },
      ]}
      story={{
        eyebrow: 'Choose the trade-off that fits',
        title: 'Start without a fixed bill, or pay less per collected job.',
        body: 'Flex has a $0 monthly base price and a 1.25% LGQ platform fee. Solo, Growth, and Scale add a predictable subscription in exchange for lower platform-fee rates and more included capacity. Your rate follows your plan, not a trailing-volume bracket.',
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
      afterBenefits={
        <section className="section-block" id="the-screens" aria-labelledby="screens-title">
          <div className={styles.shotsHead}>
            <p className="eyebrow">The checkout and payment flow</p>
            <h2 id="screens-title">Get paid directly to Stripe with zero hassle.</h2>
            <p>
              Hosted deposits, 0% installments, capped-fee bank transfers, and locked accounting receipts.
            </p>
          </div>

          <ol className={styles.shots}>
            {PAYMENTS_FLOW.map((shot) => (
              <li className={styles.shot} key={shot.step}>
                <div className={styles.shotCopy}>
                  <span className={styles.shotStep}>{shot.step}</span>
                  <h3 className={styles.shotTitle}>{shot.title}</h3>
                  <p className={styles.shotBody}>{shot.body}</p>
                </div>
                <div className={styles.shotMedia}>
                  {shot.image ? (
                    <img
                      src={shot.image.src}
                      alt={shot.image.alt}
                      width={shot.image.width}
                      height={shot.image.height}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    shot.mock
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      }
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
          a: `${PUBLIC_PRICING_SUMMARY} The LGQ fee applies only to the discount-adjusted service subtotal successfully collected through LGQ. Taxes, tips, refunds, credits, and Stripe costs are excluded; Stripe's ${STRIPE_PROCESSING_NOTE} are separate.`,
        },
      ]}
      cta={{
        title: 'Take the deposit before you load the truck.',
        note: `${FEATURE_PRICING_NOTE} Stripe's ${STRIPE_PROCESSING_NOTE} are separate.`,
      }}
    />
  );
}
