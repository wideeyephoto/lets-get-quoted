'use client';

import { useState } from 'react';
import Link from 'next/link';
import { APP_SIGNUP_URL } from '@/components/marketing/links';
import styles from './change-order-leakage.module.css';

export default function ChangeOrderLeakageCalculator() {
  const [jobsPerMonth, setJobsPerMonth] = useState<number>(8);
  const [avgChangeOrder, setAvgChangeOrder] = useState<number>(400);
  const [unbilledPerMonth, setUnbilledPerMonth] = useState<number>(2);

  const monthlyLoss = unbilledPerMonth * avgChangeOrder;
  const annualLoss = monthlyLoss * 12;
  const planCostAnnual = 99 * 12; // Base plan reference
  const roiMultiplier = Math.round(annualLoss / planCostAnnual);

  return (
    <div className={styles.wrapper}>
      <div className={styles.headerRow}>
        <span className={styles.badge}>💸 Change Order Profit Leakage Calculator</span>
        <h3 className={styles.title}>
          How much money is your business losing in unbilled field changes?
        </h3>
        <p className={styles.subtitle}>
          Adjust the sliders below to calculate how many thousands of dollars slip through the cracks
          each year when on-site change orders are jotted on scrap lumber and forgotten.
        </p>
      </div>

      <div className={styles.calcGrid}>
        {/* Sliders Column */}
        <div className={styles.slidersCol}>
          {/* Slider 1: Jobs per month */}
          <div className={styles.sliderGroup}>
            <div className={styles.sliderLabelRow}>
              <span className={styles.sliderLabel}>Active Jobs Managed Per Month:</span>
              <span className={styles.sliderValueTag}>{jobsPerMonth} jobs</span>
            </div>
            <input
              type="range"
              min={1}
              max={40}
              step={1}
              value={jobsPerMonth}
              onChange={(e) => setJobsPerMonth(Number(e.target.value))}
              className={styles.sliderInput}
            />
          </div>

          {/* Slider 2: Average Change Order */}
          <div className={styles.sliderGroup}>
            <div className={styles.sliderLabelRow}>
              <span className={styles.sliderLabel}>Average On-Site Change Order Value:</span>
              <span className={styles.sliderValueTag}>${avgChangeOrder}</span>
            </div>
            <input
              type="range"
              min={100}
              max={2500}
              step={50}
              value={avgChangeOrder}
              onChange={(e) => setAvgChangeOrder(Number(e.target.value))}
              className={styles.sliderInput}
            />
          </div>

          {/* Slider 3: Unbilled per month */}
          <div className={styles.sliderGroup}>
            <div className={styles.sliderLabelRow}>
              <span className={styles.sliderLabel}>Unbilled / Forgotten Changes Per Month:</span>
              <span className={styles.sliderValueTag}>{unbilledPerMonth} unbilled</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={unbilledPerMonth}
              onChange={(e) => setUnbilledPerMonth(Number(e.target.value))}
              className={styles.sliderInput}
            />
          </div>
        </div>

        {/* Result Card */}
        <div className={styles.resultCard}>
          <div className={styles.resultHead}>
            <span className={styles.resultEyebrow}>Estimated Annual Revenue Leakage</span>
            <span style={{ fontSize: '18px' }}>⚠️</span>
          </div>

          <div className={styles.lossBox}>
            <div className={styles.lossAmount}>
              -${annualLoss.toLocaleString('en-US')}/yr
            </div>
            <span className={styles.lossSub}>
              (${monthlyLoss.toLocaleString('en-US')}/month lost in uncollected labor &amp; materials)
            </span>
          </div>

          <div className={styles.savingsBox}>
            <span className={styles.savingsTitle}>
              ✦ Captured Instantly with Text-to-Job
            </span>
            <p className={styles.savingsDetail}>
              Dictate every extra Romex run, plywood sheet, or fixture change from the cab of your
              truck. Recalculates quote math and queues customer approval in 1.4 seconds.
            </p>
            <div className={styles.payoffBadge}>
              🚀 Pays for itself {roiMultiplier > 0 ? `${roiMultiplier}x` : '10x'} over on your first captured change order
            </div>
          </div>

          <Link href={APP_SIGNUP_URL} style={{
            background: '#ff6a24',
            color: '#081722',
            textDecoration: 'none',
            fontSize: '13px',
            fontWeight: 850,
            padding: '12px',
            borderRadius: '10px',
            textAlign: 'center',
            boxShadow: '0 4px 14px rgba(255, 106, 36, 0.4)',
          }}>
            Stop Losing Change Orders &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
