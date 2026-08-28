import type { Metadata } from 'next';
import FeatureDetailLayout from '@/components/marketing/feature-detail-layout';
import ExampleFrame from '@/components/marketing/example-frame';
import TextToRecordSimulator from '@/components/marketing/TextToRecordSimulator';
import { TRADES } from '@/lib/trades';
import styles from './text-to-record.module.css';

export const metadata: Metadata = {
  title: 'Text to the Record · AI Voice & Text-to-Job Field Intake',
  description:
    'Update contractor job records, quotes, punch lists, and voice notes straight from the truck. Send an SMS or voice memo—Gemini AI updates the exact job file instantly.',
  alternates: { canonical: 'https://letsgetquoted.com/features/text-to-record' },
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/features/text-to-record',
    siteName: "Let's Get Quoted",
    title: 'Text to the Record · AI Voice & Text-to-Job Field Intake',
    description:
      'Keep job records, quotes, and punch lists 100% updated from the road. Just send a text or voice memo to your platform number.',
    images: [
      {
        url: '/features/og-text-to-record.jpg',
        width: 1200,
        height: 630,
        alt: 'Let’s Get Quoted Text to the Record for Contractors',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Text to the Record · AI Voice & Text-to-Job Field Intake',
    description:
      'Keep job records, quotes, and punch lists 100% updated from the road. Just send a text or voice memo to your platform number.',
    images: ['/features/og-text-to-record.jpg'],
  },
};

const TRADE_PLAYBOOKS = [
  {
    icon: '⚡',
    trade: 'Electricians',
    quote: '“Add $450 to Miller for extra 12/2 Romex line and GFCI in pantry.”',
    result:
      'Instantly appends electrical materials & labor to quote J-104, recalculates tax, and pushes new total to the client approval draft.',
  },
  {
    icon: '🔧',
    trade: 'Plumbers',
    quote: '“Rough inspection passed at 124 Main. Need drywall crew Thursday 8am.”',
    result:
      'Transcribes voice memo, updates milestone status to Inspection Passed, and queues drywall crew arrival task in the team calendar.',
  },
  {
    icon: '🏠',
    trade: 'Roofing & Siding',
    quote: '“Add 4 sheets 1/2-inch CDX plywood rot repair ($320) to Johnson roof.”',
    result:
      'Attaches decking change order to active job record J-92 with photo timestamp before shingles go on.',
  },
  {
    icon: '❄️',
    trade: 'HVAC Technicians',
    quote: '“Replaced 45/5 dual capacitor on Carrier unit for Smith. Added 2 lbs R-410A.”',
    result:
      'Updates equipment maintenance history, itemizes refrigerant charge, and drafts $285 invoice ready for instant payment link.',
  },
  {
    icon: '🔨',
    trade: 'General Remodeling',
    quote: '“Punch list for crew: 1) Caulk exterior siding trim 2) Paint hallway baseboards.”',
    result:
      'Creates interactive checklist tasks on the crew field app with individual checkbox sign-offs.',
  },
  {
    icon: '🌳',
    trade: 'Landscaping & Tree Care',
    quote: '“New lead: Dave Miller 248-555-0812 oak limb removal estimate Tuesday 9am.”',
    result:
      'Parses caller contact info, tags tree removal service, and blocks out a 30-minute estimate window on the route.',
  },
];

const FAQS = [
  {
    q: 'How does Text to the Record know which job I am talking about?',
    a: 'Gemini cross-references your incoming text or voice memo with your active jobs, today’s schedule, recent quotes, and client names. If you say "Miller", "124 Main", or "J-104", it accurately maps to the correct record.',
  },
  {
    q: 'What happens if two active jobs have the same customer last name?',
    a: 'We enforce a Zero Destructive Guesses safety invariant. If two jobs match (e.g., two customers named "Smith"), the AI never assumes. It texts back clarifying options (e.g., "1) Smith - 84 Pine St or 2) Smith - 19 Oak Ave?"). You reply with 1 or 2 to confirm.',
  },
  {
    q: 'Can I send voice memos or audio recordings (MMS)?',
    a: 'Yes. You can send standard iPhone voice memos, WhatsApp audio, or Android MMS audio files. Gemini Multimodal transcribes messy background noise (diesel engines, power tools, highway wind) and extracts actionable job updates.',
  },
  {
    q: 'Can anyone text my platform number to change my jobs?',
    a: 'No. Inbound field commands are authenticated exclusively against your verified account phone number (accounts.alert_phone). Texts from unknown numbers receive safe default notices and cannot touch your account.',
  },
  {
    q: 'Does it update the customer invoice and client portal?',
    a: 'Yes. When you add a change order or extra line item via text, your quote totals, invoice drafts, and client portal balance update in real time. You never have to re-type line items at night.',
  },
  {
    q: 'Do I need to download a separate mobile app?',
    a: 'No. It works directly inside your native Apple iMessage or Android Messages app. You can also use Siri or Google Assistant hands-free while driving.',
  },
];

export default function TextToRecordPage() {
  return (
    <FeatureDetailLayout
      breadcrumb={{ name: 'Text to the Record', path: '/features/text-to-record' }}
      eyebrow="AI Voice & Text-to-Job Field Intake"
      title={
        <>
          Update jobs, quotes & punch lists from the road.{' '}
          <em>Just send a text or voice memo.</em>
        </>
      }
      lede="No app fatigue, no typing with work gloves, and zero lost change orders. Send a quick text or voice memo to your platform number—Gemini AI updates the exact job record, recalculates quote totals, and texts back confirmation in seconds."
      heroNote="Authenticated exclusively for your registered mobile phone · 1-segment transactional confirmation · Zero destructive guesses"
      heroChips={[
        'No App Download Needed',
        'Voice Memos & Native SMS',
        'Carrier-Verified & Safe',
      ]}
      primary={{ label: 'Start Free on Mobile', href: '/start' }}
      secondary={{ label: 'See All Features', href: '/features' }}
      demo={
        <ExampleFrame
          label="Live SMS & Voice Memo Field Intake Simulator"
          note="Simulate real contractor field messages: change orders, audio progress notes, punch lists, safety disambiguation, and quick lead intake."
        >
          <TextToRecordSimulator />
        </ExampleFrame>
      }
      proof={[
        {
          title: 'Zero App Fatigue',
          body: 'Works directly in Apple iMessage & Android SMS. No logins, passwords, or slow app downloads.',
        },
        {
          title: 'Gemini Multimodal Audio',
          body: 'Transcribes voice memos with heavy background truck noise, diesel engines, and jobsite tools.',
        },
        {
          title: 'Zero Destructive Guesses',
          body: 'Disambiguates duplicate customer names and asks for confirmation before modifying records.',
        },
        {
          title: 'Instant Office & Crew Sync',
          body: 'Updates sync in real-time across your job feed, quote math, invoice drafts, and crew calendar.',
        },
      ]}
      story={{
        eyebrow: 'Where contractor revenue and job notes disappear',
        title: 'The most expensive notes are the ones written on scrap 2x4s and forgotten.',
        body: 'You’re on-site and spot an extra $400 in materials. Or the building inspector signs off while you’re packing the truck. You tell yourself you’ll log it on your computer at 9:00 PM—but by then, the scrap lumber note is lost, the change order goes unbilled, and your crew is left guessing. Text to the Record turns every text and voice memo into an instant, permanent update to the job file while your hands are still dirty.',
      }}
      benefits={[
        {
          title: 'Capture Every Change Order On-Site',
          body: 'Never give away free labor or materials again. Text "$350 for extra drywall patch to Miller" and watch your quote and invoice math update immediately.',
        },
        {
          title: 'Hands-Free Driving Updates',
          body: 'Use Siri or Google Assistant while driving between job sites. Dictate progress notes, gate codes, and schedule adjustments without looking at a screen.',
        },
        {
          title: 'Automated Punch List Delegation',
          body: 'Text a 3-item punch list after your final walkthrough. The AI splits them into discrete tasks and notifies your field crew automatically.',
        },
        {
          title: 'Instant Lead Capture Anywhere',
          body: 'Met a neighbor while loading tools? Text their name, phone number, and issue. The AI creates the lead, scores urgency, and stages the quote slot.',
        },
      ]}
      afterBenefits={
        <>
          {/* Comparison Table Section */}
          <section className={styles.customSection}>
            <span className={styles.sectionEyebrow}>How It Compares</span>
            <h3 className={styles.sectionTitle}>
              Stop losing $1,500/month in unbilled field changes.
            </h3>
            <p className={styles.sectionLede}>
              See how Text to the Record compares to traditional scrap lumber notes, generic CRM apps,
              and memory.
            </p>

            <div className={styles.comparisonCard}>
              <table className={styles.compareTable}>
                <thead>
                  <tr>
                    <th>Capability</th>
                    <th>Scrap Lumber & Memory</th>
                    <th>Generic CRM Mobile Apps</th>
                    <th className={styles.highlightCol}>Let’s Get Quoted: Text to Record</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <strong>Speed to Log an Update</strong>
                    </td>
                    <td>
                      <span className={styles.warnIcon}>⚠️</span> 30 sec (lost later)
                    </td>
                    <td>
                      <span className={styles.crossIcon}>❌</span> 2–4 min (app login, taps)
                    </td>
                    <td className={styles.highlightCell}>
                      <span className={styles.checkIcon}>✅</span> 5 seconds (single text / voice memo)
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Usable While Driving</strong>
                    </td>
                    <td>
                      <span className={styles.crossIcon}>❌</span> Dangerous / impossible
                    </td>
                    <td>
                      <span className={styles.crossIcon}>❌</span> Unsafe on highways
                    </td>
                    <td className={styles.highlightCell}>
                      <span className={styles.checkIcon}>✅</span> 100% Hands-free Voice / Siri
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Change Order Bill Capture</strong>
                    </td>
                    <td>
                      <span className={styles.crossIcon}>❌</span> 30% forgotten & unbilled
                    </td>
                    <td>
                      <span className={styles.warnIcon}>⚠️</span> Requires manual math
                    </td>
                    <td className={styles.highlightCell}>
                      <span className={styles.checkIcon}>✅</span> Auto-calculates quote & invoice totals
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Voice MMS Audio Transcription</strong>
                    </td>
                    <td>
                      <span className={styles.crossIcon}>❌</span> None
                    </td>
                    <td>
                      <span className={styles.crossIcon}>❌</span> Rare / manual upload
                    </td>
                    <td className={styles.highlightCell}>
                      <span className={styles.checkIcon}>✅</span> Gemini Multimodal audio AI
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Duplicate Name Safety</strong>
                    </td>
                    <td>
                      <span className={styles.crossIcon}>❌</span> Human error
                    </td>
                    <td>
                      <span className={styles.warnIcon}>⚠️</span> Clunky search dropdowns
                    </td>
                    <td className={styles.highlightCell}>
                      <span className={styles.checkIcon}>✅</span> AI asks for confirmation if ambiguous
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Trade Playbooks Grid */}
          <section className={styles.customSection}>
            <span className={styles.sectionEyebrow}>Field Playbooks Across {TRADES.length} Trades</span>
            <h3 className={styles.sectionTitle}>Built for the real language of job sites.</h3>
            <p className={styles.sectionLede}>
              Whether you’re an electrician talking about Romex and 200-amp panels or a roofer adding CDX
              plywood sheets, Gemini understands your trade’s vocabulary.
            </p>

            <div className={styles.playbooksGrid}>
              {TRADE_PLAYBOOKS.map((playbook, idx) => (
                <div key={idx} className={styles.playbookCard}>
                  <div className={styles.playbookHeader}>
                    <span className={styles.playbookIcon}>{playbook.icon}</span>
                    <h4 className={styles.playbookTrade}>{playbook.trade}</h4>
                  </div>
                  <p className={styles.playbookQuote}>{playbook.quote}</p>
                  <p className={styles.playbookResult}>
                    <strong>Instant Action:</strong> {playbook.result}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Carrier Security & Trust Architecture */}
          <section className={styles.customSection}>
            <div className={styles.trustBanner}>
              <div className={styles.trustCol}>
                <span className={styles.trustTag}>Enterprise Security & Carrier Compliance</span>
                <h3 className={styles.trustTitle}>Authenticated exclusively for your phone.</h3>
                <p className={styles.trustText}>
                  Your business data stays completely protected. Incoming commands are verified against
                  your authenticated mobile number, and all actions are recorded in an immutable audit
                  feed.
                </p>
              </div>

              <div className={styles.trustCol}>
                <ul className={styles.trustList}>
                  <li className={styles.trustItem}>
                    <span className={styles.trustCheck}>✓</span>
                    <span>
                      <strong>Alert Phone Whitelist:</strong> Only your verified number can execute job
                      mutations.
                    </span>
                  </li>
                  <li className={styles.trustItem}>
                    <span className={styles.trustCheck}>✓</span>
                    <span>
                      <strong>10DLC Transactional Ingress:</strong> Strict carrier compliance with 1-segment
                      crisp receipts.
                    </span>
                  </li>
                  <li className={styles.trustItem}>
                    <span className={styles.trustCheck}>✓</span>
                    <span>
                      <strong>Immutable Audit Log:</strong> Every voice recording and text is logged in
                      the job activity feed.
                    </span>
                  </li>
                  <li className={styles.trustItem}>
                    <span className={styles.trustCheck}>✓</span>
                    <span>
                      <strong>Transactional Rollbacks:</strong> Database updates run inside atomic
                      transactions.
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {/* FAQ Section */}
          <section className={styles.customSection}>
            <span className={styles.sectionEyebrow}>Common Questions</span>
            <h3 className={styles.sectionTitle}>Everything you need to know about Text to the Record.</h3>
            <div className={styles.faqGrid}>
              {FAQS.map((faq, idx) => (
                <div key={idx} className={styles.faqItem}>
                  <h4 className={styles.faqQuestion}>{faq.q}</h4>
                  <p className={styles.faqAnswer}>{faq.a}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      }
      stepsEyebrow="HOW IT WORKS IN 4 STEPS"
      stepsTitle="From quick text to updated job file in 3 seconds."
      steps={[
        {
          title: '1. Send a Text or Voice Memo',
          body: 'Text your dedicated platform number from your cell phone. Dictate quote changes, punch lists, progress milestones, or new leads.',
        },
        {
          title: '2. Gemini Contextual Extraction',
          body: 'The AI loads your active jobs, today’s schedule, and quote drafts, matching your intent to the exact customer and project.',
        },
        {
          title: '3. Atomic Job Record Mutation',
          body: 'The database updates line items, recalculates totals, adds tasks, and writes the voice memo transcript into the job activity feed.',
        },
        {
          title: '4. Instant SMS Confirmation',
          body: 'You receive an instant confirmation text with the exact changes made, new totals, and a one-tap link to review.',
        },
      ]}
      stepsNote="Everything remains fully editable from your web dashboard and mobile device at any time."
      cta={{
        kicker: 'START FREE ON MOBILE',
        title: 'Keep every job file 100% updated without opening an app.',
        body: 'Join thousands of contractors saving 5+ hours a week and capturing every change order straight from the road.',
        primary: { label: 'Start Free on Mobile', href: '/start' },
        secondary: { label: 'Explore All Features', href: '/features' },
        note: 'No credit card required · Works on any phone · Free setup in 2 minutes',
      }}
    />
  );
}
