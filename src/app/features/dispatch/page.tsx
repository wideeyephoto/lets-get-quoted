import type { Metadata } from 'next';
import FeatureDetailLayout from '@/components/marketing/feature-detail-layout';
import ExampleFrame from '@/components/marketing/example-frame';
import styles from './dispatch.module.css';

export const metadata: Metadata = {
  title: 'Morning Crew Briefings & Dispatch Suite for Contractors',
  description:
    'One-click morning crew briefings, equipment checklists, route sequencing, site hazards, and gate codes sent straight to crew phones before the trucks roll.',
  alternates: { canonical: 'https://letsgetquoted.com/features/dispatch' },
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/features/dispatch',
    siteName: "Let's Get Quoted",
    title: 'One-click morning crew briefings, route maps and equipment checklists',
    description:
      'Eliminate 6 AM confusion. Push turn-by-turn routes, tool loadouts, and hazard warnings straight to your crew’s field phones.',
    images: [{ url: '/features/og-dispatch.jpg', width: 1200, height: 630, alt: 'Let’s Get Quoted Contractor Dispatch' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'One-click morning crew briefings, route maps and equipment checklists',
    description:
      'Eliminate 6 AM confusion. Push turn-by-turn routes, tool loadouts, and hazard warnings straight to your crew’s field phones.',
    images: ['/features/og-dispatch.jpg'],
  },
};

function MorningBriefingSimulator() {
  return (
    <div className={styles.dispatchSimulator}>
      <div className={styles.briefingHeader}>
        <div>
          <span className={styles.briefingBadge}>✦ Morning Crew Briefing Deck</span>
          <h4 className={styles.briefingTitle}>Today’s Dispatch · Crew: Mike &amp; Tanya</h4>
          <span className={styles.briefingDate}>Tuesday · 3 Scheduled Stops · Van #2</span>
        </div>
        <button type="button" className={styles.briefCrewBtn}>
          ⚡ Brief Sent (6:45 AM)
        </button>
      </div>

      {/* Stop Sequence Card */}
      <div className={styles.stopCard}>
        <div className={styles.stopTop}>
          <div className={styles.stopIndex}>STOP 01 · 8:30 AM</div>
          <span className={styles.stopDuration}>Est. 3.5 hrs</span>
        </div>
        <h5 className={styles.stopName}>Alex Morgan · 482 Elmwood Ave, Royal Oak</h5>
        <p className={styles.stopScope}><strong>Scope:</strong> 200A Main Panel Replacement &amp; Whole-Home Surge Protector</p>

        {/* Hazard & Access Badges */}
        <div className={styles.badgeRow}>
          <span className={`${styles.hazardPill} ${styles.hazardAlert}`}>
            ⚠️ Warning: Dog in rear yard (Gate code: #4921)
          </span>
          <span className={`${styles.hazardPill} ${styles.permitBadge}`}>
            ✓ City Permit #EL-2026-894 Active
          </span>
        </div>
      </div>

      {/* Equipment & Material Loadout Checklist */}
      <div className={styles.loadoutBox}>
        <div className={styles.loadoutHead}>
          <span>Truck Equipment &amp; Material Checklist</span>
          <small>4 / 4 Loaded</small>
        </div>
        <ul className={styles.checklist}>
          <li><span className={styles.checkDone}>✓</span> Square D QO 200A 40-Space Panel Enclosure</li>
          <li><span className={styles.checkDone}>✓</span> Square D 80kA Whole-Home Surge Arrestor</li>
          <li><span className={styles.checkDone}>✓</span> 2-inch Rigid Conduit &amp; Meter Hub Fitting</li>
          <li><span className={styles.checkDone}>✓</span> 28-ft Fiberglass Extension Ladder &amp; Torque Wrench</li>
        </ul>
      </div>
    </div>
  );
}

const FAQ = [
  {
    q: 'How do crew members receive their morning briefing?',
    a: 'Crew members receive a clean morning summary via SMS or directly in their mobile field view without downloading any app. They see today’s ordered stops, client phone numbers, lockbox codes, safety alerts, and equipment loadouts.',
  },
  {
    q: 'Can the owner customize the equipment checklist per job?',
    a: 'Yes. Equipment items are auto-suggested based on the approved quote’s trade and scope, and you can add or modify specialty tools (e.g. tile saws, core drills, scaffold planks) in one click.',
  },
  {
    q: 'Does it include turn-by-turn navigation?',
    a: 'Yes. Tapping the address on any stop opens Apple Maps, Google Maps, or Waze immediately with the destination pre-filled.',
  },
  {
    q: 'What happens if a job gets rescheduled due to weather?',
    a: 'The system recalculates the route, pushes an updated briefing to the crew, and sends arrival update texts to affected homeowners automatically.',
  },
];

export default function DispatchPage() {
  return (
    <FeatureDetailLayout
      breadcrumb={{ name: 'Crew Dispatch & Briefings', path: '/features/dispatch' }}
      eyebrow="Morning Crew Briefings & Dispatch Suite"
      title={
        <>
          Start every morning <em>without the 6 AM phone chaos.</em>
        </>
      }
      lede="Stop answering the same questions every morning. Brief your crew in one click with ordered route maps, equipment loadouts, site hazard warnings, and gate codes on their phones."
      heroNote="One-click morning dispatch · Safety warnings & gate codes · Integrated equipment loadout checklists"
      heroChips={['Turn-by-Turn Route Order', 'Tool Loadout Verification', 'Site Hazard & Gate Alerts']}
      primary={{ label: 'Open Live Crew Screen', href: '/demo/crew' }}
      secondary={{ label: 'See all features', href: '/features' }}
      demo={
        <ExampleFrame
          label="Automated Morning Dispatch Deck"
          note="Simulated morning crew briefing card. Orders stops, verifies equipment checklists, and highlights safety alerts before the truck departs."
        >
          <MorningBriefingSimulator />
        </ExampleFrame>
      }
      proof={[
        { title: 'Zero Morning Phone Tag', body: 'Routes, contacts, and access codes delivered before 7 AM.' },
        { title: 'Loaded Trucks', body: 'Equipment checklists ensure crews never forget essential tools.' },
        { title: 'Hazard Warnings', body: 'Flags pets, overhead lines, and lockboxes clearly.' },
        { title: 'Live Progress', body: 'Tracks arrival and job completion in real-time.' },
      ]}
      story={{
        eyebrow: 'A 15-minute morning delay costs thousands each month',
        title: 'Crews run faster when they know where they are going.',
        body: 'A missing key, forgotten specialty tool, or wrong address derails the entire day’s schedule. The Morning Crew Briefing compiles every approved detail into a single morning card on the crew’s phone so trucks roll on time and arrive fully prepared.',
      }}
      benefits={[
        {
          title: 'One-Click "Brief Crew" Dispatch',
          body: 'Generates a clean briefing for each vehicle or crew lead, with job scopes, customer notes, and timing windows pre-populated.',
        },
        {
          title: 'Equipment & Material Loadout Checklists',
          body: 'Ensures specialty tools, materials, and safety gear are on the truck before leaving the shop.',
        },
        {
          title: 'Access Codes & Hazard Alerts',
          body: 'Gate codes, keybox combinations, and site hazard warnings (dogs, fragile driveways, overhead lines) front and center.',
        },
      ]}
      stepsEyebrow="From schedule to smooth execution"
      stepsTitle="Four automated dispatch steps"
      steps={[
        {
          title: '01 · Schedule organizes today’s route',
          body: 'Jobs are sequenced by geography to minimize driving time and traffic delays.',
        },
        {
          title: '02 · Owner taps "Brief Crew"',
          body: 'The briefing deck is generated with scopes, addresses, and trade equipment lists.',
        },
        {
          title: '03 · Crew receives morning card',
          body: 'Sent to crew phones with one-tap map navigation and client contact buttons.',
        },
        {
          title: '04 · Real-time status syncs back',
          body: 'As the crew taps "On the Way" and "On Site", homeowner alerts trigger and the dashboard updates.',
        },
      ]}
      cta={{
        title: 'Start every morning with loaded trucks and clear routes.',
        note: 'Morning Crew Briefing deck is included with Crew & Field management.',
      }}
    >
      <section className="section-block" aria-labelledby="dispatch-faq-title" style={{ margin: '48px 0' }}>
        <div>
          <p className="eyebrow">Before you turn it on</p>
          <h2 id="dispatch-faq-title">The questions contractors ask us.</h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
          {FAQ.map((item, index) => (
            <details key={item.q} open={index === 0} style={{ padding: '1rem', background: 'var(--bg-surface-elevated, #f8fafc)', borderRadius: '8px', border: '1px solid var(--border-subtle, rgba(0,0,0,0.08))' }}>
              <summary style={{ fontWeight: 700, cursor: 'pointer', fontSize: '1rem' }}>{item.q}</summary>
              <p style={{ marginTop: '0.5rem', color: 'var(--text-secondary, #475569)', lineHeight: 1.5, fontSize: '0.9375rem' }}>{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </FeatureDetailLayout>
  );
}
