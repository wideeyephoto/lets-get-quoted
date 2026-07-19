import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { expandScheduledJobs, formatMoney, listJobs, type Job } from '@/lib/jobs';
import { listCrew, listCrewAssignmentsForJobs } from '@/lib/crew';
import ScheduledDatePicker from '@/components/scheduled-date-picker';
import TimeSlotSelect from '@/components/time-slot-select';
import { scheduleJobAction, sendClientScheduleOptionsAction, updateJobCrewAction } from '../jobs/actions';
import { updateCrewAction } from '../crew/actions';
import ScheduleCalendar from './schedule-calendar';

const STATUS_LABEL: Record<Job['status'], string> = {
  new_lead: 'New request',
  in_progress: 'In progress',
  complete: 'Complete',
  archived: 'Archived',
};

function parseMonthParam(month?: string): { year: number; monthIndex: number } {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number);
    if (m >= 1 && m <= 12) return { year: y, monthIndex: m - 1 };
  }
  const now = new Date();
  return { year: now.getFullYear(), monthIndex: now.getMonth() };
}

function toDateKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDaysToKey(date: Date, days: number): string {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return toDateKey(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate());
}

function nextWeekdayKey(date: Date, weekday: number): string {
  const nextDate = new Date(date);
  const distance = (weekday + 7 - nextDate.getDay()) % 7 || 7;
  nextDate.setDate(nextDate.getDate() + distance);
  return toDateKey(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate());
}

function crewInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

function monthParam(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const { supabase, accountId } = await requireOwnerContext();
  const [{ data: account }, jobs] = await Promise.all([
    supabase.from('accounts').select('schedule_day_hours').eq('id', accountId).single(),
    listJobs(supabase, accountId),
  ]);
  const scheduleDayHours = Number(account?.schedule_day_hours) || 8;

  const activeJobs = jobs.filter((job) => job.status !== 'archived');
  const scheduledJobs = activeJobs.filter((job) => job.scheduled_for);
  const scheduledJobOccurrences = expandScheduledJobs(scheduledJobs, scheduleDayHours);
  const unscheduledJobs = activeJobs.filter((job) => !job.scheduled_for);

  const crew = await listCrew(supabase, accountId, { activeOnly: true });
  const assignmentsByJob = await listCrewAssignmentsForJobs(
    supabase,
    accountId,
    activeJobs.map((job) => job.id)
  );
  const crewInitialsById = new Map(crew.map((member) => [member.id, crewInitials(member.name)]));
  const crewById = new Map(crew.map((member) => [member.id, member]));

  const { year, monthIndex } = parseMonthParam(searchParams.month);
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const cells: Array<{ day: number; dateKey: string } | null> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push({ day, dateKey: toDateKey(year, monthIndex, day) });
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: Array<typeof cells> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const now = new Date();
  const todayKey = toDateKey(now.getFullYear(), now.getMonth(), now.getDate());
  const monthLabel = new Date(year, monthIndex, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const prevMonth = monthParam(year, monthIndex - 1);
  const nextMonth = monthParam(year, monthIndex + 1);
  const currentMonth = monthParam(now.getFullYear(), now.getMonth());
  const quickSchedulePresets = [
    { label: 'Today 8 AM', date: todayKey, time: '08:00' },
    { label: 'Tomorrow 8 AM', date: addDaysToKey(now, 1), time: '08:00' },
    { label: 'Next Mon 8 AM', date: nextWeekdayKey(now, 1), time: '08:00' },
    { label: 'Next Fri 9 AM', date: nextWeekdayKey(now, 5), time: '09:00' },
  ];

  const in30Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30);
  const next30Key = toDateKey(in30Days.getFullYear(), in30Days.getMonth(), in30Days.getDate());
  const scheduledNext30DayJobs = scheduledJobs.filter((job) => {
    const dateKey = job.scheduled_for as string;
    return dateKey >= todayKey && dateKey <= next30Key;
  });
  const scheduledNext30Days = scheduledNext30DayJobs.length;
  const estimatedRevenue = scheduledNext30DayJobs.reduce((sum, job) => sum + Number(job.quoted_amount || 0), 0);
  const next30JobIds = scheduledNext30DayJobs.map((job) => job.id);
  const { data: next30Costs } = next30JobIds.length > 0
    ? await supabase
        .from('costs')
        .select('amount')
        .eq('account_id', accountId)
        .in('job_id', next30JobIds)
    : { data: [] as Array<{ amount: number | string | null }> };
  const estimatedCost = (next30Costs ?? []).reduce((sum, cost) => sum + Number(cost.amount || 0), 0);
  const estimatedProfit = estimatedRevenue - estimatedCost;

  const scheduledJobIds = scheduledJobs.map((job) => job.id);
  const { data: crewDateTextEvents } = scheduledJobIds.length > 0
    ? await supabase
        .from('job_feed')
        .select('job_id, created_at')
        .eq('account_id', accountId)
        .eq('title', 'Crew date text sent')
        .in('job_id', scheduledJobIds)
        .order('created_at', { ascending: false })
    : { data: [] as Array<{ job_id: string; created_at: string }> };
  const crewNotifiedAtByJob = new Map<string, string>();
  for (const event of crewDateTextEvents ?? []) {
    const jobId = event.job_id as string;
    if (!crewNotifiedAtByJob.has(jobId)) crewNotifiedAtByJob.set(jobId, event.created_at as string);
  }

  const calendarJobs = scheduledJobOccurrences.map((job) => ({
    id: job.id,
    occurrence_key: `${job.id}:${job.scheduled_for}`,
    client_name: job.client_name,
    status: job.status,
    scheduled_for: job.scheduled_for,
    scheduled_time: job.scheduled_time,
    crew_notified_at: crewNotifiedAtByJob.get(job.id) ?? null,
  }));

  const crewOptions = crew.map((member) => ({
    id: member.id,
    name: member.name,
    role_label: member.role_label,
  }));

  return (
    <main className="wide-shell workspace-shell">
      <section className="panel workspace-section-card schedule-calendar-panel">
        <div className="schedule-calendar-header">
          <div className="workspace-hero-copy schedule-calendar-copy">
            <p className="eyebrow">Schedule</p>
            <h1 className="workspace-title">Job calendar</h1>
            <p className="workspace-lead">
              See what&apos;s on the books this month and get unscheduled jobs onto a date.
            </p>
          </div>
          <div className="workspace-metric-grid calendar-heading-metrics">
            <Link className="workspace-metric-card accent schedule-summary-card metric-card-link" href="/dashboard/jobs" aria-label="Open jobs page">
              <div className="schedule-summary-title">
                <span className="workspace-metric-label">Next 30 days</span>
              </div>
              <div className="schedule-summary-stats">
                <span>
                  <strong>{scheduledNext30Days}</strong>
                  <small>Jobs</small>
                </span>
                <span>
                  <strong>{formatMoney(estimatedRevenue)}</strong>
                  <small>Revenue</small>
                </span>
                <span>
                  <strong>{formatMoney(estimatedProfit)}</strong>
                  <small>Profit</small>
                </span>
              </div>
            </Link>
            <a
              className="workspace-metric-card metric-card-link"
              href="#unscheduled-jobs"
              aria-label={`${unscheduledJobs.length} active ${unscheduledJobs.length === 1 ? 'job needs' : 'jobs need'} a scheduled date`}
            >
              <span className="workspace-metric-label">Needs date</span>
              <strong className="workspace-metric-value">{unscheduledJobs.length}</strong>
            </a>
          </div>
        </div>

        <div className="calendar-heading">
          <div>
            <p className="eyebrow">Calendar</p>
            <h2>{monthLabel}</h2>
          </div>
          <div className="actions">
            <Link href={`/dashboard/schedule?month=${prevMonth}`} className="btn secondary">← Prev</Link>
            <Link href={`/dashboard/schedule?month=${currentMonth}`} className="btn secondary">Today</Link>
            <Link href={`/dashboard/schedule?month=${nextMonth}`} className="btn secondary">Next →</Link>
          </div>
        </div>

        <ScheduleCalendar
          weeks={weeks}
          todayKey={todayKey}
          jobs={calendarJobs}
          crew={crewOptions}
          assignmentsByJob={assignmentsByJob}
        />
      </section>

      {unscheduledJobs.length > 0 ? (
        <section className="panel workspace-section-card" id="unscheduled-jobs">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Needs a date</p>
            <h2>Unscheduled jobs</h2>
          </div>
          <div className="sign-in-methods-list">
            {unscheduledJobs.map((job) => {
              const boundSchedule = scheduleJobAction.bind(null, job.id);
              const boundSendScheduleOptions = sendClientScheduleOptionsAction.bind(null, job.id);
              const boundUpdateCrew = updateJobCrewAction.bind(null, job.id);
              const assignedCrewIds = assignmentsByJob[job.id] ?? [];
              const assignedCrewIdSet = new Set(assignedCrewIds);
              const assignedCrewInitials = (assignmentsByJob[job.id] ?? [])
                .map((crewId) => crewInitialsById.get(crewId))
                .filter((initials): initials is string => Boolean(initials));
              const assignedCrewMembers = assignedCrewIds
                .map((crewId) => crewById.get(crewId))
                .filter((member): member is typeof crew[number] => Boolean(member));
              return (
                <div className="sign-in-method-row schedule-method-row" key={job.id}>
                  <div className="method-info">
                    <div>
                      <Link className="method-name" href={`/dashboard/jobs/${job.id}`}>{job.client_name}</Link>
                      <span className="method-detail">
                        {STATUS_LABEL[job.status]} · {job.address || 'No address on file'} · Est. hours: {job.estimated_hours ? `${job.estimated_hours} hrs` : 'Not set'}
                      </span>
                      <div className="schedule-crew-initials" aria-label={assignedCrewInitials.length > 0 ? `Assigned crew: ${assignedCrewInitials.join(', ')}` : 'No crew assigned'}>
                        <details className="schedule-crew-picker" name={`schedule-crew-picker-${job.id}`}>
                          <summary>Crew</summary>
                          <form action={boundUpdateCrew} className="schedule-crew-picker-panel">
                            <div className="schedule-crew-picker-heading">
                              <strong>Active crew</strong>
                              <span>Add or remove crew for this job.</span>
                            </div>
                            {crew.length === 0 ? (
                              <p className="crew-assign-empty">No active crew yet. <Link href="/dashboard/crew">Add your team →</Link></p>
                            ) : (
                              <div className="schedule-crew-picker-list">
                                {crew.map((member) => (
                                  <label className="schedule-crew-picker-option" key={member.id}>
                                    <input name="crewIds" type="checkbox" value={member.id} defaultChecked={assignedCrewIdSet.has(member.id)} />
                                    <span className="schedule-crew-picker-check" aria-hidden="true">✓</span>
                                    <span className="schedule-crew-picker-copy">
                                      <strong>{member.name}</strong>
                                      <small>{member.role_label}</small>
                                    </span>
                                  </label>
                                ))}
                              </div>
                            )}
                            <button type="submit" className="btn primary schedule-crew-picker-save">Save crew</button>
                          </form>
                        </details>
                        {assignedCrewMembers.length > 0 ? assignedCrewMembers.map((member) => (
                          <details className="schedule-crew-card" key={member.id} name={`schedule-crew-${job.id}`}>
                            <summary className="schedule-crew-badge" title={member.name}>
                              <strong>{crewInitials(member.name)}</strong>
                            </summary>
                            <div className="schedule-crew-card-panel">
                              <div className="schedule-crew-card-header">
                                <div>
                                  <strong>{member.name}</strong>
                                  <span>{member.role_label}</span>
                                </div>
                                <Link href="/dashboard/crew" className="btn secondary">Crew page</Link>
                              </div>
                              <dl className="schedule-crew-card-details">
                                <div>
                                  <dt>Phone</dt>
                                  <dd>{member.phone}</dd>
                                </div>
                                <div>
                                  <dt>Rate</dt>
                                  <dd>{member.hourly_rate > 0 ? `${formatMoney(member.hourly_rate)}/hr` : 'Not set'}</dd>
                                </div>
                              </dl>
                              <details className="schedule-crew-edit">
                                <summary className="btn secondary">Edit Crew Member</summary>
                                <form action={updateCrewAction.bind(null, member.id)} className="schedule-crew-edit-form">
                                  <label htmlFor={`scheduleCrewName-${job.id}-${member.id}`}>Name</label>
                                  <input id={`scheduleCrewName-${job.id}-${member.id}`} name="name" required defaultValue={member.name} />
                                  <label htmlFor={`scheduleCrewPhone-${job.id}-${member.id}`}>Phone</label>
                                  <input id={`scheduleCrewPhone-${job.id}-${member.id}`} name="phone" type="tel" required defaultValue={member.phone} />
                                  <label htmlFor={`scheduleCrewRole-${job.id}-${member.id}`}>Role</label>
                                  <input id={`scheduleCrewRole-${job.id}-${member.id}`} name="roleLabel" defaultValue={member.role_label} />
                                  <label htmlFor={`scheduleCrewRate-${job.id}-${member.id}`}>Hourly rate ($)</label>
                                  <input id={`scheduleCrewRate-${job.id}-${member.id}`} name="hourlyRate" type="number" min="0" step="0.01" defaultValue={member.hourly_rate} />
                                  <button type="submit" className="btn primary">Save crew member</button>
                                </form>
                              </details>
                            </div>
                          </details>
                        )) : <em>None</em>}
                      </div>
                    </div>
                  </div>
                  <div className="schedule-action-buttons">
                    <details className="schedule-popover" name={`schedule-popover-${job.id}`}>
                      <summary className="btn secondary">Add Start Date</summary>
                      <div className="schedule-popover-panel schedule-start-panel">
                        <form action={boundSchedule} className="schedule-inline-form schedule-start-form">
                          <div className="schedule-inline-field schedule-inline-date">
                            <ScheduledDatePicker id={`scheduledFor-${job.id}`} name="scheduledFor" required />
                          </div>
                          <div className="schedule-inline-field schedule-inline-time">
                            <TimeSlotSelect id={`scheduledTime-${job.id}`} name="scheduledTime" />
                          </div>
                          <button type="submit" className="btn primary schedule-save-button">Save Start Date</button>
                        </form>
                        <div className="schedule-preset-grid" aria-label={`Quick schedule presets for ${job.client_name}`}>
                          {quickSchedulePresets.map((preset) => (
                            <form action={boundSchedule} key={`${job.id}-${preset.label}`}>
                              <input type="hidden" name="scheduledFor" value={preset.date} />
                              <input type="hidden" name="scheduledTime" value={preset.time} />
                              <button type="submit" className="schedule-preset-button">{preset.label}</button>
                            </form>
                          ))}
                        </div>
                      </div>
                    </details>
                    <details className="schedule-popover" name={`schedule-popover-${job.id}`}>
                      <summary className="btn secondary">Let the client choose</summary>
                      <div className="schedule-popover-panel">
                        <form action={boundSendScheduleOptions} className="schedule-inline-form schedule-client-options-form">
                          <div className="schedule-client-options-intro">
                            <strong>Send up to 3 dates that you&apos;re available to your client.</strong>
                            <span>You will receive a text and notifications in your dashboard when they have responded.</span>
                          </div>
                          <div className="schedule-inline-field schedule-inline-date">
                            <label htmlFor={`scheduleClientPhone-${job.id}`}>Client mobile</label>
                            <input id={`scheduleClientPhone-${job.id}`} name="scheduleClientPhone" type="tel" defaultValue={job.client_phone ?? ''} placeholder="(248) 555-0117" />
                          </div>
                          {[1, 2, 3].map((optionNumber) => (
                            <div className={`schedule-option-grid schedule-option-${optionNumber}`} key={`${job.id}-option-${optionNumber}`}>
                              <div>
                                <label htmlFor={`scheduleDate${optionNumber}-${job.id}`}>Option {optionNumber} date</label>
                                <ScheduledDatePicker id={`scheduleDate${optionNumber}-${job.id}`} name={`scheduleDate${optionNumber}`} scrollIntoViewOnOpen={optionNumber === 3} />
                              </div>
                              <div>
                                <label htmlFor={`scheduleTime${optionNumber}-${job.id}`}>Option {optionNumber} time</label>
                                <TimeSlotSelect id={`scheduleTime${optionNumber}-${job.id}`} name={`scheduleTime${optionNumber}`} scrollIntoViewOnOpen={optionNumber === 3} />
                              </div>
                            </div>
                          ))}
                          <label className="sms-consent-check">
                            <input name="scheduleSmsConsent" type="checkbox" required />
                            <span>The client agreed to receive transactional scheduling texts. Reply STOP to opt out.</span>
                          </label>
                          <button type="submit" className="btn primary schedule-save-button">Send Dates to Client</button>
                        </form>
                      </div>
                    </details>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </main>
  );
}
