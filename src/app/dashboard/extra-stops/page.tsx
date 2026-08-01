import { requireOwnerContext, createAdminClient } from '@/lib/auth';
import { listExtraStopRequests } from '@/lib/extra-stop-requests';
import { sweepExtraStopOffers } from '@/lib/extra-stop-sweep';
import { extraStopSettingsFromAccount, EXTRA_STOP_SETTINGS_COLUMNS, EXTRA_STOP_TERMINAL_STATUSES } from '@/lib/extra-stop';
import { computeExtraStopRoute } from '@/lib/extra-stop-route';
import { createLeadPhotoUrls } from '@/lib/lead-photo-storage';
import ExtraStopRequestCard, { type CardRequest } from './ExtraStopRequestCard';
import ExtraStopExplainer from './ExtraStopExplainer';
import ExtraStopStatus, { ExtraStopHead } from './ExtraStopStatus';
import ExtraStopConfigurator from './ExtraStopConfigurator';
import ExtraStopCandidates from './ExtraStopCandidates';
import { customerWords, screenExtraStopCandidates, type CandidateInput } from '@/lib/extra-stop-candidates';
import { loadRefundTiers } from '@/lib/extra-stop-refunds';

/** How far back the demand panel looks. A quarter is enough to be a pattern. */
const DEMAND_WINDOW_DAYS = 90;

const LEAD_SOURCE_LABEL: Record<string, string> = {
  website_form: 'Website lead',
  missed_call: 'Missed call',
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

export default async function ExtraStopsPage() {
  const { supabase, accountId } = await requireOwnerContext();

  // Lazy expiry so the queue is current even between cron runs (releases lapsed
  // payment holds, closes unanswered requests). Best-effort — never blocks render.
  await sweepExtraStopOffers(createAdminClient(), accountId).catch(() => undefined);

  const [{ data: accountRow }, requests, { data: site }] = await Promise.all([
    supabase.from('accounts').select(`${EXTRA_STOP_SETTINGS_COLUMNS}, extra_stop_lock_reason, timezone, instant_book_drive_time, connect_onboarded, business_name`).eq('id', accountId).single(),
    listExtraStopRequests(supabase, accountId, { limit: 100 }),
    supabase.from('sites').select('published, subdomain, company_name').eq('account_id', accountId).maybeSingle(),
  ]);
  const settings = extraStopSettingsFromAccount(accountRow as Parameters<typeof extraStopSettingsFromAccount>[0]);
  const lockReason = (accountRow as { extra_stop_lock_reason?: string } | null)?.extra_stop_lock_reason || '';
  const timezone = (accountRow as { timezone?: string } | null)?.timezone || 'America/New_York';
  const driveTime = Boolean((accountRow as { instant_book_drive_time?: boolean } | null)?.instant_book_drive_time);

  const terminal = new Set<string>([...EXTRA_STOP_TERMINAL_STATUSES, 'disputed']);
  const active = requests.filter((r) => !terminal.has(r.status));
  const history = requests.filter((r) => terminal.has(r.status));

  // For active requests: route only where an offer is still being decided; photos
  // for all so the contractor can see the job. (A handful of live requests.)
  const activeCards = await Promise.all(
    active.map(async (r) => {
      const offerable = r.status === 'awaiting_contractor' || r.status === 'more_information_requested';
      const target = r.lat != null && r.lng != null ? { lat: Number(r.lat), lng: Number(r.lng) } : null;
      const route = offerable ? await computeExtraStopRoute(supabase, accountId, target, { arrivalDate: null, visitMinutes: r.ai_visit_minutes, driveTime, timezone }) : null;
      const photoUrls = r.photo_paths?.length ? await createLeadPhotoUrls(accountId, r.photo_paths).catch(() => []) : [];
      return { r, route, photoUrls };
    }),
  );

  // For the explainer's setup checklist — real state, not decoration.
  const stripeConnected = Boolean((accountRow as { connect_onboarded?: boolean } | null)?.connect_onboarded);
  const refundTiers = await loadRefundTiers(supabase, accountId);
  const appOrigin = (process.env.NEXT_PUBLIC_APP_URL || `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com'}`).replace(/\/$/, '');
  const bookingUrl = site?.published && site?.subdomain ? `${appOrigin}/book/${site.subdomain}` : null;
  const businessName =
    (site?.company_name as string) || (accountRow as { business_name?: string } | null)?.business_name || 'Your business';

  // Their own recent work, run through the same deterministic screen a live
  // request gets. Both tables, because a lead carries the customer's own words
  // and a job carries the owner's — and the screener wants whichever exists.
  const sinceIso = new Date(Date.now() - DEMAND_WINDOW_DAYS * 86400000).toISOString();
  const [{ data: recentLeads }, { data: recentJobs }] = await Promise.all([
    supabase
      .from('leads')
      .select('id, name, message, project_type, estimated_hours, source, created_at')
      .eq('account_id', accountId)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('jobs')
      .select('id, ref, client_name, scope, estimated_hours, created_at, status')
      .eq('account_id', accountId)
      .neq('status', 'archived')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  const candidateInputs: CandidateInput[] = [
    ...((recentLeads ?? []) as Array<{ id: string; name: string | null; message: string | null; project_type: string | null; estimated_hours: number | null; source: string; created_at: string }>).map(
      (lead) => ({
        id: lead.id,
        source: 'lead' as const,
        label: LEAD_SOURCE_LABEL[lead.source] ?? 'Lead',
        clientName: lead.name || 'Unnamed lead',
        text: [lead.project_type, customerWords(lead.message)].filter(Boolean).join(' — '),
        createdAt: lead.created_at,
        estimatedHours: lead.estimated_hours == null ? null : Number(lead.estimated_hours),
        href: `/dashboard/leads/${lead.id}`,
      }),
    ),
    ...((recentJobs ?? []) as Array<{ id: string; ref: string; client_name: string; scope: string | null; estimated_hours: number | null; created_at: string }>).map(
      (job) => ({
        id: job.id,
        source: 'job' as const,
        label: job.ref,
        clientName: job.client_name,
        text: job.scope ?? '',
        createdAt: job.created_at,
        estimatedHours: job.estimated_hours == null ? null : Number(job.estimated_hours),
        href: `/dashboard/jobs/${job.id}`,
      }),
    ),
  ];
  const demand = screenExtraStopCandidates(candidateInputs, { maxVisitMinutes: settings.maxVisitMinutes });

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

  return (
    <main className="wide-shell workspace-shell bset">
      <ExtraStopHead bookingUrl={bookingUrl} />

      <ExtraStopStatus
        enabled={settings.enabled}
        locked={settings.locked}
        lockedUntil={settings.lockedUntil}
        lockReason={lockReason}
        // Passed apart rather than pre-ANDed, so the status line can name the one
        // that is actually missing instead of both.
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
        todayCount={acceptedToday}
        openCount={active.length}
      />

      {active.length > 0 ? (
        // The id the Requests summary card jumps to.
        <section className="panel workspace-section-card" id="extra-stop-requests">
          <div className="section-heading workspace-section-heading compact-heading">
            <p className="eyebrow">Waiting on you</p>
            <h2>{active.length} open {active.length === 1 ? 'request' : 'requests'}</h2>
          </div>
          <div style={{ marginTop: '1rem' }}>
            {activeCards.map(({ r, route, photoUrls }) => (
              <ExtraStopRequestCard key={r.id} request={r as unknown as CardRequest} route={route} photoUrls={photoUrls} defaults={defaults} />
            ))}
          </div>
        </section>
      ) : (
        <section className="panel workspace-section-card extra-stop-empty-panel" id="extra-stop-requests">
          <div className="extra-stop-empty">
            <span className="extra-stop-empty-mark" aria-hidden="true">📍</span>
            <h3>{settings.locked ? 'No active requests while paused' : settings.enabled ? "You're all set — waiting on requests" : 'Nothing can come in yet'}</h3>
            <p>
              {settings.locked
                ? 'New Extra Stop requests are paused until the lock lifts. Anything already in progress will still appear here.'
                : settings.enabled
                  ? 'When a customer requests an Extra Stop from your booking page, it lands here and we text and email you right away.'
                  : 'Turn Extra Stops on above and requests from your booking page will land here.'}
            </p>
          </div>
        </section>
      )}

      {/* Sits directly under the queue. With no requests in yet, the queue is
          empty and this is the answer to the question that empty state raises:
          is this thing working, or does my trade just not produce this work? */}
      <ExtraStopCandidates
        report={demand}
        windowDays={DEMAND_WINDOW_DAYS}
        minFeeCents={settings.minFeeCents}
        maxVisitMinutes={settings.maxVisitMinutes}
        enabled={settings.enabled}
      />

      {/* STILL ON THE PAGE ONCE IT'S RUNNING, just folded away. This is the only
          place that explains what Extra Stop is, what it earns and what it costs
          a customer, so removing it when the switch flips would leave an owner
          who turned it on with no way back to the explanation and nothing to
          send a customer to — which is why it used to be permanently open. A
          closed drawer keeps all of that and stops the pitch sitting on top of
          the queue you actually came here to read.
          Left OPEN while it's off: with the feature switched off, the pitch is
          the page. */}
      {settings.enabled ? (
        <details className="panel workspace-section-card es-how">
          <summary className="es-how-summary">
            <span className="es-how-copy">
              <strong>How &ldquo;Extra Stops&rdquo; works</strong>
              <small>The flow start to finish, what the customer sees, and what it adds up to</small>
            </span>
            <span className="es-how-chev" aria-hidden="true">⌄</span>
          </summary>
          <div className="es-how-body">
            <ExtraStopExplainer
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
      ) : (
        <ExtraStopExplainer
          weekdayCount={settings.weekdays.length}
          maxPerDay={settings.maxPerDay}
          maxFeeDollars={defaults.maxFeeDollars}
          minFeeDollars={defaults.minFeeDollars}
          stripeConnected={stripeConnected}
          bookingUrl={bookingUrl}
          businessName={businessName}
        />
      )}

      {/* The configurator lives HERE now, not in Account > Automations. It is
          thirty controls about Extra Stops; a settings tab about everything else
          was never the place to read them. Automations keeps the on/off switch
          and a link back to this page. */}
      <ExtraStopConfigurator
        extraStop={accountRow as Parameters<typeof ExtraStopConfigurator>[0]['extraStop']}
        refundTiers={refundTiers}
        stripeConnected={stripeConnected}
      />

      {history.length ? (
        <section className="panel workspace-section-card">
          <div className="section-heading workspace-section-heading compact-heading">
            <p className="eyebrow">History</p>
            <h2>Closed &amp; completed</h2>
          </div>
          <div style={{ marginTop: '1rem' }}>
            {history.map((r) => (
              <ExtraStopRequestCard key={r.id} request={r as unknown as CardRequest} route={null} photoUrls={[]} defaults={defaults} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
