import type { Metadata } from 'next';
import { ExampleFrame, FeatureDetailLayout } from '@/components/marketing';
import { FEE_TIERS, STRIPE_PROCESSING_NOTE } from '@/lib/pricing';
import styles from './back-office.module.css';

export const metadata: Metadata = {
  title: 'Contractor back office',
  description:
    'Connect contractor quotes, scheduling, crews, payments, recurring work and follow-up. One job record from accepted quote to final payment.',
  alternates: { canonical: 'https://letsgetquoted.com/features/back-office' },
};

/* The one number the page quotes, taken from the canonical fee model rather
   than typed in — the rate a contractor reads here can then never drift from
   /pricing or from the calculator. */
const LOWEST_RATE = FEE_TIERS[0].rate;

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
const CAPABILITY_GROUPS: { stage: string; items: { term: string; detail: string }[] }[] = [
  {
    stage: 'Quote and approve',
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
    stage: 'Schedule and crew',
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
    stage: 'Money',
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
    stage: 'The customer, during and after',
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

export default function BackOfficePage() {
  return (
    <FeatureDetailLayout
      eyebrow="The rest of the job is already connected"
      title={
        <>
          From accepted quote to final payment. <em>One job record.</em>
        </>
      }
      lede="Create the quote, book the work, assign the crew, collect payment and follow up without rebuilding the same customer information in five different systems."
      heroNote={`Everything below is included. There is no subscription — the platform fee is ${LOWEST_RATE} of what a homeowner pays you, falling as your volume grows, and there is nothing to pay until they do.`}
      demo={
        <ExampleFrame
          label="One job record, part-way through the work"
          note="An invented job with invented figures, shown to make one point: the customer, the scope, the conversation and the money are bands of a single record, not five systems kept in step by hand."
        >
          <JobRecordExample />
        </ExampleFrame>
      }
      proof={[
        { title: 'Quotes + e-sign', body: 'Professional, itemized and ready for approval.' },
        { title: 'Scheduling + crews', body: 'Keep the promise and the people connected.' },
        { title: 'Payments', body: 'Deposits, balances and payment plans through Stripe.' },
        { title: 'Recurring growth', body: 'Repeat visits, reviews and follow-up stay visible.' },
      ]}
      story={{
        eyebrow: 'One place to run the work',
        title: 'The handoff is where most software stacks break.',
        body: 'Let’s Get Quoted keeps the customer, property, scope, conversation and money connected as the job changes stages. That means less retyping for the office and fewer missing details for the field.',
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
      stepsTitle="The customer never starts over—and neither does your team."
      steps={[
        { title: 'Build the quote', body: 'Use the qualified request to prepare the proposal.' },
        { title: 'Schedule and assign', body: 'Set the visit and give the crew the job context.' },
        { title: 'Keep everyone updated', body: 'Text the customer and maintain the shared portal.' },
        { title: 'Collect and grow', body: 'Finish payment, request the review and plan the next visit.' },
      ]}
      cta={{
        title: 'Put the entire job behind one front door.',
        note: `No card required and no monthly subscription. The platform fee is ${LOWEST_RATE} of what a homeowner pays you and falls as your volume grows; card processing is Stripe’s standard ${STRIPE_PROCESSING_NOTE}.`,
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
            each one is there because the stage before it already collected what it needs.
          </p>
        </div>

        <div className={styles.capGroups}>
          {CAPABILITY_GROUPS.map((group) => (
            <div key={group.stage} className={styles.capGroup}>
              <div className={styles.capGroupHead}>
                <h3 className={styles.capGroupTitle}>{group.stage}</h3>
                <span className={styles.capCount} aria-hidden="true">
                  {String(group.items.length).padStart(2, '0')}
                </span>
              </div>
              <dl className={styles.capList}>
                {group.items.map((item) => (
                  <div key={item.term}>
                    <dt>{item.term}</dt>
                    <dd>{item.detail}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </section>
    </FeatureDetailLayout>
  );
}
