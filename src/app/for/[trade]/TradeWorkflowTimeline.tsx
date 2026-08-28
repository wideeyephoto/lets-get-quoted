import { type WorkflowStep } from '@/lib/trade-deep-data';
import styles from './trade-definitive.module.css';

export default function TradeWorkflowTimeline({
  workflow,
  tradeName,
  benchmark,
}: {
  workflow: [WorkflowStep, WorkflowStep, WorkflowStep, WorkflowStep];
  tradeName: string;
  benchmark: { avgTicket: string; closeRateLift: string; hoursSavedWeekly: string };
}) {
  return (
    <section className={styles.section} aria-labelledby="workflow-timeline-heading">
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.kicker}>Field Operating System</span>
          <h2 id="workflow-timeline-heading" className={styles.title}>
            The 4-Step Field Workflow for <em>{tradeName}</em>
          </h2>
          <p className={styles.subtitle}>
            From the first 24/7 inquiry to tiered mobile proposals, staged milestone deposits, and route-aware job completion.
          </p>
        </div>

        <div className={styles.workflowGrid}>
          {workflow.map((step) => (
            <div key={step.step} className={styles.workflowCard}>
              <div className={styles.stepNumber}>{step.step}</div>
              <span className={styles.workflowBadge}>{step.badge}</span>
              <h3 className={styles.workflowTitle}>{step.title}</h3>
              <p className={styles.workflowDesc}>{step.description}</p>
            </div>
          ))}
        </div>

        {/* Trade Operating Benchmarks */}
        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{benchmark.avgTicket}</span>
            <span className={styles.statLabel}>Average Ticket Benchmark</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{benchmark.closeRateLift}</span>
            <span className={styles.statLabel}>Quote Close Rate Lift</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{benchmark.hoursSavedWeekly}</span>
            <span className={styles.statLabel}>Weekly Estimating Time Saved</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>$0 / mo</span>
            <span className={styles.statLabel}>Flex Entry (No Monthly Bills)</span>
          </div>
        </div>
      </div>
    </section>
  );
}
