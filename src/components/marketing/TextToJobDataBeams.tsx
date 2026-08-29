'use client';

import { useState } from 'react';
import styles from './text-to-job-beams.module.css';

type BeamScenario = {
  id: string;
  tabLabel: string;
  icon: string;
  inboundType: 'Voice Memo' | 'Native SMS' | 'Receipt Photo' | 'Spanish Voice';
  sender: string;
  rawText: string;
  confidence: string;
  audioDuration?: string;
  jobsTarget: {
    title: string;
    detail: string;
    table: string;
    mutation: string;
  };
  leadsTarget?: {
    title: string;
    detail: string;
    table: string;
    mutation: string;
  };
  scheduleTarget: {
    title: string;
    detail: string;
    table: string;
    mutation: string;
  };
  crewTarget: {
    title: string;
    detail: string;
    table: string;
    mutation: string;
  };
};

const BEAM_SCENARIOS: BeamScenario[] = [
  {
    id: 'change-order',
    tabLabel: 'Quote Change Order (+$450)',
    icon: '💰',
    inboundType: 'Native SMS',
    sender: 'Alert Phone (You)',
    rawText:
      '“Add $450 to Miller job for extra 12/2 Romex line and GFCI outlet in pantry. Put Mike on rough inspection Thursday 9am.”',
    confidence: '99.8%',
    jobsTarget: {
      title: '1. Jobs & Quotes',
      detail: 'Added $450.00 Romex & GFCI line item to J-104',
      table: 'quote_line_items',
      mutation: 'Total: $3,250 → $3,700',
    },
    leadsTarget: {
      title: '2. Leads & CRM',
      detail: 'Client Dave Miller linked with 1-tap quote approval link',
      table: 'client_notifications',
      mutation: 'SMS Approval Queued',
    },
    scheduleTarget: {
      title: '3. Schedule & Route',
      detail: 'Inspection arrival window Thursday 9:00 AM – 11:00 AM',
      table: 'schedule_occurrences',
      mutation: 'Thu 9:00 AM Blocked',
    },
    crewTarget: {
      title: '4. Crew & Tasks',
      detail: 'Assigned to Mike (Van #2) with rough electrical checklist',
      table: 'crew_assignments',
      mutation: 'Assigned: Mike T.',
    },
  },
  {
    id: 'bilingual-voice',
    tabLabel: 'Bilingual Spanish Voice Memo',
    icon: '🎙️',
    inboundType: 'Spanish Voice',
    sender: 'Crew Phone (Carlos)',
    rawText:
      '“Inspección aprobada en 124 Main. Necesitamos instaladores de paneles de yeso el jueves a las 8am. Faltan 2 cajas de tornillos.”',
    confidence: '99.4%',
    audioDuration: '0:11',
    jobsTarget: {
      title: '1. Jobs & Quotes',
      detail: 'Status updated: Rough Inspection Passed · 2 boxes screws logged',
      table: 'job_activity_feed',
      mutation: 'Rough Passed (Audit Log)',
    },
    leadsTarget: {
      title: '2. Leads & CRM',
      detail: 'Customer milestone progress notice ready to send',
      table: 'client_portal',
      mutation: 'Portal Stage Updated',
    },
    scheduleTarget: {
      title: '3. Schedule & Route',
      detail: 'Drywall crew delivery scheduled for Thursday 8:00 AM',
      table: 'schedule_occurrences',
      mutation: 'Thu 8:00 AM Queued',
    },
    crewTarget: {
      title: '4. Crew & Tasks',
      detail: 'Carlos replied in Spanish: "✓ Inspección registrada y materiales agregados"',
      table: 'crew_notifications',
      mutation: 'Spanish SMS Receipt',
    },
  },
  {
    id: 'urgent-lead',
    tabLabel: 'Lead Ingest on the Highway',
    icon: '⚡',
    inboundType: 'Native SMS',
    sender: 'Alert Phone (You)',
    rawText:
      '“New lead: Dave Miller 248-555-0812 oak limb hanging on roof over power line. Needs urgent estimate Tuesday morning.”',
    confidence: '99.1%',
    jobsTarget: {
      title: '1. Jobs & Quotes',
      detail: 'Staged estimate draft with Tree Removal & Hazard scope',
      table: 'jobs',
      mutation: 'Draft Estimate J-112',
    },
    leadsTarget: {
      title: '2. Leads & CRM',
      detail: 'Created Dave Miller · Phone: (248) 555-0812 · Urgency: Emergency',
      table: 'leads',
      mutation: 'High Priority Lead',
    },
    scheduleTarget: {
      title: '3. Schedule & Route',
      detail: 'Tuesday 9:30 AM arrival window clustered with Royal Oak route',
      table: 'calendar_slots',
      mutation: 'Route Density: 94%',
    },
    crewTarget: {
      title: '4. Crew & Tasks',
      detail: 'Bucket truck #3 loadout checklist flagged for power line safety',
      table: 'crew_tasks',
      mutation: 'Equipment Hazard Note',
    },
  },
  {
    id: 'receipt-ocr',
    tabLabel: 'Receipt OCR & Auto-Margin',
    icon: '🧾',
    inboundType: 'Receipt Photo',
    sender: 'Alert Phone (You)',
    rawText:
      '“Home Depot receipt for 124 Main Miller job ($148.50 PEX fittings and SharkBite tees)”',
    confidence: '99.7%',
    jobsTarget: {
      title: '1. Jobs & Quotes',
      detail: 'Itemized 3/4" PEX & SharkBite fittings to job expenses',
      table: 'quote_line_items',
      mutation: 'Expenses: $620 | 80.9% Margin',
    },
    leadsTarget: {
      title: '2. Leads & CRM',
      detail: 'Material receipt photo timestamped for client transparent billing',
      table: 'receipt_logs',
      mutation: 'Photo Proof Attached',
    },
    scheduleTarget: {
      title: '3. Schedule & Route',
      detail: 'Material pickup logged at Home Depot #2741 (12-min trip)',
      table: 'route_clustering',
      mutation: 'Supply Run Logged',
    },
    crewTarget: {
      title: '4. Crew & Tasks',
      detail: 'Plumbing rough-in materials marked "On Truck / Ready on Site"',
      table: 'crew_tasks',
      mutation: 'Material Check: Ready',
    },
  },
];

export default function TextToJobDataBeams() {
  const [activeScenarioId, setActiveScenarioId] = useState<string>('change-order');
  const [beamPulse, setBeamPulse] = useState(false);

  const scenario = BEAM_SCENARIOS.find((s) => s.id === activeScenarioId) || BEAM_SCENARIOS[0];

  function handleSelectScenario(id: string) {
    setActiveScenarioId(id);
    setBeamPulse(true);
    setTimeout(() => setBeamPulse(false), 600);
  }

  return (
    <div className={styles.wrapper}>
      {/* Header */}
      <div className={styles.headerRow}>
        <div className={styles.titleArea}>
          <span className={styles.badge}>✦ The 4-Pillar Neural Router</span>
          <h3 className={styles.title}>
            One 10-second text routes cleanly to 4 core database systems.
          </h3>
          <p className={styles.subtitle}>
            Select a field scenario to watch Gemini AI isolate intent, match project context, and
            power 4 atomic database mutations in parallel.
          </p>
        </div>

        {/* Scenario Strip */}
        <div className={styles.scenarioStrip}>
          {BEAM_SCENARIOS.map((sc) => {
            const isActive = sc.id === activeScenarioId;
            return (
              <button
                key={sc.id}
                type="button"
                onClick={() => handleSelectScenario(sc.id)}
                className={`${styles.scenarioBtn} ${isActive ? styles.scenarioBtnActive : ''}`}
              >
                <span>{sc.icon}</span>
                <span>{sc.tabLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Conduit Diagram */}
      <div className={styles.conduitGrid}>
        {/* Left: Inbound Message */}
        <div className={styles.inboundCard}>
          <div className={styles.inboundHead}>
            <span className={styles.inboundTypeTag}>
              {scenario.icon} {scenario.inboundType}
            </span>
            <span className={styles.inboundSender}>{scenario.sender}</span>
          </div>

          <p className={styles.rawSpeechBox}>{scenario.rawText}</p>

          <div className={styles.inboundFooter}>
            <span>Extraction Confidence:</span>
            <span className={styles.confidencePill}>{scenario.confidence} Match</span>
          </div>
        </div>

        {/* Center: Gemini Neural Prism */}
        <div className={styles.prismCol}>
          <div
            className={styles.prismOrb}
            style={{
              transform: beamPulse ? 'scale(1.15)' : 'scale(1)',
              transition: 'transform 0.3s ease',
            }}
          >
            ⚡
          </div>
          <span className={styles.prismLabel}>Gemini AI 1.4s</span>
        </div>

        {/* Right: 4 Pillar Laser Targets */}
        <div className={styles.pillarsCol}>
          {/* Target 1: Jobs */}
          <div className={`${styles.targetCard} ${styles.targetCardJobs}`}>
            <div className={styles.targetLeft}>
              <span className={styles.targetIcon}>📁</span>
              <div className={styles.targetMeta}>
                <span className={styles.targetName}>{scenario.jobsTarget.title}</span>
                <span className={styles.targetDetail}>{scenario.jobsTarget.detail}</span>
              </div>
            </div>
            <div className={styles.targetRight}>
              <span className={styles.targetTableTag}>{scenario.jobsTarget.table}</span>
              <span className={styles.targetMutationPill}>{scenario.jobsTarget.mutation}</span>
            </div>
          </div>

          {/* Target 2: Leads */}
          {scenario.leadsTarget && (
            <div className={`${styles.targetCard} ${styles.targetCardLeads}`}>
              <div className={styles.targetLeft}>
                <span className={styles.targetIcon}>👤</span>
                <div className={styles.targetMeta}>
                  <span className={styles.targetName}>{scenario.leadsTarget.title}</span>
                  <span className={styles.targetDetail}>{scenario.leadsTarget.detail}</span>
                </div>
              </div>
              <div className={styles.targetRight}>
                <span className={styles.targetTableTag}>{scenario.leadsTarget.table}</span>
                <span className={styles.targetMutationPill}>{scenario.leadsTarget.mutation}</span>
              </div>
            </div>
          )}

          {/* Target 3: Schedule */}
          <div className={`${styles.targetCard} ${styles.targetCardSchedule}`}>
            <div className={styles.targetLeft}>
              <span className={styles.targetIcon}>📅</span>
              <div className={styles.targetMeta}>
                <span className={styles.targetName}>{scenario.scheduleTarget.title}</span>
                <span className={styles.targetDetail}>{scenario.scheduleTarget.detail}</span>
              </div>
            </div>
            <div className={styles.targetRight}>
              <span className={styles.targetTableTag}>{scenario.scheduleTarget.table}</span>
              <span className={styles.targetMutationPill}>{scenario.scheduleTarget.mutation}</span>
            </div>
          </div>

          {/* Target 4: Crew */}
          <div className={`${styles.targetCard} ${styles.targetCardCrew}`}>
            <div className={styles.targetLeft}>
              <span className={styles.targetIcon}>👷</span>
              <div className={styles.targetMeta}>
                <span className={styles.targetName}>{scenario.crewTarget.title}</span>
                <span className={styles.targetDetail}>{scenario.crewTarget.detail}</span>
              </div>
            </div>
            <div className={styles.targetRight}>
              <span className={styles.targetTableTag}>{scenario.crewTarget.table}</span>
              <span className={styles.targetMutationPill}>{scenario.crewTarget.mutation}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Status Bar */}
      <div className={styles.bottomStatusBar}>
        <div className={styles.statusItem}>
          <span>🛡️ Safety Invariant:</span>
          <strong>Zero Destructive Guesses (Asks to confirm if ambiguous)</strong>
        </div>
        <div className={styles.statusItem}>
          <span>⚡ Transactional Ingress:</span>
          <strong>Atomic Database Commit &middot; 1-segment confirmation</strong>
        </div>
        <div className={styles.statusItem}>
          <span>↺ Revert Guard:</span>
          <strong>Reply UNDO within 15m to rollback</strong>
        </div>
      </div>
    </div>
  );
}
