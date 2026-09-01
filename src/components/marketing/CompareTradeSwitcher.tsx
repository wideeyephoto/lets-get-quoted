'use client';

import { useState } from 'react';
import Link from 'next/link';
import { APP_SIGNUP_URL } from '@/components/marketing/links';
import styles from './compare-trade-switcher.module.css';

type TradeScenario = {
  id: string;
  name: string;
  icon: string;
  headline: string;
  jobberPain: string;
  lgqSolution: string;
  features: readonly string[];
  quoteExample: {
    title: string;
    items: readonly { label: string; cost: string }[];
    total: string;
    deposit: string;
  };
};

const TRADES: readonly TradeScenario[] = [
  {
    id: 'electrical',
    name: 'Electricians',
    icon: '⚡',
    headline: 'AI Project Scoping for Panel Upgrades & EV Chargers',
    jobberPain:
      'Jobber gives you a blank text box. You spend 20 minutes on the phone asking amperage, panel brand, and conduit distance before writing a quote.',
    lgqSolution:
      'LGQ’s website AI asks the exact scoping questions, estimates project cost, and collects a 50% deposit before you step on site.',
    features: [
      'Automatic panel upgrade & EV charger scoping questionnaires',
      'Instant HOT lead dispatch alerts when high-ticket remodels arrive',
      'Route-aware Quick Stops for same-day breaker/outlet diagnostics',
    ],
    quoteExample: {
      title: '200A Service Panel Upgrade & Whole-Home Surge',
      items: [
        { label: 'Square D 200A Main Breaker Panel & Meter Socket', cost: '$1,850.00' },
        { label: 'Utility Coordination & Permitting Inspection', cost: '$450.00' },
        { label: 'Type 2 Whole-Home Surge Protective Device', cost: '$380.00' },
      ],
      total: '$2,680.00',
      deposit: '$1,340.00 (50% via Pay)',
    },
  },
  {
    id: 'plumbing',
    name: 'Plumbers',
    icon: '🔧',
    headline: 'Turn Emergency Leaks into Same-Day Paid Dispatches',
    jobberPain:
      'Homeowners call 5 plumbers when a pipe bursts. Jobber sends you a silent form submission while competitors answer first.',
    lgqSolution:
      'LGQ responds in under 3 seconds with upfront diagnostic pricing, phone verification, and route-aware same-day arrival slots.',
    features: [
      '24/7 AI emergency intake qualifies leak severity and location',
      'Route-aware Quick Stops fill afternoon calendar gaps between jobs',
      'Homeowners approve multi-tier fixture quotes right on their phone',
    ],
    quoteExample: {
      title: 'Tankless Water Heater Installation & Gas Line',
      items: [
        { label: 'Navien 199k BTU Condensing Tankless Unit', cost: '$2,400.00' },
        { label: 'Labor, Direct Venting & Old Tank Haul-Away', cost: '$1,650.00' },
        { label: 'Scale Inhibitor Filter & Gas Valve Upgrade', cost: '$320.00' },
      ],
      total: '$4,370.00',
      deposit: '$1,500.00 (Deposit)',
    },
  },
  {
    id: 'hvac',
    name: 'HVAC',
    icon: '❄️',
    headline: 'Multi-Option Replacement Tiers & Recurring Tune-Up Plans',
    jobberPain:
      'Jobber locks Good/Better/Best quoting and automated service agreements behind expensive $169–$349/mo tiers.',
    lgqSolution:
      'Send multi-tier SEER2 quotes with itemized financing options and auto-billing maintenance plans included on all plans.',
    features: [
      'Multi-option Good/Better/Best system replacement quotes',
      'Automated recurring spring/fall maintenance agreement billing',
      'Automatic sync to QuickBooks Online for invoices and payments',
    ],
    quoteExample: {
      title: 'Complete 3-Ton Heat Pump System Replacement',
      items: [
        { label: 'Tier 1: 15 SEER2 High-Efficiency Heat Pump & Air Handler', cost: '$7,800.00' },
        { label: 'Tier 2: 18 SEER2 Variable-Speed Inverter System (Recommended)', cost: '$9,950.00' },
        { label: '10-Year Parts & Labor Warranty + Smart Thermostat', cost: 'Included' },
      ],
      total: '$9,950.00',
      deposit: '$2,500.00 (Deposit)',
    },
  },
  {
    id: 'roofing',
    name: 'Roofing & Remodeling',
    icon: '🏠',
    headline: 'Progress Milestones, Photo Feeds & Lien Waivers',
    jobberPain:
      'Jobber requires a separate website to showcase project portfolios and lacks built-in lien waiver and milestone billing workflows.',
    lgqSolution:
      'Your included marketing website showcases before/after project photos, collects e-signatures, and bills progress milestones seamlessly.',
    features: [
      'Included portfolio website with before-and-after photo galleries',
      'Progress milestone invoicing (Deposit, Tear-off, Final Inspection)',
      'Automated Google review requests upon final project completion',
    ],
    quoteExample: {
      title: 'Architectural Shingle Roof Replacement (28 Sq)',
      items: [
        { label: 'Milestone 1: Deposit (Materials & Permitting)', cost: '$4,200.00' },
        { label: 'Milestone 2: Tear-Off & Underlayment Inspection', cost: '$4,200.00' },
        { label: 'Milestone 3: Final Ridge Caps & Cleanup Inspection', cost: '$4,200.00' },
      ],
      total: '$12,600.00',
      deposit: '$4,200.00 (Milestone 1)',
    },
  },
  {
    id: 'landscaping',
    name: 'Landscaping & Tree',
    icon: '🌿',
    headline: 'Zero Software Bills in Winter + Recurring Cards on File',
    jobberPain:
      'During slow winter months when grass isn’t growing, Jobber still charges you $149–$349/month.',
    lgqSolution:
      'LGQ’s $0/mo Flex plan protects your cash flow during the winter. In spring, run recurring maintenance with stored cards on file.',
    features: [
      '$0/mo base overhead during off-season winter months',
      'Automated weekly/bi-weekly recurring mowing contracts',
      'Stored cards on file with Stripe for 1-click seasonal cleanups',
    ],
    quoteExample: {
      title: 'Full Season Lawn Care & Aeration Agreement',
      items: [
        { label: '28-Week Mowing, Edging & Debris Blow', cost: '$1,540.00' },
        { label: 'Spring & Fall Core Aeration + Overseeding', cost: '$580.00' },
        { label: 'Automated Monthly Recurring Auto-Billing', cost: '$353.33 / mo' },
      ],
      total: '$2,120.00',
      deposit: '$353.33 (Month 1)',
    },
  },
];

export type CompareTradeSwitcherProps = {
  competitorName?: string;
  className?: string;
};

export default function CompareTradeSwitcher({
  competitorName = 'Jobber',
  className,
}: CompareTradeSwitcherProps) {
  const [activeTradeId, setActiveTradeId] = useState(TRADES[0].id);

  const activeTrade = TRADES.find((t) => t.id === activeTradeId) ?? TRADES[0];

  return (
    <section className={[styles.section, className].filter(Boolean).join(' ')} aria-label="Trade comparison showcase">
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.kicker}>Tailored for Your Trade</span>
          <h2 className={styles.title}>
            See How Let’s Get Quoted Replaces {competitorName} for <em>Your Trade</em>
          </h2>
          <p className={styles.subtitle}>
            Every trade has unique scoping, emergency dispatch, and quote structures. Explore how LGQ outperforms {competitorName} in your sector:
          </p>
        </div>

        {/* Trade Tab Buttons */}
        <div className={styles.tabsRow} role="tablist" aria-label="Select contractor trade">
          {TRADES.map((trade) => {
            const isActive = trade.id === activeTradeId;
            return (
              <button
                key={trade.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTradeId(trade.id)}
                className={`${styles.tabBtn} ${isActive ? styles.tabBtnActive : ''}`}
              >
                <span className={styles.tabIcon}>{trade.icon}</span>
                <span className={styles.tabName}>{trade.name}</span>
              </button>
            );
          })}
        </div>

        {/* Active Trade Content Panel */}
        <div className={styles.tradeCard}>
          <div className={styles.tradeCopyCol}>
            <div className={styles.tradeHeader}>
              <span className={styles.tradeBadge}>{activeTrade.name} Edition</span>
              <h3 className={styles.tradeHeadline}>{activeTrade.headline}</h3>
            </div>

            {/* Pain vs Solution */}
            <div className={styles.comparisonBoxes}>
              <div className={styles.painBox}>
                <div className={styles.boxTitleComp}>The {competitorName} Bottleneck</div>
                <p className={styles.boxText}>{activeTrade.jobberPain}</p>
              </div>

              <div className={styles.solutionBox}>
                <div className={styles.boxTitleLgq}>The Let’s Get Quoted Advantage</div>
                <p className={styles.boxText}>{activeTrade.lgqSolution}</p>
              </div>
            </div>

            {/* Feature Bullets */}
            <ul className={styles.featuresList}>
              {activeTrade.features.map((feat) => (
                <li key={feat}>
                  <span className={styles.featCheck}>✓</span>
                  <span>{feat}</span>
                </li>
              ))}
            </ul>

            <div>
              <Link href={APP_SIGNUP_URL} className={styles.tradeCta}>
                Launch Your {activeTrade.name} Platform on Flex ($0/mo) &rarr;
              </Link>
            </div>
          </div>

          {/* Interactive Quote Sample Card */}
          <div className={styles.quoteSampleCol}>
            <div className={styles.quoteCardFrame}>
              <div className={styles.quoteTopBar}>
                <span className={styles.quoteStatusBadge}>● Live Quote Draft</span>
                <span className={styles.quoteSentTime}>Ready in 60s</span>
              </div>

              <h4 className={styles.quoteSampleTitle}>{activeTrade.quoteExample.title}</h4>

              <div className={styles.quoteItemsList}>
                {activeTrade.quoteExample.items.map((item) => (
                  <div key={item.label} className={styles.quoteItemRow}>
                    <span>{item.label}</span>
                    <strong>{item.cost}</strong>
                  </div>
                ))}
              </div>

              <div className={styles.quoteSummaryRow}>
                <div>
                  <span className={styles.totalLabel}>Project Total</span>
                  <div className={styles.totalVal}>{activeTrade.quoteExample.total}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className={styles.depositLabel}>Required Deposit</span>
                  <div className={styles.depositVal}>{activeTrade.quoteExample.deposit}</div>
                </div>
              </div>

              <div className={styles.quoteActionSample}>
                <div className={styles.fakeApplePayBtn}>
                  <span>Pay</span> 1-Tap Mobile E-Signature &amp; Deposit
                </div>
                <p className={styles.quoteFootnote}>
                  Direct Stripe Connect bank payout · Instant homeowner e-signature recorded
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
