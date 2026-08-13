'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useFormState, useFormStatus } from 'react-dom';
import {
  MAX_REMINDERS,
  REVIEW_ACTION_IDLE,
  REQUEST_STATUS_LABEL,
  CHANNEL_LABEL,
  reminderBlock,
  reminderBlockMessage,
  type ActivityRow,
} from '@/lib/review-activity';
import { remindReviewAction, setRemindersStoppedAction, setResolvedAction } from './actions';
import styles from './reviews.module.css';

/**
 * The details drawer.
 *
 * OPEN STATE COMES FROM THE URL (`?open=<id>`), never from useState seeded with
 * a prop. That is a documented past bug in this codebase: a drawer initialised
 * from a prop keeps showing the row it was first opened with, because the
 * initial value of useState is only read once. Reading useSearchParams means
 * the drawer cannot disagree with the address bar, and Back closes it.
 *
 * The row itself is passed in by the server, already scoped to the account —
 * the id in the URL is not trusted to select anything on its own.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function fmt(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function SubmitButton({ children, className = 'btn secondary', disabled = false }: { children: React.ReactNode; className?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={disabled || pending}>
      {pending ? 'Working…' : children}
    </button>
  );
}

export default function ReviewDrawer({
  row,
  basePath,
  nowIso,
  readOnly = false,
}: {
  row: ActivityRow | null;
  basePath: string;
  nowIso: string;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const open = Boolean(row) && searchParams.get('open') === row?.id;

  const panelRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('open');
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  // Remember what opened it, so focus goes back there rather than to the top
  // of the document.
  useEffect(() => {
    if (open) openerRef.current = document.activeElement as HTMLElement | null;
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      // Focus trap: a drawer you can Tab out of leaves the keyboard behind a
      // scrim, on controls that cannot be seen.
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus?.();
    };
  }, [open, close]);

  if (!open || !row) return null;

  const block = reminderBlock(row, nowIso);
  const who = row.clientName || 'This customer';

  // Only events that actually happened, each with the timestamp that recorded
  // it. Nothing is inferred, so an empty stretch in the timeline is silence
  // rather than a gap in the logging.
  const events: { when: string; what: string }[] = [
    { when: row.sentAt, what: `Review request sent${row.channel === 'unknown' ? '' : ` by ${CHANNEL_LABEL[row.channel].toLowerCase()}`}` },
    ...(row.lastRemindedAt
      ? [{ when: row.lastRemindedAt, what: `Last reminder sent (${row.remindersSent} of ${MAX_REMINDERS})` }]
      : []),
    ...(row.rating !== null && row.respondedAt ? [{ when: row.respondedAt, what: `Rated ${row.rating} of 5` }] : []),
    ...(row.googleClickedAt ? [{ when: row.googleClickedAt, what: 'Opened your Google review page' }] : []),
    ...(row.feedbackAt ? [{ when: row.feedbackAt, what: 'Left private feedback' }] : []),
    ...(row.remindersStoppedAt ? [{ when: row.remindersStoppedAt, what: 'You stopped reminders' }] : []),
    ...(row.resolvedAt ? [{ when: row.resolvedAt, what: 'You marked this resolved' }] : []),
  ].sort((a, b) => a.when.localeCompare(b.when));

  return (
    <>
      {/* The scrim closes on click, and it is aria-hidden because Escape and
          the Close button are the accessible ways out — a clickable div is not
          a control. */}
      <div className={styles.scrim} onClick={close} aria-hidden="true" />

      <aside
        ref={panelRef}
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-drawer-title"
      >
        <header className={styles.drawerHead}>
          <div>
            <h2 id="review-drawer-title" className={styles.drawerTitle}>
              {who}
            </h2>
            <p className={styles.eventWhen}>
              {REQUEST_STATUS_LABEL[row.status]}
              {row.jobRef ? ` · ${row.jobRef}` : ''}
            </p>
          </div>
          <button type="button" className={styles.drawerClose} onClick={close} aria-label="Close details">
            <span aria-hidden="true">✕</span>
          </button>
        </header>

        <div className={styles.drawerBody}>
          {row.feedback ? (
            <section className={styles.drawerSection}>
              <h3 className={styles.drawerLabel}>
                Private feedback{row.rating !== null ? ` · ${row.rating} of 5` : ''}
              </h3>
              <blockquote className={styles.quote}>{row.feedback}</blockquote>
            </section>
          ) : null}

          <section className={styles.drawerSection}>
            <h3 className={styles.drawerLabel}>Timeline</h3>
            <ol className={styles.timeline}>
              {events.map((event) => (
                <li key={`${event.when}-${event.what}`} className={styles.event}>
                  <span className={styles.eventDot} aria-hidden="true" />
                  <span>
                    {event.what}
                    <span className={styles.eventWhen}>{fmt(event.when)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section className={styles.drawerSection}>
            <h3 className={styles.drawerLabel}>Open</h3>
            <div className={styles.actionRow}>
              {row.jobId ? (
                <Link className="btn secondary" href={`${basePath}/jobs/${row.jobId}`}>
                  Open job
                </Link>
              ) : null}
              {row.clientId ? (
                <Link className="btn secondary" href={`${basePath}/clients/${row.clientId}`}>
                  Open customer
                </Link>
              ) : null}
              {row.clientPhone ? (
                <Link className="btn secondary" href={`${basePath}/messages?to=${encodeURIComponent(row.clientPhone)}`}>
                  Message
                </Link>
              ) : null}
            </div>
            {!row.jobId && !row.clientId ? (
              <p className={styles.notBuilt}>
                This request is not attached to a job, so there is no job or customer record to open.
              </p>
            ) : null}
          </section>

          {readOnly ? (
            <p className={styles.notBuilt}>
              This is the read-only demo. The actions below are live for a signed-in account.
            </p>
          ) : (
            <section className={styles.drawerSection}>
              <h3 className={styles.drawerLabel}>Actions</h3>
              <div className={styles.actions}>
                <RemindForm row={row} block={block} />
                <StopForm row={row} />
                <ResolveForm row={row} />
                <div className={styles.actionRow}>
                  {/* Rendered, disabled, and explained. There is no assignee
                      model for review requests; a control that looked live and
                      did nothing would be worse than this sentence. */}
                  <button type="button" className="btn ghost" disabled aria-describedby="assign-why">
                    Assign
                  </button>
                </div>
                <p className={styles.notBuilt} id="assign-why">
                  Assigning a review request to a team member is not built yet — there is nobody to
                  assign it to until reviews have an owner field.
                </p>
              </div>
            </section>
          )}
        </div>
      </aside>
    </>
  );
}

/* -- the three live actions -------------------------------------------------
   Each is its own <form> posting to its own server action, so useFormStatus
   reports on the button that was actually pressed rather than on "something in
   this drawer is busy". */

function Result({ state }: { state: { status: string; message: string } }) {
  if (state.status === 'idle' || !state.message) return null;
  return (
    <p
      className={`${styles.result} ${state.status === 'ok' ? styles.resultOk : styles.resultError}`}
      role="status"
      aria-live="polite"
    >
      {state.message}
    </p>
  );
}

function RemindForm({ row, block }: { row: ActivityRow; block: ReturnType<typeof reminderBlock> }) {
  const [state, action] = useFormState(remindReviewAction, REVIEW_ACTION_IDLE);
  const why = block ? reminderBlockMessage(block, row) : '';
  return (
    <form action={action}>
      <input type="hidden" name="id" value={row.id} />
      <div className={styles.actionRow}>
        <SubmitButton disabled={block !== null}>
          {row.remindersSent > 0 ? `Send reminder ${row.remindersSent + 1} of ${MAX_REMINDERS}` : 'Send a reminder'}
        </SubmitButton>
      </div>
      {why ? <p className={styles.notBuilt}>{why}</p> : null}
      <Result state={state} />
    </form>
  );
}

function StopForm({ row }: { row: ActivityRow }) {
  const [state, action] = useFormState(setRemindersStoppedAction, REVIEW_ACTION_IDLE);
  const stopped = Boolean(row.remindersStoppedAt);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={row.id} />
      <input type="hidden" name="stopped" value={stopped ? '0' : '1'} />
      <div className={styles.actionRow}>
        <SubmitButton className="btn ghost">{stopped ? 'Resume reminders' : 'Stop reminders'}</SubmitButton>
      </div>
      <Result state={state} />
    </form>
  );
}

function ResolveForm({ row }: { row: ActivityRow }) {
  const [state, action] = useFormState(setResolvedAction, REVIEW_ACTION_IDLE);
  const resolved = Boolean(row.resolvedAt);
  // Only meaningful for feedback somebody actually left.
  if (!row.feedback) return null;
  return (
    <form action={action}>
      <input type="hidden" name="id" value={row.id} />
      <input type="hidden" name="resolved" value={resolved ? '0' : '1'} />
      <div className={styles.actionRow}>
        <SubmitButton className={resolved ? 'btn ghost' : 'btn primary'}>
          {resolved ? 'Reopen' : 'Mark resolved'}
        </SubmitButton>
      </div>
      {resolved ? <p className={styles.notBuilt}>Resolved {fmt(row.resolvedAt)}.</p> : null}
      <Result state={state} />
    </form>
  );
}
