'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { SENSITIVITIES } from '@/lib/weather';
import { updateWeatherSettingsAction, weatherRisksAction, type WeatherRiskView } from './weather-actions';

function formatDay(value: string): string {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Jobs the forecast is against.
 *
 * Every action here ends with the contractor doing something. There is no
 * "reschedule these for me" button, and that's deliberate: a calendar that moves
 * work on a forecast will eventually move a job on a day that turns out fine,
 * and the customer who took the morning off stops trusting your dates.
 *
 * Checked on demand rather than on page load. It's two requests to a free public
 * service per location, and a contractor opening their schedule forty times a
 * day shouldn't spend that.
 */
export default function WeatherPanel({
  enabled,
  profile,
  justEnabled = false,
}: {
  enabled: boolean;
  profile: string;
  /**
   * True on the one render that follows pressing "Turn it on".
   *
   * WHY A FLAG AND NOT "CHECK WHEN ENABLED". Turning a feature on and being
   * handed another button to press is not turning it on — but checking on every
   * render would mean two requests to a free public service per location every
   * time somebody opens their schedule settings, which is the thing the
   * on-demand design exists to avoid. This is the one moment they have actually
   * asked for a forecast, so it is the one moment it fetches by itself.
   */
  justEnabled?: boolean;
}) {
  const [state, setState] = useState<{ checked: boolean; risks: WeatherRiskView[] }>({ checked: false, risks: [] });
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function check() {
    startTransition(async () => {
      const result = await weatherRisksAction();
      setState({ checked: true, risks: result.risks });
    });
  }

  // Once, and never twice: an effect runs a second time under React's strict
  // double-invoke in development, and this one costs a network round trip.
  const autoChecked = useRef(false);
  useEffect(() => {
    if (!justEnabled || !enabled || autoChecked.current) return;
    autoChecked.current = true;
    check();
    // check() is stable enough for this — it only closes over setState and the
    // transition starter, both of which React guarantees are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justEnabled, enabled]);

  if (!enabled) {
    return (
      <details className="panel workspace-section-card workspace-details">
        <summary className="workspace-details-summary">
          <div className="section-heading workspace-section-heading compact-heading">
            <p className="eyebrow">Weather</p>
            <h2>Watch the forecast</h2>
          </div>
          <span className="workspace-details-copy">Flag scheduled work the weather is going to ruin.</span>
        </summary>
        <form action={updateWeatherSettingsAction} className="form-grid compact-form">
          <p className="workspace-details-copy" style={{ marginTop: 0 }}>
            Checks the US National Weather Service forecast against your scheduled jobs and tells you which days are
            in trouble. It never moves anything — you decide, and it drafts the text.
          </p>
          {/* No checkbox. It was ticked by default and the only button on the
              card says "Turn it on" — two controls for one boolean, where the
              checkbox can only ever disagree with the button you just pressed.
              Submitting the form IS the yes. */}
          <div className="field">
            <label htmlFor="weatherProfile">What stops your work</label>
            <select id="weatherProfile" name="weatherProfile" defaultValue="">
              <option value="">Work it out from my trade ({profile})</option>
              {SENSITIVITIES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <small className="field-hint">
              A painter and a landscaper care about very different days. This sets the thresholds.
            </small>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn primary">Turn it on</button>
          </div>
        </form>
      </details>
    );
  }

  return (
    <section className="panel workspace-section-card" id="weather-panel">
      <div className="section-heading workspace-section-heading compact-heading">
        <p className="eyebrow">Weather · {profile}</p>
        <h2>Days that look wrong</h2>
      </div>

      {!state.checked ? (
        <>
          <p className="workspace-details-copy" style={{ marginTop: 0 }}>
            {pending
              ? 'Reading the forecast for every day you have work booked. Takes a few seconds.'
              : 'Checks the next two weeks of scheduled work against the forecast.'}
          </p>
          <button type="button" className="btn secondary" onClick={check} disabled={pending}>
            {pending ? 'Checking…' : 'Check the forecast'}
          </button>
        </>
      ) : state.risks.length === 0 ? (
        <p className="empty-state">
          Nothing in the next two weeks looks like a problem. Jobs without an address on file aren&apos;t checked —
          there&apos;s no forecast for a place we don&apos;t know.
        </p>
      ) : (
        <div className="weather-risk-list">
          {state.risks.map((risk) => (
            <article key={risk.jobId} className={`weather-risk level-${risk.level}`}>
              <header className="weather-risk-head">
                <div>
                  <strong>{formatDay(risk.day)}</strong>
                  <span className="weather-risk-level">{risk.levelLabel}</span>
                </div>
                <Link href={`/dashboard/jobs/${risk.jobId}`} className="weather-risk-job">
                  {risk.clientName}
                  {risk.ref ? ` · ${risk.ref}` : ''} →
                </Link>
              </header>

              <p className="weather-risk-why">
                {risk.summary}
                {risk.reasons.length > 0 ? ` — ${risk.reasons.join(', ')}` : ''}
              </p>

              {risk.alternatives.length > 0 ? (
                <p className="weather-risk-alts">
                  Clear after that: {risk.alternatives.map((alt) => formatDay(alt.day)).join(', ')}.
                </p>
              ) : (
                <p className="weather-risk-alts">
                  Nothing clear inside the forecast. It only reaches about a week out, so check again nearer the time.
                </p>
              )}

              {/* Drafted, not sent. Copy it, change it, decide. */}
              <div className="weather-risk-draft">
                <p>{risk.draftMessage}</p>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    void navigator.clipboard?.writeText(risk.draftMessage);
                    setCopied(risk.jobId);
                  }}
                >
                  {copied === risk.jobId ? 'Copied ✓' : 'Copy this text'}
                </button>
              </div>
            </article>
          ))}
          <p className="weather-risk-foot">
            Nothing here has been sent and nothing has been moved. Open the job to reschedule it.
          </p>
        </div>
      )}
    </section>
  );
}
