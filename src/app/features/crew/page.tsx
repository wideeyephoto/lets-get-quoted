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
  title: 'Crew Management and Field App',
  description:
    'Assign the crew, put the job on their phone, log hours and materials on site, and see real margin before you invoice. Hours roll up by person and pay period.',
  alternates: { canonical: 'https://letsgetquoted.com/features/crew' },
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/features/crew',
    siteName: "Let's Get Quoted",
    title: 'Your crew gets the job. You get the real margin.',
    description:
      'Assignments, a field app that logs hours and materials on site, and job costing that shows profit before you invoice — not after.',
    images: [{ url: '/features/og-crew.jpg', width: 1200, height: 630, alt: 'Crew management and field app for contractors' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Your crew gets the job. You get the real margin.',
    description:
      'Assignments, a field app that logs hours and materials on site, and job costing that shows profit before you invoice — not after.',
    images: ['/features/og-crew.jpg'],
  },
};

import styles from '@/components/marketing/suite-feature-page.module.css';

const CREW_FLOW = [
  {
    step: 'Step 1',
    title: 'Passwordless mobile field app for every crew member',
    body: 'Crew members tap an instant magic link—no app store downloads or forgotten passwords. They see customer names, scopes, lockbox codes, and address maps.',
    mock: (
      <div className={styles.shotMockContainer}>
        <div className={styles.shotMockHeader}>
          <span className={styles.shotMockTitle}>Field View &middot; Marcus T.</span>
          <span className={styles.shotBadgeGood}>Stop #1 &middot; Active</span>
        </div>
        <dl className={styles.shotKeyValues}>
          <div className={styles.shotKeyRow}>
            <dt>Job</dt>
            <dd>Whitfield Reroof &middot; 118 Ridgeline Dr</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Access & Safety</dt>
            <dd>Gate code #4921 &middot; Watch for dog in yard</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Scope</dt>
            <dd>24 sq architectural shingles + 4 sheets CDX</dd>
          </div>
        </dl>
      </div>
    ),
  },
  {
    step: 'Step 2',
    title: 'Jobsite time clock & on-site material logging',
    body: 'Clock in when arriving and log materials purchased at supply houses. Receipts are photographed on site so nothing is lost in the truck.',
    mock: (
      <div className={styles.shotMockContainer}>
        <div className={styles.shotMockHeader}>
          <span className={styles.shotMockTitle}>Shift Tracker &middot; Job #1042</span>
          <span className={styles.shotBadgeGood}>Clocked In (8:47 AM)</span>
        </div>
        <dl className={styles.shotKeyValues}>
          <div className={styles.shotKeyRow}>
            <dt>Labor Logged Today</dt>
            <dd>Marcus (6.5h) + Tanya (7.0h) &middot; $648.00</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Materials On Site</dt>
            <dd>ABC Supply Invoice #892 &middot; $4,120.00</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Photos Attached</dt>
            <dd style={{ color: '#50e3bd' }}>3 Progress Photos Logged</dd>
          </div>
        </dl>
      </div>
    ),
  },
  {
    step: 'Step 3',
    title: 'Real-time job profit margin before invoicing',
    body: 'Cost is what the crew actually logged; margin is quoted revenue minus logged cost. Spot margin leaks while the job is active rather than a week later.',
    mock: (
      <div className={styles.shotMockContainer}>
        <div className={styles.shotMockHeader}>
          <span className={styles.shotMockTitle}>Job Costing &middot; Profit Analytics</span>
          <span className={styles.shotBadgeGood}>56.2% Net Margin</span>
        </div>
        <dl className={styles.shotKeyValues}>
          <div className={styles.shotKeyRow}>
            <dt>Quoted Price</dt>
            <dd>$10,880.00</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Total Actual Cost</dt>
            <dd style={{ color: '#ff8e42' }}>−$4,768.00 (Labor + Materials)</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Net Job Margin</dt>
            <dd style={{ color: '#50e3bd', fontWeight: 800 }}>+$6,112.00 Profit</dd>
          </div>
        </dl>
      </div>
    ),
  },
  {
    step: 'Step 4',
    title: 'Pay period rollups & export for payroll',
    body: 'Hours and pay roll up by crew member and pay period automatically. Mark shifts reviewed and export clean summaries for bookkeeping.',
    mock: (
      <div className={styles.shotMockContainer}>
        <div className={styles.shotMockHeader}>
          <span className={styles.shotMockTitle}>Payroll Summary &middot; Aug 15–31</span>
          <span className={styles.shotBadgeGood}>Reviewed</span>
        </div>
        <dl className={styles.shotKeyValues}>
          <div className={styles.shotKeyRow}>
            <dt>Marcus Thorne ($48/hr)</dt>
            <dd>78.5 hrs &middot; $3,768.00</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Tanya Davis ($42/hr)</dt>
            <dd>80.0 hrs &middot; $3,360.00</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Payroll Action</dt>
            <dd style={{ color: '#50e3bd' }}>CSV Export &middot; Ready for Direct Deposit</dd>
          </div>
        </dl>
      </div>
    ),
  },
];

export default function CrewFeaturePage() {
  return (
    <SuiteFeaturePage
      breadcrumb={{ name: 'Crew & labor', path: '/features/crew' }}
      eyebrow="Crew, labor + the field app"
      title={
        <>
          Your crew gets the job. <em>You get the real margin.</em>
        </>
      }
      lede="Assign the people and the job is on their phone — address, scope, photos, contact. They log hours and materials from the site, and the profit on that job is a number you can see before you invoice it."
      heroNote="Hours carry the rate they were logged at. Marking somebody paid records that you paid them — it does not move money or calculate tax, and the product does not pretend otherwise."
      primary={{ label: 'Open the live crew screen', href: '/demo/crew' }}
      demo={
        <ExampleFrame
          label="One job, part-way through, with labor and materials already on it."
          note="Invented job and invented figures. What is real is the arithmetic: cost is what the crew logged, and margin is quoted minus that — not an estimate of it."
        >
          <Panel>
            <PanelHead title="Whitfield reroof · in progress" pill="2 assigned" />
            <PanelRows
              rows={[
                { label: 'Quoted', value: '$10,880' },
                { label: 'Labor · 13.5 hrs logged', value: '$648' },
                { label: 'Materials logged on site', value: '$4,120' },
                { label: 'Margin so far', value: '$6,112', strong: true },
              ]}
            />
            <PanelNote>
              Mike clocked in at 8:47 AM and is still open. An open shift running long is visible
              to you, and a shift you close is marked owner-closed rather than passed off as
              clocked.
            </PanelNote>
            <PanelActions labels={['Add materials', 'Close the shift']} />
          </Panel>
        </ExampleFrame>
      }
      proof={[
        { title: 'The job on their phone', body: 'Address, scope, photos, contact.' },
        { title: 'Margin before the invoice', body: 'Logged cost against what you quoted.' },
        { title: 'Time clock, if you want one', body: 'Off, optional or required — your call.' },
        { title: 'Hours and pay, rolled up', body: 'By crew member and by pay period.' },
      ]}
      story={{
        eyebrow: 'The office stops retyping what the field already knows',
        title: 'Job costing fails when the costs arrive a week after the job.',
        body: 'Hours on a paper sheet and materials on a receipt in a truck are numbers you reconcile on a Sunday, by which point the job is invoiced and the margin is whatever it turned out to be. When the crew logs both from the site, on the record the job already lives on, the margin is a thing you watch rather than a thing you discover.',
      }}
      benefits={[
        {
          title: 'Give the crew the job, not a 6am text',
          body: 'Assign the people and the context goes with them: address, scope, photos and who to call. Newly assigned crew get a text automatically, so nobody finds out by not being told.',
        },
        {
          title: 'Let the site do the paperwork',
          body: 'Hours, materials and photos are recorded where the work is happening. The activity timeline keeps client-visible events and internal ones apart, so the customer sees progress without seeing your costs.',
        },
        {
          title: 'Know what the job actually made',
          body: 'Logged labor and materials against the quoted total, per job. A line with no cost recorded is treated as unknown rather than as zero — a missing cost showing 100% margin is exactly how a bad number gets believed.',
        },
      ]}
      afterBenefits={
        <section className="section-block" id="the-screens" aria-labelledby="screens-title">
          <div className={styles.shotsHead}>
            <p className="eyebrow">The field app and labor management flow</p>
            <h2 id="screens-title">Keep the trucks moving and watch real profits on site.</h2>
            <p>
              Passwordless crew login, live time tracking, receipt capture, and real-time job margin analytics.
            </p>
          </div>

          <ol className={styles.shots}>
            {CREW_FLOW.map((shot) => (
              <li className={styles.shot} key={shot.step}>
                <div className={styles.shotCopy}>
                  <span className={styles.shotStep}>{shot.step}</span>
                  <h3 className={styles.shotTitle}>{shot.title}</h3>
                  <p className={styles.shotBody}>{shot.body}</p>
                </div>
                <div className={styles.shotMedia}>
                  {shot.mock}
                </div>
              </li>
            ))}
          </ol>
        </section>
      }
      stepsEyebrow="From assigned to paid out"
      stepsTitle="Four steps, and the office types none of them."
      steps={[
        {
          title: 'Build the roster once',
          body: 'People, roles, hourly rates and photos. The rate is what later turns hours into a labor cost you can trust.',
        },
        {
          title: 'Assign the job',
          body: 'The crew see it in the field app with everything they need to arrive ready. They are texted when they are added.',
        },
        {
          title: 'They log the work as it happens',
          body: 'Hours, materials and photos from the site. If you run the time clock it can be off, optional or required — set per business, not per argument.',
        },
        {
          title: 'Read the rollup, then pay',
          body: 'Hours and pay by person and by pay period. Marking somebody paid records the fact; it is not a payroll run and no tax is calculated or withheld.',
        },
      ]}
      catalog={['jobs']}
      catalogEyebrow="Running the work"
      catalogTitle="What the job record carries for the people doing it."
      catalogNote="All of it hangs off the same job the quote and the schedule are on, which is why the field app already knows the scope and the invoice already knows the cost."
      faq={[
        {
          /* The four questions a contractor asks before putting an app on
             somebody else's phone, and they were all unanswered. Every answer
             here is checked against the code: crew sign-in is a magic link
             (field/login), the service worker deliberately passes fetches
             through untouched, location is per-trip and expires
             (job-tracking.share_location / location_expires_at), and the four
             permissions are the ones lib/crew.ts actually stores. */
          q: 'How do crew members sign in — do they need accounts?',
          a: 'You add their email, and they get a sign-in link. There is no password to set or reset and no per-seat charge; the link expires after an hour and they tap it again next time. Nothing to install to get started.',
        },
        {
          q: 'What device do they need, and does it work without signal?',
          a: 'Any phone with a browser. It installs to the home screen like an app if they want that. It does need a connection — there is no offline mode, so a basement with no bars means logging the hours when they are back outside rather than losing them.',
        },
        {
          q: 'Does it track where my crew are?',
          a: 'No. There is no background location and nothing runs while they work. Location is shared only when somebody sends an “on my way” message and only if they turn it on for that trip, and the link the homeowner gets expires on its own. It is a delivery-style tracker for one journey, not a record of anybody’s day.',
        },
        {
          q: 'Can I control what each person can do?',
          a: 'Yes — per crew member. Whether they can send arrival messages, whether they can share their location when they do, whether they can see customer contact details, and whether they can move a job. Costing and margin are the owner’s view either way.',
        },
        {
          q: 'Is this payroll?',
          a: 'It is job costing and pay records, not payroll processing. Hours and pay roll up by crew member and pay period, and marking somebody paid records that you paid them — so the labor cost on every job is real. Moving the money, calculating tax and withholding stay with you or your payroll provider, and the product does not pretend otherwise.',
        },
        {
          q: 'Do I have to make the crew use a time clock?',
          a: 'No. It is off, optional or required, set per business. Its real value is the shift somebody forgot to close: an open shift running long is visible to you, and a shift you close is marked owner-closed rather than quietly recorded as if they clocked out.',
        },
        {
          q: 'Do crew members see my prices and margins?',
          a: 'The field app gives them the job — address, scope, photos, contact — and the place to log hours, materials and photos. Costing and margin are the owner’s view, and the activity timeline separates what the client can see from what is internal.',
        },
        {
          q: 'What if a material cost never gets entered?',
          a: 'It stays unknown rather than becoming zero. That is on purpose: defaulting a missing cost to nothing would show that line at a perfect 100% margin — wrong and flattering at the same time.',
        },
        {
          q: 'Is there a per-seat charge for crew?',
          a: `${FEATURE_PRICING_NOTE} Flex and Solo include 2 crew users; Growth and Scale include 10. Extra crew users are an optional $5/month each on Solo and above.`,
        },
      ]}
      cta={{
        title: 'Put the crew, the hours and the margin on one record.',
        note: `${FEATURE_PRICING_NOTE} Included crew seats and optional extras are listed on /pricing; Stripe's ${STRIPE_PROCESSING_NOTE} are separate.`,
      }}
    >
      <section className="section-block" style={{ margin: '48px 0', background: 'var(--bg-surface-elevated, #f8fafc)', padding: '2rem', borderRadius: '12px', border: '1px solid var(--border-subtle, rgba(0,0,0,0.08))' }}>
        <div>
          <p className="eyebrow" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.75rem', color: '#0284c7', fontWeight: 700 }}>
            Automated Morning Dispatch &amp; Equipment Loadouts
          </p>
          <h2 style={{ fontSize: '1.5rem', margin: '0.5rem 0' }}>One-click morning crew briefing deck.</h2>
          <p style={{ color: 'var(--text-secondary, #475569)', fontSize: '0.9375rem', lineHeight: 1.5 }}>
            Send turn-by-turn route maps, equipment loadout checklists, gate codes, and site hazard warnings straight to your crew’s field phones before they depart the shop.
          </p>
        </div>
        <div style={{ marginTop: '1.25rem' }}>
          <a
            href="/features/dispatch"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, color: '#0284c7', textDecoration: 'none' }}
          >
            Explore Morning Crew Briefings &amp; Dispatch Suite →
          </a>
        </div>
      </section>
    </SuiteFeaturePage>
  );
}
