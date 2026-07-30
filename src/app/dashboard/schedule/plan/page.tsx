import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { listCrew } from '@/lib/crew';
import { formatTimeLabel, parseTimeMinutes, type PlannedStop } from '@/lib/route-plan';
import { buildDayPlan } from '@/lib/route-plan-day';
import SaveButton from '@/components/save-button';
import { applyDayPlanAction, notifyMovedClientsAction } from './actions';

export const dynamic = 'force-dynamic';

function dayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function shiftDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function minutesLabel(total: number): string {
  const mins = Math.abs(Math.round(total));
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

// A stop's navigation target — the street address when we have one, coordinates
// otherwise, so "Navigate" always works for a routable stop.
function navTarget(stop: PlannedStop['stop']): string {
  if (stop.address) return stop.address;
  return `${stop.lat},${stop.lng}`;
}

// One Google Maps link for the whole day, with the stops as ordered waypoints.
function fullRouteUrl(planned: PlannedStop[]): string | null {
  if (planned.length < 2) return null;
  const points = planned.map((p) => navTarget(p.stop));
  const params = new URLSearchParams({
    api: '1',
    origin: points[0],
    destination: points[points.length - 1],
  });
  const waypoints = points.slice(1, -1);
  if (waypoints.length > 0) params.set('waypoints', waypoints.join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export default async function PlanDayPage({
  searchParams,
}: {
  searchParams: {
    date?: string;
    crew?: string;
    applied?: string;
    moved?: string;
    kept?: string;
    texted?: string;
    untexted?: string;
  };
}) {
  const { supabase, accountId } = await requireOwnerContext();

  const crew = await listCrew(supabase, accountId, { activeOnly: true });
  const crewId = searchParams.crew && crew.some((member) => member.id === searchParams.crew) ? searchParams.crew : null;
  const crewName = crewId ? crew.find((member) => member.id === crewId)?.name ?? null : null;

  // No date in the URL ⇒ today, resolved in the account's timezone by the planner.
  const requestedDate = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date ?? '') ? (searchParams.date as string) : null;
  const { plan, settings } = await buildDayPlan(supabase, accountId, requestedDate, crewId);
  const dateKey = plan.dateKey;

  const movedStops = plan.planned.filter((stop) => stop.moved);
  const canApply = movedStops.length > 0;
  const routeUrl = fullRouteUrl(plan.planned);
  const savesSomething = plan.savedMiles > 0 || plan.savedMinutes > 0;

  const appliedCount = Number(searchParams.applied);
  const keptCount = Number(searchParams.kept);
  const textedCount = Number(searchParams.texted);
  const untextedCount = Number(searchParams.untexted);
  const justMovedIds = (searchParams.moved ?? '').split(',').filter(Boolean);
  // Stops whose time we just changed. The notify action resolves who actually has
  // a mobile on file and reports back on anyone it couldn't reach.
  const justMoved = plan.planned.filter((stop) => justMovedIds.includes(stop.stop.id));

  const crewQuery = crewId ? `&crew=${crewId}` : '';

  return (
    <main className="wide-shell workspace-shell">
      <section className="panel workspace-section-card">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Plan my day</p>
          <h1 className="workspace-title">{dayLabel(dateKey)}</h1>
          <p className="workspace-lead">
            We order the day&apos;s stops into the shortest sensible route and suggest arrival times. Nothing changes on
            your calendar until you apply it — and appointments your customers already confirmed never move.
          </p>
        </div>

        <form method="get" className="route-plan-controls">
          <div className="field">
            <label htmlFor="planDate">Day</label>
            <input id="planDate" name="date" type="date" defaultValue={dateKey} />
          </div>
          {crew.length > 0 ? (
            <div className="field">
              <label htmlFor="planCrew">Crew member</label>
              <select id="planCrew" name="crew" defaultValue={crewId ?? ''}>
                <option value="">Everyone</option>
                {crew.map((member) => (
                  <option key={member.id} value={member.id}>{member.name}</option>
                ))}
              </select>
              <small className="field-hint">Plans one truck&apos;s route. Unassigned jobs stay in every plan.</small>
            </div>
          ) : null}
          <div className="form-actions route-plan-control-actions">
            <button type="submit" className="btn secondary">Show this day</button>
            <Link href={`/dashboard/schedule/plan?date=${shiftDateKey(dateKey, -1)}${crewQuery}`} className="btn ghost">← Prev day</Link>
            <Link href={`/dashboard/schedule/plan?date=${shiftDateKey(dateKey, 1)}${crewQuery}`} className="btn ghost">Next day →</Link>
            <Link href="/dashboard/schedule" className="btn ghost">Back to calendar</Link>
          </div>
        </form>

        {appliedCount > 0 ? (
          <p className="route-plan-flash good">
            ✓ Applied — {appliedCount} start {appliedCount === 1 ? 'time' : 'times'} updated on your calendar.
          </p>
        ) : null}
        {searchParams.applied === '0' ? (
          <p className="route-plan-flash">Nothing needed changing — your calendar already matches this plan.</p>
        ) : null}
        {keptCount > 0 ? (
          <p className="route-plan-flash">
            {keptCount} confirmed {keptCount === 1 ? 'appointment' : 'appointments'} kept the time the customer agreed to.
          </p>
        ) : null}
        {textedCount > 0 ? (
          <p className="route-plan-flash good">✓ Texted {textedCount} {textedCount === 1 ? 'customer' : 'customers'} their new arrival time.</p>
        ) : null}
        {untextedCount > 0 ? (
          <p className="route-plan-flash warn">
            {untextedCount} {untextedCount === 1 ? "customer couldn't" : "customers couldn't"} be texted — no mobile on file, or they opted out.
          </p>
        ) : null}
      </section>

      {plan.planned.length === 0 ? (
        <section className="panel workspace-section-card">
          <div className="section-heading workspace-section-heading compact-heading">
            <p className="eyebrow">Nothing to route</p>
            <h2>No mappable stops on this day</h2>
          </div>
          <p className="workspace-details-copy">
            {plan.unroutable.length > 0
              ? 'The jobs on this day have no address we could put on a map. Add a street address to each job and come back.'
              : 'There are no active jobs scheduled for this day yet.'}
          </p>
          <p className="form-actions">
            <Link href="/dashboard/schedule" className="btn primary">Open the calendar</Link>
          </p>
        </section>
      ) : (
        <>
          <section className="panel workspace-section-card">
            <div className="route-plan-summary">
              <div className={`route-plan-verdict ${savesSomething ? 'good' : ''}`}>
                {savesSomething ? (
                  <>
                    <strong>
                      Saves {plan.savedMiles > 0 ? `${plan.savedMiles} mi` : ''}
                      {plan.savedMiles > 0 && plan.savedMinutes > 0 ? ' and ' : ''}
                      {plan.savedMinutes > 0 ? minutesLabel(plan.savedMinutes) : ''} of driving
                    </strong>
                    <span>Reordering today&apos;s {plan.planned.length} stops tightens the route.</span>
                  </>
                ) : (
                  <>
                    <strong>{plan.alreadyOptimal ? 'Already the tightest route' : 'No driving to save here'}</strong>
                    <span>
                      {canApply
                        ? 'The order is right, but the start times below spread the day out more realistically.'
                        : 'Your calendar is already in the best order we can find for this day.'}
                    </span>
                  </>
                )}
              </div>
              <div className="workspace-metric-grid">
                <div className="workspace-metric-card">
                  <span className="workspace-metric-label">Driving now</span>
                  <strong className="workspace-metric-value">{plan.currentMiles} mi</strong>
                  <small>{minutesLabel(plan.currentMinutes)}</small>
                </div>
                <div className="workspace-metric-card accent">
                  <span className="workspace-metric-label">Driving planned</span>
                  <strong className="workspace-metric-value">{plan.plannedMiles} mi</strong>
                  <small>{minutesLabel(plan.plannedMinutes)}</small>
                </div>
              </div>
            </div>

            <ul className="route-plan-notes">
              <li>
                {plan.driveTimeSource === 'drive_matrix'
                  ? 'Distances are real driving distances from Google.'
                  : 'Distances are straight-line estimates at about 30 mph. Turn on real driving distance under Schedule → Instant booking for exact numbers.'}
              </li>
              <li>
                {plan.anchor === 'home_base'
                  ? `The day starts from your business address at ${formatTimeLabel(parseTimeMinutes(settings.workdayStart) ?? 480)}.`
                  : 'No geocoded business address yet, so the route is measured stop-to-stop. Add your mailing address in Settings → Business to include the drive out and back.'}
              </li>
              {plan.lockedCount > 0 ? (
                <li>
                  {plan.lockedCount} confirmed {plan.lockedCount === 1 ? 'appointment is' : 'appointments are'} pinned to
                  the time the customer agreed to — the rest of the day is routed around {plan.lockedCount === 1 ? 'it' : 'them'}.
                </li>
              ) : null}
              {plan.overflowMinutes > 0 ? (
                <li className="warn">
                  This day runs {minutesLabel(plan.overflowMinutes)} past your {formatTimeLabel(parseTimeMinutes(settings.workdayEnd) ?? 1020)} finish.
                </li>
              ) : null}
              {plan.filteredOutCount > 0 ? (
                <li>
                  {plan.filteredOutCount} {plan.filteredOutCount === 1 ? 'job is' : 'jobs are'} assigned to other crew and
                  {plan.filteredOutCount === 1 ? " isn't" : " aren't"} in {crewName ? `${crewName}'s` : 'this'} route.
                </li>
              ) : null}
            </ul>
          </section>

          <section className="panel workspace-section-card">
            <div className="section-heading workspace-section-heading">
              <p className="eyebrow">Proposed route</p>
              <h2>{plan.planned.length} stop{plan.planned.length === 1 ? '' : 's'}{crewName ? ` · ${crewName}` : ''}</h2>
              {routeUrl ? (
                <p className="workspace-details-copy">
                  <a href={routeUrl} target="_blank" rel="noopener noreferrer" className="btn secondary">
                    🧭 Open the whole route in Google Maps
                  </a>
                </p>
              ) : null}
            </div>

            <ol className="route-plan-list">
              {plan.planned.map((entry) => {
                const wasMinutes = parseTimeMinutes(entry.stop.scheduledTime);
                return (
                  <li className="route-plan-stop" key={entry.stop.id}>
                    <span className="route-plan-num">{entry.order}</span>
                    <div className="route-plan-stop-body">
                      <div className="route-plan-stop-top">
                        <Link href={`/dashboard/jobs/${entry.stop.id}`} className="route-plan-stop-name">
                          {entry.stop.label}
                        </Link>
                        <span className="route-plan-time">
                          <strong>{formatTimeLabel(entry.arrivalMinutes)}</strong>
                          {entry.moved ? (
                            <small>{wasMinutes == null ? 'no time set before' : `was ${formatTimeLabel(wasMinutes)}`}</small>
                          ) : (
                            <small>unchanged</small>
                          )}
                        </span>
                      </div>
                      <p className="route-plan-stop-addr">{entry.stop.address || 'No address on file'}</p>
                      <p className="route-plan-stop-meta">
                        {entry.order === 1 && plan.anchor === 'first_stop'
                          ? 'First stop of the day'
                          : `${entry.legMiles} mi · ${minutesLabel(entry.legMinutes)} drive`}
                        {' · '}
                        {minutesLabel(entry.stop.visitMinutes)} on site
                      </p>
                      <div className="route-plan-badges">
                        {entry.stop.locked ? <span className="route-plan-badge locked">🔒 Customer confirmed</span> : null}
                        {entry.late ? <span className="route-plan-badge warn">Tight — you may run late here</span> : null}
                        {entry.waitMinutes >= 15 ? (
                          <span className="route-plan-badge">{minutesLabel(entry.waitMinutes)} gap before this stop</span>
                        ) : null}
                      </div>
                    </div>
                    {entry.stop.address || (entry.stop.lat != null && entry.stop.lng != null) ? (
                      <a
                        className="route-plan-nav"
                        href={`https://maps.google.com/?q=${encodeURIComponent(navTarget(entry.stop))}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Navigate to ${entry.stop.label}`}
                      >
                        🧭
                      </a>
                    ) : null}
                  </li>
                );
              })}
            </ol>

            <form action={applyDayPlanAction} className="route-plan-apply">
              <input type="hidden" name="dateKey" value={dateKey} />
              <input type="hidden" name="crewId" value={crewId ?? ''} />
              {plan.planned.map((entry) => (
                <input key={entry.stop.id} type="hidden" name="stop" value={`${entry.stop.id}:${entry.arrivalTime}`} />
              ))}
              {canApply ? (
                <>
                  <p className="route-plan-apply-copy">
                    Applying updates {movedStops.length} start {movedStops.length === 1 ? 'time' : 'times'} on your
                    calendar. Your crew sees the new order in the field app straight away.
                  </p>
                  <SaveButton>Apply this route</SaveButton>
                </>
              ) : (
                <p className="route-plan-apply-copy">
                  Nothing to apply — every stop is already at the time this plan suggests.
                </p>
              )}
            </form>
          </section>

          {justMoved.length > 0 ? (
            <section className="panel workspace-section-card">
              <div className="section-heading workspace-section-heading compact-heading">
                <p className="eyebrow">One more thing</p>
                <h2>Let those customers know?</h2>
              </div>
              <p className="workspace-details-copy">
                {justMoved.length} {justMoved.length === 1 ? 'customer has' : 'customers have'} a different arrival time
                than before. We won&apos;t text anyone unless you say so.
              </p>
              <ul className="route-plan-notify-list">
                {justMoved.map((entry) => (
                  <li key={entry.stop.id}>
                    <strong>{entry.stop.label}</strong> — now {formatTimeLabel(entry.arrivalMinutes)}
                  </li>
                ))}
              </ul>
              <form action={notifyMovedClientsAction}>
                <input type="hidden" name="dateKey" value={dateKey} />
                <input type="hidden" name="crewId" value={crewId ?? ''} />
                <input type="hidden" name="jobIds" value={justMoved.map((entry) => entry.stop.id).join(',')} />
                <SaveButton>Text them the new time</SaveButton>
              </form>
            </section>
          ) : null}

          {plan.unroutable.length > 0 ? (
            <section className="panel workspace-section-card">
              <div className="section-heading workspace-section-heading compact-heading">
                <p className="eyebrow">Left out</p>
                <h2>Can&apos;t be routed yet</h2>
              </div>
              <p className="workspace-details-copy">
                These jobs are on this day but have no address we could map, so they keep their current times and
                aren&apos;t part of the route above.
              </p>
              <div className="sign-in-methods-list">
                {plan.unroutable.map((stop) => (
                  <div className="sign-in-method-row" key={stop.id}>
                    <div className="method-info">
                      <div>
                        <Link className="method-name" href={`/dashboard/jobs/${stop.id}`}>{stop.label}</Link>
                        <span className="method-detail">
                          {stop.address ? `Couldn't map "${stop.address}"` : 'No address on file'}
                          {stop.scheduledTime ? ` · ${formatTimeLabel(parseTimeMinutes(stop.scheduledTime) ?? 0)}` : ' · No time set'}
                        </span>
                      </div>
                    </div>
                    <Link href={`/dashboard/jobs/${stop.id}`} className="btn ghost">Add an address</Link>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
