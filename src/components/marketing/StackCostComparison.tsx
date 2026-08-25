import styles from './stack-cost-comparison.module.css';

type StackItem = {
  label: string;
  cost: string;
  note: string;
};

const LGQ_STACK: readonly StackItem[] = [
  { label: 'Full Back Office CRM & Scheduling', cost: 'INCLUDED', note: 'Jobs, crew dispatch, calendar & map' },
  { label: 'Custom SEO Contractor Website', cost: 'INCLUDED', note: '20+ trade themes + custom domain' },
  { label: 'Google Reviews & Reputation Hub', cost: 'INCLUDED', note: 'Automated post-job review routing' },
  { label: '2-Way SMS & Dedicated Business Line', cost: 'INCLUDED', note: 'Integrated customer chat feeds' },
  { label: '24/7 AI Smart Intake & Scorer', cost: 'INCLUDED', note: 'Instant scoping & hot lead triage' },
];

function getCompetitorStack(name: string): { items: readonly StackItem[]; totalMonthly: string; totalAnnual: string } {
  const lower = name.toLowerCase();
  if (lower.includes('housecall')) {
    return {
      items: [
        { label: 'Housecall Pro Essentials Plan', cost: '$169 / mo', note: 'Base CRM & mobile dispatch' },
        { label: 'Website Builder Add-on', cost: '$49 / mo', note: 'Separate recurring website fee' },
        { label: 'Automated Marketing Add-on', cost: '$49 / mo', note: 'Postcard & email follow-ups' },
        { label: '2-Way Text Messaging Line', cost: '$30 / mo', note: 'Customer communication add-on' },
        { label: 'Online Booking Add-on', cost: '$25 / mo', note: 'Website scheduling widget' },
      ],
      totalMonthly: '$322 / month',
      totalAnnual: '$3,864.00 billed every single year',
    };
  }

  if (lower.includes('servicetitan')) {
    return {
      items: [
        { label: 'ServiceTitan Base Technician Licenses', cost: '$450 / mo', note: 'Core enterprise dispatch' },
        { label: 'Enterprise Setup & Onboarding (Amortized)', cost: '$250 / mo', note: 'Mandatory $3,000 setup fee' },
        { label: 'Marketing Pro & Review Module', cost: '$250 / mo', note: 'Email & review automation' },
        { label: 'Custom Marketing Website (Agency)', cost: '$100 / mo', note: 'External hosting & maintenance' },
      ],
      totalMonthly: '$1,050 / month',
      totalAnnual: '$12,600.00 billed every single year',
    };
  }

  if (lower.includes('angi') || lower.includes('thumbtack') || lower.includes('lead')) {
    return {
      items: [
        { label: 'Monthly Shared Lead Retainers', cost: '$650 / mo', note: '8–12 shared directory inquiries' },
        { label: 'Directory Profile & Placement Fees', cost: '$50 / mo', note: 'Monthly profile maintenance' },
        { label: 'Separate Contractor Website (Wix/WP)', cost: '$35 / mo', note: 'Third-party website hosting' },
        { label: 'Separate Invoicing & Quoting Tool', cost: '$49 / mo', note: 'External software to run jobs' },
      ],
      totalMonthly: '$784 / month',
      totalAnnual: '$9,408.00 billed every single year',
    };
  }

  // Default: Jobber
  return {
    items: [
      { label: 'Jobber Connect Plan (Up to 5 Users)', cost: '$169 / mo', note: 'Scheduling & basic quoting' },
      { label: 'Custom Website (Wix / Squarespace / WP)', cost: '$35 / mo', note: 'Hosting, domain & templates' },
      { label: 'Review Collection Tool (NiceJob / Podium)', cost: '$99 / mo', note: 'Google review routing' },
      { label: 'Dedicated 2-Way Texting Service', cost: '$30 / mo', note: 'Customer SMS communication' },
      { label: 'Lead Intake & Form Builder (Typeform)', cost: '$25 / mo', note: 'Basic online booking form' },
    ],
    totalMonthly: '$358 / month',
    totalAnnual: '$4,296.00 billed every single year',
  };
}

export type StackCostComparisonProps = {
  competitorName?: string;
  className?: string;
};

export default function StackCostComparison({
  competitorName = 'Jobber',
  className,
}: StackCostComparisonProps) {
  const competitorStack = getCompetitorStack(competitorName);

  return (
    <section className={[styles.section, className].filter(Boolean).join(' ')} aria-label="Tool stack comparison">
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.kicker}>Software Consolidation</span>
          <h2 className={styles.title}>
            The Fragmented {competitorName} Stack vs. <em>The Unified Platform</em>
          </h2>
          <p className={styles.subtitle}>
            Most contractors using {competitorName} pay for multiple separate tools because {competitorName} doesn&apos;t include a
            website, AI intake, or full review routing. Here is what you actually pay:
          </p>
        </div>

        <div className={styles.grid}>
          {/* Legacy Fragmented Stack */}
          <div className={styles.stackCardComp}>
            <div className={styles.cardHeader}>
              <div className={styles.badgeComp}>Fragmented Multi-App Stack</div>
              <h3 className={styles.cardTitle}>{competitorName} + Add-on Subscriptions</h3>
              <p className={styles.cardSub}>Multiple logins, duplicate data entry, and broken sync</p>
            </div>

            <ul className={styles.stackList}>
              {competitorStack.items.map((item) => (
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
              <div className={styles.totalAmountComp}>{competitorStack.totalMonthly}</div>
              <div className={styles.totalAnnualComp}>{competitorStack.totalAnnual}</div>
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
