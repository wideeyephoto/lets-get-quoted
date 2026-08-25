import Link from 'next/link';
import { requireOfficeContext } from '@/lib/auth';
import {
  formatDispositionLabel,
  formatOutcomeLabel,
  loadVoiceWorkspaceQueue,
  type VoiceCallOutcome,
  type VoiceCallDisposition,
} from '@/lib/voice/call-workspace';
import { formatCallLength } from '@/lib/voice/call-history';
import styles from './voice-calls.module.css';

export const metadata = { title: 'Voice Calls | Operational Inbox' };

function formatCallTime(iso: string | null, timeZone: string): string {
  if (!iso) return '—';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';

  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(at);
}

export default async function VoiceCallsPage({
  searchParams,
}: {
  searchParams: {
    tab?: string;
    q?: string;
    disposition?: string;
    outcome?: string;
  };
}) {
  const { supabase, accountId } = await requireOfficeContext('leads.read');

  const { data: account } = await supabase
    .from('accounts')
    .select('timezone')
    .eq('id', accountId)
    .maybeSingle();

  const timezone = (account?.timezone as string) || 'America/New_York';
  const currentTab = (searchParams.tab as 'all' | 'unreviewed' | 'needs_callback' | 'urgent' | 'transferred' | 'completed') || 'all';

  const queue = await loadVoiceWorkspaceQueue(supabase, accountId, {
    tab: currentTab,
    query: searchParams.q,
    disposition: (searchParams.disposition as VoiceCallDisposition) || 'all',
    outcome: (searchParams.outcome as VoiceCallOutcome) || 'all',
  });

  const { counters, items } = queue;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <h1>Voice Calls Inbox</h1>
          <p>Triage AI receptionist calls, review transcripts, and schedule customer callbacks.</p>
        </div>
      </div>

      {/* Top-Level Operational Counters */}
      <div className={styles.statsGrid}>
        <Link
          href="/dashboard/voice-calls?tab=unreviewed"
          className={`${styles.statCard} ${currentTab === 'unreviewed' ? styles.statActive : ''} ${counters.unreviewed > 0 ? styles.statAlert : ''}`}
        >
          <span className={styles.statLabel}>Unreviewed</span>
          <span className={styles.statValue}>{counters.unreviewed}</span>
        </Link>
        <Link
          href="/dashboard/voice-calls?tab=needs_callback"
          className={`${styles.statCard} ${currentTab === 'needs_callback' ? styles.statActive : ''} ${counters.needsCallback > 0 ? styles.statWarning : ''}`}
        >
          <span className={styles.statLabel}>Needs Callback</span>
          <span className={styles.statValue}>{counters.needsCallback}</span>
        </Link>
        <Link
          href="/dashboard/voice-calls?tab=urgent"
          className={`${styles.statCard} ${currentTab === 'urgent' ? styles.statActive : ''} ${counters.urgent > 0 ? styles.statAlert : ''}`}
        >
          <span className={styles.statLabel}>Urgent / Emergency</span>
          <span className={styles.statValue}>{counters.urgent}</span>
        </Link>
        <Link
          href="/dashboard/voice-calls?tab=transferred"
          className={`${styles.statCard} ${currentTab === 'transferred' ? styles.statActive : ''}`}
        >
          <span className={styles.statLabel}>Transferred</span>
          <span className={styles.statValue}>{counters.transferred}</span>
        </Link>
        <Link
          href="/dashboard/voice-calls?tab=all"
          className={`${styles.statCard} ${currentTab === 'all' ? styles.statActive : ''}`}
        >
          <span className={styles.statLabel}>Total In History</span>
          <span className={styles.statValue}>{counters.totalCount}</span>
        </Link>
      </div>

      {/* Search and Tabs Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.filterTabs}>
          <Link
            href="/dashboard/voice-calls?tab=all"
            className={`${styles.tabBtn} ${currentTab === 'all' ? styles.tabActive : ''}`}
          >
            All Calls ({counters.totalCount})
          </Link>
          <Link
            href="/dashboard/voice-calls?tab=unreviewed"
            className={`${styles.tabBtn} ${currentTab === 'unreviewed' ? styles.tabActive : ''}`}
          >
            Unreviewed ({counters.unreviewed})
          </Link>
          <Link
            href="/dashboard/voice-calls?tab=needs_callback"
            className={`${styles.tabBtn} ${currentTab === 'needs_callback' ? styles.tabActive : ''}`}
          >
            Needs Callback ({counters.needsCallback})
          </Link>
          <Link
            href="/dashboard/voice-calls?tab=urgent"
            className={`${styles.tabBtn} ${currentTab === 'urgent' ? styles.tabActive : ''}`}
          >
            Urgent ({counters.urgent})
          </Link>
          <Link
            href="/dashboard/voice-calls?tab=transferred"
            className={`${styles.tabBtn} ${currentTab === 'transferred' ? styles.tabActive : ''}`}
          >
            Transferred ({counters.transferred})
          </Link>
          <Link
            href="/dashboard/voice-calls?tab=completed"
            className={`${styles.tabBtn} ${currentTab === 'completed' ? styles.tabActive : ''}`}
          >
            Resolved
          </Link>
        </div>

        <form method="GET" className={styles.searchRow}>
          <input type="hidden" name="tab" value={currentTab} />
          <input
            type="search"
            name="q"
            defaultValue={searchParams.q || ''}
            placeholder="Search by caller phone or keyword in summary..."
            className={styles.searchInput}
          />
        </form>
      </div>

      {/* Working Call Queue */}
      {items.length === 0 ? (
        <div className={styles.emptyState}>
          <h3>No calls in this view</h3>
          <p>
            {searchParams.q
              ? 'No voice calls matched your search query. Try clearing your search term.'
              : 'When the AI receptionist answers calls, they will appear in your working inbox with full transcripts and action items.'}
          </p>
        </div>
      ) : (
        <div className={styles.queueList}>
          {items.map((call) => {
            const isUrgent = call.workflow.urgency === 'urgent' || call.workflow.urgency === 'emergency';
            const isUnreviewed = call.workflow.disposition === 'unreviewed';

            let outcomeBadgeClass = styles.badgeAi;
            if (call.outcome === 'transfer_attempted' || call.outcome === 'transferred_and_answered' || call.outcome === 'transferred') {
              outcomeBadgeClass = styles.badgeTransfer;
            } else if (call.outcome === 'voicemail' || call.outcome === 'voicemail_fallback') {
              outcomeBadgeClass = styles.badgeVoicemail;
            }

            return (
              <div
                key={call.id}
                className={`${styles.callCard} ${isUnreviewed ? styles.unreviewedCard : ''} ${isUrgent ? styles.urgentCard : ''}`}
              >
                <div className={styles.cardHead}>
                  <div className={styles.callerGroup}>
                    <span className={styles.callerNumber}>
                      {call.callerNumber ?? 'Unknown Caller'}
                    </span>
                    {call.workflow.urgency === 'emergency' ? (
                      <span className={`${styles.badge} ${styles.badgeEmergency}`}>
                        🚨 Emergency
                      </span>
                    ) : call.workflow.urgency === 'urgent' ? (
                      <span className={`${styles.badge} ${styles.badgeUrgent}`}>
                        ⚠️ Urgent
                      </span>
                    ) : null}
                    <span className={`${styles.badge} ${outcomeBadgeClass}`}>
                      {formatOutcomeLabel(call.outcome)}
                    </span>
                    <span className={`${styles.badge} ${styles.badgeDisposition}`}>
                      {formatDispositionLabel(call.workflow.disposition)}
                    </span>
                  </div>
                  <span className={styles.timeText}>{formatCallTime(call.startedAt, timezone)}</span>
                </div>

                {call.summary ? (
                  <p className={styles.summaryText}>{call.summary}</p>
                ) : (
                  <p className={styles.summaryText} style={{ fontStyle: 'italic', opacity: 0.7 }}>
                    {call.isProvisional ? 'Call in progress or awaiting terminal transcript summary...' : 'No conversation summary recorded.'}
                  </p>
                )}

                <div className={styles.cardFooter}>
                  <div className={styles.footerLeft}>
                    <span>Duration: {formatCallLength(call.aiSeconds)}</span>
                    {call.billedMinutes !== null ? (
                      <span>({call.billedMinutes} min billed)</span>
                    ) : null}
                    {call.recordingStatus === 'ready' ? (
                      <span>🎙️ Audio Ready</span>
                    ) : null}
                  </div>
                  <div className={styles.footerRight}>
                    {call.leadId ? (
                      <Link href={`/dashboard/leads/${call.leadId}`} className={styles.linkButton}>
                        View Lead Profile →
                      </Link>
                    ) : null}
                    <Link href={`/dashboard/voice-calls/${call.id}`} className={styles.linkButton} style={{ fontWeight: 700 }}>
                      View Details & Transcript →
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
