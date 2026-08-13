'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import ScheduledDatePicker from '@/components/scheduled-date-picker';
import TimeSlotSelect from '@/components/time-slot-select';
import SaveButton from '@/components/save-button';
import ClientScheduleOptionsCalendar from './client-schedule-options-calendar';
import {
  scheduleJobAction,
  sendClientScheduleOptionsAction,
  setJobEstimatedHoursAction,
  updateJobCrewAction,
} from '../jobs/actions';
import { scheduleReady, suggestSlots, type SuggestedSlot } from '@/lib/schedule-suggestions';
import { jobBlockers } from '@/lib/schedule-readiness';
import { useModal } from './use-modal';
import type { CrewOption } from './schedule-calendar';
import type { QueueJob, SuggestContext } from './schedule-queue-types';

/**
 * Scheduling one job, as a short guided flow.
 *
 * WHAT THIS REPLACES. Every card in the queue carried two equally prominent
 * buttons — "Choose date & time" and "Offer customer times" — each opening its
 * own inline panel that pushed the card to roughly 480px and shoved the rest of
 * the list off the screen. Nine jobs waiting meant eighteen buttons, and the
 * two are not alternatives of equal weight: one is what you do, the other is
 * what you do when you cannot reach the customer. Picking WHO decides the time
 * is a step inside scheduling, not a fork before it.
 *
 * THE PANEL IS ALSO WHERE THE PAGE'S OWN KNOWLEDGE FINALLY GETS USED. The old
 * form opened an empty date box beside a calendar that knew exactly which days
 * were full, which were blocked, which were not worked at all and how many
 * hours were left on each — and asked you to type a date anyway. Four presets
 * sat under it ("Today 8 AM", "Next Mon 8 AM"), the same guess every time,
 * blind to all of it.
 *
 * A SUGGESTION IS NEVER A DECISION. The manual picker is always open below the
 * suggestions, and a full day is still choosable by hand: somebody squeezing a
 * call into a booked Tuesday knows something this panel does not.
 */

type Mode = 'pick' | 'ask';

function dayLabel(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function relativeLabel(dateKey: string, todayKey: string): string | null {
  if (dateKey === todayKey) return 'Today';
  const days = Math.round((Date.parse(`${dateKey}T00:00:00`) - Date.parse(`${todayKey}T00:00:00`)) / 86_400_000);
  if (days === 1) return 'Tomorrow';
  if (days > 1 && days < 7) return `In ${days} days`;
  return null;
}

/**
 * The duration, editable in place.
 *
 * Its own component so the whole panel does not re-render on every keystroke —
 * the slot list above it is recomputed by suggestSlots and is the expensive
 * thing on this screen.
 *
 * Saves on blur and on Enter rather than behind a Save button: it is one
 * number, and a button would be a third control in a definition list. The
 * server revalidates /dashboard/schedule, so the suggestions and the capacity
 * ramp pick the new figure up on the next render without this having to tell
 * them.
 */
function DurationField({ jobId, hours }: { jobId: string; hours: number | null }) {
  const [value, setValue] = useState(hours === null ? '' : String(hours));
  const [state, setState] = useState<{ tone: 'idle' | 'ok' | 'error'; message: string }>({ tone: 'idle', message: '' });
  const [saving, startSaving] = useTransition();

  // The server wins once a revalidation lands, and a new job is a new value.
  useEffect(() => {
    setValue(hours === null ? '' : String(hours));
    setState({ tone: 'idle', message: '' });
  }, [jobId, hours]);

  function commit() {
    const trimmed = value.trim();
    const next = trimmed === '' ? null : Number(trimmed);
    // Unchanged means nothing to say and nothing to write.
    if ((next ?? 0) === (hours ?? 0)) return;
    if (next !== null && !Number.isFinite(next)) {
      setState({ tone: 'error', message: 'Enter a number of hours.' });
      return;
    }
    startSaving(async () => {
      const result = await setJobEstimatedHoursAction(jobId, next);
      setState({ tone: result.ok ? 'ok' : 'error', message: result.message });
    });
  }

  return (
    <span className="sched-duration">
      <label className="sr-only" htmlFor={`sched-hours-${jobId}`}>
        Estimated hours
      </label>
      <input
        id={`sched-hours-${jobId}`}
        className="sched-duration-input"
        type="number"
        inputMode="decimal"
        min={0}
        max={24}
        step={0.5}
        value={value}
        placeholder="Not set"
        disabled={saving}
        onChange={(event) => setValue(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
      />
      <span className="sched-duration-unit">hrs</span>
      {state.message ? (
        <span
          className={`sched-duration-note${state.tone === 'error' ? ' is-error' : ''}`}
          role="status"
          aria-live="polite"
        >
          {state.message}
        </span>
      ) : null}
    </span>
  );
}

function clockLabel(time: string): string {
  const [h, m] = time.split(':').map(Number);
  if (!Number.isFinite(h)) return time;
  const suffix = h < 12 ? 'AM' : 'PM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m ?? 0).padStart(2, '0')} ${suffix}`;
}

export default function SchedulePanel({
  job,
  crew,
  context,
  clientAvailability,
  onClose,
  docked,
}: {
  job: QueueJob | null;
  crew: CrewOption[];
  context: SuggestContext;
  /** The 30-day strip the "let the customer pick" form offers. */
  clientAvailability: React.ComponentProps<typeof ClientScheduleOptionsCalendar>['availability'];
  onClose: () => void;
  /** True when this is the third column rather than an overlay. */
  docked: boolean;
}) {
  const [mode, setMode] = useState<Mode>('pick');
  const [dateKey, setDateKey] = useState<string | null>(null);
  const [time, setTime] = useState<string>('');
  const [crewIds, setCrewIds] = useState<string[]>([]);
  /**
   * ASSIGNING SOMEBODY TEXTS THEM, so it is a choice and not a side effect.
   *
   * The queue's old crew picker had two submits — "Save & text" and "Save
   * without texting" — and the first draft of this panel dropped both and
   * always notified. Caught scheduling a job end to end in the browser: the
   * send fired, and the only reason nobody was messaged is that seeded crew
   * carry 555 numbers, which Twilio refuses. On a real roster it would have
   * texted somebody because a button said "Schedule job".
   *
   * On by default, matching which of the two submits used to be the primary.
   */
  const [notifyCrew, setNotifyCrew] = useState(true);
  /** null is "everyone". A role string filters the crew list to it. */
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // A new job is a new decision. Without this, opening the second job in the
  // queue would arrive with the first one's date already filled in and a
  // "Schedule job" button ready to act on it.
  useEffect(() => {
    setMode('pick');
    setDateKey(null);
    setTime('');
    setCrewIds(job?.crewIds ?? []);
    setNotifyCrew(true);
    // A role filter left on from the last job would hide most of the roster on
    // this one, silently.
    setRoleFilter(null);
  }, [job?.id, job?.crewIds]);

  // Only a dialog when it behaves like one. Docked in the third column it is a
  // region that is always there, and calling that a modal would be a lie to
  // every screen reader that met it.
  useModal(Boolean(job) && !docked, panelRef, onClose, 'schedule-panel');

  const slots: SuggestedSlot[] = useMemo(() => {
    if (!job) return [];
    return suggestSlots({
      todayKey: context.todayKey,
      jobHours: job.estimatedHours,
      jobAt: job.lat != null && job.lng != null ? { lat: job.lat, lng: job.lng } : null,
      hoursByDate: context.hoursByDate,
      jobsByDate: context.jobsByDate,
      placesByDate: context.placesByDate,
      capacityHours: context.capacityHours,
      blockedDays: context.blockedDays,
      workingWeekdays: context.workingWeekdays,
      workdayStart: context.workdayStart,
    });
  }, [job, context]);

  if (!job) {
    // The docked column keeps its place rather than collapsing — a third of the
    // width appearing and disappearing as you click around the queue is worse
    // than a column that says what it is for.
    return docked ? (
      <aside className="sched-detail is-empty" aria-label="Job details">
        <p className="sched-detail-hint">
          <strong>Pick a job</strong>
          <span>Choose one from the list and its dates, crew and confirmation appear here.</span>
        </p>
      </aside>
    ) : null;
  }

  const ready = scheduleReady({ dateKey, time: time || null });
  const chosenSlot = slots.find((slot) => slot.dateKey === dateKey && slot.time === time) ?? null;

  // What is still outstanding, from the same helper the queue card reads, minus
  // the crew line once crew have been ticked in this panel — that one is being
  // answered on screen right now and repeating it under the button would be
  // the panel arguing with itself.
  const remaining = jobBlockers({ ...job, crewIds }).filter((blocker) => blocker.key !== 'crew' || crewIds.length === 0);

  /**
   * How many jobs each crew member already has on the chosen day.
   *
   * Empty until a day is picked, which is correct rather than a gap: "already
   * booked" is meaningless before there is a date to be booked against, and
   * showing a count from some other day would be worse than showing none.
   */
  const busyOnChosenDay = new Map<string, number>();
  if (dateKey) {
    for (const id of context.busyCrewByDate[dateKey] ?? []) {
      busyOnChosenDay.set(id, (busyOnChosenDay.get(id) ?? 0) + 1);
    }
  }

  const roles = [...new Set(crew.map((member) => member.role_label).filter(Boolean))].sort() as string[];
  const byRole = roleFilter === null ? crew : crew.filter((member) => member.role_label === roleFilter);

  /**
   * RECOMMENDED FIRST: free on the chosen day, then already assigned to this
   * job, then everyone else.
   *
   * A stable sort on the incoming order underneath, so the list does not
   * reshuffle itself as you tick names — somebody you just checked staying put
   * matters more than the ordering being perfect.
   */
  const visibleCrew = byRole
    .map((member, index) => ({ member, index }))
    .sort((a, b) => {
      const clash = (busyOnChosenDay.get(a.member.id) ?? 0) - (busyOnChosenDay.get(b.member.id) ?? 0);
      if (clash !== 0) return clash;
      const already = Number(job.crewIds.includes(b.member.id)) - Number(job.crewIds.includes(a.member.id));
      if (already !== 0) return already;
      return a.index - b.index;
    })
    .map((entry) => entry.member);

  return (
    <>
      {docked ? null : <div className="sched-detail-scrim" onClick={onClose} aria-hidden="true" />}
      <aside
        className={`sched-detail${docked ? '' : ' is-sheet'}`}
        ref={panelRef}
        tabIndex={-1}
        role={docked ? 'region' : 'dialog'}
        aria-modal={docked ? undefined : true}
        aria-label={`Schedule ${job.clientName}`}
      >
        <header className="sched-detail-head">
          <div>
            <p className="eyebrow">Schedule</p>
            <h2>{job.clientName}</h2>
            <p className="sched-detail-sub">
              {job.scope ?? 'No scope written yet'}
            </p>
          </div>
          <button type="button" className="sched-detail-close" onClick={onClose} aria-label="Close">×</button>
        </header>

        <dl className="sched-detail-facts">
          <div>
            <dt>Where</dt>
            <dd>{job.address ?? 'No address on file'}</dd>
          </div>
          <div>
            <dt>Est. time</dt>
            {/* EDITED HERE, not on another page. An unestimated job is the
                reason a day can read as empty when it is not — see the capacity
                ramp — and the fix used to be a link that took you off the
                schedule and lost your place in the queue. */}
            <dd>
              <DurationField jobId={job.id} hours={job.estimatedHours} />
            </dd>
          </div>
          <div>
            <dt>Approval</dt>
            <dd>{job.approved ? 'Quote approved' : 'Quote not approved yet'}</dd>
          </div>
        </dl>

        {/* --- 1. WHEN --------------------------------------------------- */}
        <section className="sched-step" aria-labelledby="sched-step-when">
          <h3 id="sched-step-when"><i aria-hidden="true">1</i> When</h3>

          {/* The fork that used to be two buttons on every card in the list.
              It is one question, asked once, of the job you have actually
              chosen. */}
          <div className="sched-mode" role="group" aria-label="Who picks the time">
            <button type="button" className={`sched-mode-btn${mode === 'pick' ? ' is-on' : ''}`} aria-pressed={mode === 'pick'} onClick={() => setMode('pick')}>
              I&apos;ll pick
            </button>
            <button type="button" className={`sched-mode-btn${mode === 'ask' ? ' is-on' : ''}`} aria-pressed={mode === 'ask'} onClick={() => setMode('ask')}>
              Let the customer pick
            </button>
          </div>

          {mode === 'pick' ? (
            <>
              {slots.length > 0 ? (
                <ul className="sched-slots">
                  {slots.map((slot) => {
                    const on = slot.dateKey === dateKey && slot.time === time;
                    return (
                      <li key={`${slot.dateKey}-${slot.time}`}>
                        <button
                          type="button"
                          className={`sched-slot${on ? ' is-on' : ''}`}
                          aria-pressed={on}
                          onClick={() => { setDateKey(slot.dateKey); setTime(slot.time); }}
                        >
                          {/* THE ABSOLUTE DATE LEADS. It used to be "Today" or
                              "In 3 days" and nothing else, so committing to a
                              date meant working out which date that was —
                              and a page left open over midnight said "Today"
                              about yesterday. The relative label is still
                              useful, as the second line rather than instead of
                              the first. */}
                          <span className="sched-slot-when">
                            <strong>
                              {dayLabel(slot.dateKey)} at {clockLabel(slot.time)}
                            </strong>
                            {(() => {
                              const near = relativeLabel(slot.dateKey, context.todayKey);
                              return near ? <em>{near}</em> : null;
                            })()}
                          </span>
                          <span className="sched-slot-why">
                            {slot.reason}
                            {/* Straight-line, and it says so: a mile of river is
                                not a mile of road, and calling it drive time
                                would be inventing a number. */}
                            {slot.milesFromDayWork != null ? ` · ${slot.milesFromDayWork} mi from that day's work` : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="sched-slots-none">
                  No open day in the next six weeks{job.estimatedHours ? ` with ${job.estimatedHours} hrs free` : ''}. Pick a
                  date below anyway, or make room in <Link href="/dashboard/schedule/settings">schedule settings</Link>.
                </p>
              )}

              <details className="sched-manual" open={slots.length === 0}>
                <summary>Pick another date</summary>
                <div className="sched-manual-grid">
                  <ScheduledDatePicker
                    id={`sched-date-${job.id}`}
                    name="scheduledForVisible"
                    value={dateKey ?? ''}
                    onChange={(next: string) => setDateKey(next || null)}
                  />
                  <TimeSlotSelect
                    id={`sched-time-${job.id}`}
                    name="scheduledTimeVisible"
                    value={time}
                    onChange={(next: string) => setTime(next)}
                  />
                </div>
              </details>
            </>
          ) : null}
        </section>

        {mode === 'pick' ? (
          <>
            {/* --- 2. WHO ------------------------------------------------ */}
            <section className="sched-step" aria-labelledby="sched-step-who">
              <h3 id="sched-step-who"><i aria-hidden="true">2</i> Who</h3>
              {crew.length === 0 ? (
                <p className="sched-step-empty">No active crew yet. <Link href="/dashboard/crew">Add your team →</Link></p>
              ) : (
                <>
                  {/* ROLE FILTER. Only once there is more than one role to
                      filter by — a row of one button that cannot change
                      anything is furniture. */}
                  {roles.length > 1 ? (
                    <div className="sched-crew-roles" role="group" aria-label="Filter crew by role">
                      <button
                        type="button"
                        className={`sched-crew-role${roleFilter === null ? ' is-on' : ''}`}
                        aria-pressed={roleFilter === null}
                        onClick={() => setRoleFilter(null)}
                      >
                        Everyone
                      </button>
                      {roles.map((role) => (
                        <button
                          key={role}
                          type="button"
                          className={`sched-crew-role${roleFilter === role ? ' is-on' : ''}`}
                          aria-pressed={roleFilter === role}
                          onClick={() => setRoleFilter(roleFilter === role ? null : role)}
                        >
                          {role}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <div className="sched-crew-list">
                    {visibleCrew.map((member) => {
                      const on = crewIds.includes(member.id);
                      const clashes = busyOnChosenDay.get(member.id) ?? 0;
                      return (
                        <label className={`sched-crew-option${clashes > 0 ? ' has-clash' : ''}`} key={member.id}>
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => setCrewIds((current) => on ? current.filter((id) => id !== member.id) : [...current, member.id])}
                          />
                          <span className="sched-crew-check" aria-hidden="true">✓</span>
                          <span className="sched-crew-copy">
                            <strong>{member.name}</strong>
                            <small>
                              {member.role_label}
                              {/* A CONFLICT, NOT A BLOCK. Doubling somebody up
                                  is sometimes right — two short calls on one
                                  street — so this says what is true and leaves
                                  the decision alone. */}
                              {clashes > 0 ? (
                                <em className="sched-crew-clash">
                                  {' · '}already on {clashes} {clashes === 1 ? 'job' : 'jobs'} that day
                                </em>
                              ) : null}
                            </small>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {visibleCrew.length === 0 ? (
                    <p className="sched-step-empty">Nobody with that role is active.</p>
                  ) : null}
                </>
              )}
              {/* Only when it would actually do something. A switch governing a
                  text to nobody is a switch that teaches you it does nothing. */}
              {crewIds.length > 0 ? (
                <label className="sched-notify">
                  <input type="checkbox" checked={notifyCrew} onChange={(event) => setNotifyCrew(event.currentTarget.checked)} />
                  <span className="sched-crew-check" aria-hidden="true">✓</span>
                  <span>Text them the date</span>
                </label>
              ) : null}
              <p className="sched-step-note">Optional — a job can be scheduled before you know who is on it.</p>
            </section>

            {/* --- 3. CONFIRM -------------------------------------------- */}
            <section className="sched-step sched-step-confirm" aria-labelledby="sched-step-confirm">
              <h3 id="sched-step-confirm"><i aria-hidden="true">3</i> Confirm</h3>
              <p className="sched-confirm-line" aria-live="polite">
                {ready ? (
                  <>
                    <strong>{dayLabel(dateKey as string)}{time ? ` at ${clockLabel(time)}` : ', time to be set'}</strong>
                    <span>
                      {crewIds.length > 0
                        ? `${crewIds.length} crew assigned. ${notifyCrew ? 'Newly added crew get a text.' : 'Nobody gets a text.'}`
                        : 'Nobody assigned yet.'}
                      {chosenSlot && chosenSlot.bookedHours > 0
                        ? ` That day already has ${Math.round(chosenSlot.bookedHours * 10) / 10}h on it.`
                        : ''}
                    </span>
                  </>
                ) : (
                  <span>Choose a day above and this becomes the confirmation.</span>
                )}
              </p>

              {/* WHAT IS STILL MISSING, listed rather than left to be
                  discovered later. None of these block the save — a job can be
                  scheduled before you know the crew or the duration — so they
                  are stated as outstanding work, not as errors. `remaining`
                  reads the same fields the queue row flags, so the card and the
                  panel cannot disagree about what a job is short of. */}
              {remaining.length > 0 ? (
                <div className="sched-confirm-todo">
                  <p className="sched-confirm-todo-head">Still outstanding</p>
                  <ul>
                    {remaining.map((item) => (
                      <li key={item.key}>
                        {item.href ? <Link href={item.href}>{item.label}</Link> : item.label}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <form
                action={async (formData: FormData) => {
                  // Crew first: scheduling revalidates the page and unmounts
                  // this panel, and a crew write fired after that would be
                  // racing its own teardown.
                  if (crewIds.length > 0 || (job.crewIds ?? []).length > 0) {
                    const crewForm = new FormData();
                    for (const id of crewIds) crewForm.append('crewIds', id);
                    // The switch, not a hardcoded true. Only ADDS ever text —
                    // taking somebody off a job has never messaged anybody.
                    await updateJobCrewAction(job.id, notifyCrew, crewForm);
                  }
                  await scheduleJobAction(job.id, formData);
                }}
              >
                <input type="hidden" name="scheduledFor" value={dateKey ?? ''} />
                <input type="hidden" name="scheduledTime" value={time} />
                {/* NAMED FOR WHAT IT DOES, AND OFF UNTIL IT CAN DO IT. It was
                    "Save Start Date", always enabled — and pressing it with an
                    empty date redirected back to the queue having done nothing,
                    which is indistinguishable from a broken button. */}
                {/* The same word the queue card used to get you here. An
                    unapproved quote is being penciled in, and a button that
                    says "Schedule job" on work nobody has bought is the
                    contradiction this panel is downstream of. */}
                <SaveButton
                  className="btn primary sched-confirm-go"
                  disabled={!ready}
                  title={ready ? undefined : 'Choose a day first'}
                  pendingLabel={job.approved ? 'Scheduling…' : 'Penciling in…'}
                  savedLabel={job.approved ? 'Scheduled' : 'Penciled in'}
                >
                  {job.approved ? 'Schedule job' : 'Tentatively schedule'}
                </SaveButton>
              </form>
            </section>
          </>
        ) : (
          /* --- LET THE CUSTOMER PICK ---------------------------------- */
          <section className="sched-step" aria-labelledby="sched-step-ask">
            <h3 id="sched-step-ask"><i aria-hidden="true">2</i> Send the options</h3>
            <form action={sendClientScheduleOptionsAction.bind(null, job.id)} className="sched-ask-form">
              <p className="sched-step-note">
                Send up to 3 dates you&apos;re free. We&apos;ll email you and flag it here the moment they answer.
              </p>
              <div className="field">
                <label htmlFor={`sched-phone-${job.id}`}>Client mobile</label>
                <input
                  id={`sched-phone-${job.id}`}
                  name="scheduleClientPhone"
                  type="tel"
                  defaultValue={job.clientPhone ?? ''}
                  placeholder="(248) 555-0117"
                />
              </div>
              <ClientScheduleOptionsCalendar availability={clientAvailability} />
              <label className="sms-consent-check">
                <input name="scheduleSmsConsent" type="checkbox" required />
                <span>The client agreed to receive transactional scheduling texts. Reply STOP to opt out.</span>
              </label>
              <SaveButton className="btn primary sched-confirm-go" pendingLabel="Sending…" savedLabel="Sent">
                Send dates to client
              </SaveButton>
            </form>
          </section>
        )}
      </aside>
    </>
  );
}
