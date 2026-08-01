'use client';

import { useState } from 'react';
import SaveButton from '@/components/save-button';
import { expandRecurrence, type Recurrence } from '@/lib/cash-forecast';
import type { ScheduledPayment } from '@/lib/cash-forecast-data';
import {
  deleteScheduledPaymentAction,
  saveScheduledPaymentAction,
  setScheduledPaymentActiveAction,
} from './actions';

// The bills the rest of the system has no way to know about.
//
// Every cost we already store hangs off a job and gets written down after it was
// spent. Insurance, the truck payment, rent and quarterly tax do neither — and
// they are most of what actually empties a contractor's account.

const CATEGORY_OPTIONS: { id: string; label: string }[] = [
  { id: 'bill', label: 'Bill / overhead' },
  { id: 'materials', label: 'Materials' },
  { id: 'payroll', label: 'Payroll' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'loan', label: 'Loan / finance' },
  { id: 'tax', label: 'Tax' },
  { id: 'other', label: 'Other' },
];

const RECURRENCE_OPTIONS: { id: Recurrence; label: string }[] = [
  { id: 'once', label: 'One time' },
  { id: 'weekly', label: 'Every week' },
  { id: 'biweekly', label: 'Every 2 weeks' },
  { id: 'monthly', label: 'Every month' },
];

const RECURRENCE_WORD: Record<Recurrence, string> = {
  once: 'One time',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
};

// The bills nearly every contractor has, so the first one takes a tap instead of
// a blank form. They fill the name and cadence only — never an amount, because a
// made-up premium in a cash forecast is worse than an empty one.
const PRESETS: { label: string; category: string; recurrence: Recurrence }[] = [
  { label: 'General liability insurance', category: 'bill', recurrence: 'monthly' },
  { label: 'Truck payment', category: 'loan', recurrence: 'monthly' },
  { label: 'Fuel', category: 'other', recurrence: 'weekly' },
  { label: 'Shop rent', category: 'bill', recurrence: 'monthly' },
  { label: 'Phone & software', category: 'bill', recurrence: 'monthly' },
  { label: 'Supply house account', category: 'materials', recurrence: 'monthly' },
  { label: 'Estimated tax', category: 'tax', recurrence: 'monthly' },
];

function money(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dayLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** The next date this row lands on from today, or null once it's finished. */
function nextOccurrence(row: ScheduledPayment, todayKey: string): string | null {
  const dates = expandRecurrence(row.dueDate, row.recurrence, { fromKey: todayKey, toKey: addYear(todayKey) }, row.endsOn);
  const upcoming = dates.find((date) => date >= todayKey);
  if (upcoming) return upcoming;
  // A one-off that's already due still needs paying, so it isn't "finished".
  return row.recurrence === 'once' && row.dueDate < todayKey ? row.dueDate : null;
}

function addYear(dateKey: string): string {
  const [year, rest] = [Number(dateKey.slice(0, 4)), dateKey.slice(4)];
  return `${year + 1}${rest}`;
}

type Props = { rows: ScheduledPayment[]; todayKey: string; available: boolean };

export default function ScheduledPaymentsPanel({ rows, todayKey, available }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<{ label: string; category: string; recurrence: Recurrence }>({
    label: '',
    category: 'bill',
    recurrence: 'monthly',
  });

  const active = rows.filter((row) => row.active);
  const paused = rows.filter((row) => !row.active);
  const monthlyOut = active
    .filter((row) => row.direction === 'out')
    .reduce((sum, row) => sum + monthlyValue(row), 0);

  if (!available) {
    return (
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Bills &amp; scheduled payments</p>
          <h2>Not set up yet</h2>
        </div>
        <p className="empty-state">
          The scheduled-payments table hasn&rsquo;t been created on this database yet. Everything else on this page works;
          adding bills needs that migration applied first.
        </p>
      </section>
    );
  }

  return (
    <section className="panel workspace-section-card cash-bills-card">
      <div className="section-heading workspace-section-heading cash-bills-heading">
        <div>
          <p className="eyebrow">Bills &amp; scheduled payments</p>
          <h2>What leaves the account on its own</h2>
        </div>
        {active.length > 0 ? <span className="cash-bills-total">about {money(monthlyOut)} a month</span> : null}
      </div>

      <p className="cash-bills-lead">
        Insurance, the truck payment, rent, a supply-house account, quarterly tax. None of these belong to a job, so nothing
        else in here knows about them — and they&rsquo;re most of what actually empties the account.
      </p>

      {rows.length === 0 && !adding ? (
        <div className="cash-preset-start">
          <p>Start with the ones nearly everybody has:</p>
          <div className="cash-preset-row">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="cash-preset"
                onClick={() => {
                  setDraft(preset);
                  setAdding(true);
                  setEditing(null);
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {active.length > 0 ? (
        <ul className="cash-bill-list">
          {active.map((row) => {
            const next = nextOccurrence(row, todayKey);
            const overdue = next !== null && next < todayKey;
            return (
              <li key={row.id} className="cash-bill">
                {editing === row.id ? (
                  <ScheduledPaymentForm
                    row={row}
                    todayKey={todayKey}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <>
                    <div className="cash-bill-main">
                      <strong>{row.label}</strong>
                      <small>
                        {RECURRENCE_WORD[row.recurrence]} · {row.direction === 'in' ? 'money in' : categoryLabel(row.category)}
                        {next ? ` · next ${dayLabel(next)}` : ' · finished'}
                        {row.endsOn ? ` · ends ${dayLabel(row.endsOn)}` : ''}
                      </small>
                      {row.note ? <small className="cash-bill-note">{row.note}</small> : null}
                    </div>
                    <div className="cash-bill-side">
                      <span className={`cash-bill-amount ${row.direction === 'in' ? 'is-in' : 'is-out'}`}>
                        {row.direction === 'in' ? '+' : '−'}
                        {money(row.amount)}
                      </span>
                      <span className={`cash-chip ${row.confirmed ? 'is-confirmed' : 'is-estimated'}`}>
                        {row.confirmed ? 'Confirmed' : 'Estimated'}
                      </span>
                      {overdue ? <span className="cash-chip is-overdue">Past due</span> : null}
                    </div>
                    <div className="cash-bill-actions">
                      <button type="button" className="linklike" onClick={() => { setEditing(row.id); setAdding(false); }}>
                        Edit
                      </button>
                      <form action={setScheduledPaymentActiveAction.bind(null, row.id, false)}>
                        <button type="submit" className="linklike">Pause</button>
                      </form>
                      <form action={deleteScheduledPaymentAction.bind(null, row.id)}>
                        <button type="submit" className="linklike danger">Delete</button>
                      </form>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      {adding ? (
        <div className="cash-bill-add">
          <ScheduledPaymentForm draft={draft} todayKey={todayKey} onCancel={() => setAdding(false)} />
        </div>
      ) : (
        <button
          type="button"
          className="btn secondary"
          onClick={() => {
            setDraft({ label: '', category: 'bill', recurrence: 'monthly' });
            setAdding(true);
            setEditing(null);
          }}
        >
          Add a bill or scheduled payment
        </button>
      )}

      {paused.length > 0 ? (
        <details className="cash-paused">
          <summary>{paused.length} paused</summary>
          <ul className="cash-bill-list is-paused">
            {paused.map((row) => (
              <li key={row.id} className="cash-bill">
                <div className="cash-bill-main">
                  <strong>{row.label}</strong>
                  <small>
                    {RECURRENCE_WORD[row.recurrence]} · {money(row.amount)} · paused, so it&rsquo;s off the forecast
                  </small>
                </div>
                <div className="cash-bill-actions">
                  <form action={setScheduledPaymentActiveAction.bind(null, row.id, true)}>
                    <button type="submit" className="linklike">Resume</button>
                  </form>
                  <form action={deleteScheduledPaymentAction.bind(null, row.id)}>
                    <button type="submit" className="linklike danger">Delete</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function categoryLabel(category: string): string {
  return CATEGORY_OPTIONS.find((option) => option.id === category)?.label ?? 'Bill';
}

/** A month's worth of a repeating row, so a weekly and a monthly bill can be added up. */
function monthlyValue(row: ScheduledPayment): number {
  if (row.recurrence === 'weekly') return row.amount * (52 / 12);
  if (row.recurrence === 'biweekly') return row.amount * (26 / 12);
  if (row.recurrence === 'monthly') return row.amount;
  return 0;
}

function ScheduledPaymentForm({
  row,
  draft,
  todayKey,
  onCancel,
}: {
  row?: ScheduledPayment;
  draft?: { label: string; category: string; recurrence: Recurrence };
  todayKey: string;
  onCancel: () => void;
}) {
  const [recurrence, setRecurrence] = useState<Recurrence>(row?.recurrence ?? draft?.recurrence ?? 'monthly');

  return (
    <form action={saveScheduledPaymentAction} className="cash-bill-form">
      {row ? <input type="hidden" name="id" value={row.id} /> : null}
      <div className="cash-bill-form-grid">
        <label className="cash-bill-field wide">
          <span>What is it</span>
          <input name="label" defaultValue={row?.label ?? draft?.label ?? ''} placeholder="General liability insurance" required />
        </label>
        <label className="cash-bill-field">
          <span>Amount</span>
          <input name="amount" type="number" min="0.01" step="0.01" defaultValue={row?.amount ?? ''} placeholder="450.00" required />
        </label>
        <label className="cash-bill-field">
          <span>Type</span>
          <select name="category" defaultValue={row?.category ?? draft?.category ?? 'bill'}>
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="cash-bill-field">
          <span>{recurrence === 'once' ? 'Due' : 'First one due'}</span>
          <input name="dueDate" type="date" defaultValue={row?.dueDate ?? todayKey} required />
        </label>
        <label className="cash-bill-field">
          <span>How often</span>
          <select name="recurrence" value={recurrence} onChange={(event) => setRecurrence(event.target.value as Recurrence)}>
            {RECURRENCE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        {recurrence !== 'once' ? (
          <label className="cash-bill-field">
            <span>Stops after (optional)</span>
            <input name="endsOn" type="date" defaultValue={row?.endsOn ?? ''} />
          </label>
        ) : null}
        <label className="cash-bill-field wide">
          <span>Note (optional)</span>
          <input name="note" defaultValue={row?.note ?? ''} placeholder="Account #, who to call, anything you'd forget" />
        </label>
      </div>

      <label className="cash-bill-check">
        <input type="checkbox" name="confirmed" defaultChecked={row?.confirmed ?? false} />
        <span>
          <strong>This amount is certain</strong>
          <small>Tick when it&rsquo;s a fixed figure on a fixed date. Left off, it&rsquo;s treated as an estimate and drops out of the confirmed-only line.</small>
        </span>
      </label>

      <label className="cash-bill-check">
        <input type="checkbox" name="direction" value="in" defaultChecked={row?.direction === 'in'} />
        <span>
          <strong>This is money coming IN</strong>
          <small>A financing draw, an equipment sale, money you&rsquo;re putting in yourself — anything the system can&rsquo;t see as a customer payment.</small>
        </span>
      </label>

      <div className="cash-bill-form-actions">
        <SaveButton className="btn primary" pendingLabel="Saving…">{row ? 'Save changes' : 'Add it'}</SaveButton>
        <button type="button" className="linklike" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
