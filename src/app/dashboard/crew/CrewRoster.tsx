'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import CrewWorkHistory from '@/components/crew-work-history';
import SaveButton from '@/components/save-button';
import AddressAutocomplete from '@/components/address-autocomplete';
import ViewGear, { type ViewOption } from '@/components/view-gear';
import ConfirmActionButton from '@/app/dashboard/jobs/[id]/ConfirmActionButton';
import { setCrewSkinAction, setRosterViewAction } from '@/app/dashboard/view-actions';
import type { CrewSkin, RosterView } from '@/lib/dashboard-views';
import { rosterNextStep, rosterTotals } from '@/lib/crew-roster';
import type { PayType } from '@/lib/pay-types';
import { CREW_SKIN_OPTIONS, applyCrewSkin } from './crew-skins';
import CrewPhotoUpload from './CrewPhotoUpload';
import PayTypeFields from './PayTypeFields';
import {
  assignCrewToJobAction,
  createCrewAction,
  deleteArchivedCrewAction,
  inviteCrewAction,
  setCrewActiveAction,
  updateCrewAction,
  updateCrewPhotoAction,
} from './actions';
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
  active: boolean;
  fieldApp: 'linked' | 'invitable' | 'no-email';
  jobs: { id: string; ref: string; clientName: string }[];
  periodHours: number;
  periodPay: number;
  periodPayLabel: string;
  createdAt: string;
};

type JobOption = { id: string; ref: string; clientName: string };

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
const ROSTER_VIEW_OPTIONS: ViewOption<RosterView>[] = [
  { id: 'rows', label: 'Rows', hint: 'One line each, the everyday roster' },
  { id: 'cards', label: 'Cards', hint: 'Photos and details, a card per person' },
  { id: 'board', label: 'Board', hint: "Split by who's free and who's out on a job" },
  { id: 'table', label: 'Table', hint: 'Dense columns for a big crew' },
  { id: 'focus', label: 'Focus', hint: 'The roster, with what needs doing pinned beside it' },
];

function money(amount: number): string {
  return `$${Math.round(amount).toLocaleString('en-US')}`;
}

const FIELD_APP_LABEL: Record<CrewRow['fieldApp'], string> = {
  linked: 'Field app',
  invitable: 'Not invited',
  'no-email': 'No email',
};

const FIELD_APP_TITLE: Record<CrewRow['fieldApp'], string> = {
  linked: 'Signed in to the field app — they can see their jobs and log hours from site.',
  invitable: 'Has an email but hasn\'t been invited to the field app yet.',
  'no-email': 'Add an email address before they can be invited to the field app.',
};

export default function CrewRoster({
  rows,
  assignableJobs,
  periodLabel,
  initialStatus,
  initialView,
  initialSkin,
  openAdd,
}: {
  rows: CrewRow[];
  assignableJobs: JobOption[];
  periodLabel: string;
  initialStatus: 'active' | 'archived';
  initialView: RosterView;
  initialSkin: CrewSkin;
  openAdd: boolean;
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'active' | 'archived'>(initialStatus);
  const [role, setRole] = useState('all');
  const [jobFilter, setJobFilter] = useState('all');
  const [appFilter, setAppFilter] = useState('all');
  const [sort, setSort] = useState<SortId>('name');
  const [openId, setOpenId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(openAdd);
  const [view, setView] = useState<RosterView>(initialView);
  const [skin, setSkin] = useState<CrewSkin>(initialSkin);
  const [, startViewSave] = useTransition();

  // The layout changes immediately; remembering it is a background write. A
  // cookie that fails to save is a worse view tomorrow, not a broken page now.
  function pickView(next: RosterView) {
    setView(next);
    startViewSave(() => {
      void setRosterViewAction(next).catch(() => {});
    });
  }

  // The skin is worn by the shell, which the page above renders — so the class
  // is swapped here and the cookie caught up in the background, the same shape
  // as pickView. Layout is deliberately untouched.
  function pickSkin(next: CrewSkin) {
    setSkin(next);
    applyCrewSkin(next);
    startViewSave(() => {
      void setCrewSkinAction(next).catch(() => {});
    });
  }

  // Board columns, the nine-column table and Focus's rail all want more than the
  // 1100px cap, and the shell is rendered by the page above this component. The
  // server sets the class from the cookie so the first paint is right; this
  // keeps it in step the moment the view changes rather than making a layout
  // change wait on a round trip.
  const wide = view === 'board' || view === 'table' || view === 'focus';
  useEffect(() => {
    const main = document.querySelector('main.wide-shell');
    if (!main) return;
    main.classList.toggle('crew-wide', wide);
    // Focus is a page theme, so the shell wears it too — toggled here as well as
    // set server-side from the cookie, or switching view would leave the page
    // half-dressed until the next navigation.
    main.classList.toggle('crew-focus', view === 'focus');
    return () => {
      main.classList.remove('crew-wide');
      main.classList.remove('crew-focus');
    };
  }, [wide, view]);

  const roles = useMemo(
    () => [...new Set(rows.map((row) => row.roleLabel).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (status === 'active' ? !row.active : row.active) return false;
      if (role !== 'all' && row.roleLabel !== role) return false;
      if (appFilter !== 'all' && row.fieldApp !== appFilter) return false;
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
        row.roleLabel.toLowerCase().includes(needle) ||
        (row.phoneLabel ?? '').toLowerCase().includes(needle) ||
        (row.phone ?? '').toLowerCase().includes(needle) ||
        (row.email ?? '').toLowerCase().includes(needle) ||
        row.jobs.some((job) => `${job.ref} ${job.clientName}`.toLowerCase().includes(needle))
      );
    });

    return filtered.sort((a, b) => {
      if (sort === 'hours') return b.periodHours - a.periodHours || a.name.localeCompare(a.name);
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
  }, [rows, query, status, role, jobFilter, appFilter, sort]);

  const activeCount = rows.filter((row) => row.active).length;
  const selected = openId ? rows.find((row) => row.id === openId) ?? null : null;

  // Focus's rail. Derived from every row rather than the filtered ones — what's
  // wrong with the crew doesn't change because you searched for someone.
  const nextStep = useMemo(() => rosterNextStep(rows), [rows]);
  const totals = useMemo(() => rosterTotals(rows), [rows]);

  // The board's whole point: who could you send somewhere right now. Archived
  // people get their own column rather than being called "available", which
  // they emphatically are not.
  const columns = useMemo(() => {
    const free = visible.filter((row) => row.active && row.jobs.length === 0);
    const busy = visible.filter((row) => row.active && row.jobs.length > 0);
    const archived = visible.filter((row) => !row.active);
    return [
      { id: 'free', label: 'Available now', hint: 'Nobody has them booked today', rows: free },
      { id: 'busy', label: 'On a job', hint: 'Already assigned', rows: busy },
      ...(archived.length > 0 ? [{ id: 'archived', label: 'Archived', hint: 'Not on the crew right now', rows: archived }] : []),
    ];
  }, [visible]);

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.search}>
          <span aria-hidden="true">🔎</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search crew by name, role, phone or job"
            aria-label="Search crew"
          />
        </div>

        <div className={styles.filters}>
          <label className={styles.filter}>
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as 'active' | 'archived')}>
              <option value="active">Active ({activeCount})</option>
              <option value="archived">Archived ({rows.length - activeCount})</option>
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
              <option value="assigned">On a job</option>
              {assignableJobs.map((job) => (
                <option key={job.id} value={job.id}>{job.ref} · {job.clientName}</option>
              ))}
            </select>
          </label>

          <label className={styles.filter}>
            <span>Field app</span>
            <select value={appFilter} onChange={(event) => setAppFilter(event.target.value)}>
              <option value="all">Any</option>
              <option value="linked">Signed in</option>
              <option value="invitable">Not invited</option>
              <option value="no-email">No email</option>
            </select>
          </label>

          <label className={styles.filter}>
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
              activeView={view}
              onPickView={pickView}
              skins={CREW_SKIN_OPTIONS}
              activeSkin={skin}
              onPickSkin={pickSkin}
              label="View"
            />
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className={styles.empty}>
          <h3>No crew members yet</h3>
          <p>Add the people who work with you — then assign them jobs and their hours roll up here.</p>
          <button type="button" className="btn primary" onClick={() => setAddOpen(true)}>+ Add crew member</button>
        </div>
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
              ) : nextStep.id === 'empty' ? (
                <button type="button" className="btn primary" onClick={() => setAddOpen(true)}>+ Add crew member</button>
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
                    <b>{totals.onJob}</b> on a job
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
                <li><button type="button" onClick={() => setAddOpen(true)}>Add crew member</button></li>
                <li><Link href="/dashboard/crew?tab=hours">Review hours &amp; pay</Link></li>
                <li><Link href="/dashboard/crew?tab=labor">Labor by job</Link></li>
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
                onOpen={() => setOpenId(row.id)}
              />
            ))}
          </ul>
        </>
      )}

      {selected ? <CrewDrawer row={selected} onClose={() => setOpenId(null)} periodLabel={periodLabel} /> : null}

      <section id="add-crew" className={styles.addPanel} data-open={addOpen || undefined}>
        <button type="button" className={styles.addToggle} aria-expanded={addOpen} onClick={() => setAddOpen((v) => !v)}>
          <span className="btn primary">+ Add crew member</span>
          <span>They&apos;ll get a text when you assign them to a job.</span>
        </button>
        {addOpen ? (
          <form action={createCrewAction} className="form-grid">
            <div className="field">
              <label htmlFor="name">Name</label>
              <input id="name" name="name" required placeholder="Mike Torres" />
            </div>
            <div className="field">
              <label htmlFor="phone">Phone</label>
              <input id="phone" name="phone" type="tel" required placeholder="(248) 555-0117" />
            </div>
            <div className="field">
              <label htmlFor="email">Email (for the field app)</label>
              <input id="email" name="email" type="email" placeholder="mike@example.com" />
            </div>
            <div className="field">
              <label htmlFor="roleLabel">Role</label>
              <input id="roleLabel" name="roleLabel" placeholder="Laborer" />
            </div>
            <PayTypeFields idPrefix="new" />
            <div className="field full">
              <label htmlFor="photo">Crew photo</label>
              <input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/avif" capture="environment" />
            </div>
            <div className="field full">
              <SaveButton pendingLabel="Adding…" savedLabel="Added ✓">Add crew member</SaveButton>
            </div>
          </form>
        ) : null}
      </section>
    </>
  );
}

// -- shared pieces ------------------------------------------------------------
//
// Four layouts, one set of actions. Extracted rather than copied so that
// "Assign job" can never mean something subtly different depending on which
// view the owner happens to have chosen.

function hoursHrefFor(row: CrewRow): string {
  return `/dashboard/crew?tab=hours&crew=${row.id}`;
}

// Close the row menu by ref containment on mousedown, NOT by a click listener:
// Next hydrates into `document`, so React's delegated handler and a document
// listener sit on the same node and stopPropagation can't keep them apart. A
// click handler here unmounts the menu — and any form inside it — in the same
// tick the button is pressed, and the submit silently never happens.
function useRowMenu() {
  const [menuOpen, setMenuOpen] = useState(false);
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

  return { menuOpen, setMenuOpen, menuRef };
}

function CrewActions({
  row,
  assigning,
  setAssigning,
  onOpen,
}: {
  row: CrewRow;
  assigning: boolean;
  setAssigning: (next: (previous: boolean) => boolean) => void;
  onOpen: () => void;
}) {
  const { menuOpen, setMenuOpen, menuRef } = useRowMenu();

  return (
    <div className={styles.rowActions}>
      {row.active ? (
        <button type="button" className={styles.rowBtn} onClick={() => setAssigning((v) => !v)} aria-expanded={assigning}>
          Assign job
        </button>
      ) : null}
      <Link href={hoursHrefFor(row)} className={styles.rowBtn}>View hours</Link>

      <div className={styles.menuWrap} ref={menuRef}>
        <button
          type="button"
          className={styles.rowBtn}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`More actions for ${row.name}`}
          onClick={() => setMenuOpen((v) => !v)}
        >
          •••
        </button>
        {menuOpen ? (
          <div className={styles.menu} role="menu">
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onOpen(); }}>
              Edit crew member
            </button>
            {row.active && row.fieldApp === 'invitable' ? (
              <form action={inviteCrewAction.bind(null, row.id)}>
                <button type="submit" role="menuitem">Invite to field app</button>
              </form>
            ) : null}
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onOpen(); }}>
              View full work history
            </button>
            {/* Archive is destructive-adjacent, so it lives behind the menu and
                below a divider rather than beside the everyday actions. */}
            <form action={setCrewActiveAction.bind(null, row.id, !row.active)} className={styles.menuDanger}>
              <button type="submit" role="menuitem">
                {row.active ? 'Archive crew member' : 'Reactivate crew member'}
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AssignForm({ row, assignableJobs }: { row: CrewRow; assignableJobs: JobOption[] }) {
  return (
    <form action={assignCrewToJobAction.bind(null, row.id)} className={styles.assignForm}>
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

// -- layouts ------------------------------------------------------------------

function CrewRowItem({
  row,
  assignableJobs,
  periodLabel,
  onOpen,
}: {
  row: CrewRow;
  assignableJobs: JobOption[];
  periodLabel: string;
  onOpen: () => void;
}) {
  const [assigning, setAssigning] = useState(false);

  return (
    <li className={`${styles.row}${row.active ? '' : ` ${styles.rowArchived}`}`}>
      {/* The row itself opens the profile. The actions below carry their own
          handlers and stop the click, so nothing here swallows them. */}
      <button type="button" className={styles.rowOpen} onClick={onOpen} aria-label={`Open ${row.name}'s profile`}>
        <span className={styles.rowIdentity}>
          <span className={styles.avatar} aria-hidden="true">
            {row.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={row.photoUrl} alt="" />
            ) : (
              row.initials
            )}
          </span>
          <span className={styles.rowNames}>
            <strong>{row.name}</strong>
            <small>
              {row.roleLabel} · {row.rateLabel}
            </small>
          </span>
        </span>

        <span className={styles.rowContact}>
          {row.phoneLabel ? <span>{row.phoneLabel}</span> : <span className={styles.dim}>No phone</span>}
          <span className={styles.appChip} data-state={row.fieldApp} title={FIELD_APP_TITLE[row.fieldApp]}>
            {FIELD_APP_LABEL[row.fieldApp]}
          </span>
        </span>

        <span className={styles.rowJobs}>
          <CurrentJob row={row} />
        </span>

        <span className={styles.rowPeriod}>
          <strong>{row.periodHours} hrs</strong>
          <small title={periodTitle(periodLabel)}>{row.periodPayLabel} est.</small>
        </span>
      </button>

      <CrewActions row={row} assigning={assigning} setAssigning={setAssigning} onOpen={onOpen} />

      {assigning ? <AssignForm row={row} assignableJobs={assignableJobs} /> : null}
    </li>
  );
}

// Cards: the roster as people rather than as records. The photo is the point —
// on a crew of twenty, a face is faster to find than a name.
function CrewCardItem({
  row,
  assignableJobs,
  periodLabel,
  onOpen,
}: {
  row: CrewRow;
  assignableJobs: JobOption[];
  periodLabel: string;
  onOpen: () => void;
}) {
  const [assigning, setAssigning] = useState(false);

  return (
    <li className={`${styles.card}${row.active ? '' : ` ${styles.rowArchived}`}`}>
      <button type="button" className={styles.cardOpen} onClick={onOpen} aria-label={`Open ${row.name}'s profile`}>
        <span className={styles.cardAvatar} aria-hidden="true">
          {row.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.photoUrl} alt="" />
          ) : (
            row.initials
          )}
        </span>
        <span className={styles.cardNames}>
          <strong>{row.name}</strong>
          <small>{row.roleLabel} · {row.rateLabel}</small>
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
            <span className={styles.appChip} data-state={row.fieldApp} title={FIELD_APP_TITLE[row.fieldApp]}>
              {FIELD_APP_LABEL[row.fieldApp]}
            </span>
          </dd>
        </div>
      </dl>

      <CrewActions row={row} assigning={assigning} setAssigning={setAssigning} onOpen={onOpen} />

      {assigning ? <AssignForm row={row} assignableJobs={assignableJobs} /> : null}
    </li>
  );
}

// Board: one question, answered by the shape of the screen — who can I send
// somewhere right now, and who is already out.
function CrewBoardItem({
  row,
  assignableJobs,
  periodLabel,
  onOpen,
}: {
  row: CrewRow;
  assignableJobs: JobOption[];
  periodLabel: string;
  onOpen: () => void;
}) {
  const [assigning, setAssigning] = useState(false);

  return (
    <li className={styles.boardCard}>
      <button type="button" className={styles.boardOpen} onClick={onOpen} aria-label={`Open ${row.name}'s profile`}>
        <span className={styles.avatar} aria-hidden="true">
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

      <CrewActions row={row} assigning={assigning} setAssigning={setAssigning} onOpen={onOpen} />

      {assigning ? <AssignForm row={row} assignableJobs={assignableJobs} /> : null}
    </li>
  );
}

// Table: every column at once, for the shop where the roster is long enough
// that comparing two people line by line beats scrolling cards.
function CrewTableRow({
  row,
  assignableJobs,
  periodLabel,
  onOpen,
}: {
  row: CrewRow;
  assignableJobs: JobOption[];
  periodLabel: string;
  onOpen: () => void;
}) {
  const [assigning, setAssigning] = useState(false);

  return (
    <>
      <tr className={row.active ? undefined : styles.rowArchived}>
        <th scope="row">
          <button type="button" className={styles.tableName} onClick={onOpen}>
            <span className={styles.avatarSm} aria-hidden="true">
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
          <span className={styles.appChip} data-state={row.fieldApp} title={FIELD_APP_TITLE[row.fieldApp]}>
            {FIELD_APP_LABEL[row.fieldApp]}
          </span>
        </td>
        <td><CurrentJob row={row} /></td>
        <td className={styles.num}>{row.periodHours}</td>
        <td className={styles.num} title={periodTitle(periodLabel)}>{row.periodPayLabel}</td>
        <td>
          <CrewActions row={row} assigning={assigning} setAssigning={setAssigning} onOpen={onOpen} />
        </td>
      </tr>
      {/* A form inside a cell would break the column grid, so it gets its own
          full-width row directly under the person it belongs to. */}
      {assigning ? (
        <tr className={styles.tableAssignRow}>
          <td colSpan={9}>
            <AssignForm row={row} assignableJobs={assignableJobs} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function CrewDrawer({ row, onClose, periodLabel }: { row: CrewRow; onClose: () => void; periodLabel: string }) {
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
            <h2>{row.name}</h2>
            <p>{row.roleLabel} · {row.rateLabel}</p>
          </div>
          <button type="button" className={styles.drawerClose} onClick={onClose} aria-label="Close">✕</button>
        </header>

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

        {row.jobs.length > 0 ? (
          <div className={styles.drawerJobs}>
            <h3>On these jobs</h3>
            {row.jobs.map((job) => (
              <Link key={job.id} href={`/dashboard/jobs/${job.id}`} className={styles.jobChip}>
                {job.ref} · {job.clientName}
              </Link>
            ))}
          </div>
        ) : null}

        <details className={styles.drawerSection}>
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
            <div className="field full">
              <SaveButton>Save crew member</SaveButton>
            </div>
          </form>
        </details>

        <div className={styles.drawerSection}>
          <CrewWorkHistory crewId={row.id} />
        </div>

        <footer className={styles.drawerFoot}>
          {row.active && row.fieldApp === 'invitable' ? (
            <form action={inviteCrewAction.bind(null, row.id)}>
              <SaveButton className="btn secondary" pendingLabel="Sending…" savedLabel="Invite sent ✓">
                Invite to field app
              </SaveButton>
            </form>
          ) : row.fieldApp === 'no-email' ? (
            <span className={styles.dim}>Add an email above to invite them to the field app.</span>
          ) : null}
          <form action={setCrewActiveAction.bind(null, row.id, !row.active)}>
            <button type="submit" className="btn ghost">{row.active ? 'Archive' : 'Reactivate'}</button>
          </form>
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
      </section>
    </div>
  );
}
