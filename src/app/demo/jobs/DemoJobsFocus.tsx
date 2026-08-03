'use client';

import FocusView from '@/app/dashboard/jobs/FocusView';
import type { JobViewItem } from '@/app/dashboard/jobs/JobsWorkspace';
import type { JobDetailDto } from '@/lib/job-detail';

// The real Focus pane, handed fictional jobs and their detail up front so it
// never calls the API.
export default function DemoJobsFocus({
  jobs,
  details,
}: {
  jobs: JobViewItem[];
  details: Record<string, JobDetailDto>;
}) {
  return <FocusView jobs={jobs} details={details} />;
}
