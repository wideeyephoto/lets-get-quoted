import { cronRoute } from '@/lib/cron-runs';
import { runCustomDomainReconcile } from '@/lib/custom-domain-reconciler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

// Every fifteen minutes rather than daily, because this job exists to close a
// gap measured in minutes: the certificate finishing while the contractor is
// looking at the page. A daily re-check would leave a working domain reported
// as pending for most of a day and is no better than asking them to click.
export const GET = cronRoute('custom-domain-reconcile', runCustomDomainReconcile);
