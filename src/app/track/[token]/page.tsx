import type { ReactNode } from 'react';
import { createAdminClient } from '@/lib/auth';
import { getTrackingByToken } from '@/lib/job-tracking';
import PinMap, { type MapPin } from '@/components/pin-map';
import AutoRefresh from './AutoRefresh';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Track your visit' };

function shell(children: ReactNode) {
  return (
    <main className="wide-shell workspace-shell payment-shell">
      <section className="workspace-hero panel payment-hero">
        <div className="workspace-hero-copy">{children}</div>
      </section>
    </main>
  );
}

export default async function TrackPage({ params }: { params: { token: string } }) {
  const admin = createAdminClient();
  const t = await getTrackingByToken(admin, params.token);

  if (!t || t.status === 'done' || t.expired) {
    return shell(
      <>
        <p className="eyebrow">On the way</p>
        <h1 className="workspace-title">This tracking link is no longer active</h1>
        <p className="workspace-lead">The visit may already be complete. Reach out to your contractor if you need an update.</p>
      </>,
    );
  }

  const arrived = t.status === 'arrived';
  const sentAt = new Date(t.enRouteAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const pins: MapPin[] = [];
  if (t.dest) pins.push({ id: 'dest', lat: t.dest.lat, lng: t.dest.lng, kind: 'scheduled', label: t.destLabel || 'Your address', href: '#' });
  if (t.tech && !arrived) pins.push({ id: 'tech', lat: t.tech.lat, lng: t.tech.lng, kind: 'lead', label: `${t.businessName} (en route)`, href: '#' });

  return (
    <main className="wide-shell workspace-shell payment-shell">
      <AutoRefresh seconds={25} />
      <section className="workspace-hero panel payment-hero">
        <div className="workspace-hero-copy">
          <p className="eyebrow">{t.businessName}</p>
          <h1 className="workspace-title">{arrived ? 'Your tech has arrived 🎉' : 'Your tech is on the way 🚚'}</h1>
          <p className="workspace-lead">
            {arrived
              ? `${t.businessName} is at your location.`
              : t.etaMinutes
                ? `${t.clientFirst ? `${t.clientFirst}, ` : ''}about ${t.etaMinutes} minute${t.etaMinutes === 1 ? '' : 's'} away. Sent at ${sentAt}.`
                : `${t.businessName} is en route. Sent at ${sentAt}.`}
          </p>
        </div>
      </section>

      {pins.length > 0 ? (
        <section className="panel workspace-section-card">
          <div className="workspace-embedded-map" style={{ minHeight: 320 }}>
            <PinMap pins={pins} theme="light" />
          </div>
          {!arrived ? <p className="job-meta" style={{ marginTop: '0.75rem', opacity: 0.7 }}>This page updates automatically — keep it open to follow along.</p> : null}
        </section>
      ) : null}
    </main>
  );
}
