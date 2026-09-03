import Link from 'next/link';
import { Icon } from '@/app/dashboard/schedule/booking/icons';
import { WEEKDAY_LABELS, formatWindowClock } from '@/lib/booking-availability';
import { DEMO_BOOKING, DEMO_SITE_HOST } from '@/lib/demo-data';

export const metadata = { title: 'Booking requests — Live Demo' };
export const dynamic = 'force-dynamic';

// A read-only mirror of the real booking screen. The live version is one client
// component wired straight to its server actions, so it cannot be reused here —
// but the summary layer is the part that sells the feature, and that is what
// this reproduces: the master switch, whether it is actually live, and the
// compact read-back of the settings that shape customer requests.

function dayLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function agoLabel(hours: number): string {
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export default function DemoBookingPage() {
  const weekdays = [...DEMO_BOOKING.weekdays];
  const dayNames = weekdays.map((day) => WEEKDAY_LABELS[day].slice(0, 3)).join(', ');
  const windowNames = DEMO_BOOKING.windows.map((time) => formatWindowClock(time)).join(' · ');
  const nextBlock = DEMO_BOOKING.blocks[0];

  return (
    <main className="wide-shell workspace-shell bset">
      <header className="bset-head">
        <div>
          <h1>
            Booking requests <Icon name="calendar" />
          </h1>
          <p>Customers request a preferred arrival window. You confirm the final time.</p>
        </div>
        <Link href="/demo/tour/site" className="btn secondary bset-head-cta" aria-label="View demo contractor website booking flow">
          View customer booking <Icon name="external" />
        </Link>
      </header>

      <section className="bset-master compact">
        <span className="bset-master-switch">
          <input type="checkbox" role="switch" checked readOnly aria-label="Booking requests are on" />
          <span className="bset-switch-track" aria-hidden="true"><span /></span>
          <span className="bset-master-copy">
            <strong>Booking requests <em className="on">Active</em></strong>
            <small>Customers can request a preferred window online.</small>
          </span>
        </span>

        <div className="bset-master-status live">
          <p><span className="bset-dot" aria-hidden="true" />Live</p>
          <small>
            {DEMO_BOOKING.openWindowCount} open arrival windows across the next {DEMO_BOOKING.openDayCount} working days at{' '}
            {DEMO_SITE_HOST}/book.
          </small>
        </div>
      </section>

      <div className="bset-summary" aria-label="Booking request summary">
        <div className="bset-summary-item is-static is-active">
          <span className="bset-summary-icon tone-days"><Icon name="calendar" /></span>
          <span className="bset-summary-copy">
            <small>Availability</small>
            <strong>{dayNames}</strong>
            <span>{windowNames}</span>
          </span>
        </div>

        <div className="bset-summary-item is-static">
          <span className="bset-summary-icon tone-time"><Icon name="clock" /></span>
          <span className="bset-summary-copy">
            <small>Limits &amp; Rules</small>
            <strong>Up to {DEMO_BOOKING.maxPerDay} jobs a day</strong>
            <span>{DEMO_BOOKING.leadDays} day of notice</span>
          </span>
        </div>

        <div className="bset-summary-item is-static">
          <span className="bset-summary-icon tone-off"><Icon name="briefcase" /></span>
          <span className="bset-summary-copy">
            <small>Time off</small>
            <strong>{DEMO_BOOKING.blocks.length} upcoming</strong>
            <span>{nextBlock ? `Next: ${dayLabel(nextBlock.dateKey)}` : 'No days blocked off'}</span>
          </span>
        </div>
      </div>

      <details className="bset-mobile-summary">
        <summary>
          <span>
            <small>Current setup</small>
            <strong>{dayNames} · {windowNames}</strong>
          </span>
          <Icon name="chevronDown" />
        </summary>
        <div className="bset-mobile-summary-actions">
          <span><span>Availability</span><strong>{windowNames}</strong></span>
          <span><span>Limits</span><strong>Up to {DEMO_BOOKING.maxPerDay} a day</strong></span>
          <span><span>Time off</span><strong>{DEMO_BOOKING.blocks.length} upcoming</strong></span>
        </div>
      </details>

      {/* A booking is a REQUEST until the contractor says yes — the same rule the
          real product follows, and the reason nothing here is on the calendar. */}
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Waiting on you</p>
          <h2>Booking requests</h2>
        </div>
        <p className="cash-bills-lead">
          Nothing a customer picks lands on your calendar on its own. Each request holds its slot until you accept it, so two
          people cannot take the same window while you are up a ladder.
        </p>
        <div className="job-list">
          {DEMO_BOOKING.pending.map((request) => (
            <div className="job-row" key={request.id}>
              <div className="job-row-header">
                <span className="job-ref">{dayLabel(request.requestedFor)} · {request.window}</span>
                <span className="status-badge status-new_lead">Needs a yes</span>
              </div>
              <div className="job-client">{request.name}</div>
              <div className="job-row-header" style={{ marginTop: '0.4rem' }}>
                <span className="job-meta">{request.service} · {request.address}</span>
                <span className="job-quoted">${request.estimate.toLocaleString('en-US')}</span>
              </div>
              <div className="job-row-header" style={{ marginTop: '0.35rem' }}>
                <span className="job-meta">Asked {agoLabel(request.requestedHoursAgo)}</span>
                <span className="schedule-action-buttons">
                  <button type="button" className="btn primary" disabled>Accept</button>
                  <button type="button" className="btn secondary" disabled>Offer another time</button>
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Whose requests are accepted automatically</p>
          <h2>The gate</h2>
        </div>
        <ul className="cash-where-list">
          <li>
            <strong>Worth the slot</strong> — a job has to estimate above{' '}
            ${DEMO_BOOKING.instantBookMinAmount.toLocaleString('en-US')} before it can take a window on its own. Anything
            smaller still comes through, as a request you price.
          </li>
          <li>
            <strong>Close enough</strong> — within {DEMO_BOOKING.radiusMiles} miles, and ranked by whether you are already
            working near that address that day. A stop that fits your route beats one that pays slightly more.
          </li>
          <li>
            <strong>Not tomorrow morning</strong> — {DEMO_BOOKING.leadDays} day of notice, at most{' '}
            {DEMO_BOOKING.maxPerDay} bookings a day, so a good week cannot bury a crew.
          </li>
        </ul>
      </section>
    </main>
  );
}
