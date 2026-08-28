import Link from 'next/link';
import { type Trade } from '@/lib/trades';
import { getTradeTopicCluster, type TopicClusterLink } from '@/lib/trade-clusters';
import styles from './trade-cluster.module.css';

function getBadgeClass(category: TopicClusterLink['category']): string {
  switch (category) {
    case 'guide':
      return styles.badgeGuide;
    case 'tool':
      return styles.badgeTool;
    case 'feature':
      return styles.badgeFeature;
    case 'comparison':
      return styles.badgeComparison;
    default:
      return styles.badgeGuide;
  }
}

export default function TradeTopicCluster({ trade }: { trade: Trade }) {
  const cluster = getTradeTopicCluster(trade);
  const items = [cluster.bestGuide, cluster.bestTool, cluster.bestFeature, cluster.bestComparison];

  return (
    <section className={styles.section} id="trade-resources" aria-labelledby="trade-resources-heading">
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.kicker}>Topic Cluster &amp; Toolkit</span>
          <h2 id="trade-resources-heading" className={styles.title}>
            Guides, Tools &amp; Comparisons for <em>{trade.name}</em>
          </h2>
          <p className={styles.subtitle}>
            Explore connected playbooks, pricing calculators, platform features, and software comparisons tailored to {trade.work} businesses.
          </p>
        </div>

        <div className={styles.grid}>
          {items.map((item) => (
            <article key={item.href} className={styles.card}>
              <div>
                <span className={`${styles.cardBadge} ${getBadgeClass(item.category)}`}>
                  {item.badge}
                </span>
                <h3 className={styles.cardHeading}>
                  <Link href={item.href}>{item.title}</Link>
                </h3>
                <p className={styles.cardBlurb}>{item.blurb}</p>
              </div>

              <div>
                <Link href={item.href} className={styles.actionLink}>
                  <span>{item.anchorText}</span>
                  <span aria-hidden="true">&rarr;</span>
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
