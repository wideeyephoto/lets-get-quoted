import type { Metadata } from 'next';
import FeatureDetailLayout from '@/components/marketing/feature-detail-layout';
import ExampleFrame from '@/components/marketing/example-frame';
import { TRADES } from '@/lib/trades';
import styles from './ai-voice.module.css';

export const metadata: Metadata = {
  title: 'AI Voice Dispatcher · 24/7 Phone Receptionist for Contractors',
  description:
    'Meet your 24/7 AI phone receptionist and dispatcher. Your AI Copilot answers every homeowner call, qualifies job urgency, transcribes audio, and dispatches leads to your truck.',
  alternates: { canonical: 'https://letsgetquoted.com/features/ai-voice' },
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/features/ai-voice',
    siteName: "Let's Get Quoted",
    title: 'AI Voice Dispatcher · 24/7 Phone Receptionist for Contractors',
    description:
      'Answer every incoming call, qualify homeowner project details, transcribe audio, and dispatch quotes hands-free with your AI Copilot.',
    images: [{ url: '/features/og-voice.jpg', width: 1200, height: 630, alt: 'AI Voice Dispatcher for Contractors' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Voice Dispatcher · 24/7 Phone Receptionist for Contractors',
    description:
      'Answer every incoming call, qualify homeowner project details, transcribe audio, and dispatch quotes hands-free with your AI Copilot.',
    images: ['/features/og-voice.jpg'],
  },
};

function VoiceSimulator() {
  return (
    <div className={styles.voiceSimulator}>
      <div className={styles.callHeader}>
        <div className={styles.callerInfo}>
          <span className={styles.callBadge}>⚡ AI Dispatcher · 24/7 Contractor Phone Assistant</span>
          <h4 className={styles.callerName}>Homeowner: Sarah Jenkins</h4>
          <span className={styles.callerSub}>Royal Oak, MI · (248) 555-0192</span>
        </div>
        <div className={styles.callDuration}>01:42</div>
      </div>

      {/* Audio Waveform visualization */}
      <div className={styles.audioTrack} aria-label="Audio recording waveform">
        <div className={styles.waveform}>
          <span style={{ height: '40%' }}></span>
          <span style={{ height: '70%' }}></span>
          <span style={{ height: '100%' }}></span>
          <span style={{ height: '85%' }}></span>
          <span style={{ height: '60%' }}></span>
          <span style={{ height: '90%' }}></span>
          <span style={{ height: '50%' }}></span>
          <span style={{ height: '75%' }}></span>
          <span style={{ height: '95%' }}></span>
          <span style={{ height: '65%' }}></span>
          <span style={{ height: '40%' }}></span>
          <span style={{ height: '80%' }}></span>
          <span style={{ height: '100%' }}></span>
          <span style={{ height: '55%' }}></span>
          <span style={{ height: '30%' }}></span>
        </div>
        <span className={styles.audioLabel}>AI Voice Engine active · Speech-to-text recording</span>
      </div>

      {/* Real-time Transcription Stream */}
      <div className={styles.transcriptBox}>
        <div className={`${styles.bubble} ${styles.callerBubble}`}>
          <strong>Sarah (Caller):</strong> &ldquo;Hi, our main circuit breaker tripped twice this morning and we smell a faint burning odor near the basement panel. Can someone come out today?&rdquo;
        </div>
        <div className={`${styles.bubble} ${styles.aiBubble}`}>
          <strong>AI Dispatcher:</strong> &ldquo;I can get an emergency priority alert to our master electrician right now. Does the panel feel warm to the touch, and what brand is the breaker box if you know?&rdquo;
        </div>
        <div className={`${styles.bubble} ${styles.callerBubble}`}>
          <strong>Sarah (Caller):</strong> &ldquo;It’s a Square D 200-amp box. It feels slightly warm on the left side.&rdquo;
        </div>
      </div>

      {/* Extracted Structured Lead Card */}
      <div className={styles.extractedCard}>
        <div className={styles.extractedHead}>
          <span className={styles.extractedTag}>✦ Instant Lead Extraction</span>
          <span className={styles.priorityHot}>Urgent · Same-Day Fit</span>
        </div>
        <ul className={styles.extractedFacts}>
          <li><strong>Trade &amp; Issue:</strong> Electrical · Tripping main breaker + burning odor</li>
          <li><strong>Equipment:</strong> Square D 200A basement panel</li>
          <li><strong>Action Taken:</strong> Audio transcribed, phone verified, priority SMS dispatched to your truck</li>
        </ul>
      </div>
    </div>
  );
}

const FAQ = [
  {
    q: 'How does the 24/7 AI Phone Receptionist & Dispatcher work?',
    a: 'You get a dedicated phone line or forward your existing business number when you’re busy. Your AI Copilot answers immediately in a warm, natural voice, asks trade-specific diagnostic questions, transcribes the conversation, and delivers a structured lead summary to your dashboard and mobile phone via SMS dispatch alert.',
  },
  {
    q: 'Can I call or talk to my AI Copilot while driving to draft quotes or notes?',
    a: 'Yes! With Hands-Free Voice Actions, you can call your Copilot or tap the microphone button on your phone and speak normally (e.g. "Draft quote for 40 linear feet of copper gutter replacement, $1,400 labor, $850 materials"). Your Copilot formats it directly into an itemized quote draft ready for your approval.',
  },
  {
    q: 'Does it understand accents and technical contractor terminology?',
    a: 'Yes. Your AI Voice Engine is fine-tuned specifically on blue-collar trade vocabularies—from 200-amp panels and Romex wiring to architectural shingles, PEX manifold lines, and tonnage calculations.',
  },
  {
    q: 'What happens if a homeowner demands to speak to a human?',
    a: 'Your AI Copilot gracefully informs them that you are currently on a job site with your hands on tools, collects their exact urgency and callback window, and triggers an urgent priority alert directly to your personal phone.',
  },
  {
    q: 'Do I get the actual audio recording as well as the text transcript?',
    a: 'Yes. Every incoming call and voice note includes both the full audio playback clip and the timestamped, searchable text transcript logged right into the client’s file.',
  },
];

export default function AiVoicePage() {
  return (
    <FeatureDetailLayout
      breadcrumb={{ name: 'AI Voice Dispatcher', path: '/features/ai-voice' }}
      eyebrow="✦ 24/7 AI VOICE DISPATCHER &amp; RECEPTIONIST"
      title={
        <>
          Meet your 24/7 Voice Dispatcher. <em>Answer every call, even while on the tools.</em>
        </>
      }
      lede="Never lose a high-value job because you couldn't pick up the phone. Your AI Voice Receptionist & Dispatcher qualifies callers, records transcripts, dispatches urgent leads, and lets you dictate job notes hands-free from the truck."
      heroNote="Dedicated phone line · 2-way call forwarding · Audio recording + instant transcripts · Included on eligible plans"
      heroChips={['⚡ 24/7 Voice Dispatcher', '⚡ Trade-Specific Follow-ups', '⚡ Hands-Free Truck Dictation']}
      primary={{ label: 'Try AI Voice in Demo', href: '/demo/voice' }}
      secondary={{ label: 'See all features', href: '/features' }}
      demo={
        <ExampleFrame
          label="Live Call Qualifying & Real-Time AI Dispatching"
          note="Simulated incoming homeowner emergency call. AI qualifies the urgency, diagnoses the panel type, and dispatches the priority alert to the contractor instantly."
        >
          <VoiceSimulator />
        </ExampleFrame>
      }
      proof={[
        { title: 'Zero Missed Calls', body: 'Answers in 2 rings 24/7/365, even on weekends and holidays.' },
        { title: 'Hands-Free Dictation', body: 'Speak quotes and job notes while driving between sites.' },
        { title: 'Trade Vocabulary', body: `Trained on terminology across all ${TRADES.length} contractor trades.` },
        { title: 'Audio & Transcripts', body: 'Full audio playback and searchable text logged to the permanent job record.' },
      ]}
      story={{
        eyebrow: 'Contractors lose 30% of incoming jobs to voicemail',
        title: 'The first contractor to answer gets the job.',
        body: 'Homeowners with an urgent repair call down Google listings until someone answers. If you’re under a sink, on a roof, or on a highway, you can’t pick up. Your AI Voice Dispatcher answers immediately, speaks professionally with trade knowledge, collects photos and specs, and dispatches high-margin work directly to your mobile.',
      }}
      benefits={[
        {
          title: '24/7 AI Phone Receptionist & Dispatcher',
          body: 'Answers in a warm, natural voice. It asks the specific follow-up questions your trade requires to know if the job is worth driving for and dispatches priority SMS alerts.',
        },
        {
          title: 'Hands-Free Voice Actions & Dictation',
          body: 'Call your dedicated number or tap the mic on your dashboard to dictate site notes, record labor hours, or generate an itemized quote draft without typing a word.',
        },
        {
          title: 'Audio Transcripts & Instant Extraction',
          body: 'Transcribes every conversation, summarizes key job parameters, and syncs them straight to your client and lead pipeline.',
        },
      ]}
      stepsEyebrow="From phone ring to scheduled job"
      stepsTitle="Four automated steps while you keep working"
      steps={[
        {
          title: '01 · Homeowner calls your business line',
          body: 'The call routes to your AI Dispatcher with zero latency. It greets them using your business name.',
        },
        {
          title: '02 · Qualifies the project scope',
          body: 'Asks for address, urgency, equipment age, and job symptoms based on your trade rules.',
        },
        {
          title: '03 · Dispatches an alert to your phone',
          body: 'You receive an urgent SMS with the caller’s info, transcription summary, and scored priority.',
        },
        {
          title: '04 · Auto-sync to your job board',
          body: 'The recording and transcript attach to the customer profile, ready for one-tap quote generation.',
        },
      ]}
      cta={{
        title: 'Put AI Voice Dispatch on duty for your business.',
        note: 'AI voice assistant & phone line included on eligible plans. Standard voicemail takes over when credits run out.',
      }}
    >
      <section className="section-block" aria-labelledby="voice-faq-title" style={{ margin: '48px 0' }}>
        <div>
          <p className="eyebrow">Before you turn it on</p>
          <h2 id="voice-faq-title">Frequently asked questions about AI Voice Dispatcher.</h2>
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
