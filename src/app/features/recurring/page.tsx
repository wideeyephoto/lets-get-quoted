import type { Metadata } from 'next';
import ExampleFrame from '@/components/marketing/example-frame';
import SuiteFeaturePage, {
  Panel,
  PanelActions,
  PanelHead,
  PanelNote,
  PanelRows,
} from '@/components/marketing/suite-feature-page';
import { FEATURE_PRICING_NOTE, STRIPE_PROCESSING_NOTE } from '@/lib/pricing';

export const metadata: Metadata = {
  title: 'Recurring Work and Auto-Billing',
  description:
    'Set repeating work once and every cycle schedules and bills itself — weekly, biweekly or monthly, with an itemized invoice per visit and declines handled.',
  alternates: { canonical: 'https://letsgetquoted.com/features/recurring' },
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/features/recurring',
    siteName: "Let's Get Quoted",
    title: 'Set the plan once. It books and bills itself.',
    description:
      'Weekly, biweekly or monthly visits that create their own job and their own invoice, charged to a saved card — with declines classified and retried.',
    images: [{ url: '/features/og-recurring.jpg', width: 1200, height: 630, alt: 'Recurring work and auto-billing for contractors' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Set the plan once. It books and bills itself.',
    description:
      'Weekly, biweekly or monthly visits that create their own job and their own invoice, charged to a saved card — with declines classified and retried.',
    images: ['/features/og-recurring.jpg'],
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

const RECURRING_FLOW: FlowStep[] = [
  {
    step: 'Step 1',
    title: 'Recurring service cadence & agreement builder',
    body: 'Set weekly, bi-weekly, or monthly visits at fixed rates. Cap the plan at a fixed number of visits (e.g. 12-month contract) or leave it open-ended.',
    mock: (
      <div className={styles.shotMockContainer}>
        <div className={styles.shotMockHeader}>
          <span className={styles.shotMockTitle}>Recurring Service Cadence &middot; Alvarez</span>
          <span className={styles.shotBadgeGood}>Active Agreement</span>
        </div>
        <dl className={styles.shotKeyValues}>
          <div className={styles.shotKeyRow}>
            <dt>Frequency &amp; Day</dt>
            <dd style={{ color: '#50e3bd' }}>Bi-Weekly &middot; Every other Tuesday</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Per-Visit Rate</dt>
            <dd>$180.00 / visit (Auto-billed to card)</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Contract Term</dt>
            <dd>24 Visits (12-month capped maintenance)</dd>
          </div>
        </dl>
      </div>
    ),
  },
  {
    step: 'Step 2',
    title: 'Automated calendar job generation',
    body: 'Every cycle automatically spawns a real scheduled job with scope, property details, and assigned crew tasks without re-entering details.',
    mock: (
      <div className={styles.shotMockContainer}>
        <div className={styles.shotMockHeader}>
          <span className={styles.shotMockTitle}>Auto-Generated Visit &middot; Cycle #8 of 24</span>
          <span className={styles.shotBadgeGood}>Scheduled &middot; Tue 9 AM</span>
        </div>
        <dl className={styles.shotKeyValues}>
          <div className={styles.shotKeyRow}>
            <dt>Client & Property</dt>
            <dd>Alvarez &middot; 482 Elmwood Ave</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Scope</dt>
            <dd>Bi-weekly lawn & shrub maintenance</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Calendar Impact</dt>
            <dd>Counts toward day capacity automatically</dd>
          </div>
        </dl>
      </div>
    ),
  },
  {
    step: 'Step 3',
    title: 'Itemized auto-charge per visit',
    body: 'Charges run against the card saved when the plan was approved. Homeowners receive an itemized receipt per visit that passes accountant muster.',
    mock: (
      <div className={styles.shotMockContainer}>
        <div className={styles.shotMockHeader}>
          <span className={styles.shotMockTitle}>Automated Stripe Charge &middot; Alvarez</span>
          <span className={styles.shotBadgeGood}>$180.00 Paid</span>
        </div>
        <dl className={styles.shotKeyValues}>
          <div className={styles.shotKeyRow}>
            <dt>Card on File</dt>
            <dd>Mastercard &middot;&middot;&middot;&middot; 8812</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Invoice Reference</dt>
            <dd>#REC-2026-0814 &middot; Emailed</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Contractor Payout</dt>
            <dd style={{ color: '#50e3bd' }}>Direct Stripe transfer</dd>
          </div>
        </dl>
      </div>
    ),
  },
  {
    step: 'Step 4',
    title: 'Smart decline recovery & card update links',
    body: 'Lapsed or expired cards trigger automated recovery retries and secure card-update links, saving hours of awkward payment chasing calls.',
    mock: (
      <div className={styles.shotMockContainer}>
        <div className={styles.shotMockHeader}>
          <span className={styles.shotMockTitle}>Dunning Recovery &middot; Expired Card</span>
          <span className={styles.shotBadgeFlag}>Auto-Recovery Active</span>
        </div>
        <dl className={styles.shotKeyValues}>
          <div className={styles.shotKeyRow}>
            <dt>Decline Classification</dt>
            <dd>Expired card &middot; retry postponed</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Automated Action</dt>
            <dd>Magic link sent to customer mobile</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Status</dt>
            <dd style={{ color: '#50e3bd' }}>Updated by customer in 14 min</dd>
          </div>
        </dl>
      </div>
    ),
  },
];

export default function RecurringFeaturePage() {
  return (
    <SuiteFeaturePage
      breadcrumb={{ name: 'Recurring', path: '/features/recurring' }}
      eyebrow="Recurring work + auto-billing"
      title={
        <>
          Set the plan once. <em>It schedules and bills itself.</em>
        </>
      }
      lede="A maintenance customer should be a schedule, not a reminder to invoice. Set the cadence and every cycle creates its own scheduled job and its own itemized charge, against a card the customer already saved."
      heroChips={['Pause or cancel any time', 'Declines retried and chased', 'You still assign the crew']}
      heroNote="Weekly, every other week or monthly. Cap a plan at a set number of visits, or leave it running until somebody stops it."
      primary={{ label: 'See live recurring plans', href: '/demo/recurring' }}
      demo={
        <ExampleFrame
          label="One plan, and the visits it has produced by itself."
          note="Invented customer and figures. What is real is the shape: each visit is its own job and its own invoice, so a plan is a series of real records rather than one subscription line."
        >
          <Panel>
            <PanelHead title="Maintenance plan · Alvarez" pill="Active" tone="good" />
            <PanelRows
              rows={[
                { label: 'Every 2 weeks · Tue', value: '$180 / visit' },
                { label: 'Visits so far', value: '7 of 24' },
                { label: 'Last charge · Tue', value: 'Paid' },
                { label: 'Booked and billed by you', value: 'None of it', strong: true },
              ]}
            />
            <PanelNote>
              Each visit spawns a scheduled job on the calendar and a real itemized invoice — not a
              line on a subscription. If the saved card declines, the failure is classified and
              retried or routed to a card-update link.
            </PanelNote>
            <PanelActions labels={['Pause the plan', 'See every visit']} />
          </Panel>
        </ExampleFrame>
      }
      proof={[
        { title: 'Three cadences', body: 'Weekly, every other week, or monthly.' },
        { title: 'A real job each cycle', body: 'On the calendar, with a crew to assign.' },
        { title: 'A real invoice each time', body: 'Itemized, not a subscription line.' },
        { title: 'Declines handled for you', body: 'Classified, retried, or a card-update link.' },
      ]}
      story={{
        eyebrow: 'The revenue you can actually forecast',
        title: 'Repeat work is the difference between a busy year and a predictable one.',
        body: 'One-off jobs are a year you have to win again every January. A plan that schedules and charges itself turns the same customer into revenue you can see coming — and because every visit is a real job with a real invoice, it shows up in your calendar, your margin and your cash forecast like any other work, rather than sitting in a separate billing system.',
      }}
      benefits={[
        {
          title: 'Stop rebuilding the same job',
          body: 'The customer, the property, the scope and the price are set once. Every cycle produces a scheduled job from them, so nobody is retyping an address they typed a fortnight ago.',
        },
        {
          title: 'Get paid without asking',
          body: 'The saved card is charged per visit and the customer gets a genuine itemized invoice each time — which is what makes a maintenance plan survive an accountant, a dispute or a change of mind.',
        },
        {
          title: 'Keep the terms honest',
          body: 'Cap a plan at a fixed number of visits when that is what you sold — twelve months, say — so it ends where you said it would rather than running until somebody notices.',
        },
      ]}
      afterBenefits={
        <section className="section-block" id="the-screens" aria-labelledby="screens-title">
          <div className={styles.shotsHead}>
            <p className="eyebrow">The recurring maintenance flow</p>
            <h2 id="screens-title">Predictable revenue with zero monthly re-typing.</h2>
            <p>
              Cadence contracts, automatic calendar appointments, Stripe card charges, and smart decline recovery.
            </p>
          </div>

          <ol className={styles.shots}>
            {RECURRING_FLOW.map((shot) => (
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
      stepsEyebrow="From one job to a plan"
      stepsTitle="Four steps, then it runs without you."
      steps={[
        {
          title: 'Start from a customer you already have',
          body: 'Their profile carries the property, the history and the card. A plan is the same relationship on a repeat, not a new record.',
        },
        {
          title: 'Pick the cadence and the price',
          body: 'Weekly, every other week or monthly, at a per-visit price. Set a fixed term if the plan is meant to end.',
        },
        {
          title: 'Let each cycle create its own job',
          body: 'It lands on the calendar to be assigned like any other work, and it counts toward how full that day is.',
        },
        {
          title: 'Let it bill and chase',
          body: 'The saved card is charged and an itemized invoice is issued. A decline is retried or turned into a card-update link for the customer.',
        },
      ]}
      catalog={['recurring']}
      catalogEyebrow="What a plan does on its own"
      catalogTitle="Four things you set once and stop doing."
      catalogNote="Each visit is a real job on the same record system as everything else, which is why recurring revenue appears in your schedule, your margin and your cash forecast rather than beside them."
      faq={[
        {
          q: 'Is this a subscription product for my customers?',
          a: 'Not in the billing sense. Each cycle creates a genuine job and a genuine itemized invoice, charged individually to the saved card. That matters when a customer queries a charge or an accountant asks what a payment was for — there is a job and an invoice behind every one.',
        },
        {
          q: 'What cadences can I set?',
          a: 'Weekly, every other week, or monthly. A plan can also be capped at a fixed number of visits, which is how you sell “twelve months of maintenance” and have it actually end after twelve months.',
        },
        {
          q: 'What happens when the card on file fails?',
          a: 'The decline is classified rather than simply logged. Some are retried automatically; the ones that will not succeed are routed to a card-update link for the customer, so a replaced card is something they fix instead of something you chase.',
        },
        {
          q: 'Can I pause or cancel a plan?',
          a: 'Yes, and the visits it has already produced stay as they are — real jobs with real invoices and real history. Stopping the plan stops the next cycle; it does not rewrite the work you have already done.',
        },
        {
          /* Asked because contractors raise prices, and a page about automatic
             charging that never mentions it invites the assumption that the
             price is frozen — or worse, that we would change it without
             telling anybody. */
          q: 'What if I need to raise the price?',
          a: 'Change the per-visit price on the plan and the next cycle bills at the new one. Visits already run and already invoiced are not touched — an invoice the customer has paid is a record, not a setting. Telling them before the new price lands is on you, and it is the part worth doing properly: an unexplained increase on a saved card is how a good maintenance customer becomes a chargeback.',
        },
        {
          q: 'Do recurring charges cost more than one-off ones?',
          a: `LGQ applies the same plan platform-fee rate to eligible recurring and one-off service payments. ${FEATURE_PRICING_NOTE} Stripe's ${STRIPE_PROCESSING_NOTE} are separate.`,
        },
      ]}
      cta={{
        title: 'Turn a good customer into a standing appointment.',
        note: `${FEATURE_PRICING_NOTE} Recurring jobs have no separate per-plan charge.`,
      }}
    />
  );
}
