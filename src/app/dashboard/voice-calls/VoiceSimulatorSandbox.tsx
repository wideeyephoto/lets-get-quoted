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
  companyName = 'Our Company',
  trade = 'Contractor',
  voiceTone: _voiceTone = 'professional',
}: {
  companyName?: string;
  trade?: string;
  voiceTone?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState('booking');
  const [customPrompt, setCustomPrompt] = useState(PRESETS[0]!.prompt);
  const [callerPhone] = useState('(555) 019-2834');
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  function handleSelectPreset(presetId: string) {
    setSelectedPreset(presetId);
    const p = PRESETS.find((x) => x.id === presetId);
    if (p) setCustomPrompt(p.prompt);
  }

  function handleRunSimulation() {
    startTransition(async () => {
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
          throw new Error('Simulation request failed');
        }

        const data: SimulationResult = await res.json();
        setResult(data);
      } catch (err) {
        console.error('Simulation error:', err);
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
    <div
      style={{ marginTop: '1.5rem', marginBottom: '2rem' }}
      role="region"
      aria-label="In-Browser AI Voice Simulator Sandbox"
    >
      <div
        style={{
          background: 'rgba(30, 41, 59, 0.4)',
          border: '1px solid rgba(59, 130, 246, 0.25)',
          borderRadius: '12px',
          padding: '1.25rem 1.5rem',
          backdropFilter: 'blur(8px)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ fontSize: '1.35rem' }} aria-hidden="true">
                🎙️
              </span>
              <h3
                id="voice-simulator-title"
                style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#f8fafc' }}
              >
                In-Browser AI Voice Simulator Sandbox
              </h3>
              <span
                style={{
                  background: 'rgba(59, 130, 246, 0.15)',
                  color: '#93c5fd',
                  fontSize: '0.75rem',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  fontWeight: 600,
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                }}
              >
                Zero-Minute Test Sandbox
              </span>
            </div>
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>
              Simulate inbound customer phone calls for {companyName} ({trade}), test live appointment booking,
              emergency triage, and persona tones without burning phone minutes.
            </p>
          </div>

          <button
            type="button"
            id="voice-simulator-toggle"
            aria-expanded={isOpen}
            aria-controls="voice-simulator-content"
            onClick={() => setIsOpen(!isOpen)}
            className={styles.actionBtnSecondary}
            style={{
              cursor: 'pointer',
              fontWeight: 600,
              background: isOpen ? 'rgba(59, 130, 246, 0.2)' : 'rgba(30, 41, 59, 0.8)',
              borderColor: 'rgba(59, 130, 246, 0.4)',
              color: '#93c5fd',
            }}
          >
            {isOpen ? '▲ Collapse Sandbox' : '▼ Open Test Simulator'}
          </button>
        </div>

        {isOpen ? (
          <div
            id="voice-simulator-content"
            aria-labelledby="voice-simulator-title"
            style={{
              marginTop: '1.25rem',
              paddingTop: '1.25rem',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <div style={{ marginBottom: '1rem' }}>
              <label
                id="scenario-presets-label"
                style={{
                  display: 'block',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: '#94a3b8',
                  marginBottom: '0.5rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Select Test Scenario
              </label>
              <div
                role="group"
                aria-labelledby="scenario-presets-label"
                style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}
              >
                {PRESETS.map((p) => {
                  const isActive = selectedPreset === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => handleSelectPreset(p.id)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        background: isActive ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                        color: isActive ? '#93c5fd' : '#cbd5e1',
                        border: isActive ? '1px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.1)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span aria-hidden="true">{p.icon}</span>
                      <span>{p.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                gap: '0.75rem',
                alignItems: 'flex-start',
                marginBottom: '1rem',
              }}
            >
              <div>
                <label
                  htmlFor="simulator-prompt-textarea"
                  style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: '#94a3b8',
                    marginBottom: '0.35rem',
                  }}
                >
                  Simulated Customer Statement:
                </label>
                <textarea
                  id="simulator-prompt-textarea"
                  rows={2}
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#f8fafc',
                    fontSize: '0.9rem',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                  }}
                  placeholder="Type simulated caller inquiry..."
                  aria-label="Simulated customer statement"
                />
              </div>

              <div style={{ marginTop: '1.45rem' }}>
                <button
                  type="button"
                  disabled={isPending || !customPrompt.trim()}
                  onClick={handleRunSimulation}
                  aria-label="Run simulated inbound phone call"
                  style={{
                    padding: '9px 18px',
                    borderRadius: '6px',
                    background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    cursor: isPending ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
                    opacity: isPending ? 0.7 : 1,
                  }}
                >
                  <span>{isPending ? '⏳ Simulating Call...' : '▶ Run Inbound Call'}</span>
                </button>
              </div>
            </div>

            {/* Simulation Results Display */}
            {result ? (
              <div
                role="region"
                aria-live="polite"
                aria-atomic="true"
                aria-label="Simulation Output"
                style={{
                  background: 'rgba(15, 23, 42, 0.7)',
                  borderRadius: '8px',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  padding: '1.25rem',
                  marginTop: '1rem',
                  animation: 'fadeIn 0.2s ease',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '1rem',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.1rem' }} aria-hidden="true">
                      🤖
                    </span>
                    <strong style={{ color: '#f8fafc', fontSize: '0.95rem' }}>AI Receptionist Live Response</strong>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: 'rgba(147, 197, 253, 0.15)',
                        color: '#93c5fd',
                        border: '1px solid rgba(147, 197, 253, 0.3)',
                      }}
                    >
                      Persona: {result.tone}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handlePlayAudio(result.spokenResponse)}
                    aria-label={isPlayingAudio ? 'Stop speaking AI response' : 'Play receptionist spoken response'}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      background: isPlayingAudio ? '#ef4444' : 'rgba(59, 130, 246, 0.2)',
                      color: isPlayingAudio ? '#ffffff' : '#93c5fd',
                      border: '1px solid rgba(59, 130, 246, 0.4)',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                  >
                    <span>{isPlayingAudio ? '⏹️ Stop Audio' : '🔊 Play Audio'}</span>
                  </button>
                </div>

                <div
                  style={{
                    background: 'rgba(30, 41, 59, 0.8)',
                    borderRadius: '8px',
                    padding: '0.85rem 1.1rem',
                    borderLeft: '4px solid #3b82f6',
                    color: '#f1f5f9',
                    fontSize: '0.95rem',
                    lineHeight: '1.5',
                    marginBottom: '1rem',
                  }}
                >
                  &ldquo;{result.spokenResponse}&rdquo;
                </div>

                {/* SWAIG Tools Executed Trace */}
                {result.toolsExecuted.length > 0 ? (
                  <div style={{ marginBottom: '1rem' }}>
                    <span
                      style={{
                        display: 'block',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: '#94a3b8',
                        textTransform: 'uppercase',
                        marginBottom: '0.4rem',
                      }}
                    >
                      ⚡ SWAIG Tools Triggered During Call ({result.toolsExecuted.length})
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {result.toolsExecuted.map((t, idx) => (
                        <div
                          key={idx}
                          style={{
                            background: 'rgba(15, 23, 42, 0.9)',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            borderRadius: '6px',
                            padding: '0.5rem 0.75rem',
                            fontSize: '0.82rem',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              color: '#34d399',
                              fontWeight: 600,
                            }}
                          >
                            <span>✓ Tool Invocation:</span>
                            <code>{t.tool}</code>
                          </div>
                          <div style={{ marginTop: '0.25rem', color: '#94a3b8', fontSize: '0.75rem' }}>
                            Result: {JSON.stringify(t.result)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Structured Extraction Intake Preview */}
                <div>
                  <span
                    style={{
                      display: 'block',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: '#94a3b8',
                      textTransform: 'uppercase',
                      marginBottom: '0.4rem',
                    }}
                  >
                    📋 Live CRM Intake & Disposition Extraction
                  </span>
                  <div
                    style={{
                      background: 'rgba(15, 23, 42, 0.9)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '6px',
                      padding: '0.75rem',
                      fontFamily: 'monospace',
                      fontSize: '0.78rem',
                      color: '#cbd5e1',
                      overflowX: 'auto',
                    }}
                  >
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
        ) : null}
      </div>
    </div>
  );
}
