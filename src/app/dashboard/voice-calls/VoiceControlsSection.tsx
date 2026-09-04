import React from 'react';
import Link from 'next/link';
import { displayPhone } from '@/lib/phone';
import styles from './voice-calls.module.css';

interface VoiceStatusBannerProps {
  status: 'active' | 'paused' | 'off';
  answerMode: 'always' | 'after_hours';
  dedicatedNumber: string | null;
  isReady: boolean;
  businessName: string | null;
  trade: string | null;
}

interface VoiceControlsSectionProps extends VoiceStatusBannerProps {
  greeting?: string | null;
  transferNumber?: string | null;
  serviceAreas?: string | null;
}

export const AI_CONTROLS = [
  {
    id: 'contractor-hotline',
    title: 'Contractor & Crew Voice Hotline',
    badge: 'Field Voice Assistant',
    badgeClass: styles.badgeLiveTool,
    icon: '🎙️',
    desc: 'When you or your registered crew call your business number, the AI recognizes your phone and switches to your Field Assistant — taking job updates, logging materials, and creating leads verbally.',
    functionSignature: 'update_job_details + create_lead + log_crew_time_and_materials',
  },
  {
    id: 'in-call-booking',
    title: 'In-Call Appointment Booking',
    badge: 'Live SWAIG Tool',
    badgeClass: styles.badgeLiveTool,
    icon: '⚡',
    desc: 'Checks live crew capacity, claims atomic holds, creates pre-scheduled bookings in CRM, and texts an instant confirmation SMS to caller.',
    functionSignature: 'check_available_slots + book_appointment_slot',
  },
  {
    id: 'booking-link-sms',
    title: 'Direct SMS Booking Links',
    badge: 'Live SWAIG Tool',
    badgeClass: styles.badgeLiveTool,
    icon: '💬',
    desc: 'Immediately dispatches self-service booking links to mobile callers with carrier compliance and opt-out support.',
    functionSignature: 'send_booking_link',
  },
  {
    id: 'emergency-triage',
    title: 'Emergency Hazard Triage',
    badge: 'Safety Escalation',
    badgeClass: styles.badgeSafety,
    icon: '🚨',
    desc: 'Detects active leaks, gas smells, sparking panels, or roof collapse. Flags hot triage and dispatches priority owner SMS alerts.',
    functionSignature: 'automated_hazard_detection',
  },
  {
    id: 'warm-transfers',
    title: 'Auditable Warm Transfers',
    badge: 'Live SWAIG Tool',
    badgeClass: styles.badgeLiveTool,
    icon: '📞',
    desc: 'Bridges urgent callers to on-call staff with spoken caller context announcement before connecting.',
    functionSignature: 'transfer_to_business',
  },
  {
    id: 'clean-energy-rebates',
    title: 'Clean Energy & IRA Rebates',
    badge: 'Knowledge Tool',
    badgeClass: styles.badgeGrounding,
    icon: '💚',
    desc: 'Provides accurate guidance on federal IRA 25C tax credits, HOMES program incentives, and local utility heat pump rebates.',
    functionSignature: 'check_rebates_and_incentives',
  },
  {
    id: 'caller-recognition',
    title: 'Returning Caller Recognition',
    badge: 'Context Grounding',
    badgeClass: styles.badgeGrounding,
    icon: '👤',
    desc: 'Recognizes verified existing customers by phone number, referencing active jobs, scheduled dates, and past quotes.',
    functionSignature: 'verified_crm_identity_lookup',
  },
  {
    id: 'faq-grounding',
    title: 'Published FAQ Grounding',
    badge: 'Knowledge Grounding',
    badgeClass: styles.badgeGrounding,
    icon: '📚',
    desc: 'Strictly grounded in approved business FAQs, trade licenses, and service areas to eliminate hallucinations.',
    functionSignature: 'site_faq_and_catalog_sync',
  },
  {
    id: 'tamper-proof-auth',
    title: 'Admission-Bound Tool Security',
    badge: 'Security Permit',
    badgeClass: styles.badgeSecurity,
    icon: '🔒',
    desc: 'Every tool execution is cryptographically signed with HMAC-SHA256 tokens strictly bound to the active call session.',
    functionSignature: 'hmac_sha256_token_verification',
  },
];

export function VoiceStatusBanner({
  status,
  answerMode,
  dedicatedNumber,
  isReady,
  businessName,
  trade,
}: VoiceStatusBannerProps) {
  const isAnswering = isReady && status === 'active';
  const statusLabel = !isReady
    ? (dedicatedNumber ? 'Standby · Verification Pending' : 'Standby · No Dedicated Line')
    : isAnswering
    ? 'Online & Answering'
    : status === 'paused'
    ? 'Paused'
    : 'Off';
  const modeLabel = answerMode === 'always' ? '24/7 All Inbound Calls' : 'After Hours Only';

  const statusSubtext = isReady && dedicatedNumber
    ? status === 'active'
      ? `Answering on ${displayPhone(dedicatedNumber)} · Mode: ${modeLabel}`
      : status === 'paused'
      ? `Dedicated line ${displayPhone(dedicatedNumber)} · Answering paused`
      : `Dedicated line ${displayPhone(dedicatedNumber)} · Answering off`
    : dedicatedNumber
    ? `Dedicated line ${displayPhone(dedicatedNumber)} connected · Verification in progress`
    : 'Dedicated line not connected · Setup required before AI can answer live calls';

  return (
    <div className={styles.assistantStatusBanner} role="region" aria-label="AI Voice Assistant Status">
      <div className={styles.statusMetaGroup}>
        <div className={isAnswering ? styles.statusIndicator : styles.statusIndicatorStandby}>
          <span className={isAnswering ? styles.statusDot : styles.statusDotStandby} />
          <span>{statusLabel}</span>
        </div>

        <div className={styles.statusDetails}>
          <span className={styles.statusTitle}>
            {businessName || 'Your Business'} · {trade ? `${trade.charAt(0).toUpperCase() + trade.slice(1)} Assistant` : 'AI Receptionist'}
          </span>
          <span className={styles.statusSub}>
            {statusSubtext}
          </span>
        </div>
      </div>

      <Link href="/dashboard/voice-calls?view=settings" className={styles.configActionBtn}>
        Configure Voice Receptionist →
      </Link>
    </div>
  );
}

export function VoiceCapabilitiesGrid() {
  return (
    <section className={styles.controlsSection} aria-label="AI Voice Assistant Controls and Capabilities">
      <div className={styles.controlsHeader}>
        <div className={styles.controlsHeaderTitle}>
          <h2>Voice Assistant Capabilities &amp; Safety Guards</h2>
          <p>The autonomous tools, safety escalations, and verified business data sources active on your live phone line.</p>
        </div>
      </div>

      <div className={styles.capabilitiesList}>
        {AI_CONTROLS.map((control) => (
          <div key={control.id} className={styles.capabilityItem}>
            <div className={styles.capabilityIcon}>{control.icon}</div>
            <div className={styles.capabilityContent}>
              <div className={styles.capabilityHeader}>
                <h3 className={styles.capabilityTitle}>{control.title}</h3>
                <span className={`${styles.controlBadge} ${control.badgeClass}`}>{control.badge}</span>
              </div>
              <p className={styles.capabilityDesc}>{control.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ContractorHotlineShowcase({ dedicatedNumber }: { dedicatedNumber?: string | null }) {
  return (
    <section
      style={{
        margin: '1.75rem 0',
        padding: '1.75rem 2rem',
        background: 'linear-gradient(135deg, rgba(88, 28, 135, 0.45) 0%, rgba(30, 27, 75, 0.6) 100%)',
        border: '1px solid rgba(168, 85, 247, 0.35)',
        borderRadius: '1.25rem',
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.25)',
        position: 'relative',
        overflow: 'hidden',
      }}
      aria-label="Contractor & Crew Shared Phone Hotline Showcase"
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
        <div style={{ maxWidth: '680px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0.75rem', background: 'rgba(168, 85, 247, 0.2)', border: '1px solid rgba(168, 85, 247, 0.4)', borderRadius: '2rem', fontSize: '0.78rem', color: '#e9d5ff', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.75rem' }}>
            <span>⚡ Zero Extra Numbers Needed</span>
            <span>·</span>
            <span>2-Way Shared AI Rail</span>
          </div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 700, color: '#ffffff', margin: '0 0 0.5rem 0', letterSpacing: '-0.02em' }}>
            🎙️ Contractor &amp; Crew Call-In Hotline
          </h2>
          <p style={{ margin: 0, fontSize: '0.95rem', color: '#d1d5db', lineHeight: 1.6 }}>
            Your business phone line doubles as your field crew&apos;s 24/7 personal dispatcher. When you or any registered team member calls your shared business number, the AI recognizes the caller ID and switches into <strong>Field Assistant Mode</strong>.
          </p>
        </div>

        {dedicatedNumber ? (
          <div style={{ background: 'rgba(0, 0, 0, 0.35)', border: '1px solid rgba(255, 255, 255, 0.12)', padding: '1rem 1.25rem', borderRadius: '0.85rem', textAlign: 'center' }}>
            <span style={{ display: 'block', fontSize: '0.75rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Shared Hotline</span>
            <strong style={{ display: 'block', fontSize: '1.25rem', color: '#a855f7', marginTop: '0.25rem' }}>{displayPhone(dedicatedNumber)}</strong>
            <span style={{ display: 'block', fontSize: '0.75rem', color: '#4ade80', marginTop: '0.25rem' }}>✓ Auto-Recognizes Crew</span>
          </div>
        ) : null}
      </div>

      {/* 3-Step Flow Diagram */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginTop: '1.25rem' }}>
        <div style={{ background: 'rgba(15, 23, 42, 0.65)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '0.85rem', padding: '1.15rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
            <span style={{ background: '#9333ea', color: '#fff', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700 }}>1</span>
            <strong style={{ color: '#f3f4f6', fontSize: '0.9rem' }}>Call From Your Phone</strong>
          </div>
          <p style={{ margin: 0, fontSize: '0.82rem', color: '#9ca3af', lineHeight: 1.45 }}>
            Call the business line from the owner mobile or any registered crew phone while driving or on-site.
          </p>
        </div>

        <div style={{ background: 'rgba(15, 23, 42, 0.65)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '0.85rem', padding: '1.15rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
            <span style={{ background: '#9333ea', color: '#fff', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700 }}>2</span>
            <strong style={{ color: '#f3f4f6', fontSize: '0.9rem' }}>AI Greets You By Name</strong>
          </div>
          <p style={{ margin: 0, fontSize: '0.82rem', color: '#9ca3af', lineHeight: 1.45 }}>
            <em>&quot;Hey Dave, what job or lead are you updating today?&quot;</em> — ready for your verbal instructions.
          </p>
        </div>

        <div style={{ background: 'rgba(15, 23, 42, 0.65)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '0.85rem', padding: '1.15rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
            <span style={{ background: '#9333ea', color: '#fff', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700 }}>3</span>
            <strong style={{ color: '#f3f4f6', fontSize: '0.9rem' }}>Instant CRM Updates</strong>
          </div>
          <p style={{ margin: 0, fontSize: '0.82rem', color: '#9ca3af', lineHeight: 1.45 }}>
            Speak scope changes, quote prices, hours, or materials. AI commits updates and confirms back in 1 sentence.
          </p>
        </div>
      </div>

      {/* Examples & Links */}
      <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ fontSize: '0.82rem', color: '#d1d5db' }}>
          <strong style={{ color: '#c084fc' }}>Example Spoken Commands:</strong> &quot;Add 4 recessed LED lights on Miller&apos;s job for $650&quot; · &quot;Take a new lead for Bob on Elm St&quot; · &quot;Log 4 hrs and $180 materials for J-104&quot;
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link
            href="/dashboard/crew?tab=people"
            className="btn secondary"
            style={{ fontSize: '0.82rem', padding: '0.4rem 0.85rem' }}
          >
            👥 Manage Crew Numbers →
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function VoiceControlsSection(props: VoiceControlsSectionProps) {
  return (
    <div>
      <VoiceStatusBanner {...props} />
      <ContractorHotlineShowcase dedicatedNumber={props.dedicatedNumber} />
      <VoiceCapabilitiesGrid />
    </div>
  );
}
