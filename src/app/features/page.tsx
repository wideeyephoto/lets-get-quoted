/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  PageCTA,
  SiteFooter,
  SiteHeader,
  SIGNUP_LABEL,
  SIGNUP_URL,
} from '@/components/flagship/site-chrome';
import { FEE_TIERS, STRIPE_PROCESSING_NOTE } from '@/lib/pricing';
import { FEATURE_COUNT } from '@/lib/features';
import { TRADES } from '@/lib/trades';
import {
  HERO_THREAD,
  HERO_THREAD_CLIENT,
  HERO_THREAD_FIRST,
  HERO_THREAD_JOB,
} from './hero-thread';
import styles from '@/components/flagship/flagship.module.css';
import JobRecordStages from './job-record-stages';

/**
 * The Product page, in the standalone site's visual language.
 *
 * This page used to render in the app's own design system. It was measurably
 * more decorated than the site it was drawn from — more layered shadows, more
 * heavy weights — and still read flatter, for two reasons that are not about
 * decoration at all: it ran dark from header to footer where the source breaks
 * its pages with light sections, and its product panels sat flat-on where the
 * source tilts them in space. Both are structural, so the page adopts the
 * source language rather than borrowing two tricks from it.
 *
 * THE HERO IS NO LONGER THE SOURCE'S. It carried a five-card strip of stage
 * names under the copy, tilted, with two notification cards floating over it.
 * Measured at 1440 the alert covered stages 04 AND 05 — a five-step story
 * hiding the two steps it was building to — and the paid card covered the job
 * record, so "Kitchen lighting upgrade" rendered as "...ograde". Underneath
 * that, five equal boxes made five equal claims and none of them was large
 * enough to read as software.
 *
 * It is a thread beside the copy now: one job, running past the reader, with
 * the real outgoing texts in it. See hero-thread.ts for where the words come
 * from and §104 of the generator for the layout.
 */

export const metadata: Metadata = {
  title: 'Features',
  description:
    'Explore the complete no-subscription contractor suite — from website and AI intake to quoting, scheduling, crews and payments, all on one connected job record.',
  alternates: { canonical: 'https://letsgetquoted.com/features' },
};

// Read from the one place the rates are defined; /pricing and the calculator
// read the same array, so this page cannot drift from them.
const HIGHEST_FEE = FEE_TIERS[0].rate;
const LOWEST_FEE = FEE_TIERS[FEE_TIERS.length - 1].rate;

/**
 * THE PROOF STRIP, AND WHY IT IS FOUR FACTS RATHER THAN FOUR NUMBERS.
 *
 * A page that says "turn more leads into paid jobs" and then shows nothing but
 * more of its own claims is asking to be taken on faith. The obvious fix is a
 * strip of outcomes — leads won, revenue added, stars — and we do not have one
 * of those we could stand behind: no testimonial we have permission to quote,
 * no cohort, no measured conversion lift. An invented one is the fastest way to
 * lose everything else on the page.
 *
 * So every cell here is a fact about the PRODUCT, and every one is read out of
 * the code rather than typed here: the trade count is TRADES, the feature count
 * is lib/features.ts, and the rates are FEE_TIERS. They cannot drift, and none
 * of them claims anything about anybody's business but ours.
 */
const PROOF: { stat: string; label: string }[] = [
  { stat: `${TRADES.length} trades`, label: 'Pages, FAQs and intake questions written for yours' },
  { stat: '$0 a month', label: 'No card and no setup fee to open an account' },
  { stat: `${LOWEST_FEE}–${HIGHEST_FEE}`, label: 'Charged only when a homeowner actually pays you' },
  { stat: `${FEATURE_COUNT} features`, label: 'Every account opens with all of them — there is no upgrade tier' },
];

/**
 * The objections, answered where they are raised.
 *
 * Every answer here is checkable against the product rather than against the
 * pitch: the fee model is FEE_TIERS and it is marginal across brackets, Stripe
 * pays the contractor's own connected account, the free subdomain publishes
 * without waiting on DNS, and the custom domain is registered in the
 * contractor's name (lib/domains.ts). Nothing below promises a capability the
 * rest of the page has not already shown.
 */
const FAQ: { q: string; a: string }[] = [
  {
    q: 'What exactly does the platform fee cost me?',
    a: `It starts at ${HIGHEST_FEE} of a payment and falls to ${LOWEST_FEE} as your yearly volume grows — charged in brackets, like tax, so only the part of your volume inside a bracket pays that bracket's rate. It applies to payments a homeowner makes through the platform, and to nothing else: no subscription, no setup fee, no per-user charge, and nothing at all in a month you collect nothing. Card processing (${STRIPE_PROCESSING_NOTE}) is separate and goes to Stripe.`,
  },
  {
    q: 'Can I use the domain I already own?',
    a: 'Yes. You publish immediately on the included letsgetquoted.com subdomain, then point your own domain at the site with one CNAME whenever you are ready — publishing never waits on DNS. You buy and hold the registration yourself, in your own name; we never own the address your trucks and invoices carry.',
  },
  {
    q: 'How long does setup actually take?',
    a: 'Your business name, your trade and the towns you cover are enough to generate the whole site — pages, services, FAQs and the instant estimate — in one sitting. Everything it writes stays editable, before it goes live and afterwards.',
  },
  {
    q: 'Who owns my customers and my job history?',
    a: 'You do. There is no contract and no lock-in period. Your clients, quotes, jobs, messages and payment history are your records, your custom domain stays registered to you, and leaving does not cost you the address your customers already know.',
  },
  {
    q: 'How do payments work — do you hold my money?',
    a: 'No. Payments run on Stripe into your own connected account, so the money goes from the homeowner to you and settles on Stripe’s normal payout schedule. We never see card numbers and never hold your balance; the platform fee comes out of the payment as it clears.',
  },
  {
    q: 'Can I start with just the website and add the rest later?',
    a: 'Yes, and most people do. The site and the instant estimate are useful on their own from the first day. Quotes, scheduling, crew, texting and payments are already in the same account waiting — you turn to them when you need them, not when a plan says you have to.',
  },
];

/**
 * THE `id` IS PART OF THE CONTRACT, NOT DECORATION.
 *
 * The homepage's four-cell strip under the hero links straight at these cards
 * — /features#website-builder and so on — so a visitor who reads "Website
 * included · One-click AI builder" lands on the card that expands it, with the
 * other four in view. The ids match the deep-page slugs where there is one; the
 * two that differ (smart-intake, whose page is /features/ai-intake) do so
 * because the homepage names the feature "Smart Intake".
 *
 * Renaming an id here breaks a homepage link silently. There is a test that
 * asserts every homepage anchor resolves to an id on this page.
 */
type Flagship = {
  number: string;
  id: string;
  title: string;
  body: string;
  href: string;
  kicker: string;
  /**
   * WHAT THE FEATURE HANDS YOU, in the software's own nouns.
   *
   * Each card was a number, a label, a sentence and 65px of nothing — five
   * claims a visitor had to take on faith, on a page whose whole argument is
   * that the parts connect. These are not benefits restated; they are the
   * things that exist in the product once the feature runs, which is the
   * shortest honest way to show a feature on a page with no screenshots.
   */
  produces: [string, string, string];
};

/* THE FIVE ARE THE JOURNEY NOW, IN THE ORDER A JOB ACTUALLY MOVES.
 *
 * The heading over them has always promised "win better leads, quote faster,
 * keep the crew moving, and get paid" — and quoting, scheduling and getting
 * paid had no card of their own. Three of the four things the heading sells
 * were inside a card called "Connected back office", while position 03, in the
 * middle of the run, was Quick Stops: a real feature, and one that happens
 * BETWEEN jobs rather than during one. A visitor reading down for "how do I
 * send a quote" found the sales pitch for a route add-on instead.
 *
 * So the five are the five stages, Quick Stops has its own band underneath
 * (where being a different KIND of thing is the point rather than a break in
 * the sequence), and the back office is the cream section below — which is
 * what that section already shows.
 *
 * THE IDS DID NOT ALL SURVIVE, and that is deliberate rather than careless:
 * `back-office` and `quick-stops` are no longer FLAGSHIPS entries. The homepage
 * links at BOTH by path (/features/back-office, /features/quick-stops), never
 * by fragment, so nothing breaks; the one fragment the homepage uses is
 * #website-builder, which is still here. The Quick Stops band still carries
 * id="quick-stops" so an old link lands somewhere true.
 */
const FLAGSHIPS: Flagship[] = [
  {
    number: '01',
    id: 'website-builder',
    title: 'Website',
    body: 'Launch a complete, editable contractor site with the instant estimate wired in from day one.',
    href: '/features/website-builder',
    kicker: 'BUILD THE FRONT DOOR',
    produces: ['Trade-matched pages', 'Instant estimate form', 'Your own domain'],
  },
  {
    number: '02',
    id: 'smart-intake',
    title: 'AI intake',
    body: 'Ask the follow-up questions your trade needs, write the job summary, and surface the leads worth answering first.',
    href: '/features/ai-intake',
    kicker: 'QUALIFY THE OPPORTUNITY',
    produces: ['A written job summary', 'Budget and urgency read', 'Leads ranked by value'],
  },
  {
    number: '03',
    id: 'quotes',
    title: 'Quotes and approvals',
    body: 'Send an itemized quote with optional add-ons, take the signature on a phone, and collect the deposit before the truck moves.',
    href: '/features/quotes',
    kicker: 'PRICE IT AND GET IT SIGNED',
    produces: ['Itemized quote with add-ons', 'E-signature on a phone', 'Deposit before scheduling'],
  },
  {
    number: '04',
    id: 'scheduling',
    title: 'Scheduling and crew',
    body: 'Turn an approved quote into a booked day, assign who is going, and plan the route without retyping the job.',
    href: '/features/scheduling',
    kicker: 'PUT IT ON THE CALENDAR',
    produces: ['Approved quote → booked day', 'Crew assigned and tracked', 'Today’s route, planned'],
  },
  {
    number: '05',
    id: 'client-portal',
    title: 'Customer texts and payments',
    body: 'Two-way texting, on-my-way alerts, and one link where the homeowner approves, follows and pays.',
    href: '/features/client-portal',
    kicker: 'KEEP THEM INFORMED AND GET PAID',
    produces: ['Two-way texting', 'On-my-way alerts', 'Deposits, balances and plans'],
  },
];

/* THE OPERATIONAL TOOLS MOVED INTO A COMPONENT.
 *
 * They were four stacked bands here — number, heading, sentence, two or three
 * tool cards, four times. The copy is unchanged and so are the four ids the
 * homepage links to; what changed is that they are now four stages of one job
 * record rather than four sections about four subjects. The data lives beside
 * the component that draws it, in ./job-record-stages.
 */

export default function FeaturesPage() {
  return (
    <main className={`${styles.root} inner-site feature-index-page`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <SiteHeader />

      {/* Two columns, not one. The copy keeps the left and the thread takes the
          right; every child is placed explicitly in the grid rather than
          wrapped in a column div, because .index-hero > h1 and
          .index-hero > p:not(.eyebrow) are load-bearing selectors in the
          generated sheet and a wrapper would silently drop both. */}
      <section className="index-hero index-hero-beside" id="main-content">
        <p className="eyebrow">
          <span aria-hidden="true">✦</span> THE COMPLETE CONTRACTOR WORKFLOW
        </p>
        <h1>
          Turn more website leads into <em>paid jobs</em>—without switching tools.
        </h1>
        <p>
          Your website, AI intake, quotes, scheduling, crew, customer texts and payments stay
          connected in one job record.
        </p>
        <div className="hero-actions">
          {/* Was the app ROOT, which is the sign-in screen — the biggest button
              on the page promised a site and delivered a password field. */}
          <a className="button primary" href={SIGNUP_URL}>
            {SIGNUP_LABEL} <span aria-hidden="true">→</span>
          </a>
          <a className="button secondary" href="#flagship-index">
            See the workflow
          </a>
        </div>

        {/* THE FEE, WHERE THE DECISION IS MADE.
            "No monthly subscription" was the loudest promise on the page and
            the platform fee that pays for it was 4,900px below, in the closing
            band — so a visitor learned the price after deciding, which reads as
            a bait and switch even when every number is true. The rates come
            from FEE_TIERS, so this line cannot drift from /pricing. */}
        <p className="index-hero-fee">
          No card, setup fee, or monthly subscription. A {LOWEST_FEE}–{HIGHEST_FEE} platform fee
          applies only when a homeowner pays you.{' '}
          <Link href="/pricing">See exactly how the fee works</Link>
        </p>

        {/* One job, running past the reader. The bubbles marked `out` are built
            by the same functions that send the real texts — see hero-thread.ts
            for why that is not optional. */}
        <div className="hero-thread">
          <div className="hero-thread-head">
            <span>
              <i aria-hidden="true" /> Job {HERO_THREAD_JOB}
            </span>
            <small>{HERO_THREAD_CLIENT} · Royal Oak</small>
          </div>

          <ol className="hero-thread-rows">
            {HERO_THREAD.map((row) => {
              if (row.kind === 'event') {
                return (
                  <li className={`ht-event ht-${row.tone}`} key={row.id}>
                    <time>{row.time}</time>
                    <span>{row.text}</span>
                  </li>
                );
              }

              if (row.kind === 'intake') {
                return (
                  <li className="ht-intake" key={row.id}>
                    <span className="ht-kicker">Smart Intake read it</span>
                    <p>{row.summary}</p>
                    <div className="ht-signals">
                      {row.signals.map(([label, value]) => (
                        <span key={label}>
                          <small>{label}</small>
                          <b>{value}</b>
                        </span>
                      ))}
                    </div>
                  </li>
                );
              }

              return (
                <li className={`ht-msg ht-${row.kind}`} key={row.id}>
                  {/* Which way a message is travelling is carried by which side
                      of the thread it sits on, and a side is not readable. */}
                  <span className="sr-only">
                    {row.kind === 'out' ? `Sent to ${HERO_THREAD_FIRST}` : `From ${HERO_THREAD_FIRST}`}
                  </span>
                  <p>{row.body}</p>
                  <time>{row.time}</time>
                </li>
              );
            })}
          </ol>

          <Link className="hero-thread-demo" href="/demo">
            Open the live demo <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      {/* Four facts about the product, immediately after the claims that need
          them. Not outcomes, not customers, not stars — see PROOF above for
          why, and for where each number is read from. */}
      <section className="index-proof" aria-label="What an account costs and covers">
        {PROOF.map((cell) => (
          <span key={cell.stat}>
            <b>{cell.stat}</b>
            <small>{cell.label}</small>
          </span>
        ))}
      </section>

      <section className="flagship-index" id="flagship-index">
        <div className="index-heading">
          <p className="eyebrow">
            <span aria-hidden="true">✦</span> FIVE CONNECTED ADVANTAGES
          </p>
          {/* Was "Each feature is useful alone. Together, they change the
              business." — true, and about the software rather than about the
              reader. This says what the five features are FOR, in the order a
              job actually moves. */}
          <h2>
            Win better leads, quote faster,
            <br />
            <em>keep the crew moving, and get paid.</em>
          </h2>
        </div>
        <div className="feature-link-grid">
          {FLAGSHIPS.map(({ number, id, title, body, href, kicker, produces }) => (
            /* The id is on the link itself, so a visitor arriving from the
               homepage lands on the card rather than near it. scroll-margin-top
               keeps it clear of the sticky header — see §96. */
            <Link href={href} key={id} id={id}>
              <span>{number}</span>
              <small>{kicker}</small>
              <h3>{title}</h3>
              <p>{body}</p>
              {/* A list, not three styled spans: read aloud it is "three items,
                  a written job summary, …", which is the whole point of it. */}
              <ul className="feature-produces" aria-label={`What ${title} gives you`}>
                {produces.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <b>
                Explore feature <span aria-hidden="true">→</span>
              </b>
            </Link>
          ))}
        </div>
      </section>

      {/* QUICK STOPS, ON ITS OWN, BECAUSE IT IS A DIFFERENT KIND OF THING.
          It used to be card 03 of five, between intake and the client portal —
          in the middle of a sequence describing one job moving from a click to
          a payment, on a page whose heading promises quoting. But a Quick Stop
          is not a stage of a job; it is a second, smaller job sold into the gap
          between two others. Below the sequence it reads as the extra it is,
          and the id stays so an old /features#quick-stops link still lands. */}
      <section className="route-band" id="quick-stops" aria-labelledby="route-title">
        <div className="route-copy">
          <p className="eyebrow">
            <span aria-hidden="true">✦</span> EARN MORE FROM EVERY ROUTE
          </p>
          <h2 id="route-title">
            Sell a priority visit to the customer you were <em>already driving past.</em>
          </h2>
          <p>
            A homeowner near today&rsquo;s route asks to be seen sooner. You approve the request,
            set the fee and the window, and they pay for the visit before you go. The work itself is
            quoted and invoiced exactly like any other job.
          </p>
          <Link className="route-link" href="/features/quick-stops">
            Explore Quick Stops <span aria-hidden="true">→</span>
          </Link>
        </div>
        <ul className="route-points">
          <li>
            <b>You approve every request</b>
            <small>Nothing lands on your calendar because somebody paid for it.</small>
          </li>
          <li>
            <b>You set the priority visit fee</b>
            <small>And the radius, the window and how many you will take.</small>
          </li>
          <li>
            <b>Paid before you arrive</b>
            <small>The window is confirmed when the visit fee clears, not before.</small>
          </li>
        </ul>
      </section>

      {/* The light chapter. This is the break the page was missing: it reads as
          a separate chapter on cream instead of as one more dark band.

          It used to be four stacked bands — number, heading, sentence, two or
          three tool cards, four times. Every band was true and none of them
          showed what the section is actually claiming, which is that these are
          not four products but four stages of ONE record. So the record stays
          on screen and the stages move it; see job-record-stages.tsx. */}
      <section className="everything-index" aria-labelledby="everything-title">
        <div className="index-heading">
          <p className="eyebrow">
            <span aria-hidden="true">✦</span> EVERYTHING BEHIND THE WEBSITE
          </p>
          <h2 id="everything-title">
            One job record.<br />Every operational tool included.
          </h2>
          <p>
            Approve the quote once. The schedule, crew, customer updates, payment and follow-up move
            with it.
          </p>
          {/* The claim the old lede made in two sentences, in the place a
              reader is most likely to be doing the sums. */}
          <p className="everything-note">
            <span aria-hidden="true">✓</span> Included from day one · No monthly subscription
          </p>
        </div>

        <JobRecordStages />

        {/* The back office had a card in the five until this pass, and this is
            the section that actually shows it — so the link belongs here rather
            than in a sixth card restating the four stages above it. */}
        <p className="everything-more">
          <Link href="/features/back-office">
            See everything the back office runs <span aria-hidden="true">→</span>
          </Link>
        </p>
      </section>

      {/* THE OBJECTIONS, ANSWERED WHERE THEY ARE RAISED.
          The page's own argument raises all six: "no monthly subscription"
          raises the fee, "your own domain" raises the one you already own,
          "in minutes" raises how long it really takes, and a system that holds
          your customers and takes your money raises who owns what. Reuses the
          homepage's <details> pattern, which works before hydration and is in
          the tab order for free. */}
      <section className="home-faq home-faq-dark" id="faq" aria-labelledby="features-faq-title">
        <div className="home-faq-head">
          <p className="eyebrow">
            <span aria-hidden="true">✦</span> BEFORE YOU START
          </p>
          <h2 id="features-faq-title">The questions worth asking first.</h2>
        </div>
        {/* No `name` on the details: an exclusive accordion closes the answer
            you were reading and hides every other one from find-in-page. */}
        <div className="home-faq-list">
          {FAQ.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <PageCTA
        title="Start with the website. Grow into the whole system."
        body={`No subscription and no setup fee. The platform fee runs from ${HIGHEST_FEE} down to ${LOWEST_FEE} as your volume grows, and applies only when a homeowner pays you.`}
      />
      <SiteFooter />
    </main>
  );
}
