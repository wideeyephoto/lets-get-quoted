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
      secondary={{ label: 'What the record keeps', href: '#capabilities' }}
      tertiary={{ label: 'See a job record in the demo', href: '/demo/jobs' }}
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
          body: 'Offer colours, materials and fixtures with what the quote already allows for and what an upgrade adds. The choice is recorded with the name, the moment and a snapshot of the option as it was.',
        },
        {
          title: 'Get the yes in writing, from a phone',
          body: 'The homeowner opens one link, reads the scope, takes or leaves the upgrades and types their full legal name. No account, no password, no app to install.',
        },
      ]}
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
