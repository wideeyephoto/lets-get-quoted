import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireOfficeContext } from '@/lib/auth';
import { listCrew, listCrewAssignmentsForJobs } from '@/lib/crew';
import { fieldAppDetail, fieldAppState } from '@/lib/crew-invite';
import { arrivalPermissionsFromCrew } from '@/lib/arrival';
import { createCrewPhotoUrls } from '@/lib/crew-photo-storage';
import { listJobs } from '@/lib/jobs';
import { payMoney } from '@/lib/crew-pay';
import { formatPhoneDashes } from '@/lib/phone';
import { normalizePeriodMode, normalizeOffset, resolvePayPeriod, summarizeJobLabor } from '@/lib/labor';
import { CREW_ROSTER_VIEW_COOKIE, CREW_SKIN_COOKIE, CREW_THEME_COOKIE, CREW_VIEW_COOKIE, normalizeCrewSkin, normalizeCrewTheme, normalizeCrewView, normalizeRosterView } from '@/lib/dashboard-views';
import { loadCrewPayView } from '@/lib/crew-pay-view';
import { payBasisFromCrew, payRateLabel } from '@/lib/pay-types';
import { normalizePayrollProvider } from '@/lib/payroll-export';
import { laborTotalsByCrew, listLaborEntries } from '@/lib/labor-data';
import { LABOR_RULE_COLUMNS, LABOR_SETTINGS_COOKIE, laborRulesFromAccount, normalizeLaborSettings } from '@/lib/labor-settings';
import { isTimeClockAvailable, listOpenShifts } from '@/lib/time-clock-data';
import { loadSubcontractors, todayIn } from '@/lib/subcontractor-dispatch-data';
import { normalizeWorkerType } from '@/lib/subcontractors';
import { isCrewPhoneVerified } from '@/lib/crew-verification';
import CrewRoster, { type CrewRow } from './CrewRoster';
import HoursAndPay from './HoursAndPay';
import LaborByJob from './LaborByJob';
import CrewPeriodBar from './CrewPeriodBar';
import TimeClockCard from './TimeClockCard';
import AddPersonMenu from './AddPersonMenu';
import FieldIntakeHint from '@/components/field-intake-hint';
import styles from './crew.module.css';

export const metadata = { title: 'Crew & Labor' };
export const dynamic = 'force-dynamic';

const TABS = [
  { id: 'team', label: 'Team' },
  { id: 'timecards', label: 'Timecards' },
  { id: 'jobs', label: 'Job labor' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function normalizeTab(value: unknown): TabId {
  if (value === 'timecards' || value === 'hours') return 'timecards';
  if (value === 'jobs' || value === 'labor' || value === 'job-labor') return 'jobs';
  if (value === 'team' || value === 'people' || value === 'crew') return 'team';
  return 'team';
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
  searchParams: Promise<{
    tab?: string;
    status?: string;
    period?: string;
    offset?: string;
    from?: string;
    to?: string;
    crew?: string;
    worker?: string;
    risk?: string;
    add?: string;
    highlight?: string;
  }>;
}) {
  const resolvedSearchParams = (await searchParams) || {};
  // Operational features moved to Schedule
  if (resolvedSearchParams.tab === 'map') {
    redirect('/dashboard/schedule/dispatch');
  }
  if (resolvedSearchParams.tab === 'requests') {
    redirect('/dashboard/schedule/requests');
  }

  const { supabase, accountId, capabilities, role } = await requireOfficeContext('crew.read');
  const canViewPay = role === 'owner' || capabilities.has('crew_pay.read');
  const tab = normalizeTab(resolvedSearchParams.tab);

  const { data: accountRules } = await supabase
    .from('accounts')
    .select(`timezone, require_separate_payer, payroll_provider, ${LABOR_RULE_COLUMNS}`)
    .eq('id', accountId)
    .maybeSingle();
  const timeZone = ((accountRules as { timezone?: string } | null)?.timezone) || 'America/New_York';
  const settings = laborRulesFromAccount(
    accountRules as Parameters<typeof laborRulesFromAccount>[0],
    normalizeLaborSettings((await cookies()).get(LABOR_SETTINGS_COOKIE)?.value),
  );
  const requireSeparatePayer = (accountRules as { require_separate_payer?: boolean } | null)?.require_separate_payer === true;

  const period = resolvePayPeriod(
    resolvedSearchParams.period ? normalizePeriodMode(resolvedSearchParams.period) : settings.periodMode,
    normalizeOffset(resolvedSearchParams.offset),
    { from: resolvedSearchParams.from, to: resolvedSearchParams.to, timeZone },
  );

  const [crew, jobs] = await Promise.all([listCrew(supabase, accountId), listJobs(supabase, accountId)]);
  const photoUrls = await createCrewPhotoUrls(
    accountId,
    crew.map((member) => member.photo_path).filter((path): path is string => Boolean(path)),
  );

  const today = todayIn(timeZone);
  const subs =
    tab === 'team'
      ? await loadSubcontractors(supabase, accountId, { today, includeArchived: true })
      : [];
  const subsById = new Map(subs.map((sub) => [sub.id, sub]));

  const activeCrew = crew.filter((member) => member.active);
  const assignableJobs = jobs.filter((job) => job.status !== 'complete' && job.status !== 'archived');

  const assignmentsByJob = await listCrewAssignmentsForJobs(supabase, accountId, assignableJobs.map((job) => job.id));
  const jobsById = new Map(assignableJobs.map((job) => [job.id, job]));
  const jobsByCrew: Record<string, { id: string; ref: string; clientName: string }[]> = {};
  const jobsTodayByCrew: Record<string, { id: string; ref: string; clientName: string }[]> = {};

  const isJobScheduledToday = (job: { scheduled_for?: string | null; scheduled_until?: string | null }) => {
    if (!job.scheduled_for) return false;
    const start = job.scheduled_for;
    const end = job.scheduled_until || job.scheduled_for;
    return start <= today && today <= end;
  };

  for (const [jobId, crewIds] of Object.entries(assignmentsByJob)) {
    const job = jobsById.get(jobId);
    if (!job) continue;
    const isToday = isJobScheduledToday(job);
    for (const crewId of crewIds) {
      const bucket = jobsByCrew[crewId] ?? (jobsByCrew[crewId] = []);
      bucket.push({ id: job.id, ref: job.ref, clientName: job.client_name });
      if (isToday) {
        const todayBucket = jobsTodayByCrew[crewId] ?? (jobsTodayByCrew[crewId] = []);
        todayBucket.push({ id: job.id, ref: job.ref, clientName: job.client_name });
      }
    }
  }

  const openShiftsList = tab === 'timecards' || tab === 'team' ? await listOpenShifts(supabase, accountId) : [];
  const openShiftCrewIds = new Set(openShiftsList.map((s) => s.crewId));

  const totals = await laborTotalsByCrew(supabase, accountId, { startIso: period.startIso, endIso: period.endIso });

  const crewRows: CrewRow[] = crew.map((member) => {
    const bucket = totals.get(member.id);
    const sub = subsById.get(member.id) ?? null;
    return {
      id: member.id,
      name: member.name,
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
      hourlyRate: canViewPay ? Number(member.hourly_rate) || 0 : 0,
      payType: canViewPay ? payBasisFromCrew(member).payType : 'hourly',
      annualSalary: canViewPay && member.annual_salary != null ? Number(member.annual_salary) : null,
      dayRate: canViewPay && member.day_rate != null ? Number(member.day_rate) : null,
      payrollId: canViewPay ? member.payroll_id ?? null : null,
      rateLabel: canViewPay ? payRateLabel(payBasisFromCrew(member)) : '',
      phone: member.phone || null,
      phoneLabel: member.phone ? formatPhoneDashes(member.phone) : null,
      phoneVerified: isCrewPhoneVerified(member),
      email: member.email,
      startAddress: member.start_address ?? null,
      permissions: arrivalPermissionsFromCrew(member as unknown as Record<string, unknown>),
      canShareWorkLocation: member.can_share_work_location !== false,
      active: member.active,
      fieldApp: fieldAppState(member),
      fieldAppDetail: fieldAppDetail(member),
      jobs: jobsByCrew[member.id] ?? [],
      jobsToday: jobsTodayByCrew[member.id] ?? [],
      isBusyToday: openShiftCrewIds.has(member.id) || (jobsTodayByCrew[member.id] ?? []).length > 0,
      periodHours: bucket?.hours ?? 0,
      periodPay: canViewPay ? (bucket?.pay ?? 0) : 0,
      periodPayLabel: canViewPay ? payMoney(bucket?.pay ?? 0) : '',
      createdAt: member.created_at,
    };
  });

  const laborEntries =
    tab === 'jobs'
      ? await listLaborEntries(supabase, accountId, { startIso: period.startIso, endIso: period.endIso, crewId: null })
      : [];
  const jobRows = tab === 'jobs' ? summarizeJobLabor(laborEntries, jobs) : [];

  const cookieStore = await cookies();
  const crewView = normalizeCrewView(cookieStore.get(CREW_VIEW_COOKIE)?.value);
  const rosterView = normalizeRosterView(cookieStore.get(CREW_ROSTER_VIEW_COOKIE)?.value);
  const crewTheme = normalizeCrewTheme(cookieStore.get(CREW_THEME_COOKIE)?.value);
  const crewSkin = normalizeCrewSkin(cookieStore.get(CREW_SKIN_COOKIE)?.value);

  const payView =
    tab === 'timecards'
      ? await loadCrewPayView(supabase, accountId, {
          period,
          settings,
          timeZone,
          crew,
          crewId: resolvedSearchParams.crew ?? null,
          withComparison: crewView === 'grouped',
          searchParams: resolvedSearchParams,
        })
      : null;

  const timeClockAvailable = tab === 'timecards' ? await isTimeClockAvailable(supabase, accountId) : false;

  const tabHref = (next: TabId) => {
    const query = new URLSearchParams();
    query.set('tab', next);
    if (resolvedSearchParams.period) query.set('period', resolvedSearchParams.period);
    if (resolvedSearchParams.offset) query.set('offset', resolvedSearchParams.offset);
    if (resolvedSearchParams.from) query.set('from', resolvedSearchParams.from);
    if (resolvedSearchParams.to) query.set('to', resolvedSearchParams.to);
    return `/dashboard/crew?${query.toString()}`;
  };

  return (
    <main
      className={[
        'wide-shell',
        'workspace-shell',
        'crew-shell',
        crewTheme === 'focus' ? 'crew-focus' : '',
        crewSkin !== 'standard' ? 'crew-skin' : '',
        crewSkin !== 'standard' ? `crew-skin-${crewSkin}` : '',
        crewTheme !== 'overview' &&
        (crewTheme === 'focus' ||
          (tab === 'timecards' && crewView === 'rail') ||
          (tab === 'team' && (rosterView === 'board' || rosterView === 'table')))
          ? 'crew-wide'
          : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <section className={`panel workspace-section-card ${styles.crewPanel}`}>
        <header className={styles.pageHead}>
          <div>
            <p className="eyebrow">Team &amp; Labor</p>
            <h1 className={styles.pageTitle}>Crew &amp; Labor</h1>
          </div>
          <div className={styles.pageHeadActions}>
            <Link
              href="/dashboard/schedule/dispatch"
              className="btn secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.84rem' }}
            >
              <span>Live Dispatch →</span>
            </Link>
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
            <FieldIntakeHint page="crew" />
            {tab === 'team' ? (
              <AddPersonMenu
                employeeHref="/dashboard/crew?tab=people&add=1"
                subcontractorHref="/dashboard/crew?tab=people&add=sub"
              />
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

        {tab !== 'team' ? (
          <CrewPeriodBar
            period={period}
            tab={tab}
            basePath="/dashboard/crew"
            extraParams={{
              crew: resolvedSearchParams.crew,
              risk: resolvedSearchParams.risk,
            }}
          />
        ) : null}

        {tab === 'team' ? (
          <>
            <div className={styles.voiceHotlineBanner}>
              <div className={styles.voiceHotlineContent}>
                <div className={styles.voiceHotlineHeader}>
                  <span className={styles.voiceHotlineIcon}>🎙️</span>
                  <strong className={styles.voiceHotlineTitle}>2-Way Field Voice Hotline Enabled</strong>
                  <span className={styles.voiceHotlineBadge}>Zero Extra Lines</span>
                </div>
                <p className={styles.voiceHotlineDesc}>
                  Adding a phone number to any crew member allows them to call your main business number from the road to update job scopes, log materials, and record change orders hands-free.
                </p>
              </div>
              <Link href="/dashboard/voice-calls" className={styles.voiceHotlineLink}>
                View Voice Assistant →
              </Link>
            </div>
            <CrewRoster
              rows={crewRows}
              assignableJobs={assignableJobs.map((job) => ({ id: job.id, ref: job.ref, clientName: job.client_name }))}
              periodLabel={period.rangeLabel}
              initialStatus={resolvedSearchParams.status === 'archived' ? 'archived' : 'active'}
              initialWorkerType={resolvedSearchParams.worker === 'subcontractor' || resolvedSearchParams.worker === 'employee' ? resolvedSearchParams.worker : 'all'}
              initialView={rosterView === 'table' ? 'table' : 'rows'}
              initialOverview={crewTheme === 'overview'}
              highlight={resolvedSearchParams.highlight}
            />
          </>
        ) : null}

        {tab === 'timecards' && payView ? (
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
            crewFilter={resolvedSearchParams.crew ?? null}
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
            initialView={crewView === 'table' ? 'table' : 'grouped'}
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

        {tab === 'timecards' ? (
          <TimeClockCard
            mode={payView?.timeClockMode ?? 'off'}
            available={timeClockAvailable}
            crewCount={activeCrew.length}
            openShiftCount={payView?.openShifts?.length ?? 0}
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
              description: entry.description || '',
              hours: Number(entry.hours) || 0,
              amount: Number(entry.amount) || 0,
              loggedAt: entry.created_at,
            }))}
          />
        ) : null}
      </section>
    </main>
  );
}
