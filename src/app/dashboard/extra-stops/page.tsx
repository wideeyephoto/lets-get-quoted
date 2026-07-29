import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { listExtraStopRequests } from '@/lib/extra-stop-requests';
import { extraStopSettingsFromAccount, EXTRA_STOP_SETTINGS_COLUMNS } from '@/lib/extra-stop';
import { computeExtraStopRoute } from '@/lib/extra-stop-route';
import { createLeadPhotoUrls } from '@/lib/lead-photo-storage';
import ExtraStopRequestCard, { type CardRequest } from './ExtraStopRequestCard';

export const dynamic = 'force-dynamic';

export default async function ExtraStopsPage() {
  const { supabase, accountId } = await requireOwnerContext();

  const [{ data: accountRow }, requests] = await Promise.all([
    supabase.from('accounts').select(`${EXTRA_STOP_SETTINGS_COLUMNS}, timezone, instant_book_drive_time`).eq('id', accountId).single(),
    listExtraStopRequests(supabase, accountId, { limit: 100 }),
  ]);
  const settings = extraStopSettingsFromAccount(accountRow as Parameters<typeof extraStopSettingsFromAccount>[0]);
  const timezone = (accountRow as { timezone?: string } | null)?.timezone || 'America/New_York';
  const driveTime = Boolean((accountRow as { instant_book_drive_time?: boolean } | null)?.instant_book_drive_time);

  const open = requests.filter((r) => r.status === 'awaiting_contractor' || r.status === 'more_information_requested');
  const rest = requests.filter((r) => r.status !== 'awaiting_contractor' && r.status !== 'more_information_requested');

  // Route + photos for the open queue only (a handful of live requests).
  const openCards = await Promise.all(
    open.map(async (r) => {
      const target = r.lat != null && r.lng != null ? { lat: Number(r.lat), lng: Number(r.lng) } : null;
      const route = await computeExtraStopRoute(supabase, accountId, target, { arrivalDate: null, visitMinutes: r.ai_visit_minutes, driveTime, timezone });
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

        {open.length === 0 ? (
          <p className="empty-state" style={{ marginTop: '1rem' }}>No Extra Stop requests need your response right now.</p>
        ) : (
          <div style={{ marginTop: '1rem' }}>
            {openCards.map(({ r, route, photoUrls }) => (
              <ExtraStopRequestCard key={r.id} request={r as unknown as CardRequest} route={route} photoUrls={photoUrls} defaults={defaults} />
            ))}
          </div>
        )}
      </section>

      {rest.length ? (
        <section className="panel workspace-section-card">
          <div className="section-heading workspace-section-heading compact-heading">
            <p className="eyebrow">History</p>
            <h2>Offered, confirmed &amp; closed</h2>
          </div>
          <div style={{ marginTop: '1rem' }}>
            {rest.map((r) => (
              <ExtraStopRequestCard key={r.id} request={r as unknown as CardRequest} route={null} photoUrls={[]} defaults={defaults} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
