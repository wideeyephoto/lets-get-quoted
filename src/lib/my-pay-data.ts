import type { SupabaseClient } from '@supabase/supabase-js';
import { formatKeyDay, formatKeyRange, payPeriodKey } from './crew-pay';
import { resolvePayPeriod, summarizeCrewLabor, zonedDateKey, type PayPeriod } from './labor';
import { listLaborEntries } from './labor-data';
import { LABOR_RULE_COLUMNS, laborRulesFromAccount, roundHours, type AccountLaborRules } from './labor-settings';
import { checkMyPay, toleranceFor, type MyPayCheck, type MyPayLine, type MyPayRecord, type MyPayStanding, myPayStanding } from './my-pay';
import { PAY_DAY_COLUMNS, payDaySettingsFromAccount, payDayView, type PayDayView } from './pay-day';
import { payBasisFromCrew, payRateLabel, type PayType } from './pay-types';

// Reads for the crew member's own pay screen.
//
// THE SCOPING RULE. crew_pay_entries and crew_pay_entry_lines are owner-only
// under RLS, and deliberately so — they carry actor emails, payment references
// and the owner's private notes. Rather than widening those policies (row-level
// security cannot withhold a column, so a crew read policy would hand over the
// note field too), the two reads below go through the ADMIN client with an
// explicit column allowlist and a hard filter on the crew id.
//
// That is only safe because accountId and crewId are resolved from the session
// by requireCrewContext and never come from the request. Nothing here takes an
// id from a caller, and nothing here should ever start to.
//
// Everything the crew member already owns — their labor entries — is read with
// the session client, so RLS keeps doing its job where it can.

const MISSING_TABLE = '42P01';

// What the crew member is entitled to know about their own payment. Everything
// absent from this list is absent on purpose: approved_by / paid_by / sent_by
// (whose account acted), payment_reference (the owner's check number), and
// payment_note, which owners write as an internal aide-mémoire and would not
// expect a crew member to read.
const SELF_ENTRY_COLUMNS =
  'id, status, regular_hours, overtime_hours, approved_amount, approved_at, paid_amount, paid_at, payment_date, payment_method';

export type MyPayHistoryRow = {
  id: string;
  rangeLabel: string;
  endsOn: string;
  hours: number;
  amount: number;
  paymentDate: string | null;
  paymentMethod: string | null;
};

export type MyPayView = {
  period: PayPeriod;
  periodEndKey: string;
  todayKey: string;
  rules: AccountLaborRules;
  rate: number;
  /** "$28.00/h" or "$72,000.00/yr" — never the derived costing rate. */
  rateLabel: string;
  payType: PayType;
  /** Why the amount is what it is. Shown when it isn't just hours × rate. */
  payBasis: string;
  standing: MyPayStanding;
  payDay: PayDayView;
  /** This period's entries as they stand right now. */
  logged: MyPayLine[];
  /** What was frozen at approval — empty until it is approved. */
  approved: MyPayLine[];
  check: MyPayCheck;
  history: MyPayHistoryRow[];
  /** False before the crew-pay migration: the screen shows hours and no money state. */
  payAvailable: boolean;
};

/**
 * Everything the field app's pay screen needs, in one call.
 *
 * `admin` and `supabase` are both required and are not interchangeable — see
 * the scoping rule above. The caller passes the crew member resolved from their
 * own session; this function never widens that.
 */
export async function loadMyPay(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  accountId: string,
  crew: {
    id: string;
    name?: string;
    role_label?: string | null;
    hourly_rate: number | string | null;
    pay_type?: unknown;
    annual_salary?: unknown;
    day_rate?: unknown;
  },
  options?: { now?: Date },
): Promise<MyPayView> {
  const now = options?.now ?? new Date();

  const { data: accountRow } = await admin
    .from('accounts')
    .select(`timezone, ${LABOR_RULE_COLUMNS}, ${PAY_DAY_COLUMNS}`)
    .eq('id', accountId)
    .maybeSingle();

  const timeZone = ((accountRow as { timezone?: string } | null)?.timezone) || 'America/New_York';
  // No cookie fallback: a crew member's phone has never held the owner's labor
  // settings, and inventing one would total their week under rules the account
  // never chose.
  const rules = laborRulesFromAccount(accountRow as Parameters<typeof laborRulesFromAccount>[0]);
  const paySettings = payDaySettingsFromAccount(accountRow as Parameters<typeof payDaySettingsFromAccount>[0]);

  const period = resolvePayPeriod(rules.periodMode === 'custom' ? 'weekly' : rules.periodMode, 0, { now, timeZone });
  const periodEndKey = zonedDateKey(new Date(new Date(period.endIso).getTime() - 1), timeZone);
  const todayKey = zonedDateKey(now, timeZone);

  const entries = await listLaborEntries(supabase, accountId, {
    startIso: period.startIso,
    endIso: period.endIso,
    crewId: crew.id,
  });

  // Summarized through exactly the rollup the owner's screen uses — including
  // the pay basis, so a salaried crew member is not shown their timesheet total
  // as if it were their pay.
  const basis = payBasisFromCrew(crew);
  const summary = summarizeCrewLabor(entries, {
    overtimeThreshold: rules.overtimeThreshold,
    roundHours: rules.rounding === 'none' ? undefined : (value) => roundHours(value, rules.rounding),
    payBasis: new Map([[crew.id, basis]]),
    periodMode: period.mode,
    periodDays: Math.round((new Date(period.endIso).getTime() - new Date(period.startIso).getTime()) / 86400000),
    timeZone,
    seedCrew: basis.payType === 'salary' ? [{ crewId: crew.id, name: crew.name ?? 'You', roleLabel: crew.role_label ?? null }] : [],
  });
  const mine = summary.rows.find((row) => row.crewId === crew.id) ?? null;
  const logged: MyPayLine[] = (mine?.entries ?? []).map((entry) => ({
    costId: entry.id,
    jobId: entry.jobId,
    description: entry.description,
    loggedAt: entry.loggedAt,
    hours: entry.hours,
    rate: entry.rate,
    amount: entry.amount,
  }));

  const { record, recordId, available } = await readMyRecord(admin, accountId, crew.id, period);
  const approved = recordId && record && record.status !== 'draft' ? await readMyLines(admin, accountId, recordId) : [];

  const payDay = payDayView({
    periodEndKey,
    todayKey,
    settings: paySettings,
    hasHours: (mine?.hours ?? 0) > 0,
    allPaid: record?.status === 'paid',
  });

  const standing = myPayStanding({
    record,
    loggedHours: mine?.hours ?? 0,
    loggedAmount: mine?.estimatedPay ?? 0,
    periodOver: todayKey > periodEndKey,
    payDay,
    formatDate: formatKeyDay,
  });

  return {
    period,
    periodEndKey,
    todayKey,
    rules,
    rate: Number(crew.hourly_rate) || 0,
    rateLabel: payRateLabel(basis),
    payType: basis.payType,
    payBasis: mine?.payBasis ?? '',
    standing,
    payDay,
    logged,
    approved,
    check: checkMyPay({
      logged,
      approved,
      approvedAt: record?.approvedAt ?? null,
      tolerance: toleranceFor(rules.rounding),
    }),
    history: available ? await readMyHistory(admin, accountId, crew.id, period) : [],
    payAvailable: available,
  };
}

/** This crew member's pay record for this period, if there is one. */
async function readMyRecord(
  admin: SupabaseClient,
  accountId: string,
  crewId: string,
  period: PayPeriod,
): Promise<{ record: MyPayRecord | null; recordId: string | null; available: boolean }> {
  // Matched on period_key, the identity the owner side computes when it writes
  // the row. Re-deriving the boundary here instead would drift the moment the
  // two used different date maths, and silently show an empty period.
  const { data, error } = await admin
    .from('crew_pay_entries')
    .select(`${SELF_ENTRY_COLUMNS}, period:crew_pay_periods!inner(period_key)`)
    .eq('account_id', accountId)
    .eq('crew_id', crewId)
    .eq('period.period_key', payPeriodKey(period))
    .limit(1)
    .maybeSingle();

  if (error) {
    // Pre-migration is not a failure — the screen still shows hours, it just has
    // nothing to say about approval or payment.
    if (error.code !== MISSING_TABLE) console.error('My pay record read failed:', error.message);
    return { record: null, recordId: null, available: error.code !== MISSING_TABLE };
  }
  if (!data) return { record: null, recordId: null, available: true };

  const row = data as Record<string, unknown>;
  return {
    recordId: row.id as string,
    available: true,
    record: {
      status: row.status as MyPayRecord['status'],
      regularHours: Number(row.regular_hours) || 0,
      overtimeHours: Number(row.overtime_hours) || 0,
      approvedAmount: Number(row.approved_amount) || 0,
      approvedAt: (row.approved_at as string) ?? null,
      paidAmount: row.paid_amount == null ? null : Number(row.paid_amount),
      paymentDate: (row.payment_date as string) ?? null,
      paymentMethod: (row.payment_method as string) ?? null,
    },
  };
}

/** The lines frozen into one approval. */
async function readMyLines(admin: SupabaseClient, accountId: string, payEntryId: string): Promise<MyPayLine[]> {
  const { data, error } = await admin
    .from('crew_pay_entry_lines')
    .select('cost_id, job_id, description, logged_at, hours, rate, amount')
    .eq('account_id', accountId)
    .eq('pay_entry_id', payEntryId)
    .order('logged_at', { ascending: true });
  if (error || !data) return [];
  return (data as Array<Record<string, unknown>>).map((row) => ({
    costId: (row.cost_id as string | null) ?? null,
    jobId: (row.job_id as string | null) ?? null,
    description: (row.description as string | null) ?? 'Labor',
    loggedAt: (row.logged_at as string | null) ?? '',
    hours: Number(row.hours) || 0,
    rate: Number(row.rate) || 0,
    amount: Number(row.amount) || 0,
  }));
}

/** What has actually been paid, most recent first. */
async function readMyHistory(
  admin: SupabaseClient,
  accountId: string,
  crewId: string,
  currentPeriod: PayPeriod,
): Promise<MyPayHistoryRow[]> {
  const { data, error } = await admin
    .from('crew_pay_entries')
    .select(`${SELF_ENTRY_COLUMNS}, period:crew_pay_periods!inner(period_key, starts_on, ends_on)`)
    .eq('account_id', accountId)
    .eq('crew_id', crewId)
    .eq('status', 'paid')
    .order('paid_at', { ascending: false })
    .limit(12);
  if (error || !data) return [];

  const currentKey = payPeriodKey(currentPeriod);
  const out: MyPayHistoryRow[] = [];
  for (const row of data as unknown as Array<
    Record<string, unknown> & {
      period: { period_key: string; starts_on: string; ends_on: string } | { period_key: string; starts_on: string; ends_on: string }[] | null;
    }
  >) {
    const periodRow = Array.isArray(row.period) ? row.period[0] : row.period;
    if (!periodRow) continue;
    // The period on screen above is not history yet, whatever its status.
    if (periodRow.period_key === currentKey) continue;
    out.push({
      id: row.id as string,
      rangeLabel: formatKeyRange(periodRow.starts_on, periodRow.ends_on),
      endsOn: periodRow.ends_on,
      hours: (Number(row.regular_hours) || 0) + (Number(row.overtime_hours) || 0),
      amount: row.paid_amount == null ? Number(row.approved_amount) || 0 : Number(row.paid_amount),
      paymentDate: (row.payment_date as string) ?? null,
      paymentMethod: (row.payment_method as string) ?? null,
    });
  }
  return out;
}
