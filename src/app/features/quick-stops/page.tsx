import type { Metadata } from 'next';
import FeatureDetailLayout from '@/components/marketing/feature-detail-layout';
import ExampleFrame from '@/components/marketing/example-frame';
import QuickStopPanel from '@/components/quick-stop-panel';
import { QuickStopIcon } from '@/components/quick-stop-icons';
import QuickStopHeroSimulation from './QuickStopHeroSimulation';
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
  // 56 chars became 75 with the layout's " · Let's Get Quoted" suffix, so
  // Google cut it mid-phrase. The words that had to survive are the ones
  // somebody would search — "paid priority visits" — not our product name.
  title: 'Paid Priority Visits for Contractors',
  description:
    'Get paid to fit nearby customers into today’s route. You set the fee and the arrival window; they pay it to reserve the visit. Service is billed separately.',
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
    title: 'Get paid to fit nearby customers into today’s route.',
    description:
      'You set the priority visit fee and the arrival window. The homeowner pays that fee to reserve the visit — service, labor and parts are charged separately, on top.',
    images: [{ url: '/features/og-quick-stops.jpg', width: 1200, height: 630, alt: 'Let’s Get Quoted Quick Stops: paid priority visits for contractors' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Get paid to fit nearby customers into today’s route.',
    description:
      'You set the priority visit fee and the arrival window. The homeowner pays that fee to reserve the visit — service, labor and parts are charged separately, on top.',
    images: ['/features/og-quick-stops.jpg'],
  },
};

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
    body: 'You chose the priority visit fee and the arrival window, and the offer has gone out. This is as far as anything gets on your say-so alone.',
  },
  {
    status: QUICK_STOP_STATUS_LABEL.awaiting_customer_payment,
    who: 'They decide',
    gate: true,
    body: 'The homeowner gets a text naming the priority visit fee, the window and a pay link, and saying that service is charged separately. It waits for them, and expires if they leave it.',
  },
  {
    status: QUICK_STOP_STATUS_LABEL.confirmed,
    who: 'Fee clears',
    gate: false,
    body: 'Only now does the visit become a real appointment on your calendar. The visit fee is the thing that books it — there is no other route to this row. What the work costs is still to be agreed on site.',
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
    body: 'The priority fee, the arrival window, how far you will divert, how long a visit can run and how many you will take in a day are all yours — and so is everything you charge for the work itself, which Quick Stops has no opinion about at all.',
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

/* A "typical fee" — the middle of the band — used to be derived here, purely to
   feed the yearly multiplication that has been removed. The band itself is what
   a contractor needs, and they set the number per request anyway. */

/* The four things a contractor is promised, and the four beats of the flow.
 *
 * Lifted from the explainer on /dashboard/quick-stops, which is the version a
 * contractor sees once they are inside. A visitor deciding whether to sign up
 * and an owner deciding whether to switch it on are asking the same question,
 * and there is no honest reason for the answer to be two different documents.
 *
 * The wording is theirs. "Priority area you've drawn" and "texted and emailed
 * the moment it lands" are both facts this page did not previously carry. */
const PROMISES = [
  'You approve every request',
  'You set the time',
  'You set the priority visit fee',
  'The window is confirmed when the fee is paid',
] as const;

const FLOW = [
  {
    icon: 'route',
    title: 'We find the right jobs',
    body: 'Customers near your route that day are offered it — plus anyone inside a priority area you have drawn, which is how you say “this neighbourhood is worth the extra drive”.',
  },
  {
    icon: 'bell',
    title: 'You get the request',
    body: 'The job, the address, the customer’s details and how far off your route they are — texted and emailed to you the moment it lands.',
  },
  {
    icon: 'tag',
    title: 'You set the terms',
    body: 'Pick the arrival window and the priority visit fee that makes the detour worth taking. Or decline, and it stays an ordinary lead.',
  },
  {
    icon: 'check',
    title: 'They pay the visit fee',
    body: 'The fee reserves the window and nothing else — the work is quoted and invoiced as usual. Or they skip it and carry on as a normal inquiry. Either way you keep the lead.',
  },
] as const;

/* Answers checked against the product: the fee band, the detour limit, the
   visit ceiling and the daily cap are the same constants the rules list reads,
   the payment deadline is DEFAULT_QUICK_STOP_PAYMENT_DEADLINE_MINS, and the
   excluded work is the fixed screening list the lifecycle section describes.
   Nothing here promises a capability the page has not already shown. */
const FAQ: { q: string; a: string }[] = [
  {
    q: 'What exactly is the homeowner paying for?',
    a: `The priority visit: a place in today's route and an arrival window. It is not a payment toward the repair. You quote and invoice the service — diagnosis, labor, parts — exactly as you would on any other job, and that invoice is on top of the fee. The one exception is a diagnostic conversion: if you propose turning the visit into a paid diagnostic while you are there, the fee they already paid comes off that total and they pay the difference. Their own status page says so in those words.`,
  },
  {
    q: 'What does a Quick Stop cost me?',
    a: `Nothing to offer one. You set the priority visit fee the homeowner pays, anywhere in the $${minFee} to $${maxFee} band, and you pay the same platform fee you pay on any other job — only on money you actually collect, plus Stripe's ${STRIPE_PROCESSING_NOTE}.`,
  },
  {
    q: 'What if the homeowner cancels, or I can’t make it?',
    a: `The visit fee is paid before the stop exists, so a cancellation is a refund rather than an argument about a no-show. If you cannot make it, you cancel the stop and they are refunded in full — you are never holding a visit fee for a visit that did not happen.`,
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
    a: `No. The switch sits on your day plan and it is off until you turn it on, it applies to that day, and it never books anything by itself — an offer you send lapses after ${DEFAULT_QUICK_STOP_PAYMENT_DEADLINE_MINS} minutes if the homeowner does not pay the visit fee, and you never hear about it again.`,
  },
];

export default function QuickStopsPage() {

  return (
    <FeatureDetailLayout
      eyebrow="Customers pay more to be seen sooner"
      /* WHAT THE MONEY IS FOR, IN THE FIRST SENTENCE.
         This page used to be headed "Fill schedule gaps with prepaid jobs
         nearby", and "prepaid job" is the one thing a Quick Stop is not. The
         homeowner is paying for a PRIORITY VISIT — a place in today's route and
         an arrival window — and the work itself is quoted and invoiced exactly
         as it would be on any other job.
         That is not a wording preference. A homeowner who thinks $145 covered
         the repair is a refund request, a chargeback, and a contractor standing
         in a kitchen having an argument we caused. The headline no longer
         carries the distinction itself — it carries the OFFER, which is what
         somebody landing here has not yet been sold — so the trust line under
         the buttons makes it, the simulation makes it again in the homeowner's
         own view ("Service work is priced separately"), and the two-card split
         further down makes it at length. Three places, none of them optional. */
      title={<>Let customers pay you extra for a <em>high-priority stop.</em></>}
      lede={
        <>
          When a customer wants to be seen sooner, reply with the fee that makes the stop worth it.
          We show them your soonest arrival, and they can pay for priority or schedule a regular
          visit.
        </>
      }
      heroNote={<>You set the priority fee · Customer pays before you go · Service is charged separately</>}
      /* THE DEMO LEADS, BECAUSE THE CONCEPT IS UNFAMILIAR. Every other page
         here sells something a contractor already does by hand; this one sells
         an idea most of them have never had — a paid priority visit slotted
         into a route that is already running. Asking somebody to open an
         account before they understand what they are opening it for is asking
         in the wrong order. */
      primary={{ label: 'See Quick Stops in the demo', href: '/demo/quick-stops' }}
      secondary={{ label: 'See how the fee works', href: '#how-it-works' }}
      /* THE EXCHANGE, PLAYED, RATHER THAN ITS LAST FRAME PRINTED.
         What was here was a card of an offer already sent, parked at "awaiting
         payment" — the END of the mechanism, shown to somebody who had not yet
         been told what the mechanism is. And it put a lone "$145" in the hero,
         which is the page's oldest failure mode: one number on a page is read
         as the price of the thing on the page.
         The simulation answers both. The fee is a number the VISITOR types, so
         it reads as theirs to set rather than as ours to quote, and the panel
         only shows it beside "Service work is priced separately" in the
         homeowner's own view.
         NO ExampleFrame, on request: no caption above the panel and no status
         row below it. The one lower down the page keeps that convention for the
         mock that needs it — this one invents nothing a visitor could mistake
         for a real account, since they have just typed half of it themselves. */
      demo={<QuickStopHeroSimulation />}
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
          title: 'Your fee',
          body: 'Set the priority visit fee and the arrival window before sending.',
        },
        {
          title: 'Paid before you go',
          body: 'The window is confirmed when the visit fee is paid. Service is billed separately.',
        },
      ]}
      story={{
        eyebrow: 'Fill the gaps without losing control',
        title: 'A small detour, paid for before you make it.',
        body: 'A cancellation, early finish or open window does not have to become dead time. Quick Stops lets you sell the one thing a nearby homeowner actually wants — sooner — at a fee you set, on top of whatever the work itself comes to.',
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
          title: 'You price the detour, not the work',
          body: 'The priority fee is what the trip is worth to you — your number on your window, not a marketplace rate somebody else set. What the job comes to is a separate question you answer the way you always have.',
        },
        {
          title: 'A better answer for a nearby homeowner',
          body: 'Somebody two streets away gets a real arrival window today instead of an open-ended promise to call them back — and they are told plainly what the fee does and does not cover before they pay it.',
        },
      ]}
      /* THE STEPS SECTION IS GONE, AND THE FLOW BELOW REPLACED IT.
         It held the same sequence in three beats. Keeping both would have put
         two flows and a six-rung lifecycle ladder on one page — the third
         telling of one story. What the four-beat version adds is where the
         work comes from (route plus a priority area you drew) and that the
         request is texted and emailed the moment it lands, neither of which
         this page carried. What the three said and it does not — the screening
         list, and an offer lapsing on its own — is the lifecycle ladder's
         subject a section further down, said there at full length. */
      afterBenefits={
        <section className={styles.pitch} id="how-it-works" aria-labelledby="quick-stops-pitch-title">
          <div className={styles.pitchGrid}>
            <div>
              <p className={styles.kicker}>
                <QuickStopIcon name="spark" /> Matched to the route you&rsquo;re already driving
              </p>
              <h2 id="quick-stops-pitch-title" className={styles.pitchTitle}>
                Earn more from customers willing to <span className={styles.accent}>pay for speed</span>
              </h2>
              <p className={styles.pitchLede}>
                Quick Stops lets nearby customers pay a fee to be fitted in sooner than your normal
                schedule. You review the request, choose the arrival window, set the priority visit
                fee, and accept only when it suits you. The fee is on top of the work itself, which
                you quote and invoice as usual.
              </p>

              <ul className={styles.promises}>
                {PROMISES.map((promise) => (
                  <li key={promise}>
                    <QuickStopIcon name="check" /> {promise}
                  </li>
                ))}
              </ul>

              {/* No button. The hero is two sections up with the same ask on it,
                  and the closing band carries it again — a third identical
                  offer between them is not a third chance, it is noise. This
                  line is the part that was doing work: it answers "what am I
                  committing to", which is the question the promises raise. */}
              <p className={styles.pitchNote}>
                Pause or change it whenever you like.
              </p>
            </div>

            {/* THE ARITHMETIC IS GONE, and it should not come back.

                It read "$150 priority visit fee … one a week for a year is
                $7,800 in visit fees alone", under three sentences of hedging
                that it was a multiplication rather than a projection. All of
                that hedging was true and none of it works: a dollar figure of
                that size on a page selling a revenue idea is read as what you
                will make, and the caveats are read as small print. It had
                already been demoted once — from a glowing card on the dashboard
                to the smallest type in this block — which is the tell that the
                problem was the number and not its styling.

                Everything the reader actually needs is still here and is not a
                guess: the fee band, that they set the fee per request, and the
                split below showing what the fee buys and what it does not. */}
          </div>

          {/* THE DISTINCTION, DRAWN RATHER THAN STATED.
              Every sentence on this page can say "the fee is separate" and a
              skim will still take "$145" as the price of the visit, because a
              single number on a page is read as the price of the thing on the
              page. Two boxes with one number between them cannot be skimmed
              that way. */}
          <h3 className={styles.flowTitle}>What the homeowner pays, and for what</h3>
          <div className={styles.split}>
            <div className={styles.splitCard} data-lead="true">
              <p className={styles.splitTag}>Paid now</p>
              <p className={styles.splitTitle}>The priority visit fee</p>
              <p className={styles.splitBody}>
                Your number, anywhere in the ${minFee}&ndash;${maxFee} band. It buys a place in
                today&rsquo;s route and an arrival window, and it is paid before you set off.
              </p>
            </div>
            <p className={styles.splitPlus} aria-hidden="true">+</p>
            <div className={styles.splitCard}>
              <p className={styles.splitTag}>Priced separately</p>
              <p className={styles.splitTitle}>The service charge</p>
              <p className={styles.splitBody}>
                Diagnosis, labor, parts, the repair. Quoted and invoiced the way you do it on every
                other job — Quick Stops has no opinion about what you charge for the work.
              </p>
            </div>
          </div>
          {/* The first sentence used to be "The visit fee gets you to their
              door. It does not pay for the service." — which is the two cards
              above, restated in prose immediately under them. The exception is
              the only part that was new, so it is the only part left. */}
          <p className={styles.splitNote}>
            <span>
              One exception, and the product says so on the homeowner&rsquo;s own screen: if you
              propose turning the visit into a paid diagnostic, the fee they have already paid comes
              off that total and they pay only the difference.
            </span>
          </p>

          <h3 className={styles.flowTitle}>The flow, start to finish</h3>
          <ol className={styles.flow}>
            {FLOW.map((step, index) => (
              <li key={step.title} className={styles.flowStep}>
                <span className={styles.flowBadge}>
                  <QuickStopIcon name={step.icon} className={styles.flowIcon} />
                  {/* Rhythm, not information — the heading carries the meaning
                      and "1 We find the right jobs" read aloud is noise. */}
                  <span className={styles.flowNum} aria-hidden="true">
                    {index + 1}
                  </span>
                </span>
                <strong>{step.title}</strong>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </section>
      }
      cta={{
        title: 'Make the route you already drive earn more.',
        note: `No monthly fee. You pay a small platform fee only on money you actually collect — the visit fee and the invoice alike — plus Stripe’s ${STRIPE_PROCESSING_NOTE}.`,
      }}
    >
      {/* #how-it-works moved up to the flow, which is what that fragment
          promises. This keeps an addressable name of its own — the ladder is
          the page's answer to "where can it stop", not to "how does it work". */}
      <section className="section-block" id="two-gates" aria-labelledby="quick-stops-lifecycle-title">
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
            <span className={styles.ruleLabel}>Priority visit fee you can charge, before the work</span>
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
