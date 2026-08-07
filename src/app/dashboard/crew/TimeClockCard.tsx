import Link from 'next/link';
import SaveButton from '@/components/save-button';
import { TIME_CLOCK_MODES, type TimeClockMode } from '@/lib/time-clock';
import { setTimeClockModeAction } from './settings-actions';
import styles from './crew.module.css';

// Clock in / clock out, as a setting you can find.
//
// WHERE THIS USED TO LIVE, and why that was a bug rather than a preference.
//
// The only control was a <select> inside the "Labor settings" panel on the
// Hours & pay tab — and that panel sits in the rail, which lives in the ELSE
// branch of `rows.length === 0`. With no crew hours logged for the current pay
// period the whole layout is replaced by an empty state, so the rail is not
// rendered at all.
//
// That made it a catch-22: the clock is HOW crew log hours, and the only way to
// switch it on was a control that appears once hours have already been logged
// some other way. Because the check is per PAY PERIOD, an account with a year of
// history lost the setting again during any week nobody had logged time yet.
//
// So it moved here, to the Crew members tab, which renders with zero crew and
// zero hours. It also belongs here on the merits: this changes what a crew
// member's PHONE does, and it was filed among overtime thresholds and rounding
// rules — pay arithmetic, which only means anything once there is pay.
//
// THREE VISIBLE OPTIONS, not a dropdown. "Optional" is the mode most contractors
// actually want, and inside a <select> it was invisible until you opened it.

export default function TimeClockCard({
  mode,
  available,
  crewCount,
  openShiftCount,
}: {
  mode: TimeClockMode;
  /** False only before the time-clock migration has run against this database. */
  available: boolean;
  crewCount: number;
  openShiftCount: number;
}) {
  const current = TIME_CLOCK_MODES.find((option) => option.id === mode);

  return (
    <section id="time-clock" className={`panel ${styles.clockCard}`}>
      <header className={styles.clockHead}>
        <div>
          <p className="eyebrow">Field app</p>
          <h2>Time clock</h2>
        </div>
        <span className={styles.clockState} data-on={mode !== 'off' || undefined}>
          {mode === 'off' ? 'Off' : current?.label}
        </span>
      </header>

      <p className={styles.clockLede}>
        {mode === 'off'
          ? 'Crew type their hours when the work is done. Turn the clock on and they can start and stop a shift from the job in the field app instead, and the hours arrive already counted.'
          : mode === 'optional'
            ? 'Crew can start and stop a shift from the job in the field app, or still just type their hours. Either way it lands as a labor cost on that job.'
            : 'Clocking in and out is the only way crew log time. The hours box is gone from the field app, so every hour on this account came off a clock.'}
      </p>

      {!available ? (
        <p className={styles.clockWarn}>
          The time-clock migration has not been run against this database yet, so this cannot be saved.
        </p>
      ) : null}

      <form action={setTimeClockModeAction} className={styles.clockForm}>
        <fieldset disabled={!available}>
          <legend className="sr-only">Time clock mode</legend>
          {TIME_CLOCK_MODES.map((option) => (
            <label key={option.id} className={styles.clockOption}>
              <input type="radio" name="timeClockMode" value={option.id} defaultChecked={option.id === mode} />
              <span>
                <strong>{option.label}</strong>
                <em>{option.hint}</em>
              </span>
            </label>
          ))}
        </fieldset>
        <SaveButton className="btn primary" onlyWhenChanged>Save</SaveButton>
      </form>

      <div className={styles.clockNotes}>
        {crewCount === 0 ? (
          // Said plainly rather than by disabling the form: the setting is still
          // worth making now, and the reason nothing will happen yet is a fact
          // about the roster, not about this control.
          <p>
            Nobody to clock in yet — add a crew member and invite them to the field app, and this applies from
            their first job.
          </p>
        ) : null}
        {mode !== 'off' ? (
          <p>
            A shift left open overnight becomes a day nobody worked, so open shifts are flagged on{' '}
            <Link href="/dashboard/crew?tab=hours">Hours &amp; pay</Link> and you can close one at the time they
            actually stopped.
            {openShiftCount > 0
              ? ` ${openShiftCount} ${openShiftCount === 1 ? 'shift is' : 'shifts are'} running right now.`
              : ''}
          </p>
        ) : null}
      </div>
    </section>
  );
}
