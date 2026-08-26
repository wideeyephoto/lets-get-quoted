import Link from 'next/link';
import { createAdminClient, requireOfficeContext } from '@/lib/auth';
import { loadVoiceRouteReadiness } from '@/lib/voice/route-readiness';
import {
  formatDispositionLabel,
  formatOutcomeLabel,
  loadVoiceWorkspaceQueue,
  type VoiceCallOutcome,
  type VoiceCallDisposition,
} from '@/lib/voice/call-workspace';

import { formatCallLength } from '@/lib/voice/call-formatting';
import { convertVoiceCallToQuoteDraftAction } from './actions';
import VoiceCallsLiveRefresher from './VoiceCallsLiveRefresher';
import VoiceControlsSection from './VoiceControlsSection';
import VoiceSimulatorSandbox from './VoiceSimulatorSandbox';
import VoiceHealthWidget from './VoiceHealthWidget';
import styles from './voice-calls.module.css';

export const metadata = { title: 'AI Voice Assistant | Receptionist & Call Triage' };

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
    dateRange?: string;
    q?: string;
    disposition?: string;
    outcome?: string;
  };
}) {
  const { supabase, accountId } = await requireOfficeContext('leads.read');
  const admin = createAdminClient();

  const [{ data: account }, { data: voiceSettings }, routeReadiness, queue] = await Promise.all([
    supabase
      .from('accounts')
      .select('company_name, business_name, trade, phone, timezone, license_number, service_areas, call_tracking_number')
      .eq('id', accountId)
      .maybeSingle(),
    supabase
      .from('voice_settings')
      .select('status, answer_mode, greeting, transfer_number, alert_phone, voice_tone')
      .eq('account_id', accountId)
      .maybeSingle(),
    loadVoiceRouteReadiness(admin, accountId),
    loadVoiceWorkspaceQueue(supabase, accountId, {
      tab: (searchParams.tab as 'all' | 'unreviewed' | 'needs_callback' | 'urgent' | 'transferred' | 'completed') || 'all',
      dateRange: (searchParams.dateRange as 'all' | 'today' | 'yesterday' | '7d' | '30d' | 'month') || 'all',
      query: searchParams.q,
      disposition: (searchParams.disposition as VoiceCallDisposition) || 'all',
      outcome: (searchParams.outcome as VoiceCallOutcome) || 'all',
    }),
  ]);

  const isRouteReady = routeReadiness.kind === 'ready';
  const dedicatedNumber = isRouteReady ? routeReadiness.number : null;

  const timezone = (account?.timezone as string) || 'America/New_York';
  const currentTab = (searchParams.tab as 'all' | 'unreviewed' | 'needs_callback' | 'urgent' | 'transferred' | 'completed') || 'all';
  const currentDateRange = (searchParams.dateRange as 'all' | 'today' | 'yesterday' | '7d' | '30d' | 'month') || 'all';

  const { counters, items } = queue;
  const handledRate = counters.totalCount > 0
    ? Math.round((counters.handledCount / counters.totalCount) * 100)
    : 0;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <h1>AI Voice Assistant</h1>
          <p>24/7 AI Receptionist, live in-call booking controls, and operational call triage inbox.</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <a
            href={`/api/voice/export?dateRange=${currentDateRange}`}
            className={styles.exportBtn}
            download
          >
            📥 Export CSV
          </a>
        </div>
      </div>

      {/* Live Carrier SignalWire Engine & Webhook Latency Health Widget */}
      <VoiceHealthWidget />

      {/* AI Voice Assistant Active Controls & Status Matrix */}
      <VoiceControlsSection
        status={(voiceSettings?.status as 'active' | 'paused' | 'off') || 'active'}
        answerMode={(voiceSettings?.answer_mode as 'always' | 'after_hours') || 'always'}
        dedicatedNumber={dedicatedNumber}
        isReady={isRouteReady}
        greeting={voiceSettings?.greeting || null}
        transferNumber={voiceSettings?.transfer_number || null}
        businessName={account?.business_name || account?.company_name || null}
        trade={account?.trade || null}
        serviceAreas={account?.service_areas || null}
      />


      {/* In-Browser Zero-Minute Voice Simulator Sandbox */}
      <VoiceSimulatorSandbox
        companyName={account?.company_name || 'Our Company'}
        trade={account?.trade || 'Contractor'}
        voiceTone={(voiceSettings?.voice_tone as string) || 'professional'}
      />

      {/* AI Voice Intelligence & Performance Analytics */}
      <div className={styles.analyticsGrid}>
        <div className={styles.analyticsCard}>
          <span className={styles.analyticsLabel}>AI Answered Usage</span>
          <span className={styles.analyticsValue}>{counters.totalAiMinutes} min</span>
          <span className={styles.analyticsSubtext}>Total billable AI minutes</span>
        </div>

        <div className={styles.analyticsCard}>
          <span className={styles.analyticsLabel}>AI Resolution Rate</span>
          <span className={styles.analyticsValue}>{handledRate}%</span>
          <span className={styles.analyticsSubtext}>{counters.handledCount} calls handled without transfer</span>
        </div>

        <div className={styles.analyticsCard}>
          <span className={styles.analyticsLabel}>Avg Call Length</span>
          <span className={styles.analyticsValue}>{formatCallLength(counters.avgDurationSeconds)}</span>
          <span className={styles.analyticsSubtext}>Across {counters.totalCount} calls</span>
        </div>

        <div className={styles.analyticsCard}>
          <span className={styles.analyticsLabel}>Peak Calling Window</span>
          <span className={styles.analyticsValue}>{counters.peakHour ?? '—'}</span>
          <span className={styles.analyticsSubtext}>Highest incoming volume</span>
        </div>

        <div className={styles.analyticsCard}>
          <span className={styles.analyticsLabel}>Emergency Hazards</span>
          <span className={styles.analyticsValue} style={{ color: counters.emergencyCount > 0 ? '#fca5a5' : '#fff' }}>
            {counters.emergencyCount}
          </span>
          <span className={styles.analyticsSubtext}>High-priority urgent safety calls</span>
        </div>
      </div>

      {/* Date Range Selector Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', margin: '0.5rem 0' }}>
        <div className={styles.dateFilterGroup}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--mute-t62, #94a3b8)', marginRight: '0.25rem' }}>
            Timeframe:
          </span>
          {[
            ['all', 'All Time'],
            ['today', 'Today'],
            ['yesterday', 'Yesterday'],
            ['7d', 'Last 7 Days'],
            ['30d', 'Last 30 Days'],
            ['month', 'This Month'],
          ].map(([val, label]) => (
            <Link
              key={val}
              href={`/dashboard/voice-calls?tab=${currentTab}&dateRange=${val}${searchParams.q ? `&q=${encodeURIComponent(searchParams.q)}` : ''}`}
              className={`${styles.dateFilterBtn} ${currentDateRange === val ? styles.dateFilterActive : ''}`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* Top-Level Operational Counters */}
      <div className={styles.statsGrid}>
        <Link
          href={`/dashboard/voice-calls?tab=unreviewed&dateRange=${currentDateRange}`}
          className={`${styles.statCard} ${currentTab === 'unreviewed' ? styles.statActive : ''} ${counters.unreviewed > 0 ? styles.statAlert : ''}`}
        >
          <span className={styles.statLabel}>Unreviewed</span>
          <span className={styles.statValue}>{counters.unreviewed}</span>
        </Link>
        <Link
          href={`/dashboard/voice-calls?tab=needs_callback&dateRange=${currentDateRange}`}
          className={`${styles.statCard} ${currentTab === 'needs_callback' ? styles.statActive : ''} ${counters.needsCallback > 0 ? styles.statWarning : ''}`}
        >
          <span className={styles.statLabel}>Needs Callback</span>
          <span className={styles.statValue}>{counters.needsCallback}</span>
        </Link>
        <Link
          href={`/dashboard/voice-calls?tab=urgent&dateRange=${currentDateRange}`}
          className={`${styles.statCard} ${currentTab === 'urgent' ? styles.statActive : ''} ${counters.urgent > 0 ? styles.statAlert : ''}`}
        >
          <span className={styles.statLabel}>Urgent / Emergency</span>
          <span className={styles.statValue}>{counters.urgent}</span>
        </Link>
        <Link
          href={`/dashboard/voice-calls?tab=transferred&dateRange=${currentDateRange}`}
          className={`${styles.statCard} ${currentTab === 'transferred' ? styles.statActive : ''}`}
        >
          <span className={styles.statLabel}>Transferred</span>
          <span className={styles.statValue}>{counters.transferred}</span>
        </Link>
        <Link
          href={`/dashboard/voice-calls?tab=all&dateRange=${currentDateRange}`}
          className={`${styles.statCard} ${currentTab === 'all' ? styles.statActive : ''}`}
        >
          <span className={styles.statLabel}>Total in Range</span>
          <span className={styles.statValue}>{counters.totalCount}</span>
        </Link>
      </div>

      {/* Search and Tabs Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.filterTabs}>
          <Link
            href={`/dashboard/voice-calls?tab=all&dateRange=${currentDateRange}`}
            className={`${styles.tabBtn} ${currentTab === 'all' ? styles.tabActive : ''}`}
          >
            All Calls ({counters.totalCount})
          </Link>
          <Link
            href={`/dashboard/voice-calls?tab=unreviewed&dateRange=${currentDateRange}`}
            className={`${styles.tabBtn} ${currentTab === 'unreviewed' ? styles.tabActive : ''}`}
          >
            Unreviewed ({counters.unreviewed})
          </Link>
          <Link
            href={`/dashboard/voice-calls?tab=needs_callback&dateRange=${currentDateRange}`}
            className={`${styles.tabBtn} ${currentTab === 'needs_callback' ? styles.tabActive : ''}`}
          >
            Needs Callback ({counters.needsCallback})
          </Link>
          <Link
            href={`/dashboard/voice-calls?tab=urgent&dateRange=${currentDateRange}`}
            className={`${styles.tabBtn} ${currentTab === 'urgent' ? styles.tabActive : ''}`}
          >
            Urgent ({counters.urgent})
          </Link>
          <Link
            href={`/dashboard/voice-calls?tab=transferred&dateRange=${currentDateRange}`}
            className={`${styles.tabBtn} ${currentTab === 'transferred' ? styles.tabActive : ''}`}
          >
            Transferred ({counters.transferred})
          </Link>
          <Link
            href={`/dashboard/voice-calls?tab=completed&dateRange=${currentDateRange}`}
            className={`${styles.tabBtn} ${currentTab === 'completed' ? styles.tabActive : ''}`}
          >
            Resolved
          </Link>
        </div>

        <form method="GET" className={styles.searchRow}>
          <input type="hidden" name="tab" value={currentTab} />
          <input type="hidden" name="dateRange" value={currentDateRange} />
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
                    {call.isProvisional || call.outcome === 'in_progress' ? (
                      <span className={`${styles.badge} ${styles.badgeLive}`}>
                        🔴 Live Call
                      </span>
                    ) : null}
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
                    <form
                      action={async (formData: FormData) => {
                        'use server';
                        await convertVoiceCallToQuoteDraftAction(formData);
                      }}
                      style={{ display: 'inline' }}
                    >
                      <input type="hidden" name="callId" value={call.id} />
                      <button
                        type="submit"
                        className={styles.linkButton}
                        style={{
                          fontWeight: 600,
                          color: '#93c5fd',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: 0,
                          font: 'inherit',
                        }}
                      >
                        ⚡ Convert to Quote →
                      </button>
                    </form>
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

      {/* Live Polling & Focus-Regained Refresher */}
      <VoiceCallsLiveRefresher
        hasActiveCalls={items.some((i) => i.isProvisional || i.outcome === 'in_progress')}
      />
    </div>
  );
}
