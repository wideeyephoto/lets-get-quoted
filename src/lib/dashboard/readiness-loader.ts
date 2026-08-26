import type { Job, ScheduledJobOccurrence } from '@/lib/jobs';
import { ready, type JobReadinessIssue, type Loadable, type ReadinessSummary } from '@/lib/dashboard-types';

export function buildJobReadiness(input: {
  upcomingOccurrences: ScheduledJobOccurrence<Job>[];
  assignmentsByJob: Record<string, string[]>;
  basePath?: string;
}): Loadable<ReadinessSummary> {
  const { upcomingOccurrences, assignmentsByJob, basePath = '/dashboard' } = input;

  // Deduplicate by job.id
  const seenJobIds = new Set<string>();
  const distinctJobs: ScheduledJobOccurrence<Job>[] = [];
  for (const occ of upcomingOccurrences) {
    if (!seenJobIds.has(occ.id)) {
      seenJobIds.add(occ.id);
      distinctJobs.push(occ);
    }
  }

  const blockedJobs: JobReadinessIssue[] = [];

  for (const job of distinctJobs) {
    const blockers: string[] = [];

    if (!job.scheduled_time) {
      blockers.push('No arrival / start time set');
    }

    const assigned = assignmentsByJob[job.id] ?? [];
    if (assigned.length === 0) {
      blockers.push('No crew assigned');
    }

    if (!job.address || job.address.trim().length === 0) {
      blockers.push('Missing job site address');
    }

    if (blockers.length > 0) {
      blockedJobs.push({
        jobId: job.id,
        clientName: job.client_name || 'Unnamed Client',
        scheduledDate: job.scheduled_for || null,
        blockers,
        href: `${basePath}/jobs/${job.id}`,
      });
    }
  }

  const upcomingJobsCount = distinctJobs.length;
  const fullyReadyCount = Math.max(0, upcomingJobsCount - blockedJobs.length);

  return ready({
    upcomingJobsCount,
    fullyReadyCount,
    blockedJobs,
  });
}
