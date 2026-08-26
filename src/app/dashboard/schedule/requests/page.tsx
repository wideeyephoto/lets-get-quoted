import Link from 'next/link';
import { requireOfficeContext } from '@/lib/auth';
import { listJobs } from '@/lib/jobs';
import { listSubcontractorRequests, loadSubcontractors, todayIn } from '@/lib/subcontractor-dispatch-data';
import { isLiveMessagingEnvironment } from '@/lib/sms';
import JobRequests from '@/app/dashboard/crew/JobRequests';

export const metadata = { title: 'Coverage Requests · Schedule' };
export const dynamic = 'force-dynamic';

export default async function ScheduleCoverageRequestsPage() {
  const { supabase, accountId } = await requireOfficeContext('crew.read');
  const { data: accountRules } = await supabase
    .from('accounts')
    .select('timezone')
    .eq('id', accountId)
    .maybeSingle();
  const timeZone = (accountRules as { timezone?: string } | null)?.timezone || 'America/New_York';
  const today = todayIn(timeZone);

  const [jobs, subs, requests] = await Promise.all([
    listJobs(supabase, accountId),
    loadSubcontractors(supabase, accountId, { today, includeArchived: true }),
    listSubcontractorRequests(supabase, accountId),
  ]);

  const assignableJobs = jobs.filter((job) => job.status !== 'complete' && job.status !== 'archived');

  return (
    <main className="wide-shell workspace-shell crew-shell">
      <section className="panel workspace-section-card" style={{ padding: '1.25rem' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <p className="eyebrow" style={{ margin: 0 }}>Schedule &amp; Operations</p>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0.25rem 0' }}>Coverage Requests</h1>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <Link href="/dashboard/schedule" className="btn secondary sm">
              ← Calendar
            </Link>
            {subs.length > 0 && assignableJobs.length > 0 ? (
              <Link href="/dashboard/crew/requests/new" className="btn primary sm">
                + New job request
              </Link>
            ) : null}
          </div>
        </header>

        <JobRequests
          entries={requests}
          assignableJobs={assignableJobs.map((job) => ({ id: job.id, ref: job.ref, clientName: job.client_name }))}
          subcontractorCount={subs.length}
          simulated={!isLiveMessagingEnvironment()}
        />
      </section>
    </main>
  );
}
