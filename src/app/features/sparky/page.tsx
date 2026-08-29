import type { Metadata } from 'next';
import FeatureDetailLayout from '@/components/marketing/feature-detail-layout';
import ExampleFrame from '@/components/marketing/example-frame';
import SparkySimulator from './SparkySimulator';
import { TRADES } from '@/lib/trades';

export const metadata: Metadata = {
  title: 'Meet Sparky · Your AI Contractor Sidekick',
  description:
    'You don’t even need to open an app. Run your contractor business completely by simply texting or calling Sparky for anything you need.',
  alternates: { canonical: 'https://letsgetquoted.com/features/sparky' },
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/features/sparky',
    siteName: "Let's Get Quoted",
    title: 'Meet Sparky · Your AI Contractor Sidekick',
    description:
      'You don’t even need to open an app. Run your contractor business completely by simply texting or calling Sparky for anything you need.',
    images: [{ url: '/product/jobs.webp', width: 1600, height: 1000, alt: 'Sparky AI Contractor Sidekick' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Meet Sparky · Your AI Contractor Sidekick',
    description:
      'You don’t even need to open an app. Run your contractor business completely by simply texting or calling Sparky for anything you need.',
    images: ['/product/jobs.webp'],
  },
};

const FAQ = [
  {
    q: 'Do I really not need to open an app to run my business with Sparky?',
    a: 'That’s right! You don’t need to download, log into, or navigate a complex mobile app. You can run your entire day by simply texting or calling Sparky at your dedicated platform number. Text change orders, speak voice memos while driving, text job site photos, or call Sparky to check your schedule—he executes the database updates, calculates the math, and texts you back instant confirmation.',
  },
  {
    q: 'How does the "Walk-Up Estimate Brain Dump" work?',
    a: 'When you arrive at a job site or walk up to an estimate, open Sparky on your phone, tap Create Quote, and just talk. Tell him everything you’re thinking—measurements, materials, demolition, labor hours, and optional add-ons. Sparky listens to your raw thoughts, calculates quantities and pricing, structures the line items, and gives you a professional quote ready to send before you leave the driveway.',
  },
  {
    q: 'Can I text Sparky photos, receipts, and voice memos from the job site?',
    a: 'Yes! Through our built-in Text-to-Job feature, you can text photos of job site damage, material receipts, or quick audio voice memos directly to Sparky from your phone. Sparky automatically identifies which client or job they belong to, attaches the photos, logs the notes, and organizes everything in your dashboard.',
  },
  {
    q: 'How do reminders work when I send Sparky a text or photo?',
    a: 'If you text Sparky something like "Remind me tomorrow at 7:30 AM to send a quote for 2 sheets of 3/4 plywood for 142 Elm St", Sparky not only attaches your notes and photos to that job file, but also schedules an automated push notification and dashboard alert so you never forget to follow up when you get back to your desk.',
  },
  {
    q: 'What is Sparky and how is it different from generic AI chatbots?',
    a: 'Sparky isn’t a generic chatbot that just gives you generic text. Sparky is deeply connected to your Let’s Get Quoted database and active screen. When you say "add $300 for gutter guards to this quote" or "reschedule to Friday 9am", Sparky identifies the exact job file you are viewing, calculates the math, updates the line items, and modifies your live schedule.',
  },
  {
    q: 'How does Sparky know what screen or job I am looking at when I am on my computer?',
    a: 'Sparky features In-Context Workspace Awareness. Whenever you open Sparky on an active Job, Client Profile, or Cash Flow screen on desktop or mobile web, Sparky pre-hydrates the active record ID and details. You never have to re-type client names, addresses, or job numbers.',
  },
  {
    q: 'Does Sparky understand technical trade terminology?',
    a: `Yes. Sparky is fine-tuned on the vocabulary of all ${TRADES.length} contractor trades — including roofing squares, electrical breaker amperage, plumbing PEX diameters, HVAC tonnage, masonry mixes, and carpentry framing fasteners.`,
  },
  {
    q: 'Is Sparky included on all subscription plans?',
    a: 'Yes. Sparky is built directly into Let’s Get Quoted and is available on every plan — from Flex ($0/mo) up to Scale. There are no expensive third-party AI add-on fees or separate logins.',
  },
];

export default function SparkyFeaturePage() {
  return (
    <FeatureDetailLayout
      breadcrumb={{ name: 'Meet Sparky', path: '/features/sparky' }}
      eyebrow="✦ MEET SPARKY · IN-APP &amp; SMS CONTRACTOR SIDEKICK"
      title={
        <>
          You don’t even need to open an app.{' '}
          <em>Run your business by simply texting or calling Sparky.</em>
        </>
      }
      lede="Text or call Sparky from the truck, or open him when you walk up to an estimate. Tell him everything you’re thinking—he calculates the math, updates active job files, files site photos, tracks unpaid invoices, and sets reminders for anything you need."
      heroNote="Zero app fatigue · Run everything by text & phone · Walk-up estimate brain dump · Included on all plans"
      heroChips={[
        '⚡ No App Download Needed',
        '⚡ Run Everything via Text & Call',
        '⚡ Walk-Up Estimate Brain Dump',
        '⚡ Auto-Sorts Photos & Reminders',
      ]}
      primary={{ label: 'Try Sparky in the Demo', href: '/demo' }}
      secondary={{ label: 'See all features', href: '/features' }}
      demo={
        <ExampleFrame
          label="Live In-Context Command & Walk-Up Estimate Simulator"
          note="Test how Sparky turns on-site brain dumps into itemized quotes, auto-sorts texted site photos, and sets follow-up reminders in real time."
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
          body: 'Open Sparky on an estimate, hit create quote, and talk freely; he itemizes labor, materials, and upsells.',
        },
        {
          title: 'Photo & Note Sorting',
          body: 'Text site photos, receipts, and audio notes to Sparky; he files them to the right job and reminds you later.',
        },
        {
          title: 'Live Screen Awareness',
          body: 'On your computer or phone, Sparky knows the active job on your screen for 1-click workspace actions.',
        },
      ]}
      story={{
        eyebrow: 'Contractors are tired of opening 5 different apps with work gloves',
        title: '“You don’t even need to open an app. Just text or call Sparky for anything you need.”',
        body: 'Between driving between jobs, picking up materials at the supply house, and walking sites with homeowners, you don’t have time to tap through complicated mobile apps with dirty fingers. Sparky gives you the power of a full enterprise back-office right inside your phone’s native text and call app. Just text Sparky what happened, dictate a voice memo while driving, or tell him your raw estimate thoughts on site—and Sparky handles all the software work for you.',
      }}
      benefits={[
        {
          title: 'Run Everything via Text & Voice Calls',
          body: 'No app download or login required. Text change orders, dictate voice notes while driving, or call Sparky to check your schedule—he executes the database updates and texts you back instant confirmation.',
        },
        {
          title: 'Walk-Up Estimate Brain Dump',
          body: 'Just open Sparky when you walk up to an estimate, tap create quote, and talk freely. Tell him the scope, materials, and crew hours—he calculates the math and structures the line items instantly.',
        },
        {
          title: 'Text-to-Job Photo Sorting & Reminders',
          body: 'Text photos of job damage, supplier receipts, or scope changes. Sparky files them directly into the customer’s job folder and sets a reminder for when you’re ready to quote.',
        },
        {
          title: 'Contextual Screen Awareness',
          body: 'When you are viewing Job #1042 on your dashboard and tell Sparky "reschedule this to Friday at 9am" or "add a $350 gutter guard add-on", he acts directly on that record with zero ambiguity.',
        },
      ]}
      stepsEyebrow="Zero Friction · Pure Contractor Speed"
      stepsTitle="Four simple ways to let Sparky run your operations"
      steps={[
        {
          title: '01 · Text or call Sparky from your truck',
          body: 'Send a 5-second SMS, text a site photo, or dictate a voice memo through Apple Siri or Google Assistant.',
        },
        {
          title: '02 · Walk up to an estimate & brain dump',
          body: 'Speak your raw thoughts on site—Sparky turns them into itemized quotes with materials, labor, and upsells.',
        },
        {
          title: '03 · Sparky updates files & calculates math',
          body: 'He attaches photos, recalibrates pricing, sets follow-up reminders, and logs notes to the permanent job record.',
        },
        {
          title: '04 · Receive instant SMS confirmation',
          body: 'Sparky texts back a 1-segment transactional receipt with a 1-tap link to review, send, or approve.',
        },
      ]}
      cta={{
        title: 'Start texting and calling Sparky today.',
        note: 'Included on all Let’s Get Quoted plans with zero app download required and no extra fees.',
      }}
    >
      <section className="section-block" aria-labelledby="sparky-faq-title" style={{ margin: '48px 0' }}>
        <div>
          <p className="eyebrow">Everything you need to know</p>
          <h2 id="sparky-faq-title">Frequently asked questions about Sparky.</h2>
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
