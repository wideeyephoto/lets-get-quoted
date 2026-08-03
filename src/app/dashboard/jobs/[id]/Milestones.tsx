'use client';

import { useState, useTransition } from 'react';
import {
  milestoneProgressPct, milestoneTotals, milestoneCoverage,
  MILESTONE_STATUS_LABEL, type MilestoneEntryView,
} from './milestone-view';

// Proof-to-Pay, owner side.
//
// The organising idea: a payment request is not a form you fill in, it's a
// thing that becomes possible. So each milestone shows what's still missing —
// specifically, by name — and the Request payment button simply appears when
// nothing is. Nobody has to learn a workflow; they just watch the list close.

type ActionResult = { ok: true } | { ok: false; message: string };

function money(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function Milestones({
  entries,
  quotedAmount,
  clientPhone,
  actions,
}: {
  entries: MilestoneEntryView[];
  quotedAmount: number;
  clientPhone: string | null;
  actions: {
    seed: () => Promise<ActionResult>;
    create: (formData: FormData) => Promise<ActionResult>;
    update: (milestoneId: string, formData: FormData) => Promise<ActionResult>;
    remove: (milestoneId: string) => Promise<ActionResult>;
    addTask: (milestoneId: string, formData: FormData) => Promise<ActionResult>;
    attachPhoto: (milestoneId: string, formData: FormData) => Promise<ActionResult>;
    removePhoto: (photoId: string) => Promise<ActionResult>;
    requestPayment: (milestoneId: string, formData: FormData) => Promise<ActionResult>;
  };
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  function run(work: () => Promise<ActionResult>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (result.ok) onDone?.();
      else setError(result.message);
    });
  }

  const totals = milestoneTotals(entries);
  const coverage = milestoneCoverage(totals.planned, quotedAmount);

  if (entries.length === 0) {
    return (
      <div className="milestone-empty">
        <p className="workspace-details-copy" style={{ marginTop: 0 }}>
          Break this job into stages the customer pays for as they&rsquo;re finished. Each stage carries what you
          promised, the checklist that proves it, and before/after photos &mdash; and you can&rsquo;t ask to be paid
          until that proof is there. It&rsquo;s the difference between &ldquo;pay me&rdquo; and &ldquo;here&rsquo;s
          what you&rsquo;re paying for&rdquo;.
        </p>
        {error ? <p className="quote-draft-error">{error}</p> : null}
        <div className="milestone-empty-actions">
          <button type="button" className="btn primary" disabled={pending} onClick={() => run(actions.seed)}>
            {quotedAmount > 0 ? `Split ${money(quotedAmount)} into 4 stages` : 'Add standard stages'}
          </button>
          <button type="button" className="btn secondary" onClick={() => setAdding(true)}>Add one stage</button>
        </div>
        {adding ? (
          <MilestoneForm
            pending={pending}
            onCancel={() => setAdding(false)}
            onSubmit={(formData) => run(() => actions.create(formData), () => setAdding(false))}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="milestone-list">
      <div className="milestone-totals">
        <span><strong>{money(totals.paid)}</strong> paid</span>
        <span><strong>{money(totals.awaiting)}</strong> requested</span>
        {/* The number this whole feature exists to surface: finished, proven,
            and nobody has asked to be paid for it. */}
        <span className={totals.readyToBill > 0 ? 'is-ready' : ''}>
          <strong>{money(totals.readyToBill)}</strong> ready to bill
        </span>
        <span className="milestone-totals-planned">{money(totals.planned)} across {entries.length} stage{entries.length === 1 ? '' : 's'}</span>
      </div>

      {coverage.note ? <p className="milestone-coverage">{coverage.note}</p> : null}
      {error ? <p className="quote-draft-error">{error}</p> : null}

      {entries.map((entry) => (
        <MilestoneCard
          key={entry.id}
          entry={entry}
          pending={pending}
          open={openId === entry.id}
          clientPhone={clientPhone}
          onToggle={() => setOpenId(openId === entry.id ? null : entry.id)}
          run={run}
          actions={actions}
        />
      ))}

      {adding ? (
        <MilestoneForm
          pending={pending}
          onCancel={() => setAdding(false)}
          onSubmit={(formData) => {
            formData.set('sortOrder', String(entries.length));
            run(() => actions.create(formData), () => setAdding(false));
          }}
        />
      ) : (
        <button type="button" className="btn secondary" onClick={() => setAdding(true)}>+ Add a stage</button>
      )}
    </div>
  );
}

function MilestoneCard({
  entry,
  pending,
  open,
  clientPhone,
  onToggle,
  run,
  actions,
}: {
  entry: MilestoneEntryView;
  pending: boolean;
  open: boolean;
  clientPhone: string | null;
  onToggle: () => void;
  run: (work: () => Promise<ActionResult>, onDone?: () => void) => void;
  actions: Parameters<typeof Milestones>[0]['actions'];
}) {
  const [editing, setEditing] = useState(false);
  const progress = milestoneProgressPct(entry, entry);
  const settled = entry.status === 'paid';

  return (
    <div className={`milestone-card status-${entry.status}`}>
      <button type="button" className="milestone-head" onClick={onToggle} aria-expanded={open}>
        <span className="milestone-head-main">
          <span className="milestone-title">{entry.title}</span>
          {entry.scope ? <span className="milestone-scope">{entry.scope}</span> : null}
        </span>
        <span className="milestone-head-side">
          <span className="milestone-amount">{money(entry.amount)}</span>
          <span className={`milestone-status status-${entry.status}`}>{MILESTONE_STATUS_LABEL[entry.status]}</span>
        </span>
      </button>

      {!settled ? (
        <div className="milestone-progress" role="presentation">
          <span style={{ width: `${progress}%` }} />
        </div>
      ) : null}

      {open ? (
        <div className="milestone-body">
          {editing ? (
            <MilestoneForm
              initial={entry}
              pending={pending}
              locked={Boolean(entry.paymentId)}
              onCancel={() => setEditing(false)}
              onSubmit={(formData) => run(() => actions.update(entry.id, formData), () => setEditing(false))}
            />
          ) : (
            <>
              <ProofChecklist entry={entry} pending={pending} run={run} actions={actions} />
              <ProofPhotos entry={entry} pending={pending} run={run} actions={actions} />

              {entry.canRequest ? (
                <form
                  className="milestone-request"
                  action={(formData) => run(() => actions.requestPayment(entry.id, formData))}
                >
                  {clientPhone ? (
                    <>
                      <input type="hidden" name="homeownerPhone" value={clientPhone} />
                      <label className="checkbox-row">
                        <input type="checkbox" name="sendSms" defaultChecked />
                        <span>Text {clientPhone} a link to pay</span>
                      </label>
                    </>
                  ) : null}
                  <button type="submit" className="btn primary" disabled={pending}>
                    Request {money(entry.amount)}
                  </button>
                </form>
              ) : entry.blockers.length > 0 ? (
                <div className="milestone-blockers">
                  <p>Before you can bill this stage:</p>
                  <ul>{entry.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
                </div>
              ) : entry.status === 'awaiting_payment' ? (
                <p className="milestone-note">Requested. The customer has a pay button on their job page.</p>
              ) : entry.status === 'paid' ? (
                <p className="milestone-note is-paid">Paid in full. Nothing left to do on this stage.</p>
              ) : null}

              <div className="milestone-card-actions">
                <button type="button" className="arrival-link-btn" onClick={() => setEditing(true)}>Edit stage</button>
                {!entry.paymentId ? (
                  <button
                    type="button"
                    className="arrival-link-btn"
                    disabled={pending}
                    onClick={() => run(() => actions.remove(entry.id))}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ProofChecklist({
  entry, pending, run, actions,
}: {
  entry: MilestoneEntryView;
  pending: boolean;
  run: (work: () => Promise<ActionResult>, onDone?: () => void) => void;
  actions: Parameters<typeof Milestones>[0]['actions'];
}) {
  return (
    <div className="milestone-proof">
      <p className="milestone-proof-title">
        Checklist {entry.tasks.length > 0 ? `· ${entry.tasks.filter((task) => task.done).length}/${entry.tasks.length}` : ''}
      </p>
      {entry.tasks.length > 0 ? (
        <ul className="milestone-tasks">
          {entry.tasks.map((task) => (
            <li key={task.id} className={task.done ? 'is-done' : ''}>
              <span aria-hidden="true">{task.done ? '✓' : '○'}</span> {task.title}
            </li>
          ))}
        </ul>
      ) : (
        <p className="milestone-hint">
          No checklist yet. Items you add here are the same ones your crew ticks off in the field app.
        </p>
      )}
      <form
        className="milestone-add-task"
        action={(formData) => run(() => actions.addTask(entry.id, formData))}
      >
        <input name="title" placeholder="e.g. Pressure test passed" required maxLength={120} />
        <button type="submit" className="btn ghost" disabled={pending}>Add</button>
      </form>
    </div>
  );
}

function ProofPhotos({
  entry, pending, run, actions,
}: {
  entry: MilestoneEntryView;
  pending: boolean;
  run: (work: () => Promise<ActionResult>, onDone?: () => void) => void;
  actions: Parameters<typeof Milestones>[0]['actions'];
}) {
  return (
    <div className="milestone-proof">
      <p className="milestone-proof-title">Photos</p>
      {(['before', 'after'] as const).map((phase) => {
        const photos = entry.photos.filter((photo) => photo.phase === phase);
        const required = phase === 'before' ? entry.requireBeforePhotos : entry.requireAfterPhotos;
        return (
          <div className="milestone-phase" key={phase}>
            <p className="milestone-phase-title">
              {phase === 'before' ? 'Before' : 'After'}
              {required > 0 ? <span> · {photos.length}/{required} required</span> : null}
            </p>
            {photos.length > 0 ? (
              <div className="milestone-photo-grid">
                {photos.map((photo) => (
                  <figure key={photo.id}>
                    {photo.url
                      // eslint-disable-next-line @next/next/no-img-element -- a
                      // signed Supabase URL with a one-hour life; not a stable src.
                      ? <img src={photo.url} alt={photo.caption || `${phase} photo`} loading="lazy" />
                      : <span className="milestone-photo-missing">Photo unavailable</span>}
                    <figcaption>
                      {photo.caption ? <span>{photo.caption}</span> : null}
                      <button
                        type="button"
                        className="arrival-link-btn"
                        disabled={pending}
                        onClick={() => run(() => actions.removePhoto(photo.id))}
                      >
                        Remove
                      </button>
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : null}
            <form
              className="milestone-photo-form"
              action={(formData) => {
                formData.set('phase', phase);
                run(() => actions.attachPhoto(entry.id, formData));
              }}
            >
              <input type="file" name="photos" accept="image/*" multiple capture="environment" />
              <input type="text" name="caption" placeholder="Caption (optional)" maxLength={160} />
              <button type="submit" className="btn ghost" disabled={pending}>Attach</button>
            </form>
          </div>
        );
      })}
    </div>
  );
}

function MilestoneForm({
  initial,
  pending,
  locked,
  onCancel,
  onSubmit,
}: {
  initial?: MilestoneEntryView;
  pending: boolean;
  locked?: boolean;
  onCancel: () => void;
  onSubmit: (formData: FormData) => void;
}) {
  return (
    <form className="milestone-form form-grid compact-form" action={onSubmit}>
      <div className="field full">
        <label htmlFor={`m-title-${initial?.id ?? 'new'}`}>Stage name</label>
        <input id={`m-title-${initial?.id ?? 'new'}`} name="title" defaultValue={initial?.title ?? ''} placeholder="e.g. Rough-in complete" required maxLength={120} />
      </div>
      <div className="field full">
        <label htmlFor={`m-scope-${initial?.id ?? 'new'}`}>What you&rsquo;re promising</label>
        <textarea id={`m-scope-${initial?.id ?? 'new'}`} name="scope" rows={2} defaultValue={initial?.scope ?? ''} placeholder="All supply lines run and pressure tested." maxLength={1000} />
        <small className="field-hint">Your customer reads this next to the amount, so write it before the work rather than justifying it after.</small>
      </div>
      <div className="field">
        <label htmlFor={`m-amount-${initial?.id ?? 'new'}`}>Amount ($)</label>
        <input id={`m-amount-${initial?.id ?? 'new'}`} name="amount" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={initial?.amount || ''} disabled={locked} />
      </div>
      <div className="field">
        <label htmlFor={`m-kind-${initial?.id ?? 'new'}`}>Type</label>
        <select id={`m-kind-${initial?.id ?? 'new'}`} name="kind" defaultValue={initial?.kind ?? 'stage'} disabled={locked}>
          <option value="deposit">Deposit</option>
          <option value="stage">Stage payment</option>
          <option value="final">Final payment</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor={`m-before-${initial?.id ?? 'new'}`}>&ldquo;Before&rdquo; photos required</label>
        <input id={`m-before-${initial?.id ?? 'new'}`} name="requireBefore" type="number" min="0" max="10" step="1" defaultValue={initial?.requireBeforePhotos ?? 0} disabled={locked} />
      </div>
      <div className="field">
        <label htmlFor={`m-after-${initial?.id ?? 'new'}`}>&ldquo;After&rdquo; photos required</label>
        <input id={`m-after-${initial?.id ?? 'new'}`} name="requireAfter" type="number" min="0" max="10" step="1" defaultValue={initial?.requireAfterPhotos ?? 1} disabled={locked} />
      </div>
      {locked ? (
        <p className="field full field-hint">
          The amount and what&rsquo;s required are locked once a payment has been requested &mdash; they&rsquo;re
          the terms of a bill your customer is already looking at. The name and promise can still be corrected.
        </p>
      ) : null}
      <div className="form-actions full">
        <button type="submit" className="btn primary" disabled={pending}>{initial ? 'Save stage' : 'Add stage'}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
