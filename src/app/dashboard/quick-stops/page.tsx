import { requireOfficeContext, createAdminClient } from '@/lib/auth';
import { listQuickStopRequests } from '@/lib/quick-stop-requests';
import { sweepQuickStopOffers } from '@/lib/quick-stop-sweep';
import { quickStopSettingsFromAccount, QUICK_STOP_SETTINGS_COLUMNS, QUICK_STOP_TERMINAL_STATUSES } from '@/lib/quick-stop';
import { computeQuickStopRoute, lastKnownWorkPoint, loadMultiDayRouteStops } from '@/lib/quick-stop-route';
import QuickStopCoverageMap from './QuickStopCoverageMap';
import QuickStopAreas from './QuickStopAreas';
import { loadPriorityZones, priorityZonesAvailable } from '@/lib/quick-stop-zones-data';
import { createLeadPhotoUrls } from '@/lib/lead-photo-storage';
import QuickStopRequestCard, { type CardRequest } from './QuickStopRequestCard';
import QuickStopExplainer from './QuickStopExplainer';
import QuickStopStatus, { QuickStopHead } from './QuickStopStatus';
import QuickStopConfigurator from './QuickStopConfigurator';
import QuickStopCandidates from './QuickStopCandidates';
import QuickStopTabs from './QuickStopTabs';
import {
  CANDIDATE_QUERY_LIMIT,
  customerWords,
  screenQuickStopCandidates,
  type CandidateInput,
} from '@/lib/quick-stop-candidates';
import { loadScreeningSummary } from '@/lib/quick-stop-screenings';
import { loadRecipients, matchesAudience } from '@/lib/campaigns';
import { loadRefundTiers } from '@/lib/quick-stop-refunds';
import { quickStopState, quickStopStateDetail, quickStopStateHeadline } from '@/lib/quick-stop-state';
import { normalizeQuickStopTab } from '@/lib/quick-stop-tabs';

/** How far back the demand panel looks. A quarter is enough to be a pattern. */
const DEMAND_WINDOW_DAYS = 90;

const LEAD_SOURCE_LABEL: Record<string, string> = {
  website_form: 'Website lead',
  missed_call: 'Missed call',
  ai_voice: 'AI receptionist',
  manual: 'Added by you',
  referral: 'Referral',
};

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// "Mon – Fri" when the days are a run, "Mon, Wed, Fri" when they aren't. A
// seven-item list where a range would do is the kind of thing that makes a
// summary card unreadable at a glance.
function weekdayLabel(days: number[]): string {
  if (days.length === 0) return 'None';
  if (days.length === 7) return 'Every day';
  const sorted = [...days].sort((a, b) => a - b);
  const consecutive = sorted.every((day, index) => index === 0 || day === sorted[index - 1] + 1);
  if (consecutive && sorted.length > 2) return `${WEEKDAY_SHORT[sorted[0]]} – ${WEEKDAY_SHORT[sorted[sorted.length - 1]]}`;
  return sorted.map((day) => WEEKDAY_SHORT[day]).join(', ');
}

function clockLabel(hhmm: string): string {
  const [hours, minutes] = hhmm.split(':').map(Number);
  if (!Number.isFinite(hours)) return hhmm;
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return minutes ? `${hour12}:${String(minutes).padStart(2, '0')} ${period}` : `${hour12} ${period}`;
}

function money(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

export const dynamic = 'force-dynamic';

/* The tab said "Let's Get Quoted — Contractor websites that get you paid…" —
   the marketing site's default, inherited because this page never set one. Two
   dashboard tabs open side by side were indistinguishable, and a bookmark of
   this page was named after the homepage. */
export const metadata = { title: 'Quick Stops' };

export default async function QuickStopsPage({ searchParams }: { searchParams: { tab?: string } }) {
  const { supabase, accountId } = await requireOfficeContext('schedule.write');

  // Lazy expiry so the queue is current even between cron runs (releases lapsed
  // payment holds, closes unanswered requests). Best-effort — never blocks render.
  await sweepQuickStopOffers(createAdminClient(), accountId).catch(() => undefined);

  const [{ data: accountRow }, requests, { data: site }] = await Promise.all([
    supabase.from('accounts').select(`${QUICK_STOP_SETTINGS_COLUMNS}, extra_stop_lock_reason, timezone, instant_book_drive_time, connect_onboarded, business_name`).eq('id', accountId).single(),
    listQuickStopRequests(supabase, accountId, { limit: 100 }),
    supabase.from('sites').select('published, subdomain, company_name').eq('account_id', accountId).maybeSingle(),
  ]);
  const settings = quickStopSettingsFromAccount(accountRow as Parameters<typeof quickStopSettingsFromAccount>[0]);
  const lockReason = (accountRow as { extra_stop_lock_reason?: string } | null)?.extra_stop_lock_reason || '';
  const timezone = (accountRow as { timezone?: string } | null)?.timezone || 'America/New_York';
  const driveTime = Boolean((accountRow as { instant_book_drive_time?: boolean } | null)?.instant_book_drive_time);

  const terminal = new Set<string>([...QUICK_STOP_TERMINAL_STATUSES, 'disputed']);
  const active = requests.filter((r) => !terminal.has(r.status));
  const history = requests.filter((r) => terminal.has(r.status));

  // For active requests: route only where an offer is still being decided; photos
  // for all so the contractor can see the job. (A handful of live requests.)
  const activeCards = await Promise.all(
    active.map(async (r) => {
      const offerable = r.status === 'awaiting_contractor' || r.status === 'more_information_requested';
      const target = r.lat != null && r.lng != null ? { lat: Number(r.lat), lng: Number(r.lng) } : null;
      // The day THEY asked for, not today. Routing a tomorrow request against
      // today's stops answers a question nobody asked and can talk the owner out
      // of a job that fits perfectly well tomorrow.
      const route = offerable
        ? await computeQuickStopRoute(supabase, accountId, target, {
            arrivalDate: r.requested_date ?? r.arrival_date ?? null,
            visitMinutes: r.ai_visit_minutes,
            driveTime,
            timezone,
          })
        : null;
      const photoUrls = r.photo_paths?.length ? await createLeadPhotoUrls(accountId, r.photo_paths).catch(() => []) : [];
      return { r, route, photoUrls };
    }),
  );

  // For the explainer's setup checklist — real state, not decoration.
  const stripeConnected = Boolean((accountRow as { connect_onboarded?: boolean } | null)?.connect_onboarded);
  const refundTiers = await loadRefundTiers(supabase, accountId);
  const appOrigin = (process.env.NEXT_PUBLIC_APP_URL || `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com'}`).replace(/\/$/, '');
  const bookingUrl = site?.published && site?.subdomain ? `${appOrigin}/book/${site.subdomain}` : null;
  /**
   * What state is Quick Stops in? ONE answer, shared by every surface.
   *
   * The switch is one of five conditions, not the whole answer, and anything
   * that reports readiness has to ask this rather than `settings.enabled` — the
   * empty-requests panel below used to congratulate an owner who had turned the
   * switch on and set up nothing.
   *
   * This page, the status block, the footer, the explainer and the nav-rail API
   * each had their own version of that rule, and they disagreed on screen. See
   * lib/quick-stop-state for what each of them got wrong.
   */
  const state = quickStopState({
    enabled: settings.enabled,
    locked: settings.locked,
    lockedUntil: settings.lockedUntil,
    lockReason,
    feeSet: settings.maxFeeCents > 0,
    daysSet: settings.weekdays.length > 0,
    stripeConnected,
    hasBookingUrl: Boolean(bookingUrl),
    maxPerDay: settings.maxPerDay,
  });
  const quickStopLive = state.kind === 'on';
  /**
   * The pitch opens by itself on a genuinely untouched account, and nowhere
   * else: setup not started, the switch never flipped, and nothing has ever
   * come in. That version of the page is short anyway — no requests, an empty
   * map — so the height complaint this fold answers is not about it. Every
   * other state gets a closed drawer.
   */
  const openPitch = state.kind === 'setup_incomplete' && !state.switchOn && requests.length === 0;
  const businessName =
    (site?.company_name as string) || (accountRow as { business_name?: string } | null)?.business_name || 'Your business';

  // Their own recent work, run through the same deterministic screen a live
  // request gets. Both tables, because a lead carries the customer's own words
  // and a job carries the owner's — and the screener wants whichever exists.
  const sinceIso = new Date(Date.now() - DEMAND_WINDOW_DAYS * 86400000).toISOString();
  const [{ data: recentLeads }, { data: recentJobs }, { data: quickStopJobRows }] = await Promise.all([
    supabase
      .from('leads')
      // converted_job is in the ORIGINAL create table (schema.sql:1130), not a
      // later alter, so naming it here cannot fail on any live database. It is
      // what stops a lead and the job it became being counted as two pieces of
      // work — which online booking manufactures on every single booking, since
      // it writes both rows for one customer action and links them.
      .select('id, name, email, phone, message, project_type, estimated_hours, source, created_at, converted_job')
      .eq('account_id', accountId)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(CANDIDATE_QUERY_LIMIT),
    supabase
      .from('jobs')
      .select('id, ref, client_name, client_email, client_phone, scope, estimated_hours, created_at, status')
      .eq('account_id', accountId)
      .neq('status', 'archived')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(CANDIDATE_QUERY_LIMIT),
    // The jobs that exist BECAUSE a Quick Stop was accepted (actions.ts creates
    // them and links them back here). Each one is under the visit limit and
    // breaks no rule by construction, so every one of them was being shown back
    // as a Quick Stop the owner had MISSED — and priced again, on top of the fee
    // it actually earned. Matched on the id and never on the "Quick Stop — "
    // scope prefix, so renaming a job cannot bring the double count back.
    // Deliberately unbounded by date: an older request can own a recent job.
    supabase
      .from('extra_stop_requests')
      .select('job_id')
      .eq('account_id', accountId)
      .not('job_id', 'is', null)
      .limit(1000),
  ]);
  const quickStopJobIds = ((quickStopJobRows ?? []) as { job_id: string | null }[])
    .map((row) => row.job_id)
    .filter((id): id is string => Boolean(id));

  type LeadCandidateRow = {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    message: string | null;
    project_type: string | null;
    estimated_hours: number | null;
    source: string;
    created_at: string;
    converted_job: string | null;
  };

  type JobCandidateRow = {
    id: string;
    ref: string;
    client_name: string;
    client_email: string | null;
    client_phone: string | null;
    scope: string | null;
    estimated_hours: number | null;
    created_at: string;
  };

  const candidateInputs: CandidateInput[] = [
    ...((recentLeads ?? []) as LeadCandidateRow[]).map(
      (lead) => ({
        id: lead.id,
        source: 'lead' as const,
        label: LEAD_SOURCE_LABEL[lead.source] ?? 'Lead',
        clientName: lead.name || 'Unnamed lead',
        clientEmail: lead.email,
        clientPhone: lead.phone,
        convertedJobId: lead.converted_job,
        text: [lead.project_type, customerWords(lead.message)].filter(Boolean).join(' — '),
        createdAt: lead.created_at,
        estimatedHours: lead.estimated_hours == null ? null : Number(lead.estimated_hours),
        href: `/dashboard/leads/${lead.id}`,
      }),
    ),
    ...((recentJobs ?? []) as JobCandidateRow[]).map(
      (job) => ({
        id: job.id,
        source: 'job' as const,
        label: job.ref,
        ref: job.ref,
        clientName: job.client_name,
        clientEmail: job.client_email,
        clientPhone: job.client_phone,
        text: job.scope ?? '',
        createdAt: job.created_at,
        estimatedHours: job.estimated_hours == null ? null : Number(job.estimated_hours),
        href: `/dashboard/jobs/${job.id}`,
      }),
    ),
  ];
  const demand = screenQuickStopCandidates(candidateInputs, {
    maxVisitMinutes: settings.maxVisitMinutes,
    quickStopJobIds,
  });
  // The other half of demand: people who actually asked, including the ones the
  // screener refused. Empty (and harmless) until the migration has run.
  const screenings = await loadScreeningSummary(supabase, accountId, sinceIso);
  // How many past customers could actually be told. Counted the same way the
  // campaign composer counts them, so the two screens can't disagree.
  const reachable = (await loadRecipients(supabase, accountId).catch(() => []))
    .filter((recipient) => matchesAudience(recipient, 'past', Date.now()) && (recipient.emailReady || recipient.smsReady))
    .length;

  const defaults = {
    earliest: settings.earliestTime,
    latest: settings.latestEnd,
    minFeeDollars: Math.round(settings.minFeeCents / 100),
    maxFeeDollars: Math.round(settings.maxFeeCents / 100),
  };

  // Requests already accepted onto today, for the summary card.
  const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: timezone });
  const acceptedToday = requests.filter(
    (r) => r.arrival_date === todayKey && ['confirmed', 'en_route', 'arrived', 'completed'].includes(r.status),
  ).length;

  // Multi-day route loader covering up to settings.daysAhead (or 7 days max)
  const daysWindow: Array<{ key: string; label: string; weekdayName: string }> = [];
  const dayDate = new Date();
  for (let offset = 0; offset <= Math.min(settings.daysAhead, 7); offset++) {
    const current = new Date(dayDate);
    current.setDate(dayDate.getDate() + offset);
    const key = current.toLocaleDateString('en-CA', { timeZone: timezone });
    const weekdayShort = current.toLocaleDateString('en-US', { timeZone: timezone, weekday: 'short' });
    const label = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : weekdayShort;
    daysWindow.push({ key, label, weekdayName: weekdayShort });
  }

  const multiDayStops = await loadMultiDayRouteStops(supabase, accountId, {
    days: daysWindow.map((d) => d.key),
    timezone,
  });
  const routeStops = multiDayStops[todayKey] ?? [];

  // Empty until the migration is applied — the map then draws the plain limit.
  const priorityZones = await loadPriorityZones(supabase, accountId);
  const zonesAvailable = await priorityZonesAvailable(supabase, accountId);
  const fallbackCenter = routeStops.length > 0 ? null : await lastKnownWorkPoint(supabase, accountId);
  const coverageEmpty =
    settings.maxDetourMiles <= 0
      ? 'No detour limit is set yet, so there is nothing to draw. Set one below and this fills in.'
      : routeStops.length === 0
        ? 'Nothing geocoded on today’s schedule yet. Once today has scheduled work with an address, this shows exactly where a Quick Stop could land.'
        : null;

  // Realized Performance & Results Metrics for Insights
  const offersSentCount = requests.filter(
    (r) =>
      r.offer_sent_at ||
      ['contractor_offer_sent', 'awaiting_customer_payment', 'confirmed', 'en_route', 'arrived', 'completed'].includes(
        r.status,
      ),
  ).length;
  const confirmedCount = requests.filter((r) =>
    ['confirmed', 'en_route', 'arrived', 'completed'].includes(r.status),
  ).length;
  const conversionRate = offersSentCount > 0 ? Math.round((confirmedCount / offersSentCount) * 100) : 0;
  const totalRevenueCents = requests
    .filter((r) => ['confirmed', 'en_route', 'arrived', 'completed'].includes(r.status))
    .reduce((sum, r) => sum + (r.fee_cents ?? 0) + (r.diagnostic_fee_cents ?? 0), 0);
  const detourValues = requests.map((r) => r.detour_miles).filter((d): d is number => d != null && d >= 0);
  const avgDetourMiles =
    detourValues.length > 0 ? Math.round((detourValues.reduce((a, b) => a + b, 0) / detourValues.length) * 10) / 10 : null;

  const responseTimeMinutes = requests
    .filter((r) => r.created_at && r.offer_sent_at)
    .map((r) => (new Date(r.offer_sent_at!).getTime() - new Date(r.created_at).getTime()) / 60000)
    .filter((m) => m >= 0);
  const medianResponseMinutes =
    responseTimeMinutes.length > 0
      ? Math.round(responseTimeMinutes.sort((a, b) => a - b)[Math.floor(responseTimeMinutes.length / 2)])
      : null;

  const resultsMetrics = {
    totalRequests: requests.length,
    offersSent: offersSentCount,
    confirmedCount,
    conversionRate,
    totalRevenueCents,
    medianResponseMinutes,
    avgDetourMiles,
  };

  const todayPanel = (
    <>
      <QuickStopStatus
        enabled={settings.enabled}
        locked={settings.locked}
        lockedUntil={settings.lockedUntil}
        lockReason={lockReason}
        feeSet={settings.maxFeeCents > 0}
        daysSet={settings.weekdays.length > 0}
        stripeConnected={stripeConnected}
        bookingUrl={bookingUrl}
        dayNames={weekdayLabel(settings.weekdays)}
        dayCount={settings.weekdays.length}
        hoursLabel={`${clockLabel(settings.earliestTime)} – ${clockLabel(settings.latestEnd)}`}
        feeLabel={
          settings.maxFeeCents > 0
            ? settings.minFeeCents > 0 && settings.minFeeCents !== settings.maxFeeCents
              ? `${money(settings.minFeeCents)} – ${money(settings.maxFeeCents)}`
              : money(settings.maxFeeCents)
            : 'Not set'
        }
        maxPerDay={settings.maxPerDay}
        daysAhead={settings.daysAhead}
        todayCount={acceptedToday}
        openCount={active.length}
        maxDetourMiles={settings.maxDetourMiles}
      />

      {/* ACTIVE REQUESTS RENDERED BEFORE THE MAP SO IMMEDIATE WORK IS ABOVE THE FOLD */}
      {active.length > 0 ? (
        <section className="panel workspace-section-card" id="quick-stop-requests" style={{ marginBottom: '1.25rem' }}>
          <div className="section-heading workspace-section-heading compact-heading">
            <p className="eyebrow">Waiting on you</p>
            <h2>{active.length} open {active.length === 1 ? 'request' : 'requests'}</h2>
          </div>
          <div style={{ marginTop: '1rem' }}>
            {activeCards.map(({ r, route, photoUrls }) => (
              <QuickStopRequestCard key={r.id} request={r as unknown as CardRequest} route={route} photoUrls={photoUrls} defaults={defaults} />
            ))}
          </div>
        </section>
      ) : (
        <section className="panel workspace-section-card quick-stop-empty-panel" id="quick-stop-requests" style={{ marginBottom: '1.25rem' }}>
          <div className="quick-stop-empty">
            <span className="quick-stop-empty-mark" aria-hidden="true">📍</span>
            <h3>
              {quickStopLive
                ? "You're all set — waiting on requests"
                : state.kind === 'paused'
                  ? 'No new requests while this is paused'
                  : quickStopStateHeadline(state)}
            </h3>
            <p>
              {quickStopLive
                ? 'When a customer requests a Quick Stop from your booking page, it lands here and we text and email you right away.'
                : state.kind === 'paused'
                  ? 'New Quick Stop requests are paused until the lock lifts. Anything already in progress will still appear here.'
                  : `${quickStopStateDetail(state)} Requests from your booking page will land here.`}
            </p>
          </div>
        </section>
      )}

      {/* MULTI-DAY ROUTE COVERAGE MAP & TIMELINE GAP FINDER */}
      <QuickStopCoverageMap
        stops={routeStops}
        multiDayStops={multiDayStops}
        daysWindow={daysWindow}
        defaultDayKey={active[0]?.requested_date || todayKey}
        radiusMiles={settings.maxDetourMiles}
        emptyReason={coverageEmpty}
        zones={priorityZones}
        fallbackCenter={fallbackCenter}
      />

      <details className="panel workspace-section-card es-how" id="quick-stop-how" open={openPitch}>
        <summary className="es-how-summary">
          <span className="es-how-copy">
            <strong>{quickStopLive ? 'How “Quick Stops” works' : 'New to Quick Stops? Here’s how it works'}</strong>
            <small>The flow start to finish, what the customer sees, and what it adds up to</small>
          </span>
          <span className="es-how-chev" aria-hidden="true">⌄</span>
        </summary>
        <div className="es-how-body">
          <QuickStopExplainer
            weekdayCount={settings.weekdays.length}
            maxPerDay={settings.maxPerDay}
            maxFeeDollars={defaults.maxFeeDollars}
            minFeeDollars={defaults.minFeeDollars}
            stripeConnected={stripeConnected}
            bookingUrl={bookingUrl}
            businessName={businessName}
          />
        </div>
      </details>
    </>
  );

  const settingsPanel = (
    <>
      <QuickStopConfigurator
        quickStop={accountRow as Parameters<typeof QuickStopConfigurator>[0]['quickStop']}
        refundTiers={refundTiers}
        stripeConnected={stripeConnected}
      />
      <QuickStopAreas
        radiusMiles={settings.maxDetourMiles}
        zones={priorityZones}
        zonesAvailable={zonesAvailable}
      />
    </>
  );

  const insightsPanel = (
    <>
      {history.length ? (
        <section className="panel workspace-section-card" style={{ marginBottom: '1.25rem' }}>
          <div className="section-heading workspace-section-heading compact-heading">
            <p className="eyebrow">History</p>
            <h2>Closed &amp; completed</h2>
          </div>
          <div style={{ marginTop: '1rem' }}>
            {history.map((r) => (
              <QuickStopRequestCard key={r.id} request={r as unknown as CardRequest} route={null} photoUrls={[]} defaults={defaults} />
            ))}
          </div>
        </section>
      ) : null}

      <QuickStopCandidates
        report={demand}
        screenings={screenings}
        reachable={reachable}
        windowDays={DEMAND_WINDOW_DAYS}
        minFeeCents={settings.minFeeCents}
        maxVisitMinutes={settings.maxVisitMinutes}
        enabled={settings.enabled}
        results={resultsMetrics}
        businessName={businessName}
        bookingUrl={bookingUrl ?? ''}
        daysAhead={settings.daysAhead}
      />
    </>
  );

  return (
    <main className="wide-shell workspace-shell bset">
      <QuickStopHead />
      <QuickStopTabs
        today={todayPanel}
        settings={settingsPanel}
        insights={insightsPanel}
        initialTab={normalizeQuickStopTab(searchParams.tab)}
        openCount={active.length}
      />
    </main>
  );
}
