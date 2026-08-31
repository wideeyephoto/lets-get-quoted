'use client';

import { useState } from 'react';
import styles from './additional-field-workflows.module.css';

interface FieldWorkflow {
  id: string;
  tabLabel: string;
  icon: string;
  title: string;
  badge: string;
  description: string;
  sender: string;
  inboundText: string;
  aiResponse: string;
  results: {
    title: string;
    detail: string;
  }[];
}

const WORKFLOWS: FieldWorkflow[] = [
  {
    id: 'bilingual-spanish',
    tabLabel: 'Bilingual Spanish Voice',
    icon: '🌐',
    title: 'Spanish Voice Notes Translated to Clean English Records',
    badge: 'Real-Time Audio AI Translation',
    description:
      'Crew members send audio memos in Spanish. Your AI Copilot transcribes, translates the instructions to the English job file, and replies to the crew in Spanish with an instant SMS confirmation.',
    sender: 'Carlos (Crew Van #3 · MMS Audio)',
    inboundText:
      '“Inspección aprobada en 124 Main. Necesitamos instaladores de paneles de yeso el jueves a las 8am. Faltan 2 cajas de tornillos.”',
    aiResponse:
      '🌐 [Auto-Translated to English Ledger]\n• Milestone: Rough Inspection Passed\n• Supply Note: 2 boxes drywall screws added to supply list\n• Queued Task: Drywall hanging crew Thursday 8:00 AM\n\nSMS reply sent to Carlos: "✓ Inspección registrada y materiales agregados."',
    results: [
      {
        title: 'English Ledger Activity Feed Updated',
        detail: 'Milestone marked as Rough Inspection Passed on Miller (J-104)',
      },
      {
        title: 'Crew Supply Checklist Updated',
        detail: '2 boxes drywall screws added to morning supply run',
      },
      {
        title: 'Native Language SMS Confirmation',
        detail: 'Instant automated Spanish confirmation receipt texted back to Carlos',
      },
    ],
  },
  {
    id: 'punch-list',
    tabLabel: 'Punch List & Tasks',
    icon: '📋',
    title: 'Dictate Multi-Item Checklists into Discrete Tasks',
    badge: 'Auto-Task Extraction',
    description:
      'Walk the job site during final walkthrough and text your punch list in one message. Your AI Copilot parses every item into actionable tasks assigned directly to your field crew.',
    sender: 'You (Alert Phone)',
    inboundText:
      'Add punch list to Johnson: 1) Caulk exterior siding trim 2) Replace hallway GFCI plate 3) Touch up baseboard paint',
    aiResponse:
      '✅ Added 3 tasks to Job J-92 (Johnson - 88 Birch Ln):\n1. Caulk exterior siding trim\n2. Replace hallway GFCI cover plate\n3. Touch up baseboard paint\nPushed to field crew app checklist.',
    results: [
      {
        title: '3 Discrete Crew Tasks Created',
        detail: 'Assigned to paint and electrical finish checklists with sign-off checkboxes',
      },
      {
        title: 'Walkthrough Milestone Logged',
        detail: 'Job stage advanced to Final Punch List on scheduling board',
      },
      {
        title: 'Zero Re-Typing at Night',
        detail: 'Crew gets instant notification without phone calls or paper lists',
      },
    ],
  },
  {
    id: 'safety-guard',
    tabLabel: 'Zero-Guess Safety Guard',
    icon: '🛡️',
    title: 'Zero Destructive Guesses Safety Invariant',
    badge: 'Prompt Disambiguation Safety',
    description:
      'If two active jobs share a name, your AI Copilot never assumes or closes the wrong job. It immediately texts back clarifying options so your records stay 100% accurate.',
    sender: 'You (Alert Phone)',
    inboundText: 'Mark Smith job complete',
    aiResponse:
      '⚠️ You have 2 active Smith jobs:\n1) Smith - 84 Pine St ($1,200)\n2) Smith - 19 Oak Ave ($4,800)\nReply 1 or 2 to confirm completion.\n\n[You reply: 1]\n✅ Marked Job J-84 (Smith - 84 Pine St) as COMPLETED. Final invoice draft ($1,200.00) ready for 1-tap review.',
    results: [
      {
        title: 'Zero Accidental Overwrites',
        detail: 'Guards against duplicate customer last names across active job sites',
      },
      {
        title: 'Instant Invoice Draft Generated',
        detail: 'Final $1,200 invoice ready with payment link immediately upon confirmation',
      },
      {
        title: 'Schedule Board Updated',
        detail: 'Crew unblocked and slot marked finished on company calendar',
      },
    ],
  },
  {
    id: 'quick-lead',
    tabLabel: 'Quick Lead on the Fly',
    icon: '🚀',
    title: 'Capture Leads from the Road in 5 Seconds',
    badge: 'Instant Lead Intake',
    description:
      'Got a referral or met a neighbor while packing up? Text their name, phone number, and issue. Your AI Copilot creates the lead, scores urgency, and stages the estimate slot.',
    sender: 'You (Alert Phone)',
    inboundText:
      'New lead: Dave Miller, 248-555-0812, master bedroom roof leak around chimney, needs estimate Tuesday morning',
    aiResponse:
      '🚀 Created New Lead J-112: Dave Miller (248-555-0812).\n• Service: Chimney flashing & roof leak\n• Triage: High Priority Water Leak\n• Estimate Slot: Staged for Tuesday 9:30 AM route cluster.',
    results: [
      {
        title: 'Lead Profile & Job Staged',
        detail: 'Customer name, phone, and project scope filed into CRM instantly',
      },
      {
        title: 'Urgency Scored & Tagged',
        detail: 'Flagged as High Priority active roof leak for immediate dispatch',
      },
      {
        title: 'Calendar Route Optimized',
        detail: 'Placed into Tuesday morning estimate cluster based on neighborhood proximity',
      },
    ],
  },
];

export default function AdditionalFieldWorkflows() {
  const [activeId, setActiveId] = useState<string>('bilingual-spanish');
  const current = WORKFLOWS.find((w) => w.id === activeId) || WORKFLOWS[0];

  return (
    <div className={styles.sectionWrapper}>
      <div className={styles.header}>
        <span className={styles.eyebrow}>Specialized Field Workflows</span>
        <h3 className={styles.title}>More ways your AI Copilot runs your business from the truck.</h3>
        <p className={styles.lede}>
          From multilingual crew audio and safety guardrails to instant lead triage and task checklists—all handled
          through simple SMS and voice.
        </p>
      </div>

      <div className={styles.tabsContainer}>
        {WORKFLOWS.map((w) => {
          const isActive = w.id === activeId;
          return (
            <button
              key={w.id}
              type="button"
              className={`${styles.tabBtn} ${isActive ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveId(w.id)}
            >
              <span className={styles.tabIcon}>{w.icon}</span>
              <span>{w.tabLabel}</span>
            </button>
          );
        })}
      </div>

      <div className={styles.workflowCard}>
        <div className={styles.inboundSide}>
          <div className={styles.cardSideHeader}>
            <span className={styles.sideLabel}>Contractor Inbound Message</span>
            <span className={styles.sourceBadge}>{current.badge}</span>
          </div>

          <div className={styles.messageBubble}>
            <div className={styles.messageSender}>{current.sender}</div>
            <p className={styles.messageText}>{current.inboundText}</p>
          </div>

          <div className={styles.aiResponseBubble}>
            <div className={styles.aiSenderTag}>
              <span className={styles.aiDot}></span>
              AI Copilot Response
            </div>
            <p className={styles.aiResponseText}>{current.aiResponse}</p>
          </div>
        </div>

        <div className={styles.outcomeSide}>
          <h4 className={styles.outcomeTitle}>
            <span>{current.icon}</span>
            <span>{current.title}</span>
          </h4>
          <p className={styles.outcomeDesc}>{current.description}</p>

          <div className={styles.resultList}>
            {current.results.map((r, i) => (
              <div key={i} className={styles.resultItem}>
                <span className={styles.resultCheck}>✓</span>
                <div className={styles.resultContent}>
                  <strong className={styles.resultItemTitle}>{r.title}</strong>
                  <span className={styles.resultItemDetail}>{r.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
