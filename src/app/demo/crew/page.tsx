import Link from 'next/link';
import { normalizePeriodMode, resolvePayPeriod, summarizeJobLabor } from '@/lib/labor';
import { listLaborEntries } from '@/lib/labor-data';
import { listCrew } from '@/lib/crew';
import { listJobs } from '@/lib/jobs';
import { loadRosterData } from '@/lib/crew-rows';
import { DEMO_ACCOUNT_ID, DEMO_BOOKING } from '@/lib/demo-data';
import { demoSupabase } from '@/lib/demo-rows';
import { loadCrewPayView } from '@/lib/crew-pay-view';
import { laborRulesFromAccount, normalizeLaborSettings } from '@/lib/labor-settings';
import { normalizePayrollProvider } from '@/lib/payroll-export';
import CrewRoster from '@/app/dashboard/crew/CrewRoster';
import HoursAndPay from '@/app/dashboard/crew/HoursAndPay';
import LaborByJob from '@/app/dashboard/crew/LaborByJob';
import styles from '@/app/dashboard/crew/crew.module.css';

export const metadata = { title: 'Crew & Labor — Live Demo' };

const TABS = [
  { id: 'crew', label: 'Crew members' },
  { id: 'hours', label: 'Hours & pay' },
  { id: 'jobs', label: 'Labor by job' },
] as const;

type TabId = (typeof TABS)[number]['id'];

/**
 * Crew & Labor, for a logged-out visitor.
 *
 * Replaces a 65-line hand-drawn list that showed a name, a role and a phone
 * number — while the real page is a three-tab workspace with five roster
 * layouts, an Overview mode, live period hours and a labor-vs-budget view.
 *
 * Two of the three tabs render the REAL components over fixture data. The
 * roster is handed readOnly, which withholds every control that writes; see the
 * RosterMode note in CrewRoster for why that is a context rather than a prop.
 *
 * HOURS & PAY IS NOT CONVERTED YET, and says so rather than showing a blank
 * panel. That tab takes thirty-five props off a pay-period machine — approvals,
 * pay events, payroll export config, outstanding periods — and needs the same
 * loader extraction Recurring and Insights got. Pretending otherwise would mean
 * a hand-drawn replica, which is the thing this whole pass exists to remove.
 */
export default async function DemoCrewPage({ searchParams }: { searchParams: { tab?: string } }) {
  const tab: TabId = TABS.some((item) => item.id === searchParams.tab) ? (searchParams.tab as TabId) : 'crew';

  // The demo's own zone, so the period is cut the way Evergreen's week is.
  const period = resolvePayPeriod(normalizePeriodMode(undefined), 0, { timeZone: DEMO_BOOKING.timezone });

  const [roster, crew, jobs, laborEntries] = await Promise.all([
    loadRosterData(demoSupabase, DEMO_ACCOUNT_ID, period, { withPhotos: false }),
    listCrew(demoSupabase, DEMO_ACCOUNT_ID),
    listJobs(demoSupabase, DEMO_ACCOUNT_ID),
    listLaborEntries(demoSupabase, DEMO_ACCOUNT_ID, { startIso: period.startIso, endIso: period.endIso }),
  ]);

  // The same rollup the app's Hours & pay tab reads, over the demo's own
  // clocked shifts. Null when the period is empty — see the note in the lib.
  const settings = laborRulesFromAccount(null, normalizeLaborSettings(undefined));
  const payView = await loadCrewPayView(demoSupabase, DEMO_ACCOUNT_ID, {
    period,
    settings,
    timeZone: DEMO_BOOKING.timezone,
    crew,
    withComparison: true,
  });

  return (
    <main className="wide-shell workspace-shell">
      <section className="panel workspace-section-card">
        <header className={styles.pageHead}>
          <div>
            <p className="eyebrow">Team</p>
            <h1 className={styles.pageTitle}>Crew &amp; Labor</h1>
          </div>
        </header>

        <nav className={styles.tabs} aria-label="Crew and labor sections">
          {TABS.map((item) => (
            <Link
              key={item.id}
              href={`/demo/crew?tab=${item.id}`}
              className={`${styles.tab}${tab === item.id ? ` ${styles.tabOn}` : ''}`}
              aria-current={tab === item.id ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {tab === 'crew' ? (
          <CrewRoster
            rows={roster.rows}
            assignableJobs={roster.assignableJobs}
            periodLabel={period.rangeLabel}
            initialStatus="active"
            initialView="rows"
            initialSkin="standard"
            // Overview is the page default now — the demo opens on it too, so a
            // prospect sees the shape an owner sees on their first visit.
            initialOverview
            openAdd={false}
            readOnly
            basePath="/demo"
          />
        ) : null}

        {tab === 'jobs' ? (
          <LaborByJob
            rows={summarizeJobLabor(laborEntries, jobs)}
            period={period}
            initialSkin="standard"
            initialOverview
            crewOptions={crew.map((member) => ({ id: member.id, name: member.name }))}
            entries={laborEntries.map((entry) => ({
              id: entry.id,
              jobId: entry.job_id,
              crewId: entry.crew_id,
              crewName: entry.crew_name || 'Unassigned',
              description: entry.description || 'Labor',
              hours: Number(entry.hours) || 0,
              amount: Number(entry.amount) || 0,
              loggedAt: entry.created_at,
            }))}
          />
        ) : null}

        {tab === 'hours' ? (
          payView ? (
            <HoursAndPay
              payrollProvider={normalizePayrollProvider(undefined)}
              rows={payView.rows}
              totals={payView.totals}
              periodState={payView.periodState}
              primaryAction={payView.primaryAction}
              period={payView.period}
              periodClosedAt={payView.periodClosedAt}
              periodReopenReason={payView.periodReopenReason}
              overlaps={payView.overlaps}
              events={payView.events}
              payAvailable={payView.payAvailable}
              exportBlocked={payView.exportBlocked}
              crewFilter={null}
              crewOptions={crew.filter((member) => member.active !== false).map((member) => ({ id: member.id, name: member.name }))}
              assignableJobs={roster.assignableJobs}
              jobLookup={Object.fromEntries(jobs.map((job) => [job.id, `${job.ref} · ${job.client_name}`]))}
              jobsByCrew={{}}
              hoursToday={payView.hoursToday}
              showTodayColumn={payView.showTodayColumn}
              todayKey={payView.todayKey}
              progress={payView.progress}
              initialView="grouped"
              initialSkin="standard"
              initialOverview
              comparison={payView.comparison}
              payDay={payView.payDay}
              payDue={payView.payDue}
              outstanding={payView.outstanding}
              approvedLines={payView.approvedLines}
              hoursThisPeriod={payView.hoursThisPeriod}
              hoursLastPeriod={payView.hoursLastPeriod}
              previousPayLabel={payView.previousPayLabel}
              settings={settings}
              requireSeparatePayer={false}
              timeClockMode={payView.timeClockMode}
              openShifts={payView.openShifts}
            />
          ) : (
            // The same blank the app shows when a period has nothing in it — said
            // out loud rather than left as an empty panel.
            <p className="empty-state">
              No hours are logged in this pay period yet. Once your crew clocks time in the field app, this is
              where you approve it and record who has been paid.
            </p>
          )
        ) : null}
      </section>
    </main>
  );
}
