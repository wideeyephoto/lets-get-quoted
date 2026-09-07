import type { Metadata } from 'next';
import SuiteFeaturePage from '@/components/marketing/suite-feature-page';
import LiveEtaDemo from '@/components/marketing/LiveEtaDemo';
import { FEATURE_PRICING_NOTE } from '@/lib/pricing';

export const metadata: Metadata = {
  title: 'Live Technician ETA Sharing and Expiring Map Links',
  description:
    'Give customers an expiring live map link, an updated arrival window, and automatic delay notices without tracking crew all day.',
  alternates: { canonical: 'https://letsgetquoted.com/features/live-eta' },
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/features/live-eta',
    siteName: "Let's Get Quoted",
    title: 'Your customer stops wondering where you are.',
    description:
      'Live technician tracking link with automated arrival windows and privacy protections for field service contractors.',
    images: [{ url: '/features/og-live-eta.jpg', width: 1200, height: 630, alt: 'Live technician ETA sharing for contractors' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Your customer stops wondering where you are.',
    description:
      'Live technician tracking link with automated arrival windows and privacy protections for field service contractors.',
    images: ['/features/og-live-eta.jpg'],
  },
};

const FAQ = [
  {
    q: 'Does my crew get tracked all day?',
    a: 'No. Foreground only; backgrounding the app stops the watch outright. Location is shared only while en route on an active visit, and the link expires when the visit ends. There is no background location history and nothing runs while they work.',
  },
  {
    q: 'How exact is the pin?',
    a: 'Around 100 meters, always. Coordinates round to 3 decimal places street level before leaving the phone, so customers see neighborhood streets rather than an exact parking spot or home number.',
  },
  {
    q: 'How long does the link live?',
    a: 'Four hours fixed lifetime. Location streaming ceases the moment the visit status reaches arrived, done, or cancelled, leaving a clean visit card that stops auto-refreshing.',
  },
  {
    q: 'What if they never tap Arrived?',
    a: 'A 90-minute safety backstop stops location visibility automatically even if the technician gets busy and forgets to tap arrived.',
  },
  {
    q: 'Can a crew member be blocked from sharing location?',
    a: 'Yes, per person. The employer policy and the crew member permission must both allow location sharing before any coordinates are broadcast.',
  },
  {
    q: 'Does the customer need an app or an account?',
    a: 'No. It is a single secure, unindexed mobile web page that requires no login, no download, and no password.',
  },
  {
    q: 'Does it say my company or yours?',
    a: 'Yours. The customer tracking screen displays your company logo, your accent color, and your phone number.',
  },
  {
    q: 'Does it cost extra?',
    a: `${FEATURE_PRICING_NOTE} Arrival and delay texts draw on your monthly plan SMS allowance like every other customer message, with zero per-tracking surcharge.`,
  },
];

export default function LiveEtaFeaturePage() {
  return (
    <SuiteFeaturePage
      breadcrumb={{ name: 'Live ETA', path: '/features/live-eta' }}
      eyebrow="Live ETA sharing"
      title={
        <>
          Your customer stops wondering <em>where you are.</em>
        </>
      }
      lede="One text, one link, one page that updates itself. They see a window, a first name, and an approximate pin that stops the moment you arrive."
      heroNote="The link expires in four hours and the location stops when the visit ends — 90 minutes at the outside if nobody taps Arrived. This is a delivery-style tracker for one journey, not a record of anybody’s day."
      primary={{ label: 'See it run', href: '#live-eta-demo' }}
      demo={<LiveEtaDemo />}
      proof={[
        { title: 'A window, never a minute', body: '30, 45, 60 or 90 mins; precise minutes set customers up to wait.' },
        { title: 'An approximate pin', body: 'Rounded to ~100m street level always, preserving tech privacy.' },
        { title: 'A link that dies', body: 'Four hours, or the moment the visit closes.' },
        { title: 'An apology that sends itself', body: 'Checked every 15 minutes by background sweep when delayed.' },
      ]}
      story={{
        eyebrow: 'The Waiting Problem',
        title: '“They’ll be there between 8 and 12” is why people hate booking trades.',
        body: 'The cost of a vague window is not just the customer waiting at home; it is the three calls to your office asking where the van is, and the review that mentions sitting around all morning. A real live link answers the question before they pick up the phone.',
      }}
      benefits={[
        {
          title: 'The text your customer actually wanted',
          body: 'Their name, your business name, your crew member’s first name, and one link. No app download, no account creation, and no password required.',
        },
        {
          title: 'It updates itself, including the bad news',
          body: 'The window recalculates against live traffic; when routing doesn’t answer it falls back to a straight-line estimate rather than freezing. Running past the promise sends the apology without anyone remembering to.',
        },
        {
          title: 'Nobody is being tracked all day',
          body: 'Foreground only, per trip, opt-in per crew member, rounded, and expiring. The switch that turns it off is a real switch, enforced at send time and not by hiding a button.',
        },
      ]}
      stepsEyebrow="How it runs"
      stepsTitle="From dispatch to front door in four clean steps"
      steps={[
        {
          title: '1. Tech taps “On my way”',
          body: 'Picks an ETA window (30, 45, or 60 min). The dispatch text generates with a private, expiring tracking token.',
        },
        {
          title: '2. Customer opens their visit page',
          body: 'Opens in their mobile browser under your company name and branding. Shows technician name and approximate street pin.',
        },
        {
          title: '3. Window updates automatically',
          body: 'As the vehicle travels, the arrival window adjusts for live traffic delays. If running late, an automatic notice dispatches.',
        },
        {
          title: '4. Arrived shuts everything off',
          body: 'Entering the geofence prompts the tech to mark arrived. Location streaming terminates immediately and the link expires.',
        },
      ]}
      catalog={['jobs']}
      catalogEyebrow="Part of the Jobs & Crew Suite"
      catalogTitle="Built into the same platform that runs your jobs"
      catalogNote="Live ETA sharing works hand-in-glove with crew dispatch, job costing, and customer messaging."
      faq={FAQ}
      cta={{
        title: 'Stop the “where are you” phone calls.',
        note: 'Set up your crew in five minutes. Included on all plans.',
      }}
    />
  );
}
