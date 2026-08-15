'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PinMap, { type MapPin } from '@/components/pin-map';
import ViewGear from '@/components/view-gear';
import type { MapTheme, MapView } from '@/lib/dashboard-views';
import { setMapThemeAction, setMapViewAction } from '../view-actions';

/**
 * Where the work is — on request.
 *
 * IT USED TO BE OPEN BY DEFAULT AND IT IS EXPENSIVE. Measured at 390px it was
 * most of what was left of the page once the settings moved off: a Google map,
 * its script, its tiles and its markers, mounted on every load of a screen an
 * owner opens dozens of times a day, below a calendar they came here to read.
 * The gear could turn it off, which is a control you have to already know about
 * to escape a cost you did not choose.
 *
 * Closed is now the default ON THIS PAGE ONLY — the leads and customers maps are
 * the point of their screens and are untouched. An explicit choice still
 * persists, so anyone who opens it keeps it open (see mapViewCookie('schedule')).
 *
 * NOTHING IS MOUNTED WHILE IT IS CLOSED. Not hidden with CSS: PinMap in a
 * display:none container initialises Google Maps into a 0x0 box and has to be
 * torn down and rebuilt when it appears, and the script and tiles are fetched
 * either way. Closed means the component does not exist.
 *
 * AND A MAP IS NOT THE ONLY WAY TO READ A TERRITORY. Pins answer "where",
 * badly for anything you need to compare — you cannot sort a map by value, or
 * scan it for the two jobs in one town. The list beside it is scheduled work as
 * rows, sortable, and it is the only one of the two a screen reader can use.
 *
 * IT IS NOT THE SAME SET AS THE PINS, and it never was. The list is the month
 * the calendar is on; the pins are every active job and lead there is, at any
 * date. Each tab's own label carries its span — visibly, not only in its
 * accessible name.
 */

export type ScheduleMapJob = {
  id: string;
  client_name: string;
  city_label: string | null;
  scheduled_for: string;
  scheduled_time: string | null;
  value_label: string | null;
  hours_label: string | null;
  crew_initials: string[];
};

type SortKey = 'date' | 'client' | 'city' | 'value';

/** Money back out of "$1,240" for sorting. The label is what gets shown; this
 *  is only ever used to order rows, so a null sorts last rather than as zero. */
function valueOf(label: string | null): number {
  if (!label) return -1;
  const digits = label.replace(/[^\d.]/g, '');
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : -1;
}

export default function ScheduleMap({
  pins,
  mapView,
  mapTheme,
  jobs,
  monthLabel,
}: {
  pins: MapPin[];
  mapView: MapView;
  mapTheme: MapTheme;
  /** The scheduled work on the calendar's month — the list half. */
  jobs: ScheduleMapJob[];
  monthLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [tab, setTab] = useState<'map' | 'list'>('map');
  const [sort, setSort] = useState<SortKey>('date');

  function setMap(next: MapView) {
    startTransition(async () => {
      await setMapViewAction(next, 'schedule');
      router.refresh();
    });
  }
  function setTheme(next: MapTheme) {
    startTransition(async () => {
      await setMapThemeAction(next);
      router.refresh();
    });
  }

  const sorted = useMemo(() => {
    const rows = [...jobs];
    switch (sort) {
      case 'client':
        return rows.sort((a, b) => a.client_name.localeCompare(b.client_name));
      // Unplaced work sorts last rather than under a blank heading — "no
      // address on file" is a fact about the job, not a town called nothing.
      case 'city':
        return rows.sort((a, b) => (a.city_label ?? '￿').localeCompare(b.city_label ?? '￿'));
      case 'value':
        return rows.sort((a, b) => valueOf(b.value_label) - valueOf(a.value_label));
      default:
        return rows.sort((a, b) =>
          `${a.scheduled_for}${a.scheduled_time ?? '99:99'}`.localeCompare(`${b.scheduled_for}${b.scheduled_time ?? '99:99'}`));
    }
  }, [jobs, sort]);

  const gear = (
    <ViewGear
      mapView={mapView}
      onSetMapView={setMap}
      mapTheme={mapTheme}
      onSetMapTheme={setTheme}
      label="Change view"
    />
  );

  /* CLOSED: one row, and the cost of the map is not paid. The count is on the
     button because "Show map" alone does not say whether there is anything on
     it — opening an empty map is the sort of thing you only do once. */
  if (mapView === 'off') {
    return (
      <div className="sched-map-shut">
        <button type="button" className="btn secondary sched-map-open" onClick={() => setMap('large')} disabled={pending}>
          <span aria-hidden="true">◉</span>
          {pins.length > 0 ? `Show map · ${pins.length} ${pins.length === 1 ? 'place' : 'places'}` : 'Show map'}
        </button>
        {gear}
      </div>
    );
  }

  return (
    <div className="sched-map-open-wrap" data-pending={pending || undefined}>
      {/* TWO TABS, TWO DIFFERENT SETS, AND EACH LABEL SAYS WHICH.
          The list is this month — deliberately, see the comment on the prop in
          page.tsx. The map is every active job and lead there is, at any date,
          which is what a map of a territory is for. Presented as tabs under one
          heading with a bare count each, they read as two views of one thing
          that could not agree on how big it was: "List · 12" beside 39 pins.

          NOT FIXED BY NARROWING THE MAP. Nobody filtered anything here — the
          month is the calendar's own state, not a control on this map — and the
          rule in lib/map-pin-scope is that an unfiltered map keeps its full
          picture, because that is the view worth having. Scoping to the month
          would also leave two of the three legend filters permanently dead, the
          map having nothing but scheduled work left to show.

          So each tab's own label says what it holds instead — ON SCREEN, in the
          same words as its accessible name. The scope used to be in the
          aria-label alone, which left a sighted user the two counts and no way
          to learn why they differ; the removed line under the map was the only
          other place it had ever been said.

          They differ on status as well as span, and on purpose: getMapPins
          drops completed work from the pins, while the rows keep it so a past
          month still has something to read. Both labels carry that, so the
          difference is disclosed rather than deleted. */}
      <div className="sched-map-bar">
        <div className="sched-map-tabs" role="tablist" aria-label="Map or list">
          <button
            type="button"
            role="tab"
            id="sched-map-tab-map"
            aria-selected={tab === 'map'}
            aria-controls="sched-map-panel"
            aria-label={`Map — all ${pins.length} active ${pins.length === 1 ? 'job or lead' : 'jobs and leads'} with an address`}
            className={`sched-map-tab${tab === 'map' ? ' is-on' : ''}`}
            onClick={() => setTab('map')}
          >
            Map <span aria-hidden="true">· {pins.length}</span>{' '}
            <span className="sched-map-tab-scope" aria-hidden="true">active, any date</span>
          </button>
          <button
            type="button"
            role="tab"
            id="sched-map-tab-list"
            aria-selected={tab === 'list'}
            aria-controls="sched-map-panel"
            aria-label={`List — ${jobs.length} scheduled ${jobs.length === 1 ? 'job' : 'jobs'} in ${monthLabel}, completed work included`}
            className={`sched-map-tab${tab === 'list' ? ' is-on' : ''}`}
            onClick={() => setTab('list')}
          >
            List <span aria-hidden="true">· {jobs.length}</span>{' '}
            <span className="sched-map-tab-scope" aria-hidden="true">in {monthLabel}</span>
          </button>
        </div>
        {/* Closing it lives in the gear ("Map → None") and nowhere else — the
            bar carried a Hide button beside it that did the same thing. */}
        {gear}
      </div>

      {tab === 'map' ? (
        <div
          className="workspace-embedded-map schedule-map"
          id="sched-map-panel"
          role="tabpanel"
          aria-labelledby="sched-map-tab-map"
        >
          {/* Two jobs at one address used to draw one marker on top of another,
              and the lower one could not be clicked, hovered or reached at all —
              not crowded, missing. This is the part of clustering that matters
              at a contractor's scale: tens of pins on a territory. */}
          <PinMap pins={pins} theme={mapTheme} spreadOverlap />
        </div>
      ) : (
        <div className="sched-map-list" id="sched-map-panel" role="tabpanel" aria-labelledby="sched-map-tab-list">
          <div className="sched-map-sort">
            <label htmlFor="sched-map-sort-by">Sort by</label>
            <select id="sched-map-sort-by" value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
              <option value="date">Date</option>
              <option value="client">Customer</option>
              <option value="city">Place</option>
              <option value="value">Value</option>
            </select>
            <span>{monthLabel}</span>
          </div>
          {sorted.length === 0 ? (
            /* "Nothing scheduled" would be a lie in the month whose work is all
               finished — completed jobs are off both halves of this pair. */
            <p className="empty-state">Nothing outstanding scheduled this month.</p>
          ) : (
            <ol className="sched-map-rows">
              {sorted.map((job) => (
                <li key={`${job.id}:${job.scheduled_for}`}>
                  <Link href={`/dashboard/jobs/${job.id}`} className="sched-map-row">
                    <span className="sched-map-row-when">
                      {new Date(`${job.scheduled_for}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <span className="sched-map-row-who">
                      <strong>{job.client_name}</strong>
                      <small>{job.city_label ?? 'No address on file'}</small>
                    </span>
                    <span className="sched-map-row-figures">
                      {job.value_label ? <em>{job.value_label}</em> : null}
                      {job.hours_label ? <i>{job.hours_label}</i> : null}
                    </span>
                    <span className="sched-map-row-crew">{job.crew_initials.join(' ') || '—'}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
