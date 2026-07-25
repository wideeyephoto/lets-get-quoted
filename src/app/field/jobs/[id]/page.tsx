import { redirect } from 'next/navigation';
import { requireCrewContext } from '@/lib/crew-auth';
import { isJobAssignedToCrew } from '@/lib/crew';
import { formatJobSchedule } from '@/lib/jobs';
import { formatPhoneDashes } from '@/lib/phone';
import SaveButton from '@/components/save-button';
import FieldHeader from '../../FieldHeader';
import { setFieldJobStatusAction, postFieldUpdateAction } from './actions';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  new_lead: 'New',
  in_progress: 'In progress',
  complete: 'Complete',
  archived: 'Archived',
};

function formatTime(value: string): string {
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default async function FieldJobPage({ params }: { params: { id: string } }) {
  const { supabase, accountId, crew } = await requireCrewContext();

  if (!(await isJobAssignedToCrew(supabase, accountId, params.id, crew.id))) {
    redirect('/field');
  }

  const { data: job } = await supabase
    .from('jobs')
    .select('id, ref, client_name, client_phone, address, scope, status, scheduled_for, scheduled_time')
    .eq('account_id', accountId)
    .eq('id', params.id)
    .maybeSingle();
  if (!job) redirect('/field');

  const [{ data: account }, { data: site }, { data: feed }] = await Promise.all([
    supabase.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
    supabase.from('sites').select('company_name').eq('account_id', accountId).maybeSingle(),
    supabase
      .from('job_feed')
      .select('id, title, body, author, created_at')
      .eq('account_id', accountId)
      .eq('job_id', params.id)
      .order('created_at', { ascending: false })
      .limit(8),
  ]);
  const businessName = site?.company_name || account?.business_name || 'My crew';

  const mapUrl = job.address ? `https://maps.google.com/?q=${encodeURIComponent(job.address)}` : null;
  const isComplete = job.status === 'complete';

  return (
    <>
      <FieldHeader businessName={businessName} crewName={crew.name} backHref="/field" />
      <main className="field-main">
        <div className="field-detail-head">
          <h1>{job.client_name}</h1>
          <span className={`field-status field-status-${job.status}`}>{STATUS_LABEL[job.status] ?? job.status}</span>
        </div>
        <p className="field-detail-ref">{job.ref} · {formatJobSchedule(job.scheduled_for, job.scheduled_time)}</p>

        <div className="field-actions-row">
          {job.client_phone ? (
            <>
              <a className="field-chip" href={`tel:${job.client_phone}`}>📞 Call</a>
              <a className="field-chip" href={`sms:${job.client_phone}`}>💬 Text</a>
            </>
          ) : null}
          {mapUrl ? <a className="field-chip" href={mapUrl} target="_blank" rel="noopener noreferrer">🧭 Navigate</a> : null}
        </div>

        {job.address ? (
          <section className="field-block">
            <h2 className="field-block-title">Address</h2>
            <p>{job.address}</p>
          </section>
        ) : null}

        {job.client_phone ? (
          <section className="field-block">
            <h2 className="field-block-title">Customer</h2>
            <p>{formatPhoneDashes(job.client_phone)}</p>
          </section>
        ) : null}

        <section className="field-block">
          <h2 className="field-block-title">Scope of work</h2>
          <p className="field-scope-body">{job.scope || 'No scope notes added yet.'}</p>
        </section>

        <section className="field-block">
          <h2 className="field-block-title">Update status</h2>
          <div className="field-actions-row">
            {!isComplete && job.status !== 'in_progress' ? (
              <form action={setFieldJobStatusAction.bind(null, job.id, 'in_progress')}>
                <SaveButton className="btn secondary" pendingLabel="Saving…" savedLabel="Started ✓">Start work</SaveButton>
              </form>
            ) : null}
            {!isComplete ? (
              <form action={setFieldJobStatusAction.bind(null, job.id, 'complete')}>
                <SaveButton className="btn primary" pendingLabel="Saving…" savedLabel="Done ✓">Mark complete</SaveButton>
              </form>
            ) : (
              <p className="field-complete-note">✓ This job is marked complete.</p>
            )}
          </div>
        </section>

        <section className="field-block">
          <h2 className="field-block-title">Post an update</h2>
          <form action={postFieldUpdateAction.bind(null, job.id)} className="field-update-form">
            <textarea name="body" rows={3} placeholder="On site, started demo. Running about an hour behind…" required />
            <label className="field-share">
              <input type="checkbox" name="share" />
              <span>Also share this with the customer</span>
            </label>
            <SaveButton className="btn secondary" pendingLabel="Posting…" savedLabel="Posted ✓">Post update</SaveButton>
          </form>
        </section>

        {(feed ?? []).length > 0 ? (
          <section className="field-block">
            <h2 className="field-block-title">Recent activity</h2>
            <div className="field-feed">
              {(feed ?? []).map((event) => (
                <div key={event.id} className="field-feed-item">
                  <div className="field-feed-top">
                    <strong>{event.title}</strong>
                    <span>{formatTime(event.created_at)}</span>
                  </div>
                  {event.body ? <p>{event.body}</p> : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </>
  );
}
