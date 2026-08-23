import Link from 'next/link';
import { redirect } from 'next/navigation';
import SaveButton from '@/components/save-button';
import { requireOfficeContext } from '@/lib/auth';
import { listJobs } from '@/lib/jobs';
import { loadSubcontractors, todayIn } from '@/lib/subcontractor-dispatch-data';
import {
  SELECTION_MODES,
  SELECTION_MODE_HINT,
  SELECTION_MODE_LABEL,
  generalLocationFrom,
} from '@/lib/subcontractor-dispatch';
import { SEED_TRADES } from '@/lib/subcontractor-form';
import { createRequestAction } from '../../subcontractor-actions';
import styles from '../../dispatch.module.css';

export const metadata = { title: 'New subcontractor request' };

// Step one of two: WHAT the job is.
//
// Recipients are chosen on the next screen, not this one, and that split is
// deliberate rather than a limitation. Matching needs a saved request to match
// against — the distance is measured to this job, the schedule conflicts are for
// this date, the licence gate is this job's requirement — and a recipient list
// computed against a form that is still being typed into is a list that is wrong
// for as long as somebody is thinking. It also means the draft survives: an
// owner interrupted between the two steps comes back to a request, not a blank
// form.

export const dynamic = 'force-dynamic';

/** The default deadline: end of the working day, or tomorrow evening if it has passed. */
function defaultExpiry(now: Date): string {
  const target = new Date(now);
  target.setHours(18, 0, 0, 0);
  if (target.getTime() - now.getTime() < 60 * 60 * 1000) {
    // Under an hour left today is not an offer window, it is a stampede.
    target.setDate(target.getDate() + 1);
  }
  // datetime-local wants the owner's own clock with no zone on it.
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}T${pad(target.getHours())}:${pad(target.getMinutes())}`;
}

export default async function NewSubcontractorRequestPage({
  searchParams,
}: {
  searchParams: { job?: string };
}) {
  const { supabase, accountId } = await requireOfficeContext('crew.write');
  const [jobs, subs] = await Promise.all([
    listJobs(supabase, accountId),
    loadSubcontractors(supabase, accountId, { today: todayIn(null), includeArchived: true }),
  ]);

  const assignable = jobs.filter((job) => job.status !== 'complete' && job.status !== 'archived');
  const selected = searchParams.job ? assignable.find((job) => job.id === searchParams.job) ?? null : null;

  // Nothing to dispatch to. Said here rather than after the form is filled in.
  if (subs.length === 0) {
    redirect('/dashboard/crew?tab=requests');
  }

  const tradeOptions = [...new Set([...subs.flatMap((sub) => sub.profile.trades), ...SEED_TRADES])].sort((a, b) =>
    a.localeCompare(b),
  );

  return (
    <main className="wide-shell workspace-shell">
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">New job request</p>
          <h1>Ask subcontractors to cover a job</h1>
          <p className="workspace-lead">
            Describe the work and what it pays. On the next screen you pick who gets the offer and read the exact text
            before anything is sent.
          </p>
        </div>

        {assignable.length === 0 ? (
          <div className={styles.emptyState}>
            <h2>No open jobs</h2>
            <p>A request covers a job. Create or reopen one first.</p>
            <Link href="/dashboard/jobs" className="btn primary">
              Go to jobs
            </Link>
          </div>
        ) : (
          <>
            {/* A GET form, so choosing a job re-renders this page with its
                details prefilled. No client component and no effect syncing a
                selection into state — the URL is the selection. */}
            <form method="get" className="form-grid" aria-label="Choose the job">
              <div className="field full">
                <label htmlFor="job">Job number</label>
                <select id="job" name="job" defaultValue={selected?.id ?? ''}>
                  <option value="">Choose a job…</option>
                  {assignable.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.ref} · {job.client_name}
                      {job.scheduled_for ? ` · ${job.scheduled_for}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field full">
                <button type="submit" className="btn secondary">
                  Use this job
                </button>
              </div>
            </form>

            {selected ? (
              <form action={createRequestAction} className="form-grid">
                <input type="hidden" name="jobId" value={selected.id} />

                <fieldset className={`field full ${styles.formSection}`}>
                  <legend>The work</legend>
                  <div className="form-grid">
                    <div className="field full">
                      <label htmlFor="workDescription">Work description</label>
                      <input
                        id="workDescription"
                        name="workDescription"
                        required
                        maxLength={140}
                        defaultValue={selected.scope?.split('\n')[0]?.slice(0, 140) ?? ''}
                        placeholder="Gas water heater replacement"
                        aria-describedby="workDescription-hint"
                      />
                      <small id="workDescription-hint" className="field-hint">
                        This is the line a subcontractor reads in a text and decides on. Keep the customer&rsquo;s name
                        and address out of it — the public page never shows either until somebody accepts.
                      </small>
                    </div>

                    <div className="field">
                      <label htmlFor="serviceDate">Date</label>
                      <input id="serviceDate" name="serviceDate" type="date" defaultValue={selected.scheduled_for ?? ''} />
                    </div>
                    <div className="field">
                      <label htmlFor="windowStart">Arrival window starts</label>
                      <input id="windowStart" name="windowStart" type="time" defaultValue={selected.scheduled_time ?? ''} />
                    </div>
                    <div className="field">
                      <label htmlFor="windowEnd">Arrival window ends</label>
                      <input id="windowEnd" name="windowEnd" type="time" />
                    </div>

                    <div className="field full">
                      <label htmlFor="generalLocation">General location</label>
                      <input
                        id="generalLocation"
                        name="generalLocation"
                        required
                        defaultValue={generalLocationFrom(selected.address)}
                        placeholder="Royal Oak, MI"
                        aria-describedby="generalLocation-hint"
                      />
                      <small id="generalLocation-hint" className="field-hint">
                        City and state only. The full address is revealed to whoever accepts, and to nobody else.
                      </small>
                    </div>
                  </div>
                </fieldset>

                <fieldset className={`field full ${styles.formSection}`}>
                  <legend>What it pays</legend>
                  <div className="form-grid">
                    <div className="field">
                      <label htmlFor="payAmount">Subcontractor pay</label>
                      <input
                        id="payAmount"
                        name="payAmount"
                        type="number"
                        min="1"
                        step="1"
                        inputMode="decimal"
                        required
                        placeholder="650"
                        aria-describedby="payAmount-hint"
                      />
                      <small id="payAmount-hint" className="field-hint">
                        A fixed price for the whole job. Hourly and day-rate offers come later.
                      </small>
                    </div>
                    <div className="field">
                      <label htmlFor="expiresAt">Offer expires</label>
                      <input
                        id="expiresAt"
                        name="expiresAt"
                        type="datetime-local"
                        required
                        defaultValue={defaultExpiry(new Date())}
                      />
                    </div>
                  </div>
                </fieldset>

                <fieldset className={`field full ${styles.formSection}`}>
                  <legend>Who can take it</legend>
                  <div className="form-grid">
                    <div className="field">
                      <label htmlFor="requiredTrade">Required trade</label>
                      <select id="requiredTrade" name="requiredTrade" required defaultValue="">
                        <option value="">Choose a trade…</option>
                        {tradeOptions.map((trade) => (
                          <option key={trade} value={trade}>
                            {trade}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="requiredSkills">Required skills</label>
                      <input id="requiredSkills" name="requiredSkills" placeholder="Tankless, permit pulling" />
                      <small className="field-hint">Comma separated. Used to rank, never to exclude.</small>
                    </div>
                    <div className="field full">
                      <label className="checkbox-row" htmlFor="requiresLicense">
                        <input id="requiresLicense" name="requiresLicense" type="checkbox" />
                        <span>Must hold a current license</span>
                      </label>
                      <label className="checkbox-row" htmlFor="requiresInsurance">
                        <input id="requiresInsurance" name="requiresInsurance" type="checkbox" defaultChecked />
                        <span>Must hold current liability insurance</span>
                      </label>
                      <small className="field-hint">
                        A firm whose paperwork has lapsed still appears in the list, with the reason — but cannot be sent
                        this offer.
                      </small>
                    </div>
                  </div>
                </fieldset>

                <fieldset className={`field full ${styles.formSection}`}>
                  <legend>Photos and documents</legend>
                  <div className="form-grid">
                    <div className="field full">
                      {(selected.photo_paths ?? []).length === 0 ? (
                        <p className={styles.formNote}>
                          This job has no photos yet. Add them on the job page and they can ride along with the next
                          request.
                        </p>
                      ) : (
                        <>
                          <p className={styles.formNote}>
                            Tick the job photos a subcontractor should see before they decide.
                          </p>
                          <div className={styles.checkGrid}>
                            {(selected.photo_paths ?? []).map((path, index) => (
                              <label key={path} className={styles.checkChip} htmlFor={`doc-${index}`}>
                                <input id={`doc-${index}`} type="checkbox" name="documentPaths" value={path} defaultChecked />
                                <span>Photo {index + 1}</span>
                              </label>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </fieldset>

                <fieldset className={`field full ${styles.formSection}`}>
                  <legend>Selection mode</legend>
                  <div className="form-grid">
                    <div className="field full">
                      {SELECTION_MODES.map((mode) => (
                        <label key={mode} className="checkbox-row" htmlFor={`mode-${mode}`}>
                          <input
                            id={`mode-${mode}`}
                            type="radio"
                            name="selectionMode"
                            value={mode}
                            defaultChecked={mode === 'first_accept'}
                          />
                          <span>
                            <strong>{SELECTION_MODE_LABEL[mode]}</strong>
                            <br />
                            <small className="field-hint">{SELECTION_MODE_HINT[mode]}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </fieldset>

                <div className="field full inline-action-form">
                  <SaveButton pendingLabel="Saving…" savedLabel="Saved ✓">
                    Choose who gets the offer →
                  </SaveButton>
                  <Link href="/dashboard/crew?tab=requests" className="btn ghost">
                    Cancel
                  </Link>
                </div>
                <p className={styles.formNote}>Nothing is sent yet. The next screen is where you press send.</p>
              </form>
            ) : (
              <p className="empty-state">Pick the job this work belongs to to carry on.</p>
            )}
          </>
        )}
      </section>
    </main>
  );
}
