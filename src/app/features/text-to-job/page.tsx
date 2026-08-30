import type { Metadata } from 'next';
import FeatureDetailLayout from '@/components/marketing/feature-detail-layout';
import ExampleFrame from '@/components/marketing/example-frame';
import TextToRecordSimulator from '@/components/marketing/TextToRecordSimulator';
import TextToJobDataBeams from '@/components/marketing/TextToJobDataBeams';
import ScrapLumberComparison from '@/components/marketing/ScrapLumberComparison';
import ChangeOrderLeakageCalculator from '@/components/marketing/ChangeOrderLeakageCalculator';
import SteeringWheelCheatsheet from '@/components/marketing/SteeringWheelCheatsheet';
import SiriHandsFreeWizard from '@/components/marketing/SiriHandsFreeWizard';
import PhotoScopeEstimator from '@/components/marketing/PhotoScopeEstimator';
import UndoTimeMachine from '@/components/marketing/UndoTimeMachine';
import SunVisorCardGenerator from '@/components/marketing/SunVisorCardGenerator';
import LiveSmsSandbox from '@/components/marketing/LiveSmsSandbox';
import TradePlaybooksFilter from '@/components/marketing/TradePlaybooksFilter';
import styles from './text-to-job.module.css';

export const metadata: Metadata = {
  title: 'Text-to-Job · Text & Call Your AI Copilot from the Truck',
  description:
    'Text or call your smart AI contractor copilot straight from the truck. Send an SMS, photo, or voice memo—your Copilot updates the exact job file instantly.',
  alternates: { canonical: 'https://letsgetquoted.com/features/text-to-job' },
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/features/text-to-job',
    siteName: "Let's Get Quoted",
    title: 'Text-to-Job · Text & Call Your AI Copilot from the Truck',
    description:
      'Keep job records, quotes, and punch lists 100% updated from the road. Just send a text or voice memo to your AI Copilot at your platform number.',
    images: [
      {
        url: '/features/og-text-to-job.jpg',
        width: 1200,
        height: 630,
        alt: 'Let’s Get Quoted Text-to-Job with AI Copilot for Contractors',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Text-to-Job · Text & Call Your AI Copilot from the Truck',
    description:
      'Keep job records, quotes, and punch lists 100% updated from the road. Just send a text or voice memo to your AI Copilot at your platform number.',
    images: ['/features/og-text-to-job.jpg'],
  },
};

const FAQS = [
  {
    q: 'How does my AI Copilot know which job I am talking about?',
    a: 'Your AI Copilot cross-references your incoming text or voice memo with your active jobs, today’s schedule, recent quotes, and client names. If you say "Miller", "124 Main", or "J-104", it accurately maps to the correct record.',
  },
  {
    q: 'What happens if two active jobs have the same customer last name?',
    a: 'Your AI Copilot enforces a Zero Destructive Guesses safety invariant. If two jobs match (e.g., two customers named "Smith"), it never assumes. It texts back clarifying options (e.g., "1) Smith - 84 Pine St or 2) Smith - 19 Oak Ave?"). You reply with 1 or 2 to confirm.',
  },
  {
    q: 'Can I send voice memos or audio recordings (MMS)?',
    a: 'Yes. You can send standard iPhone voice memos, WhatsApp audio, or Android MMS audio files. Your AI Copilot transcribes messy background noise (diesel engines, power tools, highway wind) and extracts actionable job updates.',
  },
  {
    q: 'Can anyone text my platform number to change my jobs?',
    a: 'No. Inbound field commands to your AI Copilot are authenticated exclusively against your verified account phone number (accounts.alert_phone). Texts from unknown numbers receive safe default notices and cannot touch your account.',
  },
  {
    q: 'Does it update the customer invoice and client portal?',
    a: 'Yes. When you tell your AI Copilot to add a change order or extra line item via text, your quote totals, invoice drafts, and client portal balance update in real time. You never have to re-type line items at night.',
  },
  {
    q: 'Do I need to download a separate mobile app to reach my Copilot?',
    a: 'No. Your AI Copilot works directly inside your native Apple iMessage or Android Messages app. You can also talk to your Copilot via Siri or Google Assistant hands-free while driving.',
  },
  {
    q: 'What if bad cell service sends my text twice or I send an accidental duplicate?',
    a: 'Every message is processed with an idempotency fingerprint hash. Duplicate transmissions within 60 seconds are automatically deduplicated so your AI Copilot never double-bills a change order or creates duplicate line items.',
  },
  {
    q: 'Can I remove items or deduct money via text (negative change orders)?',
    a: 'Yes. Texting your Copilot "Remove backsplash from Miller" or "Deduct $200 for homeowner supplied vanity" creates a negative line item, recalculates the quote downward, and logs the change order reason.',
  },
  {
    q: 'What happens if I accidentally record background truck radio or pocket-dial a voice memo?',
    a: 'If no actionable trade instructions or job names are detected, your AI Copilot safely ignores the audio and sends a friendly notice: "No job changes detected — did you mean to log something?" without modifying any database records.',
  },
  {
    q: 'Can my apprentices or subcontractors change customer pricing or send quotes directly?',
    a: 'No. The Whitelist matrix enforces strict role-based controls. Crew members can log milestone notes, punch list items, and upload material receipts, but cannot authorize quote discounts or trigger client-facing financial links without owner approval.',
  },
];

export default function TextToJobPage() {
  return (
    <FeatureDetailLayout
      breadcrumb={{ name: 'Text-to-Job', path: '/features/text-to-job' }}
      eyebrow="✦ TEXT-TO-JOB WITH YOUR AI COPILOT · CONTRACTOR SIDEKICK"
      title={
        <>
          You don’t even need to open an app.{' '}
          <em>Run your business by simply texting or calling your AI Copilot.</em>
        </>
      }
      lede="Just send a message by voice or text to your AI Copilot, and it will organize notes, update job files, recalculate quote totals, file site photos, dispatch punch lists, and text back instant confirmation in seconds."
      heroNote="Zero app fatigue · Run everything by text & phone · Carrier-verified & authenticated · Instant SMS confirmation"
      heroChips={[
        '⚡ No App Download Needed',
        '⚡ Run Everything via Text & Call',
        '⚡ Voice Memos & Native SMS',
        '⚡ Auto-Files Photos & Reminders',
      ]}
      primary={{ label: 'Start Free on Mobile', href: '/start' }}
      secondary={{ label: 'See All Features', href: '/features' }}
      demo={
        <ExampleFrame
          label="Live SMS & Voice Memo Field Intake with AI Copilot"
          note="Simulate real contractor field messages to your AI Copilot: change orders, audio progress notes, punch lists, safety disambiguation, and quick lead intake."
        >
          <div id="simulator-frame">
            <TextToRecordSimulator />
          </div>
        </ExampleFrame>
      }
      proof={[
        {
          title: 'Zero App Fatigue',
          body: 'Text or call your Copilot directly in Apple iMessage & Android SMS. No logins, passwords, or slow apps.',
        },
        {
          title: 'Multimodal Audio',
          body: 'Your Copilot transcribes voice memos with heavy background truck noise, diesel engines, and jobsite tools.',
        },
        {
          title: 'Zero Destructive Guesses',
          body: 'Your Copilot disambiguates duplicate customer names and asks for confirmation before modifying records.',
        },
        {
          title: 'Instant Office & Crew Sync',
          body: 'Updates sync in real-time across your job feed, quote math, invoice drafts, and crew calendar.',
        },
      ]}
      story={{
        eyebrow: 'Where contractor revenue and job notes disappear',
        title: 'The most expensive notes are the ones written on scrap 2x4s and forgotten.',
        body: 'You’re on-site and spot an extra $400 in materials. Or the building inspector signs off while you’re packing the truck. You tell yourself you’ll log it on your computer at 9:00 PM—but by then, the scrap lumber note is lost, the change order goes unbilled, and your crew is left guessing. Text-to-Job with your AI Copilot turns every text, site photo, and voice memo into an instant, permanent update to the job file while your hands are still dirty.',
      }}
      benefits={[
        {
          title: 'Capture Every Change Order On-Site',
          body: 'Never give away free labor or materials again. Text "$350 for extra drywall patch to Miller" and watch your Copilot update your quote and invoice math immediately.',
        },
        {
          title: 'Hands-Free Driving Updates with Your Copilot',
          body: 'Use Siri, Google Assistant, or direct voice calls while driving between job sites. Dictate progress notes, gate codes, and schedule adjustments without looking at a screen.',
        },
        {
          title: 'Automated Punch List Delegation',
          body: 'Text a 3-item punch list to your Copilot after your final walkthrough. It splits them into discrete tasks and notifies your field crew automatically.',
        },
        {
          title: 'Send Photos & Get Reminded Later',
          body: 'Text site photos, receipts, or walkthrough notes directly to your Copilot via SMS. It sorts them into the right customer folder and sets automated reminders so you never forget to send quotes or order parts when you return to your desk.',
        },
        {
          title: 'Instant Lead Capture Anywhere',
          body: 'Met a neighbor while loading tools? Text their name, phone number, and issue to your Copilot. It creates the lead, scores urgency, and stages the quote slot.',
        },
      ]}
      afterBenefits={
        <>
          {/* Live Interactive 4-Pillar Data Beams Neural Conduit */}
          <section className={styles.customSection}>
            <TextToJobDataBeams />
          </section>

          {/* 1-Tap Live SMS Sandbox & Real Phone Tester */}
          <section className={styles.customSection}>
            <LiveSmsSandbox />
          </section>

          {/* Before & After Scrap Lumber vs. Digital File Comparison */}
          <section className={styles.customSection}>
            <ScrapLumberComparison />
          </section>

          {/* Interactive Change Order Profit Leakage ROI Calculator */}
          <section className={styles.customSection}>
            <ChangeOrderLeakageCalculator />
          </section>

          {/* Gemini Vision Photo-to-Scope AI Estimator */}
          <section className={styles.customSection}>
            <PhotoScopeEstimator />
          </section>

          {/* Visual Multimodal Architecture Pipeline */}
          <section className={styles.customSection}>
            <span className={styles.sectionEyebrow}>How Your AI Copilot Operates in the Field</span>
            <h3 className={styles.sectionTitle}>From dirty hands on site to an updated file in 3 seconds.</h3>
            <p className={styles.sectionLede}>
              See how your AI Copilot transcribes rough audio, validates customer context, and mutates live job records without logging into an app.
            </p>

            <div className={styles.pipelineGrid}>
              <div className={styles.pipelineCard}>
                <div className={styles.pipelineStep}>01 · Ingest</div>
                <div className={styles.pipelineIconBox}>🎙️</div>
                <h4 className={styles.pipelineCardTitle}>Voice MMS or SMS to Copilot</h4>
                <p className={styles.pipelineCardBody}>
                  Record a 15-second voice memo or send a quick text via Apple iMessage or Android Messages to your Copilot.
                </p>
                <div className={styles.pipelineDetailBox}>
                  <div className={styles.waveformMini}>
                    <span style={{ height: '30%' }}></span>
                    <span style={{ height: '80%' }}></span>
                    <span style={{ height: '100%' }}></span>
                    <span style={{ height: '60%' }}></span>
                    <span style={{ height: '90%' }}></span>
                    <span style={{ height: '40%' }}></span>
                  </div>
                  <small>Diesel & power tool noise filtered</small>
                </div>
              </div>

              <div className={styles.pipelineCard}>
                <div className={styles.pipelineStep}>02 · Context Match</div>
                <div className={styles.pipelineIconBox}>⚡</div>
                <h4 className={styles.pipelineCardTitle}>Trade AI Resolution</h4>
                <p className={styles.pipelineCardBody}>
                  Your AI Copilot matches caller intent against active jobs, today’s schedule, and open quotes.
                </p>
                <div className={styles.pipelineDetailBox}>
                  <div className={styles.matchPill}>Matched: Miller &middot; J-104</div>
                  <small>Zero destructive guessing invariant</small>
                </div>
              </div>

              <div className={styles.pipelineCard}>
                <div className={styles.pipelineStep}>03 · Mutation</div>
                <div className={styles.pipelineIconBox}>📊</div>
                <h4 className={styles.pipelineCardTitle}>Live Quote Math</h4>
                <p className={styles.pipelineCardBody}>
                  Recalculates line items, labor hours, and client portal totals inside an atomic transaction.
                </p>
                <div className={styles.pipelineDetailBox}>
                  <div className={styles.totalPill}>+$450 &rarr; New Total $3,750</div>
                  <small>Synced across office & mobile</small>
                </div>
              </div>

              <div className={styles.pipelineCard}>
                <div className={styles.pipelineStep}>04 · Receipt</div>
                <div className={styles.pipelineIconBox}>📱</div>
                <h4 className={styles.pipelineCardTitle}>Instant SMS Receipt</h4>
                <p className={styles.pipelineCardBody}>
                  Contractor receives a 1-segment confirmation receipt from AI Copilot with a 1-tap review link.
                </p>
                <div className={styles.pipelineDetailBox}>
                  <div className={styles.receiptPill}>✓ J-104 Updated by AI Copilot (1.4s)</div>
                  <small>Carrier-verified 10DLC delivery</small>
                </div>
              </div>
            </div>
          </section>

          {/* Comparison Table Section */}
          <section className={styles.customSection}>
            <span className={styles.sectionEyebrow}>How It Compares</span>
            <h3 className={styles.sectionTitle}>
              Stop losing $1,500/month in unbilled field changes.
            </h3>
            <p className={styles.sectionLede}>
              See how Text-to-Job with your AI Copilot compares to traditional scrap lumber notes, generic CRM apps,
              and memory.
            </p>

            <div className={styles.comparisonCard}>
              <table className={styles.compareTable}>
                <thead>
                  <tr>
                    <th>Capability</th>
                    <th>Scrap Lumber & Memory</th>
                    <th>Generic CRM Mobile Apps</th>
                    <th className={styles.highlightCol}>Text-to-Job with AI Copilot</th>
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
                      <span className={styles.checkIcon}>✅</span> 5 seconds (single text / voice memo to Copilot)
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
                      <span className={styles.checkIcon}>✅</span> 100% Hands-free Voice with Copilot
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
                      <span className={styles.checkIcon}>✅</span> 100% captured & billed automatically
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Duplicate Name Safety</strong>
                    </td>
                    <td>
                      <span className={styles.crossIcon}>❌</span> High error rate
                    </td>
                    <td>
                      <span className={styles.warnIcon}>⚠️</span> Manual search required
                    </td>
                    <td className={styles.highlightCell}>
                      <span className={styles.checkIcon}>✅</span> AI Copilot Zero-Guess Disambiguation
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Works on Native SMS</strong>
                    </td>
                    <td>
                      <span className={styles.crossIcon}>❌</span> N/A
                    </td>
                    <td>
                      <span className={styles.crossIcon}>❌</span> Requires heavy app
                    </td>
                    <td className={styles.highlightCell}>
                      <span className={styles.checkIcon}>✅</span> Native iMessage & Android SMS
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Trade-Specific Voice & SMS Playbooks */}
          <section className={styles.customSection}>
            <TradePlaybooksFilter />
          </section>

          {/* Undo Time Machine Safety Guarantee Band */}
          <section className={styles.customSection}>
            <UndoTimeMachine />
          </section>

          {/* Siri & Google Assistant Hands-Free Setup Wizard */}
          <section className={styles.customSection}>
            <SiriHandsFreeWizard />
          </section>

          {/* Sun Visor Emergency Prompt Cheatsheet Generator */}
          <section className={styles.customSection}>
            <SunVisorCardGenerator />
          </section>

          {/* Steering Wheel Voice Intake Cheatsheet Band */}
          <section className={styles.customSection}>
            <SteeringWheelCheatsheet />
          </section>
        </>
      }
      cta={{
        title: 'Start texting your AI Copilot from your truck today.',
        note: 'Text-to-Job with your AI Copilot is included on all plans. No mobile app download required.',
      }}
    >
      {/* FAQ Section */}
      <section className={styles.customSection}>
        <span className={styles.sectionEyebrow}>Common Questions</span>
        <h3 className={styles.sectionTitle}>Frequently asked questions about Text-to-Job with your AI Copilot.</h3>
        <p className={styles.sectionLede}>
          Everything you need to know about texting or calling your AI Copilot from the field.
        </p>

        <div className={styles.faqList}>
          {FAQS.map((faq, idx) => (
            <details key={idx} className={styles.faqItem} open={idx === 0}>
              <summary className={styles.faqQuestion}>{faq.q}</summary>
              <p className={styles.faqAnswer}>{faq.a}</p>
            </details>
          ))}
        </div>
      </section>
    </FeatureDetailLayout>
  );
}
