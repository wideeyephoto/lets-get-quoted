import type { SupabaseClient } from '@supabase/supabase-js';
import { formatMoney } from '@/lib/jobs';
import { exportBlockedReason, normalizeOffset, normalizePeriodMode, resolvePayPeriod, toDateKey, zonedDateKey, type PayPeriod } from '@/lib/labor';
import type { LaborSettings } from '@/lib/labor-settings';
import type { OpenShiftView as OpenShiftViewType } from '@/app/dashboard/crew/HoursAndPay';
import {
  comparePeriods,
  hoursByWeekday,
  payPeriodState,
  periodPrimaryAction,
  periodProgress,
  summarizePayTotals,
  type CrewPayRow,
} from '@/lib/crew-pay';
import { listOutstandingPeriods, listPayEvents, listPeriodEntryLines, loadCrewPayContext } from '@/lib/crew-pay-data';
import { PAY_DAY_COLUMNS, payDaySettingsFromAccount, payDayView } from '@/lib/pay-day';
import { listLaborEntries } from '@/lib/labor-data';
import { getTimeClockMode, listOpenShifts } from '@/lib/time-clock-data';
import { SHIFT_FLAG_HELP, SHIFT_FLAG_LABEL, formatClock, formatElapsed, openShiftFlag } from '@/lib/time-clock';

/**
 * Everything the Hours & pay tab needs, in one read.
 *
 * That tab takes thirty-five props, and they come from nine different reads
 * with several conditionals between them. Enumerating those at a second call
 * site — which is what the logged-out demo would otherwise have to do — is how
 * two screens that are meant to be the same screen start disagreeing about
 * which period is open.
 *
 * Pure reads. Returns null when there is nothing to pay, which is the same
 * "blank tab" the page already renders for that case; callers decide what to
 * show instead.
 *
 * Both callers read through this — the app's crew page and the demo's — so
 * there is one rollup, not two. Twenty-four imports left the page when it was
 * switched over, which is a fair measure of how much of it lived there.
 */

function localInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Re-exported, not redeclared. A second structurally-similar definition of this
// compiled fine and then failed to assign, because `flag` widened differently on
// each side — which is the whole argument against having two of anything.
export type { OpenShiftView } from '@/app/dashboard/crew/HoursAndPay';

export type CrewPayView = {
  period: PayPeriod;
  rows: CrewPayRow[];
  totals: NonNullable<ReturnType<typeof summarizePayTotals>>;
  periodState: NonNullable<ReturnType<typeof payPeriodState>>;
  primaryAction: ReturnType<typeof periodPrimaryAction>;
  periodClosedAt: string | null;
  periodReopenReason: string | null;
  overlaps: { rangeLabel: string; paidCount: number }[];
  events: Awaited<ReturnType<typeof listPayEvents>>;
  payAvailable: boolean;
  exportBlocked: string | null;
  hoursToday: Record<string, number>;
  showTodayColumn: boolean;
  todayKey: string;
  progress: ReturnType<typeof periodProgress>;
  comparison: ReturnType<typeof comparePeriods>;
  payDay: ReturnType<typeof payDaySettingsFromAccount> | null;
  payDue: ReturnType<typeof payDayView> | null;
  outstanding: Awaited<ReturnType<typeof listOutstandingPeriods>>;
  approvedLines: Awaited<ReturnType<typeof listPeriodEntryLines>>;
  hoursThisPeriod: number[];
  hoursLastPeriod: number[];
  previousPayLabel: string;
  timeClockMode: Awaited<ReturnType<typeof getTimeClockMode>>;
  openShifts: OpenShiftViewType[];
};

export async function loadCrewPayView(
  supabase: SupabaseClient,
  accountId: string,
  options: {
    period: PayPeriod;
    settings: LaborSettings;
    timeZone: string;
    crew: Parameters<typeof loadCrewPayContext>[2]['crew'];
    crewId?: string | null;
    /** For the "vs last period" comparison — only the grouped layout shows it. */
    withComparison?: boolean;
    searchParams?: { period?: string; offset?: string; from?: string; to?: string };
  },
): Promise<CrewPayView | null> {
  const { period, settings, timeZone, crew } = options;
  const crewId = options.crewId ?? null;

  // The mode only, not availability: this screen states what the clock is set
  // to and links to the card that changes it. Whether the migration has run is
  // that card's question to answer, and asking it here cost a second round trip
  // on every load of a screen that no longer had anything to do with the answer.
  const timeClockMode = await getTimeClockMode(supabase, accountId);

  // Hours & pay reads through the pay context so the screen and the actions
  // that follow from it are looking at exactly the same rollup.
  const pay = await loadCrewPayContext(supabase, accountId, {
    period,
    settings,
    crewId,
    includeOpenShifts: timeClockMode !== 'off',
    // Not everyone is paid by the hour. Without this the rollup totals a
    // salaried person from their timesheet, which is the bug pay types
    // exist to fix.
    crew,
    timeZone,
  });

  const totals = summarizePayTotals(pay.rows);
  const periodState = payPeriodState(pay.rows, totals, period, { reopened: Boolean(pay.periodRow?.reopenedAt) });
  if (!totals || !periodState) return null;

  const { data: payDayRow } = await supabase.from('accounts').select(PAY_DAY_COLUMNS).eq('id', accountId).maybeSingle();
  const payDay = payDaySettingsFromAccount(payDayRow as Parameters<typeof payDaySettingsFromAccount>[0]);
  const payDue = payDayView({
    // zonedDateKey, NOT toDateKey. Whether a pay period is due is judged in the
    // ACCOUNT's zone: on a UTC server an Eastern shop's Friday evening is
    // already Saturday, which moves the due date by a day.
    periodEndKey: zonedDateKey(new Date(new Date(period.endIso).getTime() - 1), timeZone),
    todayKey: zonedDateKey(new Date(), timeZone),
    settings: payDay,
    hasHours: totals.hours > 0,
    // "Everyone" means everyone who could carry a payment record — labor with
    // nobody attached to it is not somebody waiting to be paid.
    allPaid: totals.crewCount > 0 && totals.unpaid === 0,
  });

  const outstanding = await listOutstandingPeriods(supabase, accountId, settings.periodMode, { timeZone }).catch(() => []);
  // The entries each approval was built from, frozen as they were then. Loaded
  // for the whole period so the detail pane can switch people without a round
  // trip — and so an adjustment can say WHICH shift moved, not just that one did.
  const approvedLines = pay.periodRow?.id
    ? await listPeriodEntryLines(supabase, accountId, pay.periodRow.id).catch(() => ({}))
    : {};

  const events = pay.periodRow ? await listPayEvents(supabase, accountId, { periodId: pay.periodRow.id, limit: 60 }) : [];

  // The period before this one, for the "vs last period" comparison and the
  // second series on the hours chart.
  const previousPeriod = options.withComparison
    ? resolvePayPeriod(
        options.searchParams?.period ? normalizePeriodMode(options.searchParams.period) : settings.periodMode,
        normalizeOffset(options.searchParams?.offset) - 1,
        { from: options.searchParams?.from, to: options.searchParams?.to, timeZone },
      )
    : null;
  const previousEntries = previousPeriod
    ? await listLaborEntries(supabase, accountId, { startIso: previousPeriod.startIso, endIso: previousPeriod.endIso, crewId })
    : [];
  const previousPay = previousEntries.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);

  const openShifts: OpenShiftViewType[] =
    timeClockMode !== 'off'
      ? (await listOpenShifts(supabase, accountId)).map((shift) => {
          const flag = openShiftFlag(shift.startedAt);
          return {
            id: shift.id,
            crewName: shift.crewName,
            jobLabel: shift.jobLabel,
            startedLabel: formatClock(shift.startedAt),
            elapsedLabel: formatElapsed(shift.startedAt),
            // datetime-local wants local wall-clock with no zone; "now" is the
            // safest default end because it's the latest defensible one.
            defaultEnd: localInputValue(new Date()),
            flag,
            flagLabel: flag ? SHIFT_FLAG_LABEL[flag] : null,
            flagHelp: flag ? SHIFT_FLAG_HELP[flag] : null,
          };
        })
      : [];

  // "Hours today" only earns a column while the period actually contains today,
  // and is counted here rather than in the browser so it agrees with the same
  // clock every other date on this page was cut with.
  const now = new Date();
  const todayKey = toDateKey(now);
  const showTodayColumn = now >= new Date(period.startIso) && now < new Date(period.endIso);
  const hoursToday: Record<string, number> = {};
  if (showTodayColumn) {
    for (const row of pay.rows) {
      if (!row.crewId) continue;
      const total = row.entries
        .filter((entry) => toDateKey(new Date(entry.loggedAt)) === todayKey)
        .reduce((sum, entry) => sum + entry.hours, 0);
      if (total > 0) hoursToday[row.crewId] = Math.round(total * 100) / 100;
    }
  }

  return {
    period,
    rows: pay.rows,
    totals,
    periodState,
    primaryAction: periodPrimaryAction(periodState, totals),
    periodClosedAt: pay.periodRow?.closedAt ?? null,
    periodReopenReason: pay.periodRow?.reopenReason ?? null,
    overlaps: pay.overlaps,
    events,
    payAvailable: pay.available,
    exportBlocked: exportBlockedReason(pay.rows),
    hoursToday,
    showTodayColumn,
    todayKey,
    progress: periodProgress(period, now),
    comparison: comparePeriods(totals.estimatedPay, previousPay),
    payDay,
    payDue,
    outstanding,
    approvedLines,
    hoursThisPeriod: hoursByWeekday(pay.rows.flatMap((row) => row.entries)),
    hoursLastPeriod: hoursByWeekday(
      previousEntries.map((entry) => ({ loggedAt: entry.created_at, hours: Number(entry.hours) || 0 })),
    ),
    previousPayLabel: formatMoney(previousPay),
    timeClockMode,
    openShifts,
  };
}
