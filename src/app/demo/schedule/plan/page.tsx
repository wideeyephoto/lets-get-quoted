import Link from 'next/link';
import { DEMO_ROUTE } from '@/lib/demo-data';

export const metadata = { title: 'Plan my day — demo' };
export const dynamic = 'force-dynamic';

// The live planner is drag-and-drop over a Google map with a live drive matrix
// behind it, and it writes the order back to the calendar. None of that belongs
// in a logged-out demo, so this is the settled result instead: the ordered day,
// what the driving costs, and where a Quick Stop slots in.

const KIND_BADGE: Record<string, { label: string; className: string }> = {
  job: { label: 'Job', className: 'plan-badge locked' },
  'quick-stop': { label: 'Quick Stop', className: 'plan-badge flexible' },
  supply: { label: 'Supply run', className: 'plan-badge errand' },
};

function hoursLabel(hours: number): string {
  if (hours >= 1) return `${hours} hr${hours === 1 ? '' : 's'}`;
  return `${Math.round(hours * 60)} min`;
}

function dayLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function DemoPlanPage() {
  const stops = DEMO_ROUTE.stops;
  const workedHours = stops.reduce((sum, stop) => sum + stop.hours, 0);
  const finish = stops[stops.length - 1];

  return (
    <main className="wide-shell workspace-shell">
      <header className="plan-header">
        <div className="plan-header-title">
          <p className="eyebrow">Plan my day</p>
          <h1>{dayLabel(DEMO_ROUTE.dateKey)}</h1>
        </div>
      </header>

      <section className="panel workspace-section-card">
        <dl className="plan-stat-row">
          <div className="plan-stat">
            <dt>Stops</dt>
            <dd>{stops.length}</dd>
          </div>
          <div className="plan-stat">
            <dt>Total distance</dt>
            <dd>{DEMO_ROUTE.totalMiles} mi</dd>
          </div>
          <div className="plan-stat">
            <dt>Driving time</dt>
            <dd>{DEMO_ROUTE.totalDriveMinutes} min</dd>
          </div>
          <div className="plan-stat">
            <dt>Finish around</dt>
            <dd>{finish ? finish.arrive : '—'}</dd>
          </div>
        </dl>
        <p className="plan-drag-hint">
          Ordered by drive time between the addresses, not by distance — a three-mile hop across a highway can cost more
          than a six-mile run down the road you are already on.
        </p>
      </section>

      <div className="plan-body">
        <section className="panel plan-panel plan-stops-panel">
          <div className="plan-stops-head">
            <div>
              <p className="eyebrow">Scheduled stops</p>
              <h2>{stops.length} stops · {hoursLabel(workedHours)} of work</h2>
            </div>
            <button type="button" className="btn secondary" disabled>Save this order</button>
          </div>

          <ul className="plan-stop-list">
            {stops.map((stop, index) => {
              const badge = KIND_BADGE[stop.kind];
              return (
                <li className="plan-stop" key={stop.id}>
                  <span className="plan-stop-num" aria-hidden="true">{index + 1}</span>

                  <div className="plan-stop-who">
                    {stop.kind === 'job' ? (
                      <Link href={`/demo/jobs/${stop.id}`} className="plan-stop-name">{stop.client}</Link>
                    ) : (
                      <span className="plan-stop-name is-errand">{stop.client}</span>
                    )}
                    <p className="plan-stop-addr">{stop.address}</p>
                  </div>

                  <div className="plan-stop-when">
                    <span className="plan-stop-time">{stop.arrive}</span>
                    <span className="plan-stop-drive">{hoursLabel(stop.hours)} on site</span>
                  </div>

                  <div className="plan-stop-flags">
                    <span className="plan-stop-drive">
                      {stop.miles} mi · {stop.driveMinutes} min drive
                    </span>
                    <span className={badge.className}>{badge.label}</span>
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="plan-drag-hint">
            In the full app these drag into any order you like, and the arrival times and drive legs recompute as you move
            them. Nothing touches the calendar until you press Save.
          </p>
        </section>

        <aside className="plan-aside">
          <section className="panel workspace-section-card">
            <div className="section-heading workspace-section-heading">
              <p className="eyebrow">Starting from</p>
              <h2>The yard</h2>
            </div>
            <p className="plan-stop-addr">{DEMO_ROUTE.startAddress}</p>
            <p className="plan-drag-hint">
              Crews roll at {DEMO_ROUTE.workdayStart.replace(':', '.')} — the first leg is measured from here, not from the
              first job.
            </p>
          </section>

          <section className="panel workspace-section-card">
            <div className="section-heading workspace-section-heading">
              <p className="eyebrow">Why stop 2 is on the list</p>
              <h2>A Quick Stop paid its way in</h2>
            </div>
            <p className="cash-bills-lead">
              Priya Shah asked to be squeezed in this morning. Her address is five minutes off the leg you were already
              driving between Berkley and Clawson, so the fee is on top of a trip that was happening anyway.
            </p>
            <p className="plan-drag-hint">
              <Link href="/demo/quick-stops">See how a stop gets screened →</Link>
            </p>
          </section>

          <section className="panel workspace-section-card">
            <div className="section-heading workspace-section-heading">
              <p className="eyebrow">On the crew&rsquo;s phones</p>
              <h2>Who is where</h2>
            </div>
            <ul className="plan-notify-list">
              {stops.filter((stop) => stop.crew.length > 0).map((stop) => (
                <li key={stop.id}>
                  <strong>{stop.client}</strong>
                  <span className="job-meta"> — {stop.crew.join(', ')}</span>
                </li>
              ))}
            </ul>
            <p className="plan-notify-note">
              Each customer gets an &ldquo;on my way&rdquo; text with a live tracking link when the crew leaves the stop
              before theirs.
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}
