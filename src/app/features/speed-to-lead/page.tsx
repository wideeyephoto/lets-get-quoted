import type { Metadata } from 'next';
import SuiteFeaturePage from '@/components/marketing/suite-feature-page';
import SpeedToLeadSimulator from '@/components/marketing/SpeedToLeadSimulator';
import { FEATURE_PRICING_NOTE } from '@/lib/pricing';

export const metadata: Metadata = {
  title: 'Instant Speed-to-Lead SMS & TCPA Automation for Contractors',
  description:
    'Reply to incoming homeowner leads in under 60 seconds. Automated trade-specific SMS, 1-tap voice call bridge, and audited TCPA quiet hours compliance.',
  alternates: { canonical: 'https://letsgetquoted.com/features/speed-to-lead' },
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/features/speed-to-lead',
    siteName: "Let's Get Quoted",
    title: 'Reply in under 60 seconds. Win the job before competitors check voicemail.',
    description:
      'Sub-60-second automated SMS responses, multi-jurisdiction TCPA quiet hours protection, and instant voice call bridges for trade contractors.',
    images: [{ url: '/features/og-speed-to-lead.jpg', width: 1200, height: 630, alt: 'Instant Speed-to-Lead SMS and TCPA automation for contractors' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Reply in under 60 seconds. Win the job before competitors check voicemail.',
    description:
      'Sub-60-second automated SMS responses, multi-jurisdiction TCPA quiet hours protection, and instant voice call bridges for trade contractors.',
    images: ['/features/og-speed-to-lead.jpg'],
  },
};

const FAQ = [
  {
    q: 'How fast does the speed-to-lead text actually send?',
    a: 'Under 60 seconds during daytime operating hours — typically within 12 to 30 seconds of the homeowner submitting a web form or clicking an ad. This timing gives the message a natural cadence while catching the customer while their phone is still active in their hand.',
  },
  {
    q: 'How does quiet hours protection prevent TCPA lawsuits?',
    a: 'FCC TCPA rules and state Mini-TCPA statutes (such as Florida FTSA, Oklahoma OTA, and Maryland) impose strict quiet hours — as early as 8:00 PM local time — with statutory penalties of $500 to $1,500 per non-compliant text. Our engine parses the recipient phone number area code and address to determine their local timezone. Leads received during quiet hours are safely held in database queues and scheduled for compliant 8:00 AM dispatch.',
  },
  {
    q: 'What is the 1-Tap Voice Call Bridge?',
    a: 'When an urgent or high-value lead arrives, our system can dial your phone immediately with an automated announcement: “You have a new roofing lead from Sarah in Austin. Press 1 to connect.” Pressing 1 bridges your line directly to the customer so you speak to them before they call the next contractor.',
  },
  {
    q: 'What happens if a homeowner submits a landline number?',
    a: 'Our routing engine monitors carrier delivery receipts. If SMS dispatch is unroutable or fails on a landline, the system automatically cascades to high-priority email alerts and dashboard notifications with full delivery telemetry so no inquiry falls through the cracks.',
  },
  {
    q: 'Can customers reply to the speed-to-lead text message?',
    a: 'Yes. It is a genuine 2-way conversation powered by your business number. Customer replies flow directly into your Two-Way SMS Inbox and customer activity timeline, allowing you or your office dispatcher to reply from anywhere.',
  },
  {
    q: 'Is carrier 10DLC registration included?',
    a: 'Yes. All messaging runs through verified A2P 10DLC carrier registration with automatic STOP/START/HELP opt-out compliance. Messages sent via registered 10DLC routes ensure high deliverability without spam blocking.',
  },
  {
    q: 'Does speed-to-lead automation cost extra per lead?',
    a: `${FEATURE_PRICING_NOTE} Automated speed-to-lead texts draw on your standard plan monthly SMS allowance with zero per-lead surcharges and zero marketing agency retainers.`,
  },
  {
    q: 'Can I customize the automated text message copy?',
    a: 'Yes. You can tune the message tone, trade service name, customer name personalization, and appointment window options directly in your Settings.',
  },
];

export default function SpeedToLeadFeaturePage() {
  return (
    <SuiteFeaturePage
      breadcrumb={{ name: 'Speed-to-Lead', path: '/features/speed-to-lead' }}
      eyebrow="Speed-to-Lead Automation"
      title={
        <>
          Reply in under 60 seconds. <em>Win the job before competitors check their voicemail.</em>
        </>
      }
      lede="78% of homeowners hire the contractor who responds first. When an ad click or website lead lands, Let’s Get Quoted sends an instant, personalized text within seconds — while keeping your business compliant with strict federal and state quiet hours."
      heroNote="Incoming leads are evaluated against the called party’s local timezone. Daytime inquiries receive sub-60-second responses; after-hours leads are safely queued for 8:00 AM delivery to prevent costly statutory TCPA penalties."
      heroChips={['Sub-60s Daytime Reply', 'TCPA Quiet Hours Guard', '1-Tap Voice Bridge', 'Zero Agency Retainers']}
      primary={{ label: 'See it run', href: '#speed-to-lead-demo' }}
      demo={<SpeedToLeadSimulator />}
      proof={[
        { title: 'Sub-60s daytime response', body: 'Dispatches in 12–30s while homeowner intent is at its absolute peak.' },
        { title: 'TCPA quiet hours shield', body: 'Enforces strict 8 PM cutoffs for FL, OK, MD and 9 PM federal rules.' },
        { title: '1-tap voice call bridge', body: 'Press 1 on your cell to connect directly with the customer.' },
        { title: 'Automatic fallback cascade', body: 'Falls back to urgent email if mobile carrier routing fails.' },
      ]}
      story={{
        eyebrow: 'The 15-Minute Window',
        title: 'Homeowners don’t wait 4 hours when water is leaking through their ceiling.',
        body: 'Studies show lead conversion rates drop over 8x after the first 15 minutes. By the time a contractor listens to voicemail at the end of the day, the homeowner has already signed with the first company that replied. Instant speed-to-lead locks in the appointment while their phone is still in their hand.',
      }}
      benefits={[
        {
          title: 'Personalized, conversational texts',
          body: 'Greets the customer by first name, references the exact trade service requested, and suggests arrival windows. Homeowners reply in seconds to lock in their spot.',
        },
        {
          title: 'Quiet hours that protect your business',
          body: 'Violating TCPA quiet hours risks $500 to $1,500 in statutory damages per text. Our engine resolves the customer’s exact local timezone and holds overnight inquiries until 8:00 AM.',
        },
        {
          title: 'Voice Call Bridge for high-ticket emergencies',
          body: 'When urgent repairs or big-ticket replacements come in, your cell rings immediately. Press 1 to bridge the call directly to the customer with zero manual dialing.',
        },
      ]}
      stepsEyebrow="How it runs"
      stepsTitle="From lead submission to booked estimate in four clean steps"
      steps={[
        {
          title: '1. Homeowner submits request',
          body: 'A customer fills out your website estimate form, clicks your Google Ad, or calls after hours.',
        },
        {
          title: '2. System verifies recipient timezone',
          body: 'Checks recipient area code and location against FCC TCPA and state Mini-TCPA quiet hours laws.',
        },
        {
          title: '3. Instant SMS / Voice bridge dispatches',
          body: 'Daytime inquiries receive a personalized text in under 60 seconds; high-urgency jobs trigger the voice call bridge.',
        },
        {
          title: '4. 2-way conversation confirms booking',
          body: 'Homeowner texts back their arrival preference, automatically updating the job record and team calendar.',
        },
      ]}
      catalog={['marketing', 'leads']}
      catalogEyebrow="Part of Marketing & Lead Capture"
      catalogTitle="Built into the same platform that runs your quotes and crews"
      catalogNote="Speed-to-lead automation works hand-in-hand with AI ads, custom quoting, team scheduling, and closed-loop revenue reporting."
      faq={FAQ}
      cta={{
        title: 'Stop losing jobs to phone tag and slow responses.',
        note: 'Included on all plans. Draw on your monthly plan SMS allowance with zero per-lead surcharges.',
      }}
    />
  );
}
