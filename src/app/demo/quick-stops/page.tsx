import Image from 'next/image';
import Link from 'next/link';
import { Icon } from '@/app/dashboard/schedule/booking/icons';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { DEMO_QUICK_STOPS, DEMO_SITE_HOST } from '@/lib/demo-data';
import QuickStopHeaderExplainer from './QuickStopHeaderExplainer';
import QuickStopStatus from '@/app/dashboard/quick-stops/QuickStopStatus';
import QuickStopRequestCard, { type CardRequest } from '@/app/dashboard/quick-stops/QuickStopRequestCard';
import { DEMO_QUICK_STOP_CARDS } from '@/lib/demo-rows';

export const metadata = { title: 'Quick Stops — demo' };
export const dynamic = 'force-dynamic';

// Quick Stops on the real page is eight components deep and every one of them
// reaches for a server action, so this rebuilds the read-only half: the switch
// and its terms, today's requests, and the demand panel — which is the part that
// makes the case, because it counts the work you turned away as well as the work
// you took.

// The status labels, tones and "N min ago" helper that used to live here went
// with the replica request rows — QuickStopRequestCard renders all three itself,
// and a second copy of them is exactly what drifts.

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
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
          <p>
            Quick Stops lets nearby customers request a paid same-day visit. You review every request, choose the
            arrival window and fee, and accept only when it fits your route. Nothing is booked until the customer pays.
          </p>
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

      {/* The REAL status panel, read-only. It replaces a hand-drawn switch and
          a four-card row that had to be kept in step with the live one by hand —
          and had already drifted from it. Everything it shows is the same
          derivation an owner sees: which of the prerequisites are met, and which
          single one is missing when it is not live. */}
      <QuickStopStatus
        readOnly
        enabled
        locked={false}
        lockedUntil={null}
        lockReason=""
        feeSet
        daysSet
        stripeConnected
        bookingUrl={`https://${DEMO_SITE_HOST}/book`}
        dayNames="Mon – Fri"
        dayCount={5}
        hoursLabel={`8 AM – ${clockLabel(DEMO_QUICK_STOPS.cutoffTime)}`}
        feeLabel={money(DEMO_QUICK_STOPS.feeCents)}
        maxPerDay={DEMO_QUICK_STOPS.maxPerDay}
        todayCount={DEMO_QUICK_STOPS.todayTaken}
        openCount={waiting.length}
      />

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Today{waiting.length > 0 ? ` · ${waiting.length} waiting on you` : ''}</p>
          <h2>Same-day requests</h2>
        </div>
        {/* The REAL request card, read-only. It replaces a stripped-down row
            that showed a name, an address and two disabled buttons — while the
            card an owner sees carries the AI's read of the job, the visit
            estimate, the detour it costs against today's route, and the fee. The
            detour figure in particular is the argument for the whole feature and
            the replica never showed it in context. */}
        <div style={{ marginTop: '1rem' }}>
          {DEMO_QUICK_STOP_CARDS.map((request, index) => (
            <QuickStopRequestCard
              key={request.id}
              readOnly
              request={request as unknown as CardRequest}
              photoUrls={[]}
              route={{
                detourMiles: DEMO_QUICK_STOPS.requests[index]!.detourMinutes / 2.4,
                detourMinutes: DEMO_QUICK_STOPS.requests[index]!.detourMinutes,
                routeExtensionMinutes: DEMO_QUICK_STOPS.requests[index]!.detourMinutes,
                anchorLabel: 'your Rosewood Ct job',
              }}
              defaults={{
                earliest: '08:00',
                latest: DEMO_QUICK_STOPS.cutoffTime,
                minFeeDollars: DEMO_QUICK_STOPS.feeCents / 100,
                maxFeeDollars: DEMO_QUICK_STOPS.feeCents / 100,
              }}
            />
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
