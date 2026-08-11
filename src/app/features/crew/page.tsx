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
  title: 'Crew Management and Field App',
  description:
    'Assign the crew, put the job on their phone, log hours and materials on site, and see real margin before you invoice. Hours roll up by person and pay period.',
  alternates: { canonical: 'https://letsgetquoted.com/features/crew' },
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/features/crew',
    siteName: "Let's Get Quoted",
    title: 'Your crew gets the job. You get the real margin.',
    description:
      'Assignments, a field app that logs hours and materials on site, and job costing that shows profit before you invoice — not after.',
    images: [{ url: '/features/og-crew.jpg', width: 1200, height: 630, alt: 'Crew management and field app for contractors' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Your crew gets the job. You get the real margin.',
    description:
      'Assignments, a field app that logs hours and materials on site, and job costing that shows profit before you invoice — not after.',
    images: ['/features/og-crew.jpg'],
  },
};

export default function CrewFeaturePage() {
  return (
    <SuiteFeaturePage
      eyebrow="Crew, labor + the field app"
      title={
        <>
          Your crew gets the job. <em>You get the real margin.</em>
        </>
      }
      lede="Assign the people and the job is on their phone — address, scope, photos, contact. They log hours and materials from the site, and the profit on that job is a number you can see before you invoice it."
      heroNote="Hours carry the rate they were logged at. Marking somebody paid records that you paid them — it does not move money or calculate tax, and the product does not pretend otherwise."
      primary={{ label: 'Open the live crew screen', href: '/demo/crew' }}
      demo={
        <ExampleFrame
          label="One job, part-way through, with labor and materials already on it."
          note="Invented job and invented figures. What is real is the arithmetic: cost is what the crew logged, and margin is quoted minus that — not an estimate of it."
        >
          <Panel>
            <PanelHead title="Whitfield reroof · in progress" pill="2 assigned" />
            <PanelRows
              rows={[
                { label: 'Quoted', value: '$10,880' },
                { label: 'Labor · 13.5 hrs logged', value: '$648' },
                { label: 'Materials logged on site', value: '$4,120' },
                { label: 'Margin so far', value: '$6,112', strong: true },
              ]}
            />
            <PanelNote>
              Mike clocked in at 8:47 AM and is still open. An open shift running long is visible
              to you, and a shift you close is marked owner-closed rather than passed off as
              clocked.
            </PanelNote>
            <PanelActions labels={['Add materials', 'Close the shift']} />
          </Panel>
        </ExampleFrame>
      }
      proof={[
        { title: 'The job on their phone', body: 'Address, scope, photos, contact.' },
        { title: 'Margin before the invoice', body: 'Logged cost against what you quoted.' },
        { title: 'Time clock, if you want one', body: 'Off, optional or required — your call.' },
        { title: 'Hours and pay, rolled up', body: 'By crew member and by pay period.' },
      ]}
      story={{
        eyebrow: 'The office stops retyping what the field already knows',
        title: 'Job costing fails when the costs arrive a week after the job.',
        body: 'Hours on a paper sheet and materials on a receipt in a truck are numbers you reconcile on a Sunday, by which point the job is invoiced and the margin is whatever it turned out to be. When the crew logs both from the site, on the record the job already lives on, the margin is a thing you watch rather than a thing you discover.',
      }}
      benefits={[
        {
          title: 'Give the crew the job, not a 6am text',
          body: 'Assign the people and the context goes with them: address, scope, photos and who to call. Newly assigned crew get a text automatically, so nobody finds out by not being told.',
        },
        {
          title: 'Let the site do the paperwork',
          body: 'Hours, materials and photos are recorded where the work is happening. The activity timeline keeps client-visible events and internal ones apart, so the customer sees progress without seeing your costs.',
        },
        {
          title: 'Know what the job actually made',
          body: 'Logged labor and materials against the quoted total, per job. A line with no cost recorded is treated as unknown rather than as zero — a missing cost showing 100% margin is exactly how a bad number gets believed.',
        },
      ]}
      stepsEyebrow="From assigned to paid out"
      stepsTitle="Four steps, and the office types none of them."
      steps={[
        {
          title: 'Build the roster once',
          body: 'People, roles, hourly rates and photos. The rate is what later turns hours into a labor cost you can trust.',
        },
        {
          title: 'Assign the job',
          body: 'The crew see it in the field app with everything they need to arrive ready. They are texted when they are added.',
        },
        {
          title: 'They log the work as it happens',
          body: 'Hours, materials and photos from the site. If you run the time clock it can be off, optional or required — set per business, not per argument.',
        },
        {
          title: 'Read the rollup, then pay',
          body: 'Hours and pay by person and by pay period. Marking somebody paid records the fact; it is not a payroll run and no tax is calculated or withheld.',
        },
      ]}
      catalog={['jobs']}
      catalogEyebrow="Running the work"
      catalogTitle="What the job record carries for the people doing it."
      catalogNote="All of it hangs off the same job the quote and the schedule are on, which is why the field app already knows the scope and the invoice already knows the cost."
      faq={[
        {
          /* The four questions a contractor asks before putting an app on
             somebody else's phone, and they were all unanswered. Every answer
             here is checked against the code: crew sign-in is a magic link
             (field/login), the service worker deliberately passes fetches
             through untouched, location is per-trip and expires
             (job-tracking.share_location / location_expires_at), and the four
             permissions are the ones lib/crew.ts actually stores. */
          q: 'How do crew members sign in — do they need accounts?',
          a: 'You add their email, and they get a sign-in link. There is no password to set or reset and no per-seat charge; the link expires after an hour and they tap it again next time. Nothing to install to get started.',
        },
        {
          q: 'What device do they need, and does it work without signal?',
          a: 'Any phone with a browser. It installs to the home screen like an app if they want that. It does need a connection — there is no offline mode, so a basement with no bars means logging the hours when they are back outside rather than losing them.',
        },
        {
          q: 'Does it track where my crew are?',
          a: 'No. There is no background location and nothing runs while they work. Location is shared only when somebody sends an “on my way” message and only if they turn it on for that trip, and the link the homeowner gets expires on its own. It is a delivery-style tracker for one journey, not a record of anybody’s day.',
        },
        {
          q: 'Can I control what each person can do?',
          a: 'Yes — per crew member. Whether they can send arrival messages, whether they can share their location when they do, whether they can see customer contact details, and whether they can move a job. Costing and margin are the owner’s view either way.',
        },
        {
          q: 'Is this payroll?',
          a: 'It is job costing and pay records, not payroll processing. Hours and pay roll up by crew member and pay period, and marking somebody paid records that you paid them — so the labor cost on every job is real. Moving the money, calculating tax and withholding stay with you or your payroll provider, and the product does not pretend otherwise.',
        },
        {
          q: 'Do I have to make the crew use a time clock?',
          a: 'No. It is off, optional or required, set per business. Its real value is the shift somebody forgot to close: an open shift running long is visible to you, and a shift you close is marked owner-closed rather than quietly recorded as if they clocked out.',
        },
        {
          q: 'Do crew members see my prices and margins?',
          a: 'The field app gives them the job — address, scope, photos, contact — and the place to log hours, materials and photos. Costing and margin are the owner’s view, and the activity timeline separates what the client can see from what is internal.',
        },
        {
          q: 'What if a material cost never gets entered?',
          a: 'It stays unknown rather than becoming zero. That is on purpose: defaulting a missing cost to nothing would show that line at a perfect 100% margin — wrong and flattering at the same time.',
        },
        {
          q: 'Is there a per-seat charge for crew?',
          a: `No. There is no subscription and no per-user fee, so adding somebody costs nothing. The platform fee is ${FEE_TIERS[0].rate} of what a homeowner actually pays you, falling to ${FEE_TIERS[FEE_TIERS.length - 1].rate} as your yearly volume grows, plus Stripe's standard processing (${STRIPE_PROCESSING_NOTE}).`,
        },
      ]}
      cta={{
        title: 'Put the crew, the hours and the margin on one record.',
        note: `No subscription, no per-seat fee. The platform fee is ${FEE_TIERS[0].rate} of what you collect and falls to ${FEE_TIERS[FEE_TIERS.length - 1].rate} as your volume grows, plus Stripe processing (${STRIPE_PROCESSING_NOTE}).`,
      }}
    />
  );
}
