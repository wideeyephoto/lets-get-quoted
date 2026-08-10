import type { Metadata } from 'next';
import FeatureDetailLayout from '@/components/marketing/feature-detail-layout';
import ExampleFrame from '@/components/marketing/example-frame';
import QuickStopPanel from '@/components/quick-stop-panel';
import { STRIPE_PROCESSING_NOTE } from '@/lib/pricing';
import {
  QUICK_STOP_STATUS_LABEL,
  centsToDollars,
  DEFAULT_QUICK_STOP_MAX_DETOUR_MILES,
  DEFAULT_QUICK_STOP_MAX_VISIT_MINUTES,
  DEFAULT_QUICK_STOP_MAX_PER_DAY,
  DEFAULT_QUICK_STOP_PAYMENT_DEADLINE_MINS,
  DEFAULT_QUICK_STOP_MIN_FEE_CENTS,
  DEFAULT_QUICK_STOP_MAX_FEE_CENTS,
} from '@/lib/quick-stop';
import styles from './quick-stops.module.css';

export const metadata: Metadata = {
  // No brand suffix — the root layout's template is "%s · Let's Get Quoted",
  // so this previously rendered "Quick Stops | Let's Get Quoted · Let's Get
  // Quoted". See the matching note in ../ai-intake/page.tsx.
  // Named for the search it should win rather than for the button in our own
  // nav: "Quick Stops" alone means nothing to somebody who has never heard of
  // us, and the title is the strongest signal Google uses to write the result.
  title: 'Quick Stops for Contractors: Prepaid Jobs Nearby',
  description:
    'Fill gaps in your route with nearby, prepaid jobs. You approve every request, set the price and arrival window, and go only after the homeowner has paid.',
  alternates: { canonical: 'https://letsgetquoted.com/features/quick-stops' },
  /* THE SOCIAL CARD IS THIS PAGE'S, NOT THE HOMEPAGE'S.
     Next replaces the parent metadata's `openGraph` object wholesale rather
     than merging into it — but only if the child declares one. Without this
     block every share of this URL unfurled as the homepage: its title, its
     description, a screenshot of a website template, and an og:url pointing at
     letsgetquoted.com, so the card sent people somewhere else entirely. */
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/features/quick-stops',
    siteName: "Let's Get Quoted",
    title: 'Fill schedule gaps with prepaid jobs nearby.',
    description:
      'See requests close to jobs already on your schedule. You choose the price and arrival window, then send an offer. It only becomes a job after the homeowner pays.',
    images: [{ url: '/features/og-quick-stops.jpg', width: 1200, height: 630, alt: 'Let’s Get Quoted Quick Stops: prepaid contractor jobs nearby' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Fill schedule gaps with prepaid jobs nearby.',
    description:
      'See requests close to jobs already on your schedule. You choose the price and arrival window, then send an offer. It only becomes a job after the homeowner pays.',
    images: ['/features/og-quick-stops.jpg'],
  },
};

/* The offer as the contractor sends it.
 *
 * The status chip is imported from the real lifecycle table rather than
 * retyped, so this panel cannot drift from the status a contractor actually
 * sees. It deliberately shows the moment AFTER sending and BEFORE payment —
 * "Awaiting payment" — because that gap is the entire argument of the page. */
function PendingOffer() {
  return (
    <div className={styles.offer}>
      <div className={styles.offerHead}>
        <span className={styles.offerName}>Kitchen tap dripping · 2.1 miles off route</span>
        <span className={styles.offerStatus}>
          {QUICK_STOP_STATUS_LABEL.awaiting_customer_payment}
        </span>
      </div>

      <ul className={styles.offerFacts}>
        <li className={styles.fact}>
          <span className={styles.factLabel}>Your fee</span>
          <span className={styles.factValue}>$145</span>
        </li>
        <li className={styles.fact}>
          <span className={styles.factLabel}>Arrival window</span>
          <span className={styles.factValue}>Today, 3:00 – 4:00 PM</span>
        </li>
        <li className={styles.fact}>
          <span className={styles.factLabel}>Visit length</span>
          <span className={styles.factValue}>About 45 min</span>
        </li>
        <li className={styles.fact}>
          <span className={styles.factLabel}>Pay window</span>
          <span className={styles.factValue}>{DEFAULT_QUICK_STOP_PAYMENT_DEADLINE_MINS} minutes</span>
        </li>
      </ul>

      <p className={styles.offerNote}>
        <strong>Not on your calendar yet.</strong> You chose the price and the window and sent it.
        The homeowner now has {DEFAULT_QUICK_STOP_PAYMENT_DEADLINE_MINS} minutes to pay. If they
        don’t, the offer expires and your afternoon is exactly as you left it.
      </p>
    </div>
  );
}

/* The lifecycle, with the two places it stops.
 *
 * Statuses come from QUICK_STOP_STATUS_LABEL. The `gate` flag marks the two
 * steps that a human has to clear — the contractor deciding, and the homeowner
 * paying. Nothing in the product advances past either one on a timer, and this
 * list is the plainest way to show that. */
const LIFECYCLE = [
  {
    status: QUICK_STOP_STATUS_LABEL.requested,
    who: 'Homeowner',
    gate: false,
    body: 'A nearby homeowner asks to be fitted in sooner, through your booking page.',
  },
  {
    status: QUICK_STOP_STATUS_LABEL.awaiting_contractor,
    who: 'You',
    gate: true,
    body: 'Before it reaches you it is checked against a fixed list of unsafe and out-of-scope work — gas, carbon monoxide, fire, live electrical, structural, flooding, sewage, hazmat — which is rules rather than judgement, so it cannot be talked around. What survives that waits here for you. Decline it and it ends; ignore it and it expires.',
  },
  {
    status: QUICK_STOP_STATUS_LABEL.contractor_offer_sent,
    who: 'You set the terms',
    gate: false,
    body: 'You chose the fee and the arrival window, and the offer has gone out. This is as far as anything gets on your say-so alone.',
  },
  {
    status: QUICK_STOP_STATUS_LABEL.awaiting_customer_payment,
    who: 'They decide',
    gate: true,
    body: 'The homeowner gets a text with the price, the window and a pay link. It waits for them, and expires if they leave it.',
  },
  {
    status: QUICK_STOP_STATUS_LABEL.confirmed,
    who: 'Payment clears',
    gate: false,
    body: 'Only now does the visit become a real appointment on your calendar. Payment is the thing that books it — there is no other route to this row.',
  },
  {
    status: `${QUICK_STOP_STATUS_LABEL.en_route} → ${QUICK_STOP_STATUS_LABEL.arrived} → ${QUICK_STOP_STATUS_LABEL.completed}`,
    who: 'The visit',
    gate: false,
    body: 'You mark yourself on the way, on site and done, and the homeowner can follow it from their end.',
  },
] as const;

/* The affirmative denial, said as plainly as it can be said. */
const NEVER = [
  {
    title: 'It never books a job on your behalf',
    body: 'There is no auto-accept, no "smart" acceptance, no setting that lets a request skip you. A request sits waiting for your response until you answer it or it expires.',
  },
  {
    title: 'It never puts an unpaid visit on your calendar',
    body: 'Sending an offer creates a placeholder, not an appointment. The visit only becomes a live job on your schedule when the payment clears — one code path, triggered by the payment, and nothing else.',
  },
  {
    title: 'It never sets your price or your hours',
    body: 'The fee, the arrival window, how far you will divert, how long a visit can run and how many you will take in a day are all yours. Quick Stops only offers work that already fits inside them.',
  },
  {
    title: 'It never takes the choice away later',
    body: 'Turning it on does not commit you to anything. You can decline any single request without explanation, and switch the whole thing off for the rest of the day from your day plan.',
  },
] as const;

/* Read off the same constants the rules list and the FAQ both quote, so the
   band a contractor is told about here cannot drift from the one the product
   enforces. Module scope because the FAQ below needs them too. */
const minFee = centsToDollars(DEFAULT_QUICK_STOP_MIN_FEE_CENTS);
const maxFee = centsToDollars(DEFAULT_QUICK_STOP_MAX_FEE_CENTS);

/* Answers checked against the product: the fee band, the detour limit, the
   visit ceiling and the daily cap are the same constants the rules list reads,
   the payment deadline is DEFAULT_QUICK_STOP_PAYMENT_DEADLINE_MINS, and the
   excluded work is the fixed screening list the lifecycle section describes.
   Nothing here promises a capability the page has not already shown. */
const FAQ: { q: string; a: string }[] = [
  {
    q: 'What does a Quick Stop cost me?',
    a: `Nothing to offer one. You set the price the homeowner pays, anywhere in the $${minFee} to $${maxFee} band, and you pay the same platform fee you pay on any other job — only on money you actually collect, plus Stripe's ${STRIPE_PROCESSING_NOTE}.`,
  },
  {
    q: 'What if the homeowner cancels, or I can’t make it?',
    a: `The homeowner has paid before the stop exists, so a cancellation is a refund rather than an argument about a no-show. If you cannot make it, you cancel the stop and they are refunded in full — you are never holding money for a visit that did not happen.`,
  },
  {
    q: 'Where do the requests come from?',
    a: 'Your own site. These are homeowners who asked you for work through your intake form and happen to be near a job already on your schedule — not a shared pool, and not somebody else’s leads resold to several contractors at once.',
  },
  {
    q: 'What work is never offered as a Quick Stop?',
    a: 'A fixed list of unsafe and out-of-scope work is screened out before you ever see it — gas leaks, live electrical faults, anything that needs a permit pulled, and anything that plainly cannot be finished in a single short visit. That list is not a setting; it is the same for everybody.',
  },
  {
    q: 'Does it run when I am not looking at it?',
    a: `No. The switch sits on your day plan and it is off until you turn it on, it applies to that day, and it never books anything by itself — an offer you send lapses after ${DEFAULT_QUICK_STOP_PAYMENT_DEADLINE_MINS} minutes if the homeowner does not pay, and you never hear about it again.`,
  },
];

export default function QuickStopsPage() {

  return (
    <FeatureDetailLayout
      eyebrow="New revenue from the route you already drive"
      /* "Turn gaps in the day into prepaid work nearby" makes the reader do the
         arithmetic. "Fill schedule gaps with prepaid jobs nearby" is the same
         sentence with the verb pointed at the thing they want. */
      title={
        <>
          Fill schedule gaps with <em>prepaid jobs nearby.</em>
        </>
      }
      lede="See requests close to jobs already on your schedule. You choose the price and arrival window, then send an offer. It only becomes a job after the homeowner pays."
      /* The old note said the approval and payment promises a second time, two
         lines under the lede that had just made them. Under the buttons, where
         somebody is deciding whether to press one, the three facts that matter
         are what it costs, who is in control and when it becomes real. */
      heroNote="No subscription · You approve every request · Nothing books until payment"
      /* "Build my free site" is the cluster's default and it is the wrong ask
         here: somebody reading about prepaid work between jobs is evaluating a
         revenue idea, not a website. Same free account either way; the words
         are the ones they came for. */
      primary={{ label: 'Start free with Quick Stops' }}
      secondary={{ label: 'See the 3-step flow', href: '#how-it-works' }}
      demo={
        <ExampleFrame
          label="An offer you have sent, waiting on payment"
          note="Sample job and fee. The status and the pay window are the product’s real ones."
        >
          <PendingOffer />
        </ExampleFrame>
      }
      proof={[
        {
          title: 'Route-aware',
          body: 'See work close to jobs already on the schedule.',
        },
        {
          title: 'Always optional',
          body: 'You decide whether an opportunity fits the day.',
        },
        {
          title: 'Your price',
          body: 'Choose the amount and arrival window before sending.',
        },
        {
          title: 'Prepaid to confirm',
          body: 'Nothing is added to the route until payment.',
        },
      ]}
      story={{
        eyebrow: 'Fill the gaps without losing control',
        title: 'A small detour can become productive revenue.',
        body: 'A cancellation, early finish or open window does not have to become dead time. Quick Stops lets you create a tightly controlled offer for a nearby homeowner while protecting the route you already planned.',
      }}
      /* FOUR BECAME THREE. "Protect the schedule" and "avoid speculative
         driving" are the same promise — nothing enters your day that you did
         not approve and that has not been paid for — and the page makes it
         three more times below. Said once, properly. */
      benefits={[
        {
          title: 'Nothing enters your day uninvited',
          body: 'Only requests that fit the location and the time window you chose are put in front of you, and the customer pays before the visit is added to anything. Declining costs one tap and no explanation.',
        },
        {
          title: 'You price the detour',
          body: 'Set the fee that makes the trip worth taking. It is your price on your window, not a marketplace rate somebody else set.',
        },
        {
          title: 'A better answer for a nearby homeowner',
          body: 'Somebody two streets away gets a real arrival window and a price instead of an open-ended promise to call them back.',
        },
      ]}
      stepsTitle="You approve the job, the price and the detour. The homeowner confirms with payment."
      /* SEVEN BECAME THREE.
         "Spot an opening", "a nearby request is screened in", "review nearby
         demand", "set the offer", "the offer goes to the homeowner", "they pay
         or it expires", "go only when paid" is one flow described at the
         resolution of a spec. Three of those seven are the screening rules,
         which have their own section; two more are halves of the same beat.
         What a contractor needs to picture is: something nearby matches, you
         name your terms, they pay. */
      steps={[
        {
          title: 'A nearby request matches your rules',
          body: 'A request close to your route is checked against the location and time limits you set, and against a fixed list of unsafe and out-of-scope work. Only what passes both is put in front of you — with the job, the photos, roughly how long it should take and how far off your route it sits.',
        },
        {
          title: 'You choose the price and the window',
          body: `Set the service price and the arrival window, then send the offer. Sending it commits you to nothing: until they pay, your day is unchanged, and the offer lapses on its own after ${DEFAULT_QUICK_STOP_PAYMENT_DEADLINE_MINS} minutes if they do not take it.`,
        },
        {
          title: 'They pay, and the stop is booked',
          body: 'The visit reaches your calendar after the homeowner has completed payment — never before it.',
        },
      ]}
      cta={{
        title: 'Make the route you already drive earn more.',
        note: `No monthly fee. You pay a small platform fee only on money you actually collect, plus Stripe’s ${STRIPE_PROCESSING_NOTE}.`,
      }}
    >
      {/* The hero's second button lands here, so the section needs a name a
          fragment can address. */}
      <section className="section-block" id="how-it-works" aria-labelledby="quick-stops-lifecycle-title">
        <div>
          <p className="eyebrow">Where a request can stop</p>
          <h2 id="quick-stops-lifecycle-title">Two gates, and both of them are people.</h2>
          <p>
            This is the actual sequence a request moves through, with the two steps that need a
            human marked. A request that reaches neither gate simply ends — no visit, no charge, no
            entry on anyone’s calendar.
          </p>
        </div>

        <ol className={styles.ladder}>
          {LIFECYCLE.map((step) => (
            <li key={step.status} className={styles.rung} data-gate={String(step.gate)}>
              <span className={styles.rungStatus}>
                {step.status}
                <span className={styles.rungWho}>{step.gate ? `Waits for: ${step.who}` : step.who}</span>
              </span>
              <p className={styles.rungBody}>{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="section-block" aria-labelledby="quick-stops-rules-title">
        <div>
          <p className="eyebrow">You stay in control</p>
          <h2 id="quick-stops-rules-title">Nothing is offered to you that breaks your own limits.</h2>
          <p>
            It is worth being blunt, because &ldquo;paid work, nearby, sooner&rdquo; sounds like the
            sort of thing that fills your calendar while you are under a sink. It does not. These
            are the starting values, every one of them is yours to change, and a request that falls
            outside them never becomes a Quick Stop in the first place — so the requests you do see
            are ones you might genuinely say yes to.
          </p>
        </div>

        <ul className={styles.denial}>
          {NEVER.map((item) => (
            <li key={item.title} className={styles.never}>
              <span className={styles.neverMark} aria-hidden="true">
                Never
              </span>
              <h3 className={styles.neverTitle}>{item.title}</h3>
              <p className={styles.neverBody}>{item.body}</p>
            </li>
          ))}
        </ul>

        <ul className={styles.rules}>
          <li className={styles.rule}>
            <span className={styles.ruleValue}>
              ${minFee} – ${maxFee}
            </span>
            <span className={styles.ruleLabel}>Fee band you can charge for a stop</span>
          </li>
          <li className={styles.rule}>
            <span className={styles.ruleValue}>{DEFAULT_QUICK_STOP_MAX_DETOUR_MILES} miles</span>
            <span className={styles.ruleLabel}>Furthest you will divert from the route</span>
          </li>
          <li className={styles.rule}>
            <span className={styles.ruleValue}>{DEFAULT_QUICK_STOP_MAX_VISIT_MINUTES} min</span>
            <span className={styles.ruleLabel}>Longest a single visit may run</span>
          </li>
          <li className={styles.rule}>
            <span className={styles.ruleValue}>{DEFAULT_QUICK_STOP_MAX_PER_DAY} a day</span>
            <span className={styles.ruleLabel}>Most you will ever be offered in one day</span>
          </li>
        </ul>

        <p className={styles.sectionNote}>
          The switch itself sits on your day plan, next to the schedule it would affect — because
          whether you want another job squeezed into today is a decision about today, not a setting
          to go hunting for.
        </p>

        <ExampleFrame
          label="The Quick Stops switch, on your day plan"
          variant="plain"
          note="Shown before setup. Once your fee band and limits are set, this becomes a straight on/off switch you can flip for the rest of the day."
        >
          {/* `inert`: this is a marketing page. The real panel's button is a
              link into the gated dashboard, and a signed-out visitor who
              tabbed to it would land on the login wall from inside an
              "Example" frame. */}
          <QuickStopPanel
            enabled={false}
            locked={false}
            lockedUntil={null}
            configured={false}
            todayCount={0}
            inert
          />
        </ExampleFrame>
      </section>

      {/* <details> rather than a script: it works before hydration, it is in
          the tab order for free, and the browser's own find-in-page opens it.
          No `name`, so reading one answer never closes another. */}
      <section className="section-block" aria-labelledby="quick-stops-faq-title">
        <div>
          <p className="eyebrow">Before you switch it on</p>
          <h2 id="quick-stops-faq-title">The questions contractors ask us.</h2>
        </div>

        <div className={styles.faq}>
          {FAQ.map((item, index) => (
            <details key={item.q} open={index === 0}>
              <summary>
                <span>{item.q}</span>
                <i aria-hidden="true" />
              </summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </FeatureDetailLayout>
  );
}
