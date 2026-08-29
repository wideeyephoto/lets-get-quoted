import type { Metadata } from 'next';
import ExampleFrame from '@/components/marketing/example-frame';
import SuiteFeaturePage, {
  Panel,
  PanelActions,
  PanelHead,
  PanelNote,
  PanelRows,
} from '@/components/marketing/suite-feature-page';
import { CASH_WARN_DAYS } from '@/lib/cash-warning';
import { FEATURE_PRICING_NOTE, STRIPE_PROCESSING_NOTE } from '@/lib/pricing';

export const metadata: Metadata = {
  title: 'Cash Flow Forecasting for Contractors',
  description:
    'See customer money, payroll and bills before they move. A dated forecast of your balance, so the week you cannot make payroll is one you hear about in advance.',
  alternates: { canonical: 'https://letsgetquoted.com/features/cash-flow' },
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/features/cash-flow',
    siteName: "Let's Get Quoted",
    title: 'Find out about the bad week before it arrives.',
    description:
      'Money already promised and money already owed, dated and projected forward — so a payroll you cannot cover is a warning, not a surprise.',
    images: [{ url: '/features/og-cash-flow.jpg', width: 1200, height: 630, alt: 'Cash flow forecasting for contractors' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Find out about the bad week before it arrives.',
    description:
      'Money already promised and money already owed, dated and projected forward — so a payroll you cannot cover is a warning, not a surprise.',
    images: ['/features/og-cash-flow.jpg'],
  },
};

import styles from '@/components/marketing/suite-feature-page.module.css';

const CASH_FLOW_FLOW = [
  {
    step: 'Step 1',
    title: '14-Day and 30-day forward cash horizon',
    body: 'Dated movements of money applied forward from today’s balance. See deposits arriving, supplier bills, and crew payroll in one timeline.',
    image: {
      src: '/features/back-office-insights.png',
      alt: 'Financial insights dashboard showing cash position, revenue vs costs, and invoice aging.',
      width: 1000,
      height: 684,
    },
  },
  {
    step: 'Step 2',
    title: 'Confirmed vs expected revenue separation',
    body: 'Hard deposits in hand are kept strictly apart from pending balances. Read realistic conservative cash positions without doing spreadsheet gymnastics.',
    mock: (
      <div className={styles.shotMockContainer}>
        <div className={styles.shotMockHeader}>
          <span className={styles.shotMockTitle}>Revenue Waterfall &middot; Next 14 Days</span>
          <span className={styles.shotBadgeGood}>$19,720 Confirmed</span>
        </div>
        <dl className={styles.shotKeyValues}>
          <div className={styles.shotKeyRow}>
            <dt>Confirmed In Hand (Stripe)</dt>
            <dd style={{ color: '#50e3bd' }}>+$14,280.00</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Signed Deposits Scheduled</dt>
            <dd style={{ color: '#50e3bd' }}>+$5,440.00 (Whitfield)</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Pending Unsigned Quotes</dt>
            <dd style={{ color: '#8fa6b5' }}>$8,320.00 (Excluded from base)</dd>
          </div>
        </dl>
      </div>
    ),
  },
  {
    step: 'Step 3',
    title: 'Proactive buffer dip alert before payroll day',
    body: 'The engine warns you when a projected balance will dip below your safety threshold within 7 days, giving you time to chase a balance or stage a vendor invoice.',
    mock: (
      <div className={styles.shotMockContainer}>
        <div className={styles.shotMockHeader}>
          <span className={styles.shotMockTitle}>Buffer Safety Guard &middot; Alert Active</span>
          <span className={styles.shotBadgeFlag}>Dip on Friday (3 Days)</span>
        </div>
        <dl className={styles.shotKeyValues}>
          <div className={styles.shotKeyRow}>
            <dt>Safety Buffer Target</dt>
            <dd>$8,000.00</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Projected Balance Fri</dt>
            <dd style={{ color: '#ff8e42', fontWeight: 800 }}>$5,740.00 (−$2,260 under)</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Recommended Action</dt>
            <dd style={{ color: '#50e3bd' }}>1-Tap SMS: Request Whitfield balance ($5,440)</dd>
          </div>
        </dl>
      </div>
    ),
  },
  {
    step: 'Step 4',
    title: '1-Click QuickBooks & CPA export at tax time',
    body: 'Cash-basis profit and loss by year, expenses categorized by trade code, and QuickBooks-ready CSV files built from original job records.',
    mock: (
      <div className={styles.shotMockContainer}>
        <div className={styles.shotMockHeader}>
          <span className={styles.shotMockTitle}>Financial Export &middot; Year-to-Date</span>
          <span className={styles.shotBadgeGood}>Reconciled</span>
        </div>
        <dl className={styles.shotKeyValues}>
          <div className={styles.shotKeyRow}>
            <dt>Cash-Basis P&L</dt>
            <dd>PDF Report &middot; Generated in 1 tap</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Categorized Expenses</dt>
            <dd>Materials, Labor, Vehicle, Permits</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Accountant Package</dt>
            <dd style={{ color: '#50e3bd' }}>Clean CSV &middot; Zero spreadsheet reconciliation</dd>
          </div>
        </dl>
      </div>
    ),
  },
];

export default function CashFlowFeaturePage() {
  return (
    <SuiteFeaturePage
      breadcrumb={{ name: 'Cash flow', path: '/features/cash-flow' }}
      eyebrow="Cash flow + insights"
      title={
        <>
          Find out about the bad week <em>before it arrives.</em>
        </>
      }
      lede="Deposits and balances you are owed, payroll and bills you owe — dated and projected forward from today’s balance. The week you cannot cover payroll becomes a warning rather than a Friday morning discovery."
      heroChips={['No bank connection', 'Forecasting, not bookkeeping', 'Confirmed and expected, marked apart']}
      heroNote="Built from money the product already knows about: approved quotes, deposits, installments, recurring visits, logged hours and the bills you enter. Nothing here is a guess about your industry."
      primary={{ label: 'Open the live forecast', href: '/demo/cash-flow' }}
      demo={
        <ExampleFrame
          label="Two weeks forward, with the day the balance dips below the buffer."
          note="Invented figures. What is real is the method: every line is a dated movement of money, and the balance is those movements applied in order to what you have today."
        >
          <Panel>
            <PanelHead title="Next 14 days · projected" pill="Below buffer Fri" tone="flag" />
            <PanelRows
              rows={[
                { label: 'Today · balance', value: '$14,280' },
                { label: 'Wed · Whitfield balance in', value: '+$5,440' },
                { label: 'Thu · materials, supplier', value: '−$4,120' },
                { label: 'Fri · crew payroll', value: '−$9,860' },
                { label: 'Fri · projected balance', value: '$5,740', strong: true },
              ]}
            />
            <PanelNote>
              A dip is only told to you when it is close enough to act on — inside {CASH_WARN_DAYS}{' '}
              days — and stays quiet otherwise. A warning you have to go looking for is not a
              warning; one that fires every day is not either.
            </PanelNote>
            <PanelActions labels={['Chase the balance', 'Move a bill']} />
          </Panel>
        </ExampleFrame>
      }
      proof={[
        { title: 'Dated, not averaged', body: 'Every line is a day, not a month.' },
        { title: 'Confirmed vs expected', body: 'Money in hand read apart from money promised.' },
        { title: `Warned within ${CASH_WARN_DAYS} days`, body: 'Close enough to actually do something.' },
        { title: 'Clean books at year end', body: 'Cash-basis P&L, expenses, CSV, QuickBooks.' },
      ]}
      story={{
        eyebrow: 'The number that decides whether you take the job',
        title: 'Profitable businesses fail on timing, not on margin.',
        body: 'A job can be worth doing and still be the thing that empties your account, because the materials go out three weeks before the balance comes in. A forecast built from the deposits, installments and payroll the product already holds turns that from a feeling into a date — and a date is something you can move a bill or chase a balance against.',
      }}
      benefits={[
        {
          title: 'See money before it moves',
          body: 'Deposits and balances you are owed, installments due, recurring visits ahead, payroll from logged hours and the bills you enter — all dated, all applied forward from what is actually in the account today.',
        },
        {
          title: 'Know how much of it is real',
          body: 'Confirmed money and expected money are separated rather than added together. A forecast that treats a promise like a payment is exactly the forecast that gets somebody into trouble.',
        },
        {
          title: 'Hand your accountant something clean',
          body: 'Cash-basis profit and loss by year, expenses by category, CSV export and a QuickBooks-ready file — built from the same records the work ran on, so nothing has to be reconciled by hand first.',
        },
      ]}
      afterBenefits={
        <section className="section-block" id="the-screens" aria-labelledby="screens-title">
          <div className={styles.shotsHead}>
            <p className="eyebrow">The cash flow and forecasting engine</p>
            <h2 id="screens-title">Forecast your cash position before money moves.</h2>
            <p>
              Dated balances, confirmed vs expected revenue, automated buffer alerts, and CPA-ready reports.
            </p>
          </div>

          <ol className={styles.shots}>
            {CASH_FLOW_FLOW.map((shot) => (
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
      stepsEyebrow="From records you already have"
      stepsTitle="Four inputs, and three of them are already there."
      steps={[
        {
          title: 'Say what is in the bank',
          body: 'One starting balance and the buffer you never want to go under. Everything else is projected from records the product already holds.',
        },
        {
          title: 'Money in, from the work',
          body: 'Approved deposits, balances due, installment dates and recurring visits — with a late allowance, because customers are late and a forecast that assumes otherwise is fiction.',
        },
        {
          title: 'Money out, from the crew and the bills',
          body: 'Payroll from hours actually logged, plus materials, equipment, loans, tax and any bill you enter with a date on it.',
        },
        {
          title: 'Read the dip, not the average',
          body: 'The forecast names the day you cross your buffer. It tells you inside a week, and stays quiet the rest of the month.',
        },
      ]}
      catalog={['insights']}
      catalogEyebrow="What it can tell you"
      catalogTitle="The numbers, and the file your accountant wants."
      catalogNote="Built from the same job records the quotes, the crew hours and the payments ran on, which is why none of it needs reconciling before you can trust it."
      faq={[
        {
          q: 'Does this connect to my bank?',
          a: 'No. You tell it what is in the account today, and it projects forward from money the product already knows about — approved quotes, deposits, installments, recurring visits, logged hours and bills you enter. That means no bank credentials to hand over, and a forecast you can explain line by line.',
        },
        {
          q: 'How does it handle customers who pay late?',
          a: 'With an explicit late allowance rather than by pretending everyone pays on the day. Confirmed money and expected money are also kept apart, so you can read the pessimistic version without doing the arithmetic yourself.',
        },
        {
          q: 'Will it nag me every day?',
          a: `No. A dip is worth telling you about when it is close enough to act on, so the warning fires inside ${CASH_WARN_DAYS} days and stays quiet otherwise. It also goes quiet when the balance you gave it is old enough to be about a different month.`,
        },
        {
          q: 'Is this bookkeeping?',
          a: 'It is a forecast and a set of reports, not a ledger. It will give your accountant a cash-basis P&L, expenses by category and an import-ready QuickBooks CSV — it will not do double-entry bookkeeping or file anything for you.',
        },
        {
          q: 'Does it cost extra?',
          a: `${FEATURE_PRICING_NOTE} Cash-flow visibility has no separate add-on price. Stripe's ${STRIPE_PROCESSING_NOTE} are separate.`,
        },
      ]}
      cta={{
        title: 'Stop finding out about payroll on payroll day.',
        note: `${FEATURE_PRICING_NOTE} Cash-flow visibility is included without a separate add-on.`,
      }}
    />
  );
}
