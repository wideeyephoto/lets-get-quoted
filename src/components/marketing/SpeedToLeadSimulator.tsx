'use client';

import React, { useState, useMemo } from 'react';
import {
  generateSpeedToLeadSms,
  resolveRecipientTimeZoneWithSource,
  getJurisdictionTcpaRules,
  isWithinTcpaQuietHours,
  getTcpaCompliantSendTime,
} from '@/lib/ad-speed-to-lead-shared';
import styles from './speed-to-lead-simulator.module.css';

type SimulationScenario = 'daytime_fast' | 'quiet_hours_held' | 'voice_bridge';

const TRADES = [
  { name: 'Roofing', defaultProject: 'storm damage roof inspection', urgency: 'high' as const },
  { name: 'Plumbing', defaultProject: 'emergency pipe leak repair', urgency: 'emergency' as const },
  { name: 'HVAC', defaultProject: 'central AC compressor diagnostic', urgency: 'high' as const },
  { name: 'Electrical', defaultProject: '200A service panel upgrade', urgency: 'standard' as const },
  { name: 'Landscaping', defaultProject: 'irrigation system replacement', urgency: 'standard' as const },
];

const CITIES = [
  { label: 'Austin, TX (Central)', city: 'Austin', state: 'TX', zip: '78701', phone: '512-555-0192' },
  { label: 'Miami, FL (Eastern · Strict 8 PM FTSA)', city: 'Miami', state: 'FL', zip: '33101', phone: '305-555-0144' },
  { label: 'Oklahoma City, OK (Central · Strict 8 PM OTA)', city: 'Oklahoma City', state: 'OK', zip: '73101', phone: '405-555-0188' },
  { label: 'Baltimore, MD (Eastern · Strict 8 PM MD Act)', city: 'Baltimore', state: 'MD', zip: '21201', phone: '410-555-0177' },
  { label: 'Seattle, WA (Pacific · Strict 8 PM WA Law)', city: 'Seattle', state: 'WA', zip: '98101', phone: '206-555-0133' },
  { label: 'Phoenix, AZ (Mountain Standard)', city: 'Phoenix', state: 'AZ', zip: '85001', phone: '602-555-0111' },
];

export default function SpeedToLeadSimulator() {
  const [selectedTradeIndex, setSelectedTradeIndex] = useState(0);
  const [selectedCityIndex, setSelectedCityIndex] = useState(0);
  const [scenario, setScenario] = useState<SimulationScenario>('daytime_fast');
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);

  const currentTrade = TRADES[selectedTradeIndex];
  const currentCity = CITIES[selectedCityIndex];
  const businessName = `Apex ${currentTrade.name}`;
  const homeownerName = 'Sarah Jenkins';

  // 1. Resolve Recipient Timezone & Jurisdiction Rules
  const tzResolution = useMemo(() => {
    return resolveRecipientTimeZoneWithSource({
      phone: currentCity.phone,
      city: currentCity.city,
      state: currentCity.state,
      postalCode: currentCity.zip,
    });
  }, [currentCity]);

  const jurisdictionRules = useMemo(() => {
    return getJurisdictionTcpaRules(currentCity.state);
  }, [currentCity]);

  // 2. Generate Real Product SMS Body
  const smsBody = useMemo(() => {
    return generateSpeedToLeadSms({
      businessName,
      leadName: homeownerName,
      projectType: currentTrade.defaultProject,
      city: `${currentCity.city}, ${currentCity.state}`,
      urgency: currentTrade.urgency,
    });
  }, [businessName, currentTrade, currentCity]);

  // 3. Evaluate Simulated Send Times (Daytime 10:14 AM vs After-Hours 9:15 PM)
  const isNightScenario = scenario === 'quiet_hours_held';
  const simulatedLeadDate = useMemo(() => {
    if (isNightScenario) {
      // 9:15 PM EDT / local night cutoff
      return new Date('2026-09-08T21:15:00.000Z');
    }
    // 10:14 AM daytime
    return new Date('2026-09-08T10:14:02.000Z');
  }, [isNightScenario]);

  const quietHoursActive = useMemo(() => {
    return isWithinTcpaQuietHours(simulatedLeadDate, tzResolution.timeZone);
  }, [simulatedLeadDate, tzResolution.timeZone]);

  const nextCompliantSend = useMemo(() => {
    return getTcpaCompliantSendTime(simulatedLeadDate, tzResolution.timeZone);
  }, [simulatedLeadDate, tzResolution.timeZone]);

  return (
    <div className={styles.simulatorContainer} id="speed-to-lead-demo">
      <div className={styles.simulatorHead}>
        <div className={styles.badgeRow}>
          <span className={styles.livePill}>
            <span className={styles.pulsingDot} aria-hidden="true" />
            Live Speed-to-Lead Simulator
          </span>
          <span className={styles.timerBadge}>
            ⚡ {scenario === 'daytime_fast' ? '14s Auto-SMS Reply' : scenario === 'voice_bridge' ? '1-Tap Voice Bridge' : 'TCPA Guard Hold'}
          </span>
        </div>
        <p className={styles.subtitle}>
          Simulate how incoming ad and website leads are captured in under 60 seconds with 10DLC and TCPA compliance.
        </p>
      </div>

      {/* Trade & City Selector */}
      <div className={styles.controlsBar}>
        <div className={styles.controlGroup}>
          <label htmlFor="stl-trade-select" className={styles.controlLabel}>
            Contractor Trade
          </label>
          <select
            id="stl-trade-select"
            className={styles.selectInput}
            value={selectedTradeIndex}
            onChange={(e) => setSelectedTradeIndex(Number(e.target.value))}
          >
            {TRADES.map((t, idx) => (
              <option key={t.name} value={idx}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.controlGroup}>
          <label htmlFor="stl-city-select" className={styles.controlLabel}>
            Lead Location &amp; Timezone
          </label>
          <select
            id="stl-city-select"
            className={styles.selectInput}
            value={selectedCityIndex}
            onChange={(e) => setSelectedCityIndex(Number(e.target.value))}
          >
            {CITIES.map((c, idx) => (
              <option key={c.label} value={idx}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Scenario Switcher */}
      <div className={styles.scenarioSwitcher} role="tablist" aria-label="Simulation Scenarios">
        <button
          type="button"
          role="tab"
          aria-selected={scenario === 'daytime_fast'}
          className={`${styles.scenarioBtn} ${scenario === 'daytime_fast' ? styles.scenarioBtnActive : ''}`}
          onClick={() => setScenario('daytime_fast')}
        >
          <span>⚡ Sub-60s Auto-SMS</span>
          <span className={styles.scenarioSubtext}>Daytime 10:14 AM · 14s delivery</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={scenario === 'quiet_hours_held'}
          className={`${styles.scenarioBtn} ${scenario === 'quiet_hours_held' ? styles.scenarioBtnActive : ''}`}
          onClick={() => setScenario('quiet_hours_held')}
        >
          <span>🛡️ TCPA Quiet Hours</span>
          <span className={styles.scenarioSubtext}>After-hours 9:15 PM · Holds for 8 AM</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={scenario === 'voice_bridge'}
          className={`${styles.scenarioBtn} ${scenario === 'voice_bridge' ? styles.scenarioBtnActive : ''}`}
          onClick={() => setScenario('voice_bridge')}
        >
          <span>📞 Voice Call Bridge</span>
          <span className={styles.scenarioSubtext}>High-ticket lead · 1-touch dial</span>
        </button>
      </div>

      {/* Compliance & Timezone Resolution Ribbon */}
      <div className={`${styles.complianceStrip} ${isNightScenario ? styles.complianceStripQuiet : ''}`}>
        <div className={styles.complianceTitle}>
          <span>{isNightScenario ? '🌙' : '☀️'}</span>
          <span>
            {jurisdictionRules.ruleName} ({jurisdictionRules.quietStartHour}:00 PM – {jurisdictionRules.quietEndHour}:00 AM Cutoff)
          </span>
        </div>
        <div className={styles.complianceDetail}>
          Recipient Zone: <strong>{tzResolution.timeZone}</strong> (from {tzResolution.source}) · Statute: <em>{jurisdictionRules.statute}</em>
        </div>
      </div>

      {/* Phone Simulation Frame */}
      <div className={styles.phoneFrame}>
        <div className={styles.phoneHeader}>
          <div className={styles.phoneContact}>
            <div className={styles.contactAvatar}>{businessName.charAt(0)}</div>
            <div className={styles.contactInfo}>
              <span className={styles.contactName}>{businessName}</span>
              <span className={styles.contactStatus}>● 10DLC Verified Route</span>
            </div>
          </div>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{currentCity.city}, {currentCity.state}</span>
        </div>

        <div className={styles.phoneStream}>
          {scenario === 'daytime_fast' && (
            <>
              <div className={styles.eventPill}>
                <span>📥</span> Homeowner Sarah submitted Google Search estimate form at 10:14:02 AM
              </div>

              <div className={styles.smsBubbleHomeowner}>
                <div style={{ fontWeight: 600, fontSize: '0.8rem', color: '#94a3b8' }}>Sarah Jenkins:</div>
                <div>&ldquo;Need a {currentTrade.defaultProject} as soon as possible. Can someone take a look?&rdquo;</div>
                <div className={styles.smsMeta}>
                  <span>Inbound Lead</span>
                  <span>10:14:02 AM</span>
                </div>
              </div>

              <div className={styles.smsBubbleAi}>
                <div style={{ fontWeight: 600, fontSize: '0.8rem', color: '#fed7aa' }}>
                  ⚡ {businessName} (Auto-SMS in 14 seconds):
                </div>
                <div>{smsBody}</div>
                <div className={styles.smsMeta}>
                  <span>Delivered via Verified 10DLC · Opt-out compliant</span>
                  <span>10:14:16 AM</span>
                </div>
              </div>

              <div className={styles.smsBubbleHomeowner}>
                <div style={{ fontWeight: 600, fontSize: '0.8rem', color: '#94a3b8' }}>Sarah Jenkins:</div>
                <div>&ldquo;Tomorrow morning at 9:30 AM would be great!&rdquo;</div>
                <div className={styles.smsMeta}>
                  <span>Customer Reply</span>
                  <span>10:14:45 AM</span>
                </div>
              </div>

              <div className={styles.eventPill}>
                <span>✅</span> Appointment confirmed &amp; routed into Contractor Job Pipeline in 43 seconds
              </div>
            </>
          )}

          {scenario === 'quiet_hours_held' && (
            <>
              <div className={styles.eventPill}>
                <span>🌙</span> Homeowner submitted request at 9:15:20 PM local time
              </div>

              <div className={styles.smsBubbleHomeowner}>
                <div style={{ fontWeight: 600, fontSize: '0.8rem', color: '#94a3b8' }}>Sarah Jenkins:</div>
                <div>&ldquo;Looking for an estimate on {currentTrade.defaultProject} this week.&rdquo;</div>
                <div className={styles.smsMeta}>
                  <span>Submitted after-hours</span>
                  <span>9:15:20 PM</span>
                </div>
              </div>

              <div className={styles.smsBubbleQueued}>
                <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span>🛡️</span> Quiet Hours Protected ({jurisdictionRules.ruleName}){quietHoursActive ? ' · Active' : ''}
                </div>
                <div>
                  Sending an automated text at 9:15 PM violates {jurisdictionRules.statute} quiet hours (cutoff: {jurisdictionRules.quietStartHour}:00 PM).
                  This message is safely queued in the database and scheduled for compliant release at{' '}
                  <strong>{nextCompliantSend.sendAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tzResolution.timeZone })}</strong>.
                </div>
                <div style={{ fontSize: '0.7rem', opacity: 0.85, marginTop: '4px' }}>
                  ✓ Protects your business from $500–$1,500 statutory per-message TCPA violations.
                </div>
              </div>
            </>
          )}

          {scenario === 'voice_bridge' && (
            <>
              <div className={styles.eventPill}>
                <span>🚨</span> High-priority emergency lead arrived: {currentTrade.defaultProject}
              </div>

              <div className={styles.voiceBridgeCard}>
                <div className={styles.voiceBridgeHead}>
                  <div className={styles.voiceBridgeTitle}>
                    <span>📞</span> Instant Voice Call Bridge Dispatched
                  </div>
                  <span style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: 600 }}>0:08 Response</span>
                </div>
                <p style={{ fontSize: '0.82rem', margin: 0, color: '#e2e8f0' }}>
                  Your phone rings within 10 seconds of lead submission. Answer and press 1 to bridge directly to the homeowner.
                </p>
                <div className={styles.voiceAudioSimulation}>
                  <span>🔊 Voice Prompt:</span>
                  <span>
                    &ldquo;Let&rsquo;s Get Quoted speed-to-lead alert. You have a new {currentTrade.name} lead from Sarah in {currentCity.city}. Press 1 to connect instantly.&rdquo;
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPlayingVoice(!isPlayingVoice)}
                  style={{
                    alignSelf: 'flex-start',
                    background: isPlayingVoice ? '#ef4444' : '#0284c7',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {isPlayingVoice ? '⏹ Stop Audio Simulation' : '▶ Simulate Voice Alert'}
                </button>
              </div>

              <div className={styles.smsBubbleAi}>
                <div style={{ fontWeight: 600, fontSize: '0.8rem', color: '#fed7aa' }}>
                  ⚡ Backup SMS Also Dispatched (12s):
                </div>
                <div>{smsBody}</div>
                <div className={styles.smsMeta}>
                  <span>Multichannel Fallback Cascade</span>
                  <span>10:14:14 AM</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Summary Impact Numbers */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <span className={styles.statValue}>&lt; 60s</span>
          <span className={styles.statLabel}>Daytime response time vs 42-hr industry average</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>8x</span>
          <span className={styles.statLabel}>Higher conversion rate when responding within 15 mins</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>100%</span>
          <span className={styles.statLabel}>Audited multi-jurisdiction TCPA quiet hours protection</span>
        </div>
      </div>
    </div>
  );
}
