import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import LaunchBanner from '@/components/marketing/launch-banner';

// The flagship chrome and stylesheet — the same ones the homepage and
// /features draw, so this page is the site rather than a document about it.
import { SiteFooter, SiteHeader } from '@/components/flagship/site-chrome';
import styles from '@/components/flagship/flagship.module.css';
import { APP_SIGNUP_URL, DEMO_URL } from '@/components/marketing/links';
import { titleWithBrand } from '@/lib/seo/marketing-seo';

import OpportunityCards from './opportunity-cards';
import SectionNav, { type NavSection } from './section-nav';
import TextAlertDemo from './text-alert-demo';

export const metadata: Metadata = {
  // absolute: the root template's " · Let's Get Quoted" pushed this to 77
  // characters, and the brand is already the third word. See titleWithBrand.
  title: { absolute: titleWithBrand('How Let’s Get Quoted Works — your best jobs rise to the top') },
  description:
    'Your website qualifies every request, scores it by value, and tells you when a promising job needs an answer — then carries it all the way through to paid.',
  alternates: { canonical: 'https://letsgetquoted.com/how-it-works' },
  openGraph: {
    title: 'Your best jobs rise to the top.',
    description:
      'Incoming requests are qualified, scored and surfaced when they deserve an answer — and the one you take carries straight through quote, schedule, crew, payment and review.',
    url: 'https://letsgetquoted.com/how-it-works',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Your best jobs rise to the top.',
    description:
      'Incoming requests are qualified, scored and surfaced when they deserve an answer.',
  },
};

/* ---------------------------------------------------------------------------
 * WHAT THIS PAGE MAY AND MAY NOT CLAIM.
 *
 * Let's Get Quoted does not buy, sell or supply leads. Every request on this
 * page arrives at the contractor's OWN website; what the product does is
 * qualify it, estimate it, score it, rank it and surface it. So the verbs here
 * are qualify / estimate / score / prioritize / surface, and never "get",
 * "deliver", "send you" or "generate" leads. If a sentence here would still be
 * true of a lead-gen marketplace, it is the wrong sentence.
 *
 * Every number, name and address below is invented. The section that shows the
 * most of them carries its own marker saying so.
 * ------------------------------------------------------------------------- */

const NAV_SECTIONS: NavSection[] = [
  { id: 'opportunities', label: 'Opportunities' },
  { id: 'text-alerts', label: 'Text alerts' },
  { id: 'back-office', label: 'What happens next' },
];

/** The receipt rows are the four signals the ranking is actually made of. */
type ReceiptRow = { label: string; value: string };

const HERO_ROWS: ReceiptRow[] = [
  { label: 'Estimated value', value: '$8,600 · HIGH' },
  { label: 'Lead score', value: 'HOT' },
  { label: 'Service area', value: '✓ 4.2 MILES' },
  { label: 'Timeline', value: '✓ WITHIN 30 DAYS' },
];

const WHY_ROWS: ReceiptRow[] = [
  { label: 'Estimated value', value: '$8,600 · HIGH' },
  { label: 'Trade match', value: '✓ ELECTRICAL' },
  { label: 'Distance', value: '✓ 4.2 MILES' },
  { label: 'Readiness', value: '✓ PHONE VERIFIED' },
];

/* The three facts under the hero. Each is a claim about the queue, not about
   the company — "surfaces first" is checkable on the screen above it. */
const FACTS: { fact: string; of: string }[] = [
  { fact: 'High value', of: 'surfaces first' },
  { fact: 'Hot · Warm · Low', of: 'AI lead scoring' },
  { fact: '1 text', of: 'to decide now or later' },
];

/**
 * THE TWO QUESTIONS "AI-RANKED LEAD QUEUE" RAISES IN THE FIRST SECOND.
 *
 * How does it know, and will it hide a good one. Both were answered on this
 * page — three sections and 2,600px below the words that raised them, in a
 * receipt captioned "why this job surfaced". A reader who is not sure a machine
 * is safe with their leads does not scroll to find out; they leave.
 *
 * EVERY LINE IS CHECKED AGAINST THE CODE, not against the pitch:
 *
 *   the signals   api/public/leads/route.ts computes the flags from the OWNER'S
 *                 filters — service area, minimum job size, work-you-don't-take,
 *                 timeline, fully-booked mode — plus the AI estimate and whether
 *                 the phone was verified.
 *   demote only   "Flags demote; they never reject" is a comment on that
 *                 function and LEAD_PRUNE_FLAGS only ever writes score 'low'.
 *                 Nothing is deleted, hidden or withheld.
 *   the estimate  classify-estimate/route.ts asks one question at a time until
 *                 it can price confidently, prices what this trade would
 *                 actually charge, shades it by the posture the owner picked
 *                 (estimate-posture.ts), and — this is the honest part —
 *                 returns no price at all rather than inventing one.
 */
const TRUST: { term: string; detail: ReactNode }[] = [
  {
    term: 'It scores on rules you set',
    detail:
      'The service area you drew, the smallest job worth your time, the work you don’t take, how soon they need it, and whether the number checked out. Your filters, applied to their answers.',
  },
  {
    term: 'It demotes. It never hides',
    detail:
      'A low score means a request doesn’t interrupt your day — it does not mean you don’t get it. Every request lands on the same board, with the reason it was demoted printed on it, and you can act on any of them.',
  },
  {
    term: 'The value is an estimate, not your quote',
    detail:
      'The range comes from the homeowner’s own answers, asked one at a time until the job can be priced, at what your trade actually charges for that work. You choose whether it leans budget or premium — and when it can’t price something confidently it shows no number rather than a wrong one.',
  },
];

/**
 * THE JOURNEY, NAMED.
 *
 * The page follows one invented $8,600 job from the hero to the closing
 * receipt, which is the right idea and was doing it implicitly — the same
 * numbers turning up in four places over 5,300px reads as repetition unless
 * the page says out loud that it is the same job moving. Six beats, in order,
 * with the three the page has already shown marked as shown.
 */
const JOURNEY: { n: string; title: string; body: string; href: string; done?: boolean }[] = [
  { n: '1', title: 'Request', body: 'A homeowner describes the job on your own site.', href: '/features/website-builder', done: true },
  { n: '2', title: 'Ranked', body: 'Estimated, scored against your filters, and placed in the queue.', href: '/features/ai-intake', done: true },
  { n: '3', title: 'Texted', body: 'One message when a job is worth interrupting you for.', href: '#text-alerts', done: true },
  { n: '4', title: 'Quoted', body: 'The summary becomes a quote they approve and sign from a phone.', href: '/features/quotes' },
  { n: '5', title: 'Scheduled', body: 'A window they pick, a crew assigned, the scope in the field.', href: '/features/scheduling' },
  { n: '6', title: 'Paid', body: 'Deposit, balance and review, on the record that started it.', href: '/features/payments' },
];

/* THE LAST PIECE OF PAPER ON THE PAGE.
   It was the wordmark on a card, which is the one thing on this page that
   asked the reader to look at something and gave them nothing back. This is
   the same job the hero opened on, four stages later — the only honest way to
   close a page whose argument is that the request you accept is the record
   that gets paid. */
const PAID_ROWS: ReceiptRow[] = [
  { label: 'Quote signed', value: '✓ MAR 4' },
  { label: 'Scheduled', value: '✓ MAR 11 · 9–11' },
  { label: 'Work complete', value: '✓ MAR 12' },
  { label: 'Deposit + balance', value: '✓ PAID IN FULL' },
];

/* What the alert is made of. Three rows, and each names the thing on the
   phone screen beside it rather than a product feature. */
const ALERT_NOTES: { term: string; detail: ReactNode }[] = [
  {
    term: 'Value estimated',
    detail: 'Your intake turns the homeowner’s own answers into a useful range.',
  },
  {
    term: 'Priority scored',
    detail: 'Budget, location, timing and trade fit decide what rises first.',
  },
  {
    term: 'You choose when',
    detail: 'Open the request straight away, or let it come back to you later.',
  },
];

function Receipt({
  className,
  title,
  id,
  rows,
  stamp,
  total,
  label,
}: {
  className: string;
  title: string;
  id: string;
  rows: ReceiptRow[];
  stamp: string;
  /** The hero's receipt closes on the number; the qualification one does not. */
  total?: string;
  label: string;
}) {
  return (
    <article className={`hiq-receipt ${className}`} aria-label={label}>
      <div className="hiq-receipt-head">
        <h3>{title}</h3>
        <span>{id}</span>
      </div>
      {rows.map((row) => (
        <div className="hiq-receipt-row" key={row.label}>
          <span>{row.label}</span>
          <strong>{row.value}</strong>
        </div>
      ))}
      {total ? (
        <div className="hiq-receipt-total">
          <span className="hiq-stamp">{stamp}</span>
          <strong>{total}</strong>
        </div>
      ) : (
        <div className="hiq-stamp hiq-stamp-solo">{stamp}</div>
      )}
    </article>
  );
}

export default function HowItWorksPage() {
  return (
    <main className={`${styles.root} hiq-page`}>
      {/* The page had no skip link before the header, and the header comes
          first in the DOM — a skip link written after it is not one. */}
      <a className="skip-link" href="#main-content">Skip to content</a>

      {/* SiteHeader has to be INSIDE .root: every rule that styles it is scoped
          to that class, so rendered as a sibling it comes out as a 600px logo
          above five run-together links. The site's navigation is unchanged; the
          page's own three anchors are the bar underneath it. */}
      <SiteHeader />
      <LaunchBanner offsetHeader />
      <SectionNav sections={NAV_SECTIONS} />

      {/* ------------------------------------------------------------------
          HERO — the queue's top row, drawn at full size.
          ------------------------------------------------------------------ */}
      <section className="hiq-hero" id="main-content" aria-labelledby="hiq-title">
        <div className="hiq-hero-copy">
          <p className="hiq-eyebrow">AI-ranked lead queue</p>
          <h1 id="hiq-title">
            Your best jobs <em>rise to the top.</em>
          </h1>
          <p className="hiq-lede">
            Your website qualifies every request, estimates its value and alerts you when a
            promising job needs an answer. Respond now—or save it for later.
          </p>
          <div className="hiq-actions">
            <a className="hiq-button" href={APP_SIGNUP_URL}>
              Start free <span aria-hidden="true">→</span>
            </a>
            <Link className="hiq-textlink" href={DEMO_URL}>
              Explore the demo
            </Link>
          </div>
        </div>

        <div className="hiq-hero-receipt">
          <Receipt
            className="hiq-receipt-hero"
            label="Example high-priority request"
            title="Panel upgrade + EV charger"
            id="LEAD #2081"
            rows={HERO_ROWS}
            stamp="BEST MATCH"
            total="$8,600"
          />
        </div>
      </section>

      {/* Three facts about the queue, on the seam between the hero and the
          paper section — the strip is what carries the color change. */}
      <section className="hiq-facts" aria-label="At a glance">
        {FACTS.map((fact) => (
          <div key={fact.fact}>
            <strong>{fact.fact}</strong>
            <span>{fact.of}</span>
          </div>
        ))}
      </section>

      {/* ------------------------------------------------------------------
          THE ANSWER TO THE QUESTION THE HERO JUST RAISED.

          "AI-ranked lead queue" asks two things of a contractor in the first
          second: how does it know, and will it hide a good one. Both were
          answered on this page — 2,600px and three sections below the words
          that raised them. Somebody unsure a machine is safe with their leads
          does not scroll to find out.
          ------------------------------------------------------------------ */}
      <section className="hiq-trust" aria-labelledby="hiq-trust-title">
        <div className="hiq-shell">
          <div className="hiq-split">
            <div>
              <p className="hiq-eyebrow hiq-eyebrow-dark">Before you trust it with your leads</p>
              <h2 id="hiq-trust-title">How the ranking decides, and what it cannot do.</h2>
            </div>
            <p>
              Nothing here is a judgement about your business. It is your own filters, applied to
              what the homeowner answered — and the worst it can do to a request is stop it from
              interrupting you.
            </p>
          </div>

          <dl className="hiq-trust-list">
            {TRUST.map((item) => (
              <div key={item.term}>
                <dt>{item.term}</dt>
                <dd>{item.detail}</dd>
              </div>
            ))}
          </dl>

          <Link className="hiq-inlinelink hiq-inlinelink-light" href="/features/ai-intake">
            See exactly what the intake asks and scores <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      {/* ------------------------------------------------------------------
          THE JOURNEY, NAMED.

          One invented $8,600 job runs from the hero to the closing receipt.
          That is the right idea, and over 5,300px of desktop it reads as
          repetition unless the page says out loud that it is the same job
          moving. Six beats, in order; the first three are what the sections
          above have just shown.
          ------------------------------------------------------------------ */}
      <section className="hiq-journey" aria-labelledby="hiq-journey-title">
        <div className="hiq-shell">
          <h2 id="hiq-journey-title" className="hiq-journey-title">
            One request, six steps: <em>Request → Ranked → Texted → Quoted → Scheduled → Paid.</em>
          </h2>
          <ol className="hiq-journey-rail">
            {JOURNEY.map((beat) => (
              <li key={beat.n} data-done={beat.done ? 'true' : 'false'}>
                <Link href={beat.href}>
                  <span className="hiq-journey-n" aria-hidden="true">
                    {beat.n}
                  </span>
                  <strong>{beat.title}</strong>
                  <span className="hiq-journey-body">{beat.body}</span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------------------
          OPPORTUNITIES — three tickets, three different reasons.
          ------------------------------------------------------------------ */}
      <section className="hiq-opps" id="opportunities" aria-labelledby="hiq-opps-title">
        <div className="hiq-shell">
          <div className="hiq-split">
            <div>
              <p className="hiq-eyebrow hiq-eyebrow-dark">Worth your attention</p>
              <h2 id="hiq-opps-title">Three reasons a job deserves a look.</h2>
            </div>
            <p>
              A valuable new lead, a paid Quick Stop near your route, or a quote worth following
              up—ranked by what can move your business today.
            </p>
          </div>

          <OpportunityCards />

          <p className="hiq-example">Example opportunities · values and customers are illustrative</p>
        </div>
      </section>

      {/* ------------------------------------------------------------------
          THE TEXT — one screen, one decision.
          ------------------------------------------------------------------ */}
      <section className="hiq-text" id="text-alerts" aria-labelledby="hiq-text-title">
        <div className="hiq-shell hiq-text-layout">
          <TextAlertDemo />

          <div className="hiq-text-copy">
            <p className="hiq-eyebrow hiq-eyebrow-dark">A quiet interruption</p>
            <h2 id="hiq-text-title">The right job. One quick decision.</h2>
            <p className="hiq-text-lede">
              Respond now—or save it for later and keep working.
            </p>
            <dl>
              {ALERT_NOTES.map((note) => (
                <div key={note.term}>
                  <dt>{note.term}</dt>
                  <dd>{note.detail}</dd>
                </div>
              ))}
            </dl>
            <Link className="hiq-inlinelink" href="/features/client-portal">
              See texts and the client portal <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------
          THE BRIDGE.

          Without this section the page reads as a ranking tool. The job a
          contractor accepts here is the same record that gets quoted, booked,
          worked, paid and reviewed — said once, in five short stages, with the
          detail left on /features where it belongs.
          ------------------------------------------------------------------ */}
      <section className="hiq-bridge" id="back-office" aria-labelledby="hiq-bridge-title">
        <div className="hiq-shell">
          <div className="hiq-split hiq-split-bridge">
            <div>
              <p className="hiq-eyebrow">The alert is only the beginning</p>
              <h2 id="hiq-bridge-title">
                You choose the job. Let’s Get Quoted carries it the rest of the way.
              </h2>
            </div>
            <p>
              Once you respond, the same request becomes the quote, schedule, crew plan, customer
              conversation, payment and review—without rebuilding the record.
            </p>
          </div>

          {/* THE FIVE-CARD RAIL THAT USED TO BE HERE IS GONE.
              It named Quote + sign, Schedule, Crew, Payment and Review — which
              is beats 4, 5 and 6 of the journey printed a second time, 1,900px
              after the rail that names all six. On a 9,700px phone page, saying
              the same sequence twice is the repetition the page was criticised
              for. The journey rail carries the sequence; this section carries
              the sentence that makes it matter, and the way through to it. */}
          <div className="hiq-actions hiq-bridge-actions">
            <Link className="hiq-button" href="/features/back-office">
              Explore the connected back office <span aria-hidden="true">→</span>
            </Link>
            <Link className="hiq-textlink" href="/features">
              See every feature
            </Link>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------
          WHY IT SURFACED — the receipt, second time, as an explanation.
          ------------------------------------------------------------------ */}
      <section className="hiq-why" aria-labelledby="hiq-why-title">
        <div className="hiq-why-copy">
          <p className="hiq-eyebrow">Before we text you</p>
          <h2 id="hiq-why-title">It doesn’t just say “new lead.”</h2>
          <p>
            You see why the job surfaced—its estimated value, lead score, distance and timeline—so
            you can make the call without digging through another form.
          </p>
          {/* The section shows the OUTPUT of the ranking. This is the way to
              the page that explains how each of those four lines is decided. */}
          <Link className="hiq-inlinelink hiq-inlinelink-light" href="/features/ai-intake">
            See how AI Smart Intake scores a request <span aria-hidden="true">→</span>
          </Link>
        </div>

        <Receipt
          className="hiq-receipt-why"
          label="Why this request was ranked first"
          title="Why this job surfaced"
          id="LEAD #2081"
          rows={WHY_ROWS}
          stamp="WORTH A LOOK"
        />
      </section>

      {/* ------------------------------------------------------------------
          THE ASK.
          ------------------------------------------------------------------ */}
      <section className="hiq-final" aria-labelledby="hiq-final-title">
        <div className="hiq-shell hiq-final-layout">
          <div>
            <p className="hiq-eyebrow">Know what deserves your attention</p>
            <h2 id="hiq-final-title">
              The right job. The right moment. <em>One quick decision.</em>
            </h2>
            <div className="hiq-actions">
              <a className="hiq-button" href={APP_SIGNUP_URL}>
                Start free <span aria-hidden="true">→</span>
              </a>
              <Link className="hiq-textlink" href={DEMO_URL}>
                Explore the demo
              </Link>
            </div>
            <p className="hiq-reassurance">Flex includes a website · $0/month + 1.25%</p>
          </div>

          <div className="hiq-final-receipt">
            <Receipt
              className="hiq-receipt-paid"
              label="The same example job, paid"
              title="Panel upgrade + EV charger"
              id="JOB #1048"
              rows={PAID_ROWS}
              stamp="PAID"
              total="$8,600"
            />
            <p className="hiq-example">The same example request, eight days later</p>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
