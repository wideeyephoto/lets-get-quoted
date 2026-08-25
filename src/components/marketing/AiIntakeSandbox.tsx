'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { APP_SIGNUP_URL } from '@/components/marketing/links';
import styles from './ai-intake-sandbox.module.css';

type PresetScenario = {
  id: string;
  name: string;
  inquiry: string;
  score: 'HOT' | 'WARM' | 'LOW';
  isQuickStop?: boolean;
  estValue: string;
  urgency: string;
  distance: string;
  analysisSummary: string;
  smsAlert: string;
};

const PRESETS: readonly PresetScenario[] = [
  {
    id: 'emergency',
    name: '⚡ Emergency Repair',
    inquiry: 'Main breaker is buzzing loudly, burning smell near panel, and half the house lost power.',
    score: 'HOT',
    estValue: '$1,200–$2,400',
    urgency: 'Emergency (Immediate)',
    distance: '3.1 miles in service area',
    analysisSummary: 'Active electrical hazard detected. In core territory, homeowner verified phone, urgent response needed.',
    smsAlert: '🚨 HOT LEAD: Emergency electrical panel issue from Mark D. ($1.2k–$2.4k est, 3.1 mi). Reply 1 to call homeowner immediately.',
  },
  {
    id: 'high-ticket',
    name: '🏠 High-Ticket Remodel',
    inquiry: 'Looking to completely remodel our 1980s master bath: expanding shower with frameless glass and double quartz vanity.',
    score: 'HOT',
    estValue: '$18,000–$28,000',
    urgency: 'Within 30–60 Days',
    distance: '5.4 miles in service area',
    analysisSummary: 'High-value full remodel. Matches target trade scope, timeline flexible, homeowner requested on-site estimate visit.',
    smsAlert: '⭐ HIGH-VALUE LEAD: $18k–$28k Master Bath Remodel for Sarah K. (5.4 mi). Quote draft ready in command center.',
  },
  {
    id: 'quick-stop',
    name: '📍 Quick Stop Route Match',
    inquiry: 'Kitchen disposal jammed and leaking under sink. Can someone look at it this afternoon?',
    score: 'HOT',
    isQuickStop: true,
    estValue: '$280–$450',
    urgency: 'Today (2:00 PM – 4:00 PM)',
    distance: '0.8 miles from current jobsite',
    analysisSummary: 'Route optimization match: Job is 4 minutes away from your active 1:00 PM crew schedule. Fills 45-minute afternoon gap.',
    smsAlert: '⚡ QUICK STOP MATCH: $320 Disposal fix 0.8 mi away between Job #104 and #105. Tap link to offer 3 PM arrival window for $295.',
  },
  {
    id: 'low-ticket',
    name: '🔧 Minor / Low Fit',
    inquiry: 'Need someone to replace 1 standard outdoor flood lightbulb on front porch.',
    score: 'LOW',
    estValue: '$65–$95',
    urgency: 'Flexible',
    distance: '14.2 miles (outer boundary)',
    analysisSummary: 'Below standard $250 service minimum and near outer perimeter. Polite automated guidance provided.',
    smsAlert: '📋 Lead placed in standard queue: $75 lightbulb swap (outer area). Filtered from high-priority dispatch alerts.',
  },
];

export default function AiIntakeSandbox() {
  const [selectedId, setSelectedId] = useState('emergency');
  const [customText, setCustomText] = useState(PRESETS[0].inquiry);

  const activePreset = PRESETS.find((p) => p.id === selectedId);

  const handleSelectPreset = (preset: PresetScenario) => {
    setSelectedId(preset.id);
    setCustomText(preset.inquiry);
  };

  const calculatedResult = useMemo(() => {
    if (activePreset && customText === activePreset.inquiry) {
      return activePreset;
    }

    const lower = customText.toLowerCase();
    const isEmergency =
      lower.includes('emergency') ||
      lower.includes('urgent') ||
      lower.includes('spark') ||
      lower.includes('leak') ||
      lower.includes('smoke') ||
      lower.includes('flood') ||
      lower.includes('burst') ||
      lower.includes('gas') ||
      lower.includes('no heat') ||
      lower.includes('outage') ||
      lower.includes('overflow') ||
      lower.includes('sewage');
    const isHighTicket =
      lower.includes('remodel') ||
      lower.includes('renovat') ||
      lower.includes('replace') ||
      lower.includes('addition') ||
      lower.includes('whole') ||
      lower.includes('panel') ||
      lower.includes('roof') ||
      lower.includes('siding') ||
      lower.includes('deck') ||
      lower.includes('hvac') ||
      lower.includes('heat pump') ||
      lower.includes('generator') ||
      lower.includes('re-pipe') ||
      lower.includes('excavat') ||
      lower.includes('drain');
    const isMinor =
      lower.includes('lightbulb') ||
      lower.includes('single') ||
      lower.includes('small') ||
      lower.includes('hang') ||
      lower.includes('fixture') ||
      lower.includes('patch');

    if (isEmergency) {
      return {
        id: 'custom',
        name: 'Custom Inquiry',
        inquiry: customText,
        score: 'HOT' as const,
        estValue: '$850–$2,200',
        urgency: 'Urgent / Same-Day',
        distance: 'Local service area',
        analysisSummary: 'High-urgency keywords detected. Qualified and prioritized for immediate contractor follow-up.',
        smsAlert: `🚨 HOT LEAD ALERT: Urgent request received ("${customText.slice(0, 45)}..."). Tap to respond.`,
      };
    }

    if (isHighTicket) {
      return {
        id: 'custom',
        name: 'Custom Inquiry',
        inquiry: customText,
        score: 'HOT' as const,
        estValue: '$12,000–$25,000',
        urgency: 'Within 30 Days',
        distance: 'Local service area',
        analysisSummary: 'Large project scope identified. Qualified with project timeline and budget considerations.',
        smsAlert: `⭐ HIGH-VALUE LEAD: Large scope project inquiry ("${customText.slice(0, 45)}..."). Draft quote prepared.`,
      };
    }

    if (isMinor) {
      return {
        id: 'custom',
        name: 'Custom Inquiry',
        inquiry: customText,
        score: 'LOW' as const,
        estValue: '$75–$150',
        urgency: 'Flexible',
        distance: 'Service area boundary',
        analysisSummary: 'Inquiry is below minimum job size threshold. Demoted to standard queue without noisy alerts.',
        smsAlert: `📋 Standard Queue: Minor inquiry recorded without interrupting active job dispatch.`,
      };
    }

    return {
      id: 'custom',
      name: 'Custom Inquiry',
      inquiry: customText,
      score: 'WARM' as const,
      estValue: '$450–$1,200',
      urgency: 'Next 1–2 Weeks',
      distance: 'Standard service zone',
      analysisSummary: 'Standard qualified inquiry with project details gathered and verified phone number.',
      smsAlert: `📬 WARM LEAD: Standard request qualified and ready for review in your lead queue.`,
    };
  }, [activePreset, customText]);

  return (
    <section className={styles.container} id="sandbox" aria-label="Interactive AI Intake & Lead Scoring Sandbox">
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.kicker}>Live Technology Sandbox</div>
          <h2 className={styles.title}>
            See how AI qualifies and scores <em>your leads</em>.
          </h2>
          <p className={styles.subtitle}>
            Your website’s AI intake asks the questions a master estimator would, scores the project, and texts you the
            jobs that make you money—while filtering out the noise.
          </p>
        </div>

        {/* Preset Selector */}
        <div className={styles.presetsRow} role="tablist" aria-label="Sample lead scenarios">
          {PRESETS.map((preset) => {
            const isActive = selectedId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                className={`${styles.presetBtn} ${isActive ? styles.presetBtnActive : ''}`}
                onClick={() => handleSelectPreset(preset)}
                role="tab"
                aria-selected={isActive}
              >
                {preset.name}
              </button>
            );
          })}
        </div>

        {/* 2-Column Split: Homeowner Intake on Left -> Contractor Triage on Right */}
        <div className={styles.splitGrid}>
          {/* Left Column: Homeowner Side */}
          <div className={styles.col}>
            <div className={styles.colHeader}>
              <span className={styles.colTitle}>1. Homeowner Inquiry on Your Site</span>
              <span className={styles.badge} style={{ background: 'rgba(255,255,255,0.08)', color: '#a7bcc8' }}>
                Website Intake
              </span>
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="inquiry-textarea" className={styles.inputLabel}>
                Homeowner Project Description (Edit or type anything):
              </label>
              <textarea
                id="inquiry-textarea"
                className={styles.textarea}
                value={customText}
                onChange={(e) => {
                  setSelectedId('custom');
                  setCustomText(e.target.value);
                }}
                aria-label="Homeowner project description input"
              />
            </div>

            <div className={styles.analysisBox}>
              <div className={styles.analysisTitle}>✦ AI Instant Extraction</div>
              <div className={styles.metricsGrid}>
                <div className={styles.metricItem}>
                  <span className={styles.metricLabel}>Urgency / Timeline</span>
                  <span className={styles.metricValue}>{calculatedResult.urgency}</span>
                </div>
                <div className={styles.metricItem}>
                  <span className={styles.metricLabel}>Estimated Ticket</span>
                  <span className={styles.metricValue}>{calculatedResult.estValue}</span>
                </div>
                <div className={styles.metricItem}>
                  <span className={styles.metricLabel}>Location &amp; Route</span>
                  <span className={styles.metricValue}>{calculatedResult.distance}</span>
                </div>
                <div className={styles.metricItem}>
                  <span className={styles.metricLabel}>Phone Verified</span>
                  <span className={styles.metricValue}>✓ 1-Tap SMS Verified</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Contractor View & Alert */}
          <div className={styles.col}>
            <div className={styles.colHeader}>
              <span className={styles.colTitle}>2. Instant Contractor Dispatch</span>
              <span
                className={`${styles.badge} ${
                  calculatedResult.isQuickStop
                    ? styles.badgeQuickStop
                    : calculatedResult.score === 'HOT'
                    ? styles.badgeHot
                    : calculatedResult.score === 'WARM'
                    ? styles.badgeWarm
                    : styles.badgeLow
                }`}
              >
                {calculatedResult.isQuickStop ? 'QUICK STOP MATCH' : `LEAD SCORE: ${calculatedResult.score}`}
              </span>
            </div>

            {/* Simulated SMS Alert */}
            <div className={styles.smsCard}>
              <div className={styles.smsIcon}>💬</div>
              <div className={styles.smsContent}>
                <div className={styles.smsSender}>
                  <span className={styles.smsSenderName}>Let’s Get Quoted Dispatch</span>
                  <span className={styles.smsTime}>Just now</span>
                </div>
                <p className={styles.smsBody}>{calculatedResult.smsAlert}</p>
              </div>
            </div>

            {calculatedResult.isQuickStop ? (
              <div className={styles.quickStopNote}>
                <strong>⚡ Quick Stops Route Optimization:</strong> This job was detected along today’s route between
                scheduled appointments. You can offer a same-day arrival window in 1 tap without detour costs.
              </div>
            ) : (
              <div className={styles.analysisBox}>
                <div className={styles.analysisTitle}>Why this job ranked {calculatedResult.score}</div>
                <p style={{ margin: 0, fontSize: '13px', color: '#c2d4df', lineHeight: 1.5 }}>
                  {calculatedResult.analysisSummary}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className={styles.bottomBar}>
          <div className={styles.bottomText}>
            <strong>Never miss a $10k project while under a sink.</strong> Smart intake qualifies inquiries 24/7,
            verifies homeowner phones, and keeps you in full control of your schedule.
          </div>
          <Link href={APP_SIGNUP_URL} className={styles.tryLink}>
            Get Smart Intake on Flex ($0/mo) &rarr;
          </Link>
        </div>
      </div>
    </section>
  );
}
