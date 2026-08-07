import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import SiteFooter from '@/components/site-footer';
import StickyCta from '@/components/sticky-cta';
import ExampleFrame from '@/components/marketing/example-frame';
import MarketingCta from '@/components/marketing/marketing-cta';
import MarketingHeader from '@/components/marketing/marketing-header';
import { APP_SIGNUP_URL } from '@/components/marketing/links';
import { MARKETING_MAIN_ID, MARKETING_PAGE_CLASS } from '@/components/marketing/marketing-page';
import { FEE_TIERS, STRIPE_PROCESSING_NOTE } from '@/lib/pricing';
import { TRADES } from '@/lib/trades';
import styles from './how-it-works.module.css';

export const metadata: Metadata = {
  title: 'How Let’s Get Quoted Works',
  description:
    'See how one contractor job moves from a new website visit to qualified lead, approved quote, scheduled work and payment — five stages, and what each one puts on the job record.',
  alternates: { canonical: 'https://letsgetquoted.com/how-it-works' },
  openGraph: {
    title: 'How Let’s Get Quoted Works',
    description:
      'Five stages, from a website visit to money in the bank. Each one shown four ways: what you do, what the homeowner sees, what lands on the job record, and what happens automatically next.',
    url: 'https://letsgetquoted.com/how-it-works',
    type: 'website',
  },
};

/* ---------------------------------------------------------------------------
 * The five stages.
 *
 * `title`, `summary` and every string in `does` are the Codex draft's own copy,
 * kept word for word — that draft supplied the contractor's move at each stage
 * and the sentence that frames it.
 *
 * `sees`, `record` and `next` are written here, and every claim in them is
 * checked against the shipped code rather than against the pitch:
 *
 *   01  src/lib/site-seed.ts (generated services, FAQs, cities, SEO title and
 *       description), src/lib/seo/site-seo.ts (the town + service signal in the
 *       title), src/lib/sites.ts (hours, service area, published)
 *   02  src/lib/leads.ts (triage score hot/warm/low + LEAD_FLAG_LABELS),
 *       src/lib/lead-verification.ts (the code is only ever texted),
 *       src/lib/lead-photo-storage.ts, src/lib/intake-quality.ts (the three
 *       filters: timeframe, area, whether the number is real),
 *       src/lib/lead-priority.ts (whose move it is, and for how long),
 *       src/lib/email.ts (the high-value subject line)
 *   03  src/lib/quote-draft.ts (DraftSource: price-book | history | estimate),
 *       src/lib/invoices.ts signInvoice (signer name + timestamp; the lead
 *       flips to won and the job to in_progress in the same call),
 *       src/lib/jobs.ts (deposit_gate), src/lib/payments.ts (deposit)
 *   04  src/lib/scheduling.ts (the options text and the client's pick),
 *       src/lib/arrival.ts (the window, and SmsStatus as a delivery receipt),
 *       src/lib/message-context.ts (a thread resolved to a job and an address),
 *       src/lib/leads.ts convertLeadToJob (scope + address carry over)
 *   05  src/lib/payments.ts (ACH on large one-offs),
 *       src/lib/review-routing.ts (reviewRoutes cannot see the rating),
 *       src/lib/reviews.ts (rating + feedback filed on the invite),
 *       src/lib/rebook.ts (DEFAULT_REBOOK_DAYS 90, REINVITE_COOLDOWN_DAYS 14)
 *
 * Where a behaviour is a setting rather than a guarantee, the sentence says so
 * ("if you have turned that on", "set the deposit gate"). Where nothing is true
 * yet — stage 01 has no job record — it says that instead of inventing one.
 * ------------------------------------------------------------------------- */

type Stage = {
  number: string;
  title: string;
  summary: string;
  /** The contractor's move. Codex copy, verbatim. */
  does: string[];
  /** What lands on the homeowner's phone. */
  sees: ReactNode;
  /** What is now permanently attached to the job. */
  record: ReactNode;
  /** What the product then does without being asked. */
  next: ReactNode;
};

const STAGES: Stage[] = [
  {
    number: '01',
    title: 'Build the site',
    summary:
      'Start with a polished, editable contractor website built around your trade and service area.',
    does: ['Add your business basics', 'Generate services and local pages', 'Connect Smart Intake'],
    sees: (
      <>
        A published site for your trade: the services you sell, the towns you cover, your hours, and
        the questions everyone asks already answered. The quote request form is the front door.
      </>
    ),
    record: (
      <>
        Nothing yet — and that is the honest answer. This stage builds the front door. The record
        starts the moment somebody walks through it.
      </>
    ),
    next: (
      <>
        Your page titles and descriptions are written with your service and your town in them, and
        the form is already wired to your lead inbox. There is nothing to connect up afterwards.
      </>
    ),
  },
  {
    number: '02',
    title: 'Qualify the lead',
    summary: 'Ask project-specific questions before your team spends time on a call.',
    does: [
      'Collect scope and photos',
      'Consider fit, urgency, value and distance',
      'Alert the team to strong opportunities',
    ],
    sees: (
      <>
        A short set of questions about their actual project — scope, timing, photos they can take on
        the spot — and a code texted to their phone to confirm the number, if you have turned that
        on.
      </>
    ),
    record: (
      <>
        Their answers and their photos, with a triage verdict on top: hot, warm or low, and the flags
        behind it — out of area, below your minimum, work you don’t do, phone verified.
      </>
    ),
    next: (
      <>
        The lead lands in the priority inbox ranked on whose move it is and how long it has been
        their move. If the estimate clears your threshold, the email that reaches you says so in the
        subject line.
      </>
    ),
  },
  {
    number: '03',
    title: 'Win the job',
    summary:
      'Turn the same project summary into a professional quote the homeowner can approve.',
    does: ['Create itemized options', 'Send for e-sign approval', 'Collect the deposit'],
    sees: (
      <>
        A quote they can open on a phone: itemised, totalled, with a name to type — and, if you asked
        for one, a deposit to pay on the same screen.
      </>
    ),
    record: (
      <>
        Every line and where its price came from — your price book, what you have charged before, or
        an estimate flagged for you to check. Then the signer’s name, the moment they signed, and the
        deposit against the job.
      </>
    ),
    next: (
      <>
        Signing moves the job to in progress and marks the lead won on its own. Set the deposit gate
        and nothing can be scheduled until the money clears.
      </>
    ),
  },
  {
    number: '04',
    title: 'Run the work',
    summary:
      'Schedule the visit, assign the crew and keep the homeowner updated by text and portal.',
    does: ['Set the arrival window', 'Share the job context', 'Keep every message attached'],
    sees: (
      <>
        A text with the dates you can actually do, so they pick one instead of trading voicemails.
        Then an “on my way” message with a window on it, and a portal showing what is done and what
        is next.
      </>
    ),
    record: (
      <>
        Who is going and when, the arrival text and whether it was sent or came back failed, and
        every message tied back to the job and the address instead of to a bare phone number.
      </>
    ),
    next: (
      <>
        Their pick writes itself into the schedule and tells you it happened. The crew’s field app
        already carries the address and the scope from the original request.
      </>
    ),
  },
  {
    number: '05',
    title: 'Get paid + grow',
    summary:
      'Collect the balance, request the review and keep the relationship ready for recurring work.',
    does: ['Complete payment', 'Trigger follow-up', 'Plan the next visit'],
    sees: (
      <>
        A final bill payable from the same link — card, or bank transfer when the amount makes card
        fees hurt. Then, with the feedback page switched on, one review request that offers the
        public review and a private word in the same breath, whatever they thought of you.
      </>
    ),
    record: (
      <>
        The payment against the job, and what they said — the rating, and any private feedback —
        filed against the customer rather than lost in somebody’s inbox.
      </>
    ),
    next: (
      <>
        Once a customer passes the interval you set — 90 days unless you change it — they surface as
        due to rebook, and the invite will not go out twice inside a fortnight.
      </>
    ),
  },
];

/** The four axes, in the order every stage answers them. */
const AXES = [
  { key: 'does', label: 'You do', blurb: 'The contractor’s move at this stage.' },
  { key: 'sees', label: 'The homeowner sees', blurb: 'What actually lands on their phone.' },
  { key: 'record', label: 'The record gains', blurb: 'What is now attached to the job for good.' },
  { key: 'next', label: 'Then, automatically', blurb: 'What the product does without being asked.' },
] as const;

/* The job-record example under the continuity band. Invented job, invented
 * homeowner — hence the ExampleFrame — but every event type on it is one the
 * product really writes, and the wording of each ("Hot", "phone verified",
 * "Customer texted", "price book") is the product's own.
 *
 * Note what the arrival row does NOT say. SmsStatus (src/lib/arrival.ts) is
 * sent | failed | no_phone | opted_out | not_configured — there is no delivered
 * state, and the Twilio status webhook only acts on failed/undelivered, so a
 * carrier "delivered" callback is discarded. "Text delivered" would be a
 * receipt the product cannot produce; "Customer texted." is the string
 * arrival-send.ts actually writes to the timeline. */
/* Whose hand put a line on the record.
 *
 * The page's fourth axis is "Then, automatically", and until now the timeline
 * below it drew a line the homeowner typed and a line nobody typed in exactly
 * the same ink. That flattening cost the page its own argument, so each row now
 * says which of three things happened — and the tag is checked against the code
 * that writes the row, not against the pitch:
 *
 *   homeowner  the form, the signature, the date they picked, the payment
 *   you        your move: the quote you sent, the on-my-way the tech tapped
 *   auto       nobody typed it. The intake route scores the lead itself —
 *              src/app/api/public/leads/route.ts:232 sets hot/warm/low from
 *              the flags and the estimate before the lead is ever stored.
 *
 * `auto` on a row is separate from `hand`, and it is about the DETAIL line: the
 * thing the record went on to write by itself once the row above existed.
 * Each one is a specific function:
 *
 *   row 3  src/lib/quote-draft.ts — DraftSource marks every line price-book,
 *          history or estimate; the "flagged for you to check" is the product's
 *          verdict, not a note somebody left
 *   row 4  src/lib/invoices.ts signInvoice (line 448) — one call flips the lead
 *          to won and the job from new_lead to in_progress
 *   row 5  src/lib/scheduling.ts applyScheduleSelection (line ~280) — the pick
 *          writes itself onto the job and texts the assigned crew
 *   row 6  src/lib/arrival.ts — the window and the text, composed and sent from
 *          the tech's tap
 *   row 7  src/lib/review-routing.ts reviewRoutes — the invite offers the public
 *          review and the private word together, and cannot see the rating
 *
 * Rows 1 and 2 carry no `auto` because nothing followed on its own: row 1 IS
 * the homeowner's typing and row 2 IS the automatic step. */
type RecordHand = 'homeowner' | 'you' | 'auto';

const HAND_LABEL: Record<RecordHand, string> = {
  homeowner: 'Homeowner',
  you: 'You',
  auto: 'Automatic',
};

const HANDS: RecordHand[] = ['homeowner', 'you', 'auto'];

const RECORD_EVENTS: {
  stage: string;
  event: string;
  detail: string;
  hand: RecordHand;
  /** True when the detail line is what the record wrote once the event landed. */
  auto?: true;
}[] = [
  {
    stage: '01→02',
    event: 'Quote request from your website',
    detail: '3 photos · “Kitchen ceiling, water stain spreading” · timeframe: within a month',
    hand: 'homeowner',
  },
  {
    stage: '02',
    event: 'Triaged Hot',
    detail: 'In your service area · phone verified · above your minimum job size',
    hand: 'auto',
  },
  {
    stage: '03',
    event: 'Quote sent — 4 line items',
    detail: '3 priced from your price book, 1 estimate flagged for you to check',
    hand: 'you',
    auto: true,
  },
  {
    stage: '03',
    event: 'Signed by D. Whitfield · deposit paid',
    detail: 'Lead marked won · job moved to in progress · schedule unlocked',
    hand: 'homeowner',
    auto: true,
  },
  {
    stage: '04',
    event: 'Homeowner picked Tue, 9–11am',
    detail: 'Chosen from the three dates you offered · crew assigned',
    hand: 'homeowner',
    auto: true,
  },
  {
    stage: '04',
    event: 'On my way — 15 minutes',
    detail: 'Customer texted · arrival window 9:15–9:45am',
    hand: 'you',
    auto: true,
  },
  {
    stage: '05',
    event: 'Balance paid · review request sent',
    detail: 'Public review and a private word offered together, as they always are',
    hand: 'homeowner',
    auto: true,
  },
];

/* Counted, not asserted — so the sentence under the timeline cannot drift from
   the rows above it if one is ever added or retagged. */
const YOUR_ROWS = RECORD_EVENTS.filter((entry) => entry.hand === 'you').length;

const FIRST_TIER = FEE_TIERS[0];
const LAST_TIER = FEE_TIERS[FEE_TIERS.length - 1];

export default function HowItWorksPage() {
  return (
    <>
      {/* AppShell renders no chrome for this route, so the page draws its own
          header — the same one every page in the cluster draws. */}
      <MarketingHeader current="/how-it-works" />

      <main className={MARKETING_PAGE_CLASS} id={MARKETING_MAIN_ID}>
        <div className="ambient-glow ambient-glow-a" aria-hidden="true" />
        <div className="ambient-glow ambient-glow-b" aria-hidden="true" />

        <div className="marketing-shell">
          <section className="hero-grid" aria-labelledby="how-title">
            <div className="hero-copy">
              <p className="eyebrow">One customer record · start to finish</p>
              <h1 id="how-title" className={styles.title}>
                Five stages. <em>No broken handoffs.</em>
              </h1>
              <p className={styles.lede}>
                A homeowner begins on your website. The same details keep moving as the opportunity
                becomes a quote, a scheduled job and money in the bank.
              </p>
              <div className="actions">
                <a href={APP_SIGNUP_URL} className="btn primary">
                  Build my free site <span aria-hidden="true">→</span>
                </a>
                <Link href="/demo" className="btn secondary">
                  Explore the demo — no signup
                </Link>
              </div>
              <p className={styles.heroNote}>
                Built around {TRADES.length} trades. Free to build, quote and schedule — the platform
                fee only applies once a homeowner has actually paid you.
              </p>
            </div>

            <ul className={styles.pipeline} aria-label="The five stages">
              {STAGES.map((stage) => (
                <li key={stage.number}>
                  <a href={`#stage-${stage.number}`} className={styles.pipelineLink}>
                    <span className={styles.pipelineNum} aria-hidden="true">
                      {stage.number}
                    </span>
                    <span className={styles.pipelineTitle}>{stage.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <section className="section-block" aria-labelledby="how-to-read">
            <div className={styles.legendHead}>
              <p className="eyebrow">How to read this</p>
              <h2 id="how-to-read">The same four questions, five times over.</h2>
              <p>
                A stage that only lists what you do hides the half that matters. Each one below
                answers all four — including the two nobody usually writes down: what the job record
                gained, and what moved on its own afterwards.
              </p>
            </div>
            <ul className={styles.legend}>
              {AXES.map((axis) => (
                <li key={axis.key} className={styles.legendItem}>
                  <span className={styles.axisLabel}>{axis.label}</span>
                  <span className={styles.legendBody}>{axis.blurb}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="section-block" aria-labelledby="stages-title">
            <div className={styles.legendHead}>
              <p className="eyebrow">The five stages</p>
              <h2 id="stages-title">One job, from first click to next visit.</h2>
            </div>

            <ul className={styles.stages}>
              {STAGES.map((stage) => (
                <li key={stage.number}>
                  <article
                    id={`stage-${stage.number}`}
                    className={styles.stage}
                    aria-labelledby={`stage-${stage.number}-title`}
                  >
                    <div className={styles.stageHead}>
                      <span className={styles.stageNum} aria-hidden="true">
                        {stage.number}
                      </span>
                      <div className={styles.stageCopy}>
                        <span className={styles.stageKicker}>Stage {stage.number}</span>
                        <h3 id={`stage-${stage.number}-title`} className={styles.stageTitle}>
                          {stage.title}
                        </h3>
                        <p className={styles.stageSummary}>{stage.summary}</p>
                      </div>
                    </div>

                    {/* Four term/definition pairs, in the same order in every
                        stage, so a reader can run down a column as easily as
                        across a row. The <div> grouping each dt with its dd is
                        valid inside a <dl> and is what makes a pair one card. */}
                    <dl className={styles.axes}>
                      <div className={styles.cell}>
                        <dt className={styles.axisLabel}>You do</dt>
                        <dd className={styles.cellList}>
                          <ul className={styles.doList}>
                            {stage.does.map((item) => (
                              <li key={item} className={styles.doItem}>
                                <span className={styles.doTick} aria-hidden="true">
                                  ✓
                                </span>
                                {item}
                              </li>
                            ))}
                          </ul>
                        </dd>
                      </div>

                      <div className={styles.cell}>
                        <dt className={styles.axisLabel}>The homeowner sees</dt>
                        <dd className={styles.cellBody}>{stage.sees}</dd>
                      </div>

                      <div className={styles.cell}>
                        <dt className={styles.axisLabel}>The record gains</dt>
                        <dd className={styles.cellBody}>{stage.record}</dd>
                      </div>

                      <div className={styles.cell}>
                        <dt className={`${styles.axisLabel} ${styles.axisLabelAuto}`}>
                          Then, automatically
                        </dt>
                        <dd className={styles.cellBody}>{stage.next}</dd>
                      </div>
                    </dl>
                  </article>
                </li>
              ))}
            </ul>
          </section>

          <section className="section-block" aria-labelledby="continuity-title">
            <div className={styles.continuityGrid}>
              <div className={styles.continuityCopy}>
                <p className="eyebrow">The difference is continuity</p>
                <h2 id="continuity-title">
                  The homeowner never repeats the story.
                  <br />
                  Your team never rebuilds the record.
                </h2>
                <p>
                  Website answers, photos, texts, quote decisions, schedule details, crew context and
                  payments stay attached to the same job.
                </p>
              </div>

              <ExampleFrame
                label="One job record, filling itself in across the five stages."
                note="Invented job and invented homeowner. The event types and the wording of each are the product’s own."
              >
                {/* The key. Three words, so the tags on the rows below are read
                    as a taxonomy rather than as decoration — and so the one
                    that matters, "Automatic", is named before it appears. */}
                <div className={styles.recordKey}>
                  <span className={styles.recordKeyLabel}>Who put it there</span>
                  <ul className={styles.recordKeyList}>
                    {HANDS.map((hand) => (
                      <li key={hand}>
                        <span className={styles.recordHand} data-hand={hand}>
                          {HAND_LABEL[hand]}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <ul className={styles.record}>
                  {RECORD_EVENTS.map((entry) => (
                    <li key={`${entry.stage}-${entry.event}`}>
                      <div className={styles.recordRow}>
                        <span className={styles.recordStage} aria-hidden="true">
                          {entry.stage}
                        </span>
                        <span className={styles.recordEvent}>
                          <span className={styles.recordHand} data-hand={entry.hand}>
                            {HAND_LABEL[entry.hand]}
                          </span>
                          {entry.event}
                          <span className={styles.recordDetail}>
                            {entry.auto ? (
                              <span className={styles.recordAuto}>
                                <span aria-hidden="true">→ </span>Then, automatically:{' '}
                              </span>
                            ) : null}
                            {entry.detail}
                          </span>
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>

                <p className={styles.recordTally}>
                  {YOUR_ROWS} of the {RECORD_EVENTS.length} lines on this record were put there by
                  you. The rest arrived with the homeowner, or the record wrote them itself.
                </p>
              </ExampleFrame>
            </div>
          </section>

          <MarketingCta
            title="Put your next job on one connected path."
            note={
              <>
                Free to build, quote and schedule. The platform fee applies only when a homeowner
                pays you — {FIRST_TIER.rate}, dropping to {LAST_TIER.rate} as your yearly volume
                grows, plus standard Stripe processing ({STRIPE_PROCESSING_NOTE}).
              </>
            }
          />

          <SiteFooter />
        </div>

        <StickyCta href={APP_SIGNUP_URL} label="Build my free site" />
      </main>
    </>
  );
}
