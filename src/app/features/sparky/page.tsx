import type { Metadata } from 'next';
import FeatureDetailLayout from '@/components/marketing/feature-detail-layout';
import ExampleFrame from '@/components/marketing/example-frame';
import SparkySimulator from './SparkySimulator';
import { TRADES } from '@/lib/trades';

export const metadata: Metadata = {
  title: 'Meet Your AI Contractor Copilot · 24/7 Field Sidekick & Trade Companions',
  description:
    'You don’t even need to open an app. Run your contractor business completely by simply texting or calling your AI Copilot for anything you need.',
  alternates: { canonical: 'https://letsgetquoted.com/features/sparky' },
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/features/sparky',
    siteName: "Let's Get Quoted",
    title: 'Meet Your AI Contractor Copilot · 24/7 Field Sidekick & Trade Companions',
    description:
      'You don’t even need to open an app. Run your contractor business completely by simply texting or calling your AI Copilot for anything you need.',
    images: [{ url: '/product/jobs.webp', width: 1600, height: 1000, alt: 'AI Contractor Copilot' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Meet Your AI Contractor Copilot · 24/7 Field Sidekick',
    description:
      'You don’t even need to open an app. Run your contractor business completely by simply texting or calling your AI Copilot for anything you need.',
    images: ['/product/jobs.webp'],
  },
};

const FAQ = [
  {
    q: 'Do I really not need to open an app to run my business with my AI Copilot?',
    a: 'That’s right! You don’t need to download, log into, or navigate a complex mobile app. You can run your entire day by simply texting or calling your AI Copilot at your dedicated platform number. Text change orders, speak voice memos while driving, text job site photos, or call your Copilot to check your schedule—it executes the database updates, calculates the math, and texts you back instant confirmation.',
  },
  {
    q: 'How does the "Walk-Up Estimate Brain Dump" work?',
    a: 'When you arrive at a job site or walk up to an estimate, open your Copilot on your phone, tap Create Quote, and just talk. Tell it everything you’re thinking—measurements, materials, demolition, labor hours, and optional add-ons. Your Copilot listens to your raw thoughts, calculates quantities and pricing, structures the line items, and gives you a professional quote ready to send before you leave the driveway.',
  },
  {
    q: 'Can I choose different AI companions and avatars?',
    a: 'Yes! Let’s Get Quoted includes customizable AI companions tailored to your style and trade—including Sparky ⚡ (Contractor AI Sidekick), Diesel 🔨 (Jobsite Foreman), Echo 🦉 (Code & Safety Auditor), and AI Assistant 💡 (Modern Energy Orbit). You can switch between them anytime in your dashboard.',
  },
  {
    q: 'Can I text my AI Copilot photos, receipts, and voice memos from the job site?',
    a: 'Yes! Through our built-in Text-to-Job feature, you can text photos of job site damage, material receipts, or quick audio voice memos directly to your Copilot from your phone. It automatically identifies which client or job they belong to, attaches the photos, logs the notes, and organizes everything in your dashboard.',
  },
  {
    q: 'How do reminders work when I send a text or photo?',
    a: 'If you text something like "Remind me tomorrow at 7:30 AM to send a quote for 2 sheets of 3/4 plywood for 142 Elm St", your AI Copilot not only attaches your notes and photos to that job file, but also schedules an automated push notification and dashboard alert so you never forget to follow up when you get back to your desk.',
  },
  {
    q: 'What makes this AI Copilot different from generic chatbots?',
    a: 'Your AI Copilot isn’t a generic chatbot that just gives you generic text. It is deeply connected to your Let’s Get Quoted database and active screen. When you say "add $300 for gutter guards to this quote" or "reschedule to Friday 9am", it identifies the exact job file you are viewing, calculates the math, updates the line items, and modifies your live schedule.',
  },
  {
    q: 'How does it know what screen or job I am looking at when I am on my computer?',
    a: 'Your Copilot features In-Context Workspace Awareness. Whenever you open it on an active Job, Client Profile, or Cash Flow screen on desktop or mobile web, it pre-hydrates the active record ID and details. You never have to re-type client names, addresses, or job numbers.',
  },
  {
    q: 'Does it understand technical trade terminology?',
    a: `Yes. Your AI Copilot is fine-tuned on the vocabulary of all ${TRADES.length} contractor trades — including roofing squares, electrical breaker amperage, plumbing PEX diameters, HVAC tonnage, masonry mixes, and carpentry framing fasteners.`,
  },
  {
    q: 'Is the AI Copilot included on all subscription plans?',
    a: 'Yes. Your AI Copilot is built directly into Let’s Get Quoted and is available on every plan — from Flex ($0/mo) up to Scale. There are no expensive third-party AI add-on fees or separate logins.',
  },
];

export default function SparkyFeaturePage() {
  return (
    <FeatureDetailLayout
      breadcrumb={{ name: 'AI Copilot', path: '/features/sparky' }}
      eyebrow="✦ 24/7 AI COPILOT · IN-APP &amp; SMS CONTRACTOR SIDEKICK"
      title={
        <>
          You don’t even need to open an app.{' '}
          <em>Run your business by simply texting or calling your AI Copilot.</em>
        </>
      }
      lede="Text or call your Copilot from the truck, or open it when you walk up to an estimate. Tell it everything you’re thinking—it calculates the math, updates active job files, files site photos, tracks unpaid invoices, and sets reminders. Plus, choose from customizable companions like Sparky, Diesel, Echo, and Energy Orbit."
      heroNote="Zero app fatigue · Run everything by text & phone · Walk-up estimate brain dump · Included on all plans"
      heroChips={[
        '⚡ No App Download Needed',
        '⚡ Run Everything via Text & Call',
        '⚡ Walk-Up Estimate Brain Dump',
        '⚡ Customizable Companions & Avatars',
      ]}
      primary={{ label: 'Start Free Platform Trial', href: 'https://app.letsgetquoted.com/start?goal=feature&source=feature_page' }}
      secondary={{ label: 'See all features', href: '/features' }}
      demo={
        <ExampleFrame
          label="Live In-Context Command & Walk-Up Estimate Simulator"
          note="Test how your AI Copilot turns on-site brain dumps into itemized quotes, auto-sorts texted site photos, and sets follow-up reminders in real time."
        >
          <SparkySimulator />
        </ExampleFrame>
      }
      proof={[
        {
          title: 'No App Required',
          body: 'Run your quotes, jobs, and schedule entirely through Apple iMessage, Android SMS, and phone calls.',
        },
        {
          title: 'Walk-Up Brain Dump',
          body: 'Open your Copilot on an estimate, hit create quote, and talk freely; it itemizes labor, materials, and upsells.',
        },
        {
          title: 'Photo & Note Sorting',
          body: 'Text site photos, receipts, and audio notes to your Copilot; it files them to the right job and reminds you later.',
        },
        {
          title: 'Live Screen Awareness',
          body: 'On your computer or phone, your Copilot knows the active job on your screen for 1-click workspace actions.',
        },
      ]}
      story={{
        eyebrow: 'Contractors are tired of opening 5 different apps with work gloves',
        title: '“You don’t even need to open an app. Just text or call your AI Copilot for anything you need.”',
        body: 'Between driving between jobs, picking up materials at the supply house, and walking sites with homeowners, you don’t have time to tap through complicated mobile apps with dirty fingers. Your AI Copilot gives you the power of a full enterprise back-office right inside your phone’s native text and call app. Just text what happened, dictate a voice memo while driving, or talk through your raw estimate thoughts on site—and your Copilot handles all the software work for you.',
      }}
      benefits={[
        {
          title: 'Run Everything via Text & Voice Calls',
          body: 'No app download or login required. Text change orders, dictate voice notes while driving, or call your Copilot to check your schedule—it executes the database updates and texts you back instant confirmation.',
        },
        {
          title: 'Walk-Up Estimate Brain Dump',
          body: 'Just open your Copilot when you walk up to an estimate, tap create quote, and talk freely. Tell it the scope, materials, and crew hours—it calculates the math and structures the line items instantly.',
        },
        {
          title: 'Text-to-Job Photo Sorting & Reminders',
          body: 'Text photos of job damage, supplier receipts, or scope changes. Your Copilot files them directly into the customer’s job folder and sets a reminder for when you’re ready to quote.',
        },
        {
          title: 'Contextual Screen Awareness',
          body: 'When you are viewing Job #1042 on your dashboard and tell your Copilot "reschedule this to Friday at 9am" or "add a $350 gutter guard add-on", it acts directly on that record with zero ambiguity.',
        },
      ]}
      stepsEyebrow="Zero Friction · Pure Contractor Speed"
      stepsTitle="Four simple ways to let your AI Copilot run your operations"
      steps={[
        {
          title: '01 · Text or call your Copilot from your truck',
          body: 'Send a 5-second SMS, text a site photo, or dictate a voice memo through Apple Siri or Google Assistant.',
        },
        {
          title: '02 · Walk up to an estimate & brain dump',
          body: 'Speak your raw thoughts on site—your Copilot turns them into itemized quotes with materials, labor, and upsells.',
        },
        {
          title: '03 · Your Copilot updates files & calculates math',
          body: 'It attaches photos, recalibrates pricing, sets follow-up reminders, and logs notes to the permanent job record.',
        },
        {
          title: '04 · Receive instant SMS confirmation',
          body: 'Your Copilot texts back a 1-segment transactional receipt with a 1-tap link to review, send, or approve.',
        },
      ]}
      cta={{
        title: 'Start texting and calling your AI Copilot today.',
        note: 'Included on all Let’s Get Quoted plans with zero app download required and no extra fees.',
      }}
    >
      <section className="section-block" aria-labelledby="copilot-faq-title" style={{ margin: '48px 0' }}>
        <div>
          <p className="eyebrow">Everything you need to know</p>
          <h2 id="copilot-faq-title">Frequently asked questions about your AI Copilot.</h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
          {FAQ.map((item, index) => (
            <details
              key={item.q}
              open={index === 0}
              style={{
                padding: '1.25rem',
                background: 'var(--bg-surface-elevated, #f8fafc)',
                borderRadius: '10px',
                border: '1px solid var(--border-subtle, rgba(0,0,0,0.08))',
              }}
            >
              <summary style={{ fontWeight: 700, cursor: 'pointer', fontSize: '1.05rem' }}>
                {item.q}
              </summary>
              <p
                style={{
                  marginTop: '0.75rem',
                  color: 'var(--text-secondary, #475569)',
                  lineHeight: 1.6,
                  fontSize: '0.95rem',
                }}
              >
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </section>
    </FeatureDetailLayout>
  );
}
