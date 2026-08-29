'use client';

import { useState } from 'react';
import styles from './steering-wheel-cheatsheet.module.css';

type CheatItem = {
  id: string;
  category: string;
  icon: string;
  pillar: string;
  voicePhrase: string;
  result: string;
};

const CHEATSHEET_ITEMS: CheatItem[] = [
  {
    id: 'c-1',
    category: 'Quote Change Orders',
    icon: '💰',
    pillar: 'Jobs & Quotes',
    voicePhrase: '“Add $450 to Miller job for extra 12/2 Romex line and pantry GFCI”',
    result: 'Appends line item, recalculates quote math, and stages 1-tap client approval SMS.',
  },
  {
    id: 'c-2',
    category: 'Milestones & Inspections',
    icon: '📋',
    pillar: 'Jobs & Activity',
    voicePhrase: '“Rough inspection passed on Elm St. Need drywall crew Thursday 8am.”',
    result: 'Logs timestamped milestone to activity feed and reserves Thursday 8am crew window.',
  },
  {
    id: 'c-3',
    category: 'Punch Lists & To-Dos',
    icon: '🔨',
    pillar: 'Crew & Tasks',
    voicePhrase: '“Punch list for Johnson: 1) caulk exterior trim 2) paint hallway baseboards”',
    result: 'Extracts discrete checklist tasks assigned to the crew field mobile feed.',
  },
  {
    id: 'c-4',
    category: 'Emergency Lead Ingest',
    icon: '🚀',
    pillar: 'Leads & CRM',
    voicePhrase: '“New lead: Dave Miller 248-555-0812 roof leak needs estimate Tuesday morning”',
    result: 'Creates contact, triages High Priority tag, and blocks 30-min estimate on route.',
  },
  {
    id: 'c-5',
    category: 'Receipt Photos & Margin',
    icon: '🧾',
    pillar: 'Jobs & Margins',
    voicePhrase: '“Home Depot receipt for Miller ($148.50 PEX & SharkBite fittings)”',
    result: 'OCR parses itemized supply SKUs, logs material costs, and recalculates gross margin.',
  },
  {
    id: 'c-6',
    category: '15-Minute Revert Rollback',
    icon: '↺',
    pillar: 'Safety Guard',
    voicePhrase: '“UNDO” (Reply via SMS within 15 mins)',
    result: 'Instantly rolls back the previous change order or task update with 0 database traces.',
  },
];

export default function SteeringWheelCheatsheet() {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function handleCopy(id: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.headerRow}>
        <div className={styles.titleGroup}>
          <span className={styles.badge}>🚗 Steering Wheel Voice Cheatsheet</span>
          <h3 className={styles.title}>What to say when dictating from the road.</h3>
          <p className={styles.subtitle}>
            You don’t need to remember special keywords or rigid syntax. Natural trade speech works
            flawlessly with Siri, Google Assistant, or standard voice memos.
          </p>
        </div>
      </div>

      <div className={styles.cheatsheetGrid}>
        {CHEATSHEET_ITEMS.map((item) => (
          <div key={item.id} className={styles.cheatCard}>
            <div className={styles.cheatCardHead}>
              <span className={styles.cheatCategory}>
                <span>{item.icon}</span>
                <span>{item.category}</span>
              </span>
              <span className={styles.cheatPillarTag}>{item.pillar}</span>
            </div>

            <p className={styles.voiceExampleBox}>{item.voicePhrase}</p>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p className={styles.cheatResult}>
                <strong>Result:</strong> {item.result}
              </p>
              <button
                type="button"
                onClick={() => handleCopy(item.id, item.voicePhrase.replace(/[“”]/g, ''))}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(174,199,211,0.2)',
                  color: '#a7bcc8',
                  fontSize: '11px',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  marginLeft: '8px',
                  flexShrink: 0,
                }}
              >
                {copiedId === item.id ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
