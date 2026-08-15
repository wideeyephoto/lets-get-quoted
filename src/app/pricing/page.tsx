import Link from 'next/link';
import type { Metadata } from 'next';
import { FEE_TIERS, STRIPE_PROCESSING_NOTE, marginalTierForVolume } from '@/lib/pricing';
import { FEATURE_COUNT } from '@/lib/features';
import PricingCalculator from './PricingCalculator';
import { ExampleFrame, PriceZeroDial } from '@/components/marketing';
import { APP_SIGNUP_URL } from '@/components/marketing/links';
import SiteFooter from '@/components/site-footer';
import { cspNonce } from '@/lib/csp-nonce';
import styles from './pricing.module.css';

export const metadata: Metadata = {
  title: 'Pricing',
  // Read from FEE_TIERS, not typed out: this description and the FAQ answer
  // below are the two places a stale rate would ship to search engines rather
  // than merely to the page.
  description: `No subscription and no setup fee. A platform fee of ${FEE_TIERS[FEE_TIERS.length - 1].rate}–${FEE_TIERS[0].rate} applies only when a homeowner pays you, and drops as you grow. Try the fee calculator.`,
  alternates: { canonical: 'https://letsgetquoted.com/pricing' },
  /* SHARED, THIS PAGE READ THE HOMEPAGE'S. A link to /pricing in a text or a
     Facebook group unfurled as the site's generic card — the brand tagline and
     the homepage image — so the one thing the link was sent to answer did not
     appear in the preview. The title carries the brand because the layout's
     title template does not reach openGraph. */
  openGraph: {
    title: 'Pricing · Let’s Get Quoted',
    description: `No monthly subscription and no setup fee. A platform fee from ${FEE_TIERS[0].rate} down to ${FEE_TIERS[FEE_TIERS.length - 1].rate}, charged only when a homeowner actually pays you.`,
    url: 'https://letsgetquoted.com/pricing',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pricing · Let’s Get Quoted',
    description: `No monthly subscription. A platform fee from ${FEE_TIERS[0].rate} down to ${FEE_TIERS[FEE_TIERS.length - 1].rate}, only when you get paid.`,
  },
};

// Presentation heights for the tier bars — tallest tier is the highest rate.
const BAR_HEIGHTS = [180, 144, 115, 94];

const included = [
  'Your contractor website + free subdomain',
  'AI instant estimate & lead intake',
  'Quotes, e-signatures & the client portal',
  'Scheduling, online booking & reminders',
  'Jobs, crew, hours & the field app',
  'Recurring plans & auto-billing',
  'Reviews, campaigns & rebook',
  'Insights, tax reports & QuickBooks export',
];

// ---- "Where a single payment goes" -----------------------------------------
// The tier chart states rates and the calculator states yearly totals; neither
// shows one payment, which is the FAQ's own question further down ("When am I
// charged?" — "the fee comes out of that payment automatically"). That answer is
// literally how the product works: payments.platform_fee is a real per-payment
// column, summed in src/lib/platform-fees.ts.
//
// Nothing below is typed out. The amount is an example, declared as one and
// shown inside an ExampleFrame; the fee is computed from FEE_TIERS at the FIRST
// tier — the highest of the four, the rate before any volume discount — so the
// slice drawn is the largest it ever gets.
const SAMPLE_PAYMENT = 2400;
const SAMPLE_TIER = marginalTierForVolume(0);
const SAMPLE_FEE = SAMPLE_PAYMENT * (SAMPLE_TIER.ratePct / 100);
const SAMPLE_AFTER_FEE = SAMPLE_PAYMENT - SAMPLE_FEE;
// Bar geometry, derived from the money rather than restated, so the drawing and
// the ledger can never disagree.
const SAMPLE_FEE_SHARE = (SAMPLE_FEE / SAMPLE_PAYMENT) * 100;

function money(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

// The pricing-model comparison. Deliberately a comparison of two BILLING
// MODELS, not of two products: no vendor is named, and no competitor's price is
// stated as fact — plans vary, they change, and quoting someone else's number
// on a page this page's job is to be trusted on would be the one claim here we
// couldn't stand behind. Every "them" cell is written about the conventional
// per-seat subscription model in general and hedged accordingly.
//
// The homepage table at src/app/page.tsx compares CAPABILITY across three
// product categories. This one compares only what you're billed and when, which
// is what someone who has just dragged the calculator above is actually asking.
const FIRST_TIER_RATE = FEE_TIERS[0].rate;
const LAST_TIER_RATE = FEE_TIERS[FEE_TIERS.length - 1].rate;

const modelColumns = [
  {
    key: 'lgq',
    label: 'Let’s Get Quoted',
    tag: 'One platform fee, only on money you collect',
    highlight: true,
  },
  {
    key: 'sub',
    label: 'Per-seat monthly software',
    tag: 'The conventional contractor suite',
    highlight: false,
  },
];

type ModelCell = { tone: 'good' | 'mid' | 'bad'; value?: string; text: string };
type ModelRow = { label: string; cells: [ModelCell, ModelCell] };

const MODEL_TONE_MARK: Record<ModelCell['tone'], string> = { good: '✓', mid: '~', bad: '✕' };

const modelRows: ModelRow[] = [
  {
    label: 'Monthly software subscription',
    cells: [
      { tone: 'good', value: '$0', text: 'No per-seat bill before the company earns.' },
      {
        tone: 'bad',
        text: 'A flat monthly bill, usually priced per seat, due on the same date whether or not the month brought work.',
      },
    ],
  },
  {
    label: 'When a homeowner pays you',
    cells: [
      { tone: 'good', value: 'Aligned', text: 'A platform fee applies to completed transactions.' },
      {
        tone: 'mid',
        text: 'Nothing extra at that moment — the subscription was already paid, collected or not.',
      },
    ],
  },
  {
    label: 'As the business grows',
    cells: [
      {
        tone: 'good',
        value: 'Lower rate',
        text: `The platform rate drops with growth — marginal rate falls from ${FIRST_TIER_RATE} to ${LAST_TIER_RATE} across your trailing 12-month volume, automatically.`,
      },
      {
        tone: 'bad',
        text: 'Growth typically means more seats and a higher plan tier, so the bill rises as the crew does.',
      },
    ],
  },
  {
    label: 'A slow month',
    cells: [
      {
        tone: 'good',
        value: '$0',
        text: 'If customers do not pay you through the platform, your monthly software bill is $0.',
      },
      { tone: 'bad', text: 'The subscription renews on schedule regardless.' },
    ],
  },
  {
    label: 'What you get on day one',
    cells: [
      {
        tone: 'good',
        value: 'Everything',
        text: `Full-featured from the beginning — all ${FEATURE_COUNT} features on every account.`,
      },
      {
        tone: 'mid',
        text: 'Feature tiers and paid add-ons are common, so the entry price is rarely the whole product.',
      },
    ],
  },
];

const pricingFaqs = [
  {
    q: 'What do I pay to start?',
    a: 'Nothing. There’s no subscription and no setup fee — you build your site, send quotes, and run jobs for free.',
  },
  {
    q: 'When am I charged?',
    a: 'Only when a homeowner actually pays you through the platform. The fee comes out of that payment automatically.',
  },
  {
    q: 'What about card processing?',
    a: `Standard Stripe processing (${STRIPE_PROCESSING_NOTE}) applies separately and goes to Stripe, not to us.`,
  },
  {
    q: 'How does the rate drop?',
    a: `The platform fee is marginal across your trailing-12-month volume — as you collect more, each new bracket is charged at a lower rate, all the way down to ${LAST_TIER_RATE}. It happens automatically, with no call to sales.`,
  },
  /* SIX QUESTIONS THAT WERE NOT HERE.
     Every answer below is sourced from something in the codebase rather than
     from a policy invented for the page: the refund answer describes what
     reversedPlatformFee() actually computes, the volume answer describes what
     the trailing window actually sums, and where the honest answer is "that
     part is Stripe's", it says so instead of quoting a number this page has no
     source for. */
  {
    q: 'What counts toward my trailing-12-month volume?',
    a: 'Payments a homeowner actually made to you through the platform in the last 12 months — card and bank. Quotes you sent, jobs you scheduled, and invoices nobody has paid yet do not count toward it, because nothing has been collected.',
  },
  {
    q: 'What happens at a bracket boundary — and can my rate go back up?',
    a: `The brackets work like tax brackets, not like a plan you get moved onto: crossing into a new one only changes the rate on the volume above the line, never on what you already collected. And yes, the rate can move back up — it is figured on a rolling 12 months, so if a quiet year drops your trailing volume back into a lower bracket, the rate on your next dollar returns to that bracket's rate. It never exceeds ${FIRST_TIER_RATE}, the starting rate.`,
  },
  {
    q: 'If I refund a customer, do I get the platform fee back?',
    a: 'Yes, in proportion to the refund. Refund half a payment and half the platform fee on it is returned; refund it in full and the whole fee comes back, so a fully refunded payment costs you nothing in platform fee. Stripe’s own processing fee on the original charge is Stripe’s to return or keep, and follows their policy rather than ours.',
  },
  {
    q: 'What about chargebacks?',
    a: 'A chargeback is the homeowner’s bank pulling the money back, and it is handled through Stripe’s dispute process — you will see the payment change state in the job so it is not a surprise on a statement. We do not add a fee of our own on top of a dispute; any dispute fee is Stripe’s and is set by them.',
  },
  {
    q: 'Does a bank payment cost the same as a card?',
    a: `The platform fee is the same either way — it is a percentage of what you collect, not of how it arrived. What differs is Stripe’s processing, which is cheaper on bank debit than on card for large amounts, which is why bank payment is offered automatically on bigger one-off payments with a fallback to card. Card processing runs ${STRIPE_PROCESSING_NOTE}; bank rates are set by Stripe.`,
  },
  {
    q: 'What do I need for payouts, and is there anything to cancel?',
    a: 'Payouts run through your own Stripe account, which you connect once — Stripe verifies your business and pays out to your bank on their schedule, which you can see in your Stripe dashboard. There is no contract, no minimum and no subscription to cancel: because you are only charged when you collect, nothing is running in the background. You can export your data and delete the account whenever you want.',
  },
];

const pricingJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: pricingFaqs.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
};

export default function PricingPage() {
  return (
    <main className={`${styles.page} marketing-shell`} id="main-content">
      <script type="application/ld+json" nonce={cspNonce()} dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd) }} />
      <div className="ambient-glow ambient-glow-a" aria-hidden="true" />
      <div className="ambient-glow ambient-glow-b" aria-hidden="true" />

      <section className={`${styles.hero} section-block features-hero`}>
        <div className={styles.heroCopy}>
          <div className="section-heading">
            <p className="eyebrow">Simple, growth-aligned pricing</p>
            <h1>
              The whole platform. <span className="gradient-text">$0 until you get paid.</span>
            </h1>
            <p className={styles.heroLead}>
              All {FEATURE_COUNT} features are included from day one. There&apos;s no setup fee, monthly subscription,
              or paid feature maze — just a platform fee when a homeowner actually pays you.
            </p>
          </div>
          <div className="actions">
            <a href={APP_SIGNUP_URL} className="btn primary">Build my free site <span aria-hidden="true">&rarr;</span></a>
            <Link href="/demo" className="btn secondary">Explore the demo</Link>
          </div>
          <ul className={styles.heroTrust} aria-label="Pricing promises">
            <li><span aria-hidden="true">✓</span> No setup fee</li>
            <li><span aria-hidden="true">✓</span> No per-seat pricing</li>
            <li><span aria-hidden="true">✓</span> No feature tiers</li>
          </ul>
        </div>

        <div className={styles.heroVisual} aria-label="Starting price and platform fee">
          <div className={styles.heroVisualTop}>
            <span>Start here</span>
            <span>No contract</span>
          </div>
          <PriceZeroDial variant="lead" className={styles.heroDial} />
          <div className={styles.heroFeeSummary}>
            <span>Then, only when a homeowner pays</span>
            <p>
              <strong>{FIRST_TIER_RATE}</strong>
              <small>starting platform fee</small>
            </p>
            <span>Automatically steps down to {LAST_TIER_RATE} as your volume grows.</span>
          </div>
        </div>

        <ul className={styles.heroMetrics} aria-label="Pricing at a glance">
          <li><strong>{FEATURE_COUNT}</strong><span>features included</span></li>
          <li><strong>$0</strong><span>in a slow month</span></li>
          <li><strong>{LAST_TIER_RATE}</strong><span>lowest marginal fee</span></li>
        </ul>
      </section>

      <nav className={styles.sectionNav} aria-label="Pricing sections">
        <a href="#rates"><span>01</span> Rates</a>
        <a href="#calculator"><span>02</span> Calculator</a>
        <a href="#included"><span>03</span> What&apos;s included</a>
        <a href="#compare"><span>04</span> Compare</a>
        <a href="#questions"><span>05</span> Questions</a>
      </nav>

      <section className={`${styles.rateSection} section-block`} id="rates" aria-labelledby="rates-title">
        <div className={styles.sectionTop}>
          <div className="section-heading">
            <p className="eyebrow">The more you grow, the less you pay</p>
            <h2 id="rates-title">One simple fee. Four automatic steps down.</h2>
            <p>
              The platform fee is marginal across your trailing 12-month volume. Each new bracket is charged at a
              lower rate, without a sales call or plan change.
            </p>
          </div>
          <div className={styles.slowMonthCard}>
            <span>Your platform bill in a slow month</span>
            <strong>$0</strong>
            <small>No homeowner payment means no platform fee.</small>
          </div>
        </div>
        <div className={styles.tierGrid}>
          {FEE_TIERS.map((tier, index) => (
            <article className={styles.tierCard} data-best={tier.tier === 4 ? 'true' : undefined} key={tier.tier}>
              <div className={styles.tierMeta}>
                <span>Tier {tier.tier}</span>
                {tier.tier === 4 ? <em>Lowest rate</em> : null}
              </div>
              <div className={styles.tierVisual}>
                <strong>{tier.rate}</strong>
                <span className={styles.tierTrack} aria-hidden="true">
                  <span style={{ height: `${BAR_HEIGHTS[index]}px` }} />
                </span>
              </div>
              <p>{tier.rangeLabel}</p>
            </article>
          ))}
        </div>
        <p className={styles.rateFootnote}>
          <span aria-hidden="true">i</span>
          Platform fee only. Standard Stripe processing ({STRIPE_PROCESSING_NOTE}) applies separately and goes to Stripe.
        </p>
      </section>

      <section className={`${styles.calculatorSection} section-block`} id="calculator" aria-labelledby="calculator-title">
        <div className={styles.calculatorIntro}>
          <div className="section-heading">
            <p className="eyebrow">Run your real numbers</p>
            <h2 id="calculator-title">Know the cost before you commit.</h2>
            <p>
              Set your yearly volume and a typical job. The calculator applies every bracket and shows what lands in
              your bank after both platform and Stripe fees.
            </p>
          </div>
          <p className={styles.calculatorPromise}>
            <span>Live estimate</span>
            <strong>No email. No sales call.</strong>
          </p>
        </div>
        <PricingCalculator />
      </section>

      {/* Its own section rather than a panel tacked under the calculator: a
          static figure sitting directly beneath a slider looks like it ought to
          move when you drag, and this one doesn't.

          Stripe's cut is named but not drawn. src/lib/pricing.ts publishes it as
          prose (STRIPE_PROCESSING_NOTE), not as numbers, so quantifying it here
          would mean typing a percentage this page has no source for — exactly
          the invented precision we don't ship. The bar therefore shows only the
          split we can compute exactly, and the note says so. */}
      <section className={`${styles.paymentSection} section-block`} aria-labelledby="one-payment-title">
        <div className="section-heading">
          <p className="eyebrow">One job, one payment</p>
          <h2 id="one-payment-title">Where a single payment goes.</h2>
          <p>
            The fee comes out of the payment itself &mdash; there&apos;s no separate invoice from us and nothing to
            settle up at the end of the month.
          </p>
        </div>
        <ExampleFrame
          className={styles.payFrame}
          label={`One ${money(SAMPLE_PAYMENT)} payment, split to scale`}
          note={
            <>
              The two slices are true widths: at {SAMPLE_TIER.rate}, the platform fee is the thin slice on the right.
              Standard Stripe processing ({STRIPE_PROCESSING_NOTE}) is deducted by Stripe separately and is not part of
              the bar, so what finally settles in your bank is a little under the figure above. The payment amount is
              an example; the fee is calculated from the published tiers at Tier {SAMPLE_TIER.tier} &mdash; the highest
              of the {FEE_TIERS.length}, before any volume discount.
            </>
          }
        >
          <div className={styles.payAnatomy}>
            <p className={styles.payTotal}>
              <span className={styles.payTotalLabel}>A homeowner pays you</span>
              <strong className={styles.payTotalValue}>{money(SAMPLE_PAYMENT)}</strong>
            </p>
            {/* Decorative: every value it encodes is stated as text in the list
                below, so there is nothing here for a screen reader to lose. */}
            <div className={styles.payBar} aria-hidden="true">
              <span className={styles.payBarNet} style={{ width: `${100 - SAMPLE_FEE_SHARE}%` }} />
              <span className={styles.payBarFee} style={{ width: `${SAMPLE_FEE_SHARE}%` }} />
            </div>
            <ul className={styles.payRows}>
              <li>
                <span className={`${styles.paySwatch} ${styles.paySwatchNet}`} aria-hidden="true" />
                <span className={styles.payRowLabel}>
                  Left after our fee
                  <small>Before Stripe&apos;s processing, which Stripe deducts separately.</small>
                </span>
                <span className={styles.payRowValue}>{money(SAMPLE_AFTER_FEE)}</span>
              </li>
              <li>
                <span className={`${styles.paySwatch} ${styles.paySwatchFee}`} aria-hidden="true" />
                <span className={styles.payRowLabel}>
                  Platform fee &mdash; Tier {SAMPLE_TIER.tier} at {SAMPLE_TIER.rate}
                  <small>The only charge from us, taken out of this payment automatically.</small>
                </span>
                <span className={styles.payRowValue}>&minus;{money(SAMPLE_FEE)}</span>
              </li>
              <li className={styles.payRowAside}>
                <span className={`${styles.paySwatch} ${styles.paySwatchOther}`} aria-hidden="true" />
                <span className={styles.payRowLabel}>
                  Stripe card processing
                  <small>{STRIPE_PROCESSING_NOTE} &mdash; charged by Stripe, not by us, and not drawn above.</small>
                </span>
                <span className={styles.payRowValue}>Separate</span>
              </li>
            </ul>
          </div>
        </ExampleFrame>
      </section>

      <section className={`${styles.includedSection} section-block`} id="included" aria-labelledby="included-title">
        <div className={styles.includedLayout}>
          <div className="section-heading">
            <p className="eyebrow">All in, no add-ons</p>
            <h2 id="included-title">Everything&apos;s included in that one fee.</h2>
            <p>No per-seat pricing, no premium tier, no feature paywall &mdash; every account gets the whole toolkit.</p>
            <Link href="/features" className={`${styles.textLink} btn secondary`}>
              See all {FEATURE_COUNT} features <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
          <ul className={styles.includedGrid}>
            {included.map((item, index) => (
              <li key={item}>
                <span className={styles.includedIcon} aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Sits here, after "no per-seat pricing, no premium tier, no feature
          paywall" has been asserted above and before the FAQ, because that
          sentence is the setup and this table is the evidence for it. Putting
          it earlier would make that line an echo of a point already proved. */}
      <section className={`${styles.compareSection} section-block compare-band`} id="compare" aria-labelledby="compare-title">
        <div className="section-heading">
          <p className="eyebrow">One model from one truck to ten crews</p>
          <h2 id="compare-title">When business is slow, <span className="gradient-text">your software bill is $0.</span></h2>
          <p>
            The business just starting out gets the same operational foundation as the company doing $2 million a year.
            The conventional way to buy contractor software is a monthly subscription per seat, billed the same in a
            slow month as a busy one &mdash; here is that model next to this one.
          </p>
        </div>
        {/* The table has a 720px floor, so on a phone it is a horizontal
            scroller inside a vertical page — which works, and gives no sign
            that it works. The cue is hidden above the width where the table
            fits, so it never claims a gesture that does nothing. */}
        <p className="compare-swipe" aria-hidden="true">
          <span>Swipe to compare</span>
          <span className="compare-swipe-arrow">&rarr;</span>
        </p>
        <div className="compare-scroll" tabIndex={0} role="region" aria-label="Comparison of the two pricing models">
          <table className={`compare-table ${styles.modelTable}`}>
            <caption className="sr-only">
              How the no-subscription model compares with conventional per-seat monthly contractor software, by what
              you are billed and when.
            </caption>
            <thead>
              <tr>
                <th scope="col" className="compare-corner"><span className="compare-corner-label">Two ways to pay</span></th>
                {modelColumns.map((col) => (
                  <th scope="col" key={col.key} className={col.highlight ? 'compare-col-head is-us' : 'compare-col-head'}>
                    {col.highlight ? <span className="compare-head-badge">No monthly fee</span> : null}
                    <strong>{col.label}</strong>
                    <span className="compare-head-tag">{col.tag}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modelRows.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className="compare-row-label">{row.label}</th>
                  {row.cells.map((cell, index) => (
                    <td
                      key={modelColumns[index].key}
                      className={`compare-cell tone-${cell.tone}${modelColumns[index].highlight ? ' is-us' : ''}`}
                    >
                      <span className="compare-mark" aria-hidden="true">{MODEL_TONE_MARK[cell.tone]}</span>
                      <span className="compare-cell-text">
                        {cell.value ? (
                          <>
                            <b className={`${styles.value}${modelColumns[index].highlight ? ` ${styles.usValue}` : ''}`}>
                              {cell.value}
                            </b>{' '}
                          </>
                        ) : null}
                        {cell.text}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="compare-source">
          A comparison of pricing models, not of specific products &mdash; plans vary by vendor and change often, so we
          don&apos;t quote anyone else&apos;s price here. Platform fee only: standard Stripe processing (
          {STRIPE_PROCESSING_NOTE}) applies separately and goes to Stripe, not to us.
        </p>
      </section>

      <section className={`${styles.faqSection} section-block`} id="questions" aria-labelledby="questions-title">
        <div className={styles.faqLayout}>
          <div className={`${styles.faqIntro} section-heading`}>
            <p className="eyebrow">The fine print, in plain English</p>
            <h2 id="questions-title">Questions contractors actually ask.</h2>
            <p>Clear answers about payments, refunds, rates, and what happens as your business changes.</p>
            <p className={styles.faqContact}>Still unsure? <Link href="/contact">Talk to a real person &rarr;</Link></p>
          </div>
          <div className={`faq-list ${styles.faqList}`}>
            {pricingFaqs.map((item) => (
              <details className="faq-item" key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className={`${styles.closingCta} cta-band`}>
        <div className="cta-band-inner">
          <p className="eyebrow">Your next quote can start here</p>
          <h2>Start free. Keep the same system as you grow.</h2>
          <p>No subscription. No setup fee. You only pay our platform fee when a homeowner actually pays you.</p>
          <div className="actions">
            <a href={APP_SIGNUP_URL} className="btn primary">Build my free site <span aria-hidden="true">&rarr;</span></a>
            <Link href="/demo" className="btn secondary">Explore the demo</Link>
          </div>
          <ul className={styles.ctaChecks} aria-label="Reasons to start">
            <li><span aria-hidden="true">✓</span> No contract</li>
            <li><span aria-hidden="true">✓</span> Export your data</li>
            <li><span aria-hidden="true">✓</span> Stripe-powered payouts</li>
          </ul>
          <p className="cta-trust">
            <span aria-hidden="true">◉</span> Card payments are handled entirely by{' '}
            <strong>Stripe Checkout</strong>, so card numbers never reach our servers, and payouts go to your own
            Stripe account. <Link href="/security">How we handle your data &rarr;</Link>
          </p>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
