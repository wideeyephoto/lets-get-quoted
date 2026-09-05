import Link from 'next/link';
import SaveButton from '@/components/save-button';
import { TIME_CLOCK_MODES, type TimeClockMode } from '@/lib/time-clock';
import { setTimeClockModeAction } from './settings-actions';
import styles from './crew.module.css';

// Clock in / clock out, beside the hours it creates.
//
// This card intentionally remains outside HoursAndPay's rows/no-rows branch.
// That keeps it reachable in a brand-new or empty pay period, while filing the
// setting in the workflow where owners review the result. Three visible options
// keep the recommended Optional mode discoverable without opening a dropdown.

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
            <Link href="/dashboard/crew?tab=timecards">Timecards</Link> and you can close one at the time they
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
