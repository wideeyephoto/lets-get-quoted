'use client';

import { useState } from 'react';
import { type TradeQuotingExample, type QuoteTier } from '@/lib/trade-deep-data';
import styles from './trade-definitive.module.css';

export default function TradeQuoteShowcase({
  quoteExample,
  tradeName,
}: {
  quoteExample: TradeQuotingExample;
  tradeName: string;
}) {
  const [selectedTierIndex, setSelectedTierIndex] = useState<number>(1); // Default to 'Better' (Most Popular)
  const activeTier: QuoteTier = quoteExample.tiers[selectedTierIndex];

  return (
    <section className={styles.section} aria-labelledby="quoting-example-heading">
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.kicker}>Interactive Quoting Engine</span>
          <h2 id="quoting-example-heading" className={styles.title}>
            Realistic 3-Tier Proposal Example for <em>{tradeName}</em>
          </h2>
          <p className={styles.subtitle}>
            See how multi-option Good / Better / Best estimates stop price shopping, clarify scope allowances, and collect upfront Stripe deposits.
          </p>
        </div>

        <div className={styles.quoteCard}>
          <div className={styles.quoteHeader}>
            <div>
              <h3 className={styles.projectTitle}>{quoteExample.projectTitle}</h3>
              <p className={styles.scopeSummary}>{quoteExample.scopeSummary}</p>
            </div>
            <div className={styles.timelineBadge}>
              <span aria-hidden="true">⏱</span>
              <span>{quoteExample.timeline}</span>
            </div>
          </div>

          {/* Tier Switcher Tabs */}
          <div className={styles.tierTabs} role="tablist" aria-label="Proposal Tiers">
            {quoteExample.tiers.map((tier, idx) => {
              const isActive = idx === selectedTierIndex;
              return (
                <button
                  key={tier.tierName}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`${styles.tierTab} ${isActive ? styles.tierTabActive : ''}`}
                  onClick={() => setSelectedTierIndex(idx)}
                >
                  {tier.badge && <span className={styles.badgePopular}>{tier.badge}</span>}
                  <span className={styles.tierTabName}>Tier {idx + 1}: {tier.tierName}</span>
                  <span className={styles.tierTabTitle}>{tier.label}</span>
                  <span className={styles.tierTabPrice}>${tier.total.toLocaleString()}</span>
                </button>
              );
            })}
          </div>

          {/* Active Tier Details */}
          <div className={styles.tierContent} role="tabpanel">
            <p className={styles.tierHighlight}>{activeTier.highlight}</p>

            <div className={styles.itemList}>
              {activeTier.items.map((item, itemIdx) => (
                <div key={itemIdx} className={styles.itemRow}>
                  <div className={styles.itemDesc}>
                    <span className={styles.itemCheck} aria-hidden="true">✓</span>
                    <span>{item.description}</span>
                  </div>
                  <span className={styles.itemAmount}>${item.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>

            <div className={styles.tierTotalRow}>
              <div className={styles.totalGroup}>
                <span className={styles.totalLabel}>Total Proposed Investment</span>
                <span className={styles.totalPrice}>${activeTier.total.toLocaleString()}</span>
              </div>

              <div className={styles.depositGroup}>
                <span className={styles.totalLabel}>Required Upfront Commitment</span>
                <span className={styles.depositBadge}>
                  <span aria-hidden="true">🔒</span>
                  <span>${activeTier.deposit.toLocaleString()} ({activeTier.depositLabel})</span>
                </span>
              </div>
            </div>
          </div>

          {/* Pay & Sign Preview Bar */}
          <div className={styles.payMockBar}>
            <div className={styles.payMethods}>
              <span>Accepted 1-Tap Client Sign-Off:</span>
              <span className={styles.payPill}> Pay</span>
              <span className={styles.payPill}>G Pay</span>
              <span className={styles.payPill}>Credit / Debit Card</span>
              <span className={styles.payPill}>Bank ACH</span>
            </div>
            <div className={styles.timelineBadge}>
              <span>Direct Bank Payouts in 24 Hours via Stripe</span>
            </div>
          </div>

          <p className={styles.proTipBar}>
            <strong>Pricing Strategy:</strong> {quoteExample.proTip}
          </p>
        </div>
      </div>
    </section>
  );
}
