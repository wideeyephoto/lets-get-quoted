import Link from 'next/link';
import styles from './voice-calls.module.css';

interface VoiceControlsSectionProps {
  status: 'active' | 'paused' | 'off';
  answerMode: 'always' | 'after_hours';
  phoneNumber: string | null;
  greeting: string | null;
  transferNumber: string | null;
  businessName: string | null;
  trade: string | null;
  serviceAreas: string | null;
}

const AI_CONTROLS = [
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

export default function VoiceControlsSection({
  status,
  answerMode,
  phoneNumber,
  businessName,
  trade,
}: VoiceControlsSectionProps) {
  const isAnswering = status === 'active';
  const statusLabel = isAnswering ? 'Online & Answering' : status === 'paused' ? 'Paused' : 'Off';
  const modeLabel = answerMode === 'always' ? '24/7 All Inbound Calls' : 'After Hours Only';

  return (
    <section className={styles.controlsSection} aria-label="AI Voice Assistant Controls">
      {/* Top Assistant Status Banner */}
      <div className={styles.assistantStatusBanner}>
        <div className={styles.statusMetaGroup}>
          <div className={styles.statusIndicator} style={!isAnswering ? { background: 'rgba(245, 158, 11, 0.15)', borderColor: 'rgba(245, 158, 11, 0.35)', color: '#f59e0b' } : undefined}>
            <span className={styles.statusDot} style={!isAnswering ? { background: '#f59e0b', boxShadow: '0 0 10px #f59e0b' } : undefined} />
            <span>{statusLabel}</span>
          </div>

          <div className={styles.statusDetails}>
            <span className={styles.statusTitle}>
              {businessName || 'Your Business'} · {trade ? `${trade.charAt(0).toUpperCase() + trade.slice(1)} Assistant` : 'AI Receptionist'}
            </span>
            <span className={styles.statusSub}>
              {phoneNumber ? `Answering on ${phoneNumber}` : 'Dedicated voice line'} · Mode: {modeLabel}
            </span>
          </div>
        </div>

        <Link href="/dashboard/settings#receptionist" className={styles.configActionBtn}>
          Configure Voice Receptionist →
        </Link>
      </div>

      {/* Controls Grid */}
      <div className={styles.controlsHeader}>
        <div className={styles.controlsHeaderTitle}>
          <h2>Controls & Capabilities Granted to AI Voice Assistant</h2>
          <p>The autonomous tools, safety guards, and verified data sources available to your receptionist on live calls.</p>
        </div>
      </div>

      <div className={styles.controlsGrid}>
        {AI_CONTROLS.map((control) => (
          <div key={control.id} className={styles.controlCard}>
            <div>
              <div className={styles.controlCardTop}>
                <div className={styles.controlIconWrapper}>{control.icon}</div>
                <span className={`${styles.controlBadge} ${control.badgeClass}`}>{control.badge}</span>
              </div>
              <h3 className={styles.controlTitle}>{control.title}</h3>
              <p className={styles.controlDesc}>{control.desc}</p>
            </div>
            <div className={styles.controlMeta}>
              <span>Function</span>
              <span>{control.functionSignature}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
