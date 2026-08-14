'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useScheduleDrag } from './ScheduleDragProvider';
import { OPEN_SCHEDULE_QUEUE_EVENT } from './dock-events';
import { useModal } from './use-modal';

/**
 * The jobs waiting for a date.
 *
 * ONE COPY OF THE MARKUP, TWO PLACES IT CAN LIVE. The rows are server-rendered
 * (they carry server actions and a crew form each), so this wraps them rather
 * than re-rendering them and only decides where the box sits:
 *
 *   >= 1280px   the desktop rail, permanently visible beside the calendar. The
 *               wrapper is `display: contents`, so the section is a rail child
 *               as if this component were not in the tree at all.
 *   <  1280px   a full-screen panel, opened from the "jobs need dates" banner
 *               and dismissed with a real Back button.
 *
 * WHAT THIS REPLACES. The old ScheduleDock was a `position: fixed` bar pinned to
 * the bottom of the viewport at every width below 1100px — so on a tablet and a
 * phone it sat permanently on top of the calendar, covering the last row of
 * dates, and it out-stacked the job dialog because both were page-level fixed
 * elements with hand-picked z-indexes. A tray that covers the thing it schedules
 * onto is the collision; a panel you open and close is not.
 *
 * ONLY ONE OVERLAY AT A TIME is enforced through useModal, which marks the body
 * while something is open. Opening a job dialog stands this down (CSS), and this
 * being open is what the dialog checks before it lets the tray paint.
 */
export default function UnscheduledQueue({
  count,
  selectedJobId,
  children,
}: {
  count: number;
  /**
   * The job the workbench has open, or null.
   *
   * PICKING A JOB CLOSES THIS PANEL. On a phone the queue is a full-screen
   * overlay and the job's own panel is another one, so pressing "Schedule"
   * opened the customer's details UNDERNEATH the list they were pressed from —
   * and worse than invisible: this panel's focus trap had marked that one inert
   * on the way in, so the thing you had just asked for was unreachable as well
   * as unseen. Reported as "it brings up our customer's details hidden behind
   * this page".
   */
  selectedJobId: string | null;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // Whether this width shows the queue as an overlay at all. Behavior only —
  // the markup is identical either way, so there is nothing to mismatch on
  // hydration and CSS remains the single source of the breakpoint.
  const [isOverlay, setIsOverlay] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { armedJob } = useScheduleDrag();

  useEffect(() => {
    const query = window.matchMedia('(max-width: 1279.98px)');
    const sync = () => setIsOverlay(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  // Growing past the breakpoint while the panel is open would otherwise leave
  // the rail rendering in its opened state and the scroll lock still applied.
  useEffect(() => {
    if (!isOverlay) setOpen(false);
  }, [isOverlay]);

  /**
   * OPEN, MINUS THE TWO THINGS THAT OVERRULE IT — and derived during render
   * rather than pushed into state by an effect, which is the whole point.
   *
   * An effect would close this one commit AFTER the job panel opened, and for
   * that one commit both overlays are open at once: two focus traps, two calls
   * to inertOutside, and each one marking the other inert. Whichever unwinds
   * second then restores an attribute the other still wanted. Computing it here
   * means the commit that opens the panel is the same commit that closes this,
   * so React runs this hook's cleanup before that one's setup and the marking
   * never overlaps.
   *
   * `open` itself is still cleared below, so dismissing the job panel does not
   * bring the list back on top of the calendar.
   */
  const showing = open && !(isOverlay && (selectedJobId !== null || armedJob !== null));

  const close = useCallback(() => setOpen(false), []);
  useModal(showing && isOverlay, panelRef, close, 'queue');

  // PICKING A JOB CLOSES THE PANEL, and it stays closed. You have just said
  // which job; what you need next is the calendar and the job's own panel, and
  // this is covering both. `armedJob` is the same decision made by dragging.
  useEffect(() => {
    if (armedJob || selectedJobId) setOpen(false);
  }, [armedJob, selectedJobId]);

  /**
   * The banner and the mobile agenda both ask for this by name.
   *
   * AND ON A DESKTOP IT HAS TO DO SOMETHING TOO. `setOpen(true)` is the whole
   * answer only while this is an overlay. Above 1280 the queue is already
   * docked and visible, so pressing "Schedule a job" set a boolean nothing was
   * reading and the page did not move — reported, correctly, as a button that
   * does nothing. Here it takes you to the top of the list and puts focus on
   * the first job waiting, which is the thing you pressed it to reach.
   */
  useEffect(() => {
    const onOpen = (event: Event) => {
      // Which card to land on. The bar's "Review N unapproved" asks for one by
      // name, because the queue sorts approved work above unapproved and
      // landing on the first row would be landing on the wrong task.
      const wanted = (event as CustomEvent<{ focusJobId?: string }>).detail?.focusJobId;
      setOpen(true);
      // After paint: on a tablet the panel has only just been un-inerted, and
      // focus cannot land inside an inert subtree.
      requestAnimationFrame(() => {
        const panel = panelRef.current;
        if (!panel) return;
        panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        const target =
          (wanted ? panel.querySelector<HTMLElement>(`[data-queue-job="${CSS.escape(wanted)}"]`) : null)
          ?? panel.querySelector<HTMLElement>('[data-queue-job]');
        if (!target) return;

        /**
         * TWO PATHS INTO THE SAME PLACE, and they used to fight.
         *
         * On a desktop the queue is a docked region, useModal is not running,
         * and focusing here is the whole of it. On anything narrower it is a
         * modal, and useModal focuses `[data-autofocus]` (or the panel) on its
         * own timeout — which ran AFTER this and took focus straight back off
         * the card. Measured: desktop landed on the job, tablet and phone
         * landed on the panel, so "Review the unapproved one" opened a list of
         * nine and pointed at none of them.
         *
         * Stamping the attribute makes the hook's own mechanism aim at the
         * right card instead of racing it. Cleared from the others first, or a
         * second press would leave two claims on the page.
         */
        for (const previous of panel.querySelectorAll<HTMLElement>('[data-autofocus]')) {
          delete previous.dataset.autofocus;
        }
        target.dataset.autofocus = 'true';
        target.focus({ preventScroll: true });
        // Scrolled to as well as focused: the asked-for card can be the ninth
        // in the list, and preventScroll is what keeps the panel from jumping
        // during the smooth scroll above.
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        // A pulse, because focus alone on a card in a list of nine is easy to
        // miss when you were looking at the calendar.
        target.dataset.justFocused = 'true';
        window.setTimeout(() => delete target.dataset.justFocused, 1400);
      });
    };
    window.addEventListener(OPEN_SCHEDULE_QUEUE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SCHEDULE_QUEUE_EVENT, onOpen);
  }, []);

  const label = `${count} ${count === 1 ? 'job needs' : 'jobs need'} a date`;

  /**
   * COLLAPSING THE DESKTOP RAIL.
   *
   * Only meaningful above 1280, where the queue is a permanent column rather
   * than an overlay you have already dismissed. It is a real toggle rather
   * than a CSS-only trick because the collapsed rail has to leave the tab
   * order — a hidden column you can still Tab into is worse than one that is
   * simply there.
   *
   * Deliberately NOT persisted. A remembered collapse means opening the
   * schedule to a rail that is closed for a reason you set last week, with
   * eleven jobs behind it and nothing on screen saying so; the count on the
   * toggle is only useful if you can see it.
   */
  const [collapsed, setCollapsed] = useState(false);
  const showCollapseToggle = !isOverlay;

  /**
   * A CLOSED DIALOG MUST NOT BE IN THE ACCESSIBILITY TREE.
   *
   * On a tablet this is a full-screen overlay that is closed almost all of the
   * time, and it stayed in the document the whole while carrying
   * role="dialog" — so a screen reader walking the page met a dialog nobody
   * had opened, sitting between the calendar and the settings. `visibility:
   * hidden` in the stylesheet was doing the real work, which is correct but
   * invisible from the markup and one `visibility: visible` on a child away
   * from silently coming back.
   *
   * `inert` states it in the markup instead: out of the tab order and out of
   * the accessibility tree, in one attribute that a child cannot override.
   *
   * Set through the DOM rather than as a prop because React 18 has no typing
   * for `inert` and passing a boolean makes it warn about a non-boolean
   * attribute. React 19 takes it as a prop and this can go.
   */
  const rootRef = useRef<HTMLDivElement>(null);
  const hidden = isOverlay && !showing;
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    if (hidden) {
      node.setAttribute('inert', '');
      node.setAttribute('aria-hidden', 'true');
    } else {
      node.removeAttribute('inert');
      node.removeAttribute('aria-hidden');
    }
  }, [hidden]);

  /**
   * The collapsed rail leaves the tab order too — but the TOGGLE must not.
   *
   * So this marks the panel rather than the wrapper. Inerting the wrapper (as
   * the overlay case above does) would take the collapse button with it, and a
   * closed rail with no way to reopen it is a rail you have lost. The overlay
   * case can inert the wrapper safely because the toggle is not rendered at
   * those widths at all.
   */
  const panelInert = collapsed && showCollapseToggle;
  useEffect(() => {
    const node = panelRef.current;
    if (!node) return;
    if (panelInert) {
      node.setAttribute('inert', '');
      node.setAttribute('aria-hidden', 'true');
    } else if (!hidden) {
      node.removeAttribute('inert');
      node.removeAttribute('aria-hidden');
    }
  }, [panelInert, hidden]);

  return (
    <div
      className={`sched-queue${showing ? ' is-open' : ''}${collapsed && showCollapseToggle ? ' is-collapsed' : ''}`}
      data-count={count}
      ref={rootRef}
    >
      {/* The backdrop only exists in overlay mode; on desktop the whole wrapper
          is display:contents and this never paints. */}
      <div className="sched-queue-scrim" onClick={close} aria-hidden="true" />

      {/* The collapsed rail's only control. It carries the count, because a
          closed column that does not say how much is behind it is a column you
          forget you closed. Rendered only on the desktop rail — below 1280 the
          queue is an overlay and "collapse" is what the Back button does. */}
      {showCollapseToggle ? (
        <button
          type="button"
          className="sched-queue-collapse"
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
          aria-controls="sched-queue-panel"
        >
          <span aria-hidden="true">{collapsed ? '›' : '‹'}</span>
          <span className="sched-queue-collapse-label">
            {collapsed ? `${count} waiting` : 'Hide'}
          </span>
        </button>
      ) : null}

      <div
        id="sched-queue-panel"
        className="sched-queue-panel"
        ref={panelRef}
        tabIndex={-1}
        /* Only a dialog when it behaves like one. On the desktop rail this is a
           permanently visible region, and calling that a modal dialog would be a
           lie to every screen reader that met it. */
        role={isOverlay ? 'dialog' : 'region'}
        aria-modal={isOverlay && showing ? true : undefined}
        aria-label={isOverlay ? label : 'Jobs waiting for a date'}
      >
        <div className="sched-queue-head">
          <button type="button" className="sched-queue-back" onClick={close}>
            <span aria-hidden="true">←</span> Back
          </button>
          <p className="sched-queue-head-id">{label}</p>
        </div>
        <div className="sched-queue-body">{children}</div>
      </div>
    </div>
  );
}
