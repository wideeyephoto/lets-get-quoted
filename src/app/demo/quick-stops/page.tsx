import Image from 'next/image';
import Link from 'next/link';
import { Icon } from '@/app/dashboard/schedule/booking/icons';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { DEMO_QUICK_STOPS, DEMO_SITE_HOST } from '@/lib/demo-data';
import QuickStopHeaderExplainer from './QuickStopHeaderExplainer';

export const metadata = { title: 'Quick Stops — demo' };
export const dynamic = 'force-dynamic';

// Quick Stops on the real page is eight components deep and every one of them
// reaches for a server action, so this rebuilds the read-only half: the switch
// and its terms, today's requests, and the demand panel — which is the part that
// makes the case, because it counts the work you turned away as well as the work
// you took.

const STATUS_LABEL = {
  accepted: 'Accepted',
  waiting: 'Waiting on you',
  declined: 'Declined',
} as const;

const STATUS_TONE = {
  accepted: 'status-complete',
  waiting: 'status-new_lead',
  declined: 'status-archived',
} as const;

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function agoLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
}

function clockLabel(hhmm: string): string {
  const [hours, minutes] = hhmm.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return minutes ? `${hour12}:${String(minutes).padStart(2, '0')} ${period}` : `${hour12} ${period}`;
}

export default async function DemoQuickStopsPage() {
  const { demand } = DEMO_QUICK_STOPS;
  const acceptRate = Math.round((demand.accepted / demand.asked) * 100);
  const waiting = DEMO_QUICK_STOPS.requests.filter((request) => request.status === 'waiting');

  // The explainer below is for somebody meeting Quick Stops for the first time.
  // A signed-in contractor gets the full one on their own page and does not need
  // the pitch twice, so it is logged-OUT only. A session read failure means we
  // cannot prove they're signed in — show it, which is the harmless direction.
  let isLoggedIn = false;
  try {
    const { data } = await createSupabaseServerClient().auth.getUser();
    isLoggedIn = Boolean(data.user);
  } catch {
    isLoggedIn = false;
  }

  return (
    <main className="wide-shell workspace-shell bset">
      <header className="bset-head">
        <div>
          <h1 className="qs-logo-head">
            <Image
              src="/brand/quick-stops-badge.png"
              alt="Quick Stops"
              width={300}
              height={77}
              priority
              className="qs-logo-badge"
            />
          </h1>
          <p>Let customers pay to be squeezed into a day you&apos;re already working near them.</p>
        </div>
        <span className="btn secondary bset-head-cta" aria-disabled="true">
          View booking page <Icon name="external" />
        </span>
      </header>

      {!isLoggedIn && (
        <QuickStopHeaderExplainer
          feeCents={DEMO_QUICK_STOPS.feeCents}
          radiusMiles={DEMO_QUICK_STOPS.radiusMiles}
          cutoffTime={DEMO_QUICK_STOPS.cutoffTime}
          maxPerDay={DEMO_QUICK_STOPS.maxPerDay}
          todayTaken={DEMO_QUICK_STOPS.todayTaken}
        />
      )}

      <section className="bset-master">
        <span className="bset-master-switch">
          <span className="bset-switch-track" aria-hidden="true"><span /></span>
          <span className="bset-master-copy">
            <strong>Quick Stops is <em className="on">ON</em></strong>
            <small>Customers within {DEMO_QUICK_STOPS.radiusMiles} miles can ask to be added to today.</small>
          </span>
        </span>

        <div className="bset-master-status live">
          <p><span className="bset-dot" aria-hidden="true" />Live</p>
          <small>
            {money(DEMO_QUICK_STOPS.feeCents)} a stop · asking closes at {clockLabel(DEMO_QUICK_STOPS.cutoffTime)} ·{' '}
            {DEMO_QUICK_STOPS.todayTaken} of {DEMO_QUICK_STOPS.maxPerDay} taken today
          </small>
        </div>
      </section>

      <div className="bset-cards">
        <div className="bset-card">
          <span className="bset-card-icon tone-link"><Icon name="repeat" /></span>
          <span className="bset-card-label">The fee</span>
          <strong>{money(DEMO_QUICK_STOPS.feeCents)}</strong>
          <small>Held, not charged, until you accept</small>
        </div>
        <div className="bset-card">
          <span className="bset-card-icon tone-days"><Icon name="calendar" /></span>
          <span className="bset-card-label">How near</span>
          <strong>{DEMO_QUICK_STOPS.radiusMiles} miles</strong>
          <small>Of somewhere you are already working</small>
        </div>
        <div className="bset-card">
          <span className="bset-card-icon tone-time"><Icon name="clock" /></span>
          <span className="bset-card-label">Cutoff</span>
          <strong>{clockLabel(DEMO_QUICK_STOPS.cutoffTime)}</strong>
          <small>After that, today is closed</small>
        </div>
        <div className="bset-card">
          <span className="bset-card-icon tone-off"><Icon name="briefcase" /></span>
          <span className="bset-card-label">Most in a day</span>
          <strong>{DEMO_QUICK_STOPS.maxPerDay} stops</strong>
          <small>So a good day cannot bury the crew</small>
        </div>
      </div>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Today{waiting.length > 0 ? ` · ${waiting.length} waiting on you` : ''}</p>
          <h2>Asked to be squeezed in</h2>
        </div>
        <div className="job-list">
          {DEMO_QUICK_STOPS.requests.map((request) => (
            <div className="job-row" key={request.id}>
              <div className="job-row-header">
                <span className="job-ref">Quick Stop · {agoLabel(request.minutesAgo)}</span>
                <span className={`status-badge ${STATUS_TONE[request.status]}`}>{STATUS_LABEL[request.status]}</span>
              </div>
              <div className="job-client">{request.name}</div>
              <div className="job-row-header" style={{ marginTop: '0.4rem' }}>
                <span className="job-meta">{request.address}</span>
                <span className="job-quoted">{money(request.feeCents)}</span>
              </div>
              <p className="job-meta" style={{ margin: '0.45rem 0 0' }}>{request.what}</p>
              <div className="job-row-header" style={{ marginTop: '0.45rem' }}>
                <span className="job-meta">
                  {/* Added minutes, not distance — a three-mile detour into rush hour
                      costs more than a six-mile one down the road you're on. */}
                  +{request.detourMinutes} min added to your route
                  {request.slot ? ` · holding ${request.slot}` : ''}
                  {request.status === 'declined' && 'declineReason' in request ? ` · ${request.declineReason}` : ''}
                </span>
                {request.status === 'waiting' ? (
                  <span className="schedule-action-buttons">
                    <button type="button" className="btn primary" disabled>Accept &amp; charge</button>
                    <button type="button" className="btn secondary" disabled>Not today</button>
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel workspace-section-card es-demand-tell">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Last {demand.windowDays} days</p>
          <h2 className="es-demand-headline">Is this worth having on?</h2>
        </div>
        <p className="es-demand-lede">
          Both halves, because only one of them is flattering. {demand.asked} people asked, you took {demand.accepted} of
          them ({acceptRate}%), and the {demand.declined} you turned away are listed too — a panel that only counts the
          wins cannot tell you whether your radius is wrong.
        </p>

        <div className="es-earnings">
          <span className="es-earnings-label">Fees earned</span>
          <strong className="es-earnings-total">${(demand.earned / 100).toLocaleString('en-US')}</strong>
          <span className="es-earnings-note">
            On top of the work itself — these are stops that were already on your way.
          </span>
        </div>

        <div className="es-demand-reasons">
          <p className="es-demand-reasons-label">Why the other {demand.declined} did not happen</p>
          <div className="es-demand-chips">
            {demand.refusedReasons.map((row) => (
              <span className="es-demand-chip" key={row.reason}>
                {row.reason} <b>{row.count}</b>
              </span>
            ))}
          </div>
          <p className="es-demand-note">
            Six outside the radius and five after the cutoff is the shape of a setting that is slightly too tight, not of a
            feature nobody wants.
          </p>
        </div>
      </section>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Before it reaches you</p>
          <h2>What gets screened out</h2>
        </div>
        <ul className="cash-where-list">
          <li>
            <strong>Anything that is not a stop</strong> — &ldquo;regrade the whole backyard&rdquo; is a quote, not a
            fifteen-minute visit. It comes back as a normal lead instead of a refusal.
          </li>
          <li>
            <strong>Anything unsafe or out of trade</strong> — gas, live electrical, anything needing a permit. The screen
            is deterministic, so the same request is always answered the same way.
          </li>
          <li>
            <strong>Anything that would break the day</strong> — past your cutoff, outside the radius, or a day already at{' '}
            {DEMO_QUICK_STOPS.maxPerDay} stops. The customer is told immediately rather than left holding a card.
          </li>
        </ul>
        <p className="cash-bills-lead">
          Money is only taken once you accept. Until then it is an authorisation you can let go, and the customer can cancel
          it themselves. <Link href="/demo/schedule/plan">See where a stop lands on the route →</Link>
        </p>
      </section>

      <section className="panel workspace-section-card qs-foot">
        <p className="qs-foot-copy">
          Customers reach this from {DEMO_SITE_HOST} — it is the same booking page, with a &ldquo;need it today?&rdquo;
          option that only appears when you are actually working nearby.
        </p>
      </section>
    </main>
  );
}
