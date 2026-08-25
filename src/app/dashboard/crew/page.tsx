import Link from 'next/link';
import { cookies } from 'next/headers';
import { requireOfficeContext } from '@/lib/auth';
import { listCrew, listCrewAssignmentsForJobs } from '@/lib/crew';
import { fieldAppDetail, fieldAppState } from '@/lib/crew-invite';
import { arrivalPermissionsFromCrew } from '@/lib/arrival';
import { createCrewPhotoUrls } from '@/lib/crew-photo-storage';
import { listJobs } from '@/lib/jobs';
import { payMoney } from '@/lib/crew-pay';
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
import { isTimeClockAvailable } from '@/lib/time-clock-data';
import { isLiveMessagingEnvironment } from '@/lib/sms';
import { listSubcontractorRequests, loadSubcontractors, todayIn } from '@/lib/subcontractor-dispatch-data';
import { normalizeWorkerType } from '@/lib/subcontractors';
import CrewRoster, { type CrewRow } from './CrewRoster';
import HoursAndPay from './HoursAndPay';
import JobRequests from './JobRequests';
import LaborByJob from './LaborByJob';
import LiveCrewMap from './LiveCrewMap';
import TimeClockCard from './TimeClockCard';
import AddPersonMenu from './AddPersonMenu';
import styles from './crew.module.css';

export const metadata = { title: 'Crew & Labor' };

// Crew & subcontractors — the people who do the work, whoever employs them.
//
// FOUR SECTIONS, and the fourth is the one that changed what this page is. It
// used to be three: a roster, the hours those people logged, and what that labor
// did to each job's budget. Job requests is different in kind — it is not a
// record of work done, it is the act of finding somebody to do it — and it sits
// here rather than on its own page because the firms it dispatches to ARE the
// directory on the first tab. Splitting them would have meant two places to keep
// a subcontractor's insurance date up to date.
//
// Tabs are links rather than client state so a tab is shareable, back works, and
// the server only fetches what the open tab actually needs.

export const dynamic = 'force-dynamic';

const TABS = [
  { id: 'people', label: 'People' },
  { id: 'requests', label: 'Job requests' },
  { id: 'hours', label: 'Hours & pay' },
  { id: 'jobs', label: 'Labor by job' },
  { id: 'map', label: '📍 Live GPS' },
] as const;

type TabId = (typeof TABS)[number]['id'];

/**
 * 'crew' still means People.
 *
 * The old tab was called that, and the id is in the sidebar's New menu
 * (?tab=crew&add=1), in the Payroll redirect, in the Job Costing settings copy
 * and in every bookmark an owner has made in a year of using this page.
 * Renaming the tab without keeping the alias would have quietly sent all of them
 * to the default — which is the same tab, but only by luck, and the &add=1 that
 * rides with the first one would have opened a drawer on a page that had just
 * ignored half its own URL.
 */
function normalizeTab(value: unknown): TabId {
  if (value === 'requests' || value === 'hours' || value === 'jobs' || value === 'map') return value;
  if (value === 'crew') return 'people';
  return TABS.some((tab) => tab.id === value) ? (value as TabId) : 'people';
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
    /** "?worker=subcontractor" — the People tab, filtered to one kind of person. */
    worker?: string;
    /**
     * "?add=1" — open the add-crew drawer. "?add=sub" opens the subcontractor one.
     *
     * Read on the CLIENT, by AddCrewDrawer's useSearchParams, and deliberately
     * not passed down from here. This page used to hand it over as a prop that
     * the roster fed to useState, where it was an initializer and therefore
     * ignored on every soft navigation after the first — which is exactly why
     * the header button did nothing. It is listed here because it is part of
     * this route's contract, not because anything on the server acts on it.
     */
    add?: string;
  };
}) {
  const { supabase, accountId } = await requireOfficeContext('crew.read');
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

  // The subcontractor half of the directory, read whole — profile, compliance
  // and the six performance numbers — but only on the two tabs that show any of
  // it. Labor by job pays for none of this.
  const today = todayIn(timeZone);
  const subs =
    tab === 'people' || tab === 'requests'
      ? await loadSubcontractors(supabase, accountId, { today, includeArchived: true })
      : [];
  const subsById = new Map(subs.map((sub) => [sub.id, sub]));

  const requests = tab === 'requests' ? await listSubcontractorRequests(supabase, accountId) : [];

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

  // Hours for the roster's "this pay period" summary. Cheap enough to always
  // load: it's the number that makes a roster row worth reading.
  const totals = await laborTotalsByCrew(supabase, accountId, { startIso: period.startIso, endIso: period.endIso });

  const crewRows: CrewRow[] = crew.map((member) => {
    const bucket = totals.get(member.id);
    const sub = subsById.get(member.id) ?? null;
    return {
      id: member.id,
      name: member.name,
      // Read off the row rather than off `sub`, because the People tab shows
      // everybody and `sub` is only populated for subcontractors. An employee
      // resolves to 'employee' here whether or not the migration has run.
      workerType: normalizeWorkerType((member as unknown as Record<string, unknown>).worker_type),
      companyName: sub?.profile.companyName ?? null,
      displayName: sub?.displayName ?? member.name,
      subStatus: sub?.profile.subStatus ?? null,
      trades: sub?.profile.trades ?? [],
      compliance: sub ? { state: sub.compliance.overall, label: sub.compliance.label } : null,
      subMetrics: sub
        ? {
            offered: sub.metrics.offered,
            accepted: sub.metrics.accepted,
            completed: sub.metrics.completed,
            responseMinutes: sub.metrics.responseMinutes,
            acceptanceRate: sub.metrics.acceptanceRate,
            rating: sub.metrics.rating,
          }
        : null,
      subProfile: sub?.profile ?? null,
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
      // The whole invitation, not "has a user_id". See lib/crew-invite for why
      // three states derived from two booleans could not describe an invitation
      // that had expired, or access that had been taken away.
      fieldApp: fieldAppState(member),
      fieldAppDetail: fieldAppDetail(member),
      jobs: jobsByCrew[member.id] ?? [],
      periodHours: bucket?.hours ?? 0,
      periodPay: bucket?.pay ?? 0,
      // payMoney, not formatMoney. formatMoney rounds to whole dollars, which is
      // right for a margin headline and wrong for a person: this roster printed
      // "$305" beside a name while the Hours & pay tab printed "$304.50" for the
      // same crew member in the same period, from the same figure. Two tabs of
      // one page disagreeing about one number reads as a product that cannot
      // add up. payMoney is the formatter Hours & pay already uses, and it is
      // pure, so both tabs now derive their answer from one place.
      periodPayLabel: payMoney(bucket?.pay ?? 0),
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
  // Time-clock configuration now sits beside the hours it produces. The pay
  // view already loaded the mode and open shifts, so the only extra read is the
  // migration-availability check needed to explain a disabled save.
  const timeClockMode = payView?.timeClockMode ?? 'off';
  const timeClockAvailable = tab === 'hours' ? await isTimeClockAvailable(supabase, accountId) : false;
  const crewOpenShifts = payView?.openShifts ?? [];

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
        // The stable hook. Unconditional on purpose: it is what tells the shell
        // this is the crew page at all, and the cap rule reads `crew-wide` off
        // it to decide whether this particular view keeps the standard column.
        'crew-shell',
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
          (tab === 'people' && (rosterView === 'board' || rosterView === 'table')))
          ? 'crew-wide'
          : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <section className={`panel workspace-section-card ${styles.crewPanel}`}>
        <header className={styles.pageHead}>
          <div>
            <p className="eyebrow">Team</p>
            <h1 className={styles.pageTitle}>Crew &amp; subcontractors</h1>
          </div>
          <div className={styles.pageHeadActions}>
            <Link
              href="/dashboard/settings#office-team"
              className="btn secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.84rem' }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span>Manage Seats &amp; Staff</span>
            </Link>
            {tab === 'people' ? (
              // No #add-crew fragment any more, and that is the point. The old
              // link scrolled to a collapsed toggle at the bottom of the roster
              // that a soft navigation never opened — the search parameter alone
              // now opens the drawer (AddCrewDrawer reads it), and a dangling
              // hash pointing at an element that no longer exists would only
              // scroll the page for no reason.
              <AddPersonMenu
                employeeHref="/dashboard/crew?tab=people&add=1"
                subcontractorHref="/dashboard/crew?tab=people&add=sub"
              />
            ) : null}
            {tab === 'requests' && subs.length > 0 && assignableJobs.length > 0 ? (
              <Link href="/dashboard/crew/requests/new" className="btn primary">
                + New job request
              </Link>
            ) : null}
          </div>
        </header>

        <nav className={styles.tabs} aria-label="Crew and subcontractor sections">
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

        {tab === 'people' ? (
          <CrewRoster
            rows={crewRows}
            assignableJobs={assignableJobs.map((job) => ({ id: job.id, ref: job.ref, clientName: job.client_name }))}
            periodLabel={period.rangeLabel}
            initialStatus={searchParams.status === 'archived' ? 'archived' : 'active'}
            initialWorkerType={searchParams.worker === 'subcontractor' || searchParams.worker === 'employee' ? searchParams.worker : 'all'}
            initialView={rosterView}
            initialOverview={crewTheme === 'overview'}
          />
        ) : null}

        {tab === 'requests' ? (
          <JobRequests
            entries={requests}
            assignableJobs={assignableJobs.map((job) => ({ id: job.id, ref: job.ref, clientName: job.client_name }))}
            subcontractorCount={subs.length}
            simulated={!isLiveMessagingEnvironment()}
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

        {tab === 'map' ? (
          <LiveCrewMap
            technicians={activeCrew.map((member) => {
              const shift = crewOpenShifts.find((s) => s.crewName === member.name);
              const isOnSite = Boolean(shift);
              const isOffSite = shift?.flag === 'implausible';

              return {
                crewId: member.id,
                crewName: member.name,
                roleTitle: 'Field Technician',
                status: isOffSite ? 'off_site_flagged' : isOnSite ? 'on_site' : 'off_duty',
                activeJobLabel: shift?.jobLabel,
                elapsedHours: shift ? 3.5 : 0,
                distanceFromSiteFeet: isOnSite ? (isOffSite ? 3200 : 45) : null,
                hourlyRate: 35,
              };
            })}
          />
        ) : null}
      </section>

      {/* Kept outside HoursAndPay's rows/no-rows branch so a completely empty
          period can still turn the clock on. It now sits beside the hours it
          creates instead of after the entire people directory. */}
      {tab === 'hours' ? (
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
