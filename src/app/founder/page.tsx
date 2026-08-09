import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import SiteFooter from '@/components/site-footer';
import StickyCta from '@/components/sticky-cta';
import {
  APP_SIGNUP_URL,
  CtaLink,
  ExampleFrame,
  MARKETING_MAIN_ID,
  MARKETING_PAGE_CLASS,
  MarketingCta,
  PriceZeroDial,
} from '@/components/marketing';
import { FEATURE_CATEGORIES, FEATURE_COUNT } from '@/lib/features';
import { FEE_TIERS, STRIPE_PROCESSING_NOTE } from '@/lib/pricing';
import styles from './founder.module.css';

export const metadata: Metadata = {
  title: 'Founder story',
  description:
    'Why Let’s Get Quoted is building a better website and connected back office for contractors.',
  alternates: { canonical: 'https://letsgetquoted.com/founder' },
};

/* The one number on the page, read from the canonical fee model rather than
   typed in, so it cannot drift from /pricing or the calculator. */
// FEE_TIERS[0] is the rate a business STARTS on and falls from — 1.25%, the
// highest of the four, not the lowest. The old name invited a correction to
// FEE_TIERS[length - 1], which would have quoted everyone the 0.65% that only
// applies above $750k of volume.
const STARTING_RATE = FEE_TIERS[0].rate;

/* Prose with apostrophes and quote marks lives in constants rather than inline
   JSX text: it keeps the curly punctuation intact without scattering entities
   through the markup, and it keeps the copy in one readable block. */

const LEDE =
  'I kept seeing talented contractors held back by terrible websites, generic lead forms and a back office split across too many tools. Let’s Get Quoted is my attempt to fix the whole chain—not just redesign the front page.';

const MANIFESTO_QUOTE =
  '“A contractor starting with one truck should be able to look professional, respond intelligently and run the work with the same confidence as a much larger company.”';

const PLEDGES = [
  'Beautiful enough to build trust',
  'Useful enough to run the job',
  'Accessible before the business is big',
];

/* Four beats, in order, which is why they are an <ol> below. */
const CHAPTERS: { title: string; body: ReactNode }[] = [
  {
    title: 'The problem',
    body: 'Too many great tradespeople have no website, an outdated website or a good-looking site that still delivers vague, low-context leads.',
  },
  {
    // The draft's sentence, kept word for word — "understand location" is the
    // distance-aware phrasing that is actually true of the intake scorer, and
    // nothing in it promises a location-triggered alert. The second sentence is
    // added, not substituted.
    title: 'The realization',
    body: 'If the website can ask smarter questions, it can set price expectations, find urgency, understand location and give the contractor a better first call. A website does not have to be a phone-number collector—it can qualify the opportunity before anyone picks up.',
  },
  {
    title: 'The bigger opportunity',
    body: 'Once that context exists, it should not disappear. It should follow the job into the quote, schedule, texts, client portal, crew handoff and payment.',
  },
  {
    title: 'The promise',
    body: 'Build the complete product for the contractor starting today and the established operator growing toward the next crew—without a monthly subscription standing in the way.',
  },
];

/* A set, not a sequence, which is why these are a <ul>. The fourth is the one
   the draft left out, and it is the principle the other three depend on: a
   product that is beautiful, connected and cheap to start is worth nothing to a
   one-truck business if the one-truck version is the hollow one. */
const PRINCIPLES: { title: string; body: string }[] = [
  {
    title: 'Design earns trust.',
    body: 'The site and customer experience should make a small business feel established without pretending to be something it is not.',
  },
  {
    title: 'Context should travel.',
    body: 'Details gathered once should keep helping the owner, office, crew and homeowner throughout the job.',
  },
  {
    title: 'Software should earn its keep.',
    body: 'The business should not carry another monthly bill before the product helps money move.',
  },
  {
    title: 'Small contractors should not receive a stripped-down product.',
    body: 'The one-truck business gets the same quoting, scheduling, payments, client portal and follow-up as the operator running four crews. I am not building a smaller version of the product for the people who can least afford the gaps in it.',
  },
];

/* ------------------------------------------------------------------------- */
/* "Context should travel", drawn instead of asserted.                        */
/*                                                                            */
/* Every field on the left is one the public intake actually stores           */
/* (src/app/api/public/leads/route.ts -> createLead: name, phone, email,      */
/* address, projectType, message, photoPaths), and every destination on the   */
/* right is a place shipped code reads those same columns back out. The       */
/* homeowner, the address and the job are invented — hence the ExampleFrame — */
/* but the plumbing is not.                                                   */
/* ------------------------------------------------------------------------- */

const INTAKE_FIELDS: { label: string; value: string }[] = [
  { label: 'Name', value: 'D. Whitfield' },
  { label: 'Phone', value: '(555) 014-9820' },
  { label: 'Email', value: 'd.whitfield@example.com' },
  { label: 'Address', value: '22 Linden Ct, Royal Oak MI' },
  { label: 'Project type', value: 'Kitchen remodel' },
  {
    label: 'What’s happening',
    value: 'Cabinets are original to the house and the sink base has gone soft. Hoping to start before fall.',
  },
  { label: 'Photos', value: '3 attached' },
];

/* Each `how` describes a real code path, and each `carries` lists only columns
   that path genuinely moves:
     1. src/lib/leads.ts convertLeadToJob — clientName / clientPhone /
        clientEmail / address, plus a scope assembled from project_type +
        message.
     2. src/lib/jobs.ts createJob — findOrCreateClientId on the same name,
        phone, email and address, so the job links to a client profile.
     3. src/app/field/jobs/[id]/page.tsx — selects client_name, client_phone,
        address and scope and renders them for the assigned crew.
     4. src/lib/message-context.ts messageContext — a normalised inbound number
        resolves to client -> job (titled by its scope) -> latest invoice.
     5. src/lib/invoices.ts getPublicInvoice — job.client_name and ref on the
        signing page; src/lib/client-portal.ts PortalJob — scope, address,
        quotedAmount for every job under that client. */
const TRAVEL_STOPS: { title: string; how: string; carries: string[] }[] = [
  {
    title: 'The job record',
    how: 'Turning the request into a job carries the contact details across as they were typed, and files the project type and the description together as the scope of work.',
    carries: ['Name', 'Phone', 'Email', 'Address', 'Scope'],
  },
  {
    title: 'The client in the book',
    how: 'That same phone number and email either match a client already on file or open a new one, so the second job at this house lands on the same record as the first.',
    carries: ['Name', 'Phone', 'Email', 'Address'],
  },
  {
    title: 'The crew’s job screen',
    how: 'Whoever is assigned opens the job on their own phone and reads the address and the scope the homeowner wrote. Nobody retypes it into a text message the night before.',
    carries: ['Name', 'Phone', 'Address', 'Scope'],
  },
  {
    title: 'The message thread',
    how: 'A text from that number arrives with the client, the job it is most likely about and the latest invoice already attached to the conversation.',
    carries: ['Name', 'Address', 'Scope', 'Latest invoice'],
  },
  {
    title: 'The invoice, and the homeowner’s portal',
    how: 'The invoice they sign is headed with the name they gave. Their portal link lists every job filed under them — scope, address and what they were quoted.',
    carries: ['Name', 'Address', 'Scope'],
  },
];

/* The honest counterweight. convertLeadToJob does not pass photoPaths to
   createJob, so photos genuinely stay on the lead. Drawing them travelling
   would be the easy lie; this is the weaker true thing. */
const TRAVEL_STAYS = {
  title: 'The photos stay on the request',
  how: 'They belong to the message they arrived with and are not copied onto the job. One thing on this page that does not travel, said out loud rather than quietly drawn as if it did.',
};

export default function FounderPage() {
  return (
    <>
      {/* The header comes from src/app/founder/layout.tsx now, which is the
          same one the homepage and /features draw.

          It used to be <MarketingHeader />, and that was the most visibly wrong
          of the three headers this site had: a floating rounded card rather
          than a full-bleed bar, a circle-check logo rather than the wordmark,
          and a nav that offered Features / How it works / Pricing / FAQ /
          Contact — omitting "For your trade" and, on the founder page, the link
          to the founder page. */}
      <main className={MARKETING_PAGE_CLASS} id={MARKETING_MAIN_ID}>
        <div className="ambient-glow ambient-glow-a" aria-hidden="true" />
        <div className="ambient-glow ambient-glow-b" aria-hidden="true" />

        <div className="marketing-shell">
          <section className="hero-grid" aria-labelledby="founder-title">
            <div className="hero-copy">
              <p className="eyebrow">A note from the founder</p>
              <h1 id="founder-title" className={styles.title}>
                Contractors deserve software that makes the business look{' '}
                <em>as good as the work.</em>
              </h1>
              <p className={styles.lede}>{LEDE}</p>

              <div className="actions">
                <CtaLink spec={{ label: 'Build my free site' }} className="btn primary" arrow />
                <CtaLink
                  spec={{ label: 'See what it runs', href: '/features' }}
                  className="btn secondary"
                />
              </div>

              <div className={styles.signature}>
                {/* A monogram, not a portrait. There is no photograph on this page
                    and no biography behind it — the page says what is being built
                    and why, and nothing about the person that the copy does not
                    already say out loud. */}
                <span className={styles.monogram} aria-hidden="true">
                  B
                </span>
                <span>
                  <span className={styles.signatureName}>Brett</span>
                  <span className={styles.signatureRole}>Founder · Let’s Get Quoted</span>
                </span>
              </div>
            </div>

            <aside className={`panel ${styles.manifesto}`} aria-label="Why I’m building this">
              <p className="eyebrow">Why I’m building this</p>
              <blockquote className={styles.quote}>{MANIFESTO_QUOTE}</blockquote>
              <ul className={styles.pledges}>
                {PLEDGES.map((pledge, index) => (
                  <li key={pledge} className={styles.pledge}>
                    <span className={styles.pledgeNum} aria-hidden="true">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span>{pledge}</span>
                  </li>
                ))}
              </ul>
            </aside>
          </section>

          <section className="section-block" aria-labelledby="founder-story-title">
            <div className={styles.sectionHead}>
              <p className="eyebrow">The idea behind the product</p>
              <h2 id="founder-story-title">The website should start the back office.</h2>
            </div>
            <ol className={styles.cards}>
              {CHAPTERS.map((chapter, index) => (
                <li key={chapter.title} className={styles.card}>
                  {/* The numeral is visual rhythm, not information — the list
                      element already carries the order. */}
                  <span className={styles.cardNum} aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3 className={styles.cardTitle}>{chapter.title}</h3>
                  <p className={styles.cardBody}>{chapter.body}</p>
                </li>
              ))}
            </ol>
          </section>

          {/* The page's one product graphic. It exists because "context should
              travel" is the claim the whole product rests on and, until now,
              the page only stated it. A screenshot cannot argue it — the point
              is not what one screen looks like, it is that five screens are
              reading the same row. So: the request on the left, the places it
              turns up on the right, and the one thing that stays behind. */}
          <section className="section-block" aria-labelledby="founder-travel-title">
            <div className={styles.sectionHead}>
              <p className="eyebrow">Captured once</p>
              <h2 id="founder-travel-title">What a homeowner types should never be typed again.</h2>
              <p className={styles.sectionLede}>
                One request comes in. Everything after it—the job, the client record, the crew’s
                screen, the text thread, the invoice—reads what the homeowner already wrote instead
                of asking somebody to key it in a second time.
              </p>
            </div>

            <ExampleFrame
              className={styles.travelFrame}
              label="One request, and where its values turn up next"
              note="Sample homeowner and job. The fields on the left are the ones the intake actually stores, and each destination is a place the product already reads them back out."
            >
              <div className={styles.travel}>
                <div className={styles.origin}>
                  {/* A <p>, not an <h3>: this is a picture of a form inside an
                      example frame, and a real heading here would let the mock
                      outrank the section it sits in. */}
                  <p className={styles.originTitle}>Request from your website</p>
                  <dl className={styles.fields}>
                    {INTAKE_FIELDS.map((field) => (
                      <div key={field.label} className={styles.field}>
                        <dt className={styles.fieldLabel}>{field.label}</dt>
                        <dd className={styles.fieldValue}>{field.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <div className={styles.stopsWrap}>
                  <p className={styles.stopsTitle}>Where those values appear afterwards</p>
                  <ol className={styles.stops}>
                    {TRAVEL_STOPS.map((stop) => (
                      <li key={stop.title} className={styles.stop}>
                        <p className={styles.stopTitle}>{stop.title}</p>
                        <p className={styles.stopHow}>{stop.how}</p>
                        <ul className={styles.chips} aria-label={`Values carried into ${stop.title}`}>
                          {stop.carries.map((carried) => (
                            <li key={carried} className={styles.chip}>
                              {carried}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ol>

                  <div className={styles.stays}>
                    <p className={styles.staysTitle}>{TRAVEL_STAYS.title}</p>
                    <p className={styles.stopHow}>{TRAVEL_STAYS.how}</p>
                  </div>
                </div>
              </div>
            </ExampleFrame>
          </section>

          <section className="section-block" aria-labelledby="founder-principles-title">
            <div className={styles.sectionHead}>
              <p className="eyebrow">What guides the build</p>
              <h2 id="founder-principles-title">Beautiful. Practical. Aligned with the contractor.</h2>
            </div>
            <ul className={styles.cards}>
              {PRINCIPLES.map((principle, index) => (
                <li key={principle.title} className={styles.card}>
                  <span className={styles.cardNum} aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3 className={styles.cardTitle}>{principle.title}</h3>
                  <p className={styles.cardBody}>{principle.body}</p>
                </li>
              ))}
            </ul>
          </section>

          {/* The $0 dial, and the reason it is not a naked circle: on its own it
              would be the "empty decorative space" this page is meant to avoid.
              Beside it is the whole catalogue, read from FEATURE_CATEGORIES at
              build time — category names and counts only, so it states the
              shape of the product without reprinting /features. It is the proof
              of the fourth principle above: the free account is not the
              stripped-down one, because there is no tier field anywhere in the
              catalogue to strip it with.
              Not an ExampleFrame — the price and the counts are real, and an
              "Example" badge on either would read as a hedge. */}
          <section className="section-block" aria-labelledby="founder-zero-title">
            <div className={styles.zeroBand}>
              <PriceZeroDial variant="lead" className={styles.zeroDial} />

              <div className={styles.zeroCopy}>
                <div className={styles.sectionHead}>
                  <p className="eyebrow">Software should earn its keep</p>
                  <h2 id="founder-zero-title">Nothing to pay before the product moves money.</h2>
                </div>
                <p className={styles.sectionLede}>
                  There is no plan to choose and no tier to grow out of. There is one catalogue—
                  {` ${FEATURE_COUNT} `}features across {FEATURE_CATEGORIES.length} groups—and the
                  one-truck account opens with all of it.
                </p>

                <p className={styles.catalogueHead} id="founder-catalogue-head">
                  Every group, in every account
                </p>
                <ul className={styles.catalogue} aria-labelledby="founder-catalogue-head">
                  {FEATURE_CATEGORIES.map((category) => (
                    <li key={category.slug} className={styles.catRow}>
                      <span className={styles.catNum} aria-hidden="true">
                        {category.num}
                      </span>
                      <span className={styles.catTitle}>{category.title}</span>
                      <span className={styles.catCount}>
                        {category.features.length}
                        <span className="sr-only"> features</span>
                      </span>
                    </li>
                  ))}
                </ul>

                <p className={styles.zeroNote}>
                  The one charge is the platform fee, taken out of a payment a homeowner actually
                  makes to you—never a monthly bill, and never a charge for reaching a feature.
                  Card processing ({STRIPE_PROCESSING_NOTE}) is separate and goes to Stripe.
                </p>
              </div>
            </div>
          </section>

          <MarketingCta
            kicker="The next chapter is your business"
            title="Build something customers trust—and a system your team can run."
            note={`No card required and no monthly subscription. The platform fee is ${STARTING_RATE} of what a homeowner pays you, falling as your volume grows, and applies only when they actually pay.`}
          />

          <SiteFooter />
        </div>

        <StickyCta href={APP_SIGNUP_URL} label="Build my free site" />
      </main>
    </>
  );
}
