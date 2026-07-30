'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import CrewWorkHistory from '@/components/crew-work-history';
import SaveButton from '@/components/save-button';
import ConfirmActionButton from '@/app/dashboard/jobs/[id]/ConfirmActionButton';
import CrewPhotoUpload from './CrewPhotoUpload';
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
  rateLabel: string;
  phone: string | null;
  phoneLabel: string | null;
  email: string | null;
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
  openAdd,
}: {
  rows: CrewRow[];
  assignableJobs: JobOption[];
  periodLabel: string;
  initialStatus: 'active' | 'archived';
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
        </div>
      </div>

      {rows.length === 0 ? (
        <div className={styles.empty}>
          <h3>No crew members yet</h3>
          <p>Add the people who work with you — then assign them jobs and their hours roll up here.</p>
          <button type="button" className="btn primary" onClick={() => setAddOpen(true)}>+ Add crew member</button>
        </div>
      ) : visible.length === 0 ? (
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
            <div className="field">
              <label htmlFor="hourlyRate">Hourly rate ($)</label>
              <input id="hourlyRate" name="hourlyRate" type="number" min="0" step="0.01" placeholder="28" />
            </div>
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

  const hoursHref = `/dashboard/crew?tab=hours&crew=${row.id}`;

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
          {row.jobs.length > 0 ? (
            <>
              <span className={styles.jobRef}>{row.jobs[0].ref} · {row.jobs[0].clientName}</span>
              {row.jobs.length > 1 ? <small>+{row.jobs.length - 1} more</small> : null}
            </>
          ) : row.active ? (
            <span className={styles.availablePill}>Available</span>
          ) : (
            <span className={styles.dim}>Archived</span>
          )}
        </span>

        <span className={styles.rowPeriod}>
          <strong>{row.periodHours} hrs</strong>
          <small title={`Hours × the rate on each entry, for ${periodLabel}. Estimated — this product doesn't run payroll.`}>
            {row.periodPayLabel} est.
          </small>
        </span>
      </button>

      <div className={styles.rowActions}>
        {row.active ? (
          <button type="button" className={styles.rowBtn} onClick={() => setAssigning((v) => !v)} aria-expanded={assigning}>
            Assign job
          </button>
        ) : null}
        <Link href={hoursHref} className={styles.rowBtn}>View hours</Link>

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

      {assigning ? (
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
      ) : null}
    </li>
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
            <div className="field">
              <label htmlFor={`hourlyRate-${row.id}`}>Hourly rate ($)</label>
              <input id={`hourlyRate-${row.id}`} name="hourlyRate" type="number" min="0" step="0.01" defaultValue={row.hourlyRate} />
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
