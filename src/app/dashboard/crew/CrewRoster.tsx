'use client';

import { Suspense, createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, useTransition } from 'react';
import { useFormState } from 'react-dom';
import Link from 'next/link';
import CrewWorkHistory from '@/components/crew-work-history';
import SaveButton from '@/components/save-button';
import AddressAutocomplete from '@/components/address-autocomplete';
import ViewGear, { type ViewOption } from '@/components/view-gear';
import ConfirmActionButton from '@/app/dashboard/jobs/[id]/ConfirmActionButton';
import { setCrewOverviewAction, setRosterViewAction } from '@/app/dashboard/view-actions';
import type { RosterView } from '@/lib/dashboard-views';
import { rosterNextStep, rosterTotals } from '@/lib/crew-roster';
import { FIELD_APP_LABEL, FIELD_APP_TITLE, needsInvite, type FieldAppState } from '@/lib/crew-invite';
import type { PayType } from '@/lib/pay-types';
import {
  SUB_STATUS_LABEL,
  WORKER_TYPE_LABEL,
  formatRate,
  formatRating,
  formatResponseTime,
  type SubStatus,
  type SubcontractorProfile,
  type WorkerType,
} from '@/lib/subcontractors';
import OverviewBoard, { overviewOption, type OverviewItem } from './OverviewBoard';
import AddCrewDrawer from './AddCrewDrawer';
import AddSubcontractorDrawer from './AddSubcontractorDrawer';
import SubcontractorFields from './SubcontractorFields';
import CrewPhotoUpload from './CrewPhotoUpload';
import PayTypeFields from './PayTypeFields';
import { updateSubcontractorAction } from './subcontractor-actions';
import dispatch from './dispatch.module.css';
import {
  assignCrewToJobAction,
  deleteArchivedCrewAction,
  inviteCrewAction,
  revokeCrewAccessAction,
  setCrewActiveAction,
  type CrewActiveActionState,
  updateCrewAction,
  updateCrewPhotoAction,
} from './actions';
import { avatarTone } from '@/lib/avatar-tone';
import styles from './crew.module.css';

// The roster, as rows rather than cards.
//
// Each member used to own a full-width card carrying an assign form, an invite
// button, an archive button, a collapsed edit form and an empty work-history
// panel — roughly a screen per person, most of it blank. A four-person crew was
// four screens of scrolling to answer "who's free today". These rows carry the
// eight facts worth scanning and put everything else behind a click.

export type CrewRow = {
  id: string;
  name: string;
  /**
   * Employee or subcontractor. Everything below `subProfile` is null for the
   * first kind — a shape that is checked rather than assumed, because this
   * roster renders both and half these fields are meaningless on a person you
   * employ.
   */
  workerType: WorkerType;
  companyName: string | null;
  /** The firm's name where there is one, otherwise the person's. */
  displayName: string;
  subStatus: SubStatus | null;
  trades: string[];
  compliance: { state: string; label: string } | null;
  subMetrics: {
    offered: number;
    accepted: number;
    completed: number;
    responseMinutes: number | null;
    acceptanceRate: number | null;
    rating: number | null;
  } | null;
  subProfile: SubcontractorProfile | null;
  initials: string;
  photoUrl: string | null;
  roleLabel: string;
  hourlyRate: number;
  /** How they're paid. rateLabel reads from this, so it says "/yr" for a salary. */
  payType: PayType;
  annualSalary: number | null;
  dayRate: number | null;
  payrollId: string | null;
  rateLabel: string;
  phone: string | null;
  phoneLabel: string | null;
  email: string | null;
  // Where their day starts, for Plan my day. Null = start from the shop.
  startAddress: string | null;
  // What this person may do around an arrival — see lib/arrival.
  permissions: { send: boolean; shareLocation: boolean; viewContact: boolean; reschedule: boolean };
  active: boolean;
  /** Where they are in the field-app invitation — see lib/crew-invite. */
  fieldApp: FieldAppState;
  /** The date behind the chip: "Invited 3 days ago · link expired". */
  fieldAppDetail: string | null;
  jobs: { id: string; ref: string; clientName: string }[];
  periodHours: number;
  periodPay: number;
  periodPayLabel: string;
  createdAt: string;
};

type JobOption = { id: string; ref: string; clientName: string };

const CREW_ACTIVE_ACTION_IDLE: CrewActiveActionState = { status: 'idle', message: '' };

const SORTS = [
  { id: 'name', label: 'Name' },
  { id: 'hours', label: 'Most hours' },
  { id: 'pay', label: 'Highest estimated pay' },
  { id: 'job', label: 'Current job' },
  { id: 'added', label: 'Recently added' },
] as const;

type SortId = (typeof SORTS)[number]['id'];

// The same four-option shape the Clients and Jobs gears use, so it's a control
// that's already learned. Each one answers a different question about the crew:
// who are they, what do they look like, who's free, and how do twenty of them
// compare line by line.
// 'overview' is not a RosterView — it is the whole page's mode, and picking it
// here puts the other two tabs in it as well. It rides in this list because
// that's where somebody looks for a layout, not because it is one of these.
type RosterPick = RosterView | 'overview';

const ROSTER_VIEW_OPTIONS: ViewOption<RosterPick>[] = [
  { id: 'rows', label: 'Rows', hint: 'One line each, the everyday roster' },
  { id: 'board', label: 'Board', hint: "Split by who's free and who's already assigned" },
  { id: 'table', label: 'Table', hint: 'Dense columns for a big crew' },
  overviewOption<RosterPick>('One person open beside the list — all three tabs'),
];

function isSimplifiedRosterView(view: RosterView): view is Extract<RosterView, 'rows' | 'board' | 'table'> {
  return view === 'rows' || view === 'board' || view === 'table';
}

function needsFieldAppSetup(row: CrewRow): boolean {
  return (
    row.active &&
    row.workerType === 'employee' &&
    (row.fieldApp === 'no-email' || needsInvite(row.fieldApp))
  );
}

/**
 * Read-only mode, and where the roster's links point.
 *
 * CONTEXT rather than props, deliberately. The server actions on this roster —
 * create, invite, assign, archive, update, delete — are spread across five
 * sub-components and eight call sites. Threading a `readOnly` prop through all
 * of them is a change where missing ONE leaves a form on a public page that
 * POSTs to an action starting with requireOwnerContext, and the only symptom is
 * a prospect landing on the login wall. A context cannot be forgotten at a call
 * site, because there are no call sites to forget it at.
 */
const RosterMode = createContext<{ readOnly: boolean; basePath: string }>({ readOnly: false, basePath: '/dashboard' });
const useRosterMode = () => useContext(RosterMode);

/**
 * Whole dollars — for HEADLINES ONLY.
 *
 * Deliberately not used for one person's pay. The roster used to round a crew
 * member's period pay to "$305" here while the Hours & pay tab printed the same
 * figure as "$304.50" through payMoney, and two tabs of one page disagreeing
 * about one number makes the product look like it cannot add up. Per-person
 * amounts come from lib/crew-pay's payMoney (see page.tsx). A crew-wide total in
 * a rail card is a different claim — nobody reconciles it against a payslip —
 * and cents there are noise, so this stays.
 */
function money(amount: number): string {
  return `$${Math.round(amount).toLocaleString('en-US')}`;
}

/** Where every "add an employee" control points. See AddCrewDrawer. */
export const ADD_CREW_HREF = '/dashboard/crew?tab=people&add=1';
/** And its subcontractor twin. See AddSubcontractorDrawer. */
export const ADD_SUBCONTRACTOR_HREF = '/dashboard/crew?tab=people&add=sub';

const COMPLIANCE_TONE: Record<string, string> = {
  ok: 'ok',
  expiring: 'warn',
  expired: 'alert',
  missing: 'warn',
};

/**
 * The chip, with its date underneath it.
 *
 * The date is the half that was missing. "Not invited" and "invited a month ago
 * and the link died an hour later" were one word on this roster, and the second
 * one is the reason a crew member is standing outside the app wondering why
 * nothing works. The title attribute carries the explanation; the small line
 * carries the fact.
 */
function FieldAppChip({ row, withDetail = true }: { row: CrewRow; withDetail?: boolean }) {
  return (
    <span className={styles.appState}>
      <span className={styles.appChip} data-state={row.fieldApp} title={FIELD_APP_TITLE[row.fieldApp]}>
        {FIELD_APP_LABEL[row.fieldApp]}
      </span>
      {withDetail && row.fieldAppDetail ? <small className={styles.appDetail}>{row.fieldAppDetail}</small> : null}
    </span>
  );
}

export default function CrewRoster({
  rows,
  assignableJobs,
  periodLabel,
  initialStatus,
  initialWorkerType = 'all',
  initialView,
  initialOverview,
  readOnly = false,
  basePath = '/dashboard',
}: {
  rows: CrewRow[];
  assignableJobs: JobOption[];
  periodLabel: string;
  /** The logged-out demo: show the team, offer nothing that writes. */
  readOnly?: boolean;
  basePath?: string;
  initialStatus: 'active' | 'archived';
  /** "?worker=subcontractor" — the whole directory, or one half of it. */
  initialWorkerType?: WorkerType | 'all';
  initialView: RosterView;
  /** Whether the whole page is in Overview. Outranks initialView while it's on. */
  initialOverview: boolean;
  /**
   * ACCEPTED AND IGNORED. This used to be the add form's open state, read as
   * `useState(openAdd)` — an initializer, so the header link's soft navigation
   * never reopened anything and "+ Add crew member" did nothing at all. Adding
   * is a drawer now and reads ?add=1 from the URL itself (AddCrewDrawer), which
   * cannot go stale because there is no second copy of the answer. The prop
   * stays in the type only because app/demo/crew/page.tsx still passes it.
   */
  openAdd?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'active' | 'archived'>(initialStatus);
  const [workerType, setWorkerType] = useState<WorkerType | 'all'>(initialWorkerType);
  const [role, setRole] = useState('all');
  const [jobFilter, setJobFilter] = useState('all');
  const [appFilter, setAppFilter] = useState('all');
  const [sort, setSort] = useState<SortId>('name');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersId = useId();
  const [openId, setOpenId] = useState<string | null>(null);
  // The crew member just added, until it has been read and acted on: it names
  // the person in the confirmation and tells the roster whose card to focus.
  const [added, setAdded] = useState<{ id: string; name: string; message: string } | null>(null);
  const [view, setView] = useState<RosterView>(isSimplifiedRosterView(initialView) ? initialView : 'rows');
  const [overview, setOverview] = useState(initialOverview);
  const [, startViewSave] = useTransition();

  // The layout changes immediately; remembering it is a background write. A
  // cookie that fails to save is a worse view tomorrow, not a broken page now.
  function pickView(next: RosterPick) {
    if (next === 'overview') {
      setOverview(true);
      startViewSave(() => {
        void setCrewOverviewAction(true).catch(() => {});
      });
      return;
    }
    // Leaving Overview is implicit in picking a layout: setRosterViewAction
    // clears the page mode, so there is never a moment where the cookie says
    // Overview and the screen shows Rows.
    setOverview(false);
    setView(next);
    startViewSave(() => {
      void setRosterViewAction(next).catch(() => {});
    });
  }

  // Legacy Cards/Focus preferences render as Rows in People, but are not
  // rewritten here. Focus is still a valid Hours & pay preference, and the
  // shared view action would otherwise erase that unrelated saved choice.

  // Board columns, the nine-column table and Focus's rail all want more than the
  // 1100px cap, and the shell is rendered by the page above this component. The
  // server sets the class from the cookie so the first paint is right; this
  // keeps it in step the moment the view changes rather than making a layout
  // change wait on a round trip.
  // Overview is capped at the standard width on purpose: a 21rem list beside one
  // open person does not need 1600px, and letting it have it strands the pane's
  // buttons a screen-width away from the list.
  const wide = !overview && (view === 'board' || view === 'table' || view === 'focus');
  useEffect(() => {
    const main = document.querySelector('main.wide-shell');
    if (!main) return;
    main.classList.toggle('crew-wide', wide);
    // Focus is a page theme, so the shell wears it too — toggled here as well as
    // set server-side from the cookie, or switching view would leave the page
    // half-dressed until the next navigation.
    main.classList.toggle('crew-focus', !overview && view === 'focus');
    return () => {
      main.classList.remove('crew-wide');
      main.classList.remove('crew-focus');
    };
  }, [wide, view, overview]);

  const roles = useMemo(
    () => [...new Set(rows.map((row) => row.roleLabel).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  // The trades this account already uses, so the add form offers their own
  // vocabulary before ours — the same rule the role list follows.
  const knownTrades = useMemo(
    () => [...new Set(rows.flatMap((row) => row.trades))].sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  // -- what happens after somebody is added -----------------------------------

  const focusedFor = useRef<string | null>(null);

  const handleAdded = useCallback((member: { id: string; name: string; message: string }) => {
    // Every control on that toolbar is a way to NOT see the person who was just
    // created: a search for someone else, the Archived tab, a role filter, "only
    // people on a job". Adding somebody and landing on a roster that does not
    // contain them reads as the save having failed, so the filters are cleared
    // to the one state where a brand-new, active, unassigned member is visible.
    setQuery('');
    setStatus('active');
    setRole('all');
    setJobFilter('all');
    setAppFilter('all');
    // The worker-type filter is cleared for the same reason as the rest: adding
    // a subcontractor while the list is filtered to employees lands you on a
    // roster that does not contain the firm you just typed in.
    setWorkerType('all');
    setAdded(member);
  }, []);

  // Take the owner to the card they just created. `rows` is a dependency because
  // the new member only exists here once the server action's revalidatePath has
  // flowed back through this page — until then the node is not in the document
  // and this simply waits for the render that has it.
  useEffect(() => {
    if (!added || focusedFor.current === added.id) return;
    const node = document.querySelector<HTMLElement>(`[data-crew-row="${added.id}"]`);
    if (!node) return;
    focusedFor.current = added.id;
    node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // preventScroll because scrollIntoView is already doing it, smoothly, and
    // focus() would otherwise jump the list to the same place instantly first.
    node.focus({ preventScroll: true });
  }, [added, rows]);

  // The highlight is a "here they are", not a state — it goes away on its own
  // rather than needing to be dismissed before the roster looks normal again.
  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(null), 10000);
    return () => clearTimeout(timer);
  }, [added]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (status === 'active' ? !row.active : row.active) return false;
      if (workerType !== 'all' && row.workerType !== workerType) return false;
      if (role !== 'all' && row.roleLabel !== role) return false;
      if (appFilter === 'needs-setup' && !needsFieldAppSetup(row)) return false;
      if (appFilter !== 'all' && appFilter !== 'needs-setup' && row.fieldApp !== appFilter) return false;
      if (jobFilter === 'available' && row.jobs.length > 0) return false;
      if (jobFilter === 'assigned' && row.jobs.length === 0) return false;
      if (jobFilter !== 'all' && jobFilter !== 'available' && jobFilter !== 'assigned') {
        if (!row.jobs.some((job) => job.id === jobFilter)) return false;
      }
      if (!needle) return true;
      // Searching a roster means searching for a person — by name, by what they
      // do, by the number you'd call, or by the job they're on today.
      return (
        row.name.toLowerCase().includes(needle) ||
        (row.companyName ?? '').toLowerCase().includes(needle) ||
        row.trades.some((trade) => trade.toLowerCase().includes(needle)) ||
        row.roleLabel.toLowerCase().includes(needle) ||
        (row.phoneLabel ?? '').toLowerCase().includes(needle) ||
        (row.phone ?? '').toLowerCase().includes(needle) ||
        (row.email ?? '').toLowerCase().includes(needle) ||
        row.jobs.some((job) => `${job.ref} ${job.clientName}`.toLowerCase().includes(needle))
      );
    });

    return filtered.sort((a, b) => {
      if (sort === 'hours') return b.periodHours - a.periodHours || a.name.localeCompare(b.name);
      if (sort === 'pay') return b.periodPay - a.periodPay || a.name.localeCompare(b.name);
      if (sort === 'added') return b.createdAt.localeCompare(a.createdAt);
      if (sort === 'job') {
        const aJob = a.jobs[0]?.ref ?? '';
        const bJob = b.jobs[0]?.ref ?? '';
        // People with no job sort last rather than first — an empty string would
        // otherwise put every available member above everyone who's working.
        if (!aJob !== !bJob) return aJob ? -1 : 1;
        return aJob.localeCompare(bJob) || a.name.localeCompare(b.name);
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  }, [rows, query, status, workerType, role, jobFilter, appFilter, sort]);

  const activeCount = rows.filter((row) => row.active).length;
  const employeeCount = rows.filter((row) => row.workerType === 'employee').length;
  const subCount = rows.length - employeeCount;
  const selected = openId ? rows.find((row) => row.id === openId) ?? null : null;

  // Focus's rail. Derived from every row rather than the filtered ones — what's
  // wrong with the crew doesn't change because you searched for someone.
  const nextStep = useMemo(() => rosterNextStep(rows), [rows]);
  const totals = useMemo(() => rosterTotals(rows), [rows]);
  const setup = useMemo(() => {
    const actionable = rows.filter(needsFieldAppSetup);
    return {
      total: actionable.length,
      missingEmail: actionable.filter((row) => row.fieldApp === 'no-email').length,
      readyToInvite: actionable.filter((row) => row.fieldApp !== 'no-email').length,
    };
  }, [rows]);
  const activeFilterCount =
    Number(status !== 'active') +
    Number(workerType !== 'all') +
    Number(role !== 'all') +
    Number(jobFilter !== 'all') +
    Number(appFilter !== 'all');
  const summaryScopeIsAll = query.trim() === '' && workerType === 'all' && role === 'all';

  function showRosterSlice(
    nextStatus: 'active' | 'archived',
    nextJobFilter: string,
    nextAppFilter = 'all',
    nextWorkerType: WorkerType | 'all' = 'all',
  ) {
    setQuery('');
    setStatus(nextStatus);
    setWorkerType(nextWorkerType);
    setRole('all');
    setJobFilter(nextJobFilter);
    setAppFilter(nextAppFilter);
  }

  // The roster as Overview rows. The three stats are the three facts a roster
  // exists to answer — what they cost you this period, what they're paid, and
  // whether they're out on something — and the actions are the ones that were
  // already on every row, so Overview adds no power the other layouts lack.
  const overviewItems = useMemo<OverviewItem[]>(
    () =>
      visible.map((row) => ({
        id: row.id,
        initials: row.initials,
        photoUrl: row.photoUrl,
        name: row.name,
        sub: row.roleLabel ? `${row.roleLabel} · ${row.rateLabel}` : row.rateLabel,
        amount: row.periodPayLabel,
        amountTitle: periodTitle(periodLabel),
        badge: !row.active
          ? { label: 'Archived', tone: 'muted' as const }
          : row.jobs.length > 0
            // "Assigned", not "On a job". What the data says is: this person is
            // attached to at least one job that is not complete or archived —
            // which includes work scheduled for next month and work with no
            // date at all. "On a job" reads as "right now", so a roster where
            // everyone was assigned to future work announced a whole crew out
            // on site with zero hours logged against any of it. The title still
            // names the jobs.
            ? { label: 'Assigned', tone: 'warn' as const, title: row.jobs.map((job) => `${job.ref} · ${job.clientName}`).join('\n') }
            : { label: 'Available', tone: 'ok' as const },
        headline: [row.phoneLabel, row.email].filter(Boolean).join(' · ') || 'No contact on file',
        stats: [
          { label: periodLabel, value: `${row.periodHours} hrs`, title: periodTitle(periodLabel) },
          { label: 'Est. pay', value: row.periodPayLabel, title: periodTitle(periodLabel) },
          { label: 'Rate', value: row.rateLabel },
        ],
        note: (
          <>
            <FieldAppChip row={row} />
            {row.jobs.length > 0 ? (
              <>
                {row.jobs.map((job) => (
                  <Link key={job.id} href={`/dashboard/jobs/${job.id}`} className={styles.jobChip}>
                    {job.ref} · {job.clientName}
                  </Link>
                ))}
              </>
            ) : (
              <span className={styles.dim}>{row.active ? 'Not assigned to any open work.' : 'Not on the crew right now.'}</span>
            )}
          </>
        ),
        actions: (
          <>
            <button type="button" className="btn primary" onClick={() => setOpenId(row.id)}>
              Open profile
            </button>
            {row.phone ? (
              <a href={`tel:${row.phone}`} className="btn secondary">Call {row.phoneLabel}</a>
            ) : null}
            <Link href={hoursHrefFor(row)} className="btn secondary">View hours</Link>
          </>
        ),
      })),
    [visible, periodLabel],
  );

  // The board's whole point: who could you send somewhere right now. Archived
  // people get their own column rather than being called "available", which
  // they emphatically are not.
  const columns = useMemo(() => {
    const free = visible.filter((row) => row.active && row.jobs.length === 0);
    const busy = visible.filter((row) => row.active && row.jobs.length > 0);
    const archived = visible.filter((row) => !row.active);
    return [
      { id: 'free', label: 'Available now', hint: 'Nobody has them booked today', rows: free },
      { id: 'busy', label: 'Assigned', hint: 'On at least one job that is not finished', rows: busy },
      ...(archived.length > 0 ? [{ id: 'archived', label: 'Archived', hint: 'Not on the crew right now', rows: archived }] : []),
    ];
  }, [visible]);

  return (
    <RosterMode.Provider value={{ readOnly, basePath }}>
      {setup.total > 0 && !readOnly ? (
        <section className={styles.setupBanner} aria-label="Field app setup needed">
          <div>
            <strong>{setup.total} {setup.total === 1 ? 'person needs' : 'people need'} field-app setup</strong>
            <span>
              {setup.missingEmail} missing {setup.missingEmail === 1 ? 'email' : 'emails'}
              {' · '}
              {setup.readyToInvite} ready to invite
            </span>
          </div>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              showRosterSlice('active', 'all', 'needs-setup', 'employee');
              setFiltersOpen(false);
            }}
          >
            Finish setup
          </button>
        </section>
      ) : null}

      <div className={styles.rosterSummary} role="group" aria-label="Crew availability filters">
        <button
          type="button"
          aria-pressed={summaryScopeIsAll && status === 'active' && jobFilter === 'all' && appFilter === 'all'}
          onClick={() => showRosterSlice('active', 'all')}
        >
          <strong>{totals.activeCount}</strong>
          <span>Active</span>
        </button>
        <button
          type="button"
          aria-pressed={summaryScopeIsAll && status === 'active' && jobFilter === 'available' && appFilter === 'all'}
          onClick={() => showRosterSlice('active', 'available')}
        >
          <strong>{totals.available}</strong>
          <span>Available</span>
        </button>
        <button
          type="button"
          aria-pressed={summaryScopeIsAll && status === 'active' && jobFilter === 'assigned' && appFilter === 'all'}
          onClick={() => showRosterSlice('active', 'assigned')}
        >
          <strong>{totals.onJob}</strong>
          <span>Assigned</span>
        </button>
        {setup.total > 0 ? (
          <button
            type="button"
            aria-pressed={query.trim() === '' && status === 'active' && workerType === 'employee' && role === 'all' && jobFilter === 'all' && appFilter === 'needs-setup'}
            onClick={() => showRosterSlice('active', 'all', 'needs-setup', 'employee')}
          >
            <strong>{setup.total}</strong>
            <span>Needs setup</span>
          </button>
        ) : null}
        <button
          type="button"
          aria-pressed={summaryScopeIsAll && status === 'archived' && jobFilter === 'all' && appFilter === 'all'}
          disabled={totals.archived === 0}
          onClick={() => showRosterSlice('archived', 'all')}
        >
          <strong>{totals.archived}</strong>
          <span>Archived</span>
        </button>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.toolbarTop}>
          <div className={styles.search}>
            <span aria-hidden="true">🔎</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, company, trade, phone or job"
              aria-label="Search crew and subcontractors"
            />
          </div>
          <div className={styles.mobileTools}>
            <button
              type="button"
              className={styles.filtersToggle}
              aria-expanded={filtersOpen}
              aria-controls={filtersId}
              onClick={() => setFiltersOpen((open) => !open)}
            >
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>
            <label className={styles.mobileSort}>
              <span className="sr-only">Sort crew</span>
              <select value={sort} onChange={(event) => setSort(event.target.value as SortId)} aria-label="Sort crew">
                {SORTS.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div id={filtersId} className={`${styles.filters}${filtersOpen ? ` ${styles.filtersOpen}` : ''}`}>
          <label className={styles.filter}>
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as 'active' | 'archived')}>
              <option value="active">Active ({activeCount})</option>
              <option value="archived">Archived ({rows.length - activeCount})</option>
            </select>
          </label>

          {/* First among the filters, because it is the biggest cut: an
              employee and a subcontractor are two different kinds of record and
              almost nobody is looking for both at once. */}
          <label className={styles.filter}>
            <span>Worker type</span>
            <select value={workerType} onChange={(event) => setWorkerType(event.target.value as WorkerType | 'all')}>
              <option value="all">Everyone ({rows.length})</option>
              <option value="employee">Employees ({employeeCount})</option>
              <option value="subcontractor">Subcontractors ({subCount})</option>
            </select>
          </label>

          <label className={styles.filter}>
            <span>Role</span>
            <select value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="all">All roles</option>
              {roles.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>

          <label className={styles.filter}>
            <span>Current job</span>
            <select value={jobFilter} onChange={(event) => setJobFilter(event.target.value)}>
              <option value="all">Any</option>
              <option value="available">Available now</option>
              <option value="assigned">Assigned</option>
              {assignableJobs.map((job) => (
                <option key={job.id} value={job.id}>{job.ref} · {job.clientName}</option>
              ))}
            </select>
          </label>

          <label className={styles.filter}>
            <span>Field app</span>
            <select value={appFilter} onChange={(event) => setAppFilter(event.target.value)}>
              <option value="all">Any</option>
              <option value="needs-setup">Needs setup ({setup.total})</option>
              <option value="linked">Signed in</option>
              <option value="invited">Invited, waiting</option>
              <option value="expired">Invite expired</option>
              <option value="not-invited">Not invited</option>
              <option value="no-email">No email</option>
              <option value="revoked">Access removed</option>
            </select>
          </label>

          <label className={`${styles.filter} ${styles.desktopSort}`}>
            <span>Sort</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as SortId)}>
              {SORTS.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>

          {/* The same gear the Leads, Jobs, Schedule, Clients and Hours & pay
              screens carry — in the same place, doing the same thing. */}
          <div className={styles.filterGear}>
            <ViewGear
              views={ROSTER_VIEW_OPTIONS}
              activeView={overview ? 'overview' : view}
              onPickView={pickView}
              label="View"
            />
          </div>
        </div>
      </div>

      {/* The confirmation lives here, above the roster, and the live region is
          mounted whether or not there is anything in it: a role="status" element
          that appears at the same moment as its text is announced by roughly no
          screen reader, because there was no region to observe. */}
      <div className={styles.addedLive} role="status" aria-live="polite">
        {added ? (
          <p className={styles.addedBanner}>
            <span>{added.message}</span>
            <button type="button" onClick={() => setAdded(null)}>Dismiss</button>
          </p>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <div className={styles.empty}>
          <h3>Nobody here yet</h3>
          <p>
            Add the people who work with you — employees whose hours roll up here, and the subcontractors you send job
            offers to.
          </p>
          {readOnly ? null : (
            <div className={styles.emptyActions}>
              <Link href={ADD_CREW_HREF} className="btn primary">+ Add employee</Link>
              <Link href={ADD_SUBCONTRACTOR_HREF} className="btn secondary">+ Add subcontractor</Link>
            </div>
          )}
        </div>
      ) : overview ? (
        <OverviewBoard
          items={overviewItems}
          listLabel="Crew members"
          empty={
            status === 'archived' ? 'No archived crew members match those filters.' : 'No crew members match those filters.'
          }
        />
      ) : visible.length === 0 && view !== 'focus' ? (
        // Focus keeps its layout even when nothing matches: the rail is about
        // the crew, not the filter, and searching for a name nobody has should
        // not take away what the roster says needs fixing.
        <p className="empty-state">
          {status === 'archived' ? 'No archived crew members match those filters.' : 'No crew members match those filters.'}
        </p>
      ) : view === 'cards' ? (
        <ul className={styles.cardGrid}>
          {visible.map((row) => (
            <CrewCardItem
              key={row.id}
              row={row}
              assignableJobs={assignableJobs}
              periodLabel={periodLabel}
              justAdded={row.id === added?.id}
              onOpen={() => setOpenId(row.id)}
            />
          ))}
        </ul>
      ) : view === 'board' ? (
        <div className={styles.board}>
          {columns.map((column) => (
            <section key={column.id} className={styles.boardCol} data-col={column.id}>
              <header>
                <strong>{column.label}</strong>
                <span className={styles.boardCount}>{column.rows.length}</span>
                <small>{column.hint}</small>
              </header>
              {column.rows.length === 0 ? (
                <p className={styles.boardEmpty}>
                  {column.id === 'free' ? 'Everyone is booked.' : 'Nobody here.'}
                </p>
              ) : (
                <ul>
                  {column.rows.map((row) => (
                    <CrewBoardItem
                      key={row.id}
                      row={row}
                      assignableJobs={assignableJobs}
                      periodLabel={periodLabel}
                      justAdded={row.id === added?.id}
                      onOpen={() => setOpenId(row.id)}
                    />
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      ) : view === 'focus' ? (
        <div className={styles.focusLayout}>
          <div className={styles.focusMain}>
            {visible.length === 0 ? (
              <p className="empty-state">
                {status === 'archived' ? 'No archived crew members match those filters.' : 'No crew members match those filters.'}
              </p>
            ) : (
              <>
                <div className={styles.rowHead} aria-hidden="true">
                  <span>Crew member</span>
                  <span>Contact</span>
                  <span>Current job</span>
                  <span className={styles.num}>This period</span>
                  <span />
                </div>
                <ul className={styles.rows}>
                  {visible.map((row) => (
                    <CrewRowItem
                      key={row.id}
                      row={row}
                      assignableJobs={assignableJobs}
                      periodLabel={periodLabel}
                      justAdded={row.id === added?.id}
                      onOpen={() => setOpenId(row.id)}
                    />
                  ))}
                </ul>
              </>
            )}
          </div>

          {/* The rail is about the CREW, not about the filter — so it reads from
              every row rather than the visible ones. Filtering the list should
              not change what the roster says is wrong with it. */}
          <aside className={styles.focusRail}>
            <section className={styles.focusCard} data-tone={nextStep.tone}>
              <small>Next step</small>
              <strong>{nextStep.title}</strong>
              <p>{nextStep.body}</p>
              {nextStep.names.length > 0 ? (
                // Names, not a count: each one opens that person, which is where
                // the rate is set and the invite is sent. A card that says "3
                // people" and can't tell you which three is a dead end.
                <div className={styles.focusNames}>
                  {rows
                    .filter((row) => nextStep.names.includes(row.name))
                    .slice(0, 6)
                    .map((row) => (
                      <button key={row.id} type="button" onClick={() => setOpenId(row.id)}>
                        {row.name}
                      </button>
                    ))}
                </div>
              ) : null}
              {nextStep.id === 'invite' || nextStep.id === 'email' ? (
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => {
                    setAppFilter(nextStep.id === 'invite' ? 'invitable' : 'no-email');
                    setStatus('active');
                  }}
                >
                  Show just these
                </button>
              ) : nextStep.id === 'idle' ? (
                <button type="button" className="btn secondary" onClick={() => { setJobFilter('available'); setStatus('active'); }}>
                  Show who&apos;s free
                </button>
              ) : nextStep.id === 'empty' && !readOnly ? (
                <Link href={ADD_CREW_HREF} className="btn primary">+ Add crew member</Link>
              ) : null}
            </section>

            <section className={styles.focusCard}>
              <small>{periodLabel}</small>
              <strong className={styles.focusBig}>{totals.periodPay > 0 ? money(totals.periodPay) : '—'}</strong>
              <p>
                {totals.periodHours > 0
                  ? `${Math.round(totals.periodHours * 10) / 10} hours across your active crew. Estimated — hours × the rate on each entry.`
                  : 'No hours logged for this period yet.'}
              </p>
              <Link href="/dashboard/crew?tab=hours" className="btn secondary">Open Hours &amp; pay</Link>
            </section>

            <section className={styles.focusCard}>
              <small>Right now</small>
              <ul className={styles.focusCounts}>
                <li>
                  <button type="button" onClick={() => { setJobFilter('available'); setStatus('active'); }}>
                    <b>{totals.available}</b> available
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => { setJobFilter('assigned'); setStatus('active'); }}>
                    <b>{totals.onJob}</b> assigned
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => setStatus('archived')} disabled={totals.archived === 0}>
                    <b>{totals.archived}</b> archived
                  </button>
                </li>
              </ul>
            </section>

            <section className={styles.focusCard}>
              <small>Quick actions</small>
              <ul className={styles.focusActions}>
                <li>{readOnly ? null : <Link href={ADD_CREW_HREF}>Add crew member</Link>}</li>
                <li><Link href="/dashboard/crew?tab=hours">Review hours &amp; pay</Link></li>
                <li><Link href="/dashboard/crew?tab=jobs">Labor by job</Link></li>
                <li><Link href="/dashboard/schedule/plan">Plan today&apos;s route</Link></li>
              </ul>
            </section>
          </aside>
        </div>
      ) : view === 'table' ? (
        <div className={styles.tableWrap}>
          <table className={styles.rosterTable}>
            <thead>
              <tr>
                <th scope="col">Crew member</th>
                <th scope="col">Role</th>
                <th scope="col" className={styles.num}>Rate</th>
                <th scope="col">Phone</th>
                <th scope="col">Field app</th>
                <th scope="col">Current job</th>
                <th scope="col" className={styles.num}>Hours</th>
                <th scope="col" className={styles.num}>Est. pay</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <CrewTableRow
                  key={row.id}
                  row={row}
                  assignableJobs={assignableJobs}
                  periodLabel={periodLabel}
                  justAdded={row.id === added?.id}
                  onOpen={() => setOpenId(row.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className={styles.rowHead} aria-hidden="true">
            <span>Crew member</span>
            <span>Contact</span>
            <span>Current job</span>
            <span className={styles.num}>This period</span>
            <span />
          </div>
          <ul className={styles.rows}>
            {visible.map((row) => (
              <CrewRowItem
                key={row.id}
                row={row}
                assignableJobs={assignableJobs}
                periodLabel={periodLabel}
                justAdded={row.id === added?.id}
                onOpen={() => setOpenId(row.id)}
              />
            ))}
          </ul>
        </>
      )}

      {selected ? <CrewDrawer row={selected} onClose={() => setOpenId(null)} periodLabel={periodLabel} /> : null}

      {/* The add form used to sit HERE, as the last child of the roster and some
          three thousand pixels below the button that opened it. It is a drawer
          now, and the only thing left at the bottom of this component is
          nothing — one "+ Add crew member" in the page header, not a second CTA
          that scrolls off the end of the list.

          Suspense because AddCrewDrawer reads the URL with useSearchParams:
          this page is force-dynamic so the hook is fine, but the roster is also
          rendered by the read-only demo, and a boundary costs nothing next to a
          build that fails on a route nobody thought about. */}
      {readOnly ? null : (
        <Suspense fallback={null}>
          <AddCrewDrawer roles={roles} onAdded={handleAdded} />
          {/* ?add=sub rather than ?add=1. Two drawers, one parameter, mutually
              exclusive by construction — there is no state to get out of step
              and no way for both to be open at once. */}
          <AddSubcontractorDrawer knownTrades={knownTrades} onAdded={handleAdded} />
        </Suspense>
      )}
    </RosterMode.Provider>
  );
}

// -- shared pieces ------------------------------------------------------------
//
// Four layouts, one set of actions. Extracted rather than copied so that
// "Assign job" can never mean something subtly different depending on which
// view the owner happens to have chosen.

function hoursHrefFor(row: CrewRow, basePath = '/dashboard'): string {
  return `${basePath}/crew?tab=hours&crew=${row.id}`;
}

/**
 * Archive/reactivate form with a durable place for an entitlement refusal.
 *
 * A thrown Server Action error is intentionally opaque in a production Next
 * build. useFormState keeps the database's mapped cap/remediation sentence as
 * ordinary UI state, beside either place the owner can press Reactivate.
 */
function CrewActiveForm({ row, surface }: { row: CrewRow; surface: 'menu' | 'drawer' }) {
  const action = useMemo(
    () => setCrewActiveAction.bind(null, row.id, !row.active),
    [row.active, row.id],
  );
  const [state, formAction] = useFormState(action, CREW_ACTIVE_ACTION_IDLE);
  const menu = surface === 'menu';

  return (
    <>
      <form action={formAction} className={menu ? styles.menuDanger : undefined}>
        <button type="submit" role={menu ? 'menuitem' : undefined} className={menu ? undefined : 'btn ghost'}>
          {row.active ? (menu ? 'Archive crew member' : 'Archive') : (menu ? 'Reactivate crew member' : 'Reactivate')}
        </button>
      </form>
      {state.status === 'error' ? (
        <p className={styles.crewActiveError} role="alert">{state.message}</p>
      ) : null}
    </>
  );
}

// Close the row menu by ref containment on mousedown, NOT by a click listener:
// Next hydrates into `document`, so React's delegated handler and a document
// listener sit on the same node and stopPropagation can't keep them apart. A
// click handler here unmounts the menu — and any form inside it — in the same
// tick the button is pressed, and the submit silently never happens.
function useRowMenu() {
  const [menuOpen, setMenuOpen] = useState(false);
  // Per row, so every trigger names its own menu rather than all of them
  // naming the first one.
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [menuOpen]);

  return { menuOpen, setMenuOpen, menuRef, menuId };
}

function CrewActions({
  row,
  assigning,
  setAssigning,
  assignId,
  onOpen,
}: {
  row: CrewRow;
  assigning: boolean;
  setAssigning: (next: (previous: boolean) => boolean) => void;
  /** The assign form is a sibling rendered by the row, so its id comes from there. */
  assignId: string;
  onOpen: () => void;
}) {
  const { menuOpen, setMenuOpen, menuRef, menuId } = useRowMenu();
  const { readOnly, basePath } = useRosterMode();

  return (
    <div className={styles.rowActions}>
      {!readOnly && row.active ? (
        <>
          <button
            type="button"
            className={styles.rowBtn}
            onClick={() => setAssigning((v) => !v)}
            aria-expanded={assigning}
            aria-controls={assigning ? assignId : undefined}
          >
            Assign job
          </button>
          {row.workerType === 'employee' && row.fieldApp === 'no-email' ? (
            <button type="button" className={`${styles.rowBtn} ${styles.rowBtnPrimary}`} onClick={onOpen}>
              Add email
            </button>
          ) : row.workerType === 'employee' && needsInvite(row.fieldApp) ? (
            <form action={inviteCrewAction.bind(null, row.id)}>
              <button type="submit" className={`${styles.rowBtn} ${styles.rowBtnPrimary}`}>
                {row.fieldApp === 'expired' ? 'Resend invite' : 'Send invite'}
              </button>
            </form>
          ) : null}
        </>
      ) : null}
      <Link href={hoursHrefFor(row, basePath)} className={styles.rowBtn}>View hours</Link>

      <div className={styles.menuWrap} ref={menuRef}>
        <button
          type="button"
          className={styles.rowBtn}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? menuId : undefined}
          aria-label={`More actions for ${row.name}`}
          onClick={() => setMenuOpen((v) => !v)}
        >
          •••
        </button>
        {menuOpen ? (
          <div id={menuId} className={styles.menu} role="menu">
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onOpen(); }}>
              Edit crew member
            </button>
            {/* Re-inviting is now offered for an EXPIRED invitation and for a
                revoked one, not only for somebody who was never asked. An
                expired link was the state that had no control anywhere on this
                screen: the chip said "Not invited", the button had already been
                pressed, and pressing it again was the fix nobody could see. */}
            {!readOnly && row.active && (needsInvite(row.fieldApp) || row.fieldApp === 'revoked') ? (
              <form action={inviteCrewAction.bind(null, row.id)}>
                <button type="submit" role="menuitem">
                  {row.fieldApp === 'expired' ? 'Send a new invite' : row.fieldApp === 'revoked' ? 'Restore field-app access' : 'Invite to field app'}
                </button>
              </form>
            ) : null}
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onOpen(); }}>
              View full work history
            </button>
            {/* Archive is destructive-adjacent, so it lives behind the menu and
                below a divider rather than beside the everyday actions. */}
            {readOnly ? null : (
            <>
            {/* Taking the app away without archiving somebody: the case where a
                phone is lost, or where a person is still on the crew but should
                not be reading customer addresses this week. Archiving them
                instead would take them off the roster and out of the schedule,
                which is a much bigger claim than the one being made. */}
            {row.active && row.fieldApp !== 'no-email' && row.fieldApp !== 'revoked' && row.workerType !== 'subcontractor' ? (
              <form action={revokeCrewAccessAction.bind(null, row.id)} className={styles.menuDanger}>
                <button type="submit" role="menuitem">Remove field-app access</button>
              </form>
            ) : null}
            <CrewActiveForm row={row} surface="menu" />
            </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AssignForm({ row, assignableJobs, id }: { row: CrewRow; assignableJobs: JobOption[]; id: string }) {
  const { readOnly } = useRosterMode();
  // Nothing to offer when the page cannot save it — and "Assign job" is the one
  // control on this roster somebody would most expect to work.
  if (readOnly) return null;
  return (
    <form id={id} action={assignCrewToJobAction.bind(null, row.id)} className={styles.assignForm}>
      {assignableJobs.length === 0 ? (
        <p className={styles.dim}>No open jobs to assign yet.</p>
      ) : (
        <>
          <label className={styles.assignField}>
            <span>Job</span>
            <select name="jobId" required aria-label={`Assign ${row.name} to a job`}>
              <option value="">Choose a job</option>
              {assignableJobs.map((job) => (
                <option key={job.id} value={job.id}>{job.ref} · {job.clientName}</option>
              ))}
            </select>
          </label>
          <label className={styles.assignNotify}>
            <input type="checkbox" name="notify" defaultChecked />
            <span>Notify {row.name.split(' ')[0]} by text</span>
          </label>
          <SaveButton className="btn primary" pendingLabel="Assigning…" savedLabel="Assigned ✓">Assign</SaveButton>
        </>
      )}
    </form>
  );
}

// What this person is on right now — the one fact the roster exists to answer.
function CurrentJob({ row, showExtra = true }: { row: CrewRow; showExtra?: boolean }) {
  if (row.jobs.length > 0) {
    return (
      <>
        <span className={styles.jobRef}>{row.jobs[0].ref} · {row.jobs[0].clientName}</span>
        {showExtra && row.jobs.length > 1 ? <small>+{row.jobs.length - 1} more</small> : null}
      </>
    );
  }
  if (row.active) return <span className={styles.availablePill}>Available</span>;
  return <span className={styles.dim}>Archived</span>;
}

function periodTitle(periodLabel: string): string {
  return `Hours × the rate on each entry, for ${periodLabel}. Estimated — this product doesn't run payroll.`;
}

/**
 * The one-line difference between the two kinds of person, on every layout.
 *
 * Only rendered for a subcontractor. An "Employee" chip on every employee would
 * be noise on a roster that is mostly employees — the exception is what needs
 * labelling, and the compliance state beside it is the fact that decides whether
 * this firm can be offered work at all.
 */
function WorkerChips({ row }: { row: CrewRow }) {
  if (row.workerType !== 'subcontractor') return null;
  return (
    <span className={dispatch.subChips}>
      <span className={dispatch.chip} data-tone="info">
        {WORKER_TYPE_LABEL.subcontractor}
      </span>
      {row.subStatus && row.subStatus !== 'active' ? (
        <span className={dispatch.chip} data-tone={row.subStatus === 'preferred' ? 'ok' : 'muted'}>
          {SUB_STATUS_LABEL[row.subStatus]}
        </span>
      ) : null}
      {row.compliance ? (
        <span className={dispatch.chip} data-tone={COMPLIANCE_TONE[row.compliance.state] ?? 'muted'}>
          {row.compliance.label}
        </span>
      ) : null}
    </span>
  );
}

/** The six numbers a subcontractor is judged on. See lib/subcontractors. */
function SubMetricsPanel({ row }: { row: CrewRow }) {
  if (!row.subMetrics) return null;
  const metrics = row.subMetrics;
  return (
    <dl className={dispatch.subMetrics}>
      <div className={dispatch.subMetric}>
        <strong>{metrics.offered}</strong>
        <span>Jobs offered</span>
      </div>
      <div className={dispatch.subMetric}>
        <strong>{metrics.accepted}</strong>
        <span>Accepted</span>
      </div>
      <div className={dispatch.subMetric}>
        <strong>{metrics.completed}</strong>
        <span>Completed</span>
      </div>
      <div className={dispatch.subMetric}>
        <strong>{formatResponseTime(metrics.responseMinutes)}</strong>
        <span>Avg response</span>
      </div>
      <div className={dispatch.subMetric}>
        <strong>{formatRate(metrics.acceptanceRate)}</strong>
        <span>Acceptance</span>
      </div>
      <div className={dispatch.subMetric}>
        <strong>{formatRating(metrics.rating)}</strong>
        <span>Internal rating</span>
      </div>
    </dl>
  );
}

// -- layouts ------------------------------------------------------------------

function CrewRowItem({
  row,
  assignableJobs,
  periodLabel,
  justAdded = false,
  onOpen,
}: {
  row: CrewRow;
  assignableJobs: JobOption[];
  periodLabel: string;
  /** Just created from the add drawer — the one the roster scrolled to. */
  justAdded?: boolean;
  onOpen: () => void;
}) {
  const [assigning, setAssigning] = useState(false);
  const assignId = useId();

  return (
    <li className={`${styles.row}${row.active ? '' : ` ${styles.rowArchived}`}${justAdded ? ` ${styles.justAdded}` : ''}`}>
      {/* The row itself opens the profile. The actions below carry their own
          handlers and stop the click, so nothing here swallows them.

          data-crew-row is how the roster finds this person after the add drawer
          creates them — see handleAdded. Every layout carries it, so "we took
          you to their card" is true in Rows, Cards, Board and Table alike. */}
      <button
        type="button"
        className={styles.rowOpen}
        data-crew-row={row.id}
        onClick={onOpen}
        aria-label={`Open ${row.name}'s profile`}
      >
        <span className={styles.rowIdentity}>
          <span className={styles.avatar} data-avatar-tone={avatarTone(row.name)} aria-hidden="true">
            {row.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={row.photoUrl} alt="" />
            ) : (
              row.initials
            )}
          </span>
          <span className={styles.rowNames}>
            <strong>{row.displayName}</strong>
            <small>
              {row.workerType === 'subcontractor'
                ? row.trades.slice(0, 2).join(' · ') || 'Subcontractor'
                : `${row.roleLabel} · ${row.rateLabel}`}
            </small>
            <WorkerChips row={row} />
          </span>
        </span>

        <span className={styles.rowContact}>
          {row.phoneLabel ? <span>{row.phoneLabel}</span> : <span className={styles.dim}>No phone</span>}
          <FieldAppChip row={row} />
        </span>

        <span className={styles.rowJobs}>
          <CurrentJob row={row} />
        </span>

        <span className={styles.rowPeriod}>
          <strong>{row.periodHours} hrs</strong>
          <small title={periodTitle(periodLabel)}>{row.periodPayLabel} est.</small>
        </span>
      </button>

      <CrewActions row={row} assigning={assigning} setAssigning={setAssigning} assignId={assignId} onOpen={onOpen} />

      {assigning ? <AssignForm row={row} assignableJobs={assignableJobs} id={assignId} /> : null}
    </li>
  );
}

// Cards: the roster as people rather than as records. The photo is the point —
// on a crew of twenty, a face is faster to find than a name.
function CrewCardItem({
  row,
  assignableJobs,
  periodLabel,
  justAdded = false,
  onOpen,
}: {
  row: CrewRow;
  assignableJobs: JobOption[];
  periodLabel: string;
  /** Just created from the add drawer — the one the roster scrolled to. */
  justAdded?: boolean;
  onOpen: () => void;
}) {
  const [assigning, setAssigning] = useState(false);
  const assignId = useId();

  return (
    <li className={`${styles.card}${row.active ? '' : ` ${styles.rowArchived}`}${justAdded ? ` ${styles.justAdded}` : ''}`}>
      <button
        type="button"
        className={styles.cardOpen}
        data-crew-row={row.id}
        onClick={onOpen}
        aria-label={`Open ${row.name}'s profile`}
      >
        <span className={styles.cardAvatar} data-avatar-tone={avatarTone(row.name)} aria-hidden="true">
          {row.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.photoUrl} alt="" />
          ) : (
            row.initials
          )}
        </span>
        <span className={styles.cardNames}>
          <strong>{row.displayName}</strong>
          <small>
            {row.workerType === 'subcontractor'
              ? row.trades.slice(0, 2).join(' · ') || 'Subcontractor'
              : `${row.roleLabel} · ${row.rateLabel}`}
          </small>
          <WorkerChips row={row} />
        </span>
      </button>

      <dl className={styles.cardFacts}>
        <div>
          <dt>Current job</dt>
          <dd><CurrentJob row={row} /></dd>
        </div>
        <div>
          <dt>{periodLabel}</dt>
          <dd title={periodTitle(periodLabel)}>
            <strong>{row.periodHours} hrs</strong> <span className={styles.dim}>· {row.periodPayLabel} est.</span>
          </dd>
        </div>
        <div>
          <dt>Contact</dt>
          <dd>
            {row.phoneLabel ?? <span className={styles.dim}>No phone</span>}{' '}
            <FieldAppChip row={row} />
          </dd>
        </div>
      </dl>

      <CrewActions row={row} assigning={assigning} setAssigning={setAssigning} assignId={assignId} onOpen={onOpen} />

      {assigning ? <AssignForm row={row} assignableJobs={assignableJobs} id={assignId} /> : null}
    </li>
  );
}

// Board: one question, answered by the shape of the screen — who can I send
// somewhere right now, and who is already out.
function CrewBoardItem({
  row,
  assignableJobs,
  periodLabel,
  justAdded = false,
  onOpen,
}: {
  row: CrewRow;
  assignableJobs: JobOption[];
  periodLabel: string;
  /** Just created from the add drawer — the one the roster scrolled to. */
  justAdded?: boolean;
  onOpen: () => void;
}) {
  const [assigning, setAssigning] = useState(false);
  const assignId = useId();

  return (
    <li className={`${styles.boardCard}${justAdded ? ` ${styles.justAdded}` : ''}`}>
      <button
        type="button"
        className={styles.boardOpen}
        data-crew-row={row.id}
        onClick={onOpen}
        aria-label={`Open ${row.name}'s profile`}
      >
        <span className={styles.avatar} data-avatar-tone={avatarTone(row.name)} aria-hidden="true">
          {row.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.photoUrl} alt="" />
          ) : (
            row.initials
          )}
        </span>
        <span className={styles.rowNames}>
          <strong>{row.name}</strong>
          <small>{row.roleLabel} · {row.rateLabel}</small>
          <small title={periodTitle(periodLabel)}>
            {row.periodHours} hrs · {row.periodPayLabel} est.
            {row.jobs.length > 0 ? ` · ${row.jobs[0].ref}` : ''}
          </small>
        </span>
      </button>

      <CrewActions row={row} assigning={assigning} setAssigning={setAssigning} assignId={assignId} onOpen={onOpen} />

      {assigning ? <AssignForm row={row} assignableJobs={assignableJobs} id={assignId} /> : null}
    </li>
  );
}

// Table: every column at once, for the shop where the roster is long enough
// that comparing two people line by line beats scrolling cards.
function CrewTableRow({
  row,
  assignableJobs,
  periodLabel,
  justAdded = false,
  onOpen,
}: {
  row: CrewRow;
  assignableJobs: JobOption[];
  periodLabel: string;
  /** Just created from the add drawer — the one the roster scrolled to. */
  justAdded?: boolean;
  onOpen: () => void;
}) {
  const [assigning, setAssigning] = useState(false);
  const assignId = useId();

  return (
    <>
      <tr className={`${row.active ? '' : styles.rowArchived}${justAdded ? ` ${styles.justAdded}` : ''}`.trim() || undefined}>
        <th scope="row">
          <button type="button" className={styles.tableName} data-crew-row={row.id} onClick={onOpen}>
            <span className={styles.avatarSm} data-avatar-tone={avatarTone(row.name)} aria-hidden="true">
              {row.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={row.photoUrl} alt="" />
              ) : (
                row.initials
              )}
            </span>
            {row.name}
          </button>
        </th>
        <td>{row.roleLabel || <span className={styles.dim}>—</span>}</td>
        <td className={styles.num}>{row.rateLabel}</td>
        <td>{row.phoneLabel ?? <span className={styles.dim}>No phone</span>}</td>
        <td>
          <FieldAppChip row={row} withDetail={false} />
        </td>
        <td><CurrentJob row={row} /></td>
        <td className={styles.num}>{row.periodHours}</td>
        <td className={styles.num} title={periodTitle(periodLabel)}>{row.periodPayLabel}</td>
        <td>
          <CrewActions row={row} assigning={assigning} setAssigning={setAssigning} assignId={assignId} onOpen={onOpen} />
        </td>
      </tr>
      {/* A form inside a cell would break the column grid, so it gets its own
          full-width row directly under the person it belongs to. */}
      {assigning ? (
        <tr className={styles.tableAssignRow}>
          <td colSpan={9}>
            <AssignForm row={row} assignableJobs={assignableJobs} id={assignId} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function CrewDrawer({ row, onClose, periodLabel }: { row: CrewRow; onClose: () => void; periodLabel: string }) {
  const { readOnly, basePath } = useRosterMode();
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', escape);
    // The page behind a drawer must not scroll under it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', escape);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className={styles.drawerBackdrop} role="dialog" aria-modal="true" aria-label={`${row.name} profile`}>
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
      <div className={styles.drawerScrim} onClick={onClose} />
      <section className={styles.drawer}>
        <header className={styles.drawerHead}>
          <CrewPhotoUpload
            action={updateCrewPhotoAction.bind(null, row.id)}
            photoUrl={row.photoUrl}
            initials={row.initials}
            name={row.name}
          />
          <div>
            <h2>{row.displayName}</h2>
            <p>
              {row.workerType === 'subcontractor'
                ? [row.companyName ? row.name : null, row.trades.join(' · ') || 'Subcontractor'].filter(Boolean).join(' · ')
                : `${row.roleLabel} · ${row.rateLabel}`}
            </p>
            <WorkerChips row={row} />
          </div>
          <button type="button" className={styles.drawerClose} onClick={onClose} aria-label="Close">✕</button>
        </header>

        {/* A subcontractor's headline is their record with you, not a pay
            period they were never in. The hours summary below is the employee's
            version of the same question. */}
        {row.workerType === 'subcontractor' ? (
          <div className={styles.drawerSection}>
            <h3>Their record with you</h3>
            <SubMetricsPanel row={row} />
          </div>
        ) : (
          <div className={styles.drawerSummary}>
            <div>
              <small>This pay period</small>
              <strong>{row.periodHours} hours</strong>
              <span>{row.periodPayLabel} estimated</span>
              <em>{periodLabel}</em>
            </div>
            <Link href={`/dashboard/crew?tab=hours&crew=${row.id}`} className="btn secondary">
              View hours &amp; pay
            </Link>
          </div>
        )}

        {row.jobs.length > 0 ? (
          <div className={styles.drawerJobs}>
            <h3>On these jobs</h3>
            {row.jobs.map((job) => (
              <Link key={job.id} href={`${basePath}/jobs/${job.id}`} className={styles.jobChip}>
                {job.ref} · {job.clientName}
              </Link>
            ))}
          </div>
        ) : null}

        {/* TWO EDIT FORMS, and which one you get is decided by what this person
            IS — not by a toggle. A subcontractor has no pay type, no field-app
            invitation and no arrival permissions; an employee has no insurance
            expiry and no travel radius. One form carrying both sets would be a
            form where most of the fields do not apply to whoever is in front of
            you, which is how a licence expiry ends up on a payroll record. */}
        {!readOnly && row.workerType === 'subcontractor' && row.subProfile ? (
          <details className={styles.drawerSection}>
            <summary>Edit subcontractor</summary>
            <form action={updateSubcontractorAction.bind(null, row.id)} className={styles.addForm}>
              <SubcontractorFields
                idPrefix={`sub-${row.id}`}
                profile={row.subProfile}
                knownTrades={row.trades}
                contactName={row.name}
                phone={row.phone ?? ''}
                email={row.email ?? ''}
                baseAddress={row.startAddress ?? ''}
              />
              <div className="field full">
                <SaveButton>Save subcontractor</SaveButton>
              </div>
            </form>
          </details>
        ) : null}

        {readOnly || row.workerType === 'subcontractor' ? null : (
          <details className={styles.drawerSection} open={row.fieldApp === 'no-email'}>
          <summary>Edit crew member</summary>
          <form action={updateCrewAction.bind(null, row.id)} className="form-grid compact-form">
            <div className="field">
              <label htmlFor={`name-${row.id}`}>Name</label>
              <input id={`name-${row.id}`} name="name" required defaultValue={row.name} />
            </div>
            <div className="field">
              <label htmlFor={`phone-${row.id}`}>Phone</label>
              <input id={`phone-${row.id}`} name="phone" type="tel" required defaultValue={row.phone ?? ''} />
            </div>
            <div className="field">
              <label htmlFor={`email-${row.id}`}>Email (for the field app)</label>
              <input id={`email-${row.id}`} name="email" type="email" defaultValue={row.email ?? ''} placeholder="mike@example.com" />
            </div>
            <div className="field">
              <label htmlFor={`roleLabel-${row.id}`}>Role</label>
              <input id={`roleLabel-${row.id}`} name="roleLabel" defaultValue={row.roleLabel} />
            </div>
            <PayTypeFields
              idPrefix={row.id}
              payType={row.payType}
              hourlyRate={row.hourlyRate}
              annualSalary={row.annualSalary ?? ''}
              dayRate={row.dayRate ?? ''}
              payrollId={row.payrollId ?? ''}
            />
            <div className="field full">
              <label htmlFor={`startAddress-${row.id}`}>Starts the day at (optional)</label>
              {/* Plan my day measures this person's route from here instead of
                  the shop when the day is filtered to them. Verified as you type
                  because an address that won't geocode stores no coordinates and
                  silently falls back to the business address. */}
              <AddressAutocomplete
                id={`startAddress-${row.id}`}
                name="startAddress"
                defaultValue={row.startAddress ?? ''}
                placeholder="Their home or the yard they leave from"
              />
              <small className="field-hint">
                Leave blank to start their day from the business address like everyone else.
              </small>
            </div>

            {/* Arrival permissions. Deliberately spelled out rather than rolled
                into a "role", because these four are the ones with a customer
                or an employee on the other end of them. */}
            <fieldset className="field full crew-permissions">
              <legend>What they can do on a visit</legend>
              <label className="checkbox-row" htmlFor={`canSendArrival-${row.id}`}>
                <input id={`canSendArrival-${row.id}`} name="canSendArrival" type="checkbox" defaultChecked={row.permissions.send} />
                <span>Send &ldquo;on my way&rdquo; updates to customers</span>
              </label>
              <label className="checkbox-row" htmlFor={`canShareLocation-${row.id}`}>
                <input id={`canShareLocation-${row.id}`} name="canShareLocation" type="checkbox" defaultChecked={row.permissions.shareLocation} />
                <span>Share their location on the customer&rsquo;s status page</span>
              </label>
              <label className="checkbox-row" htmlFor={`canViewClientContact-${row.id}`}>
                <input id={`canViewClientContact-${row.id}`} name="canViewClientContact" type="checkbox" defaultChecked={row.permissions.viewContact} />
                <span>See the customer&rsquo;s phone number in the field app</span>
              </label>
              <label className="checkbox-row" htmlFor={`canReschedule-${row.id}`}>
                <input id={`canReschedule-${row.id}`} name="canReschedule" type="checkbox" defaultChecked={row.permissions.reschedule} />
                <span>Mark a visit rescheduled from the field</span>
              </label>
            </fieldset>

            <div className="field full">
              <SaveButton>Save crew member</SaveButton>
            </div>
          </form>
        </details>
        )}

        <div className={styles.drawerSection}>
          <CrewWorkHistory crewId={row.id} />
        </div>

        {readOnly ? null : (
        <footer className={styles.drawerFoot}>
          {/* A subcontractor is never invited to the field app: it signs a
              person in to log hours against your payroll, which is exactly the
              relationship a subcontractor does not have with you. */}
          {/* THE WHOLE LIFECYCLE, in the one place an owner is already looking
              when they wonder why somebody can't get in. Each state gets the
              control that is actually its fix, and the date underneath says
              which state it is — "Invited 3 days ago · link expired" is the
              sentence that ends the phone call. */}
          {row.workerType === 'subcontractor' ? null : (
            <div className={styles.drawerApp}>
              <FieldAppChip row={row} />
              {row.active && (needsInvite(row.fieldApp) || row.fieldApp === 'revoked') ? (
                <form action={inviteCrewAction.bind(null, row.id)}>
                  <SaveButton className="btn secondary" pendingLabel="Sending…" savedLabel="Invite sent ✓">
                    {row.fieldApp === 'expired'
                      ? 'Send a new invite'
                      : row.fieldApp === 'revoked'
                        ? 'Restore access & re-invite'
                        : 'Invite to field app'}
                  </SaveButton>
                </form>
              ) : row.fieldApp === 'no-email' ? (
                <span className={styles.dim}>Add an email above to invite them to the field app.</span>
              ) : null}
              {/* Resending to somebody who is waiting is deliberately offered
                  too: the commonest reason a live invitation goes unused is
                  that it went to spam, and the owner's only recourse used to be
                  to wait an hour for it to expire. */}
              {row.active && row.fieldApp === 'invited' ? (
                <form action={inviteCrewAction.bind(null, row.id)}>
                  <SaveButton className="btn ghost" pendingLabel="Sending…" savedLabel="Sent again ✓">
                    Send it again
                  </SaveButton>
                </form>
              ) : null}
              {row.active && (row.fieldApp === 'linked' || row.fieldApp === 'invited') ? (
                <ConfirmActionButton
                  action={revokeCrewAccessAction.bind(null, row.id)}
                  confirmMessage={`Remove ${row.name}'s field-app access? They stay on the crew — they just can't sign in.`}
                  className="btn ghost"
                  pendingLabel="Removing…"
                  savedLabel="Removed ✓"
                >
                  Remove field-app access
                </ConfirmActionButton>
              ) : null}
            </div>
          )}
          <CrewActiveForm row={row} surface="drawer" />
          {!row.active ? (
            <ConfirmActionButton
              action={deleteArchivedCrewAction.bind(null, row.id)}
              confirmMessage={`Delete ${row.name}? This can't be undone.`}
              className="btn danger"
              pendingLabel="Deleting…"
              savedLabel="Deleted ✓"
            >
              Delete
            </ConfirmActionButton>
          ) : null}
        </footer>
        )}
      </section>
    </div>
  );
}
