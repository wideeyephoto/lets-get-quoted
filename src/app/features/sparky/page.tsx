import type { Metadata } from 'next';
import Image from 'next/image';
import FeatureDetailLayout from '@/components/marketing/feature-detail-layout';
import ExampleFrame from '@/components/marketing/example-frame';
import SparkySimulator from './SparkySimulator';
import { TRADES } from '@/lib/trades';
import { COMPANIONS, SPARKY_TRADE_OPTIONS } from '@/lib/ai-assistant/companions';

export const metadata: Metadata = {
  title: 'AI Copilot with Avatars · 24/7 Field Sidekick & Trade Companions | Let’s Get Quoted',
  description:
    'You don’t even need to open an app. Run your contractor business completely by texting or calling your AI Copilot with customizable trade avatars.',
  alternates: { canonical: 'https://letsgetquoted.com/features/sparky' },
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/features/sparky',
    siteName: "Let's Get Quoted",
    title: 'AI Copilot with Avatars · 24/7 Field Sidekick & Trade Companions',
    description:
      'You don’t even need to open an app. Run your contractor business completely by texting or calling your AI Copilot with customizable trade avatars.',
    images: [{ url: '/product/jobs.webp', width: 1600, height: 1000, alt: 'AI Copilot with Avatars' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Copilot with Avatars · 24/7 Field Sidekick',
    description:
      'You don’t even need to open an app. Run your contractor business completely by texting or calling your AI Copilot with customizable trade avatars.',
    images: ['/product/jobs.webp'],
  },
};

const FAQ = [
  {
    q: 'What is the AI Copilot with Avatars?',
    a: 'The AI Copilot with Avatars is your intelligent contractor sidekick built directly into Let’s Get Quoted. It allows you to run your estimates, scheduling, job change orders, invoice follow-ups, and photo attachments via simple SMS text, voice calls, or mobile web. Plus, you can choose from specialized trade avatars (Sparky ⚡, Diesel 🔨, Echo 🦉, and Energy Orbit 💡) or customize Sparky into 8+ trade uniforms to match your company style.',
  },
  {
    q: 'Do I really not need to open an app to run my business with my AI Copilot?',
    a: 'That’s right! You don’t need to download, log into, or navigate a complex mobile app. You can run your entire day by simply texting or calling your AI Copilot at your dedicated platform number. Text change orders, speak voice memos while driving, text job site photos, or call your Copilot to check your schedule—it executes the database updates, calculates the math, and texts you back instant confirmation.',
  },
  {
    q: 'How does the "Walk-Up Estimate Brain Dump" work?',
    a: 'When you arrive at a job site or walk up to an estimate, open your Copilot on your phone, tap Create Quote, and just talk. Tell it everything you’re thinking—measurements, materials, demolition, labor hours, and optional add-ons. Your Copilot listens to your raw thoughts, calculates quantities and pricing, structures the line items, and gives you a professional quote ready to send before you leave the driveway.',
  },
  {
    q: 'Can I choose different AI companions and trade avatars?',
    a: 'Yes! Let’s Get Quoted includes customizable AI companions tailored to your style and trade—including Sparky ⚡ (Contractor AI Sidekick with 8 Trade Outfits), Diesel 🔨 (Jobsite Foreman), Echo 🦉 (Code & Safety Auditor), and AI Assistant 💡 (Modern Energy Orbit). You can switch between them anytime in your dashboard.',
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
    q: 'Is the AI Copilot with Avatars included on all subscription plans?',
    a: 'Yes. Your AI Copilot with customizable avatars is built directly into Let’s Get Quoted and is available on every plan — from Flex ($0/mo) up to Scale. There are no expensive third-party AI add-on fees or separate logins.',
  },
];

export default function AiCopilotWithAvatarsPage() {
  return (
    <FeatureDetailLayout
      breadcrumb={{ name: 'AI Copilot with Avatars', path: '/features/sparky' }}
      eyebrow="✦ 24/7 AI COPILOT WITH AVATARS · IN-APP &amp; SMS CONTRACTOR SIDEKICK"
      title={
        <>
          You don’t even need to open an app.{' '}
          <em>Run your business with your AI Copilot &amp; customizable avatars.</em>
        </>
      }
      lede="Text or call your Copilot from the truck, or open it when you walk up to an estimate. Tell it everything you’re thinking—it calculates the math, updates active job files, files site photos, tracks unpaid invoices, and sets reminders. Plus, switch between specialized trade avatars tailored to your workflow."
      heroNote="Zero app fatigue · Run everything by text & phone · Walk-up estimate brain dump · Customizable trade avatars"
      heroChips={[
        '🤖 AI Copilot with Trade Avatars',
        '⚡ No App Download Needed – Run via SMS & Call',
        '🚶 Walk-Up Estimate Brain Dump',
        '🎨 Custom Outfits for 8+ Contractor Trades',
      ]}
      primary={{ label: 'Start Free Platform Trial', href: 'https://app.letsgetquoted.com/start?goal=feature&source=feature_page' }}
      secondary={{ label: 'See all features', href: '/features' }}
      demo={
        <ExampleFrame
          label="Interactive AI Copilot & Avatar Simulator"
          note="Select any companion avatar or trade uniform above and test how your AI Copilot turns raw brain dumps into itemized quotes and sets reminders in real time."
        >
          <SparkySimulator />
        </ExampleFrame>
      }
      proof={[
        {
          title: 'Customizable Avatars',
          body: 'Choose from Sparky, Diesel, Echo, and Energy Orbit with specialized trade uniforms for 8+ industries.',
        },
        {
          title: 'No App Required',
          body: 'Run your quotes, jobs, and schedule entirely through Apple iMessage, Android SMS, and voice calls.',
        },
        {
          title: 'Walk-Up Brain Dump',
          body: 'Open your Copilot on an estimate, hit create quote, and talk freely; it itemizes labor, materials, and upsells.',
        },
        {
          title: 'Photo & Note Sorting',
          body: 'Text site photos, receipts, and audio notes to your Copilot; it files them to the right job and reminds you later.',
        },
      ]}
      story={{
        eyebrow: 'Contractors are tired of opening 5 different apps with work gloves',
        title: '“You don’t even need to open an app. Just text or call your AI Copilot with customizable trade avatars.”',
        body: 'Between driving between jobs, picking up materials at the supply house, and walking sites with homeowners, you don’t have time to tap through complicated mobile apps with dirty fingers. Your AI Copilot gives you the power of a full enterprise back-office right inside your phone’s native text and call app. Just text what happened, dictate a voice memo while driving, or talk through your raw estimate thoughts on site—and your Copilot handles all the software work for you.',
      }}
      benefits={[
        {
          title: 'Custom Trade Avatars & Personalities',
          body: 'Select the companion that matches your company vibe: Sparky the energetic sidekick, Diesel the tough jobsite foreman, Echo the code & safety auditor, or the sleek AI Energy Orbit.',
        },
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
      ]}
      stepsEyebrow="Zero Friction · Tailored Avatars"
      stepsTitle="Four simple ways to let your AI Copilot run your operations"
      steps={[
        {
          title: '01 · Pick your favorite avatar & trade uniform',
          body: 'Choose from Sparky, Diesel, Echo, or Energy Orbit, and customize their trade gear to match your exact business.',
        },
        {
          title: '02 · Text or call your Copilot from your truck',
          body: 'Send a quick SMS, text a site photo, or dictate a voice memo while driving between jobs.',
        },
        {
          title: '03 · Walk up to an estimate & brain dump',
          body: 'Speak your raw thoughts on site—your Copilot turns them into itemized quotes with materials, labor, and upsells.',
        },
        {
          title: '04 · Receive instant SMS confirmation',
          body: 'Your Copilot executes database updates, sets follow-up reminders, and texts back a 1-tap review receipt.',
        },
      ]}
      cta={{
        title: 'Meet your AI Copilot with Avatars today.',
        note: 'Included on all Let’s Get Quoted plans with zero app download required and no extra fees.',
      }}
    >
      {/* Companion & Avatar Showcase Section */}
      <section className="section-block" aria-labelledby="avatars-showcase-title" style={{ margin: '48px 0' }}>
        <div>
          <p className="eyebrow">✦ Meet the Companions</p>
          <h2 id="avatars-showcase-title">Choose your AI Copilot avatar and trade uniform.</h2>
          <p style={{ color: 'var(--text-secondary, #64748b)', maxWidth: '680px', marginTop: '8px' }}>
            Every contractor works differently. Customize your AI Copilot with tailored personas, response styles, and industry-specific uniforms.
          </p>
        </div>

        {/* 4 Core Companion Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1.25rem',
            marginTop: '2rem',
          }}
        >
          {COMPANIONS.map((companion) => (
            <div
              key={companion.id}
              style={{
                background: 'var(--bg-surface-elevated, #f8fafc)',
                border: '1px solid var(--border-subtle, rgba(0,0,0,0.08))',
                borderRadius: '14px',
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    overflow: 'hidden',
                    border: `2px solid ${companion.accentColor}`,
                    flexShrink: 0,
                    boxShadow: `0 0 12px ${companion.accentColor}40`,
                  }}
                >
                  <Image
                    src={companion.avatarSrc}
                    alt={companion.name}
                    width={56}
                    height={56}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary, #0f172a)' }}>
                    {companion.name}
                  </h3>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: companion.accentColor,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {companion.badgeLabel}
                  </span>
                </div>
              </div>

              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted, #64748b)', fontWeight: 500 }}>
                {companion.role} · {companion.species}
              </div>

              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary, #475569)', lineHeight: 1.5 }}>
                {companion.tagline}
              </p>

              <div
                style={{
                  marginTop: 'auto',
                  padding: '10px 12px',
                  background: 'rgba(0,0,0,0.03)',
                  borderRadius: '8px',
                  border: '1px solid rgba(0,0,0,0.05)',
                  fontSize: '0.8rem',
                  fontStyle: 'italic',
                  color: 'var(--text-secondary, #475569)',
                }}
              >
                &ldquo;{companion.introMessage.slice(0, 95)}...&rdquo;
              </div>
            </div>
          ))}
        </div>

        {/* Sparky Trade Uniforms Showcase */}
        <div
          style={{
            marginTop: '2.5rem',
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(168, 85, 247, 0.05) 100%)',
            border: '1px solid rgba(99, 102, 241, 0.2)',
            borderRadius: '16px',
            padding: '1.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontSize: '1.25rem' }}>🎨</span>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
              Sparky Trade Outfits · Tailored for Your Trade
            </h3>
          </div>
          <p style={{ color: 'var(--text-secondary, #475569)', fontSize: '0.9rem', margin: '0 0 1.25rem 0' }}>
            Dress your AI sidekick in certified trade attire with custom vocabulary and workflow focus:
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '12px',
            }}
          >
            {SPARKY_TRADE_OPTIONS.map((trade) => (
              <div
                key={trade.id}
                style={{
                  background: 'var(--bg-surface, #ffffff)',
                  border: '1px solid var(--border-subtle, rgba(0,0,0,0.08))',
                  borderRadius: '10px',
                  padding: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                }}
              >
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    overflow: 'hidden',
                    border: '2px solid rgba(99, 102, 241, 0.3)',
                  }}
                >
                  <Image
                    src={trade.avatarSrc}
                    alt={trade.name}
                    width={48}
                    height={48}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary, #0f172a)' }}>
                  {trade.name}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>
                  {trade.emoji} Certified
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="section-block" aria-labelledby="copilot-faq-title" style={{ margin: '48px 0' }}>
        <div>
          <p className="eyebrow">Everything you need to know</p>
          <h2 id="copilot-faq-title">Frequently asked questions about your AI Copilot with Avatars.</h2>
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
