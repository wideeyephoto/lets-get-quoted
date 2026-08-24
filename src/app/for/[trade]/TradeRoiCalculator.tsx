'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { type Trade, getTradeEconomics } from '@/lib/trades';
import { APP_SIGNUP_URL } from '@/components/marketing/links';
import styles from './trade-roi.module.css';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function TradeRoiCalculator({ trade }: { trade: Trade }) {
  const economics = useMemo(() => getTradeEconomics(trade), [trade]);
  const [monthlyVolume, setMonthlyVolume] = useState<number>(economics.typicalMonthlyVolume);

  const calculations = useMemo(() => {
    // Annual volume
    const annualVolume = monthlyVolume * 12;
    // Estimated jobs per year based on avg ticket
    const jobsPerYear = Math.max(6, Math.round(annualVolume / (economics.avgTicket || 1000)));

    // Legacy fixed costs (Jobber Grow / Housecall Pro + 2 tech seats ~ $249/mo + $60/mo seats = $309/mo = $3,708/yr)
    const legacyAnnualFixed = 3708;

    // LGQ Flex fixed cost: $0/year!
    const lgqFlexFixed = 0;
    const softwareSavings = legacyAnnualFixed - lgqFlexFixed;

    // Quick Stop additional revenue upside (filling 2-4 route gaps / month)
    const quickStopAnnualUpside = economics.quickStopMonthlyBonus * 12;

    // Total annual economic advantage
    const totalAnnualAdvantage = softwareSavings + quickStopAnnualUpside;

    return {
      annualVolume,
      jobsPerYear,
      softwareSavings,
      quickStopAnnualUpside,
      totalAnnualAdvantage,
    };
  }, [monthlyVolume, economics]);

  const signupUrl = `${APP_SIGNUP_URL}?trade=${encodeURIComponent(trade.slug)}`;

  return (
    <section className={styles.section} id="roi-calculator">
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.kicker}>Economics &amp; Profit</span>
          <h2 className={styles.title}>
            How much more do <em>{trade.name}</em> keep with Let’s Get Quoted?
          </h2>
          <p className={styles.subtitle}>
            Traditional software charges \$300+/month before you even book a job. With \$0 monthly overhead on Flex and
            built-in route matching, your bottom line looks radically different.
          </p>
        </div>

        <div className={styles.card}>
          <div className={styles.calculatorGrid}>
            {/* Input Controls */}
            <div className={styles.controlsSide}>
              <div className={styles.inputGroup}>
                <div className={styles.inputHeader}>
                  <label htmlFor="volume-slider" className={styles.label}>
                    Your Estimated Monthly Card Volume:
                  </label>
                  <span className={styles.volumeValue}>{formatCurrency(monthlyVolume)}/mo</span>
                </div>
                <input
                  id="volume-slider"
                  type="range"
                  min={5000}
                  max={120000}
                  step={2500}
                  value={monthlyVolume}
                  onChange={(e) => setMonthlyVolume(Number(e.target.value))}
                  className={styles.slider}
                  aria-label="Monthly credit card volume"
                />
                <div className={styles.sliderTicks}>
                  <span>\$5k/mo</span>
                  <span>\$50k/mo</span>
                  <span>\$120k/mo</span>
                </div>
              </div>

              <div className={styles.benchmarks}>
                <div className={styles.benchmarkItem}>
                  <span className={styles.benchmarkLabel}>Industry Avg Ticket:</span>
                  <strong className={styles.benchmarkVal}>{formatCurrency(economics.avgTicket)}</strong>
                </div>
                <div className={styles.benchmarkItem}>
                  <span className={styles.benchmarkLabel}>Est. Completed Jobs:</span>
                  <strong className={styles.benchmarkVal}>~{calculations.jobsPerYear} jobs / yr</strong>
                </div>
                <div className={styles.benchmarkItem}>
                  <span className={styles.benchmarkLabel}>Fixed Monthly Software Fee:</span>
                  <strong className={styles.benchmarkValHighlight}>$0 on Flex</strong>
                </div>
              </div>
            </div>

            {/* Output Advantage Display */}
            <div className={styles.resultsSide}>
              <div className={styles.totalBlock}>
                <span className={styles.totalLabel}>Estimated Annual Profit Advantage</span>
                <span className={styles.totalAmount}>+{formatCurrency(calculations.totalAnnualAdvantage)}</span>
                <span className={styles.totalSub}>in cash kept + extra booked jobs / year</span>
              </div>

              <div className={styles.breakdownList}>
                <div className={styles.breakdownItem}>
                  <div className={styles.breakdownHead}>
                    <span className={styles.checkIcon}>✓</span>
                    <span>Zero Subscription Bloat:</span>
                  </div>
                  <strong>+{formatCurrency(calculations.softwareSavings)}/yr</strong>
                </div>
                <p className={styles.breakdownDesc}>
                  Save over \$3,700/year in fixed monthly software subscriptions and extra seat fees.
                </p>

                <div className={styles.breakdownItem}>
                  <div className={styles.breakdownHead}>
                    <span className={styles.checkIcon}>✓</span>
                    <span>Route-Aware Quick Stops:</span>
                  </div>
                  <strong>+{formatCurrency(calculations.quickStopAnnualUpside)}/yr</strong>
                </div>
                <p className={styles.breakdownDesc}>
                  Fill idle windshield time along existing job routes with automated emergency &amp; quick-fix dispatch.
                </p>
              </div>

              <div className={styles.actionRow}>
                <Link href={signupUrl} className={styles.primaryCta}>
                  Launch Free {trade.name} Site &rarr;
                </Link>
                <span className={styles.ctaNote}>No credit card required · Free forever on Flex</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
