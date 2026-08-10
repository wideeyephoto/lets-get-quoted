import type { Metadata } from 'next';
import Link from 'next/link';
import { ExampleFrame, FeatureDetailLayout, ShotSlider, type Shot } from '@/components/marketing';
import { FEE_TIERS, STRIPE_PROCESSING_NOTE } from '@/lib/pricing';
import {
  DEFAULT_PLAN,
  buildPlanSchedule,
  formatPlanDate,
  planSchedulePreview,
} from '@/lib/payment-plan-math';
import { KIND_LABEL, buildForecast, type CashEvent } from '@/lib/cash-forecast';
import styles from './back-office.module.css';

export const metadata: Metadata = {
  title: 'Contractor back office',
  description:
    'Connect contractor quotes, scheduling, crews, payments, recurring work and follow-up. One job record from accepted quote to final payment.',
  alternates: { canonical: 'https://letsgetquoted.com/features/back-office' },
  /* THE SOCIAL CARD IS THIS PAGE'S, NOT THE HOMEPAGE'S.
     Next replaces the parent metadata's `openGraph` object wholesale rather
     than merging into it — but only if the child declares one. Without this
     block every share of this URL unfurled as the homepage: its title, its
     description, a screenshot of a website template, and an og:url pointing at
     letsgetquoted.com, so the card sent people somewhere else entirely. */
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/features/back-office',
    siteName: "Let's Get Quoted",
    title: 'One job record, from signed quote to final payment.',
    description:
      'Quote the work, schedule your crew, collect payment and follow up — without retyping customer details across five different tools.',
    images: [{ url: '/features/og-back-office.jpg', width: 1200, height: 630, alt: 'Let’s Get Quoted connected contractor back office' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'One job record, from signed quote to final payment.',
    description:
      'Quote the work, schedule your crew, collect payment and follow up — without retyping customer details across five different tools.',
    images: ['/features/og-back-office.jpg'],
  },
};

/* The one number the page quotes, taken from the canonical fee model rather
   than typed in — the rate a contractor reads here can then never drift from
   /pricing or from the calculator. */
// FEE_TIERS[0] is the rate a business STARTS on and falls from — 1.25%, the
// highest of the four, not the lowest. Named accordingly: the previous name
// said "lowest", which invited a well-meaning correction to
// FEE_TIERS[length - 1] and would have quoted every contractor the 0.65% that
// only applies above $750k of volume.
const STARTING_RATE = FEE_TIERS[0].rate;

// Deliberately not the fee. The closing band states it in full, with the rate
// and Stripe's cut — saying it here too makes a page about running the work
// argue about price twice before the reader has seen any of the work.
/* Under the buttons, where somebody is deciding whether to press one. The old
   line argued about packaging ("not a tier, not an add-on") before the reader
   had asked; this one answers the two questions they actually have — what do I
   get, and what does it cost me to find out. The "everything is included"
   claim survives where it belongs, on the capability list itself. */
const HERO_NOTE =
  'Website and back office included · No card · No monthly subscription';

/* ------------------------------------------------------------------------- */
/* The hero: two real screens.                                                */
/*                                                                            */
/* This page used to open on the hand-built job record below, which makes the  */
/* page's argument well but is still divs shaped like software at the top of a */
/* page selling software. These are captures of the running app. The drawing   */
/* has not been thrown away — it now sits where that argument is made.         */
/*                                                                            */
/* The two do not share a shape and are not made to: ShotSlider contains       */
/* rather than crops, so the monitor render keeps its corners. Intrinsic       */
/* dimensions are the files' own, so next/image reserves the right box.        */
/* ------------------------------------------------------------------------- */
const HERO_SHOTS: Shot[] = [
  {
    src: '/features/back-office-quote.jpg',
    label: 'Sending a quote',
    width: 900,
    height: 551,
    mobile: { src: '/features/back-office-quote-mobile.jpg', width: 426, height: 700 },
    alt: 'The quote builder: itemized line items with a recurring plan, the running quote total, estimated hours, and payment terms — pay in full, deposit plus balance, or a payment plan — with the text the client will receive shown underneath.',
  },
  {
    src: '/features/back-office-insights.png',
    label: 'Insights',
    width: 1000,
    height: 684,
    alt: 'The Insights screen on a monitor: what you kept over the last 90 days, revenue against costs, cash position and how long invoices have been owed, average job value, arrival reliability and customer responsiveness.',
  },
];

/* ------------------------------------------------------------------------- */
/* The hero panel: one job, part-way through the work.                        */
/*                                                                            */
/* Everything on this page rests on a single claim — that the customer, the   */
/* property, the scope, the conversation and the money are one object that    */
/* moves through stages, not five systems that have to be kept in step. A     */
/* generic dashboard cannot make that argument; a single record with all five */
/* bands visible at once can. Invented job, invented homeowner, invented      */
/* figures: hence the Example marker the frame is required to carry.          */
/* ------------------------------------------------------------------------- */
function JobRecordExample() {
  return (
    <div className={styles.record}>
      <div className={styles.band}>
        <div className={styles.recordHead}>
          {/* A <p>, not an <h3>: this is a picture of a record inside the
              hero, above the page's first <h2>. A real heading here would hand
              a screen-reader user h1 → h3 → h2 and let the mock outrank the
              sections. Matches website-builder's site preview. */}
          <p className={styles.recordTitle}>Kitchen lighting upgrade</p>
          <span className={styles.stageTag}>Scheduled</span>
        </div>
        <p className={styles.who}>A. Morgan &middot; 18 Fairview Ave, Royal Oak MI &middot; Job #1048</p>
      </div>

      <div className={styles.band}>
        <span className={styles.bandLabel}>Scope</span>
        <p className={styles.scope}>
          Six recessed lights, one dimmer, new breaker at the panel.
        </p>
        <p className={styles.upgrade}>
          <span>Upgrade chosen: warm-dim trim</span>
          <span className={styles.upgradeCost}>+$180</span>
        </p>
      </div>

      <div className={styles.band}>
        <span className={styles.bandLabel}>Where the job has got to</span>
        <ol className={styles.stages}>
          <li className={`${styles.stage} ${styles.stageDone}`}>
            <span className={styles.stageMark} aria-hidden="true">
              &#10003;
            </span>
            <span>Quote signed</span>
            <span className={styles.stageWhen}>Mon 10:21 AM</span>
          </li>
          <li className={`${styles.stage} ${styles.stageDone}`}>
            <span className={styles.stageMark} aria-hidden="true">
              &#10003;
            </span>
            <span>Deposit paid</span>
            <span className={styles.stageWhen}>Mon 10:24 AM</span>
          </li>
          <li className={`${styles.stage} ${styles.stageNow}`}>
            <span className={styles.stageMark} aria-hidden="true">
              &#9679;
            </span>
            <span>Install visit &middot; 2 crew assigned</span>
            <span className={styles.stageWhen}>Tue 9&ndash;11 AM</span>
          </li>
          <li className={`${styles.stage} ${styles.stageNext}`}>
            <span className={styles.stageMark} aria-hidden="true">
              &#9675;
            </span>
            <span>Balance and review request</span>
            <span className={styles.stageWhen}>On completion</span>
          </li>
        </ol>
      </div>

      <div className={styles.band}>
        <span className={styles.bandLabel}>Conversation on this job</span>
        <ul className={styles.thread}>
          <li className={styles.msg}>
            <span className={styles.msgWho}>Homeowner</span>
            Approved &mdash; Tuesday morning works.
          </li>
          <li className={`${styles.msg} ${styles.msgOut}`}>
            <span className={styles.msgWho}>Your crew</span>
            On our way. Arrival window 9&ndash;11 AM.
          </li>
        </ul>
      </div>

      <div className={styles.band}>
        <span className={styles.bandLabel}>Money</span>
        <ul className={styles.money}>
          <li className={styles.moneyRow}>
            <span>Approved quote</span>
            <b>$2,480</b>
          </li>
          <li className={styles.moneyRow}>
            <span>Deposit paid</span>
            <b>$620</b>
          </li>
          <li className={`${styles.moneyRow} ${styles.moneyDue}`}>
            <span>Balance due on completion</span>
            <b>$1,860</b>
          </li>
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* The inventory.                                                             */
/*                                                                            */
/* Seventeen capabilities, grouped by the stage of the job they belong to. The */
/* grouping is not decoration: seventeen equal boxes is a list nobody reads,   */
/* while four stages with four or five entries each is the shape of a job and  */
/* repeats the page's argument on the way past. Every line names the mechanism */
/* rather than the category, because "scheduling" is a word and "send three    */
/* time options by text and their pick lands on the job" is a product.         */
/* ------------------------------------------------------------------------- */
/* `id` IS A LANDING POINT, not decoration. The nine tool cards on /features
   each link at the group that writes their tool up, so a reader who taps
   "Payments" arrives at the payment capabilities rather than at the top of a
   long page. Renaming one silently breaks a link; there is a test. */
/* EACH GROUP NOW POINTS AT THE PAGES THAT GO DEEPER.
   ---------------------------------------------------------------------------
   This list is the map of the product, and until the suite pages existed it was
   also the end of the road: a reader who wanted more than three lines about
   payment plans had nowhere to go from here. Now each stage names the one or
   two pages that take its capabilities apart properly, which is what makes this
   page the hub — one job record — rather than a competitor to them.

   The seventeen explanations stay. They are not what the suite pages say: those
   are built from lib/features.ts's short catalog entries, and these are
   long-form, written for this page. Replacing them with links would have cost
   the page the thing it is best at to save a duplication that does not exist. */
const CAPABILITY_GROUPS: {
  id: string;
  stage: string;
  items: { term: string; detail: string }[];
  deeper: { label: string; href: string }[];
}[] = [
  {
    id: 'quote-and-approve',
    stage: 'Quote and approve',
    deeper: [{ label: 'Quotes + e-signature', href: '/features/quotes' }],
    items: [
      {
        term: 'Itemized quotes from your own price book',
        detail:
          'The draft is built from the request and priced from the services you set up. Anything priced outside your book is marked so you check it before it goes out.',
      },
      {
        term: 'Optional upgrades the customer chooses',
        detail:
          'Colours, materials and fixtures with what the quote already allows for and what an upgrade adds. The choice is recorded with the name, the moment and a snapshot of the option, so editing the option later never rewrites what somebody agreed to.',
      },
      {
        term: 'E-signature approval',
        detail:
          'The homeowner types their full legal name and approves from the link. The first signature and its timestamp are the ones that stick.',
      },
      {
        term: 'Change orders for the work nobody quoted',
        detail:
          'The crew photographs what they found, the extra work is priced, and the homeowner agrees to it in writing on the same record instead of on a phone call two people remember differently.',
      },
    ],
  },
  {
    id: 'schedule-and-crew',
    stage: 'Schedule and crew',
    deeper: [
      { label: 'Scheduling', href: '/features/scheduling' },
      { label: 'Crew + labor', href: '/features/crew' },
    ],
    items: [
      {
        term: 'Scheduling the customer helps pick',
        detail:
          'Send time options by text. Their pick lands on the job, and the assigned crew is told without anyone retyping the date.',
      },
      {
        term: 'Arrival windows and on-my-way texts',
        detail:
          'The customer gets a window rather than a minute that will be wrong, sent from the field when the tech actually leaves. The tech can edit the words; the link and the promised window are not theirs to change.',
      },
      {
        term: 'Crew assignment and the field app',
        detail:
          'Assign the people, and the job context — address, scope, photos, contact — is on their phone instead of in a text you sent at 6am.',
      },
      {
        term: 'Time clock, if you want one',
        detail:
          'Off, optional or required, set per business. Its real job is the shift somebody forgot to close: an open shift running long is visible to the owner, and a shift the owner closes is marked as owner-closed rather than passed off as clocked.',
      },
      {
        term: 'Hours, labor cost and pay',
        detail:
          'Hours carry the rate they were logged at, and roll up by pay period and by job. Marking somebody paid records that you paid them — it does not move money or calculate tax, and the product does not pretend otherwise.',
      },
    ],
  },
  {
    id: 'money',
    stage: 'Money',
    deeper: [
      { label: 'Payments', href: '/features/payments' },
      { label: 'Cash flow', href: '/features/cash-flow' },
      { label: 'Recurring work', href: '/features/recurring' },
    ],
    items: [
      {
        term: 'Deposits and balances through Stripe',
        detail:
          'Request a deposit up front and the balance on completion. Bank debit is offered on the larger payments, where a flat capped fee beats a card percentage.',
      },
      {
        term: 'Payment plans without financing anybody',
        detail:
          'Split the approved total into a deposit and fixed instalments at 0% — no interest, no credit check, no advance. The plan allocates the quote total and can never increase it, and instalments run against the card saved when the deposit was taken.',
      },
      {
        term: 'Cash flow you can see coming',
        detail:
          'Money already promised and money already owed, dated and projected forward, so the week you cannot make payroll is a week you find out about before it arrives.',
      },
      {
        term: 'Recurring plans that bill themselves',
        detail:
          'Weekly, every other week or monthly. Each visit creates its own job and its own charge, so a maintenance customer is a schedule rather than a reminder to invoice.',
      },
    ],
  },
  {
    id: 'customer-during-and-after',
    stage: 'The customer, during and after',
    deeper: [
      { label: 'Client portal + texting', href: '/features/client-portal' },
      { label: 'Reviews + growth', href: '/features/reviews' },
    ],
    items: [
      {
        term: 'A client portal, not another password',
        detail:
          'One link per job, plus an emailed magic link to every job that homeowner has had done. Quote, schedule, selections, change orders, warranties and what is left to pay — all of it, without an account to create or another password to lose.',
      },
      {
        term: 'Texting that stays on the job',
        detail:
          'Replies come back into the record they belong to, so the conversation is still there when the job is invoiced, disputed or repeated three years later.',
      },
      {
        term: 'Warranty and service history',
        detail:
          'A dated record of what was done and what is covered for how long. It is what makes both “that is outside your warranty” and “you are still covered” something you can show rather than argue.',
      },
      {
        term: 'Reviews, follow-up and rebook',
        detail:
          'The review request goes out when the job is actually finished. Past customers can be invited back without rebuilding the customer, the property or the history of what you did there.',
      },
    ],
  },
];

const CAPABILITY_COUNT = CAPABILITY_GROUPS.reduce((total, group) => total + group.items.length, 0);

/* ------------------------------------------------------------------------- */
/* Two showcases whose numbers this page does not type.                       */
/*                                                                            */
/* src/lib/payment-plan-math.ts and src/lib/cash-forecast.ts are both pure and */
/* free of app imports — that is a deliberate property of those modules, so    */
/* the engine, the dashboard and the client loader can all share them. It also */
/* means this page can call the SHIPPED functions at build time and render     */
/* what they return. Every amount, every due date, every verdict below is      */
/* computed by the same code that runs in the product. The only invented       */
/* things are the inputs: a job total, a first due date, a starting balance    */
/* and nine dated movements. Hence the Example frames.                         */
/* ------------------------------------------------------------------------- */

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const money = (cents: number) => usd.format(cents / 100);
const dollars = (amount: number) => usd.format(amount);

/* ---- the payment plan ---------------------------------------------------- */

/* An invented approved total, chosen for one reason: 50% of it does not divide
   into four whole cents. That is the case worth showing — allocateInstallments
   floors the first three parts and puts the remainder on the LAST one, so the
   schedule sums to exactly the approved total and a plan can never over- or
   under-charge a quote. A total that divided evenly would hide the guarantee. */
const PLAN_TOTAL_CENTS = 745_500;
const PLAN_FIRST_DUE = '2026-10-15';

const PLAN = buildPlanSchedule(
  PLAN_TOTAL_CENTS,
  DEFAULT_PLAN.depositPercent,
  DEFAULT_PLAN.installmentCount,
);

const PLAN_ROWS = planSchedulePreview({
  total_cents: PLAN_TOTAL_CENTS,
  deposit_cents: PLAN.depositCents,
  installment_count: DEFAULT_PLAN.installmentCount,
  frequency: DEFAULT_PLAN.frequency,
  first_installment_date: PLAN_FIRST_DUE,
});

/* Added back up rather than asserted: if the allocation ever stopped summing to
   the total, this figure would stop matching it on the page. */
const PLAN_SUM_CENTS =
  PLAN.depositCents + PLAN_ROWS.reduce((total, row) => total + row.amountCents, 0);
const PLAN_REMAINDER_CENTS =
  PLAN_ROWS.length > 1 ? PLAN_ROWS[PLAN_ROWS.length - 1].amountCents - PLAN_ROWS[0].amountCents : 0;

/* ---- the fortnight of cash ----------------------------------------------- */

/* Nine dated movements of the kind the record already holds: material orders,
   payroll runs, a deposit link nobody has clicked, a payment-plan instalment
   due off a saved card, a final balance, a truck payment, an insurance bill and
   a recurring maintenance visit. Every `kind` is a real CashEventKind and every
   label under it comes from the product's own KIND_LABEL map.
   `confirmed: false` means we worked it out rather than that it is booked —
   the deposit and the final balance are both money a homeowner has not paid
   yet, which is why they are also the two that `slips`. */
const CASH_TODAY = '2026-09-07';
const CASH_DAYS = 14;
const CASH_STARTING_BALANCE = 9_200;
const CASH_BUFFER = 5_000;
const CASH_LATE_DAYS = 7;

const CASH_EVENTS: CashEvent[] = [
  {
    id: 'materials-panel',
    dateKey: '2026-09-08',
    label: 'Supply house order',
    detail: 'Panel and EV circuit · Fairview Ave',
    amount: -1_840,
    kind: 'materials',
    confirmed: true,
    slips: false,
    repeating: false,
    href: null,
  },
  {
    id: 'deposit-whitfield',
    dateKey: '2026-09-09',
    label: 'Deposit — Whitfield',
    detail: 'Payment link sent, not yet opened',
    amount: 3_727.5,
    kind: 'deposit',
    confirmed: false,
    slips: true,
    repeating: false,
    href: null,
  },
  {
    id: 'payroll-1',
    dateKey: '2026-09-11',
    label: 'Crew payroll',
    detail: 'Week ending 6 Sep · 3 on the clock',
    amount: -6_400,
    kind: 'payroll',
    confirmed: true,
    slips: false,
    repeating: true,
    href: null,
  },
  {
    id: 'truck-loan',
    dateKey: '2026-09-14',
    label: 'Truck payment',
    detail: 'Monthly, on the 14th',
    amount: -742,
    kind: 'loan',
    confirmed: true,
    slips: false,
    repeating: true,
    href: null,
  },
  {
    id: 'installment-1',
    dateKey: '2026-09-15',
    label: 'Payment plan — instalment 1 of 4',
    detail: 'Runs against the card saved at deposit',
    amount: 931.87,
    kind: 'installment',
    confirmed: true,
    slips: false,
    repeating: true,
    href: null,
  },
  {
    id: 'final-lighting',
    dateKey: '2026-09-17',
    label: 'Balance — kitchen lighting',
    detail: 'Due on completion',
    amount: 1_860,
    kind: 'final',
    confirmed: false,
    slips: true,
    repeating: false,
    href: null,
  },
  {
    id: 'payroll-2',
    dateKey: '2026-09-18',
    label: 'Crew payroll',
    detail: 'Week ending 13 Sep · 3 on the clock',
    amount: -6_400,
    kind: 'payroll',
    confirmed: true,
    slips: false,
    repeating: true,
    href: null,
  },
  {
    id: 'insurance',
    dateKey: '2026-09-19',
    label: 'General liability',
    detail: 'Monthly premium',
    amount: -385,
    kind: 'bill',
    confirmed: true,
    slips: false,
    repeating: true,
    href: null,
  },
  {
    id: 'recurring-maintenance',
    dateKey: '2026-09-19',
    label: 'Maintenance plan — Alvarez',
    detail: 'Every other week, bills itself',
    amount: 240,
    kind: 'recurring',
    confirmed: true,
    slips: false,
    repeating: true,
    href: null,
  },
];

const CASH = buildForecast(CASH_EVENTS, {
  todayKey: CASH_TODAY,
  days: CASH_DAYS,
  startingBalance: CASH_STARTING_BALANCE,
  buffer: CASH_BUFFER,
  lateDays: CASH_LATE_DAYS,
});

/** Only the days something happens — thirteen empty rows are not a forecast. */
const CASH_ROWS = CASH.days.filter((day) => day.events.length > 0);

const dayFormat = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

function dayLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return dayFormat.format(new Date(Date.UTC(year, month - 1, day)));
}

export default function BackOfficePage() {
  return (
    <FeatureDetailLayout
      eyebrow="The rest of the job is already connected"
      /* The old headline led with the span of the thing ("from accepted quote
         to final payment") and put the differentiator second. One job record
         IS the differentiator, and it is what the hero's own slider and the
         section under it both show — so it goes first. */
      title={
        <>
          One job record. <em>From signed quote to final payment.</em>
        </>
      }
      lede="Quote the work, schedule your crew, collect payment, and follow up—without retyping customer details across five different tools."
      heroNote={HERO_NOTE}
      primary={{ label: 'Start free' }}
      secondary={{ label: 'See a job from quote to payment', href: '#back-office-record' }}
      tertiary={{ label: 'Open a live job record', href: '/demo/jobs' }}
      demo={<ShotSlider shots={HERO_SHOTS} label="Back office screens" />}
      proof={[
        { title: 'Quotes + e-sign', body: 'Professional, itemized and ready for approval.' },
        { title: 'Scheduling + crews', body: 'Keep the promise and the people connected.' },
        { title: 'Payments', body: 'Deposits, balances and payment plans through Stripe.' },
        { title: 'Recurring growth', body: 'Repeat visits, reviews and follow-up stay visible.' },
      ]}
      story={{
        eyebrow: 'One place to run the work',
        title: 'The handoff is where most software stacks break.',
        body: 'The customer never starts over and neither does your team. Let’s Get Quoted keeps the customer, the property, the scope, the conversation and the money connected as the job changes stages — so the quote, the schedule, the crew plan and the payment are all the same record, and the office stops retyping what the field already knows.',
      }}
      benefits={[
        {
          title: 'Send professional quotes',
          body: 'Build clear itemized proposals, optional upgrades and e-sign approval around the existing job scope.',
        },
        {
          title: 'Schedule with the right context',
          body: 'Keep arrival windows, assignments and customer communication tied to the work.',
        },
        {
          title: 'Understand labor and cash flow',
          body: 'Track hours, estimated pay, incoming customer money and upcoming obligations.',
        },
        {
          title: 'Turn finished jobs into growth',
          body: 'Use recurring visits, follow-ups and review requests without recreating the customer record.',
        },
      ]}
      /* No steps section. It was headed "The customer never starts over—and
         neither does your team", which is the story's sentence, and its four
         cards — build the quote, schedule and assign, keep everyone updated,
         collect and grow — are the four capability groups below with the
         detail removed. Three sections were making one argument. */
      /* THE PROOF, BEFORE THE ARGUMENT.
          This is the only thing on the page that shows all five bands of one
          record at once, and it was the fourth section — behind the story, the
          benefits and a four-step workflow that all argued for it in words
          first. A reader who is going to be convinced is convinced by this;
          one who is not should not have to read three sections to find out.

         The id is on the SECTION and not on the heading: the hero's second
         button points here, and .section-block[id] is what carries the
         scroll-margin that keeps the fixed header off it. */
      afterProof={
        <section className="section-block" id="back-office-record" aria-labelledby="back-office-record-title">
          <div className={styles.capIntro}>
            <p className="eyebrow">One record, five bands</p>
            <h2 id="back-office-record-title">The customer, the scope, the talking and the money.</h2>
            <p>
              Not five systems kept in step by hand. Everything below is one object that moves
              through stages, and this is what it looks like part-way through the work.
            </p>
          </div>

          <ExampleFrame
            label="One job record, part-way through the work"
            note="An invented job with invented figures, shown to make one point: the customer, the scope, the conversation and the money are bands of a single record, not five systems kept in step by hand."
          >
            <JobRecordExample />
          </ExampleFrame>
        </section>
      }
      cta={{
        title: 'Put the entire job behind one front door.',
        note: `No card required and no monthly subscription. The platform fee is ${STARTING_RATE} of what a homeowner pays you and falls as your volume grows; card processing is Stripe’s standard ${STRIPE_PROCESSING_NOTE}.`,
      }}
    >
      <section className="section-block" aria-labelledby="back-office-capabilities">
        <div className={styles.capIntro}>
          <p className="eyebrow">Everything on the record</p>
          <h2 id="back-office-capabilities">
            {CAPABILITY_COUNT} things the job record carries for you.
          </h2>
          <p>
            Not modules you switch on one at a time. These are the parts of the same record, and
            each one is there because the stage before it already collected what it needs. Each
            stage links to the page that takes it apart properly.
          </p>
        </div>

        <div className={styles.capGroups}>
          {CAPABILITY_GROUPS.map((group) => (
            <div key={group.id} id={group.id} className={styles.capGroup}>
              <div className={styles.capGroupHead}>
                <h3 className={styles.capGroupTitle}>{group.stage}</h3>
                <span className={styles.capCount} aria-hidden="true">
                  {String(group.items.length).padStart(2, '0')}
                </span>
              </div>
              {/* SEVENTEEN NAMES, NOT SEVENTEEN PARAGRAPHS.
                  Every item's explanation is two or three lines long and there
                  are seventeen of them, which is most of why this page ran
                  11,443px on a phone. The NAMES are what somebody scanning for
                  "does it do change orders" needs, so all seventeen stay
                  visible; the explanation is one tap away and still in the
                  HTML, so nothing is hidden from search or from find-in-page.

                  <details> rather than a script: it works before hydration, it
                  is in the tab order for free, and the browser's own
                  find-in-page opens it. No `name`, so reading one answer never
                  closes another. */}
              {/* A LIST, NOT A DEFINITION LIST.
                  It was <dl><dt>name</dt><dd>explanation</dd></dl>, which is
                  the right shape for a term and its definition — but a <dt>
                  may not contain a <dd>, so the disclosure cannot live inside
                  the pair. The list of capabilities is a list; each item names
                  one and can explain itself. */}
              <ul className={styles.capList}>
                {group.items.map((item) => (
                  <li key={item.term}>
                    <details>
                      <summary>
                        <span>{item.term}</span>
                        <i aria-hidden="true" />
                      </summary>
                      <p>{item.detail}</p>
                    </details>
                  </li>
                ))}
              </ul>

              {/* The way out of the list. Named links rather than one "learn
                  more": a group can lead to two or three pages, and "Cash flow"
                  tells a reader what they are about to get in a way that "read
                  more about Money" cannot. The stage name is repeated into each
                  link's accessible name, because a screen-reader user pulling
                  up a list of links otherwise hears "Payments" three times over
                  from three different groups with nothing to tell them apart. */}
              <p className={styles.capDeeper}>
                {group.deeper.map((link) => (
                  <Link key={link.href} href={link.href}>
                    {link.label}
                    <span aria-hidden="true">→</span>
                    <span className="sr-only"> — {group.stage.toLowerCase()}</span>
                  </Link>
                ))}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* B1 — the payment plan, drawn by the module that builds it.
          The capability list says "split the approved total into a deposit and
          fixed instalments at 0%… the plan allocates the quote total and can
          never increase it". This is that sentence, executed. */}
      <section className="section-block" aria-labelledby="back-office-plan">
        <div className={styles.showcaseGrid}>
          <div className={styles.showcaseCopy}>
            <p className="eyebrow">Payment plans without financing anybody</p>
            <h2 id="back-office-plan">The whole schedule, before anybody signs it.</h2>
            <p>
              A homeowner who cannot write one cheque for {money(PLAN_TOTAL_CENTS)} can still say
              yes. Half on approval, then {DEFAULT_PLAN.installmentCount} fixed{' '}
              {DEFAULT_PLAN.frequency} parts off the card saved when the deposit was taken — at 0%.
              No interest, no credit check, and nobody advances you the money.
            </p>
            <p className={styles.showcaseNote}>
              The plan allocates the approved total and can never increase it. The first three
              parts are floored to the cent and the last one absorbs what is left over, so the
              schedule adds back up to exactly what was agreed
              {PLAN_REMAINDER_CENTS > 0 ? (
                <>
                  {' '}
                  — here the final instalment carries {money(PLAN_REMAINDER_CENTS)} more than the
                  three before it
                </>
              ) : null}
              .
            </p>
          </div>

          <ExampleFrame
            label="A payment plan as the homeowner is shown it"
            note="Invented job total and invented dates. Every amount and every due date on this panel is produced by the product's own payment-plan module — none of them is typed onto the page."
          >
            <div className={styles.plan}>
              <div className={styles.planHead}>
                <span className={styles.planHeadLabel}>Approved total</span>
                <b className={styles.planHeadValue}>{money(PLAN_TOTAL_CENTS)}</b>
              </div>

              <ol className={styles.planRows}>
                <li className={`${styles.planRow} ${styles.planDeposit}`}>
                  <span className={styles.planWhen}>On approval</span>
                  <span className={styles.planWhat}>
                    Deposit
                    <span className={styles.planSub}>
                      {DEFAULT_PLAN.depositPercent}% of the approved total
                    </span>
                  </span>
                  <span className={styles.planAmount}>{money(PLAN.depositCents)}</span>
                </li>

                {PLAN_ROWS.map((row) => (
                  <li key={row.seq} className={styles.planRow}>
                    <span className={styles.planWhen}>{formatPlanDate(row.dueDate)}</span>
                    <span className={styles.planWhat}>
                      Instalment {row.seq} of {PLAN_ROWS.length}
                      <span className={styles.planSub}>
                        {row.seq === PLAN_ROWS.length && PLAN_REMAINDER_CENTS > 0
                          ? 'Carries the rounding remainder'
                          : `Charged ${DEFAULT_PLAN.frequency}, off the saved card`}
                      </span>
                    </span>
                    <span className={styles.planAmount}>{money(row.amountCents)}</span>
                  </li>
                ))}
              </ol>

              <div className={`${styles.planHead} ${styles.planTotal}`}>
                <span className={styles.planHeadLabel}>Deposit + instalments</span>
                <b className={styles.planHeadValue}>{money(PLAN_SUM_CENTS)}</b>
              </div>
            </div>
          </ExampleFrame>
        </div>
      </section>

      {/* B2 — cash flow you can see coming.
          The capability list promises "the week you cannot make payroll is a
          week you find out about before it arrives" and nothing on the page
          showed it. This is a fortnight of the record's own dated money, run
          through the shipped forecast module. */}
      <section className="section-block" aria-labelledby="back-office-cash">
        <div className={styles.showcaseGrid}>
          <div className={styles.showcaseCopy}>
            <p className="eyebrow">Cash flow you can see coming</p>
            <h2 id="back-office-cash">The payroll you cannot make, {CASH_DAYS} days early.</h2>
            <p>
              Deposits, balances, plan instalments and recurring visits are already dated on the
              record, and so are payroll, materials, the truck payment and the bills. Lined up in
              order, they answer the only question that matters on a Friday: what is the balance
              going to be when the next payroll clears?
            </p>
            <p className={styles.showcaseNote}>
              Nothing here reads a bank. The starting figure is one you type in, and every row
              below it is something already on your own record, dated forward.
            </p>
          </div>

          <ExampleFrame
            label={`${CASH_DAYS} days of dated money, with the balance carried down`}
            note="Invented starting balance and invented movements. The running balance, the lowest point and the late-payment stress test are all computed by the product's forecast module from the rows shown."
          >
            <div className={styles.cash}>
              <div className={styles.cashHead}>
                <span className={styles.cashHeadLabel}>Money in the bank today (you enter this)</span>
                <b className={styles.cashHeadValue}>{dollars(CASH_STARTING_BALANCE)}</b>
              </div>

              <ul className={styles.cashRows}>
                {CASH_ROWS.map((day) => (
                  <li key={day.dateKey} className={styles.cashDay}>
                    <div className={styles.cashDayHead}>
                      <span className={styles.cashDate}>{dayLabel(day.dateKey)}</span>
                      <span
                        className={styles.cashBalance}
                        data-low={day.projected < CASH_BUFFER ? 'true' : undefined}
                      >
                        {dollars(day.projected)}
                      </span>
                    </div>
                    <ul className={styles.cashEvents}>
                      {day.events.map((event) => (
                        <li key={event.id} className={styles.cashEvent}>
                          <span className={styles.cashKind}>{KIND_LABEL[event.kind]}</span>
                          <span className={styles.cashWhat}>
                            {event.label}
                            <span className={styles.cashDetail}>
                              {event.detail}
                              {event.confirmed ? '' : ' · not confirmed yet'}
                            </span>
                          </span>
                          <span
                            className={styles.cashAmount}
                            data-direction={event.amount < 0 ? 'out' : 'in'}
                          >
                            {event.amount < 0 ? '−' : '+'}
                            {dollars(Math.abs(event.amount))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>

              <ul className={styles.cashVerdicts}>
                <li>
                  <span className={styles.cashVerdictLabel}>Lowest projected balance</span>
                  <span className={styles.cashVerdictValue}>
                    {dollars(CASH.lowest.balance)} on {dayLabel(CASH.lowest.dateKey)}
                  </span>
                </li>
                {CASH.firstBelowBuffer ? (
                  <li>
                    <span className={styles.cashVerdictLabel}>
                      First day under your {dollars(CASH_BUFFER)} floor
                    </span>
                    <span className={styles.cashVerdictValue}>
                      {dayLabel(CASH.firstBelowBuffer.dateKey)} —{' '}
                      {dollars(CASH.firstBelowBuffer.balance)}
                    </span>
                  </li>
                ) : null}
                {CASH.worstCaseOverdraft ? (
                  <li>
                    <span className={styles.cashVerdictLabel}>
                      If customer money lands {CASH_LATE_DAYS} days late
                    </span>
                    <span className={styles.cashVerdictValue}>
                      Overdrawn by {dayLabel(CASH.worstCaseOverdraft.dateKey)}
                    </span>
                  </li>
                ) : null}
                <li>
                  <span className={styles.cashVerdictLabel}>
                    Cash you would need today to stay above the floor
                  </span>
                  <span className={styles.cashVerdictValue}>{dollars(CASH.safeStartingCash)}</span>
                </li>
              </ul>
            </div>
          </ExampleFrame>
        </div>
      </section>
    </FeatureDetailLayout>
  );
}
