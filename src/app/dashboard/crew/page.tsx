import Link from 'next/link';
import { cookies } from 'next/headers';
import { requireOwnerContext } from '@/lib/auth';
import { listCrew, listCrewAssignmentsForJobs } from '@/lib/crew';
import { arrivalPermissionsFromCrew } from '@/lib/arrival';
import { createCrewPhotoUrls } from '@/lib/crew-photo-storage';
import { formatMoney, listJobs } from '@/lib/jobs';
import { formatPhoneDashes } from '@/lib/phone';
// The pay-period rollup, the pay day, the open shifts and the previous-period
// comparison all moved into lib/crew-pay-view, which the logged-out demo reads
// too. Twenty-four imports left this file with them.
import { normalizePeriodMode, normalizeOffset, resolvePayPeriod, summarizeJobLabor } from '@/lib/labor';
import { CREW_ROSTER_VIEW_COOKIE, CREW_SKIN_COOKIE, CREW_THEME_COOKIE, CREW_VIEW_COOKIE, normalizeCrewSkin, normalizeCrewTheme, normalizeCrewView, normalizeRosterView } from '@/lib/dashboard-views';
import { loadCrewPayView } from '@/lib/crew-pay-view';
import { payBasisFromCrew, payRateLabel } from '@/lib/pay-types';
import { normalizePayrollProvider } from '@/lib/payroll-export';
import { laborTotalsByCrew, listLaborEntries } from '@/lib/labor-data';
import { LABOR_RULE_COLUMNS, LABOR_SETTINGS_COOKIE, laborRulesFromAccount, normalizeLaborSettings } from '@/lib/labor-settings';
import { getTimeClockMode, isTimeClockAvailable, listOpenShifts } from '@/lib/time-clock-data';
import CrewRoster, { type CrewRow } from './CrewRoster';
import HoursAndPay from './HoursAndPay';
import LaborByJob from './LaborByJob';
import TimeClockCard from './TimeClockCard';
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
  // Pay periods are cut in the CONTRACTOR's zone, not the server's — on Vercel
  // the server is UTC, which put every Saturday evening of an Eastern shop into
  // the following week's payroll. And the rules that decide an amount live on
  // the ACCOUNT, so a phone and a laptop cannot total the same week differently.
  const { data: accountRules } = await supabase
    .from('accounts')
    .select(`timezone, require_separate_payer, payroll_provider, ${LABOR_RULE_COLUMNS}`)
    .eq('id', accountId)
    .maybeSingle();
  const timeZone = ((accountRules as { timezone?: string } | null)?.timezone) || 'America/New_York';
  const settings = laborRulesFromAccount(
    accountRules as Parameters<typeof laborRulesFromAccount>[0],
    normalizeLaborSettings(cookies().get(LABOR_SETTINGS_COOKIE)?.value),
  );
  const requireSeparatePayer = (accountRules as { require_separate_payer?: boolean } | null)?.require_separate_payer === true;

  // No period in the URL means "whatever this account calls a pay period",
  // which is the setting — so the tab opens on their cadence, not on a week.
  const period = resolvePayPeriod(
    searchParams.period ? normalizePeriodMode(searchParams.period) : settings.periodMode,
    normalizeOffset(searchParams.offset),
    { from: searchParams.from, to: searchParams.to, timeZone },
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

  // The time clock's own card lives on the Crew members tab, so that tab pays
  // for these reads and no other one does. `available` is a separate question
  // from the mode: getTimeClockMode answers 'off' both when the migration has
  // not run and when the owner genuinely turned it off, which is right for
  // behaviour and useless for explaining. Open shifts are only worth a query
  // when there is a clock that could have left one running.
  const timeClockMode = tab === 'crew' ? await getTimeClockMode(supabase, accountId) : 'off';
  const timeClockAvailable = tab === 'crew' ? await isTimeClockAvailable(supabase, accountId) : false;
  const crewOpenShifts =
    tab === 'crew' && timeClockMode !== 'off' ? await listOpenShifts(supabase, accountId) : [];

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
      payType: payBasisFromCrew(member).payType,
      annualSalary: member.annual_salary == null ? null : Number(member.annual_salary),
      dayRate: member.day_rate == null ? null : Number(member.day_rate),
      payrollId: member.payroll_id ?? null,
      // Reads from the pay basis, so a salaried member shows "$72,000.00/yr"
      // rather than the derived hourly figure nobody typed.
      rateLabel: payRateLabel(payBasisFromCrew(member)),
      phone: member.phone || null,
      phoneLabel: member.phone ? formatPhoneDashes(member.phone) : null,
      email: member.email,
      startAddress: member.start_address ?? null,
      permissions: arrivalPermissionsFromCrew(member as unknown as Record<string, unknown>),
      active: member.active,
      fieldApp: member.user_id ? 'linked' : member.email ? 'invitable' : 'no-email',
      jobs: jobsByCrew[member.id] ?? [],
      periodHours: bucket?.hours ?? 0,
      periodPay: bucket?.pay ?? 0,
      periodPayLabel: formatMoney(bucket?.pay ?? 0),
      createdAt: member.created_at,
    };
  });

  // Only the open tab pays for its own reads.
  const laborEntries =
    tab === 'jobs'
      ? await listLaborEntries(supabase, accountId, { startIso: period.startIso, endIso: period.endIso, crewId: null })
      : [];
  const jobRows = tab === 'jobs' ? summarizeJobLabor(laborEntries, jobs) : [];

  const crewView = normalizeCrewView(cookies().get(CREW_VIEW_COOKIE)?.value);
  const rosterView = normalizeRosterView(cookies().get(CREW_ROSTER_VIEW_COOKIE)?.value);
  // The page theme, not a layout. Read once here and worn by the whole shell so
  // all three tabs — including Labor by job, which has no picker — look like one
  // page rather than changing character as you move across them.
  const crewTheme = normalizeCrewTheme(cookies().get(CREW_THEME_COOKIE)?.value);
  // The skin is independent of the theme above: one decides how the page looks,
  // the other how it is laid out, and they compose.
  const crewSkin = normalizeCrewSkin(cookies().get(CREW_SKIN_COOKIE)?.value);

  // Hours & pay, in one read — the rollup, the pay day, what is still owed from
  // earlier periods, the open shifts and the previous period's comparison. Lives
  // in lib/crew-pay-view so the logged-out demo renders this tab from exactly
  // the same figures rather than assembling its own set.
  //
  // Only the grouped layout shows the comparison, so that read is still paid for
  // by the view rather than by the tab.
  const payView =
    tab === 'hours'
      ? await loadCrewPayView(supabase, accountId, {
          period,
          settings,
          timeZone,
          crew,
          crewId: searchParams.crew ?? null,
          withComparison: crewView === 'grouped',
          searchParams,
        })
      : null;

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
    // Review pins the actions beside the table, which only fits if the shell
    // stops capping content at 1100px. Driven by the cookie so the width is
    // right on first paint; picking a view refreshes to pick the change up.
    <main
      className={[
        'wide-shell',
        'workspace-shell',
        crewTheme === 'focus' ? 'crew-focus' : '',
        // Two classes: one generic hook the structural rules hang off, one
        // per-skin so the tokens can differ. Standard adds neither, so the
        // untouched page is byte-identical to what it was.
        crewSkin !== 'standard' ? 'crew-skin' : '',
        crewSkin !== 'standard' ? `crew-skin-${crewSkin}` : '',
        // Focus's rail, the board columns and the nine-column table all need the
        // shell to stop capping content at 1100px.
        // Overview is capped at the standard width whatever layout is stored
        // underneath it: a list beside one open thing does not need 1600px.
        crewTheme !== 'overview' &&
        (crewTheme === 'focus' ||
          (tab === 'hours' && crewView === 'rail') ||
          (tab === 'crew' && (rosterView === 'board' || rosterView === 'table')))
          ? 'crew-wide'
          : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
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
            initialView={rosterView}
            initialSkin={crewSkin}
            initialOverview={crewTheme === 'overview'}
            openAdd={searchParams.add === '1' || crew.length === 0}
          />
        ) : null}

        {tab === 'hours' && payView ? (
          <HoursAndPay
            payrollProvider={normalizePayrollProvider((accountRules as { payroll_provider?: string } | null)?.payroll_provider)}
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
            crewFilter={searchParams.crew ?? null}
            crewOptions={activeCrew.map((member) => ({ id: member.id, name: member.name }))}
            assignableJobs={assignableJobs.map((job) => ({ id: job.id, ref: job.ref, clientName: job.client_name }))}
            jobLookup={Object.fromEntries(jobs.map((job) => [job.id, `${job.ref} · ${job.client_name}`]))}
            jobsByCrew={Object.fromEntries(
              Object.entries(jobsByCrew).map(([crewId, list]) => [crewId, list.map((job) => ({ ref: job.ref, clientName: job.clientName }))]),
            )}
            hoursToday={payView.hoursToday}
            showTodayColumn={payView.showTodayColumn}
            todayKey={payView.todayKey}
            progress={payView.progress}
            initialView={crewView}
            initialSkin={crewSkin}
            initialOverview={crewTheme === 'overview'}
            comparison={payView.comparison}
            payDay={payView.payDay}
            payDue={payView.payDue}
            outstanding={payView.outstanding}
            approvedLines={payView.approvedLines}
            hoursThisPeriod={payView.hoursThisPeriod}
            hoursLastPeriod={payView.hoursLastPeriod}
            previousPayLabel={payView.previousPayLabel}
            settings={settings}
            requireSeparatePayer={requireSeparatePayer}
            timeClockMode={payView.timeClockMode}
            openShifts={payView.openShifts}
          />
        ) : null}

        {tab === 'jobs' ? (
          <LaborByJob
            rows={jobRows}
            period={period}
            initialSkin={crewSkin}
            initialOverview={crewTheme === 'overview'}
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
            <span className="stat-ticker-label">Assigned</span>
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

      {/* The time clock, on the tab that renders with zero crew and zero hours.
          Its only control used to be a <select> in the Hours & pay rail, and
          that rail is not rendered when no hours exist for the period — so
          switching the clock ON required hours to have already been logged
          without it. See TimeClockCard. */}
      {tab === 'crew' ? (
        <TimeClockCard
          mode={timeClockMode}
          available={timeClockAvailable}
          crewCount={activeCrew.length}
          openShiftCount={crewOpenShifts.length}
        />
      ) : null}
    </main>
  );
}
