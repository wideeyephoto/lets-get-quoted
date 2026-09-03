'use client';

import { useState } from 'react';
import styles from './neighborhood-halo.module.css';

export default function HaloRoiCalculator() {
  const [completedJobsPerMonth, setCompletedJobsPerMonth] = useState<number>(6);
  const [avgTicketDollars, setAvgTicketDollars] = useState<number>(8500);
  const [closeRatePct, setCloseRatePct] = useState<number>(30);

  // Math models
  const totalHaloSpend = completedJobsPerMonth * 25; // $25 per completed job halo
  const estNeighborLeads = Math.round(completedJobsPerMonth * 2.2); // ~2.2 neighbor inquiries per halo
  const closedNeighborJobs = Math.max(1, Math.round(estNeighborLeads * (closeRatePct / 100)));
  const addedRevenue = closedNeighborJobs * avgTicketDollars;
  const driveHoursSaved = closedNeighborJobs * 4.5; // ~4.5 hours windshield time saved per clustered job
  const fuelDollarsSaved = Math.round(closedNeighborJobs * 65); // ~$65 gas & vehicle depreciation saved per clustered job
  const roasMultiplier = Math.round((addedRevenue / Math.max(1, totalHaloSpend)));

  return (
    <section className="section-block" aria-labelledby="halo-roi-title" style={{ margin: '56px 0' }}>
      <div style={{ textAlign: 'center', maxWidth: '720px', margin: '0 auto 2rem' }}>
        <p className="eyebrow" style={{ color: 'var(--accent, #f97316)', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          🧮 Route Density Economics
        </p>
        <h2 id="halo-roi-title" style={{ fontSize: '2rem', fontWeight: 800, margin: '0.35rem 0 0.75rem', letterSpacing: '-0.02em' }}>
          Calculate your monthly neighbor cluster return.
        </h2>
        <p style={{ color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.6, fontSize: '0.98rem' }}>
          See how many hours of windshield traffic and thousands in revenue you unlock when your trucks trigger automatic 1-mile halos after every completed job.
        </p>
      </div>

      <div className={styles.roiContainer}>
        {/* Sliders Grid */}
        <div className={styles.roiSlidersRow}>
          <div className={styles.roiSliderGroup}>
            <div className={styles.roiSliderHeader}>
              <label htmlFor="completed-jobs-slider">Completed Jobs / Month</label>
              <strong>{completedJobsPerMonth} Projects</strong>
            </div>
            <input
              id="completed-jobs-slider"
              type="range"
              min="2"
              max="20"
              step="1"
              value={completedJobsPerMonth}
              onChange={(e) => setCompletedJobsPerMonth(Number(e.target.value))}
              className={styles.roiSliderInput}
            />
            <span className={styles.sliderHelpText}>
              Each job launches a $25 / 5-day micro-campaign ($5/day pacing).
            </span>
          </div>

          <div className={styles.roiSliderGroup}>
            <div className={styles.roiSliderHeader}>
              <label htmlFor="avg-ticket-slider">Average Job Ticket Size</label>
              <strong>${avgTicketDollars.toLocaleString()}</strong>
            </div>
            <input
              id="avg-ticket-slider"
              type="range"
              min="1500"
              max="25000"
              step="500"
              value={avgTicketDollars}
              onChange={(e) => setAvgTicketDollars(Number(e.target.value))}
              className={styles.roiSliderInput}
            />
            <span className={styles.sliderHelpText}>
              Contract value for replacements, installs, or major service calls.
            </span>
          </div>

          <div className={styles.roiSliderGroup}>
            <div className={styles.roiSliderHeader}>
              <label htmlFor="close-rate-slider">Estimate Close Rate</label>
              <strong>{closeRatePct}%</strong>
            </div>
            <input
              id="close-rate-slider"
              type="range"
              min="15"
              max="50"
              step="5"
              value={closeRatePct}
              onChange={(e) => setCloseRatePct(Number(e.target.value))}
              className={styles.roiSliderInput}
            />
            <span className={styles.sliderHelpText}>
              Neighbor leads close at 2–3x higher rates due to on-street trust.
            </span>
          </div>
        </div>

        {/* Results Matrix */}
        <div className={styles.roiResultsMatrix}>
          <div className={styles.roiMatrixCard}>
            <span className={styles.roiMatrixLabel}>TOTAL HALO AD SPEND</span>
            <div className={styles.roiMatrixVal} style={{ color: '#38bdf8' }}>
              ${totalHaloSpend} <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>/mo</span>
            </div>
            <p className={styles.roiMatrixDesc}>
              {completedJobsPerMonth} targeted 1-mile campaigns &middot; 100% direct click spend
            </p>
          </div>

          <div className={styles.roiMatrixCard}>
            <span className={styles.roiMatrixLabel}>NEW NEIGHBOR REVENUE</span>
            <div className={styles.roiMatrixVal} style={{ color: '#34d399' }}>
              +${addedRevenue.toLocaleString()}
            </div>
            <p className={styles.roiMatrixDesc}>
              ~{closedNeighborJobs} closed jobs from {estNeighborLeads} verified neighbor leads
            </p>
          </div>

          <div className={styles.roiMatrixCard}>
            <span className={styles.roiMatrixLabel}>WINDSHIELD TIME SAVED</span>
            <div className={styles.roiMatrixVal} style={{ color: '#fdba74' }}>
              {driveHoursSaved} Hours
            </div>
            <p className={styles.roiMatrixDesc}>
              Zero-mile transit on clustered same-day batch appointments
            </p>
          </div>

          <div className={styles.roiMatrixCard}>
            <span className={styles.roiMatrixLabel}>PROJECTED RETURN (ROAS)</span>
            <div className={styles.roiMatrixVal} style={{ color: 'var(--accent, #f97316)' }}>
              {roasMultiplier}x Return
            </div>
            <p className={styles.roiMatrixDesc}>
              +${fuelDollarsSaved} fuel & wear saved &middot; 72h auto-kill protected
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
