import Link from 'next/link';
import { requireOwnerContext, createAdminClient } from '@/lib/auth';
import { listExtraStopRequests } from '@/lib/extra-stop-requests';
import { sweepExtraStopOffers } from '@/lib/extra-stop-sweep';
import { extraStopSettingsFromAccount, EXTRA_STOP_SETTINGS_COLUMNS, EXTRA_STOP_TERMINAL_STATUSES } from '@/lib/extra-stop';
import { computeExtraStopRoute } from '@/lib/extra-stop-route';
import { createLeadPhotoUrls } from '@/lib/lead-photo-storage';
import ExtraStopRequestCard, { type CardRequest } from './ExtraStopRequestCard';

export const dynamic = 'force-dynamic';

export default async function ExtraStopsPage() {
  const { supabase, accountId } = await requireOwnerContext();

  // Lazy expiry so the queue is current even between cron runs (releases lapsed
  // payment holds, closes unanswered requests). Best-effort — never blocks render.
  await sweepExtraStopOffers(createAdminClient(), accountId).catch(() => undefined);

  const [{ data: accountRow }, requests] = await Promise.all([
    supabase.from('accounts').select(`${EXTRA_STOP_SETTINGS_COLUMNS}, timezone, instant_book_drive_time`).eq('id', accountId).single(),
    listExtraStopRequests(supabase, accountId, { limit: 100 }),
  ]);
  const settings = extraStopSettingsFromAccount(accountRow as Parameters<typeof extraStopSettingsFromAccount>[0]);
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

  const defaults = {
    earliest: settings.earliestTime,
    latest: settings.latestEnd,
    minFeeDollars: Math.round(settings.minFeeCents / 100),
    maxFeeDollars: Math.round(settings.maxFeeCents / 100),
  };

  return (
    <main className="wide-shell workspace-shell">
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Extra Stop</p>
          <h2>Same-day route requests</h2>
        </div>
        {!settings.enabled ? (
          <p className="payment-banner muted" style={{ marginTop: '.5rem' }}>
            Extra Stop is currently off. Turn it on in <Link href="/dashboard/settings#extra-stop">Settings → Automations → Extra Stop</Link> to start receiving requests.
          </p>
        ) : null}

        {active.length === 0 ? (
          <p className="empty-state" style={{ marginTop: '1rem' }}>No active Extra Stop requests right now.</p>
        ) : (
          <div style={{ marginTop: '1rem' }}>
            {activeCards.map(({ r, route, photoUrls }) => (
              <ExtraStopRequestCard key={r.id} request={r as unknown as CardRequest} route={route} photoUrls={photoUrls} defaults={defaults} />
            ))}
          </div>
        )}
      </section>

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
