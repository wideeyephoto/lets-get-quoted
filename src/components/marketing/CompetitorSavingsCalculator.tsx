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

export type CompetitorOption = 'Jobber' | 'Housecall Pro' | 'ServiceTitan' | 'Angi Leads' | 'Thumbtack';

const COMPETITOR_OPTIONS: readonly CompetitorOption[] = [
  'Jobber',
  'Housecall Pro',
  'ServiceTitan',
  'Angi Leads',
  'Thumbtack',
];

export type CompetitorSavingsCalculatorProps = {
  competitorName?: string;
  allowCompetitorSwitch?: boolean;
  className?: string;
};

export default function CompetitorSavingsCalculator({
  competitorName: initialCompetitorName = 'Jobber',
  allowCompetitorSwitch = false,
  className,
}: CompetitorSavingsCalculatorProps) {
  const [activeCompetitor, setActiveCompetitor] = useState<string>(initialCompetitorName);
  const [selectedTeam, setSelectedTeam] = useState<TeamSizeOption['id']>('small');
  const [includeWebsiteCost, setIncludeWebsiteCost] = useState(true);

  const competitorName = allowCompetitorSwitch ? activeCompetitor : initialCompetitorName;
  const team = TEAM_SIZES.find((t) => t.id === selectedTeam) ?? TEAM_SIZES[1];

  const lowerName = competitorName.toLowerCase();
  const isHousecall = lowerName.includes('housecall');
  const isServiceTitan = lowerName.includes('servicetitan');
  const isLeadBroker = lowerName.includes('angi') || lowerName.includes('thumbtack') || lowerName.includes('lead');

  let competitorBaseMonthly = 169;
  let tierLabel = 'Connect';

  if (isServiceTitan) {
    if (team.users === 1) competitorBaseMonthly = 398;
    else if (team.users <= 3) competitorBaseMonthly = 796;
    else if (team.users <= 7) competitorBaseMonthly = 1490;
    else competitorBaseMonthly = 2985;
    tierLabel = 'Enterprise Tech License';
  } else if (isHousecall) {
    if (team.users === 1) {
      competitorBaseMonthly = 65;
      tierLabel = 'Basic (1 user)';
    } else if (team.users <= 5) {
      competitorBaseMonthly = 169;
      tierLabel = 'Essentials (1-5 users)';
    } else if (team.users <= 8) {
      competitorBaseMonthly = 299;
      tierLabel = 'Max Plan';
    } else {
      competitorBaseMonthly = 299 + (team.users - 8) * 35;
      tierLabel = 'Max + Extra Seats';
    }
  } else if (isLeadBroker) {
    if (team.users === 1) competitorBaseMonthly = 450;
    else if (team.users <= 3) competitorBaseMonthly = 950;
    else if (team.users <= 7) competitorBaseMonthly = 1800;
    else competitorBaseMonthly = 3500;
    tierLabel = 'Shared Lead Budget';
  } else {
    // Jobber
    if (team.users === 1) {
      competitorBaseMonthly = 49;
      tierLabel = 'Core (1 user)';
    } else if (team.users <= 5) {
      competitorBaseMonthly = 169;
      tierLabel = 'Connect';
    } else {
      competitorBaseMonthly = 349;
      tierLabel = 'Grow';
    }
  }

  const websiteHostingMonthly = includeWebsiteCost ? (isHousecall ? 49 : 35) : 0;
  const competitorTotalMonthly = competitorBaseMonthly + websiteHostingMonthly;
  const competitorAnnualTotal = competitorTotalMonthly * 12;

  const lgqFlexAnnual = 0;
  const annualSavingsOnFlex = competitorAnnualTotal - lgqFlexAnnual;

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
            {isLeadBroker
              ? `${competitorName} charges you expensive per-lead fees and auto-bills your card. Calculate how much you save by owning your direct website leads.`
              : isServiceTitan
              ? `ServiceTitan charges steep per-tech licensing and thousands in setup fees. See your savings with Let’s Get Quoted.`
              : `${competitorName} bills your credit card fixed monthly subscriptions and doesn't include a website. See your exact annual savings with Let's Get Quoted.`}
          </p>
        </div>

        <div className={styles.calculatorCard}>
          {allowCompetitorSwitch && (
            <div style={{ padding: '18px 28px', borderBottom: '1px solid rgba(174, 199, 211, 0.15)', background: 'rgba(6, 18, 27, 0.85)' }}>
              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#50e3bd', marginBottom: '10px' }}>
                Compare Against Your Current Platform:
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }} role="tablist" aria-label="Select competitor to compare">
                {COMPETITOR_OPTIONS.map((opt) => {
                  const isActive = opt === activeCompetitor;
                  return (
                    <button
                      key={opt}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setActiveCompetitor(opt)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '999px',
                        fontSize: '13px',
                        fontWeight: 750,
                        cursor: 'pointer',
                        border: isActive ? '1px solid #50e3bd' : '1px solid rgba(174, 199, 211, 0.2)',
                        background: isActive ? '#50e3bd' : 'rgba(16, 36, 48, 0.7)',
                        color: isActive ? '#06131f' : '#c2d4df',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

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
                  Include separate website hosting fee (Wix/Squarespace/WordPress at ~$35/mo)
                </span>
              </label>
              <p className={styles.toggleHint}>
                {competitorName} does not include a custom trade website. LGQ includes your custom SEO site for free.
              </p>
            </div>
          </div>

          {/* Comparison Output Grid */}
          <div className={styles.resultGrid}>
            {/* Competitor Side */}
            <div className={styles.compColumn}>
              <div className={styles.colHeader}>
                <span className={styles.colBadgeComp}>{competitorName} Total</span>
                <span className={styles.colSub}>
                  {isLeadBroker ? 'Monthly lead spend & fees' : 'Fixed recurring software bill'}
                </span>
              </div>

              <div className={styles.priceDisplay}>
                <div className={styles.monthlyAmount}>
                  <span className={styles.currency}>$</span>
                  <span className={styles.number}>{competitorTotalMonthly}</span>
                  <span className={styles.period}>/ month</span>
                </div>
                <div className={styles.annualAmount}>
                  <strong>${competitorAnnualTotal.toLocaleString()}</strong> billed per year
                </div>
              </div>

              <ul className={styles.breakdownList}>
                <li>
                  <span className={styles.iconRed}>✗</span>
                  <span>
                    {competitorName} ({tierLabel}): <strong>${competitorBaseMonthly}/mo</strong>
                  </span>
                </li>
                <li>
                  <span className={styles.iconRed}>✗</span>
                  <span>
                    {includeWebsiteCost ? (
                      <>Separate Website Hosting: <strong>+${websiteHostingMonthly}/mo</strong></>
                    ) : (
                      <>No Website Included (build on 3rd party)</>
                    )}
                  </span>
                </li>
                <li>
                  <span className={styles.iconRed}>✗</span>
                  <span>
                    {isLeadBroker
                      ? 'Shared leads with 3-6 other competitors'
                      : 'Billed 100% even during slow winter months'}
                  </span>
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
                  Keep your hard-earned profits instead of paying recurring subscription bills.
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
