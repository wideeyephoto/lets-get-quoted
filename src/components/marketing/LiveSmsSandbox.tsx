'use client';

import { useState } from 'react';
import styles from './live-sms-sandbox.module.css';

interface Preset {
  id: string;
  icon: string;
  label: string;
  command: string;
  expectedResult: string;
}

const PRESETS: Preset[] = [
  {
    id: 'change-order',
    icon: '⚡',
    label: 'Change Order',
    command: 'Add $450 to Miller job for extra 12/2 Romex circuit in pantry',
    expectedResult: 'Updates Miller (J-104) quote from $2,800 to $3,250 and recalculates margin.',
  },
  {
    id: 'milestone',
    icon: '🎙️',
    label: 'Progress Milestone',
    command: 'Rough-in plumbing inspected and passed on Elm St. Drywall crew Thursday 8am.',
    expectedResult: 'Logs inspection pass timestamp and reserves drywall crew window.',
  },
  {
    id: 'punch-list',
    icon: '📋',
    label: 'Crew Punch List',
    command: 'Add punch list to Johnson: 1) Caulk exterior siding 2) Replace hallway GFCI',
    expectedResult: 'Pushes 2 checklist tasks directly to the crew field app.',
  },
  {
    id: 'new-lead',
    icon: '🚀',
    label: 'New Lead on the Fly',
    command: 'New lead: Dave Miller, 248-555-0812, roof leak around chimney, estimate Tuesday 9am',
    expectedResult: 'Creates new lead record and schedules 30-min estimate visit.',
  },
];

const HOTLINE_NUMBER = '+12485550199';
const DISPLAY_HOTLINE = '(248) 555-0199';

export default function LiveSmsSandbox() {
  const [activePresetId, setActivePresetId] = useState<string>('change-order');
  const [copied, setCopied] = useState<boolean>(false);

  const activePreset = PRESETS.find((p) => p.id === activePresetId) || PRESETS[0];
  const encodedBody = encodeURIComponent(activePreset.command);
  const smsHref = `sms:${HOTLINE_NUMBER}?&body=${encodedBody}`;

  function handleCopy() {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(activePreset.command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  return (
    <div className={styles.sandboxCard}>
      <div className={styles.header}>
        <div className={styles.badgeRow}>
          <span className={styles.livePill}>
            <span className={styles.pulsingDot} aria-hidden="true" />
            LIVE SMS SANDBOX
          </span>
          <span className={styles.phoneLabel}>AI Copilot Dispatch Line: {DISPLAY_HOTLINE}</span>
        </div>
        <h3 className={styles.title}>Test texting your AI Copilot from your own phone right now.</h3>
        <p className={styles.subtitle}>
          Tap any trade scenario below. On mobile, tap <strong>Open in Messages</strong> to send a pre-filled test to your AI Copilot. On desktop, scan or copy the number to try it.
        </p>
      </div>

      {/* Scenario Presets */}
      <div className={styles.presetsRow}>
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`${styles.presetBtn} ${activePresetId === preset.id ? styles.presetBtnActive : ''}`}
            onClick={() => setActivePresetId(preset.id)}
          >
            <span className={styles.presetIcon}>{preset.icon}</span>
            <span className={styles.presetText}>{preset.label}</span>
          </button>
        ))}
      </div>

      {/* Interactive Command Preview */}
      <div className={styles.previewBox}>
        <div className={styles.previewHead}>
          <span className={styles.previewTo}>To: <strong>AI Copilot ⚡ ({DISPLAY_HOTLINE})</strong></span>
          <span className={styles.previewType}>SMS / iMessage</span>
        </div>
        <div className={styles.commandContent}>
          “{activePreset.command}”
        </div>
        <div className={styles.resultPill}>
          <span className={styles.resultIcon}>⚡</span>
          <span><strong>Expected Action:</strong> {activePreset.expectedResult}</span>
        </div>
      </div>

      {/* Action CTA Row */}
      <div className={styles.actionRow}>
        <a
          href={smsHref}
          className={styles.primarySmsBtn}
        >
          <span className={styles.btnIcon}>💬</span>
          <span>Open in Your Phone’s Messages App</span>
          <span className={styles.btnArrow}>&rarr;</span>
        </a>
        <button
          type="button"
          onClick={handleCopy}
          className={styles.copyBtn}
          aria-label="Copy test text command to clipboard"
        >
          {copied ? '✓ Copied to Clipboard!' : '📋 Copy Text'}
        </button>
      </div>

      {/* Desktop Helper */}
      <div className={styles.qrHelper}>
        <div className={styles.qrIcon}>📱</div>
        <div className={styles.qrText}>
          <strong>On desktop or laptop?</strong> Open your phone’s Messages app and text <code className={styles.codePhone}>{DISPLAY_HOTLINE}</code> directly.
        </div>
      </div>
    </div>
  );
}
