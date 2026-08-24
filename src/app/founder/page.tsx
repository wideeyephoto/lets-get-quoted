import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import SiteFooter from '@/components/site-footer';
import StickyCta from '@/components/sticky-cta';
import {
  APP_SIGNUP_URL,
  CtaLink,
  MARKETING_MAIN_ID,
  MARKETING_PAGE_CLASS,
  MarketingCta,
  PriceZeroDial,
} from '@/components/marketing';
import { PUBLIC_PRICING_SUMMARY, STRIPE_PROCESSING_NOTE } from '@/lib/pricing';
import styles from './founder.module.css';

export const metadata: Metadata = {
  title: 'A note from Brett, founder',
  description:
    'Why I built Let’s Get Quoted: so a one-truck business can look—and run—like a much bigger company. Start at $0/month with Flex or choose a paid plan as you grow.',
  alternates: { canonical: 'https://letsgetquoted.com/founder' },
  /* Spelled out rather than inherited: the root layout's title `template` does
     not reach openGraph, so without these a share card reads "The website, CRM
     & payments platform built for contractors" — the site's pitch, not this
     page's. The IMAGE is deliberately left to the root default; see the note in
     the delivery summary. A 1122×1402 portrait dropped into a 1.91:1 card gets
     center-cropped to the torso, so an inherited product shot beats a
     beheaded founder until a purpose-made 1200×630 card exists. */
  openGraph: {
    title: 'A note from Brett, founder · Let’s Get Quoted',
    description:
      'I built Let’s Get Quoted so a one-truck business can look—and run—like a much bigger company.',
    url: 'https://letsgetquoted.com/founder',
    type: 'profile',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'A note from Brett, founder · Let’s Get Quoted',
    description:
      'I built Let’s Get Quoted so a one-truck business can look—and run—like a much bigger company.',
  },
};

/* Prose with apostrophes and quote marks lives in constants rather than inline
   JSX text: it keeps the curly punctuation intact without scattering entities
   through the markup, and it keeps the copy in one readable block. */

const HERO_LEDE =
  'I built Let’s Get Quoted to turn a strong first impression into a cleaner lead, a faster quote and a business that is easier to run.';

/* The three things the page is actually offering, in the hero rather than
   discovered on the pricing page. Each is a fact stated elsewhere on this page
   and provable on /pricing — not a feature list. */
const HERO_POINTS = ['No card', 'Start at $0/month', 'One connected product'] as const;

const LEDE =
  'I kept seeing talented contractors held back by terrible websites, generic lead forms and a back office split across too many tools. Let’s Get Quoted is my attempt to fix the whole chain—not just redesign the front page.';

const START_BODY =
  'So I did not start with the website. I started with what happens after somebody fills it in, and worked backwards until the front page and the back office were the same system rather than two things a contractor has to keep in step by hand.';

/* Three cards, and they are the three problems LEDE names — the website, the
   lead and the back office, in that order. Not a fourth invented for symmetry. */
const BROKEN: { title: string; body: string }[] = [
  {
    title: 'The website was a dead end.',
    body: 'A good-looking site that finishes with a contact form is a brochure. It collects a name and a number and hands the contractor the same blank start every time.',
  },
  {
    title: 'The lead arrived with nothing in it.',
    body: 'No scope, no address, no sense of how soon or how big. Every quote began with a call to find out what the form should have asked.',
  },
  {
    title: 'The back office was five tools.',
    body: 'Quoting in one, scheduling in another, invoices somewhere else, and the same job details typed into all of them. Nothing that gets typed twice stays correct.',
  },
];

/* ------------------------------------------------------------------------- */
/* The five steps, and why each one is safe to print.                         */
/*                                                                            */
/* This replaced a field-by-field diagram of the intake row moving between    */
/* tables. The diagram was accurate and far too long for a founder letter;    */
/* these are the same journey at the altitude the page is written at. Every   */
/* step is shipped code, not roadmap:                                         */
/*   1. src/app/api/public/leads/route.ts -> createLead (name, phone, email,  */
/*      address, projectType, message, photoPaths)                            */
/*   2. the intake scorer — price expectation, urgency, distance              */
/*   3. src/lib/leads.ts convertLeadToJob, then the quote and its signature   */
/*   4. the accepted quote becomes a scheduled job; src/app/field/jobs/[id]   */
/*      renders address + scope for the assigned crew                         */
/*   5. src/lib/invoices.ts getPublicInvoice — the invoice is headed with the */
/*      name the homeowner typed on step 1                                    */
/* ------------------------------------------------------------------------- */
const FLOW: { step: string; body: string }[] = [
  {
    step: 'Request',
    body: 'Your site asks what you would have asked on the phone: what the job is, where it is, how soon, and photos.',
  },
  {
    step: 'Qualified lead',
    body: 'It arrives sorted rather than raw — the contact details, the scope, how urgent it reads and how far away it is.',
  },
  {
    step: 'Accepted quote',
    body: 'You quote from that scope instead of retyping it, and they approve and sign from their phone.',
  },
  {
    step: 'Scheduled job',
    body: 'The accepted quote becomes a job on the calendar, and your crew opens the same address and scope on site.',
  },
  {
    step: 'Payment',
    body: 'You invoice from the same record. They pay by card or ACH bank transfer, and the job closes where it started.',
  },
];

/* The honest counterweight, kept from the longer version of this section.
   convertLeadToJob does not pass photoPaths to createJob, so photos genuinely
   stay on the lead. Drawing them travelling would be the easy lie. */
const FLOW_NOTE =
  'One thing that does not travel: photos stay on the request they arrived with rather than being copied onto the job. It is the one gap in the chain above, and it is easier to say so than to quietly draw it closed.';

const MANIFESTO_QUOTE =
  '“A contractor starting with one truck should be able to look professional, respond intelligently and run the work with the same confidence as a much larger company.”';

/* A set, not a sequence, which is why these are a <ul>. The fourth is the one
   the others depend on: a product that is beautiful, connected and cheap to
   start is worth nothing to a one-truck business if the one-truck version is
   the hollow one. */
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
    body: 'The one-truck business gets the same quoting, scheduling, payments, client portal and website builder as a multi-crew operation. I am not building a smaller version of the product for the people who can least afford the gaps in it.',
  },
];

const PROMISE_BODY =
  'I will keep the free account complete rather than crippled, I will not add a monthly bill to a business that has not been paid yet, and I will not describe something as finished before it is.';

/* DIRECTION, NOT A FEATURE LIST, and the tense is doing the work.
   Everything else on this page describes shipped behavior. This paragraph does
   not, so it says "where this goes next" and "when each piece arrives" out
   loud. Do not soften those into the present tense to make the page sound
   further along — an intake that "reads a job" is not something an account can
   do today, and a contractor deciding on this product would find that out in
   week one. */
const DIRECTION =
  'Where this goes next is more of the thinking and less of the typing: intake that gets better at reading a job, and a quote that starts itself from what the homeowner already described. That is the direction I am building in. I would rather say when each piece lands than sell it in advance.';

const PLEDGES = [
  'Beautiful enough to build trust',
  'Useful enough to run the job',
  'Accessible before the business is big',
];

export default function FounderPage() {
  return (
    /* styles.page carries nothing on a desktop. It exists so the mobile block
       in founder.module.css can tighten THIS page's .section-block padding
       without reaching the shared class on every other marketing route. */
    <main className={`${MARKETING_PAGE_CLASS} ${styles.page}`} id={MARKETING_MAIN_ID}>
      <div className="ambient-glow ambient-glow-a" aria-hidden="true" />
      <div className="ambient-glow ambient-glow-b" aria-hidden="true" />

      <div className="marketing-shell">
        {/* 1 — the letterhead. One H1 on the page and it is here.
            The header itself comes from src/app/founder/layout.tsx, which is
            the same PublicHeaderLayout the homepage and /features mount. */}
        <section className={styles.portraitHero} aria-labelledby="founder-title">
          <div className={styles.portraitCopy}>
            <div className={styles.eyebrowRow}>
              <div className={styles.founderMiniAvatar} aria-hidden="true">
                <Image
                  src="/founder/brett-workshop.jpg"
                  alt=""
                  width={44}
                  height={44}
                  className={styles.avatarImg}
                />
              </div>
              <p className="eyebrow">A note from Brett, founder</p>
            </div>
            <h1 id="founder-title" className={styles.title}>
              I built Let’s Get Quoted so a one-truck business can look—and run—like{' '}
              <em>a much bigger company.</em>
            </h1>
            <p className={styles.lede}>{HERO_LEDE}</p>

            <div className="actions">
              <CtaLink spec={{ label: 'Build my free site' }} className="btn primary" arrow />
              <a className={styles.readStory} href="#my-story">
                Read my story <span aria-hidden="true">↓</span>
              </a>
            </div>

            {/* The terms, in the hero rather than found later. A list because
                it is three separate facts, not one sentence broken by dots. */}
            <ul className={styles.heroPoints}>
              {HERO_POINTS.map((point) => (
                <li key={point} className={styles.heroPoint}>
                  <span className={styles.heroTick} aria-hidden="true">
                    ✓
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </div>

          <figure className={styles.portraitFrame}>
            {/* The real photograph. It replaced a drawn placeholder, and every
                rule that shapes it — the crop, the grayscale, the mask that
                fades it into the copy — was already on .portraitSlot waiting
                for an <img>, which is why the swap moved nothing.

                `priority`: this is above the fold on every width and is the
                page's likely LCP element. It is the one image on the marketing
                cluster that should preload. */}
            <Image
              className={styles.portraitSlot}
              src="/founder/brett-workshop.jpg"
              alt="Brett, founder of Let’s Get Quoted, standing at a workbench in a workshop"
              width={1122}
              height={1402}
              sizes="(max-width: 860px) 100vw, 480px"
              priority
            />
          </figure>
        </section>

        {/* 2 — where it started. The target of "Read my story ↓"; the id is on
            the SECTION rather than the heading so the scroll-margin that
            clears the fixed header has something to sit on. */}
        <section
          className={`section-block ${styles.storyAnchor}`}
          id="my-story"
          aria-labelledby="founder-start-title"
        >
          <div className={styles.sectionHead}>
            <p className="eyebrow">Where it started</p>
            <h2 id="founder-start-title">
              Good contractors were losing work before the first phone call.
            </h2>
          </div>
          <p className={styles.prose}>{LEDE}</p>
          <p className={styles.prose}>{START_BODY}</p>
        </section>

        {/* 3 — the three problems LEDE just named, one card each. */}
        <section className="section-block" aria-labelledby="founder-broken-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">What felt broken</p>
            <h2 id="founder-broken-title">Three things, and they were all the same thing.</h2>
          </div>
          <ul className={styles.cards}>
            {BROKEN.map((item, index) => (
              <li key={item.title} className={styles.card}>
                {/* The numeral is rhythm, not information — the list already
                    carries the count. */}
                <span className={styles.cardNum} aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className={styles.cardTitle}>{item.title}</h3>
                <p className={styles.cardBody}>{item.body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* 4 — the answer, as one journey rather than a field-by-field
            diagram. An <ol>: these are five stages in order, and the arrows
            between them are CSS so they are never read aloud. */}
        <section className="section-block" aria-labelledby="founder-idea-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">The idea behind the product</p>
            <h2 id="founder-idea-title">One request should carry itself all the way to getting paid.</h2>
            <p className={styles.sectionLede}>
              What a homeowner types on your website should never be typed again. It becomes the
              job, the quote, the schedule and the invoice—the same record, moving forward.
            </p>
          </div>

          <ol className={styles.flow}>
            {FLOW.map((stage, index) => (
              <li key={stage.step} className={styles.flowStep}>
                <span className={styles.flowNum} aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className={styles.flowTitle}>{stage.step}</h3>
                <p className={styles.flowBody}>{stage.body}</p>
              </li>
            ))}
          </ol>

          <p className={styles.flowNote}>{FLOW_NOTE}</p>
        </section>

        {/* 5 — who it is for. The quote is the claim; the four principles are
            what holding to it costs. */}
        <section className="section-block" aria-labelledby="founder-who-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">Who I am building for</p>
            <h2 id="founder-who-title">The contractor who has not hired an office yet.</h2>
          </div>
          <blockquote className={styles.quote}>{MANIFESTO_QUOTE}</blockquote>
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

        {/* 6 — the business model. The dial stays; the twelve-row catalogue
            that used to sit beside it does not. Reprinting the whole feature
            index on a founder letter was /pricing's job being done twice, and
            it was the single longest thing on the page on a phone. The link
            below goes to the page that owns those numbers.

            Not an ExampleFrame — the price is real, and stamping "Example" on
            it would read as a hedge on the number itself. */}
        <section className="section-block" aria-labelledby="founder-model-title">
          <div className={styles.zeroBand}>
            <PriceZeroDial variant="lead" className={styles.zeroDial} />

            <div className={styles.zeroCopy}>
              <div className={styles.sectionHead}>
                <p className="eyebrow">The business model</p>
                <h2 id="founder-model-title">Start without another monthly bill.</h2>
              </div>
              <p className={styles.prose}>
                Flex gives a new contractor a $0 monthly base price. Solo, Growth and Scale add
                more included capacity and lower the LGQ platform fee as the business grows.
              </p>
              <p className={styles.zeroNote}>
                {PUBLIC_PRICING_SUMMARY} Card processing ({STRIPE_PROCESSING_NOTE}) is
                separate and goes to Stripe.
              </p>
              <Link href="/pricing" className={styles.pricingLink}>
                See pricing details <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </section>

        {/* 7 — the promise, signed. The monogram is a signature here, not a
            stand-in for a face; the face is at the top of the page. */}
        <section className="section-block" aria-labelledby="founder-promise-title">
          <div className={styles.sectionHead}>
            <p className="eyebrow">My promise</p>
            <h2 id="founder-promise-title">What I am holding this product to.</h2>
          </div>

          <div className={`panel ${styles.promise}`}>
            <p className={styles.prose}>{PROMISE_BODY}</p>

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

            <p className={styles.direction}>{DIRECTION}</p>

            <div className={styles.signature}>
              <span className={styles.monogram} aria-hidden="true">
                B
              </span>
              <span>
                <span className={styles.signatureName}>Brett</span>
                <span className={styles.signatureRole}>Founder, Let’s Get Quoted</span>
              </span>
            </div>
          </div>
        </section>

        {/* 8 */}
        <MarketingCta
          kicker="The next chapter is your business"
          title="Build something customers trust—and a system your team can run."
          note={`No card required. ${PUBLIC_PRICING_SUMMARY}`}
        />

        <SiteFooter />
      </div>

      {/* The page's ONE persistent mobile control. It is mobile-only by its own
          stylesheet and fades in past the hero, so it never doubles up with the
          hero's buttons. Nothing else on this page is sticky. */}
      <StickyCta href={APP_SIGNUP_URL} label="Build my free site" />
    </main>
  );
}
