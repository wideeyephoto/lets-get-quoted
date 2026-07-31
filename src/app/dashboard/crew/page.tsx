import Link from 'next/link';
import { cookies } from 'next/headers';
import { requireOwnerContext } from '@/lib/auth';
import { listCrew, listCrewAssignmentsForJobs } from '@/lib/crew';
import { createCrewPhotoUrls } from '@/lib/crew-photo-storage';
import { formatMoney, listJobs } from '@/lib/jobs';
import { formatPhoneDashes } from '@/lib/phone';
import {
  buildLaborCsv,
  exportBlockedReason,
  normalizeOffset,
  normalizePeriodMode,
  periodStatus,
  resolvePayPeriod,
  summarizeCrewLabor,
  summarizeJobLabor,
} from '@/lib/labor';
import { laborTotalsByCrew, listLaborEntries } from '@/lib/labor-data';
import { LABOR_SETTINGS_COOKIE, normalizeLaborSettings, roundHours } from '@/lib/labor-settings';
import { SHIFT_FLAG_HELP, SHIFT_FLAG_LABEL, formatClock, formatElapsed, openShiftFlag } from '@/lib/time-clock';
import { getTimeClockMode, isTimeClockAvailable, listOpenShifts } from '@/lib/time-clock-data';
import type { OpenShiftView } from './HoursAndPay';
import CrewRoster, { type CrewRow } from './CrewRoster';
import HoursAndPay from './HoursAndPay';
import LaborByJob from './LaborByJob';
import styles from './crew.module.css';

// Crew & Labor — one home for the roster, the hours those people logged, and
// what that labor did to each job's budget.
//
// The three used to be two pages and a gap: a roster you couldn't see hours on,
// a "Payroll" page reachable only from a link inside the roster header, and no
// way at all to ask "which jobs are running over on labor". Tabs are links
// rather than client state so a tab is shareable, back works, and the server
// only fetches what the open tab actually needs.

export const dynamic = 'force-dynamic';

const TABS = [
  { id: 'crew', label: 'Crew members' },
  { id: 'hours', label: 'Hours & pay' },
  { id: 'jobs', label: 'Labor by job' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function normalizeTab(value: unknown): TabId {
  return TABS.some((tab) => tab.id === value) ? (value as TabId) : 'crew';
}

// "2026-07-30T14:05" — what <input type="datetime-local"> expects, in the
// viewer's own wall clock rather than UTC.
function localInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function initialsFor(name: string) {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'C'
  );
}

export default async function CrewLaborPage({
  searchParams,
}: {
  searchParams: {
    tab?: string;
    status?: string;
    period?: string;
    offset?: string;
    from?: string;
    to?: string;
    crew?: string;
    add?: string;
  };
}) {
  const { supabase, accountId } = await requireOwnerContext();
  const tab = normalizeTab(searchParams.tab);
  const settings = normalizeLaborSettings(cookies().get(LABOR_SETTINGS_COOKIE)?.value);

  // No period in the URL means "whatever this account calls a pay period",
  // which is the setting — so the tab opens on their cadence, not on a week.
  const period = resolvePayPeriod(
    searchParams.period ? normalizePeriodMode(searchParams.period) : settings.periodMode,
    normalizeOffset(searchParams.offset),
    { from: searchParams.from, to: searchParams.to },
  );

  const [crew, jobs] = await Promise.all([listCrew(supabase, accountId), listJobs(supabase, accountId)]);
  const photoUrls = await createCrewPhotoUrls(
    accountId,
    crew.map((member) => member.photo_path).filter((path): path is string => Boolean(path)),
  );

  const activeCrew = crew.filter((member) => member.active);
  const assignableJobs = jobs.filter((job) => job.status !== 'complete' && job.status !== 'archived');

  // Invert jobId -> crewIds into crewId -> open jobs, so each row can show what
  // the member is on right now (and mark idle active members as available).
  const assignmentsByJob = await listCrewAssignmentsForJobs(supabase, accountId, assignableJobs.map((job) => job.id));
  const jobsById = new Map(assignableJobs.map((job) => [job.id, job]));
  const jobsByCrew: Record<string, { id: string; ref: string; clientName: string }[]> = {};
  for (const [jobId, crewIds] of Object.entries(assignmentsByJob)) {
    const job = jobsById.get(jobId);
    if (!job) continue;
    for (const crewId of crewIds) {
      const bucket = jobsByCrew[crewId] ?? (jobsByCrew[crewId] = []);
      bucket.push({ id: job.id, ref: job.ref, clientName: job.client_name });
    }
  }

  const onJobCount = activeCrew.filter((member) => (jobsByCrew[member.id]?.length ?? 0) > 0).length;

  // Hours for the roster's "this pay period" summary. Cheap enough to always
  // load: it's the number that makes a roster row worth reading.
  const totals = await laborTotalsByCrew(supabase, accountId, { startIso: period.startIso, endIso: period.endIso });

  const crewRows: CrewRow[] = crew.map((member) => {
    const bucket = totals.get(member.id);
    return {
      id: member.id,
      name: member.name,
      initials: initialsFor(member.name),
      photoUrl: member.photo_path ? photoUrls[member.photo_path] ?? null : null,
      roleLabel: member.role_label,
      hourlyRate: Number(member.hourly_rate) || 0,
      rateLabel: Number(member.hourly_rate) > 0 ? `${formatMoney(Number(member.hourly_rate))}/hr` : 'No rate set',
      phone: member.phone || null,
      phoneLabel: member.phone ? formatPhoneDashes(member.phone) : null,
      email: member.email,
      startAddress: member.start_address ?? null,
      active: member.active,
      fieldApp: member.user_id ? 'linked' : member.email ? 'invitable' : 'no-email',
      jobs: jobsByCrew[member.id] ?? [],
      periodHours: bucket?.hours ?? 0,
      periodPay: bucket?.pay ?? 0,
      periodPayLabel: formatMoney(bucket?.pay ?? 0),
      createdAt: member.created_at,
    };
  });

  // The time clock reads 'off' when its migration hasn't been run, so the whole
  // feature stays invisible rather than throwing.
  const timeClockMode = await getTimeClockMode(supabase, accountId);
  // Only asked on the tab that shows the control — it's a second round trip
  // that exists purely to word one hint correctly.
  const timeClockAvailable = tab === 'hours' ? await isTimeClockAvailable(supabase, accountId) : false;
  const openShifts: OpenShiftView[] =
    tab === 'hours' && timeClockMode !== 'off'
      ? (await listOpenShifts(supabase, accountId)).map((shift) => {
          const flag = openShiftFlag(shift.startedAt);
          return {
            id: shift.id,
            crewName: shift.crewName,
            jobLabel: shift.jobLabel,
            startedLabel: formatClock(shift.startedAt),
            elapsedLabel: formatElapsed(shift.startedAt),
            // datetime-local wants local wall-clock with no zone; "now" is the
            // safest default end because it's the latest defensible one.
            defaultEnd: localInputValue(new Date()),
            flag,
            flagLabel: flag ? SHIFT_FLAG_LABEL[flag] : null,
            flagHelp: flag ? SHIFT_FLAG_HELP[flag] : null,
          };
        })
      : [];

  // Only the open tab pays for its own reads.
  const laborEntries =
    tab === 'hours' || tab === 'jobs'
      ? await listLaborEntries(supabase, accountId, {
          startIso: period.startIso,
          endIso: period.endIso,
          crewId: tab === 'hours' ? searchParams.crew ?? null : null,
        })
      : [];

  const hours =
    tab === 'hours'
      ? summarizeCrewLabor(laborEntries, {
          overtimeThreshold: settings.overtimeThreshold,
          roundHours: settings.rounding === 'none' ? undefined : (value) => roundHours(value, settings.rounding),
        })
      : null;
  const jobRows = tab === 'jobs' ? summarizeJobLabor(laborEntries, jobs) : [];

  const tabHref = (next: TabId) => {
    const query = new URLSearchParams();
    query.set('tab', next);
    if (searchParams.period) query.set('period', searchParams.period);
    if (searchParams.offset) query.set('offset', searchParams.offset);
    if (searchParams.from) query.set('from', searchParams.from);
    if (searchParams.to) query.set('to', searchParams.to);
    return `/dashboard/crew?${query.toString()}`;
  };

  return (
    <main className="wide-shell workspace-shell">
      <section className="panel workspace-section-card">
        <header className={styles.pageHead}>
          <div>
            <p className="eyebrow">Team</p>
            <h1 className={styles.pageTitle}>Crew &amp; Labor</h1>
          </div>
          <div className={styles.pageHeadActions}>
            {tab === 'crew' ? (
              <Link href="/dashboard/crew?tab=crew&add=1#add-crew" className="btn primary">
                + Add crew member
              </Link>
            ) : null}
          </div>
        </header>

        <nav className={styles.tabs} aria-label="Crew and labor sections">
          {TABS.map((item) => (
            <Link
              key={item.id}
              href={tabHref(item.id)}
              className={`${styles.tab}${tab === item.id ? ` ${styles.tabOn}` : ''}`}
              aria-current={tab === item.id ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {tab === 'crew' ? (
          <CrewRoster
            rows={crewRows}
            assignableJobs={assignableJobs.map((job) => ({ id: job.id, ref: job.ref, clientName: job.client_name }))}
            periodLabel={period.rangeLabel}
            initialStatus={searchParams.status === 'archived' ? 'archived' : 'active'}
            openAdd={searchParams.add === '1' || crew.length === 0}
          />
        ) : null}

        {tab === 'hours' && hours ? (
          <HoursAndPay
            rows={hours.rows}
            totals={{
              hours: hours.totalHours,
              pay: hours.totalPay,
              overtime: hours.totalOvertime,
              needsReview: hours.needsReview,
              activeCrew: activeCrew.length,
            }}
            period={period}
            status={periodStatus(period, hours.needsReview, laborEntries.length)}
            exportBlocked={exportBlockedReason(hours.rows)}
            csv={buildLaborCsv(hours.rows, period)}
            crewFilter={searchParams.crew ?? null}
            crewOptions={activeCrew.map((member) => ({ id: member.id, name: member.name }))}
            assignableJobs={assignableJobs.map((job) => ({ id: job.id, ref: job.ref, clientName: job.client_name }))}
            jobLookup={Object.fromEntries(jobs.map((job) => [job.id, `${job.ref} · ${job.client_name}`]))}
            settings={settings}
            timeClockMode={timeClockMode}
            timeClockAvailable={timeClockAvailable}
            openShifts={openShifts}
          />
        ) : null}

        {tab === 'jobs' ? (
          <LaborByJob
            rows={jobRows}
            period={period}
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
      </section>

      {tab === 'crew' ? (
        <div className={`stat-ticker panel ${styles.rosterStats}`}>
          <div className="stat-ticker-item">
            <span className="stat-ticker-value">{activeCrew.length}</span>
            <span className="stat-ticker-label">Active crew</span>
          </div>
          <div className="stat-ticker-item">
            <span className="stat-ticker-value">{onJobCount}</span>
            <span className="stat-ticker-label">On a job</span>
          </div>
          <div className="stat-ticker-item">
            <span className="stat-ticker-value">{activeCrew.length - onJobCount}</span>
            <span className="stat-ticker-label">Available</span>
          </div>
          <div className="stat-ticker-item">
            <span className="stat-ticker-value">{crew.length - activeCrew.length}</span>
            <span className="stat-ticker-label">Archived</span>
          </div>
        </div>
      ) : null}
    </main>
  );
}
