'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ContractorVoiceParseResponse, ParsedJobVoiceData, ParsedLeadVoiceData } from '@/lib/contractor-voice-ai';
import { applyVoiceJobAction, applyVoiceLeadAction } from '@/app/dashboard/voice-actions';
import styles from './voice-capture.module.css';

// Type definitions for Web Speech API
interface SpeechRecognitionResultItem {
  transcript: string;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: {
    [index: number]: SpeechRecognitionResultItem;
  };
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

type WindowWithSpeech = {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

export type VoiceCaptureModalProps = {
  isOpen: boolean;
  onClose: () => void;
  targetType: 'lead' | 'job';
  targetId?: string;
  contextTitle?: string;
  onSuccess?: (resultId?: string) => void;
};

export default function VoiceCaptureModal({
  isOpen,
  onClose,
  targetType,
  targetId,
  contextTitle,
  onSuccess,
}: VoiceCaptureModalProps) {
  const router = useRouter();
  const [step, setStep] = useState<'record' | 'processing' | 'review' | 'saving'>('record');
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSpeechSupported, setIsSpeechSupported] = useState(true);
  const [parseResult, setParseResult] = useState<ContractorVoiceParseResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Editable review fields
  const [editedLead, setEditedLead] = useState<ParsedLeadVoiceData>({});
  const [editedJob, setEditedJob] = useState<ParsedJobVoiceData>({});

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const win = window as unknown as WindowWithSpeech;
    const SpeechClass = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechClass) {
      setIsSpeechSupported(false);
    }
  }, []);

  // Initialize and clean up speech recognition
  useEffect(() => {
    if (!isOpen) {
      stopListening();
      setStep('record');
      setTranscript('');
      setParseResult(null);
      setErrorMessage(null);
      return;
    }
  }, [isOpen]);

  const startListening = () => {
    setErrorMessage(null);
    const win = window as unknown as WindowWithSpeech;
    const SpeechClass = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechClass) {
      setIsSpeechSupported(false);
      return;
    }

    try {
      const recognition = new SpeechClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let currentTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript + ' ';
        }
        setTranscript(currentTranscript.trim());
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.warn('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          setErrorMessage('Microphone access denied. Please allow mic permissions in your browser or type below.');
        } else if (event.error !== 'no-speech') {
          setErrorMessage(`Audio capture notice: ${event.error}`);
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    setIsListening(false);
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleProcessVoice = async () => {
    stopListening();
    const textToProcess = transcript.trim();
    if (!textToProcess) {
      setErrorMessage('Please speak or type instructions first.');
      return;
    }

    setStep('processing');
    setErrorMessage(null);

    try {
      const res = await fetch('/api/voice/contractor-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: textToProcess,
          targetType,
          targetId,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server returned ${res.status}`);
      }

      const { result } = (await res.json()) as { result: ContractorVoiceParseResponse };
      setParseResult(result);
      if (result.leadData) setEditedLead(result.leadData);
      if (result.jobData) setEditedJob(result.jobData);
      setStep('review');
    } catch (err) {
      console.error('Voice parsing failed:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Could not parse voice note. Please try again.');
      setStep('record');
    }
  };

  const handleApplyChanges = async () => {
    setStep('saving');
    setErrorMessage(null);

    try {
      if (targetType === 'lead' || (parseResult?.targetType === 'lead' && !targetId)) {
        const res = await applyVoiceLeadAction({
          leadId: targetId || null,
          leadData: editedLead,
        });

        if (!res.ok) throw new Error(res.error || 'Failed to save lead');
        router.refresh();
        onSuccess?.(res.leadId);
        onClose();
      } else {
        if (!targetId) {
          throw new Error('No target job ID specified for job update.');
        }

        const res = await applyVoiceJobAction({
          jobId: targetId,
          jobData: editedJob,
        });

        if (!res.ok) throw new Error(res.error || 'Failed to save job');
        router.refresh();
        onSuccess?.(res.jobId);
        onClose();
      }
    } catch (err) {
      console.error('Failed to apply voice changes:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Failed to apply changes.');
      setStep('review');
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <div className={styles.modalHeaderTitle}>
            <span style={{ fontSize: '1.25rem' }}>🎙️</span>
            <h3>Voice AI Assistant</h3>
            <span className={styles.badgeTag}>
              {targetType === 'lead' ? (targetId ? 'Update Lead' : 'New Lead') : 'Update Job'}
            </span>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className={styles.modalBody}>
          {contextTitle && (
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#9ca3af' }}>
              Target: <strong style={{ color: '#e5e7eb' }}>{contextTitle}</strong>
            </p>
          )}

          {errorMessage && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              borderRadius: '0.6rem',
              padding: '0.6rem 0.9rem',
              color: '#fca5a5',
              fontSize: '0.86rem',
            }}>
              ⚠️ {errorMessage}
            </div>
          )}

          {/* STEP 1: RECORD / SPEAK */}
          {step === 'record' && (
            <div className={styles.recordingStage}>
              <div className={styles.pulsingMicWrapper}>
                {isListening && <div className={styles.pulsingRing} />}
                <button
                  type="button"
                  className={`${styles.micIconBtn} ${isListening ? styles.isListening : ''}`}
                  onClick={toggleListening}
                  title={isListening ? 'Tap to stop recording' : 'Tap to speak'}
                >
                  {isListening ? '⏹️' : '🎙️'}
                </button>
              </div>

              <div>
                <p className={styles.statusLabel}>
                  {isListening ? 'Listening to your voice...' : 'Tap the microphone to speak'}
                </p>
                {isListening && (
                  <div className={styles.soundwaveContainer} aria-hidden="true">
                    <div className={styles.soundwaveBar} />
                    <div className={styles.soundwaveBar} />
                    <div className={styles.soundwaveBar} />
                    <div className={styles.soundwaveBar} />
                    <div className={styles.soundwaveBar} />
                    <div className={styles.soundwaveBar} />
                  </div>
                )}
              </div>

              {/* Transcript Preview */}
              <div className={styles.transcriptBox}>
                <div className={styles.transcriptLabel}>
                  <span>Spoken Transcript / Notes</span>
                  <span style={{ fontSize: '0.72rem', color: '#a855f7' }}>Editable</span>
                </div>
                <textarea
                  className={styles.manualInputArea}
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder={
                    targetType === 'lead'
                      ? 'e.g., "Add a lead for John Miller at 742 Evergreen Terr, roof leak near chimney, phone 555-0199, schedule quote for Friday at 2pm..."'
                      : 'e.g., "Customer approved 200A panel replacement and 3 GFCI outlets, total $2,200, schedule for next Thursday 8am, access through side gate..."'
                  }
                  rows={3}
                />
              </div>

              {!isSpeechSupported && (
                <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: 0 }}>
                  💡 Microphone speech recognition isn&apos;t supported in this browser; you can type or paste your notes above!
                </p>
              )}
            </div>
          )}

          {/* STEP 2: PROCESSING */}
          {step === 'processing' && (
            <div className={styles.processingState}>
              <div className={styles.spinner} />
              <strong style={{ fontSize: '1rem', color: '#c084fc' }}>AI is extracting structured details...</strong>
              <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: 0, textAlign: 'center' }}>
                Analyzing schedule dates, pricing, contact info, and work scopes.
              </p>
            </div>
          )}

          {/* STEP 3: REVIEW EXTRACTED DETAILS */}
          {step === 'review' && parseResult && (
            <div className={styles.reviewStage}>
              <div className={styles.summaryBanner}>
                <span className={styles.summaryIcon}>✨</span>
                <div className={styles.summaryText}>
                  <strong>AI Summary:</strong> {parseResult.actionSummary}
                </div>
              </div>

              {/* Lead Fields Review */}
              {(targetType === 'lead' || parseResult.targetType === 'lead') && (
                <div className={styles.parsedGrid}>
                  {editedLead.name && (
                    <div className={styles.fieldCard}>
                      <span className={styles.fieldLabel}>Client Name</span>
                      <input
                        type="text"
                        className={styles.fieldValue}
                        style={{ background: 'transparent', border: 'none', width: '100%', outline: 'none' }}
                        value={editedLead.name || ''}
                        onChange={(e) => setEditedLead({ ...editedLead, name: e.target.value })}
                      />
                    </div>
                  )}
                  {editedLead.phone && (
                    <div className={styles.fieldCard}>
                      <span className={styles.fieldLabel}>Phone</span>
                      <input
                        type="text"
                        className={styles.fieldValue}
                        style={{ background: 'transparent', border: 'none', width: '100%', outline: 'none' }}
                        value={editedLead.phone || ''}
                        onChange={(e) => setEditedLead({ ...editedLead, phone: e.target.value })}
                      />
                    </div>
                  )}
                  {editedLead.address && (
                    <div className={`${styles.fieldCard} ${styles.fullWidth}`}>
                      <span className={styles.fieldLabel}>Service Address</span>
                      <input
                        type="text"
                        className={styles.fieldValue}
                        style={{ background: 'transparent', border: 'none', width: '100%', outline: 'none' }}
                        value={editedLead.address || ''}
                        onChange={(e) => setEditedLead({ ...editedLead, address: e.target.value })}
                      />
                    </div>
                  )}
                  {editedLead.projectType && (
                    <div className={styles.fieldCard}>
                      <span className={styles.fieldLabel}>Project Type</span>
                      <input
                        type="text"
                        className={styles.fieldValue}
                        style={{ background: 'transparent', border: 'none', width: '100%', outline: 'none' }}
                        value={editedLead.projectType || ''}
                        onChange={(e) => setEditedLead({ ...editedLead, projectType: e.target.value })}
                      />
                    </div>
                  )}
                  {editedLead.requestedDate && (
                    <div className={styles.fieldCard}>
                      <span className={styles.fieldLabel}>Schedule Visit</span>
                      <span className={styles.fieldValue}>
                        📅 {editedLead.requestedDate} {editedLead.requestedTime ? `at ${editedLead.requestedTime}` : ''}
                      </span>
                    </div>
                  )}
                  {editedLead.message && (
                    <div className={`${styles.fieldCard} ${styles.fullWidth}`}>
                      <span className={styles.fieldLabel}>Scope & Notes</span>
                      <textarea
                        className={styles.fieldValue}
                        style={{ background: 'transparent', border: 'none', width: '100%', outline: 'none', resize: 'vertical' }}
                        rows={2}
                        value={editedLead.message || ''}
                        onChange={(e) => setEditedLead({ ...editedLead, message: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Job Fields Review */}
              {targetType === 'job' && (
                <div className={styles.parsedGrid}>
                  {(editedJob.scope || editedJob.scopeAddition) && (
                    <div className={`${styles.fieldCard} ${styles.fullWidth}`}>
                      <span className={styles.fieldLabel}>Scope Update</span>
                      <textarea
                        className={styles.fieldValue}
                        style={{ background: 'transparent', border: 'none', width: '100%', outline: 'none', resize: 'vertical' }}
                        rows={3}
                        value={editedJob.scope || editedJob.scopeAddition || ''}
                        onChange={(e) => setEditedJob({ ...editedJob, scope: e.target.value })}
                      />
                    </div>
                  )}

                  {editedJob.scheduledFor && (
                    <div className={styles.fieldCard}>
                      <span className={styles.fieldLabel}>Scheduled Dispatch</span>
                      <span className={styles.fieldValue}>
                        📅 {editedJob.scheduledFor} {editedJob.scheduledTime ? `at ${editedJob.scheduledTime}` : ''}
                      </span>
                    </div>
                  )}

                  {editedJob.status && (
                    <div className={styles.fieldCard}>
                      <span className={styles.fieldLabel}>Status Change</span>
                      <span className={styles.fieldValue}>🏷️ {editedJob.status}</span>
                    </div>
                  )}

                  {editedJob.quoteItems && editedJob.quoteItems.length > 0 && (
                    <div className={`${styles.fieldCard} ${styles.fullWidth}`}>
                      <span className={styles.fieldLabel}>Quote Line Items ({editedJob.quoteItems.length})</span>
                      <div className={styles.quoteItemsList}>
                        {editedJob.quoteItems.map((item, idx) => (
                          <div key={idx} className={styles.quoteItemRow}>
                            <span>• {item.label}</span>
                            <span className={styles.quoteItemPrice}>${item.amount.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {editedJob.feedNote && (
                    <div className={`${styles.fieldCard} ${styles.fullWidth}`}>
                      <span className={styles.fieldLabel}>Activity Feed Note</span>
                      <p className={styles.fieldValue} style={{ margin: 0 }}>💬 {editedJob.feedNote}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 'saving' && (
            <div className={styles.processingState}>
              <div className={styles.spinner} />
              <strong style={{ fontSize: '1rem', color: '#34d399' }}>Applying updates...</strong>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.modalFooter}>
          {step === 'record' && (
            <>
              <button type="button" className={styles.btnSecondary} onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={handleProcessVoice}
                disabled={!transcript.trim()}
              >
                ✨ Process with AI
              </button>
            </>
          )}

          {step === 'review' && (
            <>
              <button type="button" className={styles.btnSecondary} onClick={() => setStep('record')}>
                🎙️ Edit / Re-speak
              </button>
              <button type="button" className={styles.btnPrimary} onClick={handleApplyChanges}>
                ✓ Confirm & Apply
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
