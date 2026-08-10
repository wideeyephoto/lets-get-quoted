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
import { FEE_TIERS } from '@/lib/pricing';
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

const FLAGSHIPS: Flagship[] = [
  {
    number: '01',
    id: 'website-builder',
    title: 'One-click website',
    body: 'Launch a complete, editable contractor site with Smart Intake connected from day one.',
    href: '/features/website-builder',
    kicker: 'BUILD THE FRONT DOOR',
    produces: ['Trade-matched pages', 'Intake form wired in', 'Your own domain'],
  },
  {
    number: '02',
    id: 'smart-intake',
    title: 'AI Smart Intake',
    body: 'Ask better questions, build a useful project summary and surface the leads that deserve attention first.',
    href: '/features/ai-intake',
    kicker: 'QUALIFY THE OPPORTUNITY',
    produces: ['A written job summary', 'Budget and urgency read', 'Leads ranked by value'],
  },
  {
    number: '03',
    id: 'quick-stops',
    title: 'Quick Stops',
    body: 'Turn an opening in today’s route into an optional, prepaid nearby job at a price you choose.',
    href: '/features/quick-stops',
    kicker: 'EARN BETWEEN JOBS',
    produces: ['Openings in today’s route', 'Paid before you arrive', 'Your price, your radius'],
  },
  {
    number: '04',
    id: 'client-portal',
    title: 'Texts + client portal',
    body: 'Keep every conversation, approval, update and payment connected to the right job.',
    href: '/features/client-portal',
    kicker: 'KEEP CUSTOMERS INFORMED',
    produces: ['Two-way texting', 'Approvals and e-signature', 'Live job status'],
  },
  {
    number: '05',
    id: 'back-office',
    title: 'Connected back office',
    body: 'Move from quote to schedule, crew, payment, review and recurring work without rebuilding the record.',
    href: '/features/back-office',
    kicker: 'RUN THE WORK',
    produces: ['Quote → schedule → crew', 'Deposits and balances', 'Reviews and repeat visits'],
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
          <span aria-hidden="true">✦</span> THE FULL CONTRACTOR SUITE
        </p>
        <h1>
          One system for the first click, <em>the final payment and everything between.</em>
        </h1>
        <p>
          Your website, leads, quotes, schedule, crew, customer communication and money share one
          connected workflow—with no monthly subscription.
        </p>
        <div className="hero-actions">
          {/* Was the app ROOT, which is the sign-in screen — the biggest button
              on the page promised a site and delivered a password field. */}
          <a className="button primary" href={SIGNUP_URL}>
            {SIGNUP_LABEL} <span aria-hidden="true">→</span>
          </a>
          <a className="button secondary" href="#flagship-index">
            Explore the suite
          </a>
        </div>

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
      </section>

      <PageCTA
        title="Start with the website. Grow into the whole system."
        body={`No subscription and no setup fee. The platform fee runs from ${HIGHEST_FEE} down to ${LOWEST_FEE} as your volume grows, and applies only when a homeowner pays you.`}
      />
      <SiteFooter />
    </main>
  );
}
