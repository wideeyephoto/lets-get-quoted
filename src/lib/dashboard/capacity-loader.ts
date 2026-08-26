import type { Job, ScheduledJobOccurrence } from '@/lib/jobs';
import { capacityLevel, type CapacityLevel } from '@/lib/schedule-capacity';
import { ready, type CapacityDay, type CapacitySummary, type Loadable } from '@/lib/dashboard-types';

export function buildCapacitySummary(input: {
  next7Days: { dateKey: string; label: string; shortLabel: string; jobs: ScheduledJobOccurrence<Job>[] }[];
  todayKey: string;
  scheduleDayHours: number;
  unscheduledApprovedJobsCount: number;
}): Loadable<CapacitySummary> {
  const { next7Days, todayKey, scheduleDayHours, unscheduledApprovedJobsCount } = input;

  const days: CapacityDay[] = next7Days.map((day) => {
    const bookedHours = day.jobs.reduce((sum, job) => sum + (Number(job.estimated_hours) || (scheduleDayHours / 2)), 0);
    const level: CapacityLevel = day.jobs.length === 0
      ? 'open'
      : capacityLevel({
          bookedHours,
          capacityHours: scheduleDayHours,
          jobCount: day.jobs.length,
        });

    return {
      dateKey: day.dateKey,
      label: day.label,
      shortLabel: day.shortLabel,
      isToday: day.dateKey === todayKey,
      jobCount: day.jobs.length,
      level,
      jobs: day.jobs,
    };
  });

  const quietDaysCount = days.filter((d) => d.jobCount === 0).length;
  const workingDaysWithJobs = days.filter((d) => d.jobCount > 0).length;
  const daysAtOrOverCapacity = days.filter((d) => d.level === 'full' || d.level === 'over').length;

  return ready({
    days,
    workingDaysWithJobs,
    workingDaysTotal: days.length,
    quietDaysCount,
    daysAtOrOverCapacity,
    unscheduledApprovedJobsCount,
    crewAvailabilityConflictsCount: 0,
  });
}
