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

export default function QuickStopsPage() {
  const minFee = centsToDollars(DEFAULT_QUICK_STOP_MIN_FEE_CENTS);
  const maxFee = centsToDollars(DEFAULT_QUICK_STOP_MAX_FEE_CENTS);

  return (
    <FeatureDetailLayout
      eyebrow="New revenue hiding inside today’s route"
      title={
        <>
          Turn gaps in the day into <em>prepaid work nearby.</em>
        </>
      }
      lede="Quick Stops helps you spot a nearby request, choose the arrival window and price, and offer it. The stop becomes real only after the homeowner pays."
      heroNote="Quick Stops never books anything on your behalf. Every request waits for you to approve it, and nothing reaches your calendar until the homeowner has paid."
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
      benefits={[
        {
          title: 'Protect the schedule',
          body: 'Only consider requests that fit the location and time window you choose.',
        },
        {
          title: 'Price the convenience',
          body: 'Set a clear Quick Stop fee that makes the detour worthwhile.',
        },
        {
          title: 'Avoid speculative driving',
          body: 'The customer pays before the visit is added to your day.',
        },
        {
          title: 'Create a better local experience',
          body: 'Nearby homeowners get a clear way to be seen sooner, without an open-ended arrival promise.',
        },
      ]}
      stepsTitle="You approve the job, the price and the detour. The homeowner confirms with payment."
      steps={[
        {
          title: 'Spot an opening',
          body: 'Use an unscheduled window, cancellation or early finish.',
        },
        {
          title: 'A nearby request is screened in',
          body: 'A request close to your route is checked against your rules and against a fixed list of unsafe and out-of-scope work. Only what passes both is put in front of you.',
        },
        {
          title: 'Review nearby demand',
          body: 'See a relevant request close to the current route — the job, the photos, roughly how long it should take and how far off your route it sits. Declining costs you one tap and no explanation.',
        },
        {
          title: 'Set the offer',
          body: 'Choose the service price and arrival window.',
        },
        {
          title: 'The offer goes to the homeowner',
          body: 'They get a text with your price, your window and a link to pay. Sending it commits you to nothing: until they pay, your day is unchanged.',
        },
        {
          title: 'They pay, or it expires',
          body: `The offer holds for ${DEFAULT_QUICK_STOP_PAYMENT_DEADLINE_MINS} minutes by default. If the homeowner doesn’t take it, it lapses on its own and you never hear about it again.`,
        },
        {
          title: 'Go only when paid',
          body: 'The stop is confirmed after the homeowner completes payment.',
        },
      ]}
      cta={{
        title: 'Make the route you already drive earn more.',
        note: `No monthly fee. You pay a small platform fee only on money you actually collect, plus Stripe’s ${STRIPE_PROCESSING_NOTE}.`,
      }}
    >
      <section className="section-block" aria-labelledby="quick-stops-never-title">
        <div>
          <p className="eyebrow">Say the quiet part out loud</p>
          <h2 id="quick-stops-never-title">Quick Stops is not automatic booking.</h2>
          <p>
            It is worth being blunt about this, because &ldquo;paid work, nearby, sooner&rdquo; sounds
            like the sort of thing that fills your calendar while you are under a sink. It does not.
            Every Quick Stop passes through two people before it exists, and you are the first of
            them.
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
      </section>

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
          <p className="eyebrow">Your rules, set once</p>
          <h2 id="quick-stops-rules-title">Nothing is offered to you that breaks your own limits.</h2>
          <p>
            These are the starting values. Every one of them is yours to change, and a request that
            falls outside them never becomes a Quick Stop in the first place — so the requests you
            do see are ones you might genuinely say yes to.
          </p>
        </div>

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
    </FeatureDetailLayout>
  );
}
