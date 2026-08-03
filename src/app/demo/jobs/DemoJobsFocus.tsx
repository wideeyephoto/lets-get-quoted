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
  // basePath keeps every link in the pane inside the demo. Without it "Open
  // job", "Request payment" and "Add expense" all pointed at /dashboard, so the
  // most interesting thing on the page was a trapdoor to the login wall.
  return <FocusView jobs={jobs} details={details} basePath="/demo" />;
}
