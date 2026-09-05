import Link from 'next/link';
import { createAdminClient, requireOfficeContext } from '@/lib/auth';
import { loadVoiceRouteReadiness } from '@/lib/voice/route-readiness';
import {
  loadVoiceWorkspaceQueue,
  type VoiceCallOutcome,
  type VoiceCallDisposition,
} from '@/lib/voice/call-workspace';
import { formatCallLength } from '@/lib/voice/call-formatting';
import VoiceCallsLiveRefresher from './VoiceCallsLiveRefresher';
import { VoiceStatusBanner, VoiceCapabilitiesGrid, ContractorHotlineShowcase } from './VoiceControlsSection';
import VoiceSimulatorSandbox from './VoiceSimulatorSandbox';
import VoiceHealthWidget from './VoiceHealthWidget';
import VoiceCallQueueList from './VoiceCallQueueList';
import FieldIntakeHint from '@/components/field-intake-hint';
import MessagingSetup from '@/app/dashboard/messages/MessagingSetup';
import { loadMessagingSetup } from '@/lib/owner-sms';
import { displayPhone } from '@/lib/phone';
import { loadVoiceEntitlement } from '@/lib/voice/entitlement';
import { countOpenAiCalls } from '@/lib/voice/admission';
import { loadVerifiedPhoneOptions } from '@/lib/verified-phones';
import { getSiteContent } from '@/lib/site-content';
import AiReceptionistSection from '../settings/AiReceptionistSection';
import styles from './voice-calls.module.css';

export const metadata = { title: 'AI Voice Assistant | Receptionist & Call Triage' };

const VALID_VIEWS = ['inbox', 'simulator', 'analytics', 'settings'] as const;
const VALID_TABS = ['all', 'unreviewed', 'needs_callback', 'urgent', 'transferred', 'completed'] as const;
const VALID_RANGES = ['all', 'today', 'yesterday', '7d', '30d', 'month'] as const;
const VALID_DISPOSITIONS = [
  'all',
  'unreviewed',
  'needs_callback',
  'callback_scheduled',
  'contacted',
  'qualified',
  'converted',
  'not_a_fit',
  'spam',
  'resolved',
] as const;
const VALID_OUTCOMES = [
  'all',
  'ai_handled',
  'completed',
  'voicemail',
  'voicemail_fallback',
  'transfer_attempted',
  'transferred_and_answered',
  'transferred',
  'caller_abandoned',
  'no_input',
  'failed',
  'in_progress',
] as const;

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
    page?: string;
    setup?: string;
  }>;
}) {
  const searchParams = (await searchParamsPromise) || {};
  const { supabase, accountId } = await requireOfficeContext('leads.read');
  const admin = createAdminClient();

  const currentView = VALID_VIEWS.includes(searchParams.view as (typeof VALID_VIEWS)[number])
    ? (searchParams.view as (typeof VALID_VIEWS)[number])
    : 'inbox';
  const currentTab = VALID_TABS.includes(searchParams.tab as (typeof VALID_TABS)[number])
    ? (searchParams.tab as (typeof VALID_TABS)[number])
    : 'all';
  const currentDateRange = VALID_RANGES.includes(searchParams.dateRange as (typeof VALID_RANGES)[number])
    ? (searchParams.dateRange as (typeof VALID_RANGES)[number])
    : 'all';
  const currentDisposition = VALID_DISPOSITIONS.includes(searchParams.disposition as (typeof VALID_DISPOSITIONS)[number])
    ? (searchParams.disposition as (typeof VALID_DISPOSITIONS)[number])
    : 'all';
  const currentOutcome = VALID_OUTCOMES.includes(searchParams.outcome as (typeof VALID_OUTCOMES)[number])
    ? (searchParams.outcome as (typeof VALID_OUTCOMES)[number])
    : 'all';

  const currentPage = Math.max(1, parseInt(searchParams.page || '1', 10) || 1);
  const searchQuery = searchParams.q ? searchParams.q.trim() : undefined;

  // Wave 1: Fetch account, site, voice settings, usage balance, and entitlements
  const [
    { data: account },
    { data: site },
    voiceSettingsResult,
    { data: balanceRows },
    messagingSetup,
    voiceEntitlement,
    liveActiveCalls,
  ] = await Promise.all([
    supabase
      .from('accounts')
      .select('company_name, business_name, trade, phone, timezone, license_number, service_areas, call_tracking_number, call_forward_number, alert_phone')
      .eq('id', accountId)
      .maybeSingle(),
    supabase
      .from('sites')
      .select('id, company_name, subdomain, custom_domain, phone, content, published')
      .eq('account_id', accountId)
      .maybeSingle(),
    supabase
      .from('voice_settings')
      .select('status, answer_mode, greeting, transfer_number, voice_tone, business_hours')
      .eq('account_id', accountId)
      .maybeSingle(),
    supabase
      .from('workspace_usage_credit_balances')
      .select('resource_code, available_units')
      .eq('account_id', accountId),
    loadMessagingSetup(accountId),
    loadVoiceEntitlement(admin, accountId),
    countOpenAiCalls(admin, accountId, 10).catch(() => 0),
  ]);

  const timezone = (account?.timezone as string) || 'America/New_York';
  const voiceSettings = voiceSettingsResult?.error ? null : ((voiceSettingsResult?.data ?? null) as Record<string, unknown> | null);
  const voiceSettingsAvailable = Boolean(voiceSettingsResult && !voiceSettingsResult.error);
  if (voiceSettingsResult?.error) console.error('voice settings read failed:', voiceSettingsResult.error);

  // Wave 2: Fetch route readiness, filtered queue (with workspace timezone & entitlement historyDays),
  // and conditionally defer verified numbers to settings view only
  const [routeReadiness, queue, verifiedNumbers] = await Promise.all([
    loadVoiceRouteReadiness(admin, accountId),
    loadVoiceWorkspaceQueue(supabase, accountId, {
      tab: currentTab,
      dateRange: currentDateRange,
      query: searchQuery,
      disposition: currentDisposition as VoiceCallDisposition,
      outcome: currentOutcome as VoiceCallOutcome,
      page: currentPage,
      historyDays: voiceEntitlement?.historyDays,
      timezone,
    }),
    currentView === 'settings'
      ? loadVerifiedPhoneOptions(
          admin,
          accountId,
          voiceSettings?.transfer_number as string | null,
          account?.alert_phone as string | null,
        )
      : Promise.resolve([]),
  ]);

  const isRouteReady = routeReadiness.kind === 'ready';
  const voiceEntitlementAvailable = voiceEntitlement?.available === true;
  const voiceRouteState = routeReadiness.kind === 'ready'
    ? 'ready' as const
    : routeReadiness.kind === 'not_ready'
      ? routeReadiness.reason
      : 'unavailable' as const;
  const callForwardNumber = displayPhone(String(account?.call_forward_number ?? ''));

  // Dedicated voice number: requires actual phone number routing capability, NOT SMS-only number
  const dedicatedNumber = (routeReadiness.kind === 'ready' && routeReadiness.number)
    || (routeReadiness.kind === 'not_ready' && routeReadiness.number)
    || account?.call_tracking_number
    || null;

  const aiIntakeUnits = balanceRows?.find((r) => r.resource_code === 'ai_intake_threads')?.available_units;
  const aiWritingUnits = balanceRows?.find((r) => r.resource_code === 'ai_writing_drafts')?.available_units;
  const hasAiBalance = typeof aiIntakeUnits === 'number' || typeof aiWritingUnits === 'number';

  const resolvedBusinessName = site?.company_name || account?.business_name || account?.company_name || null;
  const siteContent = site ? getSiteContent(site.content as Record<string, unknown> | null) : null;
  const sitePhonePublic = siteContent ? siteContent.phonePublic : false;
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';
  const siteUrl = site?.custom_domain
    ? `https://${site.custom_domain}`
    : site?.subdomain
      ? `https://${site.subdomain}.${rootDomain}`
      : null;
  const siteLocalPreviewUrl = site?.subdomain ? `/site/${site.subdomain}` : null;

  const { counters, items } = queue;

  // AI resolution rate: answered calls handled without transfer
  const answeredCount = counters.answeredCount > 0 ? counters.answeredCount : counters.totalCount;
  const handledRate = answeredCount > 0
    ? Math.round((counters.handledCount / answeredCount) * 100)
    : 0;

  // URL helper that preserves all active filters across tabs and views
  const buildUrl = (overrides: {
    view?: string;
    tab?: string;
    dateRange?: string;
    disposition?: string;
    outcome?: string;
    q?: string | null;
    page?: number | null;
  }) => {
    const params = new URLSearchParams();
    const view = overrides.view ?? currentView;
    const tab = overrides.tab ?? currentTab;
    const dateRange = overrides.dateRange ?? currentDateRange;
    const disposition = overrides.disposition ?? currentDisposition;
    const outcome = overrides.outcome ?? currentOutcome;
    const q = overrides.q !== undefined ? overrides.q : searchQuery;
    const page = overrides.page !== undefined ? overrides.page : (currentPage > 1 ? currentPage : null);

    if (view) params.set('view', view);
    if (tab && tab !== 'all') params.set('tab', tab);
    if (dateRange && dateRange !== 'all') params.set('dateRange', dateRange);
    if (disposition && disposition !== 'all') params.set('disposition', disposition);
    if (outcome && outcome !== 'all') params.set('outcome', outcome);
    if (q) params.set('q', q);
    if (page && page > 1) params.set('page', page.toString());

    return `/dashboard/voice-calls?${params.toString()}`;
  };

  // Export URL preserving active query parameters
  const exportUrlParams = new URLSearchParams();
  if (currentDateRange !== 'all') exportUrlParams.set('dateRange', currentDateRange);
  if (currentTab !== 'all') exportUrlParams.set('tab', currentTab);
  if (searchQuery) exportUrlParams.set('q', searchQuery);
  if (currentDisposition !== 'all') exportUrlParams.set('disposition', currentDisposition);
  if (currentOutcome !== 'all') exportUrlParams.set('outcome', currentOutcome);
  const exportCsvUrl = `/api/voice/export?${exportUrlParams.toString()}`;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <h1>AI Voice Assistant</h1>
          <p>24/7 AI Receptionist, live in-call booking controls, and operational call triage inbox.</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <FieldIntakeHint page="voice" />

          {/* Separated AI Credit SKUs: Intake vs Writing */}
          {hasAiBalance ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.75rem', background: 'var(--bg-card, rgba(255,255,255,0.04))', border: '1px solid var(--rule-t12, rgba(255,255,255,0.08))', borderRadius: '6px', fontSize: '0.8125rem', color: (typeof aiIntakeUnits === 'number' && aiIntakeUnits <= 25) ? 'var(--amber-10, #f59e0b)' : 'var(--text-secondary, #94a3b8)', fontWeight: 500 }}>
              <span>⚡ <strong>{typeof aiIntakeUnits === 'number' ? aiIntakeUnits.toLocaleString('en-US') : 0}</strong> intake units</span>
              <span style={{ opacity: 0.5 }}>|</span>
              <span><strong>{typeof aiWritingUnits === 'number' ? aiWritingUnits.toLocaleString('en-US') : 0}</strong> draft units</span>
              {(typeof aiIntakeUnits === 'number' && aiIntakeUnits <= 25) ? (
                <Link href="/dashboard/settings#buy-credits" style={{ color: 'var(--amber-11, #d97706)', fontWeight: 600, textDecoration: 'underline', marginLeft: '0.25rem' }}>
                  Low Balance • Top up
                </Link>
              ) : null}
            </div>
          ) : null}

          {counters.totalCount > 0 ? (
            <a
              href={exportCsvUrl}
              className={styles.exportBtn}
              download="voice-calls.csv"
              aria-label={`Export ${counters.totalCount} calls to CSV`}
            >
              <span aria-hidden="true">📥</span> Export CSV
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
              <span aria-hidden="true">📥</span> Export CSV
            </button>
          )}
        </div>
      </header>

      {/* Entitlement Alert Banner if disabled */}
      {voiceEntitlement && !voiceEntitlement.enabled && (
        <div className={styles.entitlementAlertBanner} role="alert">
          <div>
            <strong>AI Receptionist Inactive:</strong> Your current plan does not include 24/7 AI call answering.
          </div>
          <Link href="/dashboard/settings#billing" className={styles.actionBtnSecondary}>
            Manage Plan &amp; Upgrades →
          </Link>
        </div>
      )}

      {/* Dedicated 2-Way Number strip */}
      <MessagingSetup
        setup={messagingSetup}
        openOnLoad={searchParams.setup === '1'}
        sharedPhoneNumber={process.env.SIGNALWIRE_FROM_NUMBER || '+19479412323'}
        title="Dedicated 2-Way Number"
        subtitle="Your shared phone line for AI voice and customer texting"
      />

      {/* Top 4 Navigation Tabs */}
      <nav className={styles.mainNavTabs} role="tablist" aria-label="AI Voice workspace views">
        <Link
          id="tab-inbox"
          href={buildUrl({ view: 'inbox' })}
          className={`${styles.mainNavTab} ${currentView === 'inbox' ? styles.mainNavTabActive : ''}`}
          role="tab"
          aria-selected={currentView === 'inbox'}
          aria-controls="tabpanel-inbox"
        >
          <span><span aria-hidden="true">📞</span> Call Inbox</span>
          {counters.unreviewed > 0 ? (
            <span className={styles.navBadge}>{counters.unreviewed}</span>
          ) : null}
        </Link>
        <Link
          id="tab-simulator"
          href={buildUrl({ view: 'simulator' })}
          className={`${styles.mainNavTab} ${currentView === 'simulator' ? styles.mainNavTabActive : ''}`}
          role="tab"
          aria-selected={currentView === 'simulator'}
          aria-controls="tabpanel-simulator"
        >
          <span><span aria-hidden="true">🎙️</span> Voice Simulator</span>
        </Link>
        <Link
          id="tab-analytics"
          href={buildUrl({ view: 'analytics' })}
          className={`${styles.mainNavTab} ${currentView === 'analytics' ? styles.mainNavTabActive : ''}`}
          role="tab"
          aria-selected={currentView === 'analytics'}
          aria-controls="tabpanel-analytics"
        >
          <span><span aria-hidden="true">📊</span> Analytics &amp; Health</span>
          {counters.emergencyCount > 0 ? (
            <span className={styles.navBadge} style={{ background: 'rgba(239, 68, 68, 0.25)', color: 'var(--red-11, #f87171)' }}>
              {counters.emergencyCount} urgent
            </span>
          ) : null}
        </Link>
        <Link
          id="tab-settings"
          href={buildUrl({ view: 'settings' })}
          className={`${styles.mainNavTab} ${currentView === 'settings' ? styles.mainNavTabActive : ''}`}
          role="tab"
          aria-selected={currentView === 'settings'}
          aria-controls="tabpanel-settings"
        >
          <span><span aria-hidden="true">⚙️</span> Receptionist Settings</span>
        </Link>
      </nav>

      {/* VIEW 1: CALL INBOX (Clean daily triage workspace) */}
      {currentView === 'inbox' && (
        <div id="tabpanel-inbox" role="tabpanel" aria-labelledby="tab-inbox" className={styles.tabViewContent}>
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
                href={buildUrl({ tab: 'unreviewed', page: null })}
                className={`${styles.statCard} ${currentTab === 'unreviewed' ? styles.statActive : ''} ${counters.unreviewed > 0 ? styles.statAlert : ''}`}
                aria-current={currentTab === 'unreviewed' ? 'page' : undefined}
                aria-label={`Unreviewed calls: ${counters.unreviewed}`}
              >
                <span className={styles.statLabel}>Unreviewed</span>
                <span className={styles.statValue}>{counters.unreviewed}</span>
              </Link>
              <Link
                href={buildUrl({ tab: 'needs_callback', page: null })}
                className={`${styles.statCard} ${currentTab === 'needs_callback' ? styles.statActive : ''} ${counters.needsCallback > 0 ? styles.statWarning : ''}`}
                aria-current={currentTab === 'needs_callback' ? 'page' : undefined}
                aria-label={`Needs callback calls: ${counters.needsCallback}`}
              >
                <span className={styles.statLabel}>Needs Callback</span>
                <span className={styles.statValue}>{counters.needsCallback}</span>
              </Link>
              <Link
                href={buildUrl({ tab: 'urgent', page: null })}
                className={`${styles.statCard} ${currentTab === 'urgent' ? styles.statActive : ''} ${counters.urgent > 0 ? styles.statAlert : ''}`}
                aria-current={currentTab === 'urgent' ? 'page' : undefined}
                aria-label={`Urgent and emergency calls: ${counters.urgent}`}
              >
                <span className={styles.statLabel}>Urgent / Emergency</span>
                <span className={styles.statValue}>{counters.urgent}</span>
              </Link>
              <Link
                href={buildUrl({ tab: 'transferred', page: null })}
                className={`${styles.statCard} ${currentTab === 'transferred' ? styles.statActive : ''}`}
                aria-current={currentTab === 'transferred' ? 'page' : undefined}
                aria-label={`Transferred calls: ${counters.transferred}`}
              >
                <span className={styles.statLabel}>Transferred</span>
                <span className={styles.statValue}>{counters.transferred}</span>
              </Link>
              <Link
                href={buildUrl({ tab: 'all', page: null })}
                className={`${styles.statCard} ${currentTab === 'all' ? styles.statActive : ''}`}
                aria-current={currentTab === 'all' ? 'page' : undefined}
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
                      href={buildUrl({ dateRange: val, page: null })}
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
                      href={buildUrl({ tab: tab.id, page: null })}
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

              {/* Search & Dropdown Filters Bar */}
              <form method="GET" className={styles.searchRow} role="search" aria-label="Search and filter voice calls">
                <input type="hidden" name="view" value="inbox" />
                {currentTab !== 'all' && <input type="hidden" name="tab" value={currentTab} />}
                {currentDateRange !== 'all' && <input type="hidden" name="dateRange" value={currentDateRange} />}

                <div className={styles.searchInputWrapper}>
                  <label htmlFor="voice-search-q" className={styles.visuallyHidden}>
                    Search voice calls
                  </label>
                  <input
                    id="voice-search-q"
                    type="search"
                    name="q"
                    defaultValue={searchQuery || ''}
                    placeholder="Search by caller phone or keyword in summary..."
                    aria-label="Search by caller phone or keyword in summary"
                    className={styles.searchInput}
                  />
                  {searchQuery ? (
                    <Link
                      href={buildUrl({ q: null, page: null })}
                      className={styles.searchClearBtn}
                      title="Clear search"
                      aria-label="Clear search"
                    >
                      ✕
                    </Link>
                  ) : null}
                </div>

                <div className={styles.filterControlsRow}>
                  <label htmlFor="voice-disposition-filter" className={styles.visuallyHidden}>
                    Filter by disposition
                  </label>
                  <select
                    id="voice-disposition-filter"
                    name="disposition"
                    defaultValue={currentDisposition}
                    className={styles.filterSelect}
                    aria-label="Filter by disposition"
                  >
                    <option value="all">All Dispositions</option>
                    <option value="unreviewed">Unreviewed</option>
                    <option value="needs_callback">Needs Callback</option>
                    <option value="callback_scheduled">Callback Scheduled</option>
                    <option value="contacted">Contacted</option>
                    <option value="qualified">Qualified</option>
                    <option value="converted">Converted</option>
                    <option value="not_a_fit">Not a Fit</option>
                    <option value="spam">Spam</option>
                    <option value="resolved">Resolved</option>
                  </select>

                  <label htmlFor="voice-outcome-filter" className={styles.visuallyHidden}>
                    Filter by outcome
                  </label>
                  <select
                    id="voice-outcome-filter"
                    name="outcome"
                    defaultValue={currentOutcome}
                    className={styles.filterSelect}
                    aria-label="Filter by outcome"
                  >
                    <option value="all">All Outcomes</option>
                    <option value="ai_handled">AI Handled</option>
                    <option value="completed">Completed</option>
                    <option value="transfer_attempted">Transfer Attempted</option>
                    <option value="transferred">Transferred</option>
                    <option value="voicemail">Voicemail</option>
                    <option value="caller_abandoned">Caller Abandoned</option>
                    <option value="no_input">No Input</option>
                    <option value="in_progress">In Progress</option>
                  </select>

                  <button type="submit" className={styles.searchSubmitBtn}>
                    Search
                  </button>
                </div>
              </form>
            </div>

            {/* Working Call Queue or Error State */}
            <div id="call-queue-list">
              {!queue.available ? (
                <div className={styles.errorState} role="alert" aria-live="assertive">
                  <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }} aria-hidden="true">
                    ⚠️
                  </span>
                  <h3>Unable to load call history</h3>
                  <p>
                    We encountered a temporary issue communicating with the voice database. Please refresh or try again in a few moments.
                  </p>
                  <div style={{ marginTop: '1rem' }}>
                    <Link href="/dashboard/voice-calls" className={styles.actionBtnSecondary}>
                      ↻ Retry
                    </Link>
                  </div>
                </div>
              ) : (
                <VoiceCallQueueList
                  items={items}
                  timezone={timezone}
                  currentTab={currentTab}
                  currentDateRange={currentDateRange}
                  currentDisposition={currentDisposition}
                  currentOutcome={currentOutcome}
                  searchQuery={searchQuery}
                  totalFiltered={queue.totalFiltered}
                  currentPage={currentPage}
                  pageSize={queue.pageSize}
                />
              )}
            </div>

            {/* Live Polling & Focus-Regained Refresher */}
            <VoiceCallsLiveRefresher
              hasActiveCalls={items.some((i) => i.isProvisional || i.outcome === 'in_progress')}
            />
          </section>
        </div>
      )}

      {/* VIEW 2: VOICE SIMULATOR (Interactive testing sandbox) */}
      {currentView === 'simulator' && (
        <div id="tabpanel-simulator" role="tabpanel" aria-labelledby="tab-simulator" className={styles.tabViewContent}>
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
        <div id="tabpanel-analytics" role="tabpanel" aria-labelledby="tab-analytics" className={styles.tabViewContent}>
          {/* Live Carrier SignalWire Engine & Webhook Latency Health Widget */}
          <VoiceHealthWidget availableCredits={hasAiBalance ? (aiIntakeUnits ?? null) : null} />

          {/* AI Voice Intelligence & Performance Analytics */}
          <section aria-label="AI Voice Performance Analytics">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text, #fff)', margin: 0 }}>
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
                      href={buildUrl({ view: 'analytics', dateRange: val })}
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
                <span className={styles.analyticsSubtext}>
                  {counters.handledCount} of {answeredCount} answered calls handled without transfer
                </span>
              </div>

              <div className={styles.analyticsCard}>
                <span className={styles.analyticsLabel}>Leads &amp; Quotes Created</span>
                <span className={styles.analyticsValue} style={{ color: counters.leadsGeneratedCount > 0 ? 'var(--green-10, #22c55e)' : 'var(--text, #fff)' }}>
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
                <span className={styles.analyticsValue} style={{ color: counters.emergencyCount > 0 ? 'var(--red-10, #ef4444)' : 'var(--text, #fff)' }}>
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

      {/* VIEW 4: RECEPTIONIST SETTINGS */}
      {currentView === 'settings' && (
        <div id="tabpanel-settings" role="tabpanel" aria-labelledby="tab-settings" className={styles.tabViewContent}>
          <VoiceStatusBanner
            status={(voiceSettings?.status as 'active' | 'paused' | 'off') || 'active'}
            answerMode={(voiceSettings?.answer_mode as 'always' | 'after_hours') || 'always'}
            dedicatedNumber={dedicatedNumber}
            isReady={isRouteReady}
            businessName={resolvedBusinessName}
            trade={account?.trade || null}
            hideConfigButton
          />

          <div style={{ maxWidth: '1280px', width: '100%', margin: '0 auto' }}>
            <AiReceptionistSection
              status={(voiceSettings?.status as 'off' | 'active' | 'paused') ?? 'off'}
              answerMode={(voiceSettings?.answer_mode as 'always' | 'after_hours') ?? 'always'}
              greeting={(voiceSettings?.greeting as string | null) ?? ''}
              transferNumber={(voiceSettings?.transfer_number as string | null) ?? ''}
              alertPhone={(account?.alert_phone as string | null) ?? ''}
              verifiedNumbers={verifiedNumbers}
              callForwardNumber={callForwardNumber}
              voiceTone={(voiceSettings?.voice_tone as 'friendly' | 'professional' | 'urgent_dispatcher') ?? 'professional'}
              businessHours={(voiceSettings?.business_hours ?? {}) as Record<string, [string, string] | null>}
              timezone={timezone}
              entitled={voiceEntitlement?.enabled ?? false}
              entitlementAvailable={voiceEntitlementAvailable}
              settingsAvailable={voiceSettingsAvailable}
              routeState={voiceRouteState}
              concurrentCalls={voiceEntitlement?.concurrentCalls ?? 3}
              activeCalls={liveActiveCalls ?? 0}
              planName={voiceEntitlement?.planCode ? (voiceEntitlement.planCode.charAt(0).toUpperCase() + voiceEntitlement.planCode.slice(1)) : 'Solo'}
              sitePhonePublic={sitePhonePublic}
              sitePhone={site?.phone ?? null}
              dedicatedNumber={dedicatedNumber}
              siteSubdomain={site?.subdomain ?? null}
              siteUrl={siteUrl}
              siteLocalPreviewUrl={siteLocalPreviewUrl}
              sitePublished={site?.published ?? false}
            />
          </div>
        </div>
      )}
    </div>
  );
}
