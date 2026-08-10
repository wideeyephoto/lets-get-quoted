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
  title: 'Recurring Work and Auto-Billing for Contractors',
  description:
    'Set repeating work once and it schedules and charges itself — weekly, every other week or monthly, with a real itemized invoice for every visit and declines handled for you.',
  alternates: { canonical: 'https://letsgetquoted.com/features/recurring' },
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/features/recurring',
    siteName: "Let's Get Quoted",
    title: 'Set the plan once. It books and bills itself.',
    description:
      'Weekly, biweekly or monthly visits that create their own job and their own invoice, charged to a saved card — with declines classified and retried.',
    images: [{ url: '/features/og-recurring.jpg', width: 1200, height: 630, alt: 'Recurring work and auto-billing for contractors' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Set the plan once. It books and bills itself.',
    description:
      'Weekly, biweekly or monthly visits that create their own job and their own invoice, charged to a saved card — with declines classified and retried.',
    images: ['/features/og-recurring.jpg'],
  },
};

export default function RecurringFeaturePage() {
  return (
    <SuiteFeaturePage
      eyebrow="Recurring work + auto-billing"
      title={
        <>
          Set the plan once. <em>It books and bills itself.</em>
        </>
      }
      lede="A maintenance customer should be a schedule, not a reminder to invoice. Set the cadence and every cycle creates its own scheduled job and its own itemized charge, against a card the customer already saved."
      heroNote="Weekly, every other week or monthly. Cap a plan at a set number of visits, or leave it running until somebody stops it."
      secondary={{ label: 'What a plan does on its own', href: '#capabilities' }}
      tertiary={{ label: 'See live recurring plans', href: '/demo/recurring' }}
      demo={
        <ExampleFrame
          label="One plan, and the visits it has produced by itself."
          note="Invented customer and figures. What is real is the shape: each visit is its own job and its own invoice, so a plan is a series of real records rather than one subscription line."
        >
          <Panel>
            <PanelHead title="Maintenance plan · Alvarez" pill="Active" tone="good" />
            <PanelRows
              rows={[
                { label: 'Every 2 weeks · Tue', value: '$180 / visit' },
                { label: 'Visits so far', value: '7 of 24' },
                { label: 'Last charge · Tue', value: 'Paid' },
                { label: 'Booked and billed by you', value: 'None of it', strong: true },
              ]}
            />
            <PanelNote>
              Each visit spawns a scheduled job on the calendar and a real itemized invoice — not a
              line on a subscription. If the saved card declines, the failure is classified and
              retried or routed to a card-update link.
            </PanelNote>
            <PanelActions labels={['Pause the plan', 'See every visit']} />
          </Panel>
        </ExampleFrame>
      }
      proof={[
        { title: 'Three cadences', body: 'Weekly, every other week, or monthly.' },
        { title: 'A real job each cycle', body: 'On the calendar, with a crew to assign.' },
        { title: 'A real invoice each time', body: 'Itemized, not a subscription line.' },
        { title: 'Declines handled for you', body: 'Classified, retried, or a card-update link.' },
      ]}
      story={{
        eyebrow: 'The revenue you can actually forecast',
        title: 'Repeat work is the difference between a busy year and a predictable one.',
        body: 'One-off jobs are a year you have to win again every January. A plan that schedules and charges itself turns the same customer into revenue you can see coming — and because every visit is a real job with a real invoice, it shows up in your calendar, your margin and your cash forecast like any other work, rather than sitting in a separate billing system.',
      }}
      benefits={[
        {
          title: 'Stop rebuilding the same job',
          body: 'The customer, the property, the scope and the price are set once. Every cycle produces a scheduled job from them, so nobody is retyping an address they typed a fortnight ago.',
        },
        {
          title: 'Get paid without asking',
          body: 'The saved card is charged per visit and the customer gets a genuine itemized invoice each time — which is what makes a maintenance plan survive an accountant, a dispute or a change of mind.',
        },
        {
          title: 'Keep the terms honest',
          body: 'Cap a plan at a fixed number of visits when that is what you sold — twelve months, say — so it ends where you said it would rather than running until somebody notices.',
        },
      ]}
      stepsEyebrow="From one job to a plan"
      stepsTitle="Four steps, then it runs without you."
      steps={[
        {
          title: 'Start from a customer you already have',
          body: 'Their profile carries the property, the history and the card. A plan is the same relationship on a repeat, not a new record.',
        },
        {
          title: 'Pick the cadence and the price',
          body: 'Weekly, every other week or monthly, at a per-visit price. Set a fixed term if the plan is meant to end.',
        },
        {
          title: 'Let each cycle create its own job',
          body: 'It lands on the calendar to be assigned like any other work, and it counts toward how full that day is.',
        },
        {
          title: 'Let it bill and chase',
          body: 'The saved card is charged and an itemized invoice is issued. A decline is retried or turned into a card-update link for the customer.',
        },
      ]}
      catalog={['recurring']}
      catalogEyebrow="What a plan does on its own"
      catalogTitle="Four things you set once and stop doing."
      catalogNote="Each visit is a real job on the same record system as everything else, which is why recurring revenue appears in your schedule, your margin and your cash forecast rather than beside them."
      faq={[
        {
          q: 'Is this a subscription product for my customers?',
          a: 'Not in the billing sense. Each cycle creates a genuine job and a genuine itemized invoice, charged individually to the saved card. That matters when a customer queries a charge or an accountant asks what a payment was for — there is a job and an invoice behind every one.',
        },
        {
          q: 'What cadences can I set?',
          a: 'Weekly, every other week, or monthly. A plan can also be capped at a fixed number of visits, which is how you sell “twelve months of maintenance” and have it actually end after twelve months.',
        },
        {
          q: 'What happens when the card on file fails?',
          a: 'The decline is classified rather than simply logged. Some are retried automatically; the ones that will not succeed are routed to a card-update link for the customer, so a replaced card is something they fix instead of something you chase.',
        },
        {
          q: 'Can I pause or cancel a plan?',
          a: 'Yes, and the visits it has already produced stay as they are — real jobs with real invoices and real history. Stopping the plan stops the next cycle; it does not rewrite the work you have already done.',
        },
        {
          q: 'Do recurring charges cost more than one-off ones?',
          a: `No — they are charged on exactly the same terms. The platform fee is ${FEE_TIERS[0].rate} of what a homeowner actually pays you, falling to ${FEE_TIERS[FEE_TIERS.length - 1].rate} as your yearly volume grows, plus Stripe's standard processing (${STRIPE_PROCESSING_NOTE}). There is no subscription and no per-plan fee.`,
        },
      ]}
      cta={{
        title: 'Turn a good customer into a standing appointment.',
        note: `No subscription and no per-plan fee. The platform fee is ${FEE_TIERS[0].rate} of what you collect and falls to ${FEE_TIERS[FEE_TIERS.length - 1].rate} as your volume grows, plus Stripe processing (${STRIPE_PROCESSING_NOTE}).`,
      }}
    />
  );
}
