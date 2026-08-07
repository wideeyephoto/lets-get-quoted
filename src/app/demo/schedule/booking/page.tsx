import { Icon } from '@/app/dashboard/schedule/booking/icons';
import { WEEKDAY_LABELS, formatWindowClock } from '@/lib/booking-availability';
import { DEMO_BOOKING, DEMO_SITE_HOST } from '@/lib/demo-data';

export const metadata = { title: 'Online booking — demo' };
export const dynamic = 'force-dynamic';

// A read-only mirror of the real booking screen. The live version is one client
// component wired straight to its server actions, so it cannot be reused here —
// but the summary layer is the part that sells the feature, and that is what
// this reproduces: the master switch, whether it is actually live, and the four
// cards that say what the public page is offering right now.

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
            Online booking <Icon name="calendar" />
          </h1>
          <p>Control when customers can book and how your time is managed.</p>
        </div>
        <span className="btn secondary bset-head-cta" aria-disabled="true">
          View booking page <Icon name="external" />
        </span>
      </header>

      <section className="bset-master">
        <span className="bset-master-switch">
          <span className="bset-switch-track" aria-hidden="true"><span /></span>
          <span className="bset-master-copy">
            <strong>Online booking is <em className="on">ON</em></strong>
            <small>Customers can request available dates from your website.</small>
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

      <div className="bset-cards">
        <div className="bset-card">
          <span className="bset-card-icon tone-days"><Icon name="calendar" /></span>
          <span className="bset-card-label">Open days</span>
          <strong>{dayNames}</strong>
          <small>Customers can book {weekdays.length} days a week</small>
        </div>

        <div className="bset-card">
          <span className="bset-card-icon tone-time"><Icon name="clock" /></span>
          <span className="bset-card-label">Arrival options</span>
          <strong>{windowNames}</strong>
          <small>Customers choose a preferred time window</small>
        </div>

        <div className="bset-card">
          <span className="bset-card-icon tone-off"><Icon name="briefcase" /></span>
          <span className="bset-card-label">Time off</span>
          <strong>{DEMO_BOOKING.blocks.length} upcoming</strong>
          <small>{nextBlock ? `Next: ${dayLabel(nextBlock.dateKey)} · ${nextBlock.reason}` : 'No days blocked off'}</small>
        </div>

        <div className="bset-card">
          <span className="bset-card-icon tone-link"><Icon name="link" /></span>
          <span className="bset-card-label">Booking page</span>
          <strong>{DEMO_SITE_HOST}</strong>
          <small>Published and taking requests</small>
        </div>
      </div>

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
