import type { Metadata } from 'next';
import Link from 'next/link';
import FeatureDetailLayout from '@/components/marketing/feature-detail-layout';
import ExampleFrame from '@/components/marketing/example-frame';
import ExampleSiteShowcase from '@/components/marketing/example-site-showcase';
import HeroThemeCycler from './HeroThemeCycler';
import { TRADES } from '@/lib/trades';
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

/* THE REST OF THE PRODUCT, IN A SENTENCE.
   This closed with eight cards — Reviews, Client portal, Recurring work, Quick
   Stops, Crew, Back office, Cash flow, Pricing — each with a line explaining
   what it was for, on a page whose reader is deciding whether to generate a
   website. Every one of those explanations is a second decision offered before
   the first one has been made. The five that a REQUEST actually passes through
   survive, as links inside the sentence that names them; the rest are one click
   away at /features, which is where somebody browsing the product is going.

   The `href:`/`label:` shape is deliberate rather than incidental: the suite
   test reads these hrefs out of the source and checks each one has a page. */
const SUITE: { href: string; label: string }[] = [
  { href: '/features/quotes', label: 'quoting' },
  { href: '/features/scheduling', label: 'scheduling' },
  { href: '/features/payments', label: 'payments' },
  { href: '/features/reviews', label: 'reviews' },
  { href: '/features/client-portal', label: 'the client portal' },
];

/* The four beats a visitor moves through, which is the page's whole argument
   about why a contractor site is not the same thing as a website. */
const JOURNEY: { n: string; title: string; body: string }[] = [
  { n: '01', title: 'Visit', body: 'Service and local pages built around the work you sell.' },
  { n: '02', title: 'Qualify', body: 'Smart Intake asks the follow-up questions your trade needs.' },
  { n: '03', title: 'Estimate', body: 'Give the visitor a useful range while interest is high.' },
  { n: '04', title: 'Win the job', body: 'Quote, schedule, text and collect payment from the same record.' },
];

/* Answers checked against the product, not against the pitch: the trade list
   is TRADES, the free subdomain and the custom-domain switch are
   lib/domains.ts and contractor-brand.ts, and what lands in the inbox is the
   panel further up this page. */
const FAQ: { q: string; a: string }[] = [
  {
    q: 'How much do I need to have ready?',
    a: 'Your business name is enough to begin. Choose your trade and service area, then review everything we generate before publishing.',
  },
  {
    q: 'Can I change the generated content?',
    a: 'Yes. You can edit every service, page, FAQ, service area, color and visual detail before publishing and at any time afterward.',
  },
  {
    q: 'Do I need to own a domain already?',
    a: `No. Publish immediately on the included ${SITE.host} subdomain, then connect a domain you own whenever you are ready.`,
  },
  {
    q: 'What happens when somebody requests an estimate?',
    a: 'The job description, intake answers, location, photos and estimate range arrive together — ready for you to quote, schedule or reply.',
  },
  {
    /* SIX LAYOUTS is the number in VIDEO_SECTION_STYLES, and the suite test
       counts it there rather than trusting this sentence. What the answer no
       longer does is describe the upload checks in four clauses: this is a
       drawer on a page about generating a site, and the studio has a page of
       the product to explain itself on. */
    q: 'What kind of video can I add?',
    a: 'Upload an MP4 or MOV, or add a YouTube link. Choose from six layouts, including hero backgrounds, project stories and vertical-video reels.',
  },
  {
    /* NO RATE TYPED IN HERE ANY MORE, and that is the point of the link
       underneath. The fee is a schedule that falls with volume, so a marketing
       page repeating one end of it is a number that ages; /pricing renders it
       from FEE_TIERS. What is claimed here — no subscription, paid when you are
       paid, plus Stripe — is true at every tier. */
    q: 'What does it cost?',
    a: 'There is no monthly subscription. You pay a platform fee when a homeowner pays you, plus Stripe processing.',
  },
];

export default function WebsiteBuilderPage() {
  return (
    <FeatureDetailLayout
      breadcrumb={{ name: 'Website builder', path: '/features/website-builder' }}
      /* VIDEO IS NOT THE HEADLINE, and it was for one release.
         The studio is real and worth selling — six layouts, your own footage,
         checks that tell you when a clip will show a blank player — so it had
         been pushed into the eyebrow, the lede, the hero button and the nav
         label all at once. That is four places for a feature of the site to
         outrank the site, on the page a contractor arrives at because they do
         not have a website. It now lives where a capability belongs: in a
         benefit and in an answer. What is claimed there is still only what
         ships — nothing here writes a shot list. */
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
      lede="Tell us your business name, trade and service area. We’ll generate a complete contractor website with service pages, local pages, trust content and an instant estimate — ready for you to edit and publish."
      // Not the fee — the closing band states it in full, with the rate range
      // and Stripe's cut. What belongs here is what a contractor about to
      // generate a site wants to know: that it is theirs. Custom domains are
      // real (contractor-brand.ts carries custom_domain + custom_domain_verified_at).
      /* The three facts, above the button rather than in a sentence below it.
         They are the three objections in order — is the content mine to
         change, do I have to use your address, and is the estimator extra —
         and as prose under the actions they were read after the decision
         instead of before it. */
      heroChips={['Every word editable', 'Your own domain', 'Instant estimate included']}
      /* Two clauses, not three sentences. The old note explained the mechanism —
         that the custom domain is a separate switch which never holds up going
         live — which is a fact the publishing section shows in a panel further
         down. Here it only has to answer "so where does it live". */
      heroNote={`Publish free on a ${SITE.host} subdomain. Connect your own domain whenever you’re ready.`}
      /* THE HERO SHOWS THE PICKER, NOT A FINISHED SITE.

         What was here was one generated homepage with an instant estimate on
         it — a good picture of the OUTPUT, and the output is not what this page
         argues. The claim is that the site is yours and that changing it is
         instant, and a still of somebody else's finished homepage says neither
         of those. The generated site still appears twice further down, where it
         belongs: in ExampleSiteShowcase and in the request card.

         A replica made of the real parts, not a screenshot. ThemeIcon is the
         dashboard's own component and the templates and schemes are the real
         modules, so a ninth template joins this hero on its own — which is
         exactly what a screenshot cannot do, and would go stale instead. */
      /* THE HERO SHOWS THE PICKER, NOT A FINISHED SITE.

         What was here was one generated homepage with an instant estimate on
         it — a good picture of the OUTPUT, and the output is not what this page
         argues. The claim is that the site is yours and that changing it is
         instant, and a still of somebody else's finished homepage says neither
         of those. The generated site still appears twice further down, where it
         belongs: in ExampleSiteShowcase and in the request card.

         NO ExampleFrame AROUND IT, unlike the two panels lower down. That
         wrapper exists to label a DRAWING of a screen as a drawing — an honesty
         device for Cedar Creek Roofing, who does not exist. There is nothing to
         disclaim here: the panel is the real theme picker rendering the real
         /themes routes, so a caption explaining that it is only an example
         would have been the single inaccurate thing on it. */
      demo={<HeroThemeCycler />}
      /* SEEING THE DESIGNS IS THE STEP BEFORE SIGNING UP, so it leads.
         Nobody commits to a website they have not looked at, and this was the
         third of three buttons — behind an offer to build the thing and a jump
         link to an explanation of how. /demo/sites rather than /themes/<one
         template>: that route is a live picker — choose a template, tap an
         accent, watch a real preview redraw — and it loads the real /themes
         route in its frame, so "preview templates" is what it does rather than
         a single example labelled as a gallery. */
      primary={{ label: 'Preview site templates', href: '/demo/sites' }}
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
          body: 'Your words, services, colors and areas.',
        },
        {
          title: 'Your domain stays yours',
          body: 'Build equity in an address you own.',
        },
      ]}
      /* SIX BENEFITS BECAME THREE, AND THEN NONE.
         The three were "look established from click one", "answer how much
         while interest is high" and "receive a request you can act on" — which
         is the hero's promise in the first card, and beats one to four of the
         customer-journey section in the other two. The story above them said
         the same thing a fourth time in prose. So the band is gone rather than
         shortened: the argument it made is made twice on this page already,
         once by a picture of a real generated site and once by the journey.

         This is why `story` and `benefits` are optional on the layout. Both are
         omitted here; the layout drops the whole cream band when they are. */
      /* A SITE SOMEBODY ACTUALLY PUBLISHED, straight after the hero's claim and
         before the three answers it takes to get one.
         Every other panel on this page is a drawn mock of Cedar Creek Roofing,
         an invented company — necessary, because the panels show screens that
         would otherwise expose a real contractor's customers. This one does not
         have that problem: it is a public marketing site, so it can be the real
         thing, and a page arguing "we build you a complete site" is much better
         off showing one than describing it a fourth time.

         WHAT IT DOES NOT CLAIM. Not a customer story, not a testimonial, no
         traffic or conversion number. The heading claims the site was generated
         — which is what the builder does, and what the hero above it has just
         demonstrated — and the link underneath still calls it an example and
         points at the URL, so a reader can check the claim rather than take it.
         That link is load-bearing now that the eyebrow no longer says
         "example": it is the only place the word appears. */
      /* FIRST THING UNDER THE HERO, because on this page the example IS the
         argument. It was passed to afterBenefits and landed 3,124px down on a
         phone with the video itself at 3,566 — three and a half screens of
         describing a website to somebody who could have been looking at one.
         The proof strip and the journey still make their case; they now make it
         to a reader who has already seen the thing. */
      afterHero={
        <ExampleSiteShowcase
          /* Sentence case in the source, uppercase on screen — .eyebrow carries
             text-transform. Storing the caps would put them in the DOM, where
             several screen readers spell an all-capital phrase out letter by
             letter. The rendered result is identical either way. */
          eyebrow="Instant website generation for contractors"
          title="Your complete contractor website, generated instantly."
          /* ONE SENTENCE, AND THE CAPTION UNDER THE STILL IS GONE. The two said
             the same thing forty words apart — "creates your service pages,
             project gallery, trust signals and instant estimate, all connected"
             and then "service pages, project galleries, reviews and instant
             estimates, generated as one connected site". A reader who noticed
             read it twice; a reader who did not lost nothing. */
          body="Your service pages, project gallery, reviews and instant estimate are generated together — then everything is yours to edit."
          linkLabel="Visit the Lawn & Order example site ↗"
          support={{
            src: '/media/website-builder/lawn-and-order/lawn-and-order-project-gallery.jpg',
            alt: 'Lawn & Order project gallery showing landscaping service examples.',
            label: 'Generated together',
            width: 1425,
            height: 891,
          }}
        />
      }
      stepsEyebrow="Three answers. One complete site."
      stepsTitle="Go from “we need a website” to ready for business."
      /* EIGHT STEPS BECAME FOUR, AND THEN THREE.
         Steps one to four were "add business basics" followed by the three
         things business basics turns out to mean, so the list opened by
         counting the same action twice; seven and eight were publishing and
         what happens after it, which is a section of its own further down.

         The fourth — review, personalize and publish — went the same way: the
         eyebrow above it says "Three answers", the section immediately below
         it is publishing with a panel of it, and reviewing your own draft is
         not an answer you have to have ready. What a contractor supplies is
         three things, and this now says three and shows three. */
      steps={[
        {
          title: 'Your business name',
          body: 'Sets the brand, the page titles and the site address we suggest.',
        },
        {
          title: 'Your trade',
          body: `Choose from ${TRADES.length}. We generate the services, the FAQs and the intake questions for your work.`,
        },
        {
          title: 'Your service area',
          body: 'Name the towns you cover. They become local pages, and they are what qualifies a later request as yours or somebody else’s.',
        },
      ]}
      /* The editing promise, said once for all three rather than tacked onto
         the end of the third card, where it was the longest clause in a row of
         short ones and belonged to none of them in particular. */
      stepsNote="Everything remains editable before and after you publish."
      /* The band takes strings. `note` is not one of the props it renders — the
         "No card required · No monthly subscription" line under the button is
         PageCTA's own, and the fee schedule it used to restate here lives on
         /pricing, which the FAQ links to. */
      cta={{
        kicker: 'Ready to build?',
        title: 'Launch a contractor website built to bring you quote-ready jobs.',
        body: 'Start with three answers. Edit everything. Publish when you’re ready.',
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
      <section className={`section-block ${styles.band}`} aria-labelledby="journey-title">
        <div className={styles.sectionHead}>
          <p className="eyebrow">One connected customer journey</p>
          <h2 id="journey-title">
            Other builders stop at &ldquo;submit.&rdquo; Yours keeps the job moving.
          </h2>
          <p>
            The details a visitor gives your site stay with the request, so you never have
            to retype them.
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

        {/* WHAT WAS HERE: a row of pills reading Smart Intake → Quotes + e-sign
            → Scheduling → Payments, under the heading "What happens to that
            request". Directly above them, the four beats say Qualify, Estimate
            and Win the job — the same sequence, in the same order, one row up.
            The links themselves were worth keeping; they are in the suite band
            at the foot of the page now, inside the sentence that needs them. */}
      </section>

      <section className={`section-block ${styles.band}`} id="publish" aria-labelledby="publish-title">
        <div className={styles.sectionHead}>
          {/* Not "step seven and step eight". It said that for one release
              after the eight steps became four, which is the failure mode of
              writing a number into prose that describes a list somewhere else
              on the page. Named by what happens instead. */}
          <p className="eyebrow">From publish to first request</p>
          <h2 id="publish-title">Publish your site. Receive a quote-ready request.</h2>
          <p>
            Go live immediately on a free {SITE.host} subdomain, then connect a domain you
            own whenever you&rsquo;re ready. Every request arrives with the job
            description, location, photos, answers and estimate range together.
          </p>
        </div>

        <div className={styles.twoPanel}>
          <ExampleFrame label="Publishing, and where the site lives afterwards.">
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

              {/* The record itself stays — it is the real target from
                  lib/domains.ts, and it is what makes the panel a screen rather
                  than a diagram. The paragraph that used to sit under it,
                  explaining that you buy the domain from a registrar in your own
                  name and we never hold the registration, does not: "Your domain
                  stays yours" is a proof point at the top of this page and the
                  hero note says where the site lives. */}
              <p className={styles.dnsLine}>
                CNAME &nbsp;www &rarr; {SITE.cname}
              </p>

              <div className={styles.ghostRow}>
                <span className={styles.ghostBtn}>Publish changes</span>
                <span className={styles.ghostBtn}>Preview as visitor</span>
              </div>
            </div>
          </ExampleFrame>

          <ExampleFrame label="The first request the published site sends you.">
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

        {/* ONE CAPTION FOR BOTH PANELS, in place of the two notes that hung off
            them. The left one repeated that the CNAME target is real and the
            business is not; the right one explained, in a sentence and a
            semicolon, that the service-area line comes from the towns you named
            rather than from a mileage calculation nobody claimed. Both were
            longer than the thing they qualified. What has to survive is the
            honesty: the company is invented, and the DNS is not. */}
        <p className={styles.exampleNote}>
          The company, request and estimate are examples. The domain configuration shown
          is real.
        </p>
      </section>

      {/* ------------------------------------------------------------------
          THE PRACTICAL QUESTIONS.

          <details>, not a script: it works before hydration, it is in the tab
          order for free, and a browser's own find-in-page opens it.

          ALL SIX START CLOSED. The first one used to be open so the section did
          not read as a list of headings — but that argument was for a section
          arriving after two thousand words of pitch. This one arrives after a
          shorter page, and six closed rows are six questions a reader scans;
          one open answer is an answer they have to scroll past to find theirs.
          ------------------------------------------------------------------ */}
      <section className={`section-block ${styles.band}`} aria-labelledby="faq-title">
        <div className={styles.sectionHead}>
          <p className="eyebrow">Practical questions</p>
          <h2 id="faq-title">Questions before you build.</h2>
        </div>

        {/* No `name` on the details: an exclusive accordion closes the answer
            you were reading to open the one you glanced at, and it hides every
            other answer from the browser's own find-in-page. Six short
            answers can all be open at once. */}
        <div className={styles.faq}>
          {FAQ.map((item) => (
            <details key={item.q}>
              <summary>
                <span>{item.q}</span>
                <i aria-hidden="true" />
              </summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>

        {/* The cost answer no longer names a rate, so it owes the reader the
            page that does. */}
        <p className={styles.faqMore}>
          <Link href="/pricing">
            See full pricing <span aria-hidden="true">&rarr;</span>
          </Link>
        </p>
      </section>

      {/* -------------------------------------------------------------------
          WHERE THE REST OF IT IS, IN THREE LINES.

          This was eight cards with a sentence each — Reviews, Client portal,
          Recurring work, Quick Stops, Crew, Back office, Cash flow, Pricing —
          and every sentence asked the reader to consider a second product
          before they had decided about the first. The reason it existed is
          still good: this is the page most people arrive on, and a dead end
          here is the worst dead end in the product. So the links stay and the
          catalog goes. Five product names inside the sentence that needs them,
          and one link to the page that lists the rest.
          ------------------------------------------------------------------ */}
      <section className={`section-block ${styles.band}`} aria-labelledby="suite-title">
        <div className={styles.sectionHead}>
          <p className="eyebrow">Part of the full contractor suite</p>
          <h2 id="suite-title">Your website is only the front door.</h2>
          {/* No class: .sectionHead > p already styles the lede, and
              styles.sectionLede does not exist — a CSS-module miss is silently
              `undefined` rather than an error. */}
          <p>
            Every request flows into{' '}
            {SUITE.map((item, index) => (
              <span key={item.href}>
                {index > 0 ? (index === SUITE.length - 1 ? ' and ' : ', ') : null}
                <Link className={styles.suiteLink} href={item.href}>
                  {item.label}
                </Link>
              </span>
            ))}
            {' '}&mdash; without retyping the job.
          </p>
        </div>

        <p className={styles.suiteMore}>
          <Link href="/features">
            Explore all features <span aria-hidden="true">&rarr;</span>
          </Link>
        </p>
      </section>
    </FeatureDetailLayout>
  );
}
