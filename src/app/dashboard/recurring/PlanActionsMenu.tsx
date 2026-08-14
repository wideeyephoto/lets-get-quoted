'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { markJobCompleteAction, scheduleJobAction, toggleJobCrewAction } from '../jobs/actions';

/**
 * The rest of a plan's actions, behind one button.
 *
 * Four of the five things in here operate on the plan's NEXT VISIT, which is an
 * ordinary job — so they call the same job actions the jobs and schedule pages
 * call rather than reimplementing completion, scheduling and crew assignment a
 * second time against recurring_plans. Only skipping and reminding are specific
 * to a plan, and those two arrive as bound server actions.
 *
 * Everything visit-shaped disappears when the visit hasn't been created yet.
 * A menu offering "Assign crew" for a job that doesn't exist is a menu that
 * lies.
 */

type Crew = { id: string; name: string };

type Props = {
  clientName: string;
  /** "Aug 11" — how the visit is named in confirmations. */
  nextVisitLabel: string;
  /** The materialised job for the next visit, if the horizon has reached it. */
  nextVisitJobId: string | null;
  /** The day that job currently sits on, for the date input's starting value. */
  visitScheduledFor: string | null;
  crew: Crew[];
  assignedCrewIds: string[];
  active: boolean;
  skipAction: () => Promise<void>;
  remindAction: () => Promise<void>;
};

export default function PlanActionsMenu({
  clientName,
  nextVisitLabel,
  nextVisitJobId,
  visitScheduledFor,
  crew,
  assignedCrewIds,
  active,
  skipAction,
  remindAction,
}: Props) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const [panel, setPanel] = useState<'move' | 'crew' | null>(null);
  const [assigned, setAssigned] = useState<string[]>(assignedCrewIds);
  const [moveTo, setMoveTo] = useState(visitScheduledFor ?? '');
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape. Bound only while open, so thirty plan
  // cards don't each keep a document listener alive for a menu nobody opened.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) { setOpen(false); setPanel(null); }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); setPanel(null); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const run = (work: () => Promise<unknown>, closeAfter = true) => {
    startTransition(async () => {
      await work();
      if (closeAfter) { setOpen(false); setPanel(null); }
      router.refresh();
    });
  };

  const hasVisit = Boolean(nextVisitJobId);

  return (
    <div className="recurring-menu" ref={wrapRef}>
      <button
        type="button"
        className="recurring-menu-btn"
        aria-label={`More actions for ${clientName}’s plan`}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => { setOpen((was) => !was); setPanel(null); }}
      >
        <span aria-hidden="true">•••</span>
      </button>

      {open ? (
        <div id={menuId} className="recurring-menu-pop" role="menu">
          {panel === null ? (
            <>
              {active ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={pending}
                  onClick={() => {
                    const worked = hasVisit ? ' Its job comes off the calendar.' : '';
                    if (!window.confirm(`Skip ${clientName}’s ${nextVisitLabel} visit?${worked} The plan carries on from the visit after it, and a fixed term doesn’t lose a visit.`)) return;
                    run(skipAction);
                  }}
                >
                  Skip the {nextVisitLabel} visit
                </button>
              ) : null}

              {hasVisit ? (
                <>
                  <button type="button" role="menuitem" disabled={pending} onClick={() => setPanel('move')}>
                    Move this visit to another day
                  </button>
                  {crew.length > 0 ? (
                    <button type="button" role="menuitem" disabled={pending} onClick={() => setPanel('crew')}>
                      {assigned.length > 0 ? 'Change who’s going' : 'Assign crew'}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    disabled={pending}
                    onClick={() => {
                      if (!window.confirm(`Text or email ${clientName} that their ${nextVisitLabel} visit is coming up? It sends now, and tonight’s automatic reminder for this visit won’t also go out.`)) return;
                      run(remindAction);
                    }}
                  >
                    Remind the customer
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={pending}
                    onClick={() => {
                      if (!window.confirm(`Mark the ${nextVisitLabel} visit complete? This closes that job — it does not move the plan on, bill anybody, or ask them for a review.`)) return;
                      // sendReview explicitly OFF, rather than falling through to
                      // the account's automatic-review setting.
                      //
                      // That setting fires once per JOB, and every visit of a
                      // recurring plan is a new job — so with it on, mowing
                      // somebody's lawn every week would ask them for a Google
                      // review every week. Fifty-two times a year is not a review
                      // strategy, it is why people block a number.
                      //
                      // A recurring customer is the wrong person to ask on a
                      // schedule anyway: you want the ask after the FIRST good
                      // visit, which is a decision worth making by hand from the
                      // job page.
                      const form = new FormData();
                      form.set('sendReview', 'off');
                      run(() => markJobCompleteAction(nextVisitJobId as string, form));
                    }}
                  >
                    Mark this visit completed
                  </button>
                </>
              ) : (
                <p className="recurring-menu-note">
                  The {nextVisitLabel} visit isn’t on the calendar yet, so there’s nothing to move, staff or remind about.
                </p>
              )}
            </>
          ) : null}

          {panel === 'move' ? (
            <div className="recurring-menu-panel">
              <label>
                <span>Move the {nextVisitLabel} visit to</span>
                <input type="date" value={moveTo} onChange={(event) => setMoveTo(event.target.value)} />
              </label>
              {/* Said out loud because it is the whole difference between this
                  and Change plan, and getting it wrong moves every future
                  visit for a customer who just wanted one Tuesday moved. */}
              <p className="recurring-menu-note">
                This visit only. The plan keeps its rhythm and bills on the same day it always would.
              </p>
              <div className="recurring-menu-actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={pending || !moveTo}
                  onClick={() => {
                    const form = new FormData();
                    form.set('scheduledFor', moveTo);
                    run(() => scheduleJobAction(nextVisitJobId as string, form));
                  }}
                >
                  {pending ? 'Moving…' : 'Move it'}
                </button>
                <button type="button" className="linklike" onClick={() => setPanel(null)}>Back</button>
              </div>
            </div>
          ) : null}

          {panel === 'crew' ? (
            <div className="recurring-menu-panel">
              <span className="recurring-menu-head">Who’s going on {nextVisitLabel}</span>
              <ul className="recurring-menu-crew">
                {crew.map((member) => {
                  const on = assigned.includes(member.id);
                  return (
                    <li key={member.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={pending}
                          onChange={() => {
                            setAssigned((current) => (on ? current.filter((id) => id !== member.id) : [...current, member.id]));
                            run(() => toggleJobCrewAction(nextVisitJobId as string, member.id), false);
                          }}
                        />
                        {member.name}
                      </label>
                    </li>
                  );
                })}
              </ul>
              {/* toggleJobCrewAction texts and pushes a newly assigned crew
                  member, exactly as it does from the schedule. Worth saying,
                  because a checkbox does not look like it sends anything. */}
              <p className="recurring-menu-note">Anyone you add is texted the job.</p>
              <div className="recurring-menu-actions">
                <button type="button" className="linklike" onClick={() => setPanel(null)}>Back</button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
