import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildPayRows,
  formatKeyRange,
  payPeriodKey,
  periodEndKey,
  periodStartKey,
  type CrewPayRow,
  type PayEvent,
  type PayEventAction,
  type PayMethodInput,
  type PayRecord,
  type PayStatus,
} from './crew-pay';
import { resolvePayPeriod, summarizeCrewLabor, type PayPeriod, type PeriodMode } from './labor';
import { listLaborEntries } from './labor-data';
import { roundHours, type LaborSettings } from './labor-settings';
import { listOpenShifts } from './time-clock-data';

// Server side of crew pay. Reads the period's hours, joins whatever has been
// approved or paid, and writes the records + the audit line for every action.
//
// BEFORE THE MIGRATION RUNS. Every read here tolerates the three tables not
// existing yet: `available` comes back false and the page renders exactly the
// rollup it rendered before, with no payment controls. A feature that 500s the
// screen an owner opened to pay their crew is worse than a feature that waits.

/** Postgres: relation does not exist. The migration hasn't been applied. */
const MISSING_TABLE = '42P01';

const ENTRY_COLUMNS =
  'id, crew_id, crew_name, status, regular_hours, overtime_hours, approved_amount, approved_at, approved_by, sent_at, paid_amount, paid_at, paid_by, payment_date, payment_method, payment_reference, payment_note, locked';

function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === MISSING_TABLE;
}

export type PayPeriodRow = {
  id: string;
  periodKey: string;
  startsOn: string;
  endsOn: string;
  closedAt: string | null;
  closedBy: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;
};

function toPeriodRow(row: Record<string, unknown>): PayPeriodRow {
  return {
    id: row.id as string,
    periodKey: row.period_key as string,
    startsOn: row.starts_on as string,
    endsOn: row.ends_on as string,
    closedAt: (row.closed_at as string) ?? null,
    closedBy: (row.closed_by as string) ?? null,
    reopenedAt: (row.reopened_at as string) ?? null,
    reopenReason: (row.reopen_reason as string) ?? null,
  };
}

function toRecord(row: Record<string, unknown>): PayRecord {
  return {
    id: row.id as string,
    crewId: row.crew_id as string,
    crewName: (row.crew_name as string) || 'Crew member',
    status: row.status as PayStatus,
    regularHours: Number(row.regular_hours) || 0,
    overtimeHours: Number(row.overtime_hours) || 0,
    approvedAmount: Number(row.approved_amount) || 0,
    approvedAt: (row.approved_at as string) ?? null,
    approvedBy: (row.approved_by as string) ?? null,
    sentAt: (row.sent_at as string) ?? null,
    paidAmount: row.paid_amount === null || row.paid_amount === undefined ? null : Number(row.paid_amount),
    paidAt: (row.paid_at as string) ?? null,
    paidBy: (row.paid_by as string) ?? null,
    paymentDate: (row.payment_date as string) ?? null,
    paymentMethod: (row.payment_method as PayRecord['paymentMethod']) ?? null,
    paymentReference: (row.payment_reference as string) ?? null,
    paymentNote: (row.payment_note as string) ?? null,
    locked: Boolean(row.locked),
  };
}

// -- Reads -------------------------------------------------------------------

export type CrewPayContext = {
  /** False until the migration has been applied — the page hides pay controls. */
  available: boolean;
  periodRow: PayPeriodRow | null;
  rows: CrewPayRow[];
  records: PayRecord[];
  /** Other periods that cover some of the same days AND already have payments. */
  overlaps: { rangeLabel: string; paidCount: number }[];
};

/**
 * Everything the Hours & pay tab needs for one period, and the same thing the
 * write actions re-read before they act.
 *
 * Deliberately shared: an action that recomputed the amounts differently from
 * the screen would pay a number the owner never saw. The client sends WHO to
 * pay; what they're owed is always derived here.
 */
export async function loadCrewPayContext(
  supabase: SupabaseClient,
  accountId: string,
  options: { period: PayPeriod; settings: LaborSettings; crewId?: string | null; includeOpenShifts?: boolean },
): Promise<CrewPayContext> {
  const { period, settings } = options;

  const entries = await listLaborEntries(supabase, accountId, {
    startIso: period.startIso,
    endIso: period.endIso,
    crewId: options.crewId ?? null,
  });

  const summary = summarizeCrewLabor(entries, {
    overtimeThreshold: settings.overtimeThreshold,
    roundHours: settings.rounding === 'none' ? undefined : (value) => roundHours(value, settings.rounding),
  });

  const periodRow = await getPayPeriodRow(supabase, accountId, period);
  if (periodRow === undefined) {
    // Tables aren't there yet.
    return {
      available: false,
      periodRow: null,
      rows: buildPayRows(summary.rows, []),
      records: [],
      overlaps: [],
    };
  }

  const [records, overlaps, openShiftCrewIds] = await Promise.all([
    periodRow ? listPayRecords(supabase, accountId, periodRow.id) : Promise.resolve([]),
    listOverlappingPaidPeriods(supabase, accountId, period),
    options.includeOpenShifts ? listOpenShifts(supabase, accountId).then((shifts) => shifts.map((shift) => shift.crewId)) : Promise.resolve([]),
  ]);

  return {
    available: true,
    periodRow,
    rows: buildPayRows(summary.rows, records, { openShiftCrewIds }),
    records,
    overlaps,
  };
}

/** The stored period, null when it has none yet, undefined when the tables are missing. */
export async function getPayPeriodRow(
  supabase: SupabaseClient,
  accountId: string,
  period: PayPeriod,
): Promise<PayPeriodRow | null | undefined> {
  const { data, error } = await supabase
    .from('crew_pay_periods')
    .select('id, period_key, starts_on, ends_on, closed_at, closed_by, reopened_at, reopen_reason')
    .eq('account_id', accountId)
    .eq('period_key', payPeriodKey(period))
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) return undefined;
    console.error('Pay period read failed:', error.message);
    return null;
  }
  return data ? toPeriodRow(data) : null;
}

export async function listPayRecords(supabase: SupabaseClient, accountId: string, periodId: string): Promise<PayRecord[]> {
  const { data, error } = await supabase
    .from('crew_pay_entries')
    .select(ENTRY_COLUMNS)
    .eq('account_id', accountId)
    .eq('period_id', periodId);

  if (error) {
    if (!isMissingTable(error)) console.error('Pay record read failed:', error.message);
    return [];
  }
  return (data ?? []).map(toRecord);
}

/**
 * Other periods covering some of the same days that already carry payments.
 *
 * A month contains the weeks inside it. Without this, paying a week and then
 * opening the month and paying that would pay the same hours twice, and nothing
 * on the screen would say so.
 */
export async function listOverlappingPaidPeriods(
  supabase: SupabaseClient,
  accountId: string,
  period: PayPeriod,
): Promise<{ rangeLabel: string; paidCount: number }[]> {
  const startsOn = periodStartKey(period);
  const endsOn = periodEndKey(period);
  const key = payPeriodKey(period);

  const { data, error } = await supabase
    .from('crew_pay_periods')
    .select('id, period_key, starts_on, ends_on, crew_pay_entries(id, status)')
    .eq('account_id', accountId)
    .lte('starts_on', endsOn)
    .gte('ends_on', startsOn)
    .neq('period_key', key);

  if (error || !data) return [];

  const out: { rangeLabel: string; paidCount: number }[] = [];
  for (const row of data as unknown as Array<Record<string, unknown> & { crew_pay_entries?: { status: string }[] }>) {
    const paidCount = (row.crew_pay_entries ?? []).filter((entry) => entry.status === 'paid').length;
    if (paidCount === 0) continue;
    out.push({ rangeLabel: formatKeyRange(row.starts_on as string, row.ends_on as string), paidCount });
  }
  return out;
}

export async function listPayEvents(
  supabase: SupabaseClient,
  accountId: string,
  options: { periodId?: string | null; limit?: number },
): Promise<PayEvent[]> {
  let query = supabase
    .from('crew_pay_events')
    .select('id, action, summary, actor_email, reason, crew_id, crew_name, created_at')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 50);

  if (options.periodId) query = query.eq('period_id', options.periodId);

  const { data, error } = await query;
  if (error) {
    if (!isMissingTable(error)) console.error('Pay history read failed:', error.message);
    return [];
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    action: row.action as PayEventAction,
    summary: row.summary as string,
    actorEmail: (row.actor_email as string) ?? null,
    reason: (row.reason as string) ?? null,
    crewId: (row.crew_id as string) ?? null,
    crewName: (row.crew_name as string) ?? null,
    createdAt: row.created_at as string,
  }));
}

/**
 * How many payment records this crew member appears in.
 *
 * Deleting someone who has been paid would take their payment history with them,
 * so the roster refuses and says to archive instead.
 */
export async function countPayRecordsForCrew(supabase: SupabaseClient, accountId: string, crewId: string): Promise<number> {
  const { count, error } = await supabase
    .from('crew_pay_entries')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('crew_id', crewId);
  if (error) return 0; // pre-migration: nothing to protect yet
  return count ?? 0;
}

// -- Writes ------------------------------------------------------------------

export class PayUnavailableError extends Error {
  constructor() {
    super('Pay tracking isn’t set up on this database yet. Run the crew-pay migration and try again.');
    this.name = 'PayUnavailableError';
  }
}

/** Find or create the row for this period. Idempotent on (account, period_key). */
export async function ensurePayPeriodRow(supabase: SupabaseClient, accountId: string, period: PayPeriod): Promise<PayPeriodRow> {
  const existing = await getPayPeriodRow(supabase, accountId, period);
  if (existing === undefined) throw new PayUnavailableError();
  if (existing) return existing;

  const { data, error } = await supabase
    .from('crew_pay_periods')
    .insert({
      account_id: accountId,
      period_key: payPeriodKey(period),
      mode: period.mode,
      starts_on: periodStartKey(period),
      ends_on: periodEndKey(period),
    })
    .select('id, period_key, starts_on, ends_on, closed_at, closed_by, reopened_at, reopen_reason')
    .single();

  if (error) {
    // Two tabs approving at once both insert; the unique index settles it and
    // the loser just reads the winner's row.
    if (error.code === '23505') {
      const raced = await getPayPeriodRow(supabase, accountId, period);
      if (raced) return raced;
    }
    if (isMissingTable(error)) throw new PayUnavailableError();
    throw new Error('Could not open this pay period.');
  }
  return toPeriodRow(data as Record<string, unknown>);
}

export type PaySnapshot = {
  crewId: string;
  crewName: string;
  regularHours: number;
  overtimeHours: number;
  amount: number;
};

/** The rollup for one row, taken server-side so a client can't name its own amount. */
export function snapshotOf(row: CrewPayRow): PaySnapshot {
  return {
    crewId: row.crewId as string,
    crewName: row.name,
    regularHours: row.regularHours,
    overtimeHours: row.overtimeHours,
    amount: row.estimatedPay,
  };
}

async function upsertEntries(
  supabase: SupabaseClient,
  accountId: string,
  periodId: string,
  values: Record<string, unknown>[],
): Promise<PayRecord[]> {
  const { data, error } = await supabase
    .from('crew_pay_entries')
    .upsert(
      values.map((value) => ({ account_id: accountId, period_id: periodId, updated_at: new Date().toISOString(), ...value })),
      { onConflict: 'period_id,crew_id' },
    )
    .select(ENTRY_COLUMNS);

  if (error) {
    if (isMissingTable(error)) throw new PayUnavailableError();
    console.error('Pay record write failed:', error.message);
    throw new Error('Could not save that. Nothing was changed.');
  }
  return (data ?? []).map(toRecord);
}

export async function logPayEvent(
  supabase: SupabaseClient,
  accountId: string,
  event: {
    periodId: string | null;
    entryId?: string | null;
    crewId?: string | null;
    crewName?: string | null;
    action: PayEventAction;
    summary: string;
    actorEmail: string | null;
    reason?: string | null;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.from('crew_pay_events').insert({
    account_id: accountId,
    period_id: event.periodId,
    entry_id: event.entryId ?? null,
    crew_id: event.crewId ?? null,
    crew_name: event.crewName ?? null,
    action: event.action,
    summary: event.summary,
    actor_email: event.actorEmail,
    reason: event.reason ?? null,
    meta: event.meta ?? {},
  });
  // A missing history line must not undo a payment that was recorded. Logged
  // loudly instead — the write above already happened.
  if (error) console.error('Pay event write failed:', error.message);
}

/** Approve hours: freeze what they came to, so a later edit is visible as drift. */
export async function approveHours(
  supabase: SupabaseClient,
  accountId: string,
  periodId: string,
  snapshots: PaySnapshot[],
  actorEmail: string | null,
): Promise<PayRecord[]> {
  const approvedAt = new Date().toISOString();
  return upsertEntries(
    supabase,
    accountId,
    periodId,
    snapshots.map((snapshot) => ({
      crew_id: snapshot.crewId,
      crew_name: snapshot.crewName,
      status: 'approved' as PayStatus,
      regular_hours: snapshot.regularHours,
      overtime_hours: snapshot.overtimeHours,
      approved_amount: snapshot.amount,
      approved_at: approvedAt,
      approved_by: actorEmail,
    })),
  );
}

export type PaymentInput = PayMethodInput & {
  /** Approve as part of the same action, for the "approve and mark paid" path. */
  approveFirst?: boolean;
};

/** Record a payment against these people for this period. */
export async function markPaid(
  supabase: SupabaseClient,
  accountId: string,
  periodId: string,
  snapshots: PaySnapshot[],
  input: PaymentInput,
  actorEmail: string | null,
): Promise<PayRecord[]> {
  const now = new Date().toISOString();
  return upsertEntries(
    supabase,
    accountId,
    periodId,
    snapshots.map((snapshot) => ({
      crew_id: snapshot.crewId,
      crew_name: snapshot.crewName,
      status: 'paid' as PayStatus,
      regular_hours: snapshot.regularHours,
      overtime_hours: snapshot.overtimeHours,
      approved_amount: snapshot.amount,
      ...(input.approveFirst ? { approved_at: now, approved_by: actorEmail } : {}),
      paid_amount: snapshot.amount,
      paid_at: now,
      paid_by: actorEmail,
      payment_date: input.paymentDate,
      payment_method: input.paymentMethod,
      payment_reference: input.paymentReference,
      payment_note: input.paymentNote,
      // Paid entries lock, so a stray edit can't move money that has gone out.
      locked: true,
    })),
  );
}

export async function markSentToPayroll(
  supabase: SupabaseClient,
  accountId: string,
  periodId: string,
  snapshots: PaySnapshot[],
  actorEmail: string | null,
): Promise<PayRecord[]> {
  const now = new Date().toISOString();
  return upsertEntries(
    supabase,
    accountId,
    periodId,
    snapshots.map((snapshot) => ({
      crew_id: snapshot.crewId,
      crew_name: snapshot.crewName,
      status: 'sent' as PayStatus,
      regular_hours: snapshot.regularHours,
      overtime_hours: snapshot.overtimeHours,
      approved_amount: snapshot.amount,
      sent_at: now,
      sent_by: actorEmail,
    })),
  );
}

/**
 * Take a paid status back off.
 *
 * The payment fields are cleared and the entry drops to approved — but the
 * history line that recorded the payment stays, along with this one saying who
 * undid it and why. The record of what happened is never edited, only added to.
 */
export async function undoPaid(
  supabase: SupabaseClient,
  accountId: string,
  entryId: string,
): Promise<void> {
  const { error } = await supabase
    .from('crew_pay_entries')
    .update({
      status: 'approved' as PayStatus,
      paid_amount: null,
      paid_at: null,
      paid_by: null,
      payment_date: null,
      payment_method: null,
      payment_reference: null,
      payment_note: null,
      locked: false,
      updated_at: new Date().toISOString(),
    })
    .eq('account_id', accountId)
    .eq('id', entryId);
  if (error) throw new Error('Could not undo that payment status.');
}

export async function setEntryLocked(
  supabase: SupabaseClient,
  accountId: string,
  entryId: string,
  locked: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('crew_pay_entries')
    .update({ locked, updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', entryId);
  if (error) throw new Error('Could not change the lock on that entry.');
}

export async function closePayPeriod(
  supabase: SupabaseClient,
  accountId: string,
  periodId: string,
  actorEmail: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('crew_pay_periods')
    .update({ closed_at: new Date().toISOString(), closed_by: actorEmail, reopened_at: null, reopen_reason: null })
    .eq('account_id', accountId)
    .eq('id', periodId);
  if (error) throw new Error('Could not close this pay period.');
}

/** Why this period can't be reopened, or null when it can. */
export function reopenGuard(row: PayPeriodRow): string | null {
  return row.closedAt ? null : 'This period isn’t closed, so there is nothing to reopen.';
}

export async function reopenPayPeriod(
  supabase: SupabaseClient,
  accountId: string,
  periodId: string,
  reason: string,
): Promise<void> {
  const { error } = await supabase
    .from('crew_pay_periods')
    .update({ closed_at: null, closed_by: null, reopened_at: new Date().toISOString(), reopen_reason: reason })
    .eq('account_id', accountId)
    .eq('id', periodId);
  if (error) throw new Error('Could not reopen this pay period.');
}

// -- What is still owed from BEFORE this period ------------------------------
//
// The pay screen shows one period at a time, so being caught up is something an
// owner has to remember rather than see. This is the look-behind: the periods
// that already ended, still have somebody unpaid in them, and would otherwise
// only be found by clicking the back arrow until the numbers went quiet.

export type OutstandingPeriod = {
  key: string;
  offset: number;
  rangeLabel: string;
  endKey: string;
  crewWithHours: number;
  paidCount: number;
  hours: number;
  /** What the unpaid people in that period are owed, at the rates on their entries. */
  outstandingPay: number;
};

/**
 * Recent periods that still owe somebody money.
 *
 * Walks back `lookback` periods and compares who logged hours against who has a
 * paid record. Deliberately NOT a stored flag: a period is outstanding because
 * of the state of its rows, and a flag would go stale the moment somebody was
 * paid late or an entry was added after the fact.
 *
 * Two queries regardless of the lookback — one for the labor, one for the pay
 * records — because six round trips to draw one strip is not worth it.
 */
export async function listOutstandingPeriods(
  supabase: SupabaseClient,
  accountId: string,
  mode: PeriodMode,
  options?: { lookback?: number; now?: Date; timeZone?: string },
): Promise<OutstandingPeriod[]> {
  const lookback = Math.max(1, Math.min(12, options?.lookback ?? 6));
  const now = options?.now ?? new Date();

  // Same zone the screen used, or the look-behind would disagree with the
  // period the owner is standing in about where the boundaries are.
  const periods = Array.from({ length: lookback }, (_, index) =>
    resolvePayPeriod(mode, -(index + 1), { now, timeZone: options?.timeZone }),
  );
  if (periods.length === 0) return [];
  const oldest = periods[periods.length - 1];

  const { data: laborRows, error: laborError } = await supabase
    .from('costs')
    .select('crew_id, hours, amount, created_at')
    .eq('account_id', accountId)
    .eq('category', 'Labor')
    .gte('created_at', oldest.startIso)
    .lt('created_at', periods[0].endIso);
  // No labor means nothing can be outstanding; a read failure means we must not
  // claim it is either.
  if (laborError || !laborRows || laborRows.length === 0) return [];

  const keys = periods.map((period) => payPeriodKey(period));
  const { data: paidRows } = await supabase
    .from('crew_pay_entries')
    .select('crew_id, status, period:crew_pay_periods!inner(period_key)')
    .eq('account_id', accountId)
    .in('status', ['paid'])
    .in('period.period_key', keys);

  const paidByKey = new Map<string, Set<string>>();
  // PostgREST types an embedded to-one relation as an array, so the shape has to
  // be widened before it can be read either way round.
  for (const row of (paidRows ?? []) as unknown as Array<{
    crew_id: string;
    period: { period_key: string } | { period_key: string }[] | null;
  }>) {
    const period = Array.isArray(row.period) ? row.period[0] : row.period;
    const key = period?.period_key;
    if (!key) continue;
    const bucket = paidByKey.get(key) ?? new Set<string>();
    bucket.add(row.crew_id);
    paidByKey.set(key, bucket);
  }

  const out: OutstandingPeriod[] = [];
  for (const [index, period] of periods.entries()) {
    const key = keys[index];
    const inPeriod = (laborRows as Array<{ crew_id: string | null; hours: unknown; amount: unknown; created_at: string }>).filter(
      (row) => row.created_at >= period.startIso && row.created_at < period.endIso,
    );
    // Unattached labor can't carry a payment record, so it can't be owed to
    // anybody — the same rule the pay rows themselves use.
    const withCrew = inPeriod.filter((row) => row.crew_id);
    if (withCrew.length === 0) continue;

    const paid = paidByKey.get(key) ?? new Set<string>();
    const crewIds = new Set(withCrew.map((row) => row.crew_id as string));
    const unpaidIds = [...crewIds].filter((id) => !paid.has(id));
    if (unpaidIds.length === 0) continue;

    out.push({
      key,
      offset: period.offset,
      rangeLabel: period.rangeLabel,
      endKey: periodEndKey(period),
      crewWithHours: crewIds.size,
      paidCount: paid.size,
      hours: Math.round(withCrew.reduce((sum, row) => sum + (Number(row.hours) || 0), 0) * 100) / 100,
      outstandingPay:
        Math.round(
          withCrew
            .filter((row) => unpaidIds.includes(row.crew_id as string))
            .reduce((sum, row) => sum + (Number(row.amount) || 0), 0) * 100,
        ) / 100,
    });
  }

  // Oldest first: the one that has been waiting longest is the one to answer.
  return out.sort((a, b) => a.offset - b.offset);
}

// -- Guarding the hours behind a payment -------------------------------------

/**
 * Why this labor entry can't be deleted, or null when it can.
 *
 * `locked` lives on crew_pay_entries, one row per person per period — it never
 * reached the cost rows underneath. So the Tuesday shift that made up a payment
 * recorded on Friday could still be deleted: the paid snapshot survived, which
 * is right, but the evidence for it did not, and the difference then showed as
 * an unexplained adjustment.
 *
 * Checked against APPROVED as well as paid. An approved amount is a number
 * somebody agreed to; quietly removing an hour from underneath it is the same
 * problem one step earlier.
 */
export async function laborEntryLockReason(
  supabase: SupabaseClient,
  accountId: string,
  entryId: string,
): Promise<string | null> {
  const { data: entry, error } = await supabase
    .from('costs')
    .select('id, crew_id, crew_name, created_at')
    .eq('account_id', accountId)
    .eq('id', entryId)
    .eq('type', 'labor')
    .maybeSingle();
  // Not finding it is not a reason to block — the delete will no-op anyway.
  if (error || !entry) return null;
  const crewId = (entry as { crew_id: string | null }).crew_id;
  // Labor with nobody attached can't be part of anyone's pay record.
  if (!crewId) return null;

  const { data: records, error: recordError } = await supabase
    .from('crew_pay_entries')
    .select('status, period:crew_pay_periods!inner(starts_on, ends_on)')
    .eq('account_id', accountId)
    .eq('crew_id', crewId)
    .in('status', ['approved', 'sent', 'paid']);
  // Pre-migration, or a read failure. Blocking every delete because we could not
  // check would be worse than the risk it guards against.
  if (recordError || !records || records.length === 0) return null;

  const loggedKey = String((entry as { created_at: string }).created_at).slice(0, 10);
  for (const row of records as unknown as Array<{
    status: string;
    period: { starts_on: string; ends_on: string } | { starts_on: string; ends_on: string }[] | null;
  }>) {
    const period = Array.isArray(row.period) ? row.period[0] : row.period;
    if (!period) continue;
    if (loggedKey < period.starts_on || loggedKey > period.ends_on) continue;
    const name = (entry as { crew_name: string | null }).crew_name || 'This crew member';
    const range = formatKeyRange(period.starts_on, period.ends_on);
    return row.status === 'paid'
      ? `${name} has already been paid for ${range}, and this entry is part of that payment. Deleting it would leave the payment with nothing behind it. Undo the payment first if it was wrong.`
      : `${name}'s hours for ${range} have been approved, and this entry is part of what was agreed. Undo the approval first if it needs changing.`;
  }
  return null;
}

/** How many labor entries are attached to a crew member, ever. */
export async function countLaborEntriesForCrew(
  supabase: SupabaseClient,
  accountId: string,
  crewId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('costs')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('crew_id', crewId)
    .eq('type', 'labor');
  if (error) return 0;
  return count ?? 0;
}
