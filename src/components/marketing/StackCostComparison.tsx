import styles from './stack-cost-comparison.module.css';

type StackItem = {
  label: string;
  cost: string;
  note: string;
};

const LEGACY_STACK: readonly StackItem[] = [
  { label: 'Jobber Connect Plan (Up to 5 Users)', cost: '$169 / mo', note: 'Scheduling & basic quoting' },
  { label: 'Custom Website (Wix / Squarespace / WP)', cost: '$35 / mo', note: 'Hosting, domain & templates' },
  { label: 'Review Collection Tool (NiceJob / Podium)', cost: '$99 / mo', note: 'Google review routing' },
  { label: 'Dedicated 2-Way Texting Service', cost: '$30 / mo', note: 'Customer SMS communication' },
  { label: 'Lead Intake & Form Builder (Typeform)', cost: '$25 / mo', note: 'Basic online booking form' },
];

const LGQ_STACK: readonly StackItem[] = [
  { label: 'Full Back Office CRM & Scheduling', cost: 'INCLUDED', note: 'Jobs, crew dispatch, calendar & map' },
  { label: 'Custom SEO Contractor Website', cost: 'INCLUDED', note: '20+ trade themes + custom domain' },
  { label: 'Google Reviews & Reputation Hub', cost: 'INCLUDED', note: 'Automated post-job review routing' },
  { label: '2-Way SMS & Dedicated Business Line', cost: 'INCLUDED', note: 'Integrated customer chat feeds' },
  { label: '24/7 AI Smart Intake & Scorer', cost: 'INCLUDED', note: 'Instant scoping & hot lead triage' },
];

export type StackCostComparisonProps = {
  competitorName?: string;
  className?: string;
};

export default function StackCostComparison({
  competitorName = 'Jobber',
  className,
}: StackCostComparisonProps) {
  return (
    <section className={[styles.section, className].filter(Boolean).join(' ')} aria-label="Tool stack comparison">
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.kicker}>Software Consolidation</span>
          <h2 className={styles.title}>
            The Fragmented {competitorName} Stack vs. <em>The Unified Platform</em>
          </h2>
          <p className={styles.subtitle}>
            Most contractors using {competitorName} pay for 4 to 5 separate tools because {competitorName} doesn&apos;t include a
            website, AI intake, or review routing. Here is what you actually pay:
          </p>
        </div>

        <div className={styles.grid}>
          {/* Legacy Fragmented Stack */}
          <div className={styles.stackCardComp}>
            <div className={styles.cardHeader}>
              <div className={styles.badgeComp}>Fragmented 5-App Stack</div>
              <h3 className={styles.cardTitle}>{competitorName} + Add-on Subscriptions</h3>
              <p className={styles.cardSub}>5 logins, duplicate data entry, and broken sync</p>
            </div>

            <ul className={styles.stackList}>
              {LEGACY_STACK.map((item) => (
                <li key={item.label} className={styles.stackItemComp}>
                  <div className={styles.itemMain}>
                    <span className={styles.itemIconComp}>✗</span>
                    <div>
                      <strong className={styles.itemLabel}>{item.label}</strong>
                      <div className={styles.itemNote}>{item.note}</div>
                    </div>
                  </div>
                  <span className={styles.itemCostComp}>{item.cost}</span>
                </li>
              ))}
            </ul>

            <div className={styles.totalBoxComp}>
              <div className={styles.totalLabel}>Total Software Overhead</div>
              <div className={styles.totalAmountComp}>$358 / month</div>
              <div className={styles.totalAnnualComp}>$4,296.00 billed every single year</div>
            </div>
          </div>

          {/* Unified LGQ Platform */}
          <div className={styles.stackCardLgq}>
            <div className={styles.badgeLgqPopular}>All-in-One Replacement</div>
            <div className={styles.cardHeader}>
              <div className={styles.badgeLgq}>Let’s Get Quoted Platform</div>
              <h3 className={styles.cardTitleLgq}>Everything Included in One Login</h3>
              <p className={styles.cardSubLgq}>Seamless workflows from website visit to Stripe bank payout</p>
            </div>

            <ul className={styles.stackList}>
              {LGQ_STACK.map((item) => (
                <li key={item.label} className={styles.stackItemLgq}>
                  <div className={styles.itemMain}>
                    <span className={styles.itemIconLgq}>✓</span>
                    <div>
                      <strong className={styles.itemLabelLgq}>{item.label}</strong>
                      <div className={styles.itemNoteLgq}>{item.note}</div>
                    </div>
                  </div>
                  <span className={styles.itemCostLgq}>{item.cost}</span>
                </li>
              ))}
            </ul>

            <div className={styles.totalBoxLgq}>
              <div className={styles.totalLabelLgq}>Total Base Software Overhead</div>
              <div className={styles.totalAmountLgq}>$0 / month (Flex)</div>
              <div className={styles.totalAnnualLgq}>
                Pay only 1.25% platform fee <em>when you get paid</em>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
