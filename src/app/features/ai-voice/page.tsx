import type { Metadata } from 'next';
import Link from 'next/link';
import FeatureDetailLayout from '@/components/marketing/feature-detail-layout';
import FaqList from '@/components/marketing/faq-list';
import { ReceptionistArtwork, ReceptionistCoverageOptions } from '@/components/marketing/receptionist-coverage';
import { AI_RECEPTIONIST_AVAILABILITY, AI_RECEPTIONIST_SIGNUP_URL, RECEPTIONIST_CALL_EXAMPLE } from '@/lib/ai-receptionist-marketing';
import styles from './ai-voice.module.css';

export const metadata: Metadata = {
  title: 'AI Receptionist for Contractors · After Hours or Full Time',
  description: 'Your calls covered. Your way. Choose after-hours support or a full-time AI receptionist that gathers caller details and keeps the conversation with your customer record.',
  alternates: { canonical: 'https://letsgetquoted.com/features/ai-voice' },
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/features/ai-voice',
    siteName: "Let's Get Quoted",
    title: 'AI Receptionist · Your calls covered. Your way.',
    description: 'Choose after-hours support or a full-time AI receptionist. Capture caller details, review the conversation, and follow up with context.',
    images: [{ url: '/features/og-ai-voice.jpg', width: 1200, height: 630, alt: 'AI Receptionist: Your calls covered. Your way. After-hours only or full-time coverage.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Receptionist · Your calls covered. Your way.',
    description: 'Choose after-hours support or a full-time AI receptionist. Capture caller details, review the conversation, and follow up with context.',
    images: ['/features/og-ai-voice.jpg'],
  },
};

const FAQ = [
  {
    q: 'Can I use the AI receptionist only after hours?',
    a: 'Yes. Choose after-hours coverage and set your business hours and time zone. During open hours, calls ring your team. Outside those hours, AI answers incoming customer calls. You can change the coverage mode in your receptionist settings.',
  },
  {
    q: 'What changes with full-time coverage?',
    a: 'AI answers incoming customer calls during the day and night, subject to your available call capacity and forwarding settings. It greets callers, gathers the project details and records the conversation so you can decide what happens next.',
  },
  {
    q: 'Can I keep my existing business number?',
    a: 'You can forward your existing business number to your configured AI line. Setup shows the phone-line and forwarding steps for your workspace. Choose your coverage and complete activation before sending customers to the line.',
  },
  {
    q: 'What happens when someone needs a person or all AI call slots are busy?',
    a: 'Configure a forwarding destination so callers can reach your team when a transfer is needed or AI capacity is full. If no forwarding number is configured, overflow callers hear that the line is unavailable. Review the transfer and overflow behavior during setup.',
  },
  {
    q: 'What will I receive after a call?',
    a: 'The caller’s request and conversation summary are available in your voice workspace, with a transcript and recording where enabled. You can review the details and follow up from the customer record.',
  },
  {
    q: 'How do I activate it, and what does it cost?',
    a: <>{AI_RECEPTIONIST_AVAILABILITY} <Link href="/pricing">Compare plan access, call capacity and phone charges.</Link></>,
  },
  {
    q: 'Can I still dictate my own job updates?',
    a: <>Yes. Your contractor-facing Copilot handles field notes and job updates. <Link href="/features/text-to-job">See Text-to-Job</Link> for that workflow.</>,
  },
];

function CallExample() {
  return (
    <section id="call-example" className={styles.example} aria-labelledby="call-example-title">
      <div className={styles.exampleIntro}>
        <p className={styles.eyebrow}>FROM FIRST HELLO TO A USEFUL REQUEST</p>
        <h2 id="call-example-title">Hear how a call becomes a clear next step.</h2>
        <p>Your receptionist gathers the details. You get the context to follow up.</p>
        <div className={styles.player}>
          <label htmlFor="receptionist-audio">Hear an example</label>
          <audio id="receptionist-audio" controls preload="none" aria-label="Scripted AI receptionist call example" aria-describedby="audio-example-note">
            <source src="/audio/ai-receptionist-example.wav" type="audio/wav" />
            <a href="/audio/ai-receptionist-example.wav">Download the call example</a>
          </audio>
          <small id="audio-example-note">Scripted illustration with synthesized voices. Your configured receptionist voice may differ. Read the full transcript alongside.</small>
        </div>
        <div className={styles.summary}>
          <span>REQUEST CAPTURED</span>
          <h3>Kitchen faucet replacement</h3>
          <dl><div><dt>Homeowner</dt><dd>Sarah · Royal Oak</dd></div><div><dt>Next step</dt><dd>Team callback, tomorrow morning preferred</dd></div></dl>
          <p>Callback requested. No appointment promised.</p>
        </div>
      </div>
      <ol className={styles.transcript} aria-label="Example call transcript">
        {RECEPTIONIST_CALL_EXAMPLE.map((line, index) => (
          <li key={index} className={line.speaker === 'AI Receptionist' ? styles.assistant : styles.caller}>
            <span>{line.speaker}</span><p>{line.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function AiVoicePage() {
  return (
    <FeatureDetailLayout
      className={styles.page}
      breadcrumb={{ name: 'AI Receptionist', path: '/features/ai-voice' }}
      eyebrow="AI RECEPTIONIST FOR CONTRACTORS"
      title={<>Your calls covered.<br /><em>Your way.</em></>}
      lede="After-hours backup or a full-time receptionist. AI answers, gathers the details, and keeps you informed—on the job or off the clock."
      heroNote="Eligible plan access and phone-line activation required. Review availability during setup."
      heroChips={['After-hours only', 'Full-time receptionist']}
      primary={{ label: 'Set up AI Receptionist', href: AI_RECEPTIONIST_SIGNUP_URL }}
      secondary={{ label: 'Hear an example', href: '#call-example' }}
      demo={<ReceptionistArtwork priority />}
      afterHero={<ReceptionistCoverageOptions />}
      afterProof={<CallExample />}
      stepsEyebrow="ONE CONVERSATION, CONNECTED TO YOUR BUSINESS"
      stepsTitle="From incoming call to informed follow-up."
      steps={[
        { title: 'The homeowner calls', body: 'Calls follow the coverage hours and phone routing you configured.' },
        { title: 'AI gathers the details', body: 'Your receptionist asks about the work, location and preferred callback.' },
        { title: 'The conversation is saved', body: 'Review the request, summary and available transcript in your voice workspace.' },
        { title: 'Your team takes the next step', body: 'Follow up, prepare the quote or arrange the visit with the customer.' },
      ]}
      cta={{
        kicker: 'AFTER HOURS OR FULL TIME',
        title: 'Put your calls in good hands.',
        body: 'Choose the coverage that fits your business, then complete your phone setup.',
        primary: { label: 'Set up AI Receptionist', href: AI_RECEPTIONIST_SIGNUP_URL },
        note: AI_RECEPTIONIST_AVAILABILITY,
      }}
    >
      <div className={styles.faqWrap}>
        <FaqList items={FAQ} eyebrow="BEFORE YOU SWITCH IT ON" title="Your receptionist questions, answered." id="voice-faq" />
      </div>
    </FeatureDetailLayout>
  );
}
