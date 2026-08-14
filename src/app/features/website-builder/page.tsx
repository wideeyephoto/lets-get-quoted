import type { Metadata } from 'next';
import Link from 'next/link';
import FeatureDetailLayout from '@/components/marketing/feature-detail-layout';
import ExampleFrame from '@/components/marketing/example-frame';
import ExampleSiteShowcase from '@/components/marketing/example-site-showcase';
import HeroThemeCycler from './HeroThemeCycler';
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

/* WHERE THE TRAIL GOES, in four links rather than in a twelve-entry catalog.
   The page used to end its argument with the whole "Your website" category read
   out of lib/features.ts — 1,837px on a phone, and every claim in it already
   made further up. What a visitor actually wants at this point is not a longer
   list of what the site has; it is the page for whatever happens after the
   request lands. These are those pages, and nothing else. */
const NEXT: { href: string; label: string }[] = [
  { href: '/features/ai-intake', label: 'Smart Intake' },
  { href: '/features/quotes', label: 'Quotes + e-sign' },
  { href: '/features/scheduling', label: 'Scheduling' },
  { href: '/features/payments', label: 'Payments' },
];

/* THE REST OF THE PRODUCT, FROM THE PAGE MOST PEOPLE ARRIVE ON.
   The four links above follow one request through to getting paid, which is the
   journey this page argues for — and they were the only four internal links on
   it. That left eight capability pages reachable from here only by going back
   to /features and starting again, on the page a contractor lands on first.
   Each line says what the page is FOR rather than repeating its title, because
   a column of product names is a sitemap and this is meant to be read. */
const ELSEWHERE: { href: string; label: string; body: string }[] = [
  { href: '/features/reviews', label: 'Reviews', body: 'Ask after the work is done, and put the good ones on the site itself.' },
  { href: '/features/client-portal', label: 'Client portal', body: 'One link where a customer finds their quote, visit, invoice and photos.' },
  { href: '/features/recurring', label: 'Recurring work', body: 'Plans that create their own jobs on the morning of the visit.' },
  { href: '/features/quick-stops', label: 'Quick Stops', body: 'Fill a gap in the day with a nearby job worth the detour.' },
  { href: '/features/crew', label: 'Crew & labor', body: 'Who is on what, hours worked, and what the day actually cost.' },
  { href: '/features/back-office', label: 'Back office', body: 'One record per job, from the first message to the last payment.' },
  { href: '/features/cash-flow', label: 'Cash flow', body: 'What is owed, what is coming, and what it leaves you with.' },
  { href: '/pricing', label: 'Pricing', body: 'No monthly subscription. A per-job fee, and Stripe’s cut named in full.' },
];

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
    q: 'What kind of video can I put on it?',
    a: 'Your own — filmed on a phone is fine. Drop in an MP4, a MOV or a YouTube link and choose from six layouts: a hero loop behind your headline, video beside your message, a project story, a reel of tall phone clips, a customer on camera, or one video above the steps of what happens next. Up to four video bands on a page. The builder checks each clip as it uploads and tells you if it is too big, too long for a background loop, or in a format most visitors could not play — and what to change. It advises rather than refusing, because your site is yours.',
  },
  {
    q: 'What does it cost to run?',
    a: `Nothing monthly. The platform fee is ${FEE_TIERS[0].rate} of what a homeowner actually pays you, falling to ${FEE_TIERS[FEE_TIERS.length - 1].rate} as your yearly volume grows, plus Stripe's standard processing (${STRIPE_PROCESSING_NOTE}).`,
  },
];

export default function WebsiteBuilderPage() {
  return (
    <FeatureDetailLayout
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
      lede="Tell us your business name, trade and service area. We build the complete site — then connect every visitor to an instant estimate and a request you can act on."
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
      heroNote="Published on a free subdomain the moment it is ready. Connecting a custom domain is a separate switch that never holds up going live."
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
          body: 'Launch with polished service pages, local pages, trust content and FAQs — without starting from a blank screen. Put your own footage on them too, in six video layouts.',
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
      /* A SITE SOMEBODY ACTUALLY PUBLISHED, right after the three things the
         page has just promised and before the four answers it takes to get one.
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
         The proof strip, the story and the three benefits all still make their
         case; they now make it to a reader who has already seen the thing. */
      afterHero={
        <ExampleSiteShowcase
          /* Sentence case in the source, uppercase on screen — .eyebrow carries
             text-transform. Storing the caps would put them in the DOM, where
             several screen readers spell an all-capital phrase out letter by
             letter. The rendered result is identical either way. */
          eyebrow="Instant website generation for contractors"
          title="Your complete contractor website, generated instantly."
          body="Enter a few details about your business and Let’s Get Quoted creates your service pages, project gallery, trust signals and instant estimate—all connected and ready to customize."
          linkLabel="Visit the Lawn & Order example site ↗"
          support={{
            src: '/media/website-builder/lawn-and-order/lawn-and-order-project-gallery.jpg',
            alt: 'Lawn & Order project gallery showing landscaping service examples.',
            label: 'Generated together',
            caption:
              'Service pages, project galleries, reviews and instant estimates—generated as one connected site.',
            width: 1425,
            height: 891,
          }}
        />
      }
      storyId="how-it-works"
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
          body: 'The only thing you have to have ready. It sets the brand, the page titles and the address we suggest.',
        },
        {
          title: 'Your trade',
          body: `Choose from ${TRADES.length}. The services, the FAQs and the questions the intake asks are built for that trade rather than for contractors in general.`,
        },
        {
          title: 'Your service area',
          body: 'Name the towns you cover. They become your local pages, and they are what tells a later request whether it is in your area or outside it. Every word we generate stays editable before anything goes live.',
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
            The context a visitor gives the site &mdash; what the job is, where it is, when
            they want it, what it might cost &mdash; travels with the request instead of
            being retyped by you.
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

        {/* Names only, deliberately. A sentence under each would be the same
            claim the beats above have just made, one row lower. */}
        <div className={styles.next}>
          <p className={styles.nextLabel} id="next-label">
            What happens to that request
          </p>
          <ul className={styles.nextLinks} aria-labelledby="next-label">
            {NEXT.map((item) => (
              <li key={item.href}>
                <Link href={item.href}>
                  {item.label} <span aria-hidden="true">&rarr;</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section-block" id="publish" aria-labelledby="publish-title">
        <div className={styles.sectionHead}>
          {/* Not "step seven and step eight". It said that for one release
              after the eight steps became four, which is the failure mode of
              writing a number into prose that describes a list somewhere else
              on the page. Named by what happens instead. */}
          <p className="eyebrow">The last answer, and the first request</p>
          <h2 id="publish-title">Publishing is one action. What arrives after it is the point.</h2>
          <p>
            Both panels are {SITE.company}, an invented company, a few minutes after
            generating its site. Publishing goes live on the free subdomain at once;
            a custom domain is a separate switch that never blocks it.
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
            label="The first request the published site sends you."
            note="Invented company, invented range. The service-area line is derived from the towns you named as your service area; no per-request mileage is calculated."
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

      {/* -------------------------------------------------------------------
          WHERE THE REST OF IT IS.

          The site is the front door and this is the page most people arrive
          on, so it was the worst place in the product to be a dead end — four
          links out, all of them following the same one request to payment, and
          eight capability pages you could only reach by going back to
          /features and starting again.

          Real anchor text, and a line saying what each page is for. "Reviews →"
          on its own is a nav item; a reader deciding whether that page is worth
          a click needs the sentence, and a search engine reading this page for
          what it connects to needs it more.
          ------------------------------------------------------------------ */}
      <section className="section-block" aria-labelledby="elsewhere-title">
        <div className={styles.sectionHead}>
          <p className="eyebrow">The rest of the back office</p>
          <h2 id="elsewhere-title">The site is the front door. This is the building.</h2>
          {/* No class: .sectionHead > p already styles the lede, and
              styles.sectionLede does not exist — a CSS-module miss is silently
              `undefined` rather than an error. */}
          <p>
            Every request the site sends you lands in the same place as the work you already have — so the
            quote, the visit, the crew, the invoice and the review are one job rather than five tools.
          </p>
        </div>

        <ul className={styles.elsewhere}>
          {ELSEWHERE.map((item) => (
            <li key={item.href}>
              <Link href={item.href}>
                <strong>
                  {item.label} <span aria-hidden="true">&rarr;</span>
                </strong>
                <span>{item.body}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </FeatureDetailLayout>
  );
}
