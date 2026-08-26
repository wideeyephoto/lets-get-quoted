import { formatJobTime, type Job, type ScheduledJobOccurrence } from '@/lib/jobs';
import type { CrewMember } from '@/lib/crew';
import { ready, type Loadable, type TodayJobReadiness, type TodayJobStatus, type TodayScheduleItem, type TodayScheduleSummary } from '@/lib/dashboard-types';

export function extractCity(address: string | null): string {
  if (!address) return 'No address on file';
  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  const statePattern = /^[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/i;
  const cityPart = parts.find((part, index) => index > 0 && !statePattern.test(part));
  if (cityPart) return cityPart;

  const stateIndex = parts.findIndex((part) => statePattern.test(part));
  const fallback = stateIndex > 0 ? parts[stateIndex - 1] : parts[0];
  const inferredCity = fallback?.match(/(?:\b(?:Ave|Avenue|St|Street|Rd|Road|Dr|Drive|Ln|Lane|Ct|Court|Blvd|Boulevard|Way|Trail|Trl|Circle|Cir)\b\.?\s+)(.+)$/i)?.[1];
  return inferredCity || fallback || 'No address on file';
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function buildTodaySchedule(input: {
  todayJobs: ScheduledJobOccurrence<Job>[];
  crew: CrewMember[];
  assignmentsByJob: Record<string, string[]>;
  todayKey: string;
  dateLabel: string;
  basePath?: string;
}): Loadable<TodayScheduleSummary> {
  const { todayJobs, crew, assignmentsByJob, todayKey, dateLabel, basePath = '/dashboard' } = input;

  const items: TodayScheduleItem[] = todayJobs.map((job) => {
    const assignedIds = assignmentsByJob[job.id] ?? [];
    const assignedMembers = assignedIds
      .map((id) => crew.find((m) => m.id === id))
      .filter((m): m is CrewMember => Boolean(m))
      .map((m) => ({
        id: m.id,
        name: m.name,
        initials: initials(m.name),
      }));

    let readiness: TodayJobReadiness = 'ready';
    if (!job.scheduled_time) {
      readiness = 'needs_time';
    } else if (assignedMembers.length === 0) {
      readiness = 'needs_crew';
    }

    let status: TodayJobStatus = 'upcoming';
    if (job.status === 'complete') {
      status = 'complete';
    } else if (job.status === 'in_progress') {
      status = 'in_progress';
    }

    return {
      jobId: job.id,
      clientName: job.client_name || 'Unnamed Client',
      jobType: job.scope?.slice(0, 40) || 'Scheduled Work',
      address: job.address,
      city: extractCity(job.address),
      scheduledTime: job.scheduled_time || null,
      formattedTime: formatJobTime(job.scheduled_time) || 'No time set',
      assignedCrew: assignedMembers,
      quotedAmount: Number(job.quoted_amount) || 0,
      status,
      readiness,
      href: `${basePath}/jobs/${job.id}`,
    };
  });

  const totalWorkValue = items.reduce((sum, item) => sum + item.quotedAmount, 0);
  const completedCount = items.filter((i) => i.status === 'complete').length;
  const inProgressCount = items.filter((i) => i.status === 'in_progress').length;
  const upcomingCount = items.filter((i) => i.status === 'upcoming').length;

  return ready({
    dateLabel,
    dateKey: todayKey,
    items,
    totalWorkValue,
    completedCount,
    inProgressCount,
    upcomingCount,
  });
}
