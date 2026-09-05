'use client';

import { useState, useTransition } from 'react';
import styles from './voice-calls.module.css';

type SimulationResult = {
  success: boolean;
  testMessage: string;
  spokenResponse: string;
  tone: string;
  grounding: {
    companyName: string;
    trade: string;
    serviceAreas: string;
    availableSlots: string[];
    recognizedCaller?: {
      clientName?: string | null;
      serviceAddress?: string | null;
    } | null;
    isLicensed?: boolean;
  };
  toolsExecuted: Array<{
    tool: string;
    parameters: Record<string, unknown>;
    result: Record<string, unknown>;
  }>;
  extractedIntake: {
    callerName: string;
    callerPhone: string;
    serviceAddress: string;
    workRequested: string;
    urgency: string;
    isEmergency: boolean;
    hazardType: string | null;
    suggestedFollowUp?: string;
  };
};

const PRESETS = [
  {
    id: 'booking',
    icon: '⚡',
    label: 'Appointment Booking',
    prompt: 'Hi, our AC is blowing warm air today. Do you have any open slots to send a technician tomorrow?',
  },
  {
    id: 'emergency',
    icon: '🚨',
    label: 'Emergency Pipe Burst',
    prompt: 'Emergency! A water pipe just burst in our basement and water is spraying all over the electrical panel!',
  },
  {
    id: 'rebates',
    icon: '💚',
    label: 'IRA Rebates & Tax Credits',
    prompt: 'Hi, do you offer heat pumps that qualify for IRA 25C federal tax credits or local utility incentives?',
  },
  {
    id: 'returning',
    icon: '👤',
    label: 'Returning Client',
    prompt: 'Hello! Checking on the status of our upcoming installation project with your crew.',
  },
];

export default function VoiceSimulatorSandbox({
  companyName: _companyName = 'Our Company',
  trade: _trade = 'Contractor',
  voiceTone: _voiceTone = 'professional',
  defaultOpen: _defaultOpen = true,
}: {
  companyName?: string;
  trade?: string;
  voiceTone?: string;
  defaultOpen?: boolean;
}) {
  const [selectedPreset, setSelectedPreset] = useState('booking');
  const [customPrompt, setCustomPrompt] = useState(PRESETS[0]!.prompt);
  const [callerPhone, setCallerPhone] = useState('(555) 019-2834');
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  function handleSelectPreset(presetId: string) {
    setSelectedPreset(presetId);
    const p = PRESETS.find((x) => x.id === presetId);
    if (p) setCustomPrompt(p.prompt);
  }

  function handleRunSimulation() {
    startTransition(async () => {
      setError(null);
      try {
        const res = await fetch('/api/voice/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: customPrompt,
            callerPhone: callerPhone || null,
            scenario: selectedPreset,
          }),
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || `Simulation request failed (${res.status})`);
        }

        const data: SimulationResult = await res.json();
        setResult(data);
      } catch (err: unknown) {
        console.error('Simulation error:', err);
        setError(err instanceof Error ? err.message : 'Simulation failed');
      }
    });
  }

  function handlePlayAudio(text: string) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Pick a natural US English voice if available
    const voices = window.speechSynthesis.getVoices();
    const englishVoice = voices.find(
      (v) =>
        v.lang.startsWith('en-US') &&
        (v.name.includes('Natural') ||
          v.name.includes('Google') ||
          v.name.includes('Samantha') ||
          v.name.includes('Jenny')),
    );
    if (englishVoice) utterance.voice = englishVoice;

    utterance.onstart = () => setIsPlayingAudio(true);
    utterance.onend = () => setIsPlayingAudio(false);
    utterance.onerror = () => setIsPlayingAudio(false);

    window.speechSynthesis.speak(utterance);
  }

  return (
    <div className={styles.simulatorWrapper} role="region" aria-label="Voice Simulator">
      <div className={styles.simulatorContainer}>
        <div className={styles.simulatorHeader}>
          <h2 id="voice-simulator-title" className={styles.simulatorTitle}>
            Voice Simulator
          </h2>
        </div>

        <div
          id="voice-simulator-content"
          aria-labelledby="voice-simulator-title"
          className={styles.simulatorContent}
        >
          <div className={styles.presetSection}>
            <label id="scenario-presets-label" className={styles.presetLabel}>
              Select Test Scenario
            </label>
            <div
              role="group"
              aria-labelledby="scenario-presets-label"
              className={styles.presetGroup}
            >
              {PRESETS.map((p) => {
                const isActive = selectedPreset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => handleSelectPreset(p.id)}
                    className={isActive ? styles.presetBtnActive : styles.presetBtn}
                  >
                    <span aria-hidden="true">{p.icon}</span>
                    <span>{p.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', margin: '0.75rem 0', flexWrap: 'wrap' }}>
            <label htmlFor="simulator-caller-phone" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--mute-t62, #94a3b8)' }}>
              Caller Phone:
            </label>
            <input
              id="simulator-caller-phone"
              type="tel"
              value={callerPhone}
              onChange={(e) => setCallerPhone(e.target.value)}
              placeholder="(555) 000-0000"
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid var(--border-color, rgba(255, 255, 255, 0.15))',
                color: '#f8fafc',
                fontSize: '0.85rem',
                width: '170px',
              }}
              aria-label="Simulated caller phone number"
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--mute-t62, #94a3b8)' }}>
              Test CRM client matching by entering a real contact number.
            </span>
          </div>

          <div className={styles.simulatorPromptRow}>
            <div className={styles.simulatorPromptCol}>
              <label htmlFor="simulator-prompt-textarea" className={styles.simulatorTextareaLabel}>
                Simulated Customer Statement:
              </label>
              <textarea
                id="simulator-prompt-textarea"
                rows={2}
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                className={styles.simulatorTextarea}
                placeholder="Type simulated caller inquiry..."
                aria-label="Simulated customer statement"
              />
            </div>

            <div className={styles.simulatorActionCol}>
              <button
                type="button"
                disabled={isPending || !customPrompt.trim()}
                onClick={handleRunSimulation}
                aria-label="Run simulated inbound phone call"
                className={styles.simulatorRunBtn}
              >
                <span>{isPending ? '⏳ Simulating Call...' : '▶ Run Inbound Call'}</span>
              </button>
            </div>
          </div>

          {error ? (
            <div
              role="alert"
              style={{
                padding: '0.75rem 1rem',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                color: '#f87171',
                fontSize: '0.85rem',
                marginTop: '1rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>⚠️ {error}</span>
              <button
                type="button"
                onClick={handleRunSimulation}
                style={{
                  background: 'none',
                  border: '1px solid #f87171',
                  color: '#f87171',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                Retry
              </button>
            </div>
          ) : null}

          {/* Simulation Results Display */}
          {result ? (
            <div
              role="region"
              aria-live="polite"
              aria-atomic="true"
              aria-label="Simulation Output"
              className={styles.simulationResultCard}
            >
              <div className={styles.simulationResultHeader}>
                <div className={styles.resultTitleGroup}>
                  <span className={styles.resultIcon} aria-hidden="true">
                    🤖
                  </span>
                  <strong className={styles.resultTitle}>AI Receptionist Live Response</strong>
                  <span className={styles.resultToneBadge}>
                    Persona: {result.tone}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handlePlayAudio(result.spokenResponse)}
                  aria-label={isPlayingAudio ? 'Stop speaking AI response' : 'Play receptionist spoken response'}
                  className={isPlayingAudio ? styles.audioBtnPlaying : styles.audioBtn}
                >
                  <span>{isPlayingAudio ? '⏹️ Stop Audio' : '🔊 Play Audio'}</span>
                </button>
              </div>

              <div className={styles.responseBubble}>
                &ldquo;{result.spokenResponse}&rdquo;
              </div>

              {/* SWAIG Tools Executed Trace */}
              {result.toolsExecuted.length > 0 ? (
                <div className={styles.toolTraceSection}>
                  <span className={styles.toolTraceLabel}>
                    ⚡ SWAIG Tools Triggered During Call ({result.toolsExecuted.length})
                  </span>
                  <div className={styles.toolTraceList}>
                    {result.toolsExecuted.map((t, idx) => (
                      <div key={idx} className={styles.toolTraceItem}>
                        <div className={styles.toolTraceHeader}>
                          <span className={styles.toolTraceCheck}>✓ Tool Invocation:</span>
                          <code className={styles.toolTraceCode}>{t.tool}</code>
                        </div>
                        <div className={styles.toolTraceResult}>
                          Result: {JSON.stringify(t.result)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Structured Extraction Intake Preview */}
              <div className={styles.crmIntakeSection}>
                <span className={styles.crmIntakeLabel}>
                  📋 Live CRM Intake &amp; Disposition Extraction
                </span>
                <div className={styles.crmIntakeBox}>
                  <div>
                    <strong>Urgency:</strong> {result.extractedIntake.urgency.toUpperCase()}{' '}
                    {result.extractedIntake.isEmergency ? '🚨 (EMERGENCY HAZARD)' : ''}
                  </div>
                  <div>
                    <strong>Customer:</strong> {result.extractedIntake.callerName} ({result.extractedIntake.callerPhone})
                  </div>
                  <div>
                    <strong>Address:</strong> {result.extractedIntake.serviceAddress}
                  </div>
                  <div>
                    <strong>Work Scope:</strong> {result.extractedIntake.workRequested}
                  </div>
                  {result.extractedIntake.suggestedFollowUp ? (
                    <div>
                      <strong>Suggested Action:</strong> {result.extractedIntake.suggestedFollowUp}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
