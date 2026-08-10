import type { Metadata } from 'next';
import FeatureDetailLayout from '@/components/marketing/feature-detail-layout';
import ExampleFrame from '@/components/marketing/example-frame';
import { TRADES } from '@/lib/trades';
import { FEE_TIERS, STRIPE_PROCESSING_NOTE } from '@/lib/pricing';
import styles from './website-builder.module.css';

export const metadata: Metadata = {
  title: 'AI Website Builder for Contractors',
  description:
    'Launch a complete, editable contractor website and connect it to your back office.',
  alternates: { canonical: 'https://letsgetquoted.com/features/website-builder' },
  /* THE SOCIAL CARD IS THIS PAGE'S, NOT THE HOMEPAGE'S.
     Next replaces the parent metadata's `openGraph` object wholesale rather
     than merging into it — but only if the child declares one. Without this
     block every share of this URL unfurled as the homepage: its title, its
     description, a screenshot of a website template, and an og:url pointing at
     letsgetquoted.com, so the card sent people somewhere else entirely. */
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/features/website-builder',
    siteName: "Let's Get Quoted",
    title: 'A contractor website that turns visits into ready-to-quote jobs.',
    description:
      'Launch a complete, editable contractor site in minutes — built for your trade, with an instant estimate form wired in from day one. Your domain stays yours.',
    images: [{ url: '/features/og-website-builder.jpg', width: 1200, height: 630, alt: 'Let’s Get Quoted AI website builder for contractors' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'A contractor website that turns visits into ready-to-quote jobs.',
    description:
      'Launch a complete, editable contractor site in minutes — built for your trade, with an instant estimate form wired in from day one. Your domain stays yours.',
    images: ['/features/og-website-builder.jpg'],
  },
};

/* One invented business, used by every mock on the page, so the site preview,
   the publish panel and the request that lands are visibly the same company at
   three moments rather than three unrelated screenshots. */
const SITE = {
  company: 'Cedar Creek Roofing',
  area: 'Fairview, Northgate and 6 nearby towns',
  host: 'letsgetquoted.com',
  subdomain: 'cedarcreekroofing.letsgetquoted.com',
  domain: 'cedarcreekroofing.com',
  /* The real default CNAME target — see CUSTOM_DOMAIN_CNAME_TARGET in
     src/lib/domains.ts. A made-up hostname here would be a made-up instruction. */
  cname: 'domains.letsgetquoted.com',
  low: '$9,400',
  high: '$13,200',
};

/* The four beats a visitor moves through, which is the page's whole argument
   about why a contractor site is not the same thing as a website. */
const JOURNEY: { n: string; title: string; body: string }[] = [
  { n: '01', title: 'Visit', body: 'Service and local pages built for the work you actually sell.' },
  { n: '02', title: 'Qualify', body: 'Smart Intake asks the follow-ups your trade needs.' },
  { n: '03', title: 'Estimate', body: 'A useful range answers the question they came with.' },
  { n: '04', title: 'Win the job', body: 'Quote, schedule, text and get paid on the same record.' },
];

/* Answers checked against the product, not against the pitch: the trade list
   is TRADES, the free subdomain and the custom-domain switch are
   lib/domains.ts and contractor-brand.ts, and what lands in the inbox is the
   panel further up this page. */
const FAQ: { q: string; a: string }[] = [
  {
    q: 'How much do I need to have ready?',
    a: 'Your business name is enough to begin. Choose your trade and service area, then review the services, pages and FAQs we generate before anything is published.',
  },
  {
    q: 'Can I change the generated content?',
    a: 'Yes — every word of it, before the site goes live and any time afterwards. The services, the service areas, the FAQs and the visual details are all yours to edit.',
  },
  {
    q: 'Do I need to own a domain already?',
    a: `No. You publish immediately on the included ${SITE.host} subdomain, and connect a domain you own whenever you are ready. Publishing never waits on DNS.`,
  },
  {
    q: 'What happens when somebody requests an estimate?',
    a: 'You get the job description, the trade-specific answers, the location, any photos and the range the visitor was shown — together, on one request, ready to quote or text back.',
  },
  {
    q: 'What does it cost to run?',
    a: `Nothing monthly. The platform fee is ${FEE_TIERS[0].rate} of what a homeowner actually pays you, falling to ${FEE_TIERS[FEE_TIERS.length - 1].rate} as your yearly volume grows, plus Stripe's standard processing (${STRIPE_PROCESSING_NOTE}).`,
  },
];

export default function WebsiteBuilderPage() {
  return (
    <FeatureDetailLayout
      eyebrow="AI website builder for contractors"
      /* The old headline described the transition ("from no website to ready
         for business") and left the reader to work out what the site DOES. The
         outcome is the differentiator: other builders end at a contact form,
         and this one hands you a job you can quote. */
      title={
        <>
          A contractor website that turns visits into <em>ready-to-quote jobs.</em>
        </>
      }
      lede="Tell us your business name, trade and service area. We build the complete site — then connect every visitor to an instant estimate and a request you can act on."
      // Not the fee — the closing band states it in full, with the rate range
      // and Stripe's cut. What belongs here is what a contractor about to
      // generate a site wants to know: that it is theirs. Custom domains are
      // real (contractor-brand.ts carries custom_domain + custom_domain_verified_at).
      heroNote="The site, the subdomain and the instant estimate are included. Connect your own domain when you are ready, and edit every word before anything goes live."
      demo={
        <ExampleFrame
          label="A generated site, before a word has been edited — with the instant estimate on the front page."
          note="Invented company, invented range. The numbers a real visitor sees come from your trade, your job description and your own pricing posture."
        >
          <div className={styles.browser}>
            <div className={styles.browserBar}>
              <span className={styles.dots} aria-hidden="true">
                <span className={styles.dot} />
                <span className={styles.dot} />
                <span className={styles.dot} />
              </span>
              <span className={styles.url}>{SITE.domain}</span>
            </div>

            <div className={styles.site}>
              <div className={styles.siteTop}>
                <span className={styles.siteBrand}>{SITE.company}</span>
                <span className={styles.sitePhone}>(555) 014-2280</span>
              </div>

              <ul className={styles.siteNav}>
                <li>Services</li>
                <li>Service area</li>
                <li>Reviews</li>
                <li>FAQs</li>
                <li>Get an estimate</li>
              </ul>

              {/* A <p>, not an <h3>: this is a picture of somebody else's page.
                  A real heading here would put an h3 above every h2 on this
                  page and hand a screen-reader user a heading tree in which the
                  mock outranks the sections. */}
              <p className={styles.siteHeadline}>
                Roof repairs and full replacements, done when we said we&rsquo;d do them.
              </p>
              <p className={styles.siteSub}>Serving {SITE.area}.</p>

              <div className={styles.estimate}>
                <p className={styles.estimateTitle}>Instant estimate</p>
                <p className={styles.estimateAsk}>What needs doing?</p>
                <p className={styles.estimateField}>
                  &ldquo;Shingles came off in the storm and there&rsquo;s a water stain on
                  the bedroom ceiling. Single storey, about 1,900 sq ft.&rdquo;
                </p>
                <div className={styles.estimateOut}>
                  <span className={styles.estimateLabel}>Estimated range for this job</span>
                  <span className={styles.estimateRange}>
                    {SITE.low} &ndash; {SITE.high}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </ExampleFrame>
      }
      secondary={{ label: 'See how it works', href: '#how-it-works' }}
      proof={[
        {
          title: 'Minutes, not weeks',
          body: 'A complete first draft in one sitting.',
        },
        {
          title: `Built for ${TRADES.length} trades`,
          body: 'Content and intake that know your work.',
        },
        {
          title: 'Edit absolutely everything',
          body: 'Your words, services, colours and areas.',
        },
        {
          title: 'Your domain stays yours',
          body: 'Build equity in an address you own.',
        },
      ]}
      story={{
        eyebrow: 'Look established from the first click',
        title: 'A beautiful site should be the beginning—not the whole product.',
        body: 'Most website builders stop after publishing. Let’s Get Quoted connects the front door to the work behind it, so a visitor can become a qualified lead, an approved quote, a scheduled job and a paid customer without falling into a disconnected tool stack.',
      }}
      /* SIX BECAME THREE.
         The six read as one idea told six ways — start with a structure, make
         it yours, turn visits into requests, answer the price question, connect
         the next step, keep your domain. Three of those are the same claim at
         different distances from the visitor, and two more (editing, the
         domain) are answered in full by their own section further down, where
         a panel shows them rather than a sentence asserting them. What is left
         is the three things that happen to a visitor, in order. */
      benefits={[
        {
          title: 'Look established from click one',
          body: 'Launch with polished service pages, local pages, trust content and FAQs — without starting from a blank screen.',
        },
        {
          title: 'Answer “how much?” while interest is high',
          body: 'The instant estimator asks the follow-up questions your trade actually needs and gives a visitor a useful range in the same session. You can shade that range toward budget or premium in settings.',
        },
        {
          title: 'Receive a request you can act on',
          body: 'The description, the answers, the location, the photos and the range arrive together — ready to quote, text or schedule.',
        },
      ]}
      storyId="how-it-works"
      stepsEyebrow="Three answers. One complete site."
      stepsTitle="Go from “we need a website” to ready for business."
      /* EIGHT STEPS BECAME FOUR.
         Steps one to four were "add business basics" followed by the three
         things business basics turns out to mean, so the list opened by
         counting the same action twice; seven and eight were publishing and
         what happens after it, which is a section of its own further down.
         What a contractor actually has to supply is three answers. */
      steps={[
        {
          title: 'Your business name',
          body: 'The only thing you have to have ready. It sets the brand, the page titles and the address we suggest.',
        },
        {
          title: 'Your trade',
          body: `Choose from ${TRADES.length}. The services, the FAQs and the questions the intake asks are built for that trade rather than for contractors in general.`,
        },
        {
          title: 'Your service area',
          body: 'Name the towns you cover. They become your local pages, and they are what tells a later request whether it is in your area or outside it.',
        },
        {
          title: 'Review, personalise and publish',
          body: 'Every word stays editable. Go live on the free subdomain now and connect your own domain whenever you are ready — publishing never waits on DNS.',
        },
      ]}
      cta={{
        title: 'Launch the contractor site your business deserves.',
        note: `No subscription and no setup fee. The platform fee is ${FEE_TIERS[0].rate} of what you collect and falls to ${FEE_TIERS[FEE_TIERS.length - 1].rate} as your volume grows, plus Stripe processing (${STRIPE_PROCESSING_NOTE}).`,
      }}
    >
      {/* ------------------------------------------------------------------
          WHERE A VISITOR GOES.

          The page's own argument, drawn: four beats from landing on a service
          page to money, and the one comparison that says what a website
          builder normally hands you at the end of it. Nothing here is a claim
          about anybody else's product — "contact form submitted" is what a
          form does, and the point is only that it is where the trail stops.
          ------------------------------------------------------------------ */}
      <section className="section-block" aria-labelledby="journey-title">
        <div className={styles.sectionHead}>
          <p className="eyebrow">One connected customer journey</p>
          <h2 id="journey-title">
            Other builders stop at &ldquo;submit.&rdquo; Yours keeps the job moving.
          </h2>
          <p>
            A visitor should not fall into a disconnected inbox. The context they gave the
            site &mdash; what the job is, where it is, when they want it, what it might cost
            &mdash; travels with the request instead of being retyped by you.
          </p>
        </div>

        <ol className={styles.journey}>
          {JOURNEY.map((beat) => (
            <li key={beat.title}>
              <span className={styles.journeyNum} aria-hidden="true">{beat.n}</span>
              <h3>{beat.title}</h3>
              <p>{beat.body}</p>
            </li>
          ))}
        </ol>

        <div className={styles.compare}>
          <div>
            <span>A typical website builder</span>
            <strong>Contact form submitted</strong>
            <small>And then the retyping starts.</small>
          </div>
          <span className={styles.compareArrow} aria-hidden="true">&rarr;</span>
          <div className={styles.compareGood}>
            <span>Let&rsquo;s Get Quoted</span>
            <strong>Quote-ready request received</strong>
            <small>The job context arrives with it.</small>
          </div>
        </div>
      </section>

      <section className="section-block" id="publish" aria-labelledby="publish-title">
        <div className={styles.sectionHead}>
          <p className="eyebrow">Step seven and step eight</p>
          <h2 id="publish-title">Publishing is one action. What arrives after it is the point.</h2>
          <p>
            Both panels below are {SITE.company} &mdash; the same invented business as the
            site preview above, a few minutes later. Publishing puts the site live on the
            free subdomain immediately; the custom domain is a separate switch you can throw
            whenever the registrar paperwork is done, and it never blocks going live.
          </p>
        </div>

        <div className={styles.twoPanel}>
          <ExampleFrame
            label="Publishing, and where the site lives afterwards."
            note="The CNAME target shown is the real one. The domain and business are invented."
          >
            <div className={styles.panelStack}>
              <div className={styles.rowTop}>
                <p className={styles.blockTitle}>Site status</p>
                <span className={styles.statusFlow}>
                  <span className={styles.pill}>Draft</span>
                  <span className={styles.arrow} aria-hidden="true">
                    &rarr;
                  </span>
                  <span className={`${styles.pill} ${styles.pillLive}`}>Live</span>
                </span>
              </div>

              <ul className={styles.addrList}>
                <li className={styles.addr}>
                  <span className={styles.addrName}>{SITE.subdomain}</span>
                  <span className={`${styles.addrNote} ${styles.addrOk}`}>
                    Included &middot; live now
                  </span>
                </li>
                <li className={styles.addr}>
                  <span className={styles.addrName}>{SITE.domain}</span>
                  <span className={`${styles.addrNote} ${styles.addrOk}`}>
                    Connected &middot; verified
                  </span>
                </li>
              </ul>

              <p className={styles.dnsLine}>
                CNAME &nbsp;www &rarr; {SITE.cname}
              </p>

              <p className={styles.ownership}>
                You buy {SITE.domain} from a registrar in your own name and point it here.
                We never hold the registration, so the address your customers, your truck
                and your invoices all carry stays with you.
              </p>

              <div className={styles.ghostRow}>
                <span className={styles.ghostBtn}>Publish changes</span>
                <span className={styles.ghostBtn}>Preview as visitor</span>
              </div>
            </div>
          </ExampleFrame>

          <ExampleFrame
            label={`The first request the published site sends you — the same job the visitor priced in the preview above.`}
            note="Invented request. The service-area line is derived from the towns you entered in step four; no per-request mileage is calculated."
          >
            <div className={styles.panelStack}>
              <div className={styles.rowTop}>
                <p className={styles.blockTitle}>New request &middot; 6:12 PM</p>
                <span className={`${styles.pill} ${styles.pillNew}`}>Unread</span>
              </div>

              <p className={styles.quote}>
                &ldquo;Shingles came off in the storm and there&rsquo;s a water stain on the
                bedroom ceiling. Single storey, about 1,900 sq ft. Hoping to get it looked at
                this week.&rdquo;
              </p>

              <dl className={styles.factList}>
                <dt>Job</dt>
                <dd>Roof repair &mdash; storm damage</dd>
                <dt>Property</dt>
                <dd>Fairview</dd>
                <dt>Location</dt>
                <dd>In your service area</dd>
                <dt>Timeline</dt>
                <dd>This week</dd>
                <dt>Photos</dt>
                <dd>3 attached</dd>
                <dt>Range shown to visitor</dt>
                <dd className={styles.money}>
                  {SITE.low} &ndash; {SITE.high}
                </dd>
              </dl>

              <div className={styles.ghostRow}>
                <span className={styles.ghostBtn}>Send quote</span>
                <span className={styles.ghostBtn}>Text back</span>
              </div>
            </div>
          </ExampleFrame>
        </div>
      </section>

      {/* ------------------------------------------------------------------
          THE PRACTICAL QUESTIONS.

          <details>, not a script: it works before hydration, it is in the tab
          order for free, and a browser's own find-in-page opens it. The first
          one is open because a closed accordion with nothing showing reads as
          a list of headings rather than as answers.

          Every answer is checkable against the product. Nothing here promises
          a capability the rest of the page has not already shown.
          ------------------------------------------------------------------ */}
      <section className="section-block" aria-labelledby="faq-title">
        <div className={styles.sectionHead}>
          <p className="eyebrow">Before you build</p>
          <h2 id="faq-title">The practical questions.</h2>
        </div>

        {/* No `name` on the details: an exclusive accordion closes the answer
            you were reading to open the one you glanced at, and it hides every
            other answer from the browser's own find-in-page. Five short
            answers can all be open at once. */}
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
