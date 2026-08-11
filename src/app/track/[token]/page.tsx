import type { CSSProperties, ReactNode } from 'react';
import { createAdminClient } from '@/lib/auth';
import { getTrackingByToken, recordTrackingView, type PublicTracking } from '@/lib/job-tracking';
import {
  ARRIVAL_STATUS_HEADLINE, HOMEOWNER_REPLIES, homeownerReply, isClosedStatus,
} from '@/lib/arrival';
import PinMap, { type MapPin } from '@/components/pin-map';
import AutoRefresh from './AutoRefresh';
import { homeownerReplyAction } from './actions';
import styles from './track.module.css';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Your visit',
  // Nobody should be able to find somebody's house call in a search index.
  robots: { index: false, follow: false },
};

// The homeowner's arrival page.
//
// No account, no app, one screenful. It carries the CONTRACTOR's name and
// color, because this is the moment the customer is judging them and not us.
// Everything on it is reachable by anyone holding the link, so it holds only
// what a person waiting at home needs: when, who, and how to reach them.

function Shell({ accent, children }: { accent: string | null; children: ReactNode }) {
  const style = accent ? ({ '--brand': accent } as CSSProperties) : undefined;
  return (
    <main className={styles.page} style={style}>
      <div className={styles.shell}>{children}</div>
    </main>
  );
}

export default async function TrackPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { said?: string };
}) {
  const admin = createAdminClient();
  const visit = await getTrackingByToken(admin, params.token);

  if (!visit || visit.expired || visit.status === 'done') {
    return (
      <Shell accent={visit?.accent ?? null}>
        <div className={styles.card}>
          <div className={styles.status}>
            <span className={`${styles.statusPill} ${styles.stopped}`}>Not active</span>
            <h1 className={styles.headline}>This visit link has expired</h1>
            <p className={styles.lead}>
              The visit may already be finished. {visit?.businessName ? `Get in touch with ${visit.businessName}` : 'Get in touch with your contractor'} if you need an update.
            </p>
          </div>
        </div>
      </Shell>
    );
  }

  const closed = isClosedStatus(visit.status);
  const said = searchParams.said ? homeownerReply(searchParams.said) : null;

  // "Did they open it" is the number that says whether any of this reached a
  // human. Recorded here rather than in the token read, so tapping a reply
  // button doesn't also count as opening the link. Throttled, and awaited only
  // because a Next server component has nowhere to put a floating promise —
  // it's a single indexed update on a page that is already dynamic.
  await recordTrackingView(admin, visit.viewState);

  const pins: MapPin[] = [];
  if (visit.dest) pins.push({ id: 'dest', lat: visit.dest.lat, lng: visit.dest.lng, kind: 'scheduled', label: visit.destLabel || 'Your address', href: '#' });
  // ONE pin for the tech, never a crew of them: the person coming to the door
  // is a person, not a formation.
  if (visit.tech) pins.push({ id: 'tech', lat: visit.tech.lat, lng: visit.tech.lng, kind: 'lead', label: `${visit.crewFirstName || visit.businessName} — on the way`, href: '#' });

  return (
    <Shell accent={visit.accent}>
      {/* Only poll while something can still change. A finished visit that
          keeps refreshing is a page burning a stranger's battery. */}
      {!closed ? <AutoRefresh seconds={30} /> : null}

      <header className={styles.brand}>
        {visit.logoUrl
          // eslint-disable-next-line @next/next/no-img-element -- an arbitrary
          // contractor logo on an arbitrary custom domain; next/image would need
          // every one of those hosts allowlisted in next.config.
          ? <img className={styles.brandLogo} src={visit.logoUrl} alt={visit.businessName} />
          : <p className={styles.brandName}>{visit.businessName}</p>}
      </header>

      <section className={styles.card}>
        <div className={styles.status}>
          <StatusPill status={visit.status} />
          <h1 className={styles.headline}>{headlineFor(visit)}</h1>
          {!closed && visit.windowLabel ? <p className={styles.window}>{visit.windowLabel}</p> : null}
          <p className={styles.lead}>{leadFor(visit)}</p>
        </div>

        {visit.crewFirstName ? (
          <div className={styles.tech}>
            {visit.crewPhotoUrl
              // eslint-disable-next-line @next/next/no-img-element -- signed
              // Supabase URL with a one-hour life; not a stable, optimisable src.
              ? <img className={styles.techPhoto} src={visit.crewPhotoUrl} alt={visit.crewFirstName} />
              : <span className={styles.techInitial} aria-hidden="true">{visit.crewFirstName.charAt(0).toUpperCase()}</span>}
            <div>
              <p className={styles.techName}>{visit.crewFirstName}</p>
              {visit.crewRole ? <p className={styles.techRole}>{visit.crewRole}</p> : null}
            </div>
          </div>
        ) : null}
      </section>

      {said ? <p className={styles.ack}>{said.ack}</p> : null}
      {searchParams.said === 'busy' ? <p className={styles.ack}>Thanks — we already have that. No need to tap again.</p> : null}

      {visit.tech && pins.length > 0 ? (
        <section className={styles.card}>
          <div className={styles.map}>
            <PinMap pins={pins} theme="light" />
          </div>
          <p className={styles.mapNote}>
            Their approximate position, shared for this visit only. It stops when they arrive.
          </p>
        </section>
      ) : null}

      {visit.contactPhone ? (
        <div className={styles.contactRow}>
          <a className={`${styles.contact} ${styles.primary}`} href={`tel:${visit.contactPhone}`}>📞 Call</a>
          {/* ?&body= is the one separator both iOS and Android accept. */}
          <a className={styles.contact} href={`sms:${visit.contactPhone}?&body=${encodeURIComponent('Hi, about today’s visit — ')}`}>💬 Text</a>
        </div>
      ) : null}

      {!closed ? (
        <section className={styles.card}>
          <p className={styles.sectionTitle}>Anything they should know?</p>
          <div className={styles.replies}>
            {HOMEOWNER_REPLIES.map((reply) => (
              <form key={reply.id} action={homeownerReplyAction.bind(null, params.token)} className={styles.replyForm}>
                <input type="hidden" name="reply" value={reply.id} />
                <button type="submit" className={styles.reply}>{reply.label}</button>
              </form>
            ))}
          </div>
        </section>
      ) : null}

      <p className={styles.foot}>
        {visit.businessName} · This link is private to you and expires after the visit.
      </p>
    </Shell>
  );
}

function StatusPill({ status }: { status: PublicTracking['status'] }) {
  const tone =
    status === 'delayed' ? styles.late
      : status === 'arrived' ? styles.done
        : isClosedStatus(status) ? styles.stopped
          : '';
  return <span className={`${styles.statusPill} ${tone}`.trim()}>{ARRIVAL_STATUS_HEADLINE[status]}</span>;
}

function headlineFor(visit: PublicTracking): string {
  const who = visit.crewFirstName || visit.businessName;
  switch (visit.status) {
    case 'arrived': return `${who} has arrived`;
    case 'delayed': return `${who} is running a little late`;
    case 'no_access': return `${who} couldn’t get in`;
    case 'rescheduled': return 'This visit has been rescheduled';
    case 'cancelled': return 'This visit has been cancelled';
    default: return `${who} is on the way`;
  }
}

// The sentence under the big time. Written so that every branch says something
// TRUE and useful — a page that always reads "on the way!" is a page that gets
// ignored the first time it's wrong.
function leadFor(visit: PublicTracking): string {
  const name = visit.clientFirst ? `${visit.clientFirst}, ` : '';
  switch (visit.status) {
    case 'arrived':
      return `${visit.crewFirstName || 'They'} arrived${visit.arrivedAt ? ` at ${timeOnly(visit.arrivedAt)}` : ''}.`;
    case 'delayed':
      return visit.windowLabel
        ? `${name}sorry about that — this is the updated arrival time.`
        : `${name}they’re running behind and will be with you as soon as they can.`;
    case 'no_access':
      return 'They came by but couldn’t get access. Give them a call to arrange another time.';
    case 'rescheduled':
      return 'You’ll hear from them shortly with a new time.';
    case 'cancelled':
      return 'Sorry for the inconvenience — get in touch to rebook.';
    default:
      return visit.windowLabel
        ? `${name}this page updates on its own, so you can leave it open.`
        : `${name}they’re on their way now. This page updates on its own.`;
  }
}

function timeOnly(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
