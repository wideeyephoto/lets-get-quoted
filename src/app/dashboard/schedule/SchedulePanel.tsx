'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import ScheduledDatePicker from '@/components/scheduled-date-picker';
import TimeSlotSelect from '@/components/time-slot-select';
import SaveButton from '@/components/save-button';
import ClientScheduleOptionsCalendar from './client-schedule-options-calendar';
import { scheduleJobAction, sendClientScheduleOptionsAction, updateJobCrewAction } from '../jobs/actions';
import { scheduleReady, suggestSlots, type SuggestedSlot } from '@/lib/schedule-suggestions';
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
            {/* Not "0h". An unestimated job is the reason a day can read as
                empty when it is not — see the capacity ramp — and this is where
                somebody can still do something about it. */}
            <dd>
              {job.estimatedHours ? `${job.estimatedHours} hrs` : (
                <Link href={`/dashboard/jobs/${job.id}`}>Not set — add one</Link>
              )}
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
                          <span className="sched-slot-when">
                            <strong>{relativeLabel(slot.dateKey, context.todayKey) ?? dayLabel(slot.dateKey)}</strong>
                            <em>{clockLabel(slot.time)}</em>
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
                <div className="sched-crew-list">
                  {crew.map((member) => {
                    const on = crewIds.includes(member.id);
                    return (
                      <label className="sched-crew-option" key={member.id}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => setCrewIds((current) => on ? current.filter((id) => id !== member.id) : [...current, member.id])}
                        />
                        <span className="sched-crew-check" aria-hidden="true">✓</span>
                        <span className="sched-crew-copy">
                          <strong>{member.name}</strong>
                          <small>{member.role_label}</small>
                        </span>
                      </label>
                    );
                  })}
                </div>
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
                <SaveButton
                  className="btn primary sched-confirm-go"
                  disabled={!ready}
                  title={ready ? undefined : 'Choose a day first'}
                  pendingLabel="Scheduling…"
                  savedLabel="Scheduled"
                >
                  Schedule job
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
