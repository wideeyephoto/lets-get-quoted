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

export default function WebsiteBuilderPage() {
  return (
    <FeatureDetailLayout
      eyebrow="A professional contractor site in one click"
      title={
        <>
          Go from no website to <em>ready for business.</em>
        </>
      }
      lede="Enter a few business basics and generate a complete contractor site with services, local pages, FAQs and Smart Intake already connected. Edit everything before you publish."
      heroNote="The site, the subdomain and the instant estimate are included. There is no subscription and no setup fee — the platform fee applies only when a homeowner pays you."
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
      secondary={{ label: 'See publishing and what follows', href: '#publish' }}
      proof={[
        {
          title: 'One-click starting site',
          body: 'Generate a complete first version in minutes.',
        },
        {
          title: `Built for ${TRADES.length} trades`,
          body: 'Trade-aware services and intake from the start.',
        },
        {
          title: 'Everything is editable',
          body: 'Change every word, service and service area.',
        },
        {
          title: 'Your domain stays yours',
          body: 'Build the brand around your business—not ours.',
        },
      ]}
      story={{
        eyebrow: 'Look established from the first click',
        title: 'A beautiful site should be the beginning—not the whole product.',
        body: 'Most website builders stop after publishing. Let’s Get Quoted connects the front door to the work behind it, so a visitor can become a qualified lead, an approved quote, a scheduled job and a paid customer without falling into a disconnected tool stack.',
      }}
      benefits={[
        {
          title: 'Start with a complete structure',
          body: 'Launch services, service areas, trust content, FAQs and intake without staring at a blank page.',
        },
        {
          title: 'Make it unmistakably yours',
          body: 'Edit the message, visual details, offers and geographic coverage before the site goes live.',
        },
        {
          title: 'Turn visits into useful requests',
          body: 'Smart Intake gathers better project context than a generic contact form.',
        },
        {
          title: 'Answer “what will this cost?” on the page',
          body: 'The instant estimate is the site’s front door: a visitor describes the job, the site asks the follow-up questions your trade actually needs, and it shows a realistic range in the same visit. You can shade that range toward budget or premium in settings — and you receive the description, the answers and the range together.',
        },
        {
          title: 'Connect the next step',
          body: 'Every lead can move directly into quoting, scheduling, texting and payment.',
        },
        {
          title: 'Keep the address you build equity in',
          body: `Publish on a free ${SITE.host} subdomain today, then point your own domain at the site whenever you are ready. You register it, you own the registration, and it stays yours if you ever leave — you are building traffic to your address, not renting ours.`,
        },
      ]}
      stepsEyebrow="Eight steps, start to first request"
      stepsTitle="Your website becomes the front door to an automated back office."
      steps={[
        {
          // The source draft's first step, kept word for word. The three that
          // follow are not a replacement for it — they are what "business
          // basics" turns out to mean in the actual form, spelled out.
          title: 'Add business basics',
          body: 'Tell us the company, trade and service area.',
        },
        {
          title: 'Enter your company name',
          body: 'The business name is the only thing you have to have ready. It sets the brand, the page titles and the address we suggest.',
        },
        {
          title: 'Pick your trade',
          body: `Choose from ${TRADES.length} trades. The services, the FAQs and the questions the intake asks are all built for that trade rather than for contractors in general.`,
        },
        {
          title: 'Set your service area',
          body: 'Name the towns you cover. They become your local pages, and they are what tells a later request whether it is in your area or outside it.',
        },
        {
          title: 'Generate the starting site',
          body: 'AI creates the initial pages and content.',
        },
        {
          title: 'Review and personalize',
          body: 'Edit every important detail before publishing.',
        },
        {
          title: 'Publish',
          body: 'One action takes the site from draft to live on your free subdomain. Point your own domain at it now or later — publishing does not wait on DNS, and re-publishing an edit is the same single action.',
        },
        {
          title: 'Start qualifying visitors',
          body: 'Smart Intake begins turning traffic into usable opportunities.',
        },
      ]}
      cta={{
        title: 'Launch the contractor site your business deserves.',
        note: `No subscription and no setup fee. The platform fee is ${FEE_TIERS[0].rate} of what you collect and falls to ${FEE_TIERS[FEE_TIERS.length - 1].rate} as your volume grows, plus Stripe processing (${STRIPE_PROCESSING_NOTE}).`,
      }}
    >
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
    </FeatureDetailLayout>
  );
}
