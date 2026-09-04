'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';

import { formatUsPhone } from '@/lib/phone';
import {
  sendOwnerPhoneVerificationCodeAction,
  verifyOwnerPhoneVerificationCodeAction,
} from '@/app/dashboard/messages/actions';
import { updateVoiceSettingsAction } from './voice-actions';
import styles from './ai-receptionist-settings.module.css';

const DAYS = [
  ['1', 'Monday'],
  ['2', 'Tuesday'],
  ['3', 'Wednesday'],
  ['4', 'Thursday'],
  ['5', 'Friday'],
  ['6', 'Saturday'],
  ['0', 'Sunday'],
] as const;

type Hours = Record<string, [string, string] | null>;

type Props = {
  status: 'off' | 'active' | 'paused';
  answerMode: 'always' | 'after_hours';
  greeting: string;
  transferNumber: string;
  alertPhone?: string;
  verifiedNumbers?: Array<{ number: string; label: string }>;
  callForwardNumber?: string;
  voiceTone?: 'friendly' | 'professional' | 'urgent_dispatcher';
  businessHours: Hours;
  timezone: string;
  /** Base-plan inclusion or an active recurring AI Voice add-on. */
  entitled: boolean;
  /** Distinguishes a verified no-entitlement result from a failed billing read. */
  entitlementAvailable: boolean;
  /** False when the saved settings row could not be read. */
  settingsAvailable: boolean;
  /** Route-specific evidence for the current customer-facing number. */
  routeState: 'ready' | 'missing_number' | 'dedicated_number_not_ready' | 'unverified' | 'unavailable';
  /** The capacity within an entitlement, never the entitlement itself. */
  concurrentCalls: number;
  /** Real-time active in-flight calls handled by the AI receptionist. */
  activeCalls?: number;
  /** Current billing plan name (e.g. Solo, Growth, Scale). */
  planName?: string;
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const PERSONAS = [
  {
    id: 'friendly',
    title: 'Warm & Friendly',
    icon: '🤝',
    badge: 'High Rapport',
    badgeClass: styles.badgeGreen,
    accentClass: styles.tileActiveGreen,
    desc: 'Empathetic, neighborly, and patient tone. Builds instant trust and comfort with homeowners.',
    sample: '“Hey there! Thanks for calling Rivera Plumbing. How can we help you out today?”',
  },
  {
    id: 'professional',
    title: 'Concise & Professional',
    icon: '💼',
    badge: 'Recommended',
    badgeClass: styles.badgeBlue,
    accentClass: styles.tileActiveBlue,
    desc: 'Polished, authoritative, and direct business demeanor. Focuses on speed and clear intake.',
    sample: '“Thank you for calling Rivera Plumbing. I’m the company’s AI assistant — how can I assist you?”',
  },
  {
    id: 'urgent_dispatcher',
    title: 'Trade Dispatcher',
    icon: '🚨',
    badge: 'Emergency First',
    badgeClass: styles.badgePurple,
    accentClass: styles.tileActivePurple,
    desc: 'Rapid, safety-first triage. Prioritizes hazard detection and direct appointment booking.',
    sample: '“Rivera Emergency Dispatch. What issue are you experiencing, and what is your service address?”',
  },
] as const;

const GREETING_PRESETS = [
  {
    label: 'Standard Contractor',
    text: 'Thanks for calling Rivera Plumbing. How can I help you today?',
  },
  {
    label: '24/7 Scheduling',
    text: 'Thanks for calling Rivera Plumbing. I can help answer questions or book an appointment slot on our calendar.',
  },
  {
    label: 'Emergency Hotline',
    text: 'Thanks for calling Rivera Plumbing emergency dispatch. What issue are you experiencing?',
  },
];

export default function AiReceptionistSection(props: Props) {
  const router = useRouter();
  const [status, setStatus] = useState(props.status);
  const [answerMode, setAnswerMode] = useState(props.answerMode);
  const [greeting, setGreeting] = useState(props.greeting);
  const [transferNumber, setTransferNumber] = useState(props.transferNumber);
  const [alertPhone, setAlertPhone] = useState(props.alertPhone ?? '');
  const [voiceTone, setVoiceTone] = useState<'friendly' | 'professional' | 'urgent_dispatcher'>(
    props.voiceTone ?? 'professional',
  );
  const [hours, setHours] = useState<Hours>(props.businessHours);
  const [save, setSave] = useState<SaveState>('idle');
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [, startSaving] = useTransition();
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [verifiedList, setVerifiedList] = useState<Array<{ number: string; label: string }>>(
    props.verifiedNumbers ?? [],
  );

  useEffect(() => {
    if (props.verifiedNumbers) {
      setVerifiedList(props.verifiedNumbers);
    }
  }, [props.verifiedNumbers]);

  // Modal state for adding & verifying a new number
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [verifyingField, setVerifyingField] = useState<'transfer' | 'alert' | null>(null);
  const [newPhoneInput, setNewPhoneInput] = useState('');
  const [newPhoneLabel, setNewPhoneLabel] = useState('');
  const [otpState, setOtpState] = useState<'idle' | 'sending' | 'sent' | 'verifying'>('idle');
  const [verificationData, setVerificationData] = useState<{ token: string; expiresAt: number; phone: string } | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const allOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const opt of verifiedList) {
      if (opt.number) map.set(opt.number, opt.label);
    }
    if (transferNumber && !map.has(transferNumber)) {
      map.set(transferNumber, `${formatUsPhone(transferNumber)} — Current Saved Number`);
    }
    if (alertPhone && !map.has(alertPhone)) {
      map.set(alertPhone, `${formatUsPhone(alertPhone)} — Current Saved Number`);
    }
    return Array.from(map.entries()).map(([number, label]) => ({ number, label }));
  }, [verifiedList, transferNumber, alertPhone]);

  function openVerifyModal(field: 'transfer' | 'alert') {
    setVerifyingField(field);
    setNewPhoneInput('');
    setNewPhoneLabel('');
    setOtpState('idle');
    setVerificationData(null);
    setOtpCode('');
    setOtpError(null);
    setVerifyModalOpen(true);
  }

  function closeVerifyModal() {
    setVerifyModalOpen(false);
    setVerifyingField(null);
    setOtpState('idle');
    setVerificationData(null);
    setOtpCode('');
    setOtpError(null);
  }

  async function handleSendCode() {
    if (!newPhoneInput.trim()) {
      setOtpError('Please enter a valid phone number.');
      return;
    }
    setOtpState('sending');
    setOtpError(null);
    try {
      const res = await sendOwnerPhoneVerificationCodeAction(newPhoneInput.trim());
      if (res.status === 'sent') {
        setVerificationData({ token: res.token, expiresAt: res.expiresAt, phone: res.phone });
        setOtpState('sent');
        setCountdown(60);
      } else {
        setOtpState('idle');
        setOtpError(res.message);
      }
    } catch {
      setOtpState('idle');
      setOtpError('Failed to send verification text. Please check the number and try again.');
    }
  }

  async function handleVerifyCode() {
    if (!verificationData || !newPhoneInput.trim()) return;
    if (otpCode.trim().length !== 6) {
      setOtpError('Please enter the full 6-digit confirmation code.');
      return;
    }
    setOtpState('verifying');
    setOtpError(null);
    try {
      const res = await verifyOwnerPhoneVerificationCodeAction(
        verificationData.phone,
        otpCode,
        verificationData.token,
        verificationData.expiresAt,
      );
      if (res.status === 'verified') {
        const verifiedNum = res.phone;
        const customLabel = newPhoneLabel.trim();
        const displayLabel = `${formatUsPhone(verifiedNum)} — ${customLabel ? `${customLabel} (Verified)` : 'Verified Mobile'}`;

        setVerifiedList((prev) => {
          if (prev.some((p) => p.number === verifiedNum)) return prev;
          return [...prev, { number: verifiedNum, label: displayLabel }];
        });

        markEdited();
        if (verifyingField === 'transfer') {
          setTransferNumber(verifiedNum);
        } else if (verifyingField === 'alert') {
          setAlertPhone(verifiedNum);
        }

        setNotice(`✓ Number ${formatUsPhone(verifiedNum)} verified and selected!`);
        closeVerifyModal();
      } else {
        setOtpState('sent');
        setOtpError(res.message);
      }
    } catch {
      setOtpState('sent');
      setOtpError('Could not verify code. Please try again.');
    }
  }

  const unsold = props.entitlementAvailable && !props.entitled;
  const activationBlockedReason = !props.settingsAvailable
    ? 'Saved receptionist settings could not be loaded.'
    : !props.entitlementAvailable
      ? 'AI Voice entitlement could not be verified.'
      : !props.entitled
        ? 'This workspace does not include AI Voice or an active add-on.'
        : props.routeState === 'unavailable'
          ? 'The customer-facing call route could not be verified.'
          : props.routeState === 'missing_number'
            ? 'A valid customer-facing number has not been configured.'
            : props.routeState === 'dedicated_number_not_ready'
              ? 'The customer-facing number is not an active dedicated SignalWire number.'
            : props.routeState === 'unverified'
              ? 'The customer-facing number has not completed a signed test call to the AI Voice route.'
              : null;

  const editingBlocked = !props.settingsAvailable;
  const controlsDisabled = editingBlocked || save === 'saving';

  const capacity = props.concurrentCalls > 0 ? props.concurrentCalls : 3;
  const activeCalls = Math.max(0, Math.min(props.activeCalls ?? 0, capacity));
  const planLabel = props.planName ? `${props.planName} Plan` : 'Solo Plan';
  const lineSlots = Array.from({ length: capacity }, (_, i) => ({
    lineNumber: i + 1,
    isActive: i < activeCalls,
  }));

  const isDirty =
    status !== props.status ||
    answerMode !== props.answerMode ||
    greeting !== props.greeting ||
    transferNumber !== props.transferNumber ||
    alertPhone !== (props.alertPhone ?? '') ||
    voiceTone !== (props.voiceTone ?? 'professional') ||
    JSON.stringify(hours) !== JSON.stringify(props.businessHours);

  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
  }, []);

  function markEdited() {
    if (savedTimer.current) clearTimeout(savedTimer.current);
    setSave('idle');
    setProblem(null);
    setNotice(null);
  }

  function setDay(day: string, open: string | null, close: string | null) {
    markEdited();
    setHours((current) => ({
      ...current,
      [day]: open && close ? [open, close] : null,
    }));
  }

  function applyWeekdaySchedule(open: string, close: string) {
    markEdited();
    setHours((curr) => ({
      ...curr,
      '1': [open, close],
      '2': [open, close],
      '3': [open, close],
      '4': [open, close],
      '5': [open, close],
      '6': null,
      '0': null,
    }));
  }

  function closeWeekends() {
    markEdited();
    setHours((curr) => ({
      ...curr,
      '6': null,
      '0': null,
    }));
  }

  function resetForm() {
    setStatus(props.status);
    setAnswerMode(props.answerMode);
    setGreeting(props.greeting);
    setTransferNumber(props.transferNumber);
    setAlertPhone(props.alertPhone ?? '');
    setVoiceTone(props.voiceTone ?? 'professional');
    setHours(props.businessHours);
    setSave('idle');
    setProblem(null);
    setNotice(null);
  }

  function submit() {
    setSave('saving');
    setProblem(null);
    setNotice(null);
    startSaving(async () => {
      try {
        const result = await updateVoiceSettingsAction({
          status,
          answerMode,
          greeting,
          transferNumber,
          alertPhone,
          voiceTone,
          businessHours: hours,
        });

        if (result.droppedDays.length > 0) {
          const names = result.droppedDays
            .map((day) => DAYS.find(([value]) => value === day)?.[1] ?? day)
            .join(', ');
          setNotice(`${names} was not saved — closing time must be after opening time.`);
          setHours((current) => {
            const next = { ...current };
            for (const day of result.droppedDays) next[day] = null;
            return next;
          });
        }
        setSave('saved');
        router.refresh();
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSave('idle'), 2400);
      } catch (error) {
        setSave('error');
        setProblem(error instanceof Error ? error.message : 'Could not save settings.');
      }
    });
  }

  return (
    <div className={styles.wrapper}>
      {/* Route & Readiness Alerts */}
      {!props.settingsAvailable ? (
        <div className={`${styles.alertBox} ${styles.alertWarning}`} role="alert">
          <span>⚠️</span>
          <div>
            <strong>Receptionist settings could not be loaded.</strong>
            <p style={{ margin: '0.2rem 0 0' }}>Controls are locked so an unknown live configuration is protected.</p>
          </div>
        </div>
      ) : !props.entitlementAvailable ? (
        <div className={`${styles.alertBox} ${styles.alertWarning}`} role="status">
          <span>ℹ️</span>
          <div>
            <strong>Verifying AI Voice billing access…</strong>
            <p style={{ margin: '0.2rem 0 0' }}>Settings can be prepared, but answering requires verified plan access.</p>
          </div>
        </div>
      ) : unsold ? (
        <div className={`${styles.alertBox} ${styles.alertNotice}`}>
          <span>ℹ️</span>
          <div>
            <strong>AI Voice Add-on Required for Live Answering</strong>
            <p style={{ margin: '0.2rem 0 0' }}>
              Your current workspace does not include active AI Voice minutes. You can customize your greeting and schedule now; upgrade to switch to Answering.
            </p>
          </div>
        </div>
      ) : props.routeState === 'dedicated_number_not_ready' ? (
        <div className={`${styles.alertBox} ${styles.alertWarning}`} role="status">
          <span>🚨</span>
          <div>
            <strong>Dedicated Phone Line Inactive</strong>
            <p style={{ margin: '0.2rem 0 0' }}>AI Voice requires an active dedicated SignalWire number assigned to this workspace before answering live calls.</p>
          </div>
        </div>
      ) : null}

      {/* CARD 1: Receptionist Answering State */}
      <section className={styles.card} aria-labelledby="status-heading">
        <div className={styles.cardHeader}>
          <div className={styles.cardTitleGroup}>
            <div className={styles.cardIcon}>📞</div>
            <div>
              <h2 id="status-heading" className={styles.cardTitle}>Receptionist Answering Status</h2>
              <p className={styles.cardSubtitle}>Choose whether your AI answers live callers right now</p>
            </div>
          </div>
          {status === 'active' && !activationBlockedReason ? (
            <span className={`${styles.tileBadge} ${styles.badgeGreen}`}>● Answering Active</span>
          ) : status === 'paused' ? (
            <span className={`${styles.tileBadge} ${styles.badgeAmber}`}>❚❚ Paused</span>
          ) : (
            <span className={`${styles.tileBadge}`} style={{ background: 'rgba(255,255,255,0.08)', color: '#94a3b8' }}>○ Off</span>
          )}
        </div>

        <div className={styles.tileGrid3} role="group" aria-label="Receptionist status">
          {/* Active Option */}
          <button
            type="button"
            className={`${styles.optionTile} ${status === 'active' ? styles.tileActiveGreen : ''}`}
            aria-pressed={status === 'active'}
            disabled={controlsDisabled || activationBlockedReason !== null}
            title={activationBlockedReason ?? undefined}
            onClick={() => { markEdited(); setStatus('active'); }}
          >
            <div className={styles.tileHeader}>
              <span className={styles.tileTitle}>
                <span style={{ color: '#4ade80' }}>●</span> Answering
              </span>
              <span className={`${styles.tileBadge} ${styles.badgeGreen}`}>Live</span>
            </div>
            <p className={styles.tileDesc}>
              AI receptionist actively answers callers based on the operating hours selected below.
            </p>
          </button>

          {/* Paused Option */}
          <button
            type="button"
            className={`${styles.optionTile} ${status === 'paused' ? styles.tileActiveAmber : ''}`}
            aria-pressed={status === 'paused'}
            disabled={controlsDisabled}
            onClick={() => { markEdited(); setStatus('paused'); }}
          >
            <div className={styles.tileHeader}>
              <span className={styles.tileTitle}>
                <span style={{ color: '#fbbf24' }}>❚❚</span> Paused
              </span>
              <span className={`${styles.tileBadge} ${styles.badgeAmber}`}>Muted</span>
            </div>
            <p className={styles.tileDesc}>
              Temporarily stops answering for vacations or holidays. Keeps your greeting and schedule intact.
            </p>
          </button>

          {/* Off Option */}
          <button
            type="button"
            className={`${styles.optionTile} ${status === 'off' ? styles.tileActiveNeutral : ''}`}
            aria-pressed={status === 'off'}
            disabled={controlsDisabled}
            onClick={() => { markEdited(); setStatus('off'); }}
          >
            <div className={styles.tileHeader}>
              <span className={styles.tileTitle}>
                <span style={{ color: '#94a3b8' }}>○</span> Turned Off
              </span>
            </div>
            <p className={styles.tileDesc}>
              AI does not pick up. All inbound calls bypass the AI and ring your normal phone forwarding.
            </p>
          </button>
        </div>

        {activationBlockedReason && status === 'active' ? (
          <p style={{ margin: 0, fontSize: '0.8rem', color: '#f87171' }}>
            ⚠️ {activationBlockedReason}
          </p>
        ) : null}
      </section>

      {/* CARD 2: Operating Hours & Answering Rules */}
      <section className={styles.card} aria-labelledby="hours-heading">
        <div className={styles.cardHeader}>
          <div className={styles.cardTitleGroup}>
            <div className={styles.cardIcon}>⏱️</div>
            <div>
              <h2 id="hours-heading" className={styles.cardTitle}>Operating Schedule &amp; Answering Mode</h2>
              <p className={styles.cardSubtitle}>Specify when the AI receptionist answers vs. your normal pickup</p>
            </div>
          </div>
          <span style={{ fontSize: '0.78rem', color: '#94a3b8', background: 'rgba(255,255,255,0.05)', padding: '0.25rem 0.65rem', borderRadius: '6px' }}>
            📍 {props.timezone.replace(/_/g, ' ')}
          </span>
        </div>

        <div className={styles.tileGrid2} role="group" aria-label="When the receptionist answers">
          {/* After Hours Mode */}
          <button
            type="button"
            className={`${styles.optionTile} ${answerMode === 'after_hours' ? styles.tileActiveBlue : ''}`}
            aria-pressed={answerMode === 'after_hours'}
            disabled={controlsDisabled}
            onClick={() => { markEdited(); setAnswerMode('after_hours'); }}
          >
            <div className={styles.tileHeader}>
              <span className={styles.tileTitle}>🌙 Outside Business Hours</span>
              {answerMode === 'after_hours' ? (
                <span className={`${styles.tileBadge} ${styles.badgeBlue}`}>Selected</span>
              ) : null}
            </div>
            <p className={styles.tileDesc}>
              You take calls during your workday; the AI covers nights, early mornings, and closed weekends.
            </p>
          </button>

          {/* Always Mode */}
          <button
            type="button"
            className={`${styles.optionTile} ${answerMode === 'always' ? styles.tileActiveBlue : ''}`}
            aria-pressed={answerMode === 'always'}
            disabled={controlsDisabled}
            onClick={() => { markEdited(); setAnswerMode('always'); }}
          >
            <div className={styles.tileHeader}>
              <span className={styles.tileTitle}>⚡ 24/7 Every Inbound Call</span>
              {answerMode === 'always' ? (
                <span className={`${styles.tileBadge} ${styles.badgeBlue}`}>Selected</span>
              ) : null}
            </div>
            <p className={styles.tileDesc}>
              The AI receptionist answers every inbound call around the clock, screening spammers and booking jobs.
            </p>
          </button>
        </div>

        {answerMode === 'after_hours' ? (
          <div className={styles.scheduleSection}>
            <div className={styles.scheduleQuickBar}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>Quick Hours:</span>
              <button
                type="button"
                className={styles.quickBtn}
                disabled={controlsDisabled}
                onClick={() => applyWeekdaySchedule('08:00', '17:00')}
              >
                ⚡ 8:00 AM – 5:00 PM (Mon–Fri)
              </button>
              <button
                type="button"
                className={styles.quickBtn}
                disabled={controlsDisabled}
                onClick={() => applyWeekdaySchedule('07:00', '18:00')}
              >
                🛠️ 7:00 AM – 6:00 PM (Mon–Fri)
              </button>
              <button
                type="button"
                className={styles.quickBtn}
                disabled={controlsDisabled}
                onClick={closeWeekends}
              >
                🚫 Close Weekends
              </button>
            </div>

            <div className={styles.daysGrid}>
              {DAYS.map(([day, label]) => {
                const window = hours[day];
                const isOpen = Boolean(window && window[0] && window[1]);

                return (
                  <div key={day} className={styles.dayRow}>
                    <span className={styles.dayLabel}>{label}</span>
                    {isOpen ? (
                      <div className={styles.dayTimes}>
                        <input
                          id={`voice-open-${day}`}
                          type="time"
                          className={styles.timeInput}
                          disabled={controlsDisabled}
                          value={window?.[0] ?? ''}
                          onChange={(event) =>
                            setDay(day, event.target.value || null, window?.[1] ?? '17:00')
                          }
                          aria-label={`${label} open time`}
                        />
                        <span style={{ fontSize: '0.78rem', color: '#64748b' }}>to</span>
                        <input
                          id={`voice-close-${day}`}
                          type="time"
                          className={styles.timeInput}
                          disabled={controlsDisabled}
                          value={window?.[1] ?? ''}
                          onChange={(event) =>
                            setDay(day, window?.[0] ?? '08:00', event.target.value || null)
                          }
                          aria-label={`${label} close time`}
                        />
                        <button
                          type="button"
                          className={styles.dayCloseBtn}
                          disabled={controlsDisabled}
                          onClick={() => setDay(day, null, null)}
                        >
                          Mark Closed
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className={styles.dayClosedBadge}>Closed (AI answers all day)</span>
                        <button
                          type="button"
                          className={styles.quickBtn}
                          disabled={controlsDisabled}
                          onClick={() => setDay(day, '08:00', '17:00')}
                        >
                          + Open Hours
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </section>

      {/* CARD 3: Conversational Persona & Tone */}
      <section className={styles.card} aria-labelledby="persona-heading">
        <div className={styles.cardHeader}>
          <div className={styles.cardTitleGroup}>
            <div className={styles.cardIcon}>🎭</div>
            <div>
              <h2 id="persona-heading" className={styles.cardTitle}>Conversational Persona &amp; Speaking Tone</h2>
              <p className={styles.cardSubtitle}>Select how your AI sounds when talking with homeowners</p>
            </div>
          </div>
        </div>

        <div className={styles.tileGrid3} role="group" aria-label="Receptionist Persona Tone">
          {PERSONAS.map((p) => {
            const isSelected = voiceTone === p.id;
            return (
              <button
                key={p.id}
                type="button"
                className={`${styles.optionTile} ${isSelected ? p.accentClass : ''}`}
                aria-pressed={isSelected}
                disabled={controlsDisabled}
                onClick={() => { markEdited(); setVoiceTone(p.id); }}
              >
                <div className={styles.tileHeader}>
                  <span className={styles.tileTitle}>
                    <span>{p.icon}</span> {p.title}
                  </span>
                  <span className={`${styles.tileBadge} ${p.badgeClass}`}>{p.badge}</span>
                </div>
                <p className={styles.tileDesc}>{p.desc}</p>
                <div className={styles.sampleBubble}>
                  {p.sample}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* CARD 4: Opening Spoken Greeting */}
      <section className={styles.card} aria-labelledby="greeting-heading">
        <div className={styles.cardHeader}>
          <div className={styles.cardTitleGroup}>
            <div className={styles.cardIcon}>💬</div>
            <div>
              <h2 id="greeting-heading" className={styles.cardTitle}>Opening Greeting Script</h2>
              <p className={styles.cardSubtitle}>The first sentence spoken to callers right after they dial</p>
            </div>
          </div>
          <span className={styles.charCount}>{greeting.length} / 1,000 characters</span>
        </div>

        <div className={styles.textareaContainer}>
          <div className={styles.chipsBar}>
            <span className={styles.chipsLabel}>Quick Templates:</span>
            {GREETING_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className={styles.chipBtn}
                disabled={controlsDisabled}
                onClick={() => { markEdited(); setGreeting(preset.text); }}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <textarea
            id="voice-greeting"
            className={styles.textarea}
            rows={3}
            maxLength={1000}
            disabled={controlsDisabled}
            placeholder="Thanks for calling Rivera Plumbing. How can I help you today?"
            value={greeting}
            onChange={(event) => { markEdited(); setGreeting(event.target.value); }}
          />

          <p className={styles.helperText}>
            🛡️ Callers are always politely notified they are speaking with an AI assistant to comply with US telecom disclosure rules.
          </p>
        </div>
      </section>

      {/* CARD 5: Live Phone Transfers & Emergency Hazard SMS */}
      <section className={styles.card} aria-labelledby="routing-heading">
        <div className={styles.cardHeader}>
          <div className={styles.cardTitleGroup}>
            <div className={styles.cardIcon}>📲</div>
            <div>
              <h2 id="routing-heading" className={styles.cardTitle}>Live Transfers &amp; Emergency Escalations</h2>
              <p className={styles.cardSubtitle}>Where to put callers through and where to send urgent danger alerts</p>
            </div>
          </div>
        </div>

        <div className={styles.tileGrid2}>
          {/* Transfer Line */}
          <div className={styles.inputGroup}>
            <div className={styles.labelRow}>
              <label className={styles.inputLabel} htmlFor="voice-transfer">
                <span>📞</span> Office Warm Transfer Line
              </label>
              <button
                type="button"
                className={styles.addNumberBtn}
                disabled={controlsDisabled}
                onClick={() => openVerifyModal('transfer')}
              >
                + Add verified #
              </button>
            </div>
            <div className={styles.inputWrapper}>
              <span className={styles.inputIcon}>☎️</span>
              <select
                id="voice-transfer"
                className={styles.selectField}
                disabled={controlsDisabled}
                value={transferNumber}
                onChange={(event) => {
                  if (event.target.value === '__ADD_NEW__') {
                    openVerifyModal('transfer');
                  } else {
                    markEdited();
                    setTransferNumber(event.target.value);
                  }
                }}
              >
                <option value="">None (Leave unassigned / No live transfer)</option>
                {allOptions.map((opt) => (
                  <option key={opt.number} value={opt.number}>
                    {opt.label}
                  </option>
                ))}
                <option value="__ADD_NEW__">➕ Add new verified number…</option>
              </select>
            </div>
            <p className={styles.helperText}>
              When a caller insists on speaking to a real person, the AI receptionist announces caller context and bridges the call to this verified line.
            </p>
          </div>

          {/* Emergency SMS Alerts */}
          <div className={styles.inputGroup}>
            <div className={styles.labelRow}>
              <label className={styles.inputLabel} htmlFor="voice-alert-phone">
                <span>🚨</span> Owner Emergency SMS Alerts
              </label>
              <button
                type="button"
                className={styles.addNumberBtn}
                disabled={controlsDisabled}
                onClick={() => openVerifyModal('alert')}
              >
                + Add verified #
              </button>
            </div>
            <div className={styles.inputWrapper}>
              <span className={styles.inputIcon}>🔔</span>
              <select
                id="voice-alert-phone"
                className={styles.selectField}
                disabled={controlsDisabled}
                value={alertPhone}
                onChange={(event) => {
                  if (event.target.value === '__ADD_NEW__') {
                    openVerifyModal('alert');
                  } else {
                    markEdited();
                    setAlertPhone(event.target.value);
                  }
                }}
              >
                <option value="">None (No emergency SMS alerts)</option>
                {allOptions.map((opt) => (
                  <option key={opt.number} value={opt.number}>
                    {opt.label}
                  </option>
                ))}
                <option value="__ADD_NEW__">➕ Add new verified number…</option>
              </select>
            </div>
            <p className={styles.helperText}>
              Dispatches an immediate priority SMS alert to this mobile number with a direct transcript link whenever flooding, gas smells, or electrical fires are detected.
            </p>
          </div>
        </div>

      </section>

      {/* CARD 6: Simultaneous Call Capacity & Line Concurrency */}
      <section className={styles.card} aria-labelledby="capacity-heading">
        <div className={styles.cardHeader}>
          <div className={styles.cardTitleGroup}>
            <div className={styles.cardIcon}>📶</div>
            <div>
              <h3 id="capacity-heading" className={styles.cardTitle}>Simultaneous Call Capacity & Line Concurrency</h3>
              <p className={styles.cardSubtitle}>
                Live caller concurrency engine & automatic overflow protection
              </p>
            </div>
          </div>
          <span className={styles.planTierBadge}>
            ⚡ {planLabel} · {capacity} Simultaneous Lines
          </span>
        </div>

        {/* 3 Metric Cards */}
        <div className={styles.capacityStatsGrid}>
          <div className={styles.capacityStatCard}>
            <span className={styles.capacityStatLabel}>Plan Line Capacity</span>
            <div className={styles.capacityStatValue}>
              {capacity} <span className={styles.capacityStatSub}>lines</span>
            </div>
            <p className={styles.capacityStatDesc}>
              {planLabel} supports up to <strong>{capacity} callers at the exact same time</strong> with zero queue delay.
            </p>
          </div>

          <div className={styles.capacityStatCard}>
            <span className={styles.capacityStatLabel}>Live In-Flight Calls</span>
            <div className={styles.capacityStatValue} style={{ color: activeCalls > 0 ? '#38bdf8' : '#34d399' }}>
              {activeCalls} <span className={styles.capacityStatSub}>in use</span>
            </div>
            <p className={styles.capacityStatDesc}>
              {activeCalls === 0
                ? 'All simultaneous lines are currently open and waiting for inbound callers.'
                : `${activeCalls} line${activeCalls === 1 ? ' is' : 's are'} actively speaking with an AI assistant.`}
            </p>
          </div>

          <div className={styles.capacityStatCard}>
            <span className={styles.capacityStatLabel}>Zero-Drop Overflow</span>
            <div className={styles.capacityStatValue} style={{ color: '#38bdf8' }}>
              {props.callForwardNumber ? 'Protected' : 'Standard'} <span className={styles.capacityStatSub}>rollover</span>
            </div>
            <p className={styles.capacityStatDesc}>
              {props.callForwardNumber ? (
                <>Overflow callers exceeding {capacity} lines instantly ring <strong>{props.callForwardNumber}</strong>.</>
              ) : (
                'Configure your primary business line to receive overflow callers if all lines are busy.'
              )}
            </p>
          </div>
        </div>

        {/* Visual Real-Time Line Tracker Rack */}
        <div className={styles.linesContainer}>
          <div className={styles.linesHeader}>
            <div className={styles.linesHeaderTitle}>
              <span className={styles.livePulseDot} />
              <span>Real-Time Line Status</span>
              <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 500 }}>
                ({activeCalls} of {capacity} active lines in use)
              </span>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#34d399', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span>✓</span> Concurrency Engine Active
            </div>
          </div>

          <div className={styles.linesGrid}>
            {lineSlots.map((slot) => (
              <div
                key={slot.lineNumber}
                className={`${styles.lineTile} ${slot.isActive ? styles.lineTileActive : styles.lineTileReady}`}
              >
                <div className={styles.lineInfo}>
                  <div className={styles.lineName}>Line {String(slot.lineNumber).padStart(2, '0')}</div>
                  <div className={styles.lineDesc}>
                    {slot.isActive ? 'Active Call In-Flight' : 'Open & Ready'}
                  </div>
                </div>
                <span className={`${styles.lineStatusPill} ${slot.isActive ? styles.lineStatusPillActive : styles.lineStatusPillReady}`}>
                  {slot.isActive ? '📞 Busy' : '🟢 Open'}
                </span>
              </div>
            ))}
          </div>

          <div className={styles.overflowCallout}>
            <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>🛡️</span>
            <div>
              <strong style={{ color: '#f1f5f9', display: 'block', marginBottom: '0.2rem' }}>
                Zero-Dropped-Call Overflow Guarantee
              </strong>
              <span>
                If more than {capacity} customers call in at the exact same moment, incoming call #{capacity + 1} will never get a busy tone or disconnect. Additional callers automatically roll over directly to your normal line:{' '}
                {props.callForwardNumber ? (
                  <strong style={{ color: '#38bdf8' }}>{props.callForwardNumber}</strong>
                ) : (
                  <span style={{ color: '#fbbf24' }}>your configured transfer phone number</span>
                )}.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* STICKY ACTION FOOTER */}
      <footer className={styles.actionFooter}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {isDirty ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', color: '#38bdf8', fontWeight: 600 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#38bdf8' }} />
              Unsaved changes
            </span>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', color: '#94a3b8' }}>
              ✓ All changes saved
            </span>
          )}

          {problem ? (
            <span style={{ fontSize: '0.82rem', color: '#f87171', fontWeight: 600 }}>⚠️ {problem}</span>
          ) : notice ? (
            <span style={{ fontSize: '0.82rem', color: '#f59e0b', fontWeight: 600 }}>ℹ️ {notice}</span>
          ) : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {isDirty ? (
            <button
              type="button"
              className={styles.resetBtn}
              disabled={controlsDisabled}
              onClick={resetForm}
            >
              Reset
            </button>
          ) : null}

          <button
            type="button"
            className={`${styles.saveBtn} ${save === 'saved' ? styles.saveBtnSaved : ''}`}
            onClick={submit}
            disabled={controlsDisabled || (status === 'active' && activationBlockedReason !== null)}
          >
            {save === 'saving' ? (
              <>⏳ Saving…</>
            ) : save === 'saved' ? (
              <>✓ Saved Successfully</>
            ) : save === 'error' ? (
              <>❌ Retry Save</>
            ) : (
              <>💾 Save Settings</>
            )}
          </button>
        </div>
      </footer>

      {/* 2FA Phone Verification Modal Portal */}
      {verifyModalOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              className={styles.modalBackdrop}
              role="dialog"
              aria-modal="true"
              aria-labelledby="verify-modal-title"
              onClick={(e) => {
                if (e.target === e.currentTarget) closeVerifyModal();
              }}
            >
              <div className={styles.modalCard}>
                <div className={styles.modalHeader}>
                  <div>
                    <h3 id="verify-modal-title" className={styles.modalTitle}>
                      🔐 Verify &amp; Add Phone Number
                    </h3>
                    <p className={styles.modalSubtitle}>
                      {verifyingField === 'transfer'
                        ? 'Add a verified destination line for live receptionist transfers'
                        : 'Add a verified mobile phone for emergency hazard SMS alerts'}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={styles.modalCloseBtn}
                    onClick={closeVerifyModal}
                    aria-label="Close dialog"
                  >
                    ✕
                  </button>
                </div>

                <div className={styles.modalBody}>
                  {otpError ? (
                    <div className={styles.modalError} role="alert">
                      ⚠️ {otpError}
                    </div>
                  ) : null}

                  {otpState === 'idle' || otpState === 'sending' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div className={styles.inputGroup}>
                        <label className={styles.inputLabel} htmlFor="modal-phone-input">
                          Mobile Phone Number
                        </label>
                        <input
                          id="modal-phone-input"
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          className={styles.inputField}
                          placeholder="(248) 555-0100"
                          value={newPhoneInput}
                          onChange={(e) => {
                            setNewPhoneInput(e.target.value);
                            setOtpError(null);
                          }}
                          disabled={otpState === 'sending'}
                          autoFocus
                        />
                        <p className={styles.helperText}>
                          We’ll send a 6-digit text message code to confirm you own this number.
                        </p>
                      </div>

                      <div className={styles.inputGroup}>
                        <label className={styles.inputLabel} htmlFor="modal-label-input">
                          Label / Contact Name (Optional)
                        </label>
                        <input
                          id="modal-label-input"
                          type="text"
                          className={styles.inputField}
                          placeholder="e.g. Dispatch Phone, Manager Cell, Mike"
                          value={newPhoneLabel}
                          onChange={(e) => setNewPhoneLabel(e.target.value)}
                          disabled={otpState === 'sending'}
                        />
                      </div>

                      <div className={styles.modalFooter}>
                        <button
                          type="button"
                          className={styles.btnSecondary}
                          onClick={closeVerifyModal}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className={styles.btnPrimary}
                          disabled={!newPhoneInput.trim() || otpState === 'sending'}
                          onClick={handleSendCode}
                        >
                          {otpState === 'sending' ? 'Sending Code…' : 'Send 6-Digit Code →'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div className={styles.codeSentNotice}>
                        📲 6-digit confirmation code sent to <b>{formatUsPhone(verificationData?.phone || newPhoneInput)}</b>
                      </div>

                      <div className={styles.inputGroup}>
                        <label className={styles.inputLabel} htmlFor="modal-otp-input">
                          Enter 6-Digit Code
                        </label>
                        <input
                          id="modal-otp-input"
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={6}
                          autoComplete="one-time-code"
                          className={styles.otpInput}
                          placeholder="123456"
                          value={otpCode}
                          onChange={(e) => {
                            setOtpCode(e.target.value.replace(/\D/g, ''));
                            setOtpError(null);
                          }}
                          disabled={otpState === 'verifying'}
                          autoFocus
                        />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <button
                          type="button"
                          className={styles.linkBtn}
                          disabled={countdown > 0 || otpState === 'verifying'}
                          onClick={handleSendCode}
                        >
                          {countdown > 0 ? `Resend code in ${countdown}s` : 'Resend code'}
                        </button>
                        <button
                          type="button"
                          className={styles.linkBtn}
                          onClick={() => {
                            setOtpState('idle');
                            setOtpCode('');
                            setOtpError(null);
                          }}
                        >
                          Change number
                        </button>
                      </div>

                      <div className={styles.modalFooter}>
                        <button
                          type="button"
                          className={styles.btnSecondary}
                          onClick={closeVerifyModal}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className={styles.btnPrimary}
                          disabled={otpCode.trim().length !== 6 || otpState === 'verifying'}
                          onClick={handleVerifyCode}
                        >
                          {otpState === 'verifying' ? 'Verifying…' : 'Verify & Select Number ✓'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
