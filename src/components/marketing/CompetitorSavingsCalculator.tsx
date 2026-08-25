'use client';

import { useState } from 'react';
import Link from 'next/link';
import { APP_SIGNUP_URL } from '@/components/marketing/links';
import styles from './competitor-savings-calculator.module.css';

type TeamSizeOption = {
  id: 'solo' | 'small' | 'mid' | 'large';
  label: string;
  users: number;
  sub: string;
};

const TEAM_SIZES: readonly TeamSizeOption[] = [
  { id: 'solo', label: 'Solo (1 User)', users: 1, sub: 'Owner-operator' },
  { id: 'small', label: '3 Users', users: 3, sub: 'Small crew' },
  { id: 'mid', label: '7 Users', users: 7, sub: 'Growing team' },
  { id: 'large', label: '15 Users', users: 15, sub: 'Established fleet' },
];

export type CompetitorSavingsCalculatorProps = {
  competitorName?: string;
  className?: string;
};

export default function CompetitorSavingsCalculator({
  competitorName = 'Jobber',
  className,
}: CompetitorSavingsCalculatorProps) {
  const [selectedTeam, setSelectedTeam] = useState<TeamSizeOption['id']>('small');
  const [includeWebsiteCost, setIncludeWebsiteCost] = useState(true);

  const team = TEAM_SIZES.find((t) => t.id === selectedTeam) ?? TEAM_SIZES[1];

  // Jobber pricing model:
  // 1 user: Core ($49/mo) or Connect ($169/mo). Most switchers want 2-way text & QuickBooks ($169/mo)
  // 3 users: Connect ($169/mo)
  // 7 users: Grow ($349/mo)
  // 15 users: Grow ($349/mo)
  let jobberBaseMonthly = 169;
  if (team.users === 1) jobberBaseMonthly = 49;
  else if (team.users <= 5) jobberBaseMonthly = 169;
  else jobberBaseMonthly = 349;

  const websiteHostingMonthly = includeWebsiteCost ? 35 : 0; // Wix/Squarespace/Webflow average
  const jobberTotalMonthly = jobberBaseMonthly + websiteHostingMonthly;
  const jobberAnnualTotal = jobberTotalMonthly * 12;

  // LGQ pricing model:
  // Flex is $0/mo base for any team size!
  // Or Growth is $99/mo for up to 5 office users + 15 crew
  const _lgqFlexMonthly = 0;
  const lgqFlexAnnual = 0;
  const annualSavingsOnFlex = jobberAnnualTotal - lgqFlexAnnual;

  return (
    <section
      className={[styles.wrapper, className].filter(Boolean).join(' ')}
      aria-label="Cost comparison and annual savings calculator"
      id="savings-calculator"
    >
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.kicker}>ROI &amp; Cost Calculator</span>
          <h2 className={styles.title}>
            See how much you save switching from <em>{competitorName}</em>.
          </h2>
          <p className={styles.subtitle}>
            Jobber bills your credit card fixed subscription fees every 30 days and doesn&apos;t include a website.
            See your exact annual savings with Let&apos;s Get Quoted.
          </p>
        </div>

        <div className={styles.calculatorCard}>
          {/* Controls Bar */}
          <div className={styles.controlsGrid}>
            <div className={styles.controlGroup}>
              <label className={styles.controlLabel}>1. Select Your Team Size</label>
              <div className={styles.segmentedButtons} role="tablist" aria-label="Select team size">
                {TEAM_SIZES.map((opt) => {
                  const isActive = opt.id === selectedTeam;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      className={`${styles.segmentBtn} ${isActive ? styles.segmentBtnActive : ''}`}
                      onClick={() => setSelectedTeam(opt.id)}
                    >
                      <span className={styles.segmentLabel}>{opt.label}</span>
                      <span className={styles.segmentSub}>{opt.sub}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={styles.controlGroup}>
              <label className={styles.controlLabel}>2. Separate Website Costs</label>
              <label className={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={includeWebsiteCost}
                  onChange={(e) => setIncludeWebsiteCost(e.target.checked)}
                  className={styles.checkbox}
                />
                <span className={styles.toggleText}>
                  Include separate website fee (Wix/Squarespace/WordPress at ~$35/mo)
                </span>
              </label>
              <p className={styles.toggleHint}>
                Jobber does not build or host contractor websites. LGQ includes your custom SEO site for free.
              </p>
            </div>
          </div>

          {/* Comparison Output Grid */}
          <div className={styles.resultGrid}>
            {/* Competitor Side */}
            <div className={styles.compColumn}>
              <div className={styles.colHeader}>
                <span className={styles.colBadgeComp}>{competitorName} Total</span>
                <span className={styles.colSub}>Fixed recurring software bill</span>
              </div>

              <div className={styles.priceDisplay}>
                <div className={styles.monthlyAmount}>
                  <span className={styles.currency}>$</span>
                  <span className={styles.number}>{jobberTotalMonthly}</span>
                  <span className={styles.period}>/ month</span>
                </div>
                <div className={styles.annualAmount}>
                  <strong>${jobberAnnualTotal.toLocaleString()}</strong> billed per year
                </div>
              </div>

              <ul className={styles.breakdownList}>
                <li>
                  <span className={styles.iconRed}>✗</span>
                  <span>
                    {competitorName} Base ({team.users === 1 ? 'Core' : team.users <= 5 ? 'Connect' : 'Grow'}):{' '}
                    <strong>${jobberBaseMonthly}/mo</strong>
                  </span>
                </li>
                <li>
                  <span className={styles.iconRed}>✗</span>
                  <span>
                    {includeWebsiteCost ? (
                      <>Separate Website Hosting: <strong>+$35/mo</strong></>
                    ) : (
                      <>No Website Included (build on 3rd party)</>
                    )}
                  </span>
                </li>
                <li>
                  <span className={styles.iconRed}>✗</span>
                  <span>Billed 100% even during slow winter months</span>
                </li>
              </ul>
            </div>

            {/* LGQ Side (Winner) */}
            <div className={styles.lgqColumn}>
              <div className={styles.popularBadge}>Performance-Aligned</div>
              <div className={styles.colHeader}>
                <span className={styles.colBadgeLgq}>Let’s Get Quoted (Flex)</span>
                <span className={styles.colSubLgq}>$0 Monthly Overhead</span>
              </div>

              <div className={styles.priceDisplayLgq}>
                <div className={styles.monthlyAmountLgq}>
                  <span className={styles.currencyLgq}>$</span>
                  <span className={styles.numberLgq}>0</span>
                  <span className={styles.periodLgq}>/ month base</span>
                </div>
                <div className={styles.annualAmountLgq}>
                  Pay only 1.25% platform fee <em>when you get paid</em>
                </div>
              </div>

              <ul className={styles.breakdownListLgq}>
                <li>
                  <span className={styles.iconGreen}>✓</span>
                  <span>
                    <strong>$0/mo fixed software bills</strong> — zero overhead risk
                  </span>
                </li>
                <li>
                  <span className={styles.iconGreen}>✓</span>
                  <span>
                    <strong>Custom SEO website included</strong> with 20+ trade themes
                  </span>
                </li>
                <li>
                  <span className={styles.iconGreen}>✓</span>
                  <span>
                    <strong>24/7 AI Smart Intake &amp; Scorer</strong> qualified leads 24/7
                  </span>
                </li>
                <li>
                  <span className={styles.iconGreen}>✓</span>
                  <span>
                    <strong>Route-Aware Quick Stops</strong> to fill empty schedule gaps
                  </span>
                </li>
              </ul>

              {/* Huge Savings Callout */}
              <div className={styles.savingsBox}>
                <div className={styles.savingsTag}>Your Guaranteed Savings</div>
                <div className={styles.savingsFigure}>
                  +${annualSavingsOnFlex.toLocaleString()} / year
                </div>
                <div className={styles.savingsSub}>
                  Keep your hard-earned profits instead of paying fixed SaaS subscriptions.
                </div>
              </div>
            </div>
          </div>

          {/* Card Footer CTA */}
          <div className={styles.cardFooter}>
            <div className={styles.footerNote}>
              🔒 No credit card required. Free 1-click customer CSV migration from {competitorName}.
            </div>
            <Link href={APP_SIGNUP_URL} className={styles.ctaButton}>
              Start Free on Flex ($0/mo) &rarr;
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
