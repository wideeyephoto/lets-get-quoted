'use client';

import CinematicMessageSimulation from './CinematicMessageSimulation';

/**
 * The product tour / interactive workflow simulation across the middle of /features.
 *
 * Visualizes the connected 5-stage contractor workflow across 5 trades:
 * Request received → Qualified → Quote approved → Scheduled → Deposit paid.
 */
export default function ProductTour() {
  return (
    <section className="tour-band" id="tour" aria-labelledby="tour-title">
      <h2 className="sr-only" id="tour-title">
        A walkthrough of the full customer and contractor journey
      </h2>
      <CinematicMessageSimulation />
      <p className="tour-note">
        The full customer and job workflow simulation across five trades: website lead → AI qualification → approved quote → scheduled dispatch → deposit paid.
      </p>
    </section>
  );
}

