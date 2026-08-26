'use client';

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode, type RefObject } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormState } from 'react-dom';
import {
  ENTRY_ISSUE_HELP,
  ENTRY_ISSUE_LABEL,
  OVERTIME_POLICY,
  PERIOD_MODES,
  offsetForDate,
  type PayPeriod,
  type PeriodMode,
} from '@/lib/labor';
import {
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATE_LABEL,
  PAY_EVENT_LABEL,
  PAY_STATUS_HELP,
  PAY_STATUS_LABEL,
  PAY_WARNING_FIX,
  PAY_WARNING_HELP,
  PAY_WARNING_SEVERITY,
  PERIOD_STATE_HELP,
  PERIOD_STATE_LABEL,
  WEEKDAY_LABELS,
  UNDO_DISCLAIMER,
  approveActionLabel,
  buildPayCsv,
  canApproveRow,
  entryHoursLabel,
  groupCrewRows,
  hoursLabel,
  markPeriodBlockedReason,
  needsReapproval,
  payMoney,
  payWarningChip,
  periodEndKey,
  rateBreakdownLabel,
  rowHoursLabel,
  type CrewPayRow,
  type PayEvent,
  type PayPeriodState,
  type PayWarning,
  type PeriodAction,
  type PeriodComparison,
  type PeriodTotals,
} from '@/lib/crew-pay';
import { PAY_TYPE_LABEL } from '@/lib/pay-types';
import {
  PAYROLL_PROVIDER_LABEL,
  buildPayrollExport,
  exportableRows,
  type PayrollExport,
  type PayrollProvider,
} from '@/lib/payroll-export';
import { EXPORT_FORMAT_LABEL, ROUNDING_LABEL, type LaborSettings } from '@/lib/labor-settings';
import { TIME_CLOCK_MODES, type TimeClockMode } from '@/lib/time-clock';
import SaveButton from '@/components/save-button';
import { addLaborEntryAction, closeOpenShiftAction, deleteLaborEntryAction } from './actions';
import { saveLaborSettingsAction } from './settings-actions';
import PayMasterDetail from './PayMasterDetail';
import { WEEKDAY_NAMES, daysWaiting, payDaySentence, waitingLabel, type PayDaySettings, type PayDayView } from '@/lib/pay-day';
import type { OutstandingPeriod, PayEntryLine } from '@/lib/crew-pay-data';
import {
  approveHoursAction,
  closePeriodAction,
  markPaidAction,
  markSentAction,
  recordExportAction,
  reopenPeriodAction,
  setEntryLockAction,
  undoPaidAction,
  type PayActionState,
} from './pay-actions';
import ViewGear, { type ViewOption } from '@/components/view-gear';
import OverviewBoard, { overviewOption, type OverviewItem } from './OverviewBoard';
import { setCrewOverviewAction, setCrewSkinAction, setCrewViewAction } from '@/app/dashboard/view-actions';
import type { CrewSkin, CrewView } from '@/lib/dashboard-views';
import { CREW_SKIN_OPTIONS, applyCrewSkin } from './crew-skins';
import { PaymentConfirmDialog, ReasonDialog } from './PaymentDialogs';
import { avatarTone } from '@/lib/avatar-tone';
import styles from './crew.module.css';

// Hours & pay.
//
// The shape of the screen is the shape of the job: review the exceptions,
// approve the hours, record the payment, done. Everything else — settings,
// history, corrections, the awkward cases — is reachable without being in the
// way of that line.
//
// This product does not run payroll. It does not calculate or withhold tax,
// file anything, or move money to anyone's bank. "Paid" here means the
// contractor recorded that they paid, and every surface that says it says so.

const IDLE: PayActionState = { ok: false, message: '' };

export type OpenShiftView = {
  id: string;
  crewName: string;
  jobLabel: string;
  startedLabel: string;
  elapsedLabel: string;
  defaultEnd: string;
  flag: 'running-long' | 'implausible' | null;
  flagLabel: string | null;
  flagHelp: string | null;
  geofenceStatus?: string | null;
  geofenceLabel?: string | null;
};

type StatusFilter = 'all' | 'needs_review' | 'approved' | 'draft';
type PaymentFilter = 'all' | 'unpaid' | 'sent' | 'paid';
type SortKey = 'name' | 'hours' | 'pay' | 'review' | 'payment';

// 'overview' is not a CrewView — it is the whole page's mode, and picking it
// here puts the other two tabs in it as well. It rides in this list because
// that's where somebody looks for a layout, not because it is one of these.
type CrewPick = CrewView | 'overview';
/** What is actually on screen: the page mode when it's on, this tab's layout otherwise. */
type Layout = CrewPick;

const CREW_VIEW_OPTIONS: ViewOption<CrewPick>[] = [
  { id: 'table', label: 'Table', hint: 'Every crew member in one list' },
  { id: 'grouped', label: 'Grouped', hint: 'Sections by what needs doing' },
  { id: 'rail', label: 'Review', hint: 'Table with the actions pinned beside it' },
  { id: 'focus', label: 'Focus', hint: 'One person at a time — their timesheet, approval and pay' },
  overviewOption<CrewPick>('Everyone in a list, one open beside it — all three tabs'),
];

// Views that put the rail beside the table rather than under it. They need the
// wide shell, and they move the period's one action into the rail.
function isRailView(view: CrewView): boolean {
  return view === 'rail' || view === 'focus';
}

// The order the sections appear in is the order the work happens in: sort out
// the exceptions, pay who's owed, then everything already settled.
const GROUPS = [
  { id: 'needs_review', label: 'Needs review', tone: 'alert' as const },
  { id: 'unpaid', label: 'Unpaid', tone: 'warn' as const },
  { id: 'paid', label: 'Paid', tone: 'ok' as const },
  { id: 'no_hours', label: 'No hours', tone: 'muted' as const },
];

/**
 * Warnings whose correction is a fresh, corrected labor entry.
 *
 * A labor row cannot be edited in place anywhere in this product — the drawer
 * offers Remove and the toolbar offers Add — so "set the rate on that entry" is
 * advice about a control that does not exist. This is the honest button: add the
 * entry again with what it should have said, and remove the wrong one.
 */
const ENTRY_FIX_WARNINGS: PayWarning[] = ['no-hours', 'missing-rate', 'unassigned', 'no-job'];

const REVIEW_RANK: Record<string, number> = { needs_review: 0, draft: 1, approved: 2 };
const PAYMENT_RANK: Record<string, number> = { unpaid: 0, sent: 1, paid: 2 };

// -- The summary cards, as filters --------------------------------------------

type StatFilter = { status: StatusFilter; payment: PaymentFilter; flagged: boolean };

/** Everyone. Also what pressing an applied card again goes back to. */
const ALL_FILTER: StatFilter = { status: 'all', payment: 'all', flagged: false };

function sameFilter(a: StatFilter, b: StatFilter): boolean {
  return a.status === b.status && a.payment === b.payment && a.flagged === b.flagged;
}

/**
 * The six figures across the top of the period, and what each one filters to.
 *
 * Declared as data rather than as six hand-written buttons so that the label,
 * the filter it applies and the selected state it shows are one thing. When
 * they were six buttons, "Hours logged" filtered to approved rows — a card
 * whose heading and behavior disagreed, on the screen where a number's meaning
 * is the whole product.
 */
const STAT_CARDS: Array<{
  id: string;
  label: string;
  help: string;
  tone?: (totals: PeriodTotals) => 'pay' | 'alert' | 'warn' | 'ok' | undefined;
  /** Null for a readout — a number that isn't a control. */
  filter: StatFilter | null;
  figure: (totals: PeriodTotals, rows: CrewPayRow[]) => { value: string; note: ReactNode };
}> = [
  {
    id: 'pay',
    label: 'Total est. pay',
    help: 'Hours × the rate on each entry. An estimate of what to pay — this product does not run payroll, withhold tax or move money. Press to show everyone.',
    tone: () => 'pay',
    filter: ALL_FILTER,
    figure: (totals) => ({
      value: payMoney(totals.estimatedPay),
      // The part that has been agreed cannot move on its own; the rest still
      // can. Leading with one number hid that difference.
      note: (
        <>
          {totals.agreedPay > 0 ? `${payMoney(totals.agreedPay)} agreed` : 'none agreed yet'}
          {totals.estimatingPay > 0 ? ` · ${payMoney(totals.estimatingPay)} still estimating` : ''}
        </>
      ),
    }),
  },
  {
    id: 'hours',
    label: 'Hours logged',
    // Hours LOGGED, said plainly. Calling this "approved hours" while it counts
    // everything is the kind of small lie that ends with someone paying for
    // time they never agreed.
    help: `Every hour logged in this period, approved or not. ${OVERTIME_POLICY}`,
    filter: null,
    figure: (totals) => ({
      value: hoursLabel(totals.hours),
      note: (
        <>
          {totals.overtimeHours > 0 ? `${hoursLabel(totals.overtimeHours)} over the threshold` : null}
          {totals.overtimeHours > 0 && totals.approvedHours > 0 ? ' · ' : null}
          {totals.approvedHours > 0 ? `${hoursLabel(totals.approvedHours)} approved` : null}
          {totals.overtimeHours === 0 && totals.approvedHours === 0 ? 'None approved yet' : null}
        </>
      ),
    }),
  },
  {
    id: 'crew',
    label: 'Crew members',
    help: 'Everyone with a pay record or hours in this period.',
    filter: null,
    figure: (totals, rows) => ({
      value: String(totals.crewCount),
      note: `${rows.filter((row) => row.hours > 0).length} with hours`,
    }),
  },
  {
    id: 'review',
    label: 'Need review',
    help: 'Show only the people with something to sort out before their hours can be approved.',
    tone: (totals) => (totals.needsReview > 0 ? 'alert' : undefined),
    filter: { status: 'needs_review', payment: 'all', flagged: false },
    figure: (totals) => ({ value: String(totals.needsReview), note: null }),
  },
  {
    id: 'unpaid',
    label: 'Unpaid',
    help: 'Show only the people who have not been marked paid for this period.',
    tone: (totals) => (totals.unpaid > 0 ? 'warn' : undefined),
    filter: { status: 'all', payment: 'unpaid', flagged: false },
    figure: (totals) => ({ value: String(totals.unpaid), note: null }),
  },
  {
    id: 'paid',
    label: 'Paid',
    help: 'Show only the people you have recorded a payment for in this period.',
    tone: () => 'ok',
    filter: { status: 'all', payment: 'paid', flagged: false },
    figure: (totals) => ({ value: String(totals.paid), note: null }),
  },
];

function rowKey(row: CrewPayRow): string {
  return row.crewId ?? 'unassigned';
}

function loggedLabel(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function stamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function dayLabel(value: string | null): string {
  if (!value) return '—';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** What a button has asked to happen. Held by the page, not by the button. */
type Armed = { kind: 'approve' | 'sent'; crewIds: string[] } | { kind: 'close'; crewIds?: undefined } | null;

/**
 * A pay action as an always-mounted form that a button arms.
 *
 * The buttons that trigger these actions are conditional on the very status the
 * action changes — "Approve hours" only exists while hours are unapproved,
 * "Mark as sent to payroll" only while they're unsent. When the form lived
 * inside the button, a successful action re-rendered the row, unmounted the
 * form, and the effect that reports the result never ran: the work happened and
 * the screen said nothing. Keeping the form out here, mounted for the life of
 * the page, means the result always has somewhere to land.
 */
function ArmedForm({
  action,
  armed,
  fields,
  onDone,
}: {
  action: (prev: PayActionState, formData: FormData) => Promise<PayActionState>;
  armed: Armed;
  fields: ReactNode;
  onDone: (state: PayActionState) => void;
}) {
  const ref = useRef<HTMLFormElement | null>(null);
  const [state, formAction] = useFormState(action, IDLE);

  useEffect(() => {
    // The hidden inputs below are rendered from the same `armed` value, so by
    // the time this effect runs they are already in the form.
    if (armed) ref.current?.requestSubmit();
  }, [armed]);

  useEffect(() => {
    if (state.message) onDone(state);
    // onDone is a stable setter from the parent; re-firing on identity churn
    // would re-toast the same result on every keystroke elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form ref={ref} action={formAction} hidden>
      {fields}
      {(armed?.crewIds ?? []).map((id) => (
        <input key={id} type="hidden" name="crewIds" value={id} />
      ))}
    </form>
  );
}

export default function HoursAndPay({
  payrollProvider = 'generic',
  rows,
  totals,
  periodState,
  primaryAction,
  period,
  periodClosedAt,
  periodReopenReason,
  overlaps,
  events,
  payAvailable,
  exportBlocked,
  crewFilter,
  crewOptions,
  assignableJobs,
  jobLookup,
  jobsByCrew,
  hoursToday,
  showTodayColumn,
  todayKey,
  progress,
  settings,
  requireSeparatePayer,
  timeClockMode,
  openShifts,
  initialView,
  initialSkin,
  initialOverview,
  comparison,
  payDay,
  payDue,
  outstanding,
  approvedLines,
  hoursThisPeriod,
  hoursLastPeriod,
  previousPayLabel,
}: {
  /** Which provider's file shape to build. Defaults to a plain spreadsheet. */
  payrollProvider?: PayrollProvider;
  rows: CrewPayRow[];
  totals: PeriodTotals;
  periodState: PayPeriodState;
  primaryAction: PeriodAction | null;
  period: PayPeriod;
  periodClosedAt: string | null;
  periodReopenReason: string | null;
  overlaps: { rangeLabel: string; paidCount: number }[];
  events: PayEvent[];
  payAvailable: boolean;
  exportBlocked: string | null;
  crewFilter: string | null;
  crewOptions: { id: string; name: string }[];
  assignableJobs: { id: string; ref: string; clientName: string }[];
  jobLookup: Record<string, string>;
  jobsByCrew: Record<string, { ref: string; clientName: string }[]>;
  hoursToday: Record<string, number>;
  showTodayColumn: boolean;
  todayKey: string;
  progress: { daysTotal: number; daysDone: number; daysLeft: number };
  settings: LaborSettings;
  /** Whether whoever approved is barred from recording the payment. */
  requireSeparatePayer: boolean;
  timeClockMode: TimeClockMode;
  openShifts: OpenShiftView[];
  initialView: CrewView;
  initialSkin: CrewSkin;
  /** Whether the whole page is in Overview. Outranks initialView while it's on. */
  initialOverview: boolean;
  /** This period against the one before. Only the grouped layout shows it. */
  comparison: PeriodComparison | null;
  /** How this account decides when a period is due. Null on the other tabs. */
  payDay: PayDaySettings | null;
  /** Where this period stands against that day. */
  payDue: PayDayView | null;
  /** Earlier periods that still owe somebody — the look-behind strip. */
  outstanding: OutstandingPeriod[];
  /** The entries each approval was built from, frozen at approval, by crew id. */
  approvedLines: Record<string, PayEntryLine[]>;
  hoursThisPeriod: number[];
  hoursLastPeriod: number[];
  previousPayLabel: string;
}) {
  // The period picker navigates rather than posting: the period lives in the
  // URL, so a range somebody is looking at can be linked to and comes back on
  // reload. Link handles the arrows; the selects need router.push.
  const router = useRouter();
  const [view, setView] = useState<CrewView>(initialView);
  const [overview, setOverview] = useState(initialOverview);
  const [skin, setSkin] = useState<CrewSkin>(initialSkin);
  const [, startViewSave] = useTransition();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Everything below branches on THIS, not on `view`. Overview leaves the stored
  // layout alone so it comes back when you leave — which means `view` still says
  // 'grouped' while Overview is on, and anything reading it directly would draw
  // the grouped sections underneath.
  const layout: Layout = overview ? 'overview' : view;

  function pickView(next: CrewPick) {
    if (next === 'overview') {
      setOverview(true);
      startViewSave(() => {
        void setCrewOverviewAction(true).catch(() => {});
      });
      return;
    }
    // Leaving Overview is implicit in picking a layout: setCrewViewAction clears
    // the page mode, so the cookie and the screen never disagree.
    setOverview(false);
    setView(next);
    // Remembered for next time; the width below doesn't wait for it.
    startViewSave(() => {
      void setCrewViewAction(next).catch(() => {});
    });
  }

  // Color only — the layout this tab is in stays exactly as it was.
  function pickSkin(next: CrewSkin) {
    setSkin(next);
    applyCrewSkin(next);
    startViewSave(() => {
      void setCrewSkinAction(next).catch(() => {});
    });
  }

  // Review needs a wider shell than the 1100px cap, and the shell is rendered
  // by the page above this component. The server sets the class from the cookie
  // so the first paint is right; this keeps it in step the moment the view
  // changes, rather than making a layout change wait on a round trip.
  useEffect(() => {
    const main = document.querySelector('main.wide-shell');
    if (!main) return;
    // Overview stays at the standard width: a 21rem list beside one open person
    // does not need 1600px, and letting it have it strands the pane's buttons a
    // screen-width away from the list.
    main.classList.toggle('crew-wide', layout !== 'overview' && isRailView(view));
    // Focus is a page theme, not just this tab's layout.
    main.classList.toggle('crew-focus', layout === 'focus');
    return () => {
      main.classList.remove('crew-wide');
      main.classList.remove('crew-focus');
    };
  }, [view, layout]);
  const [selected, setSelected] = useState<string[]>([]);
  // Which person the master-detail layout is showing. Null until one is picked;
  // the component then falls back to whoever most needs looking at.
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('all');
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'pay', dir: 'desc' });
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<{ mode: 'crew'; crewId: string } | { mode: 'history' } | null>(null);
  const [dialog, setDialog] = useState<
    | { kind: 'pay'; ids: string[] }
    | { kind: 'undo'; crewId: string; name: string }
    | { kind: 'unlock'; crewId: string; name: string }
    | { kind: 'reopen' }
    | null
  >(null);
  const [toast, setToast] = useState<PayActionState | null>(null);
  const [armed, setArmed] = useState<Armed>(null);
  const exportFormRef = useRef<HTMLFormElement | null>(null);
  // The payroll file, described before it exists on anyone's disk. `confirmed`
  // flips once it has actually been downloaded, so the panel stops offering a
  // decision that has been made.
  const [exportPlan, setExportPlan] = useState<
    { result: PayrollExport; amount: number; names: string[]; confirmed: boolean } | null
  >(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  /** Fire a pay action. The armed form does the submitting; this is the trigger. */
  function arm(next: NonNullable<Armed>) {
    setArmed(next);
  }
  const busy = (kind: NonNullable<Armed>['kind']) => armed?.kind === kind;

  const byKey = useMemo(() => new Map(rows.map((row) => [rowKey(row), row])), [rows]);
  // Shared with the grouped sections so the tally and the sections can never
  // disagree about what "unpaid" means.
  const groups = useMemo(() => groupCrewRows(rows), [rows]);

  // A toast that stays forever is a banner. This one says its piece and goes.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 9000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Close the row menu on an outside click — measured by CONTAINMENT, not by
  // stopping propagation. Next hydrates into the document itself, so React's
  // listener and a document listener sit on the same node: stopPropagation in a
  // handler doesn't stop the other one. A "click outside" that fired on a click
  // INSIDE the menu unmounted the menu's form in the same tick, and the browser
  // cancelled the submit as "form not connected" — the action silently did
  // nothing. Escape closes it too.
  useEffect(() => {
    if (!menuFor) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuFor(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuFor(null);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [menuFor]);

  // Escape closes the drawer. Anything that covers the page has to be
  // dismissable from the keyboard — a panel you can only leave with the mouse
  // is a trap for anyone not using one.
  useEffect(() => {
    if (!drawer) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawer(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [drawer]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (statusFilter !== 'all' && row.review !== statusFilter) return false;
      if (paymentFilter !== 'all' && row.payment !== paymentFilter) return false;
      if (flaggedOnly && !row.warnings.some((warning) => PAY_WARNING_SEVERITY[warning] !== 'info')) return false;
      if (!needle) return true;
      const jobs = row.crewId ? jobsByCrew[row.crewId] ?? [] : [];
      return (
        row.name.toLowerCase().includes(needle) ||
        (row.roleLabel ?? '').toLowerCase().includes(needle) ||
        jobs.some((job) => `${job.ref} ${job.clientName}`.toLowerCase().includes(needle))
      );
    });

    const direction = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sort.key) {
        case 'name':
          return a.name.localeCompare(b.name) * direction;
        case 'hours':
          return (a.hours - b.hours) * direction;
        case 'review':
          return ((REVIEW_RANK[a.review] ?? 3) - (REVIEW_RANK[b.review] ?? 3)) * direction || a.name.localeCompare(b.name);
        case 'payment':
          return ((PAYMENT_RANK[a.payment] ?? 3) - (PAYMENT_RANK[b.payment] ?? 3)) * direction || a.name.localeCompare(b.name);
        default:
          return (a.estimatedPay - b.estimatedPay) * direction || a.name.localeCompare(b.name);
      }
    });
  }, [rows, statusFilter, paymentFilter, flaggedOnly, query, sort, jobsByCrew]);

  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const paged = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Selection follows the filter, not the page: ticking "select all" while a
  // filter is on has to mean the rows that filter describes, and the bulk bar
  // says how many that is.
  const selectable = useMemo(() => visible.filter((row) => row.eligible && row.hours > 0 && row.payment !== 'paid'), [visible]);
  const selectedRows = useMemo(() => selected.map((id) => byKey.get(id)).filter(Boolean) as CrewPayRow[], [selected, byKey]);
  const selectedTotal = selectedRows.reduce((sum, row) => sum + row.estimatedPay, 0);
  const allSelected = selectable.length > 0 && selectable.every((row) => selected.includes(rowKey(row)));

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  }

  function toggleAll() {
    setSelected(allSelected ? [] : selectable.map(rowKey));
  }

  /** What the table is filtered to right now, so a card can show it is the one. */
  const currentFilter: StatFilter = { status: statusFilter, payment: paymentFilter, flagged: flaggedOnly };

  function applyFilter(next: { status?: StatusFilter; payment?: PaymentFilter; flagged?: boolean }) {
    if (next.status !== undefined) setStatusFilter(next.status);
    if (next.payment !== undefined) setPaymentFilter(next.payment);
    if (next.flagged !== undefined) setFlaggedOnly(next.flagged);
    setPage(1);
  }

  function handleDone(state: PayActionState) {
    setToast(state);
    setArmed(null);
    if (state.ok) {
      setSelected([]);
      setDialog(null);
      setMenuFor(null);
    }
  }

  function periodHref(patch: Record<string, string | null>): string {
    const query = new URLSearchParams();
    query.set('tab', 'hours');
    query.set('period', period.mode);
    if (period.offset) query.set('offset', String(period.offset));
    if (crewFilter) query.set('crew', crewFilter);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) query.delete(key);
      else query.set(key, value);
    }
    return `/dashboard/crew?${query.toString()}`;
  }

  // Period identity travels with every action, so a click always acts on the
  // range that was on screen rather than on "now" at the moment it runs.
  const periodFields = (
    <>
      <input type="hidden" name="period" value={period.mode} />
      <input type="hidden" name="offset" value={period.offset} />
      {period.mode === 'custom' ? (
        <>
          <input type="hidden" name="from" value={period.startIso.slice(0, 10)} />
          <input type="hidden" name="to" value={period.endIso.slice(0, 10)} />
        </>
      ) : null}
    </>
  );

  function saveFile(csv: string, filename: string) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  /**
   * The file the payroll provider imports — PREPARED, not sent.
   *
   * Deliberately not the same file as the review sheet below. This one only
   * carries approved, unpaid rows, drops salaried staff (their provider already
   * pays them from the salary on file), and reports both facts rather than
   * quietly shipping a shorter file than the owner expected.
   *
   * It used to build the file and download it in the same click, and only then
   * say who had been left out — so the first time anyone learned that four of
   * their seven crew weren't in it was after the file was already on their
   * desktop, quite possibly already uploaded. Everything the owner needs to
   * judge it — provider, who, which period, how much, and what will break the
   * import — is now shown first, and the download is the second click.
   */
  function prepareForPayroll() {
    const { rows: approved, excluded: notReady } = exportableRows(rows);
    const result = buildPayrollExport(approved, {
      provider: payrollProvider,
      rangeLabel: period.rangeLabel,
      periodEndKey: periodEndKey(period),
      alreadySent: rows.some((row) => row.record?.sentAt),
    });
    setExportPlan({
      result: { ...result, excluded: [...notReady, ...result.excluded] },
      amount: approved.reduce((sum, row) => sum + row.estimatedPay, 0),
      names: approved.map((row) => row.name),
      confirmed: false,
    });
  }

  function confirmPayrollExport() {
    if (!exportPlan || exportPlan.result.included === 0) return;
    saveFile(exportPlan.result.csv, exportPlan.result.filename);
    if (payAvailable) exportFormRef.current?.requestSubmit();
    setExportPlan({ ...exportPlan, confirmed: true });
  }

  function download(only?: CrewPayRow[]) {
    const chosen = only ?? visible;
    saveFile(buildPayCsv(chosen, period.rangeLabel), `hours-${period.rangeLabel.replace(/[^\w]+/g, '-').toLowerCase()}.csv`);
    // The export lands in this period's history. It changes nobody's status:
    // hours leaving as a file is not the same claim as hours being paid.
    if (payAvailable) exportFormRef.current?.requestSubmit();
  }

  const filteredName = crewFilter ? crewOptions.find((option) => option.id === crewFilter)?.name : null;
  // Measured from the END of the period: money is not owed for a week that has
  // not finished, so counting from a Monday entry would call it late early.
  const waitingDays = daysWaiting(periodEndKey(period), todayKey);
  const waiting = waitingLabel(waitingDays);
  const payableNow = rows.filter((row) => row.eligible && row.hours > 0 && row.payment !== 'paid');
  const periodPayBlocked = markPeriodBlockedReason(rows);
  const drawerRow = drawer?.mode === 'crew' ? byKey.get(drawer.crewId) ?? null : null;
  const latestPayment = useMemo(() => {
    const paid = rows.filter((row) => row.record?.paidAt);
    if (paid.length === 0) return null;
    const newest = paid.reduce((best, row) => ((row.record!.paidAt ?? '') > (best.record!.paidAt ?? '') ? row : best));
    const sameBatch = paid.filter((row) => row.record?.paymentDate === newest.record?.paymentDate);
    return { row: newest, count: sameBatch.length, total: sameBatch.reduce((sum, row) => sum + (row.paidAmount ?? 0), 0) };
  }, [rows]);

  // OVERDUE MONEY OUTRANKS AN EMPTY WEEK.
  //
  // The screen shows one period at a time, and it opens on the current one — so
  // on a Monday morning the whole page is about a period with nothing in it,
  // laid out above a one-line strip mentioning the $4,000 nobody has been paid
  // from three weeks ago. Being caught up is not something an owner should have
  // to remember to check. When this period has no money outstanding of its own,
  // the older debt is what leads the page; when it does, it stays where it was,
  // below the work in front of you.
  const owedTotal = outstanding.reduce((sum, item) => sum + item.outstandingPay, 0);
  const owedLeadsHere = outstanding.length > 0 && (rows.length === 0 || totals.unpaidPay === 0);
  const owedStrip =
    outstanding.length === 0 ? null : (
      <section className={styles.owedStrip} aria-label="Earlier periods still owed">
        <div>
          <strong>
            {outstanding.length === 1
              ? 'An earlier period still owes somebody'
              : `${outstanding.length} earlier periods still owe somebody`}
          </strong>
          <small>
            {payMoney(owedTotal)} outstanding · oldest {outstanding[0].rangeLabel}
            {owedLeadsHere ? ' · nothing is outstanding in the period below' : ''}
          </small>
        </div>
        <div className={styles.owedLinks}>
          {outstanding.slice(0, 3).map((item) => (
            <Link key={item.key} href={periodHref({ offset: String(item.offset), from: null, to: null })}>
              <span>Review {item.rangeLabel}</span>
              <em>{payMoney(item.outstandingPay)}</em>
            </Link>
          ))}
        </div>
      </section>
    );

  // The period's one action, rendered once and placed differently by view: in
  // the summary card for Table/Grouped/Review, in the rail for Focus. Defined
  // here rather than twice so the two placements can never drift into offering
  // different buttons for the same state.
  //
  // Approving and paying are the only green buttons on this screen. Orange is
  // the brand's "do the thing" everywhere else in the app; keeping green for
  // exactly these two means a green button always signals money agreed or money
  // recorded, and never anything reversible-looking that isn't.
  const primaryActionButton = !payAvailable || !primaryAction ? null : primaryAction.id === 'review' ? (
    <button type="button" className="btn primary" onClick={() => applyFilter({ status: 'needs_review', payment: 'all' })}>
      {primaryAction.label}
    </button>
  ) : primaryAction.id === 'approve' ? (
    <button type="button" className={`btn primary ${styles.goAction}`} disabled={busy('approve')} onClick={() => arm({ kind: 'approve', crewIds: [] })}>
      {busy('approve') ? 'Approving…' : 'Approve hours'}
    </button>
  ) : primaryAction.id === 'pay' || primaryAction.id === 'finish' ? (
    <button
      type="button"
      className={`btn primary ${styles.goAction}`}
      disabled={Boolean(periodPayBlocked)}
      // The tooltip is the whole explanation of why it's greyed out. A disabled
      // button that says nothing is just a dead end.
      title={periodPayBlocked ?? undefined}
      onClick={() => setDialog({ kind: 'pay', ids: payableNow.map(rowKey) })}
    >
      {primaryAction.label}
    </button>
  ) : (
    <button type="button" className="btn primary" onClick={() => setDrawer({ mode: 'history' })}>
      {primaryAction.label}
    </button>
  );

  // The period as Overview rows. The three stats are the three numbers a pay
  // period is argued about — what they worked, what that comes to, and whether
  // it has moved since somebody agreed it.
  //
  // The actions are the same two the row menu already offers, wired to the same
  // handlers, so Overview can never approve or pay by a different route than the
  // table does. The pay dialog and its confirmation still apply.
  const overviewItems: OverviewItem[] = visible.map((row) => {
    const id = rowKey(row);
    const worst = [...row.blockers, ...row.warnings][0] ?? null;
    return {
      id,
      initials: row.name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?',
      name: row.name,
      sub: [row.roleLabel, PAY_TYPE_LABEL[row.payType]].filter(Boolean).join(' · ') || PAY_TYPE_LABEL[row.payType],
      amount: payMoney(row.estimatedPay),
      amountTitle: row.payBasis,
      badge: {
        label: PAY_STATUS_LABEL[row.review === 'approved' ? 'approved' : row.status],
        tone: row.review === 'needs_review' ? 'alert' : row.payment === 'paid' ? 'ok' : row.review === 'approved' ? 'warn' : 'muted',
        title: PAY_STATUS_HELP[row.status],
      },
      headline: row.payProblem
        ? row.payProblem
        : `${rowHoursLabel(row)} across ${row.entryCount} ${row.entryCount === 1 ? 'entry' : 'entries'} · ${PAYMENT_STATE_LABEL[row.payment]}`,
      stats: [
        {
          label: 'Hours',
          value: rowHoursLabel(row),
          title: row.overtimeHours > 0 ? `Includes ${hoursLabel(row.overtimeHours)} over the threshold. ${OVERTIME_POLICY}` : undefined,
        },
        { label: 'Est. pay', value: payMoney(row.estimatedPay), title: `${row.payBasis}${rateBreakdownLabel(row.entries) ? ` · ${rateBreakdownLabel(row.entries)}` : ''}` },
        {
          label: row.payment === 'paid' ? 'Paid' : row.review === 'approved' ? 'Approved' : 'Agreed',
          value: row.payment === 'paid' ? payMoney(row.paidAmount ?? 0) : row.approvedAmount === null ? '—' : payMoney(row.approvedAmount),
          title: row.paymentDetail ?? row.paymentLabel ?? undefined,
        },
      ],
      // The adjustment is the one thing on this row that changes what you owe,
      // so it gets said in words rather than left as two figures to subtract.
      note:
        row.adjustment !== 0 ? (
          <span className={styles.mdMoved}>
            {payMoney(Math.abs(row.adjustment))} {row.adjustment > 0 ? 'more' : 'less'} than was{' '}
            {row.payment === 'paid' ? 'paid' : 'approved'} — the hours have changed since.
          </span>
        ) : worst ? (
          // The chip alone is a table's shorthand — on its own line "Overtime"
          // is a word, not a warning. The pane has room to say what it means.
          <>
            <span className={styles.flagChip} data-severity={PAY_WARNING_SEVERITY[worst]}>
              {payWarningChip(worst, row.entries)}
            </span>
            <span className={styles.dim}>{PAY_WARNING_HELP[worst]}</span>
            <span className={styles.dim}>{PAY_WARNING_FIX[worst]}</span>
          </>
        ) : row.paymentLabel ? (
          <span className={styles.dim}>{[row.paymentLabel, row.paymentDetail].filter(Boolean).join(' · ')}</span>
        ) : null,
      actions: (
        <>
          <button type="button" className="btn primary" onClick={() => setDrawer({ mode: 'crew', crewId: id })}>
            Open timesheet
          </button>
          {payAvailable && canApproveRow(row) ? (
            <button type="button" className={`btn secondary ${styles.goAction}`} disabled={busy('approve')} onClick={() => arm({ kind: 'approve', crewIds: [id] })}>
              {busy('approve') ? 'Approving…' : approveActionLabel(row)}
            </button>
          ) : null}
          {payAvailable && row.review === 'approved' && row.payment !== 'paid' ? (
            <button type="button" className="btn secondary" onClick={() => setDialog({ kind: 'pay', ids: [id] })}>
              Mark paid
            </button>
          ) : null}
        </>
      ),
    };
  });

  return (
    <>
      <div className={styles.hpHead}>
        <div>
          <h2 className={styles.hpTitle}>Hours &amp; pay</h2>
          <p className={styles.hpLead}>
            Review crew hours, agree what they come to, and record who you&apos;ve paid for this period.
          </p>
        </div>
        <div className={styles.hpHeadRight}>
          <span className={styles.periodStatus} data-status={periodState} title={PERIOD_STATE_HELP[periodState]}>
            {PERIOD_STATE_LABEL[periodState]}
          </span>
          {/* The same gear the Leads, Jobs, Schedule and Clients pages use, so
              it's a control that's already learned. */}
          <ViewGear
            views={CREW_VIEW_OPTIONS}
            activeView={layout}
            onPickView={pickView}
            skins={CREW_SKIN_OPTIONS}
            activeSkin={skin}
            onPickSkin={pickSkin}
            label="View"
          />
        </div>
      </div>

      {owedLeadsHere ? owedStrip : null}

      {/* ONE period picker.
          There were four: two arrows, a row of length pills, four quick-filter
          shortcuts (This week / Last week / This month / Last month) and a
          from/to form with its own Go button. Every one of them answered the
          same question — which range am I looking at — and between them they
          could disagree: "This month" left the pills saying Weekly, the arrows
          then stepped a week from a month, and the quick row highlighted
          nothing. Four controls, one question, so: step back, what you're
          looking at, step forward, come back to now, how long a period is, and
          jump to any date. */}
      <div className={styles.periodBar}>
        <div className={styles.periodNav}>
          <Link href={periodHref({ offset: String(period.offset - 1), from: null, to: null })} className={styles.periodArrow} aria-label="Previous pay period">
            ←
          </Link>
          <div className={styles.periodLabel}>
            <strong>{period.label}</strong>
            <small>{period.rangeLabel}</small>
          </div>
          <Link href={periodHref({ offset: String(period.offset + 1), from: null, to: null })} className={styles.periodArrow} aria-label="Next pay period">
            →
          </Link>
        </div>

        <div className={styles.periodModes}>
          {/* Only offered when it would do something. A "Current period" button
              that is already the current period is a button that teaches you it
              does nothing. */}
          {period.offset !== 0 || period.mode === 'custom' ? (
            <Link href={periodHref({ offset: '0', period: settings.periodMode, from: null, to: null })} className={styles.periodMode}>
              Current period
            </Link>
          ) : (
            <span className={`${styles.periodMode} ${styles.periodModeOn}`}>Current period</span>
          )}

          <label className={styles.filter}>
            <span>Length</span>
            <select
              value={period.mode}
              onChange={(event) => {
                const mode = event.target.value as PeriodMode;
                // Changing the LENGTH keeps the date you were looking at, rather
                // than snapping to today: switching Weekly → Monthly while
                // reviewing March has to land on March, and offsetForDate is
                // what makes that possible.
                if (mode === 'custom') {
                  router.push(periodHref({ period: 'custom', from: period.startIso.slice(0, 10), to: periodEndKey(period), offset: '0' }));
                  return;
                }
                router.push(
                  periodHref({
                    period: mode,
                    offset: String(offsetForDate(mode, period.startIso.slice(0, 10))),
                    from: null,
                    to: null,
                  }),
                );
              }}
              aria-label="Pay-period length"
            >
              {PERIOD_MODES.map((mode) => (
                <option key={mode.id} value={mode.id}>{mode.label}</option>
              ))}
            </select>
          </label>

          {period.mode === 'custom' ? (
            // A custom range is the one shape a single date can't express, so
            // it keeps two inputs — but no Go button: the range applies as soon
            // as both ends are set, the same way every other control here does.
            <span className={styles.customRange}>
              <input
                type="date"
                aria-label="Range start"
                defaultValue={period.startIso.slice(0, 10)}
                onChange={(event) => event.target.value && router.push(periodHref({ period: 'custom', from: event.target.value, to: periodEndKey(period) }))}
              />
              <span aria-hidden="true">→</span>
              <input
                type="date"
                aria-label="Range end"
                defaultValue={periodEndKey(period)}
                onChange={(event) => event.target.value && router.push(periodHref({ period: 'custom', from: period.startIso.slice(0, 10), to: event.target.value }))}
              />
            </span>
          ) : (
            <label className={styles.filter}>
              <span>Jump to</span>
              <input
                type="date"
                aria-label="Jump to the pay period containing a date"
                value=""
                onChange={(event) => {
                  if (!event.target.value) return;
                  router.push(periodHref({ offset: String(offsetForDate(period.mode, event.target.value)), from: null, to: null }));
                }}
              />
            </label>
          )}

          {filteredName ? (
            <Link href={periodHref({ crew: null })} className={styles.crewFilterChip}>
              Showing {filteredName} only ✕
            </Link>
          ) : null}
        </div>
      </div>

      {toast ? (
        <div className={styles.toast} data-ok={toast.ok || undefined} role="status" aria-live="polite">
          <div>
            <strong>{toast.message}</strong>
            {toast.detail?.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
          <div className={styles.toastActions}>
            {toast.ok && payAvailable ? (
              <button type="button" className="linklike" onClick={() => setDrawer({ mode: 'history' })}>
                View history
              </button>
            ) : null}
            <button type="button" className={styles.toastClose} onClick={() => setToast(null)} aria-label="Dismiss">
              ✕
            </button>
          </div>
        </div>
      ) : null}

      {owedLeadsHere ? null : owedStrip}

      {/* --- the pay period, and the one thing to do with it --- */}
      <section className={styles.periodCard} data-view={layout} aria-label="Pay period summary">
        <div className={styles.periodCardMain}>
          <div className={styles.periodCardHead}>
            <small>Pay period</small>
            <strong>{period.rangeLabel}</strong>
            <span className={styles.periodStatus} data-status={periodState} title={PERIOD_STATE_HELP[periodState]}>
              {PERIOD_STATE_LABEL[periodState]}
            </span>
          </div>
          <div className={styles.periodProgress}>
            <div className={styles.periodProgressBar} role="presentation">
              <span style={{ width: `${Math.round((progress.daysDone / progress.daysTotal) * 100)}%` }} />
            </div>
            <small>
              {period.open
                ? `${progress.daysLeft} ${progress.daysLeft === 1 ? 'day' : 'days'} left in this pay period`
                : 'This pay period has ended'}{' '}
              ({progress.daysDone} of {progress.daysTotal} days)
            </small>
          </div>

          {/* The half of the question the screen could never answer. */}
          {payDue ? (
            <p className={styles.payDue} data-tone={payDue.tone}>
              <span aria-hidden="true">◷</span>
              <strong>{payDue.label}</strong>
              {payDay && !payDay.chosen ? (
                // Said out loud: an assumed pay day driving an "overdue" badge
                // would be the app inventing a deadline the owner never set.
                <button type="button" className="linklike" onClick={() => setSettingsOpen(true)}>
                  Assuming {payDaySentence(payDay).charAt(0).toLowerCase() + payDaySentence(payDay).slice(1)} — set your pay day
                </button>
              ) : null}
            </p>
          ) : null}
        </div>

        {/* Every number is a filter. A "4" you can't act on is trivia.
            And a filter you can't SEE is worse than trivia: these cards changed
            the table underneath them and then looked exactly as they had a
            moment before, so the only evidence of a filter was a shorter list —
            which reads as missing data. Each card now says whether it is the one
            currently applied, in the ring and to a screen reader, and pressing
            the applied one again clears it. */}
        <div className={styles.periodStats}>
          {STAT_CARDS.map((stat) => {
            const figure = stat.figure(totals, rows);
            // A readout is a number, not a control. Two of these cards never had
            // a filter worth applying — "Crew members" filtered to everyone,
            // which is what you were already looking at — and a button that does
            // nothing is how you learn to stop pressing the ones that do.
            if (!stat.filter) {
              return (
                <div key={stat.id} className={styles.periodStat} data-tone={stat.tone?.(totals)} title={stat.help}>
                  <small>{stat.label}</small>
                  <strong>{figure.value}</strong>
                  {figure.note ? <em>{figure.note}</em> : null}
                </div>
              );
            }
            const on = sameFilter(stat.filter, currentFilter);
            return (
              <button
                key={stat.id}
                type="button"
                className={styles.periodStat}
                data-tone={stat.tone?.(totals)}
                data-on={on || undefined}
                aria-pressed={on}
                // The selected ring is inline because it has to beat the
                // per-tone background rules, which are more specific than any
                // class this file is allowed to add.
                style={on ? { boxShadow: 'inset 0 0 0 2px var(--accent)' } : undefined}
                title={on ? `Showing ${stat.label.toLowerCase()} only — press again to show everyone` : stat.help}
                onClick={() => applyFilter(on ? ALL_FILTER : stat.filter!)}
              >
                <small>{stat.label}</small>
                <strong>{figure.value}</strong>
                {figure.note ? <em>{figure.note}</em> : null}
              </button>
            );
          })}
        </div>

        {/* One primary action. What it is depends entirely on where the period
            has got to — never two equally loud buttons to choose between. */}
        {/* Focus moves this into the rail, where it stays in view while you
            scroll the crew. Leaving a copy here as well would be two equally
            loud buttons for one decision. */}
        {payAvailable && primaryAction && layout !== 'focus' ? (
          <div className={styles.periodActions}>
            {primaryActionButton}
            <small>{primaryAction.help}</small>
          </div>
        ) : null}
      </section>

      {/* Grouped opens with the shape of the period rather than the list: what
          it comes to, how that compares with last time, where it sits by
          payment status, and which days the hours landed on. */}
      {layout === 'grouped' ? (
        <div className={styles.groupTopRow}>
          <div className={styles.compareCard}>
            <small>Total est. pay</small>
            <strong>{payMoney(totals.estimatedPay)}</strong>
            {comparison ? (
              <em
                className={styles.compareDelta}
                data-dir={comparison.deltaPercent === null ? 'flat' : comparison.deltaPercent >= 0 ? 'up' : 'down'}
              >
                {comparison.label}
              </em>
            ) : null}
            <span className={styles.compareWas}>{previousPayLabel} last period</span>
          </div>

          <div className={styles.breakdownCard}>
            <small>Pay status breakdown</small>
            <PayDonut totals={totals} onSlice={(payment) => applyFilter({ payment, status: 'all', flagged: false })} />
          </div>

          <HoursChart current={hoursThisPeriod} previous={hoursLastPeriod} />

          <div className={styles.countsCard}>
            <small>Status counts</small>
            <ul>
              <li>
                <button type="button" onClick={() => applyFilter({ status: 'needs_review', payment: 'all', flagged: false })}>
                  <span data-tone="alert" />Needs review<b>{groups.needs_review.length}</b>
                </button>
              </li>
              <li>
                <button type="button" onClick={() => applyFilter({ status: 'all', payment: 'unpaid', flagged: false })}>
                  <span data-tone="warn" />Unpaid<b>{groups.unpaid.length}</b>
                </button>
              </li>
              <li>
                <button type="button" onClick={() => applyFilter({ status: 'all', payment: 'paid', flagged: false })}>
                  <span data-tone="ok" />Paid<b>{groups.paid.length}</b>
                </button>
              </li>
              <li>
                <button type="button" onClick={() => applyFilter({ status: 'all', payment: 'all', flagged: false })}>
                  <span data-tone="muted" />No hours<b>{groups.no_hours.length}</b>
                </button>
              </li>
            </ul>
            <p>
              Total crew members <b>{totals.crewCount}</b>
            </p>
          </div>
        </div>
      ) : null}

      {!payAvailable ? (
        <p className={styles.exportBlocked}>
          Approval and payment tracking are off until the crew-pay migration has been run on this database. Hours, totals and the
          export below all still work.
        </p>
      ) : null}

      {/* The states worth saying out loud rather than leaving to be inferred
          from six numbers and a badge. */}
      {periodState === 'paid' && latestPayment ? (
        <div className={styles.reviewBanner} data-tone="ok">
          <div>
            <strong>This pay period was marked paid on {dayLabel(latestPayment.row.record?.paymentDate ?? null)}</strong>
            <span>
              {totals.paid} {totals.paid === 1 ? 'crew member' : 'crew members'} · {payMoney(totals.paidPay)} recorded.
            </span>
          </div>
          <button type="button" className="btn secondary" onClick={() => setDrawer({ mode: 'history' })}>
            View payment record
          </button>
        </div>
      ) : periodState === 'partially-paid' ? (
        <div className={styles.reviewBanner}>
          <div>
            <strong>
              {totals.paid} of {totals.crewCount} crew members {totals.paid === 1 ? 'has' : 'have'} been marked paid
            </strong>
            <span>{payMoney(totals.unpaidPay)} is still outstanding for this period.</span>
          </div>
          <button type="button" className="btn secondary" onClick={() => applyFilter({ payment: 'unpaid', status: 'all', flagged: false })}>
            View unpaid crew
          </button>
        </div>
      ) : totals.needsReview > 0 ? (
        <div className={styles.reviewBanner}>
          <div>
            <strong>
              {totals.needsReview} {totals.needsReview === 1 ? 'entry needs' : 'entries need'} attention before this period can be
              approved
            </strong>
            <span>Hours with no rate, or entries with no hours on them, don&apos;t add up to a payable total.</span>
          </div>
          <button type="button" className="btn secondary" onClick={() => applyFilter({ status: 'needs_review', payment: 'all', flagged: false })}>
            Review entries
          </button>
        </div>
      ) : null}

      {overlaps.length > 0 ? (
        <div className={styles.reviewBanner} data-tone="alert">
          <div>
            <strong>Some of these days have already been paid in another period</strong>
            <span>
              {overlaps.map((overlap) => `${overlap.rangeLabel} (${overlap.paidCount} paid)`).join(', ')}. Paying this range too would
              pay the same hours twice.
            </span>
          </div>
        </div>
      ) : null}

      {periodClosedAt ? (
        <div className={styles.reviewBanner}>
          <div>
            <strong>This pay period is closed</strong>
            <span>Closed {stamp(periodClosedAt)}. Reopen it if something has to change — it stays in the history either way.</span>
          </div>
          <button type="button" className="btn secondary" onClick={() => setDialog({ kind: 'reopen' })}>
            Reopen period
          </button>
        </div>
      ) : periodReopenReason ? (
        <div className={styles.reviewBanner}>
          <div>
            <strong>This period was reopened</strong>
            <span>{periodReopenReason}</span>
          </div>
        </div>
      ) : null}

      {/* Who's on the clock right now. Above everything else on purpose: an
          open shift is still accruing, so it's the only thing on this screen
          that gets worse while you look at it. */}
      {openShifts.length > 0 ? (
        <div className={styles.shiftBanner} data-flagged={openShifts.some((shift) => shift.flag) || undefined}>
          <div className={styles.shiftHead}>
            <strong>{openShifts.length} {openShifts.length === 1 ? 'shift is' : 'shifts are'} still running</strong>
            <span>Open shifts aren&apos;t in the totals below until they&apos;re closed.</span>
          </div>
          <ul className={styles.shiftList}>
            {openShifts.map((shift) => (
              <li key={shift.id}>
                <span className={styles.shiftWho}>
                  <strong>{shift.crewName}</strong>
                  <small>{shift.jobLabel}</small>
                </span>
                <span className={styles.shiftTime}>
                  <strong>{shift.elapsedLabel}</strong>
                  <small>since {shift.startedLabel}</small>
                </span>
                {shift.geofenceLabel ? (
                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: shift.geofenceStatus === 'verified_on_site' ? '#dcfce7' : '#fef3c7',
                    color: shift.geofenceStatus === 'verified_on_site' ? '#15803d' : '#b45309',
                    whiteSpace: 'nowrap',
                  }}>
                    {shift.geofenceLabel}
                  </span>
                ) : null}
                {shift.flag ? (
                  <span className={styles.shiftFlag} data-level={shift.flag} title={shift.flagHelp ?? undefined}>
                    {shift.flagLabel}
                  </span>
                ) : (
                  <span />
                )}
                <form action={closeOpenShiftAction.bind(null, shift.id)} className={styles.shiftClose}>
                  <label>
                    <span className="sr-only">End time for {shift.crewName}</span>
                    <input type="datetime-local" name="endedAt" defaultValue={shift.defaultEnd} max={shift.defaultEnd} required />
                  </label>
                  <SaveButton className={styles.quietBtnSm} pendingLabel="Closing…" savedLabel="Closed ✓">
                    Close shift
                  </SaveButton>
                </form>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {rows.length === 0 ? (
        // NOT A DEAD END. This branch replaces the entire layout — table, toolbar
        // and the rail that carries every setting on this tab — so whatever is
        // not said here is not reachable at all until somebody logs an hour.
        // It used to offer two buttons and nothing else, which meant the way to
        // change how hours get logged disappeared exactly when you had none.
        <div className={styles.empty}>
          <h3>No crew hours have been logged for {period.rangeLabel}</h3>
          <p>
            Hours logged through the field app or added to a job appear here. This is one pay period — earlier
            hours are still on the account, under the period picker above.
          </p>
          <div className={styles.emptyActions}>
            <button type="button" className="btn primary" onClick={() => setAddOpen(true)}>Add labor manually</button>
            <Link href="/dashboard/crew?tab=people" className="btn secondary">Invite crew to the field app</Link>
          </div>
          <p className={styles.emptyNote}>
            {timeClockMode === 'off'
              ? 'Crew type their hours when the work is done. '
              : `Crew ${timeClockMode === 'required' ? 'must clock' : 'can clock'} in and out from the job in the field app. `}
            <Link href="/dashboard/crew?tab=hours#time-clock">
              {timeClockMode === 'off' ? 'Turn on the time clock' : 'Change the time clock'}
            </Link>
            {' · '}
            <button type="button" className="linklike" onClick={() => setSettingsOpen((value) => !value)}>
              Labor settings
            </button>
          </p>
        </div>
      ) : (
        <div className={styles.payLayout} data-view={layout}>
          <div className={styles.payMain}>
            {/* --- toolbar --- */}
            <div className={styles.payToolbar}>
              <div className={styles.search}>
                <span aria-hidden="true">⌕</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Search crew by name, role, or job…"
                  aria-label="Search crew"
                />
              </div>
              <label className={styles.filter}>
                <span>Status</span>
                <select value={statusFilter} onChange={(event) => applyFilter({ status: event.target.value as StatusFilter })}>
                  <option value="all">All</option>
                  <option value="needs_review">Needs review</option>
                  <option value="draft">Not approved</option>
                  <option value="approved">Approved</option>
                </select>
              </label>
              <label className={styles.filter}>
                <span>Payment</span>
                <select value={paymentFilter} onChange={(event) => applyFilter({ payment: event.target.value as PaymentFilter })}>
                  <option value="all">All</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="sent">Sent to payroll</option>
                  <option value="paid">Paid</option>
                </select>
              </label>
              <label className={styles.filterCheck}>
                <input type="checkbox" checked={flaggedOnly} onChange={(event) => applyFilter({ flagged: event.target.checked })} />
                <span>Flagged only</span>
              </label>
              {/* WHAT THIS FILE CONTAINS, on the button. "Export CSV" gave no
                  clue whether it was the whole period or the seven rows left
                  after a filter — and it is the latter, which is a difference
                  worth several thousand dollars in a file somebody pays from. */}
              <button
                type="button"
                className="btn ghost"
                onClick={() => download()}
                disabled={visible.length === 0}
                title={`Downloads the ${visible.length} ${visible.length === 1 ? 'crew member' : 'crew members'} shown here, with the filters and search you have applied — not the whole period. Includes approval and payment status.`}
              >
                Export {visible.length} shown{visible.length === rows.length ? '' : ` of ${rows.length}`}
              </button>
              <button type="button" className="btn secondary" onClick={prepareForPayroll} disabled={rows.length === 0}>
                Send to {PAYROLL_PROVIDER_LABEL[payrollProvider] === 'A spreadsheet (any provider, or a bookkeeper)' ? 'payroll' : PAYROLL_PROVIDER_LABEL[payrollProvider]}
              </button>
            </div>

            {exportBlocked ? <p className={styles.exportBlocked}>Heads up: {exportBlocked}</p> : null}

            {/* The payroll file, described before it is downloaded: provider,
                who is in it, which period, what it comes to, and everything
                that would break the import — then the button. */}
            {exportPlan ? (
              <div className={styles.exportReport} role="status">
                <strong>
                  {exportPlan.result.included === 0
                    ? 'Nothing to send to payroll yet'
                    : exportPlan.confirmed
                      ? `${exportPlan.result.filename} downloaded — ${exportPlan.result.included} ${exportPlan.result.included === 1 ? 'row' : 'rows'}`
                      : `Ready to send ${exportPlan.result.included} ${exportPlan.result.included === 1 ? 'crew member' : 'crew members'} to ${PAYROLL_PROVIDER_LABEL[exportPlan.result.provider]}`}
                </strong>
                {exportPlan.result.included > 0 ? (
                  <dl className={styles.railList}>
                    <div>
                      <dt>Pay period</dt>
                      <dd>{period.rangeLabel}</dd>
                    </div>
                    <div>
                      <dt>People</dt>
                      <dd>{exportPlan.names.join(', ')}</dd>
                    </div>
                    <div>
                      <dt>Total in the file</dt>
                      <dd>{payMoney(exportPlan.amount)}</dd>
                    </div>
                    <div>
                      <dt>File</dt>
                      <dd>{exportPlan.result.filename}</dd>
                    </div>
                  </dl>
                ) : null}
                {exportPlan.result.problems.map((problem) => (
                  <p key={problem} className={styles.exportProblem}>{problem}</p>
                ))}
                {exportPlan.result.excluded.length > 0 ? (
                  <details>
                    <summary>{exportPlan.result.excluded.length} not in the file</summary>
                    <ul>
                      {exportPlan.result.excluded.map((item) => (
                        <li key={`${item.name}-${item.reason}`}><b>{item.name}</b> — {item.reason}</li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                {exportPlan.result.notes.map((note) => (
                  <p key={note} className={styles.exportNote}>{note}</p>
                ))}
                {exportPlan.result.included > 0 && !exportPlan.confirmed ? (
                  <button type="button" className="btn primary" onClick={confirmPayrollExport}>
                    Download this file
                  </button>
                ) : null}
                <button type="button" className="btn ghost" onClick={() => setExportPlan(null)}>
                  {exportPlan.confirmed || exportPlan.result.included === 0 ? 'Dismiss' : 'Cancel'}
                </button>
              </div>
            ) : null}

            {/* --- bulk actions --- */}
            {selected.length > 0 ? (
              <div className={styles.bulkBar} role="region" aria-label="Bulk actions">
                <span className={styles.bulkCount}>
                  <strong>{selected.length} selected</strong>
                  <small>Total: {payMoney(selectedTotal)}</small>
                </span>
                <div className={styles.bulkActions}>
                  <button type="button" className="btn primary" onClick={() => setDialog({ kind: 'pay', ids: selected })} disabled={!payAvailable}>
                    Mark selected as paid
                  </button>
                  <button type="button" className="btn secondary" disabled={busy('approve')} onClick={() => arm({ kind: 'approve', crewIds: selected })}>
                    {busy('approve') ? 'Approving…' : 'Approve selected'}
                  </button>
                  <button type="button" className="btn secondary" onClick={() => download(selectedRows)}>
                    Export selected
                  </button>
                  <button type="button" className="btn ghost" onClick={() => setSelected([])}>
                    Clear
                  </button>
                </div>
              </div>
            ) : null}

            {layout === 'grouped' ? (
              <GroupedCrew
                rows={visible}
                collapsed={collapsed}
                onToggleGroup={(id) =>
                  setCollapsed((current) => {
                    const next = new Set(current);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
                selected={selected}
                onToggleSelect={toggle}
                onOpenCrew={(crewId) => setDrawer({ mode: 'crew', crewId })}
                onPayGroup={(ids) => setDialog({ kind: 'pay', ids })}
                onApproveGroup={(ids) => arm({ kind: 'approve', crewIds: ids })}
                onFilter={applyFilter}
                onHistory={() => setDrawer({ mode: 'history' })}
                payAvailable={payAvailable}
              />
            ) : null}

            {/* --- the crew --- */}
            {layout === 'focus' ? (
              <PayMasterDetail
                rows={visible}
                groups={groupCrewRows(visible)}
                selectedKey={detailKey}
                onSelect={setDetailKey}
                keyOf={rowKey}
                jobLookup={jobLookup}
                jobsByCrew={jobsByCrew}
                events={events}
                payAvailable={payAvailable}
                approving={busy('approve')}
                onApprove={(crewIds) => arm({ kind: 'approve', crewIds })}
                onPay={(ids) => setDialog({ kind: 'pay', ids })}
                onOpenProfile={(key) => setDrawer({ mode: 'crew', crewId: key })}
                onHistory={() => setDrawer({ mode: 'history' })}
                periodLabel={period.rangeLabel}
                approvedLines={approvedLines}
                periodActionTitle={
                  primaryAction?.id === 'pay' || primaryAction?.id === 'finish' ? 'Pay this period' : primaryAction?.label ?? null
                }
                periodAction={primaryActionButton}
                periodActionHelp={periodPayBlocked ?? primaryAction?.help ?? null}
                periodActionTone={
                  primaryAction?.id === 'approve' || primaryAction?.id === 'pay' || primaryAction?.id === 'finish' ? 'go' : 'todo'
                }
              />
            ) : null}

            {layout === 'overview' ? (
              <OverviewBoard items={overviewItems} listLabel="Crew members" empty="No crew members match those filters." />
            ) : null}

            {/* payWrap as well as tableWrap: this is the ONE wrapper whose
                table flattens into cards below 900px, and the rule that takes
                the scroll box away down there is keyed on it. The roster, the
                labor tables and the entries table never flatten, so they keep
                theirs — without this they lost it too, and a 704px table in a
                390px page scrolled the whole document sideways. */}
            <div className={`${styles.tableWrap} ${styles.payWrap}`} hidden={layout !== 'table' && layout !== 'rail'}>
              <table className={styles.payTable}>
                <thead>
                  <tr>
                    <th className={styles.checkCell}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        disabled={selectable.length === 0}
                        aria-label={allSelected ? 'Clear selection' : `Select all ${selectable.length} payable crew members`}
                      />
                    </th>
                    <SortHeader label="Crew member" sortKey="name" sort={sort} onSort={setSort} />
                    <SortHeader label="Status" sortKey="review" sort={sort} onSort={setSort} />
                    <th>Current / next job</th>
                    {showTodayColumn ? <th className={styles.num}>Hours today</th> : null}
                    <SortHeader label="Hours this period" sortKey="hours" sort={sort} onSort={setSort} numeric />
                    <SortHeader label="Est. pay" sortKey="pay" sort={sort} onSort={setSort} numeric />
                    <SortHeader label="Payment" sortKey="payment" sort={sort} onSort={setSort} />
                    <th>Payment date</th>
                    <th className={styles.actionsCell}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((row) => {
                    const id = rowKey(row);
                    const jobs = row.crewId ? jobsByCrew[row.crewId] ?? [] : [];
                    const canSelect = row.eligible && row.hours > 0 && row.payment !== 'paid';
                    const flags = row.warnings.filter((warning) => PAY_WARNING_SEVERITY[warning] !== 'info');
                    // Only when it says something a single "$30.00/hr" beside
                    // their name doesn't already say.
                    const rateNote =
                      row.payType === 'hourly' && (row.rateVaries || row.entries.some((entry) => entry.rate <= 0))
                        ? rateBreakdownLabel(row.entries)
                        : null;
                    return (
                      <tr key={id} className={styles.payRow} data-selected={selected.includes(id) || undefined} data-paid={row.payment === 'paid' || undefined}>
                        <td className={styles.checkCell}>
                          <input
                            type="checkbox"
                            checked={selected.includes(id)}
                            onChange={() => toggle(id)}
                            disabled={!canSelect}
                            aria-label={
                              canSelect
                                ? `Select ${row.name}`
                                : row.payment === 'paid'
                                  ? `${row.name} is already marked paid`
                                  : (row.ineligibleReason ?? `${row.name} has no hours in this period`)
                            }
                            title={canSelect ? undefined : row.payment === 'paid' ? 'Already marked paid for this period.' : row.ineligibleReason ?? 'No hours in this period.'}
                          />
                        </td>
                        <td>
                          <button type="button" className={styles.whoBtn} onClick={() => row.crewId && setDrawer({ mode: 'crew', crewId: row.crewId })}>
                            <span className={styles.miniAvatar} data-avatar-tone={avatarTone(row.name)} aria-hidden="true">
                              {row.name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?'}
                            </span>
                            <span className={styles.whoNames}>
                              <strong>{row.name}</strong>
                              <small>
                                {row.roleLabel ?? 'Crew'}
                                {/* row.rate is the rate their HOURS were logged
                                    at, which for a salaried person is a derived
                                    costing figure nobody typed. Say how they're
                                    actually paid instead. */}
                                {row.payType !== 'hourly'
                                  ? ` · ${PAY_TYPE_LABEL[row.payType]}`
                                  : row.rate
                                    ? ` · ${payMoney(row.rate)}/hr`
                                    : row.rateVaries
                                      ? ' · rates vary'
                                      : ''}
                              </small>
                            </span>
                          </button>
                        </td>
                        <td data-label="Status">
                          <span className={styles.payBadge} data-state={row.review} title={PAY_STATUS_HELP[row.status]}>
                            {PAY_STATUS_LABEL[row.review === 'approved' ? 'approved' : row.status]}
                          </span>
                          {flags.length > 0 ? (
                            <span className={styles.flagChips}>
                              {/* The chip is the way IN to the entries it is
                                  about. It used to be a dead span: "Missing
                                  rate" with no way to find out which entry, on
                                  a row whose total was plainly not zero. */}
                              {flags.map((warning) => (
                                <button
                                  key={warning}
                                  type="button"
                                  className={styles.flagChip}
                                  data-severity={PAY_WARNING_SEVERITY[warning]}
                                  title={`${PAY_WARNING_HELP[warning]} ${PAY_WARNING_FIX[warning]}`}
                                  onClick={() => row.crewId && setDrawer({ mode: 'crew', crewId: row.crewId })}
                                >
                                  {payWarningChip(warning, row.entries)}
                                </button>
                              ))}
                            </span>
                          ) : null}
                        </td>
                        <td className={styles.jobCell} data-label="Current / next job">
                          {jobs.length > 0 ? (
                            <>
                              <span className={styles.jobRef}>{jobs[0].ref}</span>
                              <small>{jobs[0].clientName}{jobs.length > 1 ? ` +${jobs.length - 1}` : ''}</small>
                            </>
                          ) : (
                            <span className={styles.dim}>—</span>
                          )}
                        </td>
                        {showTodayColumn ? (
                          <td className={styles.num} data-label="Hours today">
                            {row.crewId && hoursToday[row.crewId] ? hoursLabel(hoursToday[row.crewId]) : <span className={styles.dim}>0h 00m</span>}
                          </td>
                        ) : null}
                        <td className={styles.num} data-label="Hours this period">
                          {/* An em dash, not "0h 00m", when nothing was ever
                              recorded — see rowHoursLabel. The row that read
                              "0h 00m … $960.00" was two different facts printed
                              as one contradiction. */}
                          <strong title={row.hours <= 0 && row.issues.includes('incomplete-time') ? 'No hours were ever recorded on these entries. The amount beside them was recorded directly.' : undefined}>
                            {rowHoursLabel(row)}
                          </strong>
                          {/* Hours past the threshold are still worth knowing
                              about for a salaried person — it's just not money.
                              "over" says the fact without implying a rate, and
                              the tooltip says it in full for the hourly case
                              too, where "OT" is most likely to be read as pay. */}
                          {row.overtimeHours > 0 ? (
                            <small className={styles.otCell} title={OVERTIME_POLICY}>
                              {row.overtimePaid ? `${hoursLabel(row.overtimeHours)} OT (hours only)` : `+${hoursLabel(row.overtimeHours)} over`}
                            </small>
                          ) : null}
                        </td>
                        <td className={`${styles.num} ${styles.payCell}`} data-label="Estimated pay">
                          <strong>{payMoney(row.estimatedPay)}</strong>
                          {row.payType !== 'hourly' ? <small className={styles.dim}>{row.payBasis}</small> : null}
                          {/* THE EFFECTIVE RATE, shown wherever it isn't a single
                              obvious number. The rate on an entry is snapshotted
                              when it is logged, so a profile that says $30/hour
                              and an entry that went in at $0 are both true — and
                              without this line the screen shows a rate warning
                              beside a total that is clearly not zero and offers
                              no way to reconcile them. */}
                          {rateNote ? (
                            <small className={styles.dim} title="The rate used on each entry is the one it was logged at, not the rate on the crew member’s profile today.">
                              {rateNote}
                            </small>
                          ) : null}
                          {row.adjustment !== 0 ? (
                            <small
                              className={styles.adjust}
                              title={
                                row.payment === 'paid'
                                  ? `Paid ${payMoney(row.paidAmount ?? 0)}. The hours have changed since, and the difference is unpaid.`
                                  : `Approved at ${payMoney(row.approvedAmount ?? 0)}. The hours have changed since.`
                              }
                            >
                              {row.adjustment > 0 ? '+' : '−'}
                              {payMoney(Math.abs(row.adjustment))} since {row.payment === 'paid' ? 'payment' : 'approval'}
                            </small>
                          ) : null}
                        </td>
                        <td data-label="Payment">
                          <span className={styles.payBadge} data-payment={row.payment}>
                            {PAYMENT_STATE_LABEL[row.payment]}
                          </span>
                          {row.paymentDetail ? <small className={styles.paySub}>{row.paymentDetail}</small> : null}
                          {/* How long they have been waiting. "Unpaid" with no
                              age reads the same on day one and week three. */}
                          {row.payment !== 'paid' && row.hours > 0 && waiting ? (
                            <small className={styles.paySub} data-late={waitingDays >= 7 || undefined}>{waiting}</small>
                          ) : null}
                          {row.locked ? (
                            <small className={styles.paySub} title="Paid entries lock so a stray edit can't move money that has gone out.">
                              🔒 Locked
                            </small>
                          ) : null}
                        </td>
                        <td className={styles.num} data-label="Payment date">{row.record?.paymentDate ? dayLabel(row.record.paymentDate) : <span className={styles.dim}>—</span>}</td>
                        <td className={styles.actionsCell}>
                          <div className={styles.menuWrap} ref={menuFor === id ? menuRef : null}>
                            <button
                              type="button"
                              className={styles.rowBtn}
                              aria-haspopup="menu"
                              aria-expanded={menuFor === id}
                              aria-controls={menuFor === id ? `hours-row-menu-${id}` : undefined}
                              aria-label={`Actions for ${row.name}`}
                              onClick={() => setMenuFor(menuFor === id ? null : id)}
                            >
                              ⋯
                            </button>
                            {menuFor === id ? (
                              <div id={`hours-row-menu-${id}`} className={styles.menu} role="menu">
                                <button type="button" role="menuitem" onClick={() => row.crewId && setDrawer({ mode: 'crew', crewId: row.crewId })}>
                                  View hours &amp; entries
                                </button>
                                {/* canApproveRow lets an approved row through
                                    when its hours have changed since — the only
                                    route back to an agreed figure, because there
                                    is no undo-approval action anywhere. */}
                                {payAvailable && canApproveRow(row) ? (
                                  <button type="button" role="menuitem" onClick={() => arm({ kind: 'approve', crewIds: [id] })}>
                                    {approveActionLabel(row)}
                                  </button>
                                ) : null}
                                {payAvailable && row.review === 'approved' && row.payment !== 'paid' ? (
                                  <button type="button" role="menuitem" onClick={() => setDialog({ kind: 'pay', ids: [id] })}>
                                    Mark paid
                                  </button>
                                ) : null}
                                {payAvailable && row.review === 'approved' && row.payment === 'unpaid' ? (
                                  <button type="button" role="menuitem" onClick={() => arm({ kind: 'sent', crewIds: [id] })}>
                                    Mark as sent to payroll
                                  </button>
                                ) : null}
                                {row.crewId ? (
                                  <Link href="/dashboard/crew?tab=people" role="menuitem">
                                    Open crew member
                                  </Link>
                                ) : null}
                                {payAvailable && row.payment === 'paid' ? (
                                  <div className={styles.menuDanger}>
                                    <button type="button" role="menuitem" onClick={() => setDialog({ kind: 'undo', crewId: row.crewId as string, name: row.name })}>
                                      Undo paid status
                                    </button>
                                    {row.locked ? (
                                      <button type="button" role="menuitem" onClick={() => setDialog({ kind: 'unlock', crewId: row.crewId as string, name: row.name })}>
                                        Unlock entry
                                      </button>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {paged.length === 0 ? (
                    <tr>
                      <td colSpan={showTodayColumn ? 10 : 9} className={styles.tableEmpty}>
                        Nothing matches those filters.{' '}
                        <button type="button" className="linklike" onClick={() => { applyFilter({ status: 'all', payment: 'all', flagged: false }); setQuery(''); }}>
                          Clear filters
                        </button>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {/* Master-detail pages nothing — the left list is the whole filtered
                crew, because paging a list you are stepping through one at a
                time would hide the person you were about to click. */}
            {(layout === 'table' || layout === 'rail') && visible.length > pageSize ? (
              <div className={styles.pager}>
                <small>
                  Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, visible.length)} of {visible.length} crew members
                </small>
                <div className={styles.pagerBtns}>
                  <button type="button" onClick={() => setPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} aria-label="Previous page">
                    ‹
                  </button>
                  {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
                    <button
                      key={number}
                      type="button"
                      onClick={() => setPage(number)}
                      aria-current={number === currentPage ? 'page' : undefined}
                      data-on={number === currentPage || undefined}
                    >
                      {number}
                    </button>
                  ))}
                  <button type="button" onClick={() => setPage(Math.min(pageCount, currentPage + 1))} disabled={currentPage === pageCount} aria-label="Next page">
                    ›
                  </button>
                </div>
                <label className={styles.pagerSize}>
                  <span className="sr-only">Rows per page</span>
                  <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>
                    {[10, 25, 50, 100].map((size) => (
                      <option key={size} value={size}>{size} / page</option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}

            {/* The caveat that keeps "Paid" honest. In Focus it becomes the bar
                that closes the page, because that's the last thing you read
                before recording a payment. */}
            <p className={styles.hpNote} data-view={layout}>
              {layout === 'focus' ? <span className={styles.hpNoteMark} aria-hidden="true">i</span> : null}
              Estimated pay is each entry&apos;s hours × the rate it was logged at — the rate ON THE ENTRY, which is not always the
              rate on that person&apos;s profile today. {OVERTIME_POLICY} Periods are cut on when time was logged — a labor entry has
              no separate &ldquo;worked on&rdquo; date. Marking someone paid records that you paid them: no tax is calculated or
              withheld here and no money moves.
            </p>
          </div>

          {/* --- the rail ---
              Not rendered under Focus: master-detail carries its own, beside the
              person it is about, and two rails on one screen is two places to
              look for the same button. */}
          <aside className={styles.payRail} hidden={layout === 'focus' || layout === 'overview'}>

            <section className={styles.railCard}>
              <h3>Pay period summary</h3>
              <PayDonut totals={totals} onSlice={(payment) => applyFilter({ payment, status: 'all', flagged: false })} />
              <dl className={styles.railTotals}>
                <div>
                  <dt>Total</dt>
                  <dd>{payMoney(totals.estimatedPay)}</dd>
                </div>
              </dl>
            </section>

            {latestPayment ? (
              <section className={styles.railCard}>
                <h3>Payment details</h3>
                <dl className={styles.railList}>
                  <div>
                    <dt>Marked paid by</dt>
                    <dd>{latestPayment.row.record?.paidBy ?? 'Unknown'}</dd>
                  </div>
                  <div>
                    <dt>Payment date</dt>
                    <dd>{dayLabel(latestPayment.row.record?.paymentDate ?? null)}</dd>
                  </div>
                  <div>
                    <dt>Method</dt>
                    <dd>{latestPayment.row.record?.paymentMethod ? PAYMENT_METHOD_LABEL[latestPayment.row.record.paymentMethod] : 'Not recorded'}</dd>
                  </div>
                  {latestPayment.row.record?.paymentReference ? (
                    <div>
                      <dt>Reference</dt>
                      <dd>{latestPayment.row.record.paymentReference}</dd>
                    </div>
                  ) : null}
                  {latestPayment.row.record?.paymentNote ? (
                    <div>
                      <dt>Note</dt>
                      <dd>{latestPayment.row.record.paymentNote}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Covers</dt>
                    <dd>
                      {latestPayment.count} {latestPayment.count === 1 ? 'crew member' : 'crew members'} · {payMoney(latestPayment.total)}
                    </dd>
                  </div>
                </dl>
                <button type="button" className="btn secondary" onClick={() => setDrawer({ mode: 'history' })}>
                  View payment history
                </button>
              </section>
            ) : null}

            <section className={styles.railCard}>
              <h3>Quick actions</h3>
              <ul className={styles.railActions}>
                <li>
                  <button type="button" onClick={() => setAddOpen((value) => !value)}>Add labor manually</button>
                </li>
                <li>
                  <Link href="/dashboard/crew?tab=people">Invite crew to field app</Link>
                </li>
                <li>
                  <button type="button" onClick={() => download()}>Export hours &amp; pay</button>
                </li>
                <li>
                  <button type="button" onClick={() => setSettingsOpen((value) => !value)}>Labor settings</button>
                </li>
                {payAvailable && !periodClosedAt && !period.open && totals.needsReview === 0 ? (
                  <li>
                    <button type="button" disabled={busy('close')} onClick={() => arm({ kind: 'close' })}>
                      {busy('close') ? 'Closing…' : 'Close this pay period'}
                    </button>
                  </li>
                ) : null}
                {payAvailable ? (
                  <li>
                    <button type="button" onClick={() => setDrawer({ mode: 'history' })}>View period history</button>
                  </li>
                ) : null}
              </ul>
            </section>
          </aside>
        </div>
      )}

      {addOpen ? (
        <form action={addLaborEntryAction} className={styles.addLabor}>
          <label>
            <span>Crew member</span>
            <select name="crewId">
              <option value="">Unassigned</option>
              {crewOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Job</span>
            <select name="jobId" required>
              <option value="">Choose a job</option>
              {assignableJobs.map((job) => (
                <option key={job.id} value={job.id}>{job.ref} · {job.clientName}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Hours</span>
            <input name="hours" type="number" min="0.25" step="0.25" required placeholder="6.5" />
          </label>
          <label>
            <span>Rate ($/hr)</span>
            <input name="rate" type="number" min="0" step="0.01" placeholder="Their saved rate" />
          </label>
          <label className={styles.addLaborWide}>
            <span>Note</span>
            <input name="description" placeholder="Framing, second floor" />
          </label>
          <SaveButton className="btn primary" pendingLabel="Adding…" savedLabel="Added ✓">Add labor</SaveButton>
        </form>
      ) : null}

      {settingsOpen ? (
        <form action={saveLaborSettingsAction} className={styles.settings}>
          <p className={styles.settingsLead}>
            How this account counts hours. Most of these are saved to this browser — they change the totals on this screen and in the
            export, not the entries themselves. The pay day and the time clock are saved to the account, because the crew and the
            payday reminder both have to see the same answer.
          </p>
          {/* The setting that lets anything on this screen be early or late. */}
          {/* A control, not a preference: with it on, whoever approved cannot be
              the one who records the payment. Off by default because most of
              these businesses are one person. */}
          <label className={styles.settingCheck}>
            <input type="checkbox" name="requireSeparatePayer" defaultChecked={requireSeparatePayer} />
            <span>
              Someone other than the approver has to record the payment
              <em className={styles.settingHint}>
                Approving hours and paying for them are two different claims. On a one-person shop leave this off.
              </em>
            </span>
          </label>
          <label>
            <span>Pay day</span>
            <span className={styles.payDayRow}>
              <select name="payDelayDays" defaultValue={String(payDay?.delayDays ?? 5)}>
                {[0, 1, 2, 3, 4, 5, 6, 7, 10, 14].map((days) => (
                  <option key={days} value={days}>
                    {days === 0 ? 'The day it ends' : `${days} ${days === 1 ? 'day' : 'days'} after`}
                  </option>
                ))}
              </select>
              <select name="payWeekday" defaultValue={payDay?.weekday == null ? '' : String(payDay.weekday)}>
                <option value="">on whatever day that lands on</option>
                {WEEKDAY_NAMES.map((name, day) => (
                  <option key={name} value={day}>on the following {name}</option>
                ))}
              </select>
            </span>
            <em className={styles.settingHint}>
              {payDay
                ? `${payDaySentence(payDay)}.${payDay.chosen ? '' : ' Assumed until you set it — nothing is called late on a guess.'}`
                : 'When each pay period is due to be settled.'}
            </em>
          </label>
          {/* The time clock was a <select> here. It has its own card on Crew
              members now — this panel lives in the rail, and the rail is not
              rendered when no hours exist for the period, so the only control
              that turns the clock ON was unreachable until hours had already
              been logged without it. A pointer rather than a duplicate: two
              controls for one setting can disagree. */}
          <p className={styles.settingHint}>
            Clock in / clock out is under <Link href="/dashboard/crew?tab=hours#time-clock">Time clock</Link>
            {' — currently '}
            <strong>{TIME_CLOCK_MODES.find((mode) => mode.id === timeClockMode)?.label.toLowerCase()}</strong>.
          </p>
          <label>
            <span>Pay-period frequency</span>
            <select name="periodMode" defaultValue={settings.periodMode}>
              {PERIOD_MODES.filter((mode) => mode.id !== 'custom').map((mode) => (
                <option key={mode.id} value={mode.id}>{mode.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Overtime after (hours per week)</span>
            <input name="overtimeThreshold" type="number" min="1" max="168" step="0.5" defaultValue={settings.overtimeThreshold} />
          </label>
          <label>
            <span>Rounding</span>
            <select name="rounding" defaultValue={settings.rounding}>
              {Object.entries(ROUNDING_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Export format</span>
            <select name="exportFormat" defaultValue={settings.exportFormat}>
              {Object.entries(EXPORT_FORMAT_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Payroll provider</span>
            <select name="payrollProvider" defaultValue={payrollProvider}>
              {Object.entries(PAYROLL_PROVIDER_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <p className={styles.settingsNote}>
            The provider decides the shape of the file, not just its columns — salaried crew are left out of an hours
            import because your provider already pays them from the salary on file. Tax, deductions and benefits are
            never in it; that&apos;s your provider&apos;s job.
          </p>
          <p className={styles.settingsNote}>
            How each person is paid lives on them — set it under <Link href="/dashboard/crew?tab=people">People</Link>,
            along with their payroll ID.
          </p>
          <SaveButton className="btn primary" pendingLabel="Saving…" savedLabel="Saved ✓">Save settings</SaveButton>
        </form>
      ) : null}

      {/* Every pay action's form, mounted for the life of the page so a result
          always has somewhere to land — see ArmedForm. */}
      <ArmedForm action={approveHoursAction} armed={armed?.kind === 'approve' ? armed : null} fields={periodFields} onDone={handleDone} />
      <ArmedForm action={markSentAction} armed={armed?.kind === 'sent' ? armed : null} fields={periodFields} onDone={handleDone} />
      <ArmedForm action={closePeriodAction} armed={armed?.kind === 'close' ? armed : null} fields={periodFields} onDone={handleDone} />

      {/* Submitted by the CSV download so the export lands in the history. */}
      <ExportRecorder formRef={exportFormRef} fields={periodFields} />

      {/* --- drawer --- */}
      {drawer ? (
        <div className={styles.drawerBackdrop} onMouseDown={(event) => event.target === event.currentTarget && setDrawer(null)}>
          <div className={styles.drawerScrim} onMouseDown={() => setDrawer(null)} />
          <aside className={styles.drawer} role="dialog" aria-modal="true" aria-label={drawer.mode === 'history' ? 'Period history' : 'Crew member detail'}>
            <header className={styles.drawerHead}>
              <h3>{drawer.mode === 'history' ? 'Period history' : drawerRow?.name ?? 'Crew member'}</h3>
              <button type="button" className={styles.drawerClose} onClick={() => setDrawer(null)} aria-label="Close">✕</button>
            </header>

            {drawer.mode === 'crew' && drawerRow ? (
              <div className={styles.drawerBody}>
                <div className={styles.drawerStats}>
                  <div>
                    <small>Hours</small>
                    <strong>{rowHoursLabel(drawerRow)}</strong>
                  </div>
                  <div>
                    {/* "Overtime" on its own reads as a pay line. It is a count
                        of hours and nothing else — see OVERTIME_POLICY. */}
                    <small title={OVERTIME_POLICY}>Overtime hours (not paid at a premium)</small>
                    <strong>{drawerRow.overtimeHours > 0 ? hoursLabel(drawerRow.overtimeHours) : '—'}</strong>
                  </div>
                  <div>
                    <small>Estimated pay</small>
                    <strong>{payMoney(drawerRow.estimatedPay)}</strong>
                  </div>
                </div>

                {/* Each warning carries what to DO about it, and the button
                    where a button exists. A flag with no correction beside it
                    is a screen telling somebody off. */}
                {drawerRow.warnings.length > 0 ? (
                  <ul className={styles.drawerWarnings}>
                    {drawerRow.warnings.map((warning) => (
                      <li key={warning} data-severity={PAY_WARNING_SEVERITY[warning]}>
                        <strong>{payWarningChip(warning, drawerRow.entries)}</strong>
                        <span>{PAY_WARNING_HELP[warning]}</span>
                        <span>{PAY_WARNING_FIX[warning]}</span>
                        {(warning === 'changed-after-approval' || warning === 'logged-after-approval') && needsReapproval(drawerRow) && payAvailable ? (
                          <button
                            type="button"
                            className="linklike"
                            disabled={busy('approve')}
                            onClick={() => arm({ kind: 'approve', crewIds: [drawerRow.crewId as string] })}
                          >
                            {busy('approve') ? 'Approving…' : `Approve ${payMoney(drawerRow.estimatedPay)} instead`}
                          </button>
                        ) : null}
                        {ENTRY_FIX_WARNINGS.includes(warning) ? (
                          <button
                            type="button"
                            className="linklike"
                            onClick={() => {
                              setDrawer(null);
                              setAddOpen(true);
                            }}
                          >
                            Add a corrected entry
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {drawerRow.record?.paidAt ? (
                  <div className={styles.drawerPayment}>
                    <strong>Payment record</strong>
                    <p>
                      {payMoney(drawerRow.paidAmount ?? 0)} recorded on {dayLabel(drawerRow.record.paymentDate)} by{' '}
                      {drawerRow.record.paidBy ?? 'unknown'}
                      {drawerRow.record.paymentMethod ? ` · ${PAYMENT_METHOD_LABEL[drawerRow.record.paymentMethod]}` : ''}
                      {drawerRow.record.paymentReference ? ` · ${drawerRow.record.paymentReference}` : ''}.
                    </p>
                    {drawerRow.record.paymentNote ? <p className={styles.dim}>{drawerRow.record.paymentNote}</p> : null}
                    <button type="button" className="btn ghost" onClick={() => setDialog({ kind: 'undo', crewId: drawerRow.crewId as string, name: drawerRow.name })}>
                      Undo paid status
                    </button>
                  </div>
                ) : null}

                <div className={styles.entryList}>
                  {/* "Rate used", not "Rate": it is the rate SNAPSHOTTED on the
                      entry, which is not necessarily the rate on the crew
                      member's profile today. */}
                  <div className={styles.entryHead} aria-hidden="true">
                    <span>Job</span>
                    <span>Logged</span>
                    <span className={styles.num}>Hours</span>
                    <span className={styles.num}>Rate used</span>
                    <span className={styles.num}>Amount</span>
                    <span />
                  </div>
                  {rateBreakdownLabel(drawerRow.entries) ? (
                    <p className={styles.dim}>Rates used: {rateBreakdownLabel(drawerRow.entries)}</p>
                  ) : null}
                  {drawerRow.entries.map((entry) => (
                    <div key={entry.id} className={styles.entryRow}>
                      <span>
                        {entry.jobId ? <Link href={`/dashboard/jobs/${entry.jobId}`}>{jobLookup[entry.jobId] ?? 'Job'}</Link> : <span className={styles.dim}>No job</span>}
                        <small>{entry.description}</small>
                      </span>
                      <span>{loggedLabel(entry.loggedAt)}</span>
                      <span className={styles.num} title={entry.issue === 'incomplete-time' ? 'No hours were ever recorded on this entry. Its amount was recorded directly.' : undefined}>
                        {entryHoursLabel(entry)}
                      </span>
                      <span className={styles.num} title={entry.rate > 0 ? 'The rate this entry was logged at.' : 'This entry was logged with no rate on it.'}>
                        {entry.rate > 0 ? payMoney(entry.rate) : 'No rate'}
                      </span>
                      <span className={styles.num}>{payMoney(entry.amount)}</span>
                      <span className={styles.entryAction}>
                        {entry.issue ? (
                          <span className={styles.entryStatus} data-state="warn" title={ENTRY_ISSUE_HELP[entry.issue]}>
                            {ENTRY_ISSUE_LABEL[entry.issue]}
                          </span>
                        ) : null}
                        {drawerRow.locked ? (
                          <span className={styles.dim} title="This entry is locked because it has been paid. Unlock it from the row menu first.">🔒</span>
                        ) : (
                          <form action={deleteLaborEntryAction.bind(null, entry.id)}>
                            <button type="submit" className={styles.entryDelete} title="Remove this labor entry">Remove</button>
                          </form>
                        )}
                      </span>
                    </div>
                  ))}
                </div>

                <PayHistoryList events={events.filter((event) => !event.crewId || event.crewId === drawerRow.crewId)} />
              </div>
            ) : (
              <div className={styles.drawerBody}>
                <PayHistoryList events={events} />
              </div>
            )}
          </aside>
        </div>
      ) : null}

      {/* --- dialogs --- */}
      {dialog?.kind === 'pay' ? (
        <PaymentConfirmDialog
          rows={dialog.ids.map((id) => byKey.get(id)).filter(Boolean) as CrewPayRow[]}
          rangeLabel={period.rangeLabel}
          todayKey={todayKey}
          periodFields={periodFields}
          action={markPaidAction}
          onDone={handleDone}
          onClose={() => setDialog(null)}
          onReviewFirst={() => {
            setDialog(null);
            applyFilter({ status: 'draft', payment: 'all' });
          }}
        />
      ) : null}

      {dialog?.kind === 'undo' ? (
        <ReasonDialog
          title={`Undo paid status for ${dialog.name}`}
          lead="The payment record stays in the history. This adds a line saying it was undone."
          disclaimer={UNDO_DISCLAIMER}
          confirmLabel="Undo paid status"
          fields={
            <>
              {periodFields}
              <input type="hidden" name="crewId" value={dialog.crewId} />
            </>
          }
          action={undoPaidAction}
          onDone={handleDone}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog?.kind === 'unlock' ? (
        <ReasonDialog
          title={`Unlock ${dialog.name}’s paid entry`}
          lead="Unlocking lets the hours behind a payment be edited. The payment record itself is not changed."
          confirmLabel="Unlock entry"
          fields={
            <>
              {periodFields}
              <input type="hidden" name="crewId" value={dialog.crewId} />
              <input type="hidden" name="locked" value="0" />
            </>
          }
          action={setEntryLockAction}
          onDone={handleDone}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog?.kind === 'reopen' ? (
        <ReasonDialog
          title="Reopen this pay period"
          lead="Payments already recorded stay exactly as they are."
          confirmLabel="Reopen period"
          fields={periodFields}
          action={reopenPeriodAction}
          onDone={handleDone}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  numeric,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: 'asc' | 'desc' };
  onSort: (next: { key: SortKey; dir: 'asc' | 'desc' }) => void;
  numeric?: boolean;
}) {
  const active = sort.key === sortKey;
  return (
    <th className={numeric ? styles.num : undefined} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        className={styles.sortBtn}
        onClick={() => onSort({ key: sortKey, dir: active && sort.dir === 'desc' ? 'asc' : 'desc' })}
      >
        {label}
        <span aria-hidden="true">{active ? (sort.dir === 'asc' ? '▲' : '▼') : '⇅'}</span>
      </button>
    </th>
  );
}

/**
 * The period at a glance, by payment state.
 *
 * A ring is only as honest as its legend — every slice is also a row with a
 * count and an amount, because "40% orange" is not a number anyone can act on.
 */
function PayDonut({ totals, onSlice }: { totals: PeriodTotals; onSlice: (payment: PaymentFilter) => void }) {
  const slices = [
    { id: 'paid' as const, label: 'Paid', count: totals.paid, amount: totals.paidPay, color: '#48c78e' },
    { id: 'sent' as const, label: 'Sent to payroll', count: totals.sent, amount: 0, color: '#94b0d6' },
    { id: 'unpaid' as const, label: 'Not yet paid', count: totals.unpaid - totals.sent, amount: totals.unpaidPay, color: '#ff7a21' },
  ].filter((slice) => slice.count > 0);

  const total = slices.reduce((sum, slice) => sum + slice.count, 0) || 1;
  let cursor = 0;
  const stops = slices
    .map((slice) => {
      const start = (cursor / total) * 100;
      cursor += slice.count;
      const end = (cursor / total) * 100;
      return `${slice.color} ${start}% ${end}%`;
    })
    .join(', ');

  return (
    <div className={styles.donutWrap}>
      <div
        className={styles.donut}
        style={{ background: slices.length > 0 ? `conic-gradient(${stops})` : 'rgba(148, 176, 214, 0.2)' }}
        role="img"
        aria-label={slices.map((slice) => `${slice.count} ${slice.label}`).join(', ') || 'No crew with hours'}
      />
      <ul className={styles.donutLegend}>
        {slices.map((slice) => (
          <li key={slice.id}>
            <button type="button" onClick={() => onSlice(slice.id)}>
              <span className={styles.donutDot} style={{ background: slice.color }} aria-hidden="true" />
              <span>{slice.label} ({slice.count})</span>
              <strong>{slice.amount > 0 ? payMoney(slice.amount) : '—'}</strong>
            </button>
          </li>
        ))}
        {totals.noHours > 0 ? (
          <li className={styles.donutMuted}>
            <span className={styles.donutDot} style={{ background: 'rgba(148, 176, 214, 0.35)' }} aria-hidden="true" />
            <span>No hours ({totals.noHours})</span>
            <strong>—</strong>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function PayHistoryList({ events }: { events: PayEvent[] }) {
  if (events.length === 0) {
    return <p className={styles.dim}>Nothing has happened to this period yet.</p>;
  }
  return (
    <ol className={styles.historyList}>
      {events.map((event) => (
        <li key={event.id}>
          <div className={styles.historyHead}>
            <strong>{PAY_EVENT_LABEL[event.action] ?? event.action}</strong>
            <small>{stamp(event.createdAt)}</small>
          </div>
          <p>{event.summary}</p>
          {event.reason ? <p className={styles.historyReason}>“{event.reason}”</p> : null}
          <small className={styles.dim}>{event.actorEmail ?? 'System'}</small>
        </li>
      ))}
    </ol>
  );
}

/** A hidden form the CSV download submits so the export is recorded. */
function ExportRecorder({ formRef, fields }: { formRef: RefObject<HTMLFormElement>; fields: ReactNode }) {
  const [, formAction] = useFormState(recordExportAction, IDLE);
  return (
    <form ref={formRef} action={formAction} hidden>
      {fields}
    </form>
  );
}

/**
 * The crew grouped by what needs doing to them.
 *
 * The table answers "who worked and what are they owed". This answers the
 * question an owner actually opens the tab with — "what is left before I can
 * pay everyone" — by putting the exceptions in their own section with the
 * action that clears them attached to the heading.
 *
 * Sections stay in workflow order and an empty section still shows, because
 * "nobody needs review" is the answer somebody came looking for.
 */
function GroupedCrew({
  rows,
  collapsed,
  onToggleGroup,
  selected,
  onToggleSelect,
  onOpenCrew,
  onPayGroup,
  onApproveGroup,
  onFilter,
  onHistory,
  payAvailable,
}: {
  rows: CrewPayRow[];
  collapsed: Set<string>;
  onToggleGroup: (id: string) => void;
  selected: string[];
  onToggleSelect: (id: string) => void;
  onOpenCrew: (crewId: string) => void;
  onPayGroup: (ids: string[]) => void;
  onApproveGroup: (ids: string[]) => void;
  onFilter: (next: { status?: StatusFilter; payment?: PaymentFilter; flagged?: boolean }) => void;
  onHistory: () => void;
  payAvailable: boolean;
}) {
  const buckets = useMemo(() => groupCrewRows(rows) as unknown as Record<string, CrewPayRow[]>, [rows]);

  return (
    <div className={styles.groupWrap}>
      {GROUPS.map((group) => {
        const members = buckets[group.id] ?? [];
        const isOpen = !collapsed.has(group.id);
        const total = members.reduce((sum, row) => sum + row.estimatedPay, 0);
        const payable = members.filter((row) => row.eligible && row.hours > 0 && row.payment !== 'paid');

        return (
          <section key={group.id} className={styles.group} data-tone={group.tone}>
            <header className={styles.groupHead}>
              <button
                type="button"
                className={styles.groupTitle}
                onClick={() => onToggleGroup(group.id)}
                aria-expanded={isOpen}
                aria-controls={isOpen ? `pay-group-${group.id}` : undefined}
              >
                <span className={styles.groupDot} aria-hidden="true" />
                <strong>{group.label}</strong>
                <span className={styles.groupCount}>
                  {members.length} {members.length === 1 ? 'member' : 'members'}
                </span>
                {members.length > 0 ? <small>Est. pay {payMoney(total)}</small> : null}
              </button>

              <div className={styles.groupActions}>
                {group.id === 'needs_review' && members.length > 0 ? (
                  <button type="button" className="btn secondary" onClick={() => onFilter({ status: 'needs_review', payment: 'all', flagged: false })}>
                    Review all
                  </button>
                ) : null}
                {group.id === 'unpaid' && payAvailable && payable.length > 0 ? (
                  <>
                    {members.some((row) => row.review !== 'approved') ? (
                      <button type="button" className="btn secondary" onClick={() => onApproveGroup(payable.map(rowKey))}>
                        Approve all
                      </button>
                    ) : null}
                    <button type="button" className="btn secondary" onClick={() => onPayGroup(payable.map(rowKey))}>
                      Mark all as paid
                    </button>
                  </>
                ) : null}
                {group.id === 'paid' && members.length > 0 ? (
                  <button type="button" className="btn secondary" onClick={onHistory}>
                    View payment history
                  </button>
                ) : null}
                <span className={styles.groupChevron} aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
              </div>
            </header>

            {isOpen ? (
              members.length === 0 ? (
                /* Either branch is the group's body, so both wear the id the
                   header points at — only one of them is ever rendered. */
                <p id={`pay-group-${group.id}`} className={styles.groupEmpty}>
                  {group.id === 'needs_review'
                    ? 'Nothing here needs sorting out.'
                    : group.id === 'unpaid'
                      ? 'Everyone with hours has been paid for this period.'
                      : group.id === 'paid'
                        ? 'Nobody has been marked paid for this period yet.'
                        : 'Every crew member has hours logged for this period.'}
                </p>
              ) : (
                <div id={`pay-group-${group.id}`} className={styles.groupGrid}>
                  {members.map((row) => {
                    const id = rowKey(row);
                    const canSelect = row.eligible && row.hours > 0 && row.payment !== 'paid';
                    const initials = row.name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
                    return (
                      <article key={id} className={styles.memberCard} data-selected={selected.includes(id) || undefined}>
                        <div className={styles.memberTop}>
                          {canSelect ? (
                            <input
                              type="checkbox"
                              checked={selected.includes(id)}
                              onChange={() => onToggleSelect(id)}
                              aria-label={'Select ' + row.name}
                            />
                          ) : (
                            <span className={styles.memberCheckSpacer} aria-hidden="true" />
                          )}
                          <span className={styles.miniAvatar} data-avatar-tone={avatarTone(row.name)} aria-hidden="true">{initials}</span>
                          <button type="button" className={styles.memberName} onClick={() => row.crewId && onOpenCrew(row.crewId)}>
                            <strong>{row.name}</strong>
                            <small>
                              {row.roleLabel ?? 'Crew'}
                              {row.rate ? ' · ' + payMoney(row.rate) + '/hr' : ''}
                            </small>
                          </button>
                          <span className={styles.memberHours}>
                            <strong>{rowHoursLabel(row)}</strong>
                            <small>Est. pay</small>
                            <b>{payMoney(row.estimatedPay)}</b>
                          </span>
                        </div>
                        <div className={styles.memberFoot}>
                          <span className={styles.payBadge} data-state={row.review} title={PAY_STATUS_HELP[row.status]}>
                            {PAY_STATUS_LABEL[row.review === 'approved' ? 'approved' : row.status]}
                          </span>
                          <span className={styles.payBadge} data-payment={row.payment}>
                            {PAYMENT_STATE_LABEL[row.payment]}
                          </span>
                          {row.warnings
                            .filter((warning) => PAY_WARNING_SEVERITY[warning] !== 'info')
                            .map((warning) => (
                              <span
                                key={warning}
                                className={styles.flagChip}
                                data-severity={PAY_WARNING_SEVERITY[warning]}
                                title={`${PAY_WARNING_HELP[warning]} ${PAY_WARNING_FIX[warning]}`}
                              >
                                {payWarningChip(warning, row.entries)}
                              </span>
                            ))}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

/**
 * Two periods side by side, by weekday.
 *
 * Seven bars either way whatever the data does — a week with nothing on Sunday
 * still has a Sunday, and dropping empty days would make the two periods
 * impossible to line up.
 */
function HoursChart({ current, previous }: { current: number[]; previous: number[] }) {
  const peak = Math.max(1, ...current, ...previous);
  const currentTotal = current.reduce((sum, hours) => sum + hours, 0);
  const previousTotal = previous.reduce((sum, hours) => sum + hours, 0);

  return (
    <div className={styles.chartCard}>
      <div className={styles.chartHead}>
        <small>Hours overview</small>
        <span className={styles.chartLegend}>
          <b className={styles.chartKeyNow} /> {hoursLabel(currentTotal)}
          <b className={styles.chartKeyWas} /> {hoursLabel(previousTotal)} last
        </span>
      </div>
      <div
        className={styles.chartBars}
        role="img"
        aria-label={'Hours by weekday: ' + hoursLabel(currentTotal) + ' this period against ' + hoursLabel(previousTotal) + ' last period'}
      >
        {WEEKDAY_LABELS.map((label, index) => (
          <div key={label} className={styles.chartDay}>
            <div className={styles.chartPair}>
              <span
                className={styles.chartNow}
                style={{ height: Math.round((current[index] / peak) * 100) + '%' }}
                title={label + ': ' + hoursLabel(current[index])}
              />
              <span
                className={styles.chartWas}
                style={{ height: Math.round((previous[index] / peak) * 100) + '%' }}
                title={label + ' last period: ' + hoursLabel(previous[index])}
              />
            </div>
            <small>{label}</small>
          </div>
        ))}
      </div>
    </div>
  );
}
