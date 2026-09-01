'use client';

import { useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import styles from './features-theme.module.css';

type ToolItem = {
  id: string;
  name: string;
  category: string;
  monthlyCost: number;
  icon: string;
  painPoint: string;
  lgqEquivalent: string;
};

const DEFAULT_TOOLS: ToolItem[] = [
  {
    id: 'website',
    name: 'Website & Hosting (Wix / Squarespace)',
    category: 'Website',
    monthlyCost: 29,
    icon: '🌐',
    painPoint: 'Static forms, disconnected from quoting, no contractor estimate calculator.',
    lgqEquivalent: 'Included: AI trade website with instant customer estimate calculator.',
  },
  {
    id: 'crm',
    name: 'Contractor CRM (Jobber / Housecall Pro)',
    category: 'Job Management',
    monthlyCost: 169,
    icon: '📋',
    painPoint: 'Steep monthly seat fees ($169–$249/mo) before you book your first job.',
    lgqEquivalent: 'Included: Complete job record, dispatch, and mobile crew app from $0/mo.',
  },
  {
    id: 'esign',
    name: 'E-Signatures (DocuSign / SignNow)',
    category: 'Contracts',
    monthlyCost: 20,
    icon: '✍️',
    painPoint: 'Separate PDF sending, awkward phone signing, manual deposit follow-up.',
    lgqEquivalent: 'Included: 1-click mobile e-signatures tied directly to Stripe deposit checkout.',
  },
  {
    id: 'reviews',
    name: 'Reviews & SMS (Podium / Birdeye)',
    category: 'Reputation',
    monthlyCost: 289,
    icon: '⭐',
    painPoint: 'Expensive contracts ($289+/mo), separate contact list that goes stale.',
    lgqEquivalent: 'Included: Two-way SMS inbox, automated arrival alerts, and Google review booster.',
  },
  {
    id: 'scheduling',
    name: 'Online Scheduling (Calendly / Acuity)',
    category: 'Calendar',
    monthlyCost: 15,
    icon: '📅',
    painPoint: 'Double-booking risk, does not collect deposits or check travel radius.',
    lgqEquivalent: 'Included: Deposit-gated self-scheduling & route-optimized arrival windows.',
  },
];

type PresetProfile = {
  label: string;
  trucks: string;
  selectedIds: string[];
  hoursWastedPerWeek: number;
};

const PROFILES: PresetProfile[] = [
  {
    label: 'Solo Operator (1 Truck)',
    trucks: '1 Truck · Owner in the field',
    selectedIds: ['website', 'crm', 'esign', 'scheduling'],
    hoursWastedPerWeek: 5.5,
  },
  {
    label: 'Standard Crew (2–4 Trucks)',
    trucks: '2–4 Trucks · Growing crew & office',
    selectedIds: ['website', 'crm', 'esign', 'reviews', 'scheduling'],
    hoursWastedPerWeek: 8.5,
  },
  {
    label: 'High-Volume (5+ Trucks)',
    trucks: '5+ Trucks · Full field operations',
    selectedIds: ['website', 'crm', 'esign', 'reviews', 'scheduling'],
    hoursWastedPerWeek: 14.0,
  },
];

export default function FeaturesToolSprawlCalculator() {
  const [selectedProfileIndex, setSelectedProfileIndex] = useState(1);
  const [selectedTools, setSelectedTools] = useState<Record<string, boolean>>({
    website: true,
    crm: true,
    esign: true,
    reviews: true,
    scheduling: true,
  });

  const headingId = useId();
  const profileTabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleProfileSelect = (index: number) => {
    setSelectedProfileIndex(index);
    const profile = PROFILES[index];
    const newSelected: Record<string, boolean> = {};
    DEFAULT_TOOLS.forEach((t) => {
      newSelected[t.id] = profile.selectedIds.includes(t.id);
    });
    setSelectedTools(newSelected);
  };

  const handleProfileKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex = index;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = (index + 1) % PROFILES.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = (index - 1 + PROFILES.length) % PROFILES.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = PROFILES.length - 1;
    }
    if (nextIndex !== index) {
      handleProfileSelect(nextIndex);
      profileTabRefs.current[nextIndex]?.focus();
    }
  };

  const toggleTool = (id: string) => {
    setSelectedTools((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const { totalMonthlySprawl, totalAnnualSprawl, activeToolsCount, hoursSavedWeekly } = useMemo(() => {
    let monthly = 0;
    let count = 0;
    DEFAULT_TOOLS.forEach((tool) => {
      if (selectedTools[tool.id]) {
        monthly += tool.monthlyCost;
        count += 1;
      }
    });
    const profile = PROFILES[selectedProfileIndex];
    // Scale hours saved by proportion of tools active
    const ratio = DEFAULT_TOOLS.length > 0 ? count / DEFAULT_TOOLS.length : 1;
    const hours = Math.round(profile.hoursWastedPerWeek * ratio * 10) / 10;

    return {
      totalMonthlySprawl: monthly,
      totalAnnualSprawl: monthly * 12,
      activeToolsCount: count,
      hoursSavedWeekly: hours,
    };
  }, [selectedTools, selectedProfileIndex]);

  return (
    <section
      className={styles.sprawlSection}
      id="software-sprawl-calculator"
      aria-labelledby={headingId}
    >
      <div className={styles.sprawlHeader}>
        <p className="eyebrow">
          <span aria-hidden="true">✦</span> THE 5-APP SOFTWARE TRAP
        </p>
        <h2 id={headingId}>
          Stop paying <em>five subscriptions</em> to run one job.
        </h2>
        <p className={styles.sprawlSubhead}>
          Most contractors spend over <strong>$500/month</strong> across disconnected apps—and waste hours
          re-typing customer addresses, quotes, and calendar appointments between tabs.
        </p>
      </div>

      {/* Preset Profile Tabs with Accessible Keyboard Navigation */}
      <div className={styles.profileTabs} role="tablist" aria-label="Contractor business size">
        {PROFILES.map((profile, idx) => {
          const isSelected = selectedProfileIndex === idx;
          return (
            <button
              key={profile.label}
              ref={(el) => { profileTabRefs.current[idx] = el; }}
              id={`sprawl-tab-${idx}`}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls="sprawl-profile-panel"
              tabIndex={isSelected ? 0 : -1}
              className={`${styles.profileTab} ${isSelected ? styles.profileTabActive : ''}`}
              onClick={() => handleProfileSelect(idx)}
              onKeyDown={(e) => handleProfileKeyDown(e, idx)}
            >
              <strong>{profile.label}</strong>
              <small>{profile.trucks}</small>
            </button>
          );
        })}
      </div>

      <div
        className={styles.sprawlGrid}
        id="sprawl-profile-panel"
        role="tabpanel"
        aria-labelledby={`sprawl-tab-${selectedProfileIndex}`}
      >
        {/* Left Column: Interactive App Checklist */}
        <div className={styles.sprawlListCard}>
          <div className={styles.sprawlListHeader}>
            <h3>Your current software stack</h3>
            <span className={styles.sprawlBadgeCount}>
              {activeToolsCount} of {DEFAULT_TOOLS.length} active
            </span>
          </div>

          <div className={styles.toolCheckboxList}>
            {DEFAULT_TOOLS.map((tool) => {
              const isChecked = !!selectedTools[tool.id];
              return (
                <div
                  key={tool.id}
                  className={`${styles.toolItem} ${isChecked ? styles.toolItemChecked : ''}`}
                  onClick={() => toggleTool(tool.id)}
                  role="checkbox"
                  aria-checked={isChecked}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      toggleTool(tool.id);
                    }
                  }}
                >
                  <div className={styles.toolCheckboxIndicator}>
                    {isChecked ? '✓' : ''}
                  </div>
                  <div className={styles.toolMeta}>
                    <div className={styles.toolTitleRow}>
                      <span className={styles.toolIcon} aria-hidden="true">{tool.icon}</span>
                      <strong className={styles.toolName}>{tool.name}</strong>
                      <span className={styles.toolPrice}>${tool.monthlyCost}/mo</span>
                    </div>
                    <p className={styles.toolPain}>{tool.painPoint}</p>
                    <p className={styles.toolLgq}>{tool.lgqEquivalent}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Comparative Savings & Unified Advantage */}
        <div className={styles.savingsCard}>
          <div className={styles.savingsCardInner}>
            <div className={styles.savingsKicker}>
              <span>CONTRACTOR ROI ANALYSIS</span>
              <span className={styles.livePulse} aria-hidden="true" />
            </div>

            <div className={styles.totalStackRow}>
              <div className={styles.sprawlTotalBox}>
                <small>Current Stack Cost</small>
                <div className={styles.sprawlTotalVal}>${totalMonthlySprawl}<span>/mo</span></div>
                <span className={styles.sprawlAnnual}>${totalAnnualSprawl.toLocaleString()} / year</span>
              </div>

              <div className={styles.sprawlVsDivider}>VS</div>

              <div className={styles.lgqTotalBox}>
                <small>Let’s Get Quoted</small>
                <div className={styles.lgqTotalVal}>$0<span>/mo</span></div>
                <span className={styles.lgqFlexNote}>Flex plan · 1.25% fee only on paid jobs</span>
              </div>
            </div>

            <div className={styles.savingsHighlight}>
              <div className={styles.savingsMetric}>
                <small>Gross Fixed SaaS Savings</small>
                <strong>${totalAnnualSprawl.toLocaleString()} / yr</strong>
              </div>
              <div className={styles.savingsMetric}>
                <small>Weekly Admin Hours Reclaimed</small>
                <strong>~{hoursSavedWeekly} hrs / wk</strong>
              </div>
            </div>

            <div className={styles.unifiedBenefits}>
              <h4>The Unified Job Record Advantage</h4>
              <ul>
                <li>
                  <span className={styles.checkIcon}>✓</span>
                  <span><strong>Zero double data entry:</strong> Website lead auto-populates the quote, schedule, and invoice.</span>
                </li>
                <li>
                  <span className={styles.checkIcon}>✓</span>
                  <span><strong>One client conversation:</strong> Texts, quote links, arrival alerts, and reviews in one SMS thread.</span>
                </li>
                <li>
                  <span className={styles.checkIcon}>✓</span>
                  <span><strong>Stripe direct payouts:</strong> Deposit clears before truck rolls, funds land in your bank.</span>
                </li>
              </ul>
            </div>

            <div className={styles.savingsActions}>
              <Link href="/pricing" className={styles.calcPrimaryBtn}>
                See All Plan Options <span aria-hidden="true">→</span>
              </Link>
              <Link href="/demo/sites" className={styles.calcSecondaryBtn}>
                Test Live Demo
              </Link>
            </div>

            <div className={styles.assumptionsDisclaimer}>
              <small>
                <strong>Assumptions &amp; Pricing Sources:</strong> Comparison reflects published standard monthly SaaS subscriptions as of Q1 2026: Jobber Grow ($169/mo), Podium Core ($289/mo), Wix Business ($29/mo), DocuSign Standard ($20/mo), Calendly Standard ($15/mo).
                Let&apos;s Get Quoted Flex plan has $0 monthly base subscription; standard Stripe card processing (2.9% + 30¢) and LGQ platform fee (1.25% on Flex, or as low as 0.10% on Enterprise plans) apply only when customer payments are collected. Example: On $15,000/mo payment volume, a 1.25% platform fee equals $187.50, delivering an estimated net savings of ~$334/mo versus $522/mo in fixed SaaS overhead—with zero subscription fees during slow winter months.
              </small>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
