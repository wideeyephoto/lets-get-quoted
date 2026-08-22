'use client';

import { useEffect, useState } from 'react';

/**
 * The mockup's hero, with the one thing about it that could not ship.
 *
 * It read "Solo could save $25-$32/month". That number came from an invented
 * $10 of monthly credit spend, and a REAL saving needs a workspace's collections
 * history -- of which there is none: zero settled, non-test payments across
 * every account. A confident dollar figure derived from nothing is the single
 * worst thing this page could put in an orange box.
 *
 * So the banner keeps its shape, its button and its prominence, and changes what
 * it claims: the volume at which the next plan up starts costing less. That is
 * exact arithmetic from catalog constants, true today, and true whatever anybody
 * eventually collects. When collections history exists, this is where a real
 * saving would go.
 *
 * "NOT NOW" HAS TO STICK. A dismissal that reappears on the next page load is
 * not a dismissal, it is a delay -- so it is remembered per PLAN, and comes back
 * if the plan changes, because the advice is different then.
 */
export default function PlanFitBanner({
  planCode,
  nextPlanName,
  thresholdLabel,
  ctaHref,
  workingOut,
}: {
  planCode: string;
  nextPlanName: string;
  /** Already formatted, e.g. "about $5,200 a month". */
  thresholdLabel: string;
  /** Null when there is no upgrade route switched on to send anybody to. */
  ctaHref: string | null;
  workingOut: string;
}) {
  const storageKey = `lgq-plan-fit-dismissed:${planCode}`;
  // Starts visible and hides in an effect rather than reading storage during
  // render: the server has no localStorage, and branching on it in the first
  // paint is a hydration mismatch.
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(storageKey) === '1') setDismissed(true);
    } catch { /* private mode, or storage disabled. Showing it is the safe side. */ }
  }, [storageKey]);

  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try { window.localStorage.setItem(storageKey, '1'); } catch { /* nothing to do */ }
  };

  return (
    // No id: the linkable section is the band ladder below, and two elements
    // sharing `plan-fit` would make the anchor resolve to whichever came first.
    <section className="plan-fit-banner" aria-label="Plan suggestion">
      <div className="plan-fit-banner-body">
        <p className="plan-fit-banner-head">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="plan-fit-banner-ic">
            <path d="M9 18h6M10 21h4" />
            <path d="M12 3a6 6 0 0 0-3.5 10.9c.4.3.6.8.6 1.3v.3h5.8v-.3c0-.5.2-1 .6-1.3A6 6 0 0 0 12 3Z" />
          </svg>
          <span>
            {nextPlanName} costs less once you collect {thresholdLabel}
          </span>
        </p>
        <details className="plan-fit-banner-working">
          <summary>How we worked this out</summary>
          <p>{workingOut}</p>
        </details>
      </div>
      <div className="plan-fit-banner-actions">
        <button type="button" className="btn subtle" onClick={dismiss}>Not now</button>
        {ctaHref ? (
          <a className="btn" href={ctaHref}>Review {nextPlanName}</a>
        ) : null}
      </div>
    </section>
  );
}
