import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { listCrew } from '@/lib/crew';
import { getDayPlanPrefs } from '@/lib/day-plan-prefs';
import { coordOf, type LatLng } from '@/lib/distance';
import { driveMatrix, DRIVE_MATRIX_MAX_POINTS } from '@/lib/drive-time';
import { arrivalWindow, formatTimeLabel, parseTimeMinutes, planDayRoute, scheduleOrder, type PlanStop } from '@/lib/route-plan';
import {
  accountToday,
  findNearestDayWithJobs,
  getPlanAccountSettings,
  listDayJobs,
  resolveDayAnchor,
  toPlanStop,
} from '@/lib/route-plan-day';
import { listDayRouteStops, listSavedPlaces, toPlanStop as routeStopToPlanStop } from '@/lib/route-stops';
import { listUpcomingBlocks } from '@/lib/availability-blocks';
import type { DayPlanPayload, DriveMatrixPayload } from '@/lib/day-plan-view';
import SaveButton from '@/components/save-button';
import WorkingHoursPanel from '@/components/working-hours-panel';
import QuickStopPanel from '@/components/quick-stop-panel';
import { QUICK_STOP_SETTINGS_COLUMNS, quickStopSettingsFromAccount } from '@/lib/quick-stop';
import { loadOfferContext, offerDisplay } from '@/lib/estimate-offers-data';
import { loadRescheduleContext } from '@/lib/reschedule-offers-data';
import { DEFAULT_ESTIMATE_MINUTES, draftOfferBody, rankOfferSuggestions, timeFromMinutes } from '@/lib/estimate-offers';
import DayPlanner from './DayPlanner';
import PlanDayControls from './PlanDayControls';
import EstimateOffers, { type OfferSuggestionView, type OfferView } from './EstimateOffers';
import { geocodeDayAction, notifyMovedClientsAction } from './actions';

export const dynamic = 'force-dynamic';

function dayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function shiftDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// How the day gets referred to inside a text to a homeowner. "today" and
// "tomorrow" are what a person would say; anything further out gets its name.
function dayWordFor(dateKey: string, todayKey: string): string {
  if (dateKey === todayKey) return 'today';
  if (dateKey === shiftDateKey(todayKey, 1)) return 'tomorrow';
  const [y, m, d] = dateKey.split('-').map(Number);
  return `on ${new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long' })}`;
}

// The order the calendar is in right now: by committed time, untimed stops last.
function currentOrderOf(stops: PlanStop[]): string[] {
  return [...stops]
    .sort((a, b) => {
      const aTime = parseTimeMinutes(a.scheduledTime);
      const bTime = parseTimeMinutes(b.scheduledTime);
      if (aTime == null && bTime == null) return 0;
      if (aTime == null) return 1;
      if (bTime == null) return -1;
      return aTime - bTime;
    })
    .map((stop) => stop.id);
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
    failed?: string;
    stranded?: string;
    geocoded?: string;
  };
}) {
  const { supabase, accountId } = await requireOwnerContext();

  const crew = await listCrew(supabase, accountId, { activeOnly: true });
  const crewId = searchParams.crew && crew.some((member) => member.id === searchParams.crew) ? searchParams.crew : null;
  const crewName = crewId ? crew.find((member) => member.id === crewId)?.name ?? null : null;

  const settings = await getPlanAccountSettings(supabase, accountId);
  const requestedDate = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date ?? '') ? (searchParams.date as string) : null;
  const dateKey = requestedDate ?? accountToday(settings.timezone);

  const [{ jobs, filteredOutCount }, dayRouteStops, savedPlaces, anchor] = await Promise.all([
    listDayJobs(supabase, accountId, dateKey, crewId),
    listDayRouteStops(supabase, accountId, dateKey, crewId),
    listSavedPlaces(supabase, accountId),
    resolveDayAnchor(supabase, accountId, crewId, settings),
  ]);

  // Supply stops route exactly like jobs — same coordinates, same minutes, same
  // proposed arrival — so from here down there's no distinction to make.
  const stops = [
    ...jobs.map((job) => toPlanStop(job, settings.defaultVisitMinutes)),
    ...dayRouteStops.map(routeStopToPlanStop),
  ];
  const routable = stops.filter((stop) => stop.lat != null && stop.lng != null);
  const unroutable = stops.filter((stop) => stop.lat == null || stop.lng == null);

  // One drive-matrix lookup for the whole day, covering every pair of stops. That
  // single request is what makes dragging free: any order the contractor tries
  // afterwards is costed from this matrix in the browser.
  let matrix: Map<string, { miles: number; minutes: number }> | undefined;
  let driveTimeSkipped: 'too_many_stops' | null = null;
  if (settings.driveTimeEnabled) {
    const points: Array<{ id: string; coord: LatLng }> = [];
    if (anchor.coord) points.push({ id: 'start', coord: anchor.coord });
    for (const stop of routable) {
      const coord = coordOf(stop);
      if (coord) points.push({ id: stop.id, coord });
    }
    if (points.length >= 2 && points.length <= DRIVE_MATRIX_MAX_POINTS) {
      matrix = (await driveMatrix(points)) ?? undefined;
    } else if (points.length > DRIVE_MATRIX_MAX_POINTS) {
      driveTimeSkipped = 'too_many_stops';
    }
  }

  const planInput = {
    stops,
    homeBase: anchor.coord,
    workdayStart: settings.workdayStart,
    workdayEnd: settings.workdayEnd,
    bufferMinutes: settings.bufferMinutes,
    defaultVisitMinutes: settings.defaultVisitMinutes,
    matrix,
  };
  const optimized = planDayRoute(planInput);
  const currentOrder = currentOrderOf(routable);
  const currentPlan = scheduleOrder(currentOrder, planInput);

  let blockedReason: string | null = null;
  try {
    const blocks = await listUpcomingBlocks(supabase, accountId, dateKey);
    const covering = blocks.find((b) => b.start_date <= dateKey && dateKey <= b.end_date);
    if (covering) blockedReason = covering.reason?.trim() || 'Blocked off';
  } catch {
    // A blocks read failure must not stop the plan; worst case we don't warn.
  }

  // What the contractor decided about this day last time they looked at it —
  // so a route planned the night before is still planned in the morning. A
  // preference pointing at a stop that has since left the day is dropped here
  // rather than shipped to the browser to be ignored.
  const prefs = await getDayPlanPrefs(supabase, accountId, dateKey, crewId);
  const preferredLastId =
    prefs.preferredLastId && routable.some((stop) => stop.id === prefs.preferredLastId) ? prefs.preferredLastId : null;

  // Quick Stop, for the panel under the route. Read here rather than guessed:
  // whether it's on, whether support has paused it, and whether it was ever set
  // up at all are three different answers and the panel says which.
  const { data: quickStopRow } = await supabase
    .from('accounts')
    .select(`${QUICK_STOP_SETTINGS_COLUMNS}, business_name`)
    .eq('id', accountId)
    .maybeSingle();
  const quickStop = quickStopSettingsFromAccount((quickStopRow ?? {}) as Parameters<typeof quickStopSettingsFromAccount>[0]);
  const businessName = ((quickStopRow as { business_name?: string } | null)?.business_name || "Let's Get Quoted").trim();
  const { count: quickStopToday } = await supabase
    .from('extra_stop_requests')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('arrival_date', dateKey)
    .in('status', ['confirmed', 'en_route', 'arrived', 'completed']);

  // Leads sitting close to a hole in today's route.
  //
  // Measured against the day as the CALENDAR has it, not against the optimized
  // proposal: a window we promise a homeowner has to exist in the day that is
  // actually booked, not in one the contractor may never apply.
  const offerContext = routable.length > 0 ? await loadOfferContext(supabase, accountId, dateKey) : null;
  // The mirror of the above: who we have already asked to move OFF this day, so
  // the row can say 'waiting on reply' rather than offering to ask them twice.
  const rescheduleContext = await loadRescheduleContext(supabase, accountId, dateKey);
  const now = new Date();
  let offerSuggestions: OfferSuggestionView[] = [];
  let offerViews: OfferView[] = [];
  let offerEmptyReason: string | null = null;

  if (offerContext?.available) {
    offerViews = offerContext.offers.map((offer) => {
      const display = offerDisplay(offer, now);
      return {
        id: offer.id,
        leadId: offer.lead_id,
        leadName: offerContext.offerLeadNames.get(offer.lead_id) ?? 'Unnamed lead',
        windowLabel: display.windowLabel,
        status: display.status,
        holding: display.hold.holding,
        minutesLeft: display.hold.minutesLeft,
        expiresLabel: display.hold.expiresLabel,
        replyBody: offer.reply_body,
        arrivalLabel: formatTimeLabel(parseTimeMinutes(offer.arrival_time) ?? 0),
      };
    });

    const dayWord = dayWordFor(dateKey, accountToday(settings.timezone));
    const ranked = rankOfferSuggestions({
      placement: {
        planned: currentPlan.planned,
        homeBase: anchor.coord,
        workdayStartMinutes: parseTimeMinutes(settings.workdayStart) ?? 8 * 60,
        workdayEndMinutes: parseTimeMinutes(settings.workdayEnd) ?? 17 * 60,
        bufferMinutes: settings.bufferMinutes,
        visitMinutes: DEFAULT_ESTIMATE_MINUTES,
      },
      leads: offerContext.candidates,
      alreadyOfferedLeadIds: offerContext.offeredLeadIds,
      // A slot someone is still deciding about is not a free slot.
      blocked: offerViews
        .filter((view) => view.holding)
        .map((view) => {
          const offer = offerContext.offers.find((row) => row.id === view.id)!;
          return {
            startMinutes: parseTimeMinutes(offer.window_start) ?? 0,
            endMinutes: parseTimeMinutes(offer.window_end) ?? 0,
          };
        }),
    });

    offerSuggestions = ranked.map(({ lead, placement, window }) => ({
      leadId: lead.id,
      leadName: lead.name?.trim() || 'Unnamed lead',
      projectType: lead.projectType,
      address: lead.address,
      detourMiles: Number(placement.detourMiles.toFixed(1)),
      detourMinutes: placement.detourMinutes,
      addedMinutes: placement.addedMinutes,
      afterStopLabel: placement.afterStopLabel,
      beforeStopLabel: placement.beforeStopLabel,
      windowStart: timeFromMinutes(window.startMinutes),
      windowEnd: timeFromMinutes(window.endMinutes),
      arrivalTime: timeFromMinutes(window.arrivalMinutes),
      windowLabel: window.label,
      afterStopId: placement.afterStopId,
      defaultBody: draftOfferBody({
        leadName: lead.name,
        projectType: lead.projectType,
        windowLabel: window.label,
        dayWord,
      }),
    }));

    if (ranked.length === 0) {
      offerEmptyReason =
        offerContext.candidates.length === 0
          ? 'No open leads with a mapped address right now. A lead needs a street address we can put on the map before we can tell whether they’re near you.'
          : 'None of your open leads sit close enough to a gap in this day. We only suggest one where the detour is short and there’s at least an hour free — so this stays quiet most days.';
    }
  }

  const matrixPayload: DriveMatrixPayload = matrix ? Object.fromEntries(matrix) : {};
  const payload: DayPlanPayload = {
    dateKey,
    crewId,
    crewName,
    stops: routable,
    optimizedOrder: optimized.planned.map((entry) => entry.stop.id),
    currentOrder,
    homeBase: anchor.coord,
    homeAddress: anchor.address,
    anchorSource: anchor.source,
    anchorCrewName: anchor.crewName,
    routeStops: dayRouteStops,
    savedPlaces,
    workdayStart: settings.workdayStart,
    workdayEnd: settings.workdayEnd,
    bufferMinutes: settings.bufferMinutes,
    defaultVisitMinutes: settings.defaultVisitMinutes,
    matrix: matrixPayload,
    driveTimeSource: optimized.driveTimeSource,
    driveTimeSkipped,
    anchor: optimized.anchor,
    lockedCount: routable.filter((stop) => stop.locked).length,
    filteredOutCount,
    preferredLastId,
    businessName,
    rescheduleAvailable: rescheduleContext.available,
    pendingRescheduleJobIds: [...rescheduleContext.pendingJobIds],
  };

  const crewQuery = crewId ? `&crew=${crewId}` : '';
  const appliedCount = Number(searchParams.applied);
  const keptCount = Number(searchParams.kept);
  const textedCount = Number(searchParams.texted);
  const untextedCount = Number(searchParams.untexted);
  const strandedCount = Number(searchParams.stranded);
  const justMovedIds = (searchParams.moved ?? '').split(',').filter(Boolean);
  const justMoved = currentPlan.planned.filter((entry) => justMovedIds.includes(entry.stop.id));

  const nearestWorkDay =
    routable.length === 0 && unroutable.length === 0
      ? await findNearestDayWithJobs(supabase, accountId, dateKey)
      : null;

  return (
    <main className="wide-shell plan-shell">
      <header className="plan-header">
        <div className="plan-header-title">
          <p className="eyebrow">Plan my day</p>
          <h1>{dayLabel(dateKey)}</h1>
        </div>

        <div className="plan-header-controls">
          <div className="plan-daynav">
            <Link href={`/dashboard/schedule/plan?date=${shiftDateKey(dateKey, -1)}${crewQuery}`} className="btn ghost">
              ← Previous day
            </Link>
            <Link href={`/dashboard/schedule/plan?date=${accountToday(settings.timezone)}${crewQuery}`} className="btn ghost">
              Today
            </Link>
            <Link href={`/dashboard/schedule/plan?date=${shiftDateKey(dateKey, 1)}${crewQuery}`} className="btn ghost">
              Next day →
            </Link>
          </div>
          <PlanDayControls dateKey={dateKey} crewId={crewId} crew={crew.map((m) => ({ id: m.id, name: m.name }))} />
          <Link href="/dashboard/schedule" className="btn ghost plan-back">Back to calendar</Link>
        </div>
      </header>

      {blockedReason ? (
        <p className="plan-flash warn">
          You&apos;ve marked this day off — {blockedReason}. Planning it anyway is fine; just checking you meant this day.
        </p>
      ) : null}
      {searchParams.failed === '1' ? (
        <p className="plan-flash warn">
          {strandedCount > 0
            ? `Couldn't save the whole route, and ${strandedCount} ${strandedCount === 1 ? 'stop' : 'stops'} could not be put back — check the times below against your calendar before relying on them.`
            : "Couldn't save the route, so nothing was changed — your calendar is exactly as it was. Try again."}
        </p>
      ) : null}
      {searchParams.geocoded !== undefined ? (
        <p className={`plan-flash ${Number(searchParams.geocoded) > 0 ? 'good' : 'warn'}`}>
          {Number(searchParams.geocoded) > 0
            ? `Put ${searchParams.geocoded} job${searchParams.geocoded === '1' ? '' : 's'} on the map — they can be routed now.`
            : 'Couldn’t place any of them. Check the addresses are real street addresses, not just a city or a note.'}
        </p>
      ) : null}
      {appliedCount > 0 ? (
        <p className="plan-flash good">
          Saved — {appliedCount} start {appliedCount === 1 ? 'time' : 'times'} updated on your calendar.
        </p>
      ) : null}
      {searchParams.applied === '0' ? (
        <p className="plan-flash">Nothing needed changing — your calendar already matches this plan.</p>
      ) : null}
      {keptCount > 0 ? (
        <p className="plan-flash">
          {keptCount} confirmed {keptCount === 1 ? 'appointment' : 'appointments'} kept the time the customer agreed to.
        </p>
      ) : null}
      {textedCount > 0 ? (
        <p className="plan-flash good">Texted {textedCount} {textedCount === 1 ? 'customer' : 'customers'} their new arrival time.</p>
      ) : null}
      {untextedCount > 0 ? (
        <p className="plan-flash warn">
          {untextedCount} {untextedCount === 1 ? "customer couldn't" : "customers couldn't"} be texted — no mobile on file, or they opted out.
        </p>
      ) : null}

      {/* Without a mapped start point every day's mileage is short by the drive
          out and the drive home — often the two longest legs. Dismissible, and
          it never blocks planning. */}
      {routable.length > 0 && !anchor.coord ? (
        <details className="panel plan-panel plan-nohome">
          <summary>
            <strong>This day&apos;s mileage is missing the drive out and back</strong>
            <span>
              No mapped {crewId ? 'start address for this crew member' : 'business address'} yet, so the route is
              measured stop to stop.
            </span>
          </summary>
          <p>
            {crewId
              ? 'Set where this crew member starts their day and their route will be measured from there.'
              : 'Add your business address and every day will include the drive to the first job and back from the last.'}
          </p>
          <Link href={crewId ? '/dashboard/crew' : '/dashboard/settings#marketing-address'} className="btn primary">
            {crewId ? 'Open the crew roster' : 'Add your business address'}
          </Link>
        </details>
      ) : null}

      {routable.length === 0 ? (
        <section className="panel plan-panel plan-empty">
          <h2>{unroutable.length > 0 ? 'No mappable stops on this day' : 'Nothing scheduled for this day'}</h2>
          <p>
            {unroutable.length > 0
              ? 'The jobs on this day have no address we could put on a map. Add a street address to each job and come back.'
              : 'There are no active jobs scheduled for this day yet.'}
          </p>
          <p className="form-actions">
            {nearestWorkDay ? (
              <Link href={`/dashboard/schedule/plan?date=${nearestWorkDay.dateKey}${crewQuery}`} className="btn primary">
                {nearestWorkDay.direction === 'next' ? 'Go to your next day out' : 'Go to your last day out'} &mdash;{' '}
                {dayLabel(nearestWorkDay.dateKey)}
              </Link>
            ) : null}
            <Link href="/dashboard/schedule" className={nearestWorkDay ? 'btn secondary' : 'btn primary'}>
              Open the calendar
            </Link>
          </p>
        </section>
      ) : (
        <DayPlanner payload={payload} mapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null} />
      )}

      {/* Right under the route, because it's about the holes in it. */}
      {offerContext?.available ? (
        <EstimateOffers
          dateKey={dateKey}
          crewId={crewId}
          businessName={businessName}
          suggestions={offerSuggestions}
          offers={offerViews}
          emptyReason={offerEmptyReason}
        />
      ) : null}

      {justMoved.length > 0 ? (
        <section className="panel plan-panel">
          <h2>Let those customers know?</h2>
          <p>
            {justMoved.length} {justMoved.length === 1 ? 'customer has' : 'customers have'} a different arrival time than
            before. We won&apos;t text anyone unless you say so.
          </p>
          {/* The window shown here is the window that gets sent — a preview that
              said "8:07 AM" while the text said "7:07 AM to 9:07 AM" would be a
              preview of a different message. */}
          <ul className="plan-notify-list">
            {justMoved.map((entry) => (
              <li key={entry.stop.id}>
                <strong>{entry.stop.label}</strong> —{' '}
                {arrivalWindow(entry.arrivalMinutes, { earliestMinutes: parseTimeMinutes(settings.workdayStart) }).label}
              </li>
            ))}
          </ul>
          <p className="plan-notify-note">
            Customers get a window, not a single time. It runs an hour either side of the estimate, and never starts
            before your workday does.
          </p>
          <form action={notifyMovedClientsAction}>
            <input type="hidden" name="dateKey" value={dateKey} />
            <input type="hidden" name="crewId" value={crewId ?? ''} />
            <input type="hidden" name="jobIds" value={justMoved.map((entry) => entry.stop.id).join(',')} />
            <SaveButton>Text them the new time</SaveButton>
          </form>
        </section>
      ) : null}

      {unroutable.length > 0 ? (
        <section className="panel plan-panel">
          <h2>Can&apos;t be routed yet</h2>
          <p>
            These jobs are on this day but have no address we could map, so they keep their current times and aren&apos;t
            part of the route above. We retry these overnight — or map them now.
          </p>
          <form action={geocodeDayAction} style={{ margin: '1rem 0' }}>
            <input type="hidden" name="dateKey" value={dateKey} />
            <input type="hidden" name="crewId" value={crewId ?? ''} />
            <SaveButton>Try to map these now</SaveButton>
          </form>
          <div className="sign-in-methods-list">
            {unroutable.map((stop) => (
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
      {/* Every arrival time above is derived from these, so this is where they
          belong — not two clicks deep in Settings. */}
      <QuickStopPanel
        enabled={quickStop.enabled}
        locked={quickStop.locked}
        lockedUntil={quickStop.lockedUntil}
        // Never configured looks exactly like "off" on a boolean, and offering a
        // switch over an unset fee band would put work on rules nobody chose.
        configured={quickStop.maxFeeCents > 0 && quickStop.weekdays.length > 0}
        todayCount={quickStopToday ?? 0}
      />

      <WorkingHoursPanel
        scheduleDayHours={settings.scheduleDayHours}
        jobBufferMinutes={settings.bufferMinutes}
        workdayStart={settings.workdayStart}
        workdayEnd={settings.workdayEnd}
      />
    </main>
  );
}
