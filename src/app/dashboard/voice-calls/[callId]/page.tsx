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
import InteractiveTranscriptViewer from './InteractiveTranscriptViewer';
import QuickSmsFollowupCard from './QuickSmsFollowupCard';
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
    .select('timezone, business_name')
    .eq('id', accountId)
    .maybeSingle();

  const timezone = (account?.timezone as string) || 'America/New_York';
  const businessName = (account?.business_name as string) || null;
  const call = await loadVoiceCallDetail(supabase, accountId, params.callId);

  if (!call) {
    notFound();
  }

  const callerName = call.contact.client?.name ?? call.contact.lead?.name ?? null;
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

          {/* 1-Click SMS Follow-up Card */}
          <QuickSmsFollowupCard
            callerPhone={call.callerNumber}
            callerName={callerName}
            summary={call.summary}
            businessName={businessName}
          />

          {/* Interactive Audio Player & Synchronized Transcript */}
          <InteractiveTranscriptViewer
            callId={call.id}
            transcript={call.transcript}
            recordingStatus={call.recordingStatus}
            recordingDurationSeconds={call.recordingDurationSeconds}
            isProvisional={call.isProvisional}
          />
        </div>

        {/* Sidebar Column */}
        <div className={styles.sideColumn}>
          {/* Customer & CRM Intelligence Card */}
          <div className={`${styles.card} ${call.contact.client ? styles.crmCard : ''}`}>
            <div className={styles.cardHeader}>
              <span>Customer Intelligence</span>
              {call.contact.client ? (
                <span className={styles.crmBadge}>Known Client</span>
              ) : call.contact.lead ? (
                <span className={styles.crmBadge}>Active Lead</span>
              ) : (
                <span style={{ fontSize: '0.75rem', color: 'var(--mute-t62, #94a3b8)' }}>New Contact</span>
              )}
            </div>

            {call.contact.client ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <div>
                  <div className={styles.clientName}>{call.contact.client.name}</div>
                  {call.contact.client.address ? (
                    <div className={styles.clientAddress}>📍 {call.contact.client.address}</div>
                  ) : null}
                  {call.contact.client.email ? (
                    <div className={styles.clientAddress}>✉️ {call.contact.client.email}</div>
                  ) : null}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                  <span className={`${styles.badge} ${styles.badgeAi}`}>
                    ⭐ {call.contact.client.totalJobsCount} {call.contact.client.totalJobsCount === 1 ? 'Job' : 'Jobs'} on file
                  </span>
                </div>

                <Link
                  href={`/dashboard/clients/${call.contact.client.id}`}
                  className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
                  style={{ marginTop: '0.3rem', justifyContent: 'center' }}
                >
                  👤 Open Client Profile →
                </Link>
              </div>
            ) : call.contact.lead ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <div>
                  <div className={styles.clientName}>{call.contact.lead.name}</div>
                  {call.contact.lead.address ? (
                    <div className={styles.clientAddress}>📍 {call.contact.lead.address}</div>
                  ) : null}
                  <div className={styles.clientAddress}>
                    Lead Status: <strong>{call.contact.lead.status}</strong>
                  </div>
                </div>

                <Link
                  href={`/dashboard/leads/${call.contact.lead.id}`}
                  className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
                  style={{ marginTop: '0.3rem', justifyContent: 'center' }}
                >
                  🎯 Open Lead Profile →
                </Link>
              </div>
            ) : (
              <div style={{ fontSize: '0.85rem', color: 'var(--mute-t62, #94a3b8)', lineHeight: 1.5 }}>
                <p style={{ margin: '0 0 0.5rem 0' }}>
                  No existing client or lead record was found for this phone number.
                </p>
                {call.callerNumber ? (
                  <Link
                    href={`/dashboard/clients`}
                    className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
                    style={{ justifyContent: 'center', width: '100%' }}
                  >
                    ➕ Create Client Record
                  </Link>
                ) : null}
              </div>
            )}
          </div>

          {/* Caller History Timeline */}
          {call.contact.priorCalls.length > 0 ? (
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <span>Caller History</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--mute-t62, #94a3b8)' }}>
                  {call.contact.totalPriorCallsCount} previous {call.contact.totalPriorCallsCount === 1 ? 'call' : 'calls'}
                </span>
              </div>
              <div className={styles.priorCallsList}>
                {call.contact.priorCalls.map((prior) => (
                  <Link
                    key={prior.id}
                    href={`/dashboard/voice-calls/${prior.id}`}
                    className={styles.priorCallItem}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>{formatCallTime(prior.startedAt, timezone)}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--mute-t62, #94a3b8)' }}>
                        {formatCallLength(prior.aiSeconds)} • {formatOutcomeLabel(prior.outcome)}
                      </div>
                    </div>
                    <span style={{ fontSize: '0.85rem' }}>→</span>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

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
