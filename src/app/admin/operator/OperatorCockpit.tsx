'use client';

import { useState } from 'react';
import type {
  ExecutiveBriefing,
  OperatorHitlActionRequest,
  OperatorAuditLogEntry,
} from '@/lib/ai-operator/types';
import {
  triggerOperatorCycleAction,
  resolveHitlActionServerAction,
  askOperatorServerAction,
} from './actions';
import styles from './OperatorCockpit.module.css';

interface OperatorCockpitProps {
  initialBriefing: ExecutiveBriefing;
  initialPendingActions: OperatorHitlActionRequest[];
  initialAuditLogs: OperatorAuditLogEntry[];
}

export default function OperatorCockpit({
  initialBriefing,
  initialPendingActions,
  initialAuditLogs,
}: OperatorCockpitProps) {
  const [briefing, setBriefing] = useState<ExecutiveBriefing>(initialBriefing);
  const [pendingActions, setPendingActions] = useState<OperatorHitlActionRequest[]>(initialPendingActions);
  const [auditLogs] = useState<OperatorAuditLogEntry[]>(initialAuditLogs);
  const [isCycling, setIsCycling] = useState(false);

  // Interactive AI prompt
  const [promptInput, setPromptInput] = useState('');
  const [isPrompting, setIsPrompting] = useState(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);

  const handleRunCycle = async () => {
    setIsCycling(true);
    try {
      const res = await triggerOperatorCycleAction();
      if (res.success && res.report) {
        setBriefing(res.report.briefing);
        setPendingActions(res.report.pendingHitlActions);
      }
    } catch (e) {
      console.error('Failed to run cycle:', e);
    } finally {
      setIsCycling(false);
    }
  };

  const handleResolveAction = async (actionId: string, decision: 'approved' | 'rejected') => {
    try {
      const res = await resolveHitlActionServerAction(actionId, decision);
      if (res.success) {
        setPendingActions((prev) => prev.filter((a) => a.id !== actionId));
      }
    } catch (e) {
      console.error('Failed to resolve action:', e);
    }
  };

  const handlePromptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptInput.trim() || isPrompting) return;

    setIsPrompting(true);
    try {
      const res = await askOperatorServerAction(promptInput);
      setAiResponse(res.answer);
      if (res.pendingHitlActions) {
        setPendingActions(res.pendingHitlActions);
      }
    } catch (e) {
      setAiResponse(`Error executing query: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsPrompting(false);
    }
  };

  const isDegraded = briefing.operations.queueHealth === 'degraded';

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
            className={styles.cycleBtn}
            onClick={handleRunCycle}
            disabled={isCycling}
            type="button"
          >
            {isCycling ? 'Evaluating...' : '↻ Run Ops Cycle'}
          </button>
        </div>
      </header>

      {/* Top Grid: Briefing + HITL Action Cards */}
      <div className={styles.topGrid}>
        {/* Morning Briefing Card */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2>☀️ Executive Morning Briefing</h2>
            <span className={styles.categoryTag}>{briefing.period}</span>
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

      {/* Interactive AI Operations Console */}
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2>💬 Interactive Operations Console</h2>
          <span className={styles.categoryTag}>Gemini 2.5 Operator Core</span>
        </div>
        <div className={styles.promptBox}>
          <form className={styles.promptInputRow} onSubmit={handlePromptSubmit}>
            <input
              type="text"
              className={styles.promptInput}
              placeholder="Ask anything: 'What is our SMS deliverability?', 'Show me dunning accounts', 'Triage ticket #102'..."
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              disabled={isPrompting}
            />
            <button
              type="submit"
              className={styles.promptSubmitBtn}
              disabled={isPrompting || !promptInput.trim()}
            >
              {isPrompting ? 'Thinking...' : 'Ask AI'}
            </button>
          </form>

          {aiResponse && (
            <div className={styles.aiResponseArea}>
              <strong>AI Response:</strong>
              <div style={{ marginTop: '0.4rem', whiteSpace: 'pre-wrap' }}>{aiResponse}</div>
            </div>
          )}
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
    </div>
  );
}
