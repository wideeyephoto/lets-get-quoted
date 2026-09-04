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
import { VoiceStatusBanner, VoiceCapabilitiesGrid, ContractorHotlineShowcase } from './VoiceControlsSection';
import VoiceSimulatorSandbox from './VoiceSimulatorSandbox';
import VoiceHealthWidget from './VoiceHealthWidget';
import FieldIntakeHint from '@/components/field-intake-hint';
import MessagingSetup from '@/app/dashboard/messages/MessagingSetup';
import { loadMessagingSetup } from '@/lib/owner-sms';
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
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{
    view?: string;
    tab?: string;
    dateRange?: string;
    q?: string;
    disposition?: string;
    outcome?: string;
    setup?: string;
  }>;
}) {
  const searchParams = (await searchParamsPromise) || {};
  const { supabase, accountId } = await requireOfficeContext('leads.read');
  const admin = createAdminClient();

  const currentView = (searchParams.view as 'inbox' | 'simulator' | 'analytics') || 'inbox';
  const currentTab = (searchParams.tab as 'all' | 'unreviewed' | 'needs_callback' | 'urgent' | 'transferred' | 'completed') || 'all';
  const currentDateRange = (searchParams.dateRange as 'all' | 'today' | 'yesterday' | '7d' | '30d' | 'month') || 'all';

  const [
    { data: account },
    { data: site },
    { data: voiceSettings },
    { data: balanceRows },
    routeReadiness,
    queue,
    messagingSetup,
  ] = await Promise.all([
    supabase
      .from('accounts')
      .select('company_name, business_name, trade, phone, timezone, license_number, service_areas, call_tracking_number')
      .eq('id', accountId)
      .maybeSingle(),
    supabase
      .from('sites')
      .select('company_name')
      .eq('account_id', accountId)
      .maybeSingle(),
    supabase
      .from('voice_settings')
      .select('status, answer_mode, greeting, transfer_number, alert_phone, voice_tone')
      .eq('account_id', accountId)
      .maybeSingle(),
    supabase
      .from('workspace_usage_credit_balances')
      .select('resource_code, available_units')
      .eq('account_id', accountId),
    loadVoiceRouteReadiness(admin, accountId),
    loadVoiceWorkspaceQueue(supabase, accountId, {
      tab: currentTab,
      dateRange: currentDateRange,
      query: searchParams.q,
      disposition: (searchParams.disposition as VoiceCallDisposition) || 'all',
      outcome: (searchParams.outcome as VoiceCallOutcome) || 'all',
    }),
    loadMessagingSetup(accountId),
  ]);

  const isRouteReady = routeReadiness.kind === 'ready';
  const dedicatedNumber = isRouteReady ? routeReadiness.number : null;

  const aiIntakeUnits = balanceRows?.find((r) => r.resource_code === 'ai_intake_threads')?.available_units;
  const aiWritingUnits = balanceRows?.find((r) => r.resource_code === 'ai_writing_drafts')?.available_units;
  const hasAiBalance = typeof aiIntakeUnits === 'number' || typeof aiWritingUnits === 'number';
  const totalAiUnits = (typeof aiIntakeUnits === 'number' ? aiIntakeUnits : 0) + (typeof aiWritingUnits === 'number' ? aiWritingUnits : 0);

  const resolvedBusinessName = site?.company_name || account?.business_name || account?.company_name || null;
  const timezone = (account?.timezone as string) || 'America/New_York';

  const { counters, items } = queue;
  const handledRate = counters.totalCount > 0
    ? Math.round((counters.handledCount / counters.totalCount) * 100)
    : 0;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <h1>AI Voice Assistant</h1>
          <p>24/7 AI Receptionist, live in-call booking controls, and operational call triage inbox.</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <FieldIntakeHint page="voice" />
          {hasAiBalance ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.75rem', background: 'var(--bg-card, rgba(255,255,255,0.04))', border: '1px solid var(--rule-t12, rgba(255,255,255,0.08))', borderRadius: '6px', fontSize: '0.8125rem', color: totalAiUnits <= 25 ? 'var(--amber-10, #f59e0b)' : 'var(--text-secondary, #94a3b8)', fontWeight: 500 }}>
              <span>⚡ {totalAiUnits.toLocaleString('en-US')} AI credits available</span>
              {totalAiUnits <= 25 ? (
                <Link href="/dashboard/settings#buy-credits" style={{ color: 'var(--amber-11, #d97706)', fontWeight: 600, textDecoration: 'underline' }}>
                  + Top up
                </Link>
              ) : null}
            </div>
          ) : null}
          {counters.totalCount > 0 ? (
            <a
              href={`/api/voice/export?dateRange=${currentDateRange}`}
              className={styles.exportBtn}
              download
              aria-label={`Export ${counters.totalCount} calls to CSV`}
            >
              📥 Export CSV
            </a>
          ) : (
            <button
              type="button"
              className={styles.exportBtn}
              disabled
              aria-disabled="true"
              title="No voice calls in current timeframe to export"
              style={{ opacity: 0.5, cursor: 'not-allowed' }}
            >
              📥 Export CSV
            </button>
          )}
        </div>
      </header>

      {/* Texting setup strip, mirroring Messages and Text-to-Job */}
      <MessagingSetup
        setup={messagingSetup}
        openOnLoad={searchParams.setup === '1'}
        sharedPhoneNumber={process.env.SIGNALWIRE_FROM_NUMBER || '+19479412323'}
      />

      {/* Top 3 Navigation Tabs */}
      <nav className={styles.mainNavTabs} role="tablist" aria-label="AI Voice workspace views">
        <Link
          href={`/dashboard/voice-calls?view=inbox&dateRange=${currentDateRange}${searchParams.q ? `&q=${encodeURIComponent(searchParams.q)}` : ''}`}
          className={`${styles.mainNavTab} ${currentView === 'inbox' ? styles.mainNavTabActive : ''}`}
          role="tab"
          aria-selected={currentView === 'inbox'}
        >
          <span>📞 Call Inbox</span>
          {counters.unreviewed > 0 ? (
            <span className={styles.navBadge}>{counters.unreviewed}</span>
          ) : null}
        </Link>
        <Link
          href="/dashboard/voice-calls?view=simulator"
          className={`${styles.mainNavTab} ${currentView === 'simulator' ? styles.mainNavTabActive : ''}`}
          role="tab"
          aria-selected={currentView === 'simulator'}
        >
          <span>🎙️ Voice Simulator</span>
        </Link>
        <Link
          href={`/dashboard/voice-calls?view=analytics&dateRange=${currentDateRange}`}
          className={`${styles.mainNavTab} ${currentView === 'analytics' ? styles.mainNavTabActive : ''}`}
          role="tab"
          aria-selected={currentView === 'analytics'}
        >
          <span>📊 Analytics &amp; Health</span>
          {counters.emergencyCount > 0 ? (
            <span className={styles.navBadge} style={{ background: 'rgba(239, 68, 68, 0.25)', color: '#f87171' }}>
              {counters.emergencyCount} urgent
            </span>
          ) : null}
        </Link>
      </nav>

      {/* VIEW 1: CALL INBOX (Clean daily triage workspace) */}
      {currentView === 'inbox' && (
        <div className={styles.tabViewContent}>
          {/* Top Assistant Status Banner */}
          <VoiceStatusBanner
            status={(voiceSettings?.status as 'active' | 'paused' | 'off') || 'active'}
            answerMode={(voiceSettings?.answer_mode as 'always' | 'after_hours') || 'always'}
            dedicatedNumber={dedicatedNumber}
            isReady={isRouteReady}
            businessName={resolvedBusinessName}
            trade={account?.trade || null}
          />

          {/* Operational Call Inbox & Triage Hub */}
          <section aria-label="Call Inbox and Queue">
            {/* Top-Level Operational Counters */}
            <div className={styles.statsGrid} role="region" aria-label="Call statistics summary">
              <Link
                href={`/dashboard/voice-calls?view=inbox&tab=unreviewed&dateRange=${currentDateRange}`}
                className={`${styles.statCard} ${currentTab === 'unreviewed' ? styles.statActive : ''} ${counters.unreviewed > 0 ? styles.statAlert : ''}`}
                aria-current={currentTab === 'unreviewed' ? 'true' : undefined}
                aria-label={`Unreviewed calls: ${counters.unreviewed}`}
              >
                <span className={styles.statLabel}>Unreviewed</span>
                <span className={styles.statValue}>{counters.unreviewed}</span>
              </Link>
              <Link
                href={`/dashboard/voice-calls?view=inbox&tab=needs_callback&dateRange=${currentDateRange}`}
                className={`${styles.statCard} ${currentTab === 'needs_callback' ? styles.statActive : ''} ${counters.needsCallback > 0 ? styles.statWarning : ''}`}
                aria-current={currentTab === 'needs_callback' ? 'true' : undefined}
                aria-label={`Needs callback calls: ${counters.needsCallback}`}
              >
                <span className={styles.statLabel}>Needs Callback</span>
                <span className={styles.statValue}>{counters.needsCallback}</span>
              </Link>
              <Link
                href={`/dashboard/voice-calls?view=inbox&tab=urgent&dateRange=${currentDateRange}`}
                className={`${styles.statCard} ${currentTab === 'urgent' ? styles.statActive : ''} ${counters.urgent > 0 ? styles.statAlert : ''}`}
                aria-current={currentTab === 'urgent' ? 'true' : undefined}
                aria-label={`Urgent and emergency calls: ${counters.urgent}`}
              >
                <span className={styles.statLabel}>Urgent / Emergency</span>
                <span className={styles.statValue}>{counters.urgent}</span>
              </Link>
              <Link
                href={`/dashboard/voice-calls?view=inbox&tab=transferred&dateRange=${currentDateRange}`}
                className={`${styles.statCard} ${currentTab === 'transferred' ? styles.statActive : ''}`}
                aria-current={currentTab === 'transferred' ? 'true' : undefined}
                aria-label={`Transferred calls: ${counters.transferred}`}
              >
                <span className={styles.statLabel}>Transferred</span>
                <span className={styles.statValue}>{counters.transferred}</span>
              </Link>
              <Link
                href={`/dashboard/voice-calls?view=inbox&tab=all&dateRange=${currentDateRange}`}
                className={`${styles.statCard} ${currentTab === 'all' ? styles.statActive : ''}`}
                aria-current={currentTab === 'all' ? 'true' : undefined}
                aria-label={`Total calls in range: ${counters.totalCount}`}
              >
                <span className={styles.statLabel}>Total in Range</span>
                <span className={styles.statValue}>{counters.totalCount}</span>
              </Link>
            </div>

            {/* Date Range Selector Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', margin: '0.75rem 0 0.5rem' }}>
              <div className={styles.dateFilterGroup} role="group" aria-label="Filter calls by timeframe">
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
                ].map(([val, label]) => {
                  const isActive = currentDateRange === val;
                  return (
                    <Link
                      key={val}
                      href={`/dashboard/voice-calls?view=inbox&tab=${currentTab}&dateRange=${val}${searchParams.q ? `&q=${encodeURIComponent(searchParams.q)}` : ''}`}
                      className={`${styles.dateFilterBtn} ${isActive ? styles.dateFilterActive : ''}`}
                      aria-pressed={isActive}
                    >
                      {label}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Search and Tabs Toolbar */}
            <div className={styles.toolbar}>
              <div className={styles.filterTabs} role="tablist" aria-label="Call status filter tabs">
                {[
                  { id: 'all', label: 'All Calls', count: counters.totalCount },
                  { id: 'unreviewed', label: 'Unreviewed', count: counters.unreviewed },
                  { id: 'needs_callback', label: 'Needs Callback', count: counters.needsCallback },
                  { id: 'urgent', label: 'Urgent', count: counters.urgent },
                  { id: 'transferred', label: 'Transferred', count: counters.transferred },
                  { id: 'completed', label: 'Resolved', count: counters.resolvedCount },
                ].map((tab) => {
                  const isActive = currentTab === tab.id;
                  return (
                    <Link
                      key={tab.id}
                      href={`/dashboard/voice-calls?view=inbox&tab=${tab.id}&dateRange=${currentDateRange}`}
                      className={`${styles.tabBtn} ${isActive ? styles.tabActive : ''}`}
                      role="tab"
                      aria-selected={isActive}
                      aria-controls="call-queue-list"
                    >
                      {tab.label}
                      {tab.count > 0 ? ` (${tab.count})` : ''}
                    </Link>
                  );
                })}
              </div>

              <form method="GET" className={styles.searchRow} role="search" aria-label="Search voice calls">
                <input type="hidden" name="view" value="inbox" />
                <input type="hidden" name="tab" value={currentTab} />
                <input type="hidden" name="dateRange" value={currentDateRange} />
                <label htmlFor="voice-search-q" style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}>
                  Search voice calls
                </label>
                <input
                  id="voice-search-q"
                  type="search"
                  name="q"
                  defaultValue={searchParams.q || ''}
                  placeholder="Search by caller phone or keyword in summary..."
                  aria-label="Search by caller phone or keyword in summary"
                  className={styles.searchInput}
                />
              </form>
            </div>

            {/* Working Call Queue */}
            {items.length === 0 ? (
              <div className={styles.emptyState} role="status" aria-label="No calls found in current view">
                <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }} aria-hidden="true">
                  📭
                </span>
                <h3>No calls in this view</h3>
                <p>
                  {searchParams.q
                    ? `No voice calls matched "${searchParams.q}". Try clearing your search term.`
                    : currentTab !== 'all' || currentDateRange !== 'all'
                    ? 'No calls match the selected filter combination.'
                    : 'When the AI receptionist answers calls, they will appear in your working inbox with full transcripts and action items.'}
                </p>
                {(searchParams.q || currentTab !== 'all' || currentDateRange !== 'all') && (
                  <div style={{ marginTop: '1rem' }}>
                    <Link
                      href="/dashboard/voice-calls?view=inbox"
                      className={styles.actionBtnSecondary}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        padding: '6px 14px',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        textDecoration: 'none',
                        borderRadius: '6px',
                      }}
                    >
                      ✕ Reset All Filters
                    </Link>
                  </div>
                )}
              </div>
            ) : (
              <div id="call-queue-list" className={styles.queueList} role="region" aria-label="Call Queue List">
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
                          {call.callerNumber ? (
                            <a
                              href={`tel:${call.callerNumber}`}
                              className={styles.linkButton}
                              style={{
                                fontWeight: 600,
                                color: '#4ade80',
                                textDecoration: 'none',
                              }}
                              title={`Direct call ${call.callerNumber}`}
                            >
                              📞 Call Now
                            </a>
                          ) : null}
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
                            View Details &amp; Transcript →
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
          </section>
        </div>
      )}

      {/* VIEW 2: VOICE SIMULATOR (Interactive testing sandbox) */}
      {currentView === 'simulator' && (
        <div className={styles.tabViewContent}>
          {/* Top Assistant Status Banner */}
          <VoiceStatusBanner
            status={(voiceSettings?.status as 'active' | 'paused' | 'off') || 'active'}
            answerMode={(voiceSettings?.answer_mode as 'always' | 'after_hours') || 'always'}
            dedicatedNumber={dedicatedNumber}
            isReady={isRouteReady}
            businessName={resolvedBusinessName}
            trade={account?.trade || null}
          />

          <VoiceSimulatorSandbox
            companyName={resolvedBusinessName || 'Our Company'}
            trade={account?.trade || 'Contractor'}
            voiceTone={(voiceSettings?.voice_tone as string) || 'professional'}
            defaultOpen={true}
          />
        </div>
      )}

      {/* VIEW 3: ANALYTICS & HEALTH (Carrier telemetry, deep performance, hotline, capabilities) */}
      {currentView === 'analytics' && (
        <div className={styles.tabViewContent}>
          {/* Live Carrier SignalWire Engine & Webhook Latency Health Widget */}
          <VoiceHealthWidget availableCredits={hasAiBalance ? totalAiUnits : null} />

          {/* AI Voice Intelligence & Performance Analytics */}
          <section aria-label="AI Voice Performance Analytics">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff', margin: 0 }}>
                Performance Metrics &amp; Volume
              </h2>
              <div className={styles.dateFilterGroup} role="group" aria-label="Filter analytics by timeframe">
                {[
                  ['all', 'All Time'],
                  ['today', 'Today'],
                  ['yesterday', 'Yesterday'],
                  ['7d', 'Last 7 Days'],
                  ['30d', 'Last 30 Days'],
                  ['month', 'This Month'],
                ].map(([val, label]) => {
                  const isActive = currentDateRange === val;
                  return (
                    <Link
                      key={val}
                      href={`/dashboard/voice-calls?view=analytics&dateRange=${val}`}
                      className={`${styles.dateFilterBtn} ${isActive ? styles.dateFilterActive : ''}`}
                      aria-pressed={isActive}
                    >
                      {label}
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className={styles.analyticsGrid} role="region" aria-label="AI Voice Performance Analytics">
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
                <span className={styles.analyticsLabel}>Leads &amp; Quotes Created</span>
                <span className={styles.analyticsValue} style={{ color: counters.leadsGeneratedCount > 0 ? '#4ade80' : '#fff' }}>
                  {counters.leadsGeneratedCount}
                </span>
                <span className={styles.analyticsSubtext}>AI-originated opportunities</span>
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
          </section>

          {/* Contractor & Crew 2-Way Field Voice Hotline */}
          <ContractorHotlineShowcase dedicatedNumber={dedicatedNumber} />

          {/* Streamlined Assistant Capabilities & Safety Guards */}
          <VoiceCapabilitiesGrid />
        </div>
      )}
    </div>
  );
}
