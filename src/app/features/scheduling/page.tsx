import type { Metadata } from 'next';
import ExampleFrame from '@/components/marketing/example-frame';
import SuiteFeaturePage, {
  Panel,
  PanelActions,
  PanelHead,
  PanelNote,
  PanelRows,
} from '@/components/marketing/suite-feature-page';
import styles from '@/components/marketing/suite-feature-page.module.css';
import { CAPACITY_LEVELS } from '@/lib/schedule-capacity';

type FlowStep = {
  step: string;
  title: string;
  body: string;
  mock?: React.ReactNode;
  image?: { src: string; alt: string; width: number; height: number };
};

const SCHEDULING_FLOW: FlowStep[] = [
  {
    step: 'Step 1',
    title: 'Self-service booking from your website',
    body: 'Homeowners select from arrival windows you actually have capacity for. Requests arrive with full customer specs, addresses, and photos attached.',
    mock: (
      <div className={styles.shotMockContainer}>
        <div className={styles.shotMockHeader}>
          <span className={styles.shotMockTitle}>Online Booking Widget &middot; Client Self-Serve</span>
          <span className={styles.shotBadgeGood}>Live on Website</span>
        </div>
        <dl className={styles.shotKeyValues}>
          <div className={styles.shotKeyRow}>
            <dt>Service Requested</dt>
            <dd>200A Electrical Panel Assessment</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Selected Arrival Window</dt>
            <dd style={{ color: '#50e3bd' }}>Wed Sep 16 &middot; 8:00 – 11:00 AM</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Client Details &amp; Photos</dt>
            <dd>Address, breaker photo &amp; scope attached</dd>
          </div>
        </dl>
      </div>
    ),
  },
  {
    step: 'Step 2',
    title: 'Visual capacity scoring across the month',
    body: 'Every day is scored by booked hours against your team’s limit. The color ramp flags open days and overbooked slots before you promise a date.',
    mock: (
      <div className={styles.shotMockContainer}>
        <div className={styles.shotMockHeader}>
          <span className={styles.shotMockTitle}>Calendar Day Capacity &middot; Tue Sep 15</span>
          <span className={styles.shotBadgeGood}>Room (4.5 / 8 hrs)</span>
        </div>
        <dl className={styles.shotKeyValues}>
          <div className={styles.shotKeyRow}>
            <dt>Morning (8–12 PM)</dt>
            <dd>Whitfield Reroof &middot; 3.5 hrs</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Afternoon (1–3 PM)</dt>
            <dd>Open Slot &middot; 2.0 hrs available</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Late (3–5 PM)</dt>
            <dd>Quick Stop &middot; 1.0 hr booked</dd>
          </div>
        </dl>
      </div>
    ),
  },
  {
    step: 'Step 3',
    title: 'Text up to three windows and let them pick',
    body: 'Send 3 arrival options by text. When the customer picks one, it writes itself onto the job record and notifies the assigned crew automatically.',
    mock: (
      <div className={styles.shotMockContainer}>
        <div className={styles.shotMockHeader}>
          <span className={styles.shotMockTitle}>SMS Option Picker &middot; 1-Tap Booking</span>
          <span className={styles.shotBadgeGood}>Confirmed</span>
        </div>
        <dl className={styles.shotKeyValues}>
          <div className={styles.shotKeyRow}>
            <dt>Option 1: Tue 8–10 AM</dt>
            <dd>Sent</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Option 2: Wed 12–2 PM</dt>
            <dd style={{ color: '#50e3bd' }}>✓ Picked by Homeowner</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Option 3: Thu 8–10 AM</dt>
            <dd>Sent</dd>
          </div>
        </dl>
      </div>
    ),
  },
  {
    step: 'Step 4',
    title: 'Real-time on-my-way ETA and weather guard',
    body: 'Send departure updates with a live tracking link. Rain, freeze, and wind warnings flag outdoor jobs so you can decide before trucks roll.',
    mock: (
      <div className={styles.shotMockContainer}>
        <div className={styles.shotMockHeader}>
          <span className={styles.shotMockTitle}>Field Dispatch &middot; Job #1042</span>
          <span className={styles.shotBadgeFlag}>Weather Alert: Rain (70%)</span>
        </div>
        <dl className={styles.shotKeyValues}>
          <div className={styles.shotKeyRow}>
            <dt>On-My-Way SMS</dt>
            <dd>Sent 7:48 AM &middot; Marcus En Route</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Live Arrival Window</dt>
            <dd>8:15 – 8:30 AM (12 min drive)</dd>
          </div>
          <div className={styles.shotKeyRow}>
            <dt>Action Required</dt>
            <dd>Flags exterior work &middot; Never auto-moves</dd>
          </div>
        </dl>
      </div>
    ),
  },
];

import { FEATURE_PRICING_NOTE, STRIPE_PROCESSING_NOTE } from '@/lib/pricing';

export const metadata: Metadata = {
  title: 'Contractor Scheduling and Booking',
  description:
    'Text arrival windows the customer picks from, take booking requests off your site, and see how full a day is before you promise it. No phone tag.',
  alternates: { canonical: 'https://letsgetquoted.com/features/scheduling' },
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/features/scheduling',
    siteName: "Let's Get Quoted",
    title: 'Book the job without the phone tag.',
    description:
      'Text up to three arrival windows and let the customer pick one. Take booking requests from your own site. See a day is full before you promise it.',
    images: [{ url: '/features/og-scheduling.jpg', width: 1200, height: 630, alt: 'Scheduling and online booking for contractors' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Book the job without the phone tag.',
    description:
      'Text up to three arrival windows and let the customer pick one. Take booking requests from your own site. See a day is full before you promise it.',
    images: ['/features/og-scheduling.jpg'],
  },
};

export default function SchedulingFeaturePage() {
  return (
    <SuiteFeaturePage
      breadcrumb={{ name: 'Scheduling', path: '/features/scheduling' }}
      eyebrow="Scheduling + online booking"
      title={
        <>
          Book the job <em>without the phone tag.</em>
        </>
      }
      lede="Send the times you can actually do. The customer picks one from a text, it lands on the calendar, and the crew is told — without three voicemails and a date somebody wrote on a different calendar."
      heroNote="Arrival windows rather than a minute that will be wrong. Weather is flagged for you to decide on — nothing here ever moves a job by itself."
      /* The calendar IS the argument — it explains the capacity model faster
         than the four paragraphs under it. Signing up is the second option,
         which is the shared shell's default. */
      primary={{ label: 'Open the live calendar', href: '/demo/schedule' }}
      demo={
        <ExampleFrame
          label="Three windows sent by text, and the one they picked."
          note="Invented customer. What is real is the mechanism: the options come from days with room, and the pick writes itself onto the job."
        >
          <Panel>
            <PanelHead title="Sent by text · Mon 4:12 PM" pill="Confirmed" tone="good" />
            {/* Every row is labelled. An empty <dt> is valid HTML and reads as
                "blank" out loud, which is worse than no list at all. */}
            <PanelRows
              rows={[
                { label: 'Option one', value: 'Tue 8–10 AM' },
                { label: 'Option two', value: 'Wed 12–2 PM' },
                { label: 'Option three', value: 'Thu 8–10 AM' },
                { label: 'They picked', value: 'Wed 12–2 PM', strong: true },
              ]}
            />
            <PanelNote>
              The pick lands on the job and the assigned crew is told, without anyone retyping the
              date. The customer gets a reminder before the day and can reply “C” to confirm.
            </PanelNote>
            <PanelActions labels={['Assign crew', 'Send on-my-way']} />
          </Panel>
        </ExampleFrame>
      }
      proof={[
        { title: 'They pick, you stop calling', body: 'Up to three windows, sent by text.' },
        { title: 'Booking from your own site', body: 'Requests come in with the job details.' },
        { title: `${CAPACITY_LEVELS.length} levels of “how full”`, body: 'Room, busy, full or over — at a glance.' },
        { title: 'Weather flags, never moves', body: 'It warns. A person decides.' },
      ]}
      story={{
        eyebrow: 'The promise you can actually keep',
        title: 'A date is easy to give. A day with room in it is the hard part.',
        body: 'Most calendars will happily let you book an eleventh hour into an eight-hour day, and you find out on the morning. Here a day carries what is promised against what exists, so a month reads as where there is room rather than as thirty-one cells you check one at a time — and the arrival window a customer is told is one the schedule agrees with.',
      }}
      benefits={[
        {
          title: 'Let the customer do the scheduling',
          body: 'Text up to three windows and their pick books itself. Or put an online booking page on your site and let a homeowner request an available window without talking to anybody at all.',
        },
        {
          title: 'See a day is full before you promise it',
          body: 'Every day is scored from open to over — booked hours against the hours that exist. The month view is a color ramp, so the question “where is there room” is answered by looking rather than by reading.',
        },
        {
          title: 'Keep the promise once it is made',
          body: 'Reminders go out ahead of the job and the customer can reply “C” to confirm. On-my-way texts are sent from the field when the tech actually leaves — the words are theirs to edit, the promised window is not.',
        },
      ]}
      afterBenefits={
        <section className="section-block" id="the-screens" aria-labelledby="screens-title">
          <div className={styles.shotsHead}>
            <p className="eyebrow">The calendar and booking flow</p>
            <h2 id="screens-title">Built for the real day, not an empty calendar.</h2>
            <p>
              Arrival windows rather than unrealistic minutes, scored day capacity, and online booking from your site.
            </p>
          </div>

          <ol className={styles.shots}>
            {SCHEDULING_FLOW.map((shot) => (
              <li className={styles.shot} key={shot.step}>
                <div className={styles.shotCopy}>
                  <span className={styles.shotStep}>{shot.step}</span>
                  <h3 className={styles.shotTitle}>{shot.title}</h3>
                  <p className={styles.shotBody}>{shot.body}</p>
                </div>
                <div className={styles.shotMedia}>
                  {shot.image ? (
                    <img
                      src={shot.image.src}
                      alt={shot.image.alt}
                      width={shot.image.width}
                      height={shot.image.height}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    shot.mock
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      }
      stepsEyebrow="From approved to on the calendar"
      stepsTitle="Four steps, and none of them is a phone call."
      steps={[
        {
          title: 'Offer the windows you can do',
          body: 'Pick up to three from days that have room, and send them as a text. Estimate visits work the same way, so a free look at the job books itself too.',
        },
        {
          title: 'Their pick writes itself in',
          body: 'The chosen window lands on the job and the assigned crew is told. Nobody retypes the date into a second calendar.',
        },
        {
          title: 'Check the day, not just the slot',
          body: 'Multi-day work expands across the days it needs. Drag anything that has to move; the day it lands on updates its own capacity.',
        },
        {
          title: 'Remind, then say you are coming',
          body: 'A reminder before the day, an on-my-way when the tech leaves. Both carry the job link, so the customer can see the scope rather than ring you to ask.',
        },
      ]}
      catalog={['scheduling']}
      catalogEyebrow="What the calendar handles"
      catalogTitle="Getting jobs on the calendar, and keeping them there."
      catalogNote="Every one of these writes to the same job record, which is why the crew, the customer and the invoice all already know the date."
      /* THE FIRST ONE IS OPEN, so it wants to be the question most people
         arrive with. That was "will it move a job because of the weather?" — a
         good answer to a question almost nobody asks first. Booking and
         calendar sync are the two that decide whether this fits somebody's
         business at all. */
      faq={[
        {
          q: 'Can customers book straight from my website?',
          a: 'Yes. The online booking page offers arrival windows you have room for, and the request arrives with the job details attached. Nothing goes on your calendar until you confirm it.',
        },
        {
          /* Asked and answered honestly, because the honest answer is no. There
             is no Google or Outlook integration anywhere in this product, and a
             page that stays quiet about it is a page that gets found out on day
             two. Verified: nothing in the codebase emits an .ics file or talks
             to the Google Calendar or Microsoft Graph APIs. */
          q: 'Does it sync with Google Calendar or Outlook?',
          a: 'Not today — there is no two-way sync and no calendar feed to subscribe to, and we would rather say so than let you find out after you have moved your jobs across. The schedule here is the one the booking page, the reminders, the arrival texts and the crew’s phones all read from, so it is built to be the calendar rather than a copy of one.',
        },
        {
          q: 'Will it move a job because of the weather?',
          a: 'No, and that is deliberate. Weather risk is scored against the kind of work and flagged for you, but a system that reschedules on a forecast will eventually move a job on a day that turns out fine — and the customer who took the morning off will never trust a date from you again. It flags, it suggests, a person decides.',
        },
        {
          q: 'What is an arrival window, exactly?',
          a: 'A range rather than a minute — “Wed 12–2 PM”. It is the honest version of a promise that depends on the job before it, and it is what the reminder and the on-my-way text both refer back to.',
        },
        {
          q: 'What if I need to reschedule?',
          a: 'Drag it. The day it leaves and the day it lands on both recalculate how full they are, and the customer and crew are told from the same record rather than from two separate messages you have to remember to send.',
        },
        {
          q: 'Does scheduling cost extra?',
          a: `${FEATURE_PRICING_NOTE} Scheduling has no separate per-booking charge. Stripe's ${STRIPE_PROCESSING_NOTE} are separate.`,
        },
      ]}
      cta={{
        title: 'Put the work on a calendar that knows what is on it.',
        note: `${FEATURE_PRICING_NOTE} Stripe's ${STRIPE_PROCESSING_NOTE} are separate.`,
      }}
    />
  );
}
