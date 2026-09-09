'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import type {
  ExecutiveBriefing,
  OperatorHitlActionRequest,
  OperatorAuditLogEntry,
  ChatMessage,
} from '@/lib/ai-operator/types';
import {
  triggerOperatorCycleAction,
  resolveHitlActionServerAction,
  askOperatorServerAction,
  replayWebhooksServerAction,
  sendManualDigestServerAction,
  previewHitlActionMessageAction,
} from './actions';
import styles from './OperatorCockpit.module.css';
import MailIcon from '@/components/MailIcon';

interface OperatorCockpitProps {
  initialBriefing: ExecutiveBriefing;
  initialPendingActions: OperatorHitlActionRequest[];
  initialAuditLogs: OperatorAuditLogEntry[];
}

interface ModalAccountState {
  account?: {
    id?: string;
    business_name?: string;
    plan?: string;
    connect_onboarded?: boolean;
    sms_number?: string;
  };
  diagnosis?: Record<string, unknown>;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: () => void;
  onresult: (event: { results: Array<Array<{ transcript: string }>> }) => void;
  onerror: () => void;
  onend: () => void;
  start: () => void;
}

/** How many prior turns of cockpit conversation to replay to the model. */
const MAX_HISTORY_TURNS = 12;

/**
 * Quick prompts, built from the briefing actually on screen.
 *
 * These used to be fixed strings that named counts ("Triage 2 Webhook Failures",
 * "Nudge 4 Unactivated Signups") regardless of what was really outstanding, so the
 * cockpit asserted a number before anything had been measured.
 */
function buildQuickPromptChips(briefing: ExecutiveBriefing): string[] {
  const chips: string[] = [];
  const { operations, contractors, escalations } = briefing;

  if (operations.unresolvedWebhooksCount > 0) {
    chips.push(`🔍 Triage ${operations.unresolvedWebhooksCount} webhook failure(s)`);
  }
  if (operations.cronTroubledCount > 0) {
    chips.push(`⏱️ Explain ${operations.cronTroubledCount} troubled cron job(s)`);
  }
  if (contractors.unactivatedCount > 0) {
    chips.push(`🚀 Diagnose ${contractors.unactivatedCount} unactivated signup(s)`);
  }
  if (escalations.openDisputesCount > 0) {
    chips.push(`🛡️ Summarise ${escalations.openDisputesCount} open dispute(s)`);
  }
  if (escalations.casesNearSlaCount > 0) {
    chips.push(`⏳ Review ${escalations.casesNearSlaCount} case(s) near SLA`);
  }

  // Always available: these ask a question rather than assert a count.
  chips.push('💳 Revenue & billing breakdown');
  chips.push('🛠️ Check SRE & cron health');
  chips.push('📈 Scan plan upgrade candidates');

  return chips.slice(0, 6);
}

export default function OperatorCockpit({
  initialBriefing,
  initialPendingActions,
  initialAuditLogs,
}: OperatorCockpitProps) {
  const [briefing, setBriefing] = useState<ExecutiveBriefing>(initialBriefing);
  const [pendingActions, setPendingActions] = useState<OperatorHitlActionRequest[]>(initialPendingActions);
  const [auditLogs, setAuditLogs] = useState<OperatorAuditLogEntry[]>(initialAuditLogs);
  const [isCycling, setIsCycling] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Multi-Turn Chat Conversation
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-msg',
      sender: 'operator',
      text: `Hello! I'm your 24/7 AI Operations Manager & SRE Guardian. I've monitored revenue ($${initialBriefing.revenue.mrrEstimated}/mo MRR), audited SRE health, and diagnosed contractor activation. How can I assist you today?`,
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);
  const [promptInput, setPromptInput] = useState('');
  const [isPrompting, setIsPrompting] = useState(false);

  // Audio / Speech State
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Contractor 360 Modal
  const [modalAccount, setModalAccount] = useState<ModalAccountState | null>(null);

  // HITL Message Preview Modal
  const [previewModal, setPreviewModal] = useState<{
    actionId: string;
    channel: 'email';
    subject: string;
    fromAddress: string;
    replyTo: string;
    recipients: Array<{ accountId: string; businessName: string; email: string; ageDays?: number; quotedJobs?: number }>;
    skipped: Array<{ accountId: string; businessName: string; reason: string }>;
    html: string;
  } | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState<string | null>(null);

  const quickPromptChips = buildQuickPromptChips(briefing);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isPrompting]);

  const handleRunCycle = async () => {
    setIsCycling(true);
    setStatusBanner(null);
    try {
      const res = await triggerOperatorCycleAction();
      if (res.success && res.report) {
        setBriefing(res.report.briefing);
        setPendingActions(res.report.pendingHitlActions);
        if (res.report.auditLogs) {
          setAuditLogs(res.report.auditLogs);
        }
        const timeStr = new Date().toLocaleTimeString();
        const safeCount = res.report.auditActionsLogged ?? res.report.safeActionsExecuted ?? 0;
        const candidates = res.report.onboardingNudgeCandidates;
        const pendingCount = res.report.pendingHitlActions.length;
        setStatusBanner({
          type: 'success',
          message: `✓ Ops cycle completed at ${timeStr}. Briefing refreshed, ${safeCount} audit action(s) logged, ${candidates} nudge candidate(s) identified, ${pendingCount} approval(s) pending.`,
        });
      } else {
        setStatusBanner({
          type: 'error',
          message: 'Failed to run ops cycle. Check server permissions or logs.',
        });
      }
    } catch (e) {
      console.error('Failed to run cycle:', e);
      setStatusBanner({
        type: 'error',
        message: `Error running ops cycle: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setIsCycling(false);
    }
  };

  const handleResolveAction = async (actionId: string, decision: 'approved' | 'rejected') => {
    try {
      const res = await resolveHitlActionServerAction(actionId, decision);
      if (res.success) {
        setPendingActions((prev) => prev.filter((a) => a.id !== actionId));
        setStatusBanner({
          type: 'success',
          message: `Action ${decision === 'approved' ? 'approved and executed' : 'declined'} successfully.`,
        });
      } else {
        setStatusBanner({
          type: 'error',
          message: `Action ${decision} failed: ${res.error || 'Execution failure reported by system.'}`,
        });
      }
    } catch (e) {
      console.error('Failed to resolve action:', e);
      setStatusBanner({
        type: 'error',
        message: `Failed to resolve action: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  };

  const handlePreviewMessage = async (actionId: string) => {
    setIsPreviewLoading(actionId);
    try {
      const res = await previewHitlActionMessageAction(actionId);
      if (res.success) {
        setPreviewModal({
          actionId,
          channel: res.channel,
          subject: res.subject,
          fromAddress: res.fromAddress,
          replyTo: res.replyTo,
          recipients: res.recipients,
          skipped: res.skipped,
          html: res.html,
        });
      } else {
        setStatusBanner({
          type: 'error',
          message: `Preview failed: ${res.error || 'Could not generate message preview.'}`,
        });
      }
    } catch (e) {
      console.error('Failed to preview message:', e);
      setStatusBanner({
        type: 'error',
        message: `Preview error: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setIsPreviewLoading(null);
    }
  };

  const handleSendPrompt = async (queryText: string) => {
    const text = queryText.trim();
    if (!text || isPrompting) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString(),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setPromptInput('');
    setIsPrompting(true);

    try {
      // Replay the conversation so follow-ups resolve against what was already said.
      // The welcome message is excluded -- it is UI copy, not something the model said.
      const history = chatMessages
        .filter((m) => m.id !== 'welcome-msg')
        .slice(-MAX_HISTORY_TURNS)
        .map((m) => ({ role: m.sender === 'user' ? ('user' as const) : ('model' as const), text: m.text }));

      const res = await askOperatorServerAction(text, history);
      const operatorMsg: ChatMessage = {
        id: `op-${Date.now()}`,
        sender: 'operator',
        text: res.answer,
        timestamp: new Date().toLocaleTimeString(),
        toolCalls: res.toolCallsExecuted,
        hitlActionCreated: (res.pendingHitlActions?.length ?? 0) > pendingActions.length,
      };

      setChatMessages((prev) => [...prev, operatorMsg]);
      if (res.pendingHitlActions) {
        setPendingActions(res.pendingHitlActions);
      }
    } catch (e) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'operator',
        text: `Error executing query: ${e instanceof Error ? e.message : String(e)}`,
        timestamp: new Date().toLocaleTimeString(),
      };
      setChatMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsPrompting(false);
    }
  };

  const handlePromptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendPrompt(promptInput);
  };

  const handleReplayWebhooks = async () => {
    setStatusBanner(null);
    try {
      const res = (await replayWebhooksServerAction('replay_and_resolve')) as {
        success: boolean;
        remediationSummary?: string;
        error?: string;
      };
      if (res?.success) {
        setStatusBanner({
          type: 'success',
          message: `✓ ${res.remediationSummary || 'Webhooks replayed and resolved successfully.'}`,
        });
        await handleRunCycle();
      } else {
        setStatusBanner({
          type: 'error',
          message: `Webhook recovery error: ${res?.error || 'Unknown failure'}`,
        });
      }
    } catch (e) {
      setStatusBanner({
        type: 'error',
        message: `Failed to replay webhooks: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  };

  const handleSendDigestEmail = async () => {
    try {
      const res = await sendManualDigestServerAction();
      setStatusBanner({
        type: 'success',
        message: `✉️ Executive briefing digest dispatched successfully via ${res.deliveredVia.join(', ')}.`,
      });
    } catch (e) {
      setStatusBanner({
        type: 'error',
        message: `Failed to dispatch digest: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  };

  // Text-To-Speech Audio Playback
  const handleToggleSpeech = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      alert('Speech synthesis is not supported in this browser.');
      return;
    }

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const cleanText = briefing.markdownSummary
      .replace(/[#*_`\[\]()]/g, '')
      .replace(/- \*\*/g, '')
      .replace(/🟢|🔴|🟡|⚠️|🚨|✨|☀️/g, '');

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.05;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  };

  // Speech-To-Text Voice Recognition
  const handleToggleVoiceInput = () => {
    if (typeof window === 'undefined') return;

    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRec) {
      alert('Speech recognition is not supported in this browser. Please type your query.');
      return;
    }

    if (isRecording) {
      setIsRecording(false);
      return;
    }

    const recognition = new SpeechRec();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsRecording(true);
    recognition.onresult = (event: { results: Array<Array<{ transcript: string }>> }) => {
      const speechResult = event.results[0]?.[0]?.transcript;
      if (speechResult) {
        setPromptInput(speechResult);
        handleSendPrompt(speechResult);
      }
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);

    recognition.start();
  };

  const isDegraded = briefing.operations.queueHealth === 'degraded';
  const kpiTiles = briefing.kpiTiles || [];

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <h1>
            <span className={styles.sparkIcon}>⚡</span> LGQ AI Operator
          </h1>
          <p className={styles.subtitle}>
            Autonomous 24/7 Operations Manager, SRE Guardian, and Contractor Copilot
          </p>
        </div>
        <div className={styles.headerControls}>
          <div className={`${styles.statusPill} ${isDegraded ? styles.degraded : ''}`}>
            <span className={styles.pulseDot} />
            {isDegraded ? 'SRE Issues Detected' : 'Autonomous Loops Active'}
          </div>
          <button
            className={`${styles.audioBtn} ${isSpeaking ? styles.speaking : ''}`}
            onClick={handleToggleSpeech}
            type="button"
            title="Listen to Executive Audio Briefing"
          >
            {isSpeaking ? '⏸ Pause Briefing' : '🔊 Listen to Briefing'}
          </button>
          <button
            className={styles.digestBtn}
            onClick={handleSendDigestEmail}
            type="button"
            title="Dispatch email digest to founder"
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <MailIcon /> Email Digest
            </span>
          </button>
          <button
            className={styles.cycleBtn}
            onClick={handleRunCycle}
            disabled={isCycling}
            type="button"
          >
            {isCycling ? 'Evaluating...' : '↻ Run Ops Cycle'}
          </button>
        </div>
      </header>

      {/* Real-time Status Banner */}
      {statusBanner && (
        <div
          className={`${styles.statusBanner} ${
            statusBanner.type === 'success' ? styles.statusBannerSuccess : styles.statusBannerError
          }`}
        >
          <span>{statusBanner.type === 'success' ? '🟢' : '🔴'}</span>
          <span>{statusBanner.message}</span>
        </div>
      )}

      {/* Top KPI Stat Tiles */}
      {kpiTiles.length > 0 && (
        <section className={styles.kpiGrid}>
          {kpiTiles.map((tile) => {
            const tileContent = (
              <>
                <span className={styles.kpiLabel}>{tile.label}</span>
                <span className={styles.kpiValue}>{tile.value}</span>
                {tile.subValue && <span className={styles.kpiSubValue}>{tile.subValue}</span>}
              </>
            );

            const className = `${styles.kpiTile} ${
              tile.status === 'healthy'
                ? styles.kpiTileHealthy
                : tile.status === 'warning'
                ? styles.kpiTileWarning
                : tile.status === 'critical'
                ? styles.kpiTileCritical
                : ''
            }`;

            return tile.deepLink ? (
              <Link key={tile.id} href={tile.deepLink} className={className}>
                {tileContent}
              </Link>
            ) : (
              <div key={tile.id} className={className}>
                {tileContent}
              </div>
            );
          })}
        </section>
      )}

      {/* Top Grid: Briefing + HITL Action Cards */}
      <div className={styles.topGrid}>
        {/* Morning Briefing Card */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2>☀️ Executive Morning Briefing</h2>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {briefing.operations.unresolvedWebhooksCount > 0 && (
                <button
                  className={styles.rejectBtn}
                  onClick={handleReplayWebhooks}
                  type="button"
                  style={{ background: 'rgba(239, 68, 68, 0.15)', borderColor: '#ef4444', color: '#f87171' }}
                  title="1-Click Replay & Resolve Webhook Failures"
                >
                  ⚡ Replay 2 Webhooks
                </button>
              )}
              <span className={styles.categoryTag}>{briefing.period}</span>
            </div>
          </div>
          <div className={styles.briefingContent}>{briefing.markdownSummary}</div>
        </section>

        {/* Action Approvals (HITL Queue) */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2>⚡ Action Approval Queue</h2>
            <span className={styles.categoryTag}>{pendingActions.length} Pending</span>
          </div>

          <div className={styles.hitlList}>
            {pendingActions.length === 0 ? (
              <div className={styles.emptyState}>No pending action cards. All systems automated.</div>
            ) : (
              pendingActions.map((action) => (
                <div key={action.id} className={styles.hitlCard}>
                  <div className={styles.hitlHeader}>
                    <span className={styles.hitlTitle}>{action.title}</span>
                    <span className={styles.hitlBadge}>{action.category}</span>
                  </div>
                  <p className={styles.hitlDesc}>{action.description}</p>
                  <div className={styles.hitlActions}>
                    {(action.actionType === 'batch_activation_nudges' ||
                      Boolean((action.payload as any)?.channel === 'email')) && (
                      <button
                        className={styles.previewBtn}
                        onClick={() => handlePreviewMessage(action.id)}
                        disabled={isPreviewLoading === action.id}
                        type="button"
                      >
                        {isPreviewLoading === action.id ? 'Loading...' : '👁️ Preview Message'}
                      </button>
                    )}
                    <button
                      className={styles.approveBtn}
                      onClick={() => handleResolveAction(action.id, 'approved')}
                      type="button"
                    >
                      ✓ Approve & Execute
                    </button>
                    <button
                      className={styles.rejectBtn}
                      onClick={() => handleResolveAction(action.id, 'rejected')}
                      type="button"
                    >
                      ✕ Decline
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Interactive AI Operations Console & Multi-Turn Chat */}
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2>💬 Interactive Operations Console & Copilot</h2>
          <span className={styles.categoryTag}>Gemini 2.5 Operator Core</span>
        </div>

        <div className={styles.chatBox}>
          {/* Quick-Prompt Suggestion Chips */}
          <div className={styles.promptChipsRow}>
            {quickPromptChips.map((chipText) => (
              <button
                key={chipText}
                type="button"
                className={styles.promptChip}
                onClick={() => handleSendPrompt(chipText)}
                disabled={isPrompting}
              >
                {chipText}
              </button>
            ))}
          </div>

          {/* Multi-Turn Conversation Thread */}
          <div className={styles.chatHistoryContainer}>
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={msg.sender === 'user' ? styles.chatBubbleUser : styles.chatBubbleOperator}
              >
                <div className={styles.chatBubbleMeta}>
                  <span>{msg.sender === 'user' ? '👤 Founder' : '⚡ AI Operator'}</span>
                  <span>• {msg.timestamp}</span>
                  {msg.toolCalls && msg.toolCalls.map((tc) => (
                    <span key={tc} className={styles.toolTag}>🔧 {tc}</span>
                  ))}
                </div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>
              </div>
            ))}
            {isPrompting && (
              <div className={styles.chatBubbleOperator}>
                <div className={styles.chatBubbleMeta}>
                  <span>⚡ AI Operator</span>
                  <span>• Evaluating live data & tools...</span>
                </div>
                <div>Thinking and inspecting system state...</div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Prompt Input Form */}
          <form className={styles.promptInputRow} onSubmit={handlePromptSubmit}>
            <input
              type="text"
              className={styles.promptInput}
              placeholder="Ask anything: 'Triage webhook errors', 'Show dunning accounts', 'Diagnose account #100001'..."
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              disabled={isPrompting}
            />
            <button
              type="button"
              className={`${styles.micBtn} ${isRecording ? styles.recording : ''}`}
              onClick={handleToggleVoiceInput}
              title={isRecording ? 'Listening...' : 'Voice Input'}
            >
              🎙️
            </button>
            <button
              type="submit"
              className={styles.promptSubmitBtn}
              disabled={isPrompting || !promptInput.trim()}
            >
              {isPrompting ? 'Thinking...' : 'Send'}
            </button>
          </form>
        </div>
      </section>

      {/* Live Autonomous Audit Feed */}
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2>🛡️ Autonomous Audit Trail & Action Feed</h2>
          <span className={styles.categoryTag}>Safe Auto-Execution Log</span>
        </div>
        {auditLogs.length === 0 ? (
          <div className={styles.emptyState}>No audit logs in current session.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className={styles.auditTable}>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Category</th>
                  <th>Action</th>
                  <th>Reasoning / Output</th>
                  <th>Severity</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.slice(0, 15).map((log) => (
                  <tr key={log.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </td>
                    <td>
                      <span className={styles.categoryTag}>{log.category}</span>
                    </td>
                    <td>
                      <strong>{log.actionName}</strong>
                    </td>
                    <td>{log.reasoningSummary}</td>
                    <td>
                      <span
                        className={
                          log.severity === 'safe_auto'
                            ? styles.severitySafe
                            : undefined
                        }
                      >
                        {log.severity}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Contractor 360 Modal */}
      {modalAccount && (
        <div className={styles.modalOverlay} onClick={() => setModalAccount(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <button className={styles.modalCloseBtn} onClick={() => setModalAccount(null)} type="button">
              ✕ Close
            </button>
            <h3>Contractor 360: {modalAccount.account?.business_name || 'Account Context'}</h3>
            <div style={{ marginTop: '1rem', lineHeight: '1.6' }}>
              <p><strong>Account ID:</strong> {modalAccount.account?.id}</p>
              <p><strong>Plan Tier:</strong> {modalAccount.account?.plan}</p>
              <p><strong>Stripe Connect:</strong> {modalAccount.account?.connect_onboarded ? '🟢 Onboarded' : '🔴 Uncompleted'}</p>
              <p><strong>Dedicated Number:</strong> {modalAccount.account?.sms_number || 'Shared Pool'}</p>
              <hr style={{ borderColor: 'rgba(255,255,255,0.1)', margin: '1rem 0' }} />
              <h4>Onboarding Diagnostics:</h4>
              <pre style={{ background: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: '6px' }}>
                {JSON.stringify(modalAccount.diagnosis, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* HITL Message Preview Modal */}
      {previewModal && (
        <div className={styles.modalOverlay} onClick={() => setPreviewModal(null)}>
          <div
            className={`${styles.modalContent} ${styles.previewModalContent}`}
            onClick={(e) => e.stopPropagation()}
          >
            <button className={styles.modalCloseBtn} onClick={() => setPreviewModal(null)} type="button">
              ✕ Close
            </button>
            <h3 style={{ margin: '0 0 1rem 0' }}>✉️ Message Preview: Email Outreach</h3>

            <div className={styles.previewHeaderStrip}>
              <div><span className={styles.previewMetaLabel}>Channel:</span> <span className={styles.categoryTag}>{previewModal.channel.toUpperCase()}</span></div>
              <div><span className={styles.previewMetaLabel}>From:</span> {previewModal.fromAddress}</div>
              <div><span className={styles.previewMetaLabel}>Reply-To:</span> {previewModal.replyTo}</div>
              <div><span className={styles.previewMetaLabel}>Subject:</span> <em>&ldquo;{previewModal.subject}&rdquo;</em></div>
              <div>
                <span className={styles.previewMetaLabel}>Audience:</span>{' '}
                <strong style={{ color: '#4ade80' }}>{previewModal.recipients.length} will receive</strong>
                {' · '}
                <span style={{ color: '#fbbf24' }}>{previewModal.skipped.length} skipped</span>
              </div>
            </div>

            <div className={styles.previewIframeContainer}>
              <iframe
                title="Email Template Preview"
                srcDoc={previewModal.html}
                className={styles.previewIframe}
                sandbox="allow-same-origin"
              />
            </div>

            <div className={styles.previewAudienceSection}>
              <h4 style={{ color: '#f7f5ef', margin: '1.25rem 0 0.5rem 0' }}>
                Will Receive ({previewModal.recipients.length})
              </h4>
              {previewModal.recipients.length === 0 ? (
                <div className={styles.emptyState}>No eligible recipients. All candidates were skipped.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className={styles.auditTable}>
                    <thead>
                      <tr>
                        <th>Business</th>
                        <th>Email</th>
                        <th>Age</th>
                        <th>Quoted Jobs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewModal.recipients.map((r) => (
                        <tr key={r.accountId}>
                          <td><strong>{r.businessName}</strong></td>
                          <td>{r.email}</td>
                          <td>{r.ageDays !== undefined ? `${r.ageDays}d` : '—'}</td>
                          <td>{r.quotedJobs ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h4 style={{ color: '#f7f5ef', margin: '1.25rem 0 0.5rem 0' }}>
                Will Be Skipped ({previewModal.skipped.length})
              </h4>
              {previewModal.skipped.length === 0 ? (
                <div className={styles.emptyState}>No candidates skipped.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className={styles.auditTable}>
                    <thead>
                      <tr>
                        <th>Business</th>
                        <th>Skip Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewModal.skipped.map((s) => (
                        <tr key={s.accountId}>
                          <td>{s.businessName}</td>
                          <td>
                            <span className={styles.skipReasonBadge}>{s.reason}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                className={styles.rejectBtn}
                onClick={() => {
                  const id = previewModal.actionId;
                  setPreviewModal(null);
                  handleResolveAction(id, 'rejected');
                }}
                type="button"
              >
                ✕ Decline Card
              </button>
              <button
                className={styles.approveBtn}
                onClick={() => {
                  const id = previewModal.actionId;
                  setPreviewModal(null);
                  handleResolveAction(id, 'approved');
                }}
                type="button"
              >
                ✓ Approve & Execute ({previewModal.recipients.length} Recipient{previewModal.recipients.length === 1 ? '' : 's'})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
