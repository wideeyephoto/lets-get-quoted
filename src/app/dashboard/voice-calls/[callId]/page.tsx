import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOfficeContext } from '@/lib/auth';
import {
  formatDispositionLabel,
  formatOutcomeLabel,
  loadVoiceCallDetail,
} from '@/lib/voice/call-workspace';
import { describeSettlement, formatCallLength, type VoiceCallSettlement } from '@/lib/voice/call-history';
import { detectCallEmergency } from '@/lib/voice/triage';
import VoiceCallWorkflowPanel from './VoiceCallWorkflowPanel';
import VoiceCallAudioPlayer from './VoiceCallAudioPlayer';
import styles from './call-detail.module.css';

export const metadata = { title: 'Voice Call Details & Transcript' };

function formatCallTime(iso: string | null, timeZone: string): string {
  if (!iso) return '—';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';

  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(at);
}

export default async function VoiceCallDetailPage({
  params,
}: {
  params: { callId: string };
}) {
  const { supabase, accountId } = await requireOfficeContext('leads.read');

  const { data: account } = await supabase
    .from('accounts')
    .select('timezone')
    .eq('id', accountId)
    .maybeSingle();

  const timezone = (account?.timezone as string) || 'America/New_York';
  const call = await loadVoiceCallDetail(supabase, accountId, params.callId);

  if (!call) {
    notFound();
  }

  const emergency = call.summary ? detectCallEmergency(call.summary) : null;

  return (
    <div className={styles.container}>
      <Link href="/dashboard/voice-calls" className={styles.backLink}>
        ← Back to Voice Calls Inbox
      </Link>

      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.titleRow}>
            <h1>{call.callerNumber ?? 'Unknown Caller'}</h1>
            {call.workflow.urgency === 'emergency' || emergency?.isEmergency ? (
              <span className={`${styles.badge} ${styles.badgeEmergency}`}>
                🚨 Emergency Hazard
              </span>
            ) : call.workflow.urgency === 'urgent' ? (
              <span className={`${styles.badge} ${styles.badgeUrgent}`}>
                ⚠️ Urgent
              </span>
            ) : (
              <span className={`${styles.badge} ${styles.badgeNormal}`}>
                {formatDispositionLabel(call.workflow.disposition)}
              </span>
            )}
          </div>
          <span className={styles.factLabel}>
            Received {formatCallTime(call.startedAt, timezone)}
          </span>
        </div>

        <div className={styles.headerActions}>
          {call.callerNumber ? (
            <a
              href={`tel:${call.callerNumber}`}
              className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
            >
              📞 Call Now
            </a>
          ) : null}
          {call.leadId ? (
            <Link
              href={`/dashboard/leads/${call.leadId}`}
              className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
            >
              👤 Open Lead Profile
            </Link>
          ) : null}
        </div>
      </div>

      <div className={styles.grid}>
        {/* Main Column */}
        <div className={styles.mainColumn}>
          {/* Emergency Alert Banner */}
          {emergency?.isEmergency ? (
            <div className={styles.emergencyBanner}>
              <span style={{ fontSize: '1.25rem' }}>🚨</span>
              <div>
                <strong>High Priority Emergency Hazard Detected:</strong>
                <div>{emergency.reason}</div>
              </div>
            </div>
          ) : null}

          {/* AI Conversation Summary */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span>AI Receptionist Summary</span>
            </div>
            <div className={styles.summaryContent}>
              {call.summary || (
                <span style={{ fontStyle: 'italic', opacity: 0.7 }}>
                  {call.isProvisional
                    ? 'This call was recently admitted. Summary will be generated once the call ends.'
                    : 'No conversation summary recorded.'}
                </span>
              )}
            </div>
          </div>

          {/* Chronological Dialogue Transcript */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span>Conversation Transcript</span>
              <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--mute-t62, #94a3b8)' }}>
                {call.transcript.length} turns recorded
              </span>
            </div>

            {call.transcript.length === 0 ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--mute-t62, #94a3b8)', fontSize: '0.88rem' }}>
                {call.isProvisional
                  ? 'Call in progress. Transcript dialogue will appear here upon completion.'
                  : 'No transcript dialogue was retained for this call.'}
              </div>
            ) : (
              <div className={styles.transcriptFeed}>
                {call.transcript.map((turn, index) => {
                  const isAssistant = turn.role === 'assistant';
                  return (
                    <div
                      key={index}
                      className={`${styles.turnBubble} ${isAssistant ? styles.turnAssistant : styles.turnCaller}`}
                    >
                      <span className={styles.turnAuthor}>
                        {isAssistant ? '🤖 AI Receptionist' : '👤 Caller'}
                      </span>
                      <div className={styles.turnBody}>{turn.content}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recording Player & Ingest Status */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span>Audio Recording</span>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--mute-t62, #94a3b8)' }}>
                {call.recordingStatus === 'ready'
                  ? 'Ready'
                  : call.recordingStatus === 'pending'
                  ? 'Processing'
                  : 'Disabled / Not Captured'}
              </span>
            </div>
            {call.recordingStatus === 'ready' ? (
              <VoiceCallAudioPlayer
                callId={call.id}
                durationSeconds={call.recordingDurationSeconds}
              />
            ) : (
              <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', fontSize: '0.88rem', color: 'var(--mute-t62, #94a3b8)' }}>
                <p style={{ margin: 0 }}>
                  Audio call recording is disabled by default to maintain compliance with multi-party consent regulations. Transcripts are retained per your workspace retention policy.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Column */}
        <div className={styles.sideColumn}>
          {/* Call Technical Facts */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span>Call Details</span>
            </div>
            <div className={styles.factsList}>
              <div className={styles.factRow}>
                <span className={styles.factLabel}>Provider Outcome</span>
                <span className={styles.factValue}>{formatOutcomeLabel(call.outcome)}</span>
              </div>
              <div className={styles.factRow}>
                <span className={styles.factLabel}>Connected Duration</span>
                <span className={styles.factValue}>{formatCallLength(call.aiSeconds)}</span>
              </div>
              <div className={styles.factRow}>
                <span className={styles.factLabel}>Billed Usage</span>
                <span className={styles.factValue}>
                  {call.billedMinutes !== null ? `${call.billedMinutes} min` : '—'}
                </span>
              </div>
              <div className={styles.factRow}>
                <span className={styles.factLabel}>Settlement Tier</span>
                <span className={styles.factValue}>
                  {describeSettlement(call.settlement as VoiceCallSettlement, call.billedMinutes)}
                </span>
              </div>
              <div className={styles.factRow}>
                <span className={styles.factLabel}>Telemetry Source</span>
                <span className={styles.factValue}>{call.outcomeSource || 'SignalWire'}</span>
              </div>
            </div>
          </div>

          {/* Workflow & Staff Actions Panel */}
          <VoiceCallWorkflowPanel
            callId={call.id}
            currentDisposition={call.workflow.disposition}
            leadId={call.leadId}
          />

          {/* Staff Notes & Activity */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span>Staff Notes</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--mute-t62, #94a3b8)' }}>
                {call.notes.length}
              </span>
            </div>

            {call.notes.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--mute-t62, #94a3b8)' }}>
                No internal notes added yet.
              </p>
            ) : (
              <div className={styles.notesList}>
                {call.notes.map((note) => (
                  <div key={note.id} className={styles.noteItem}>
                    <div className={styles.noteMeta}>
                      <strong>{note.authorName}</strong>
                      <span>{formatCallTime(note.createdAt, timezone)}</span>
                    </div>
                    <div>{note.note}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
