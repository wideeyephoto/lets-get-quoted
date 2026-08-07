import Link from 'next/link';
import SaveButton from '@/components/save-button';
import { setQuickStopEnabledAction } from '@/app/dashboard/settings/actions';

// Quick Stop, on the page where you'd actually decide about it.
//
// Quick Stop puts same-day work into today's route, so the day plan is exactly
// where an owner realises they do — or very much do not — want another job
// squeezed in. Until now the only switch was three clicks away in Settings →
// Automations, which is nowhere near a screen showing a day already running
// late.
//
// On/off only. Everything that shapes the offer — the fee band, the detour
// limits, which days, how long a visit can be — stays in Settings, because
// those are decisions about the business rather than about today.

export default function QuickStopPanel({
  enabled,
  locked,
  lockedUntil,
  configured,
  todayCount,
  inert = false,
}: {
  enabled: boolean;
  /** Staff/auto lock from the no-show escalation. Overrides `enabled`. */
  locked: boolean;
  lockedUntil: string | null;
  /** False when it has never been set up, so the panel offers setup not a switch. */
  configured: boolean;
  /** Quick Stops already accepted for this day. */
  todayCount: number;
  /**
   * Renders the panel as a picture of itself: the actions become plain text
   * with the same styling, and nothing is focusable or clickable.
   *
   * The public marketing page uses this. Its version of the panel sits inside
   * an "Example" frame, and a signed-out prospect who tabbed into a live
   * "Set up Quick Stops" would be thrown at the login wall from a page whose
   * every other button goes to the sign-up host.
   */
  inert?: boolean;
}) {
  const state = locked ? 'locked' : enabled ? 'on' : 'off';
  const lockLabel =
    lockedUntil && locked
      ? new Date(lockedUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : null;

  return (
    <section className="panel extrastop-panel" data-state={state}>
      <div className="extrastop-main">
        <div className="extrastop-copy">
          <strong>
            Quick Stops
            <span className="extrastop-state" data-state={state}>
              {state === 'locked' ? 'Paused' : state === 'on' ? 'On' : 'Off'}
            </span>
          </strong>
          <small>
            {state === 'locked'
              ? `Paused by support${lockLabel ? ` until ${lockLabel}` : ''}. Nothing new can be added to a day while it is.`
              : state === 'on'
                ? 'Nearby customers can request a paid same-day visit. Anything that fits your rules is offered at your fee.'
                : 'Nobody can ask to be added to today. Your normal booking is unaffected.'}
            {todayCount > 0 ? ` ${todayCount} already on this day.` : ''}
          </small>
        </div>

        <div className="extrastop-actions">
          {inert ? (
            // A picture of the button, not the button. Same classes so the
            // panel looks identical; a <span> so there is nothing to tab to
            // and nothing to click.
            <span className="btn primary" aria-hidden="true">
              {!configured ? 'Set up Quick Stops' : locked ? 'Why is this paused?' : enabled ? 'Turn off for now' : 'Turn on'}
            </span>
          ) : !configured ? (
            // Nothing to switch on yet: an on/off toggle over an unset fee band
            // and no detour limits would offer work on rules nobody chose.
            <Link href="/dashboard/quick-stops#quick-stop-setup" className="btn primary">
              Set up Quick Stops
            </Link>
          ) : locked ? (
            <Link href="/dashboard/quick-stops#quick-stop-setup" className="btn secondary">
              Why is this paused?
            </Link>
          ) : (
            <>
              <form action={setQuickStopEnabledAction.bind(null, !enabled, 'plan_my_day')}>
                <SaveButton
                  className={enabled ? 'btn secondary' : 'btn primary'}
                  pendingLabel={enabled ? 'Turning off…' : 'Turning on…'}
                  savedLabel="Saved ✓"
                >
                  {enabled ? 'Turn off for now' : 'Turn on'}
                </SaveButton>
              </form>
              <Link href="/dashboard/quick-stops#quick-stop-setup" className="btn ghost">
                Set up
              </Link>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
