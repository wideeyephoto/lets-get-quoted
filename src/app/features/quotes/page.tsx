/* eslint-disable @next/next/no-img-element */
import type { Metadata } from 'next';
import ExampleFrame from '@/components/marketing/example-frame';
import SuiteFeaturePage, {
  Panel,
  PanelActions,
  PanelHead,
  PanelNote,
  PanelRows,
} from '@/components/marketing/suite-feature-page';
import { FEE_TIERS, STRIPE_PROCESSING_NOTE } from '@/lib/pricing';
import styles from './quotes.module.css';

const SHOTS = '/media/quotes';

/**
 * THE ACTUAL SCREENS, IN THE ORDER YOU MEET THEM.
 *
 * Everything else on this page is a drawn mock of an invented job — the right
 * call for a screen that would otherwise carry a real homeowner's name, address
 * and price. These four are the contractor's own side of the product, captured
 * from a demo account belonging to an invented landscaping business, so there
 * is nobody's data in them and no reason to draw them instead.
 *
 * WHAT THEY ARE NOT. Not a customer, not a result, not a claim about anybody's
 * revenue. The whole claim is "this is the screen", and it is one we can stand
 * behind because it is a photograph of it.
 */
const QUOTE_FLOW: {
  step: string;
  title: string;
  body: string;
  media:
    | { kind: 'image'; src: string; alt: string; width: number; height: number }
    | { kind: 'video'; src: string; poster: string; width: number; height: number; label: string };
}[] = [
  {
    step: 'Step 1',
    title: 'List what is included, then what is optional',
    body: 'Included lines make the price. Optional add-ons sit under them, each one either pre-ticked on the homeowner’s copy or starred as a recommendation — and the total updates live as they take them.',
    media: {
      kind: 'image',
      src: `${SHOTS}/quote-builder-line-items.jpg`,
      alt: 'The quote builder with four line items — two included, two optional add-ons marked pre-checked and recommended — and a $3,300 total.',
      width: 1570,
      height: 824,
    },
  },
  {
    step: 'Step 2',
    title: 'See their copy before you send it',
    body: 'Preview opens the homeowner’s own approval screen — the included work, the add-ons they can take, and the total moving as they do. Nothing has been sent at this point.',
    media: {
      kind: 'video',
      src: `${SHOTS}/quote-preview-popup.mp4`,
      poster: `${SHOTS}/quote-preview-popup-poster.jpg`,
      width: 432,
      height: 452,
      label: 'A three-second recording of the preview panel: adding an optional tree removal raises the total from $3,000 to $4,000.',
    },
  },
  {
    step: 'Step 3',
    title: 'Choose how they pay, and whether we text them',
    body: 'Pay in full, a deposit with the balance later, or a 0%-interest plan — a deposit now and equal monthly installments on their saved card. The send toggle is yours: leave it off and nothing goes out automatically, and you get a link to send yourself.',
    media: {
      kind: 'image',
      src: `${SHOTS}/quote-builder-payment-terms.jpg`,
      alt: 'Payment terms on the quote: pay in full, deposit plus balance, or a payment plan with a 50% deposit and four monthly installments, above Preview and Send quote buttons.',
      width: 1568,
      height: 770,
    },
  },
  {
    step: 'Step 4',
    title: 'They authorize the exact schedule',
    body: 'The homeowner sees every amount and every date before anything is charged, and types their name to authorize the installments. They can pay the balance off early with no penalty.',
    media: {
      kind: 'image',
      src: `${SHOTS}/homeowner-payment-plan.png`,
      alt: 'The homeowner’s payment-plan screen: a $1,650 deposit today and four $413 installments dated monthly, with a name field to authorize them.',
      width: 1191,
      height: 794,
    },
  },
];

export const metadata: Metadata = {
  title: 'Quotes and E-Signatures for Contractors',
  description:
    'Build itemized quotes from your own price book, offer optional upgrades, and get them signed from a phone — no printer, no PDF, no chasing.',
  alternates: { canonical: 'https://letsgetquoted.com/features/quotes' },
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/features/quotes',
    siteName: "Let's Get Quoted",
    title: 'Send the quote. Get it signed from a phone.',
    description:
      'Itemized quotes priced from your own book, optional upgrades the customer picks, and a typed signature that locks to the record with its timestamp.',
    images: [{ url: '/features/og-quotes.jpg', width: 1200, height: 630, alt: 'Quotes and e-signatures for contractors' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Send the quote. Get it signed from a phone.',
    description:
      'Itemized quotes priced from your own book, optional upgrades the customer picks, and a typed signature that locks to the record with its timestamp.',
    images: ['/features/og-quotes.jpg'],
  },
};

export default function QuotesFeaturePage() {
  return (
    <SuiteFeaturePage
      eyebrow="Quotes + e-signature"
      title={
        <>
          Send the quote. <em>Get it signed from a phone.</em>
        </>
      }
      lede="Build an itemized quote from your own price book, offer the upgrades you actually want to sell, and let the homeowner approve it from the link — no printer, no PDF, no third follow-up call."
      heroNote="The draft is priced from the services you set up. Anything priced outside your book is flagged before it goes out, and the approval is recorded with the name and the moment."
      /* A specific job, not the job list. job-13 is the demo record sitting at
         the quote stage — "open a sample quote" that lands on an index of jobs
         is the disappointment the third button used to cause. */
      primary={{ label: 'Open a sample quote', href: '/demo/jobs/job-13' }}
      demo={
        <ExampleFrame
          label="A quote as the homeowner sees it, with one upgrade taken."
          note="Invented job, invented prices. What is real is the shape: line items from your price book, an upgrade priced as a difference, and a typed signature with its timestamp."
        >
          <Panel>
            <PanelHead title="Quote #1042 · Whitfield" pill="Approved" tone="good" />
            <PanelRows
              rows={[
                { label: 'Tear-off and haul away', value: '$1,850' },
                { label: 'Architectural shingles · 24 sq', value: '$6,240' },
                { label: 'Ridge vent and flashing', value: '$1,310' },
                { label: 'Upgrade taken · 50-year shingle', value: '+$1,480' },
                { label: 'Total', value: '$10,880', strong: true },
              ]}
            />
            <PanelNote>
              Signed “Dana Whitfield” · Tue, May 13 at 6:41 PM. The first signature and its
              timestamp are the ones that stick, and the upgrade is stored as a snapshot — editing
              the option later never rewrites what somebody agreed to.
            </PanelNote>
            <PanelActions labels={['Collect deposit', 'Put on the calendar']} />
          </Panel>
        </ExampleFrame>
      }
      proof={[
        { title: 'Priced from your book', body: 'Your services, your units, your rates.' },
        { title: 'Signed by typing a name', body: 'Timestamped and locked to the record.' },
        { title: 'Upgrades, not haggling', body: 'The customer picks; the difference is shown.' },
        { title: 'Follow-ups that stop', body: 'Two reminders, then it leaves them alone.' },
      ]}
      story={{
        eyebrow: 'The quote is the start of the job, not a document',
        title: 'A signed PDF is where most quoting tools hand the job back to you.',
        body: 'An approved quote here already knows the customer, the property, the scope and the photos, because the request it was built from did. So approval is not a file you save and retype somewhere else — it is the same record moving to its next stage, with a deposit to collect and a date to put on the calendar.',
      }}
      benefits={[
        {
          title: 'Stop pricing from memory',
          body: 'The draft is built from the request and priced from the services you set up, with units that suit the work — per job, per hour, per square foot, per visit. A line priced outside your book is marked so you look at it before the customer does.',
        },
        {
          title: 'Sell the upgrade without the sales call',
          body: 'Offer colors, materials and fixtures with what the quote already allows for and what an upgrade adds. The choice is recorded with the name, the moment and a snapshot of the option as it was.',
        },
        {
          title: 'Get the yes in writing, from a phone',
          body: 'The homeowner opens one link, reads the scope, takes or leaves the upgrades and types their full legal name. No account, no password, no app to install.',
        },
      ]}
      afterBenefits={
        <section className="section-block" id="the-screens" aria-labelledby="screens-title">
          <div className={styles.shotsHead}>
            <p className="eyebrow">The quote builder, as it ships</p>
            <h2 id="screens-title">This is the screen, not a drawing of it.</h2>
            <p>
              A demo account belonging to an invented landscaping business, captured as it is
              today. The numbers are made up; everything around them is the product.
            </p>
          </div>

          <ol className={styles.shots}>
            {QUOTE_FLOW.map((shot) => (
              <li className={styles.shot} key={shot.step}>
                <div className={styles.shotCopy}>
                  <span className={styles.shotStep}>{shot.step}</span>
                  <h3 className={styles.shotTitle}>{shot.title}</h3>
                  <p className={styles.shotBody}>{shot.body}</p>
                </div>
                <div className={styles.shotMedia}>
                  {shot.media.kind === 'image' ? (
                    <img
                      src={shot.media.src}
                      alt={shot.media.alt}
                      width={shot.media.width}
                      height={shot.media.height}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    /* controls and preload="none": nothing here autoplays, so
                       there is no motion preference to respect and no reason to
                       spend 400KB of somebody's data on a section they may never
                       reach. The poster is what shows until they press it. */
                    <video
                      className={styles.shotVideo}
                      src={shot.media.src}
                      poster={shot.media.poster}
                      width={shot.media.width}
                      height={shot.media.height}
                      aria-label={shot.media.label}
                      controls
                      muted
                      loop
                      playsInline
                      preload="none"
                    />
                  )}
                </div>
              </li>
            ))}
          </ol>

          <p className={styles.shotNote}>
            Every amount above is invented. What is real is the shape: included work and optional
            add-ons on one total, a preview of the homeowner’s copy before anything sends, and a
            plan they authorize date by date.
          </p>
        </section>
      }
      stepsEyebrow="From request to signature"
      stepsTitle="Four steps, and you type the price once."
      steps={[
        {
          title: 'Start from the request',
          body: 'The customer, the property, the scope and any photos are already on the record. You are editing a draft, not opening a blank document.',
        },
        {
          title: 'Price it from your book',
          body: 'Pull in services at the rates you set. Add anything one-off by hand — it will be flagged as priced outside the book, which is the point.',
        },
        {
          title: 'Add the optional upgrades',
          body: 'Each one shows what the quote already covers and what the upgrade adds, so the customer is choosing rather than negotiating.',
        },
        {
          title: 'Send the link and let it chase',
          body: 'They approve and sign from their phone. If they do not, the quote reminds them up to twice and then stops — a quote that nags forever costs you the next job too.',
        },
      ]}
      catalog={['quotes']}
      catalogEyebrow="What the quote carries"
      catalogTitle="Everything attached to an approved quote."
      catalogNote="Not modules you switch on one at a time. These are parts of the same record, and each one is there because the stage before it already collected what it needs."
      faq={[
        {
          q: 'Is a typed name really a signature?',
          a: 'It is an electronic signature, and it is recorded the way one has to be: the full legal name the homeowner typed, the moment they typed it, and a lock on the record afterwards. The first signature and its timestamp are the ones that stick — a later edit cannot quietly become the thing that was agreed to.',
        },
        {
          q: 'What happens if the job turns out to be bigger?',
          a: 'A change order. The crew photographs what they found, the extra work is priced, and the homeowner agrees to it in writing on the same record — instead of on a phone call two people remember differently.',
        },
        {
          q: 'Can I require a deposit before I schedule?',
          a: 'Yes. The deposit gate can hold scheduling, or hold the start of work, until a deposit is actually paid. It is a setting rather than a habit you have to keep.',
        },
        {
          q: 'Do I have to build a price book first?',
          a: 'No. You can quote by hand from day one and add services as you go. The book only changes how fast the draft arrives — anything priced outside it still goes out, it is just marked for you first.',
        },
        {
          q: 'What does it cost to send a quote?',
          a: `Nothing. There is no subscription and no per-quote fee. The platform fee is ${FEE_TIERS[0].rate} of what a homeowner actually pays you, falling to ${FEE_TIERS[FEE_TIERS.length - 1].rate} as your yearly volume grows, plus Stripe's standard processing (${STRIPE_PROCESSING_NOTE}). A quote nobody approves costs you nothing at all.`,
        },
      ]}
      cta={{
        title: 'Quote it once. Let them sign it tonight.',
        note: `No subscription and no setup fee. The platform fee is ${FEE_TIERS[0].rate} of what you collect and falls to ${FEE_TIERS[FEE_TIERS.length - 1].rate} as your volume grows, plus Stripe processing (${STRIPE_PROCESSING_NOTE}).`,
      }}
    />
  );
}
