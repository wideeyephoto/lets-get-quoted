import type { Site } from '@/lib/sites';
import { getPublishedRatingBadge, getPublishedTrustBadges } from '@/lib/site-content';
import styles from './themes.module.css';

// Compact proof cluster — star rating + review count and the Licensed/Insured/
// Bonded chips — rendered directly beside a lead form (hero and contact) so the
// proof sits next to the ask. This is where trust actually converts; the mid-
// page placement in SiteContentSections did not.
export default function SiteProofStrip({ site }: { site: Site }) {
  const ratingBadge = getPublishedRatingBadge(site.content);
  const trustBadges = getPublishedTrustBadges(site.content);
  if (!ratingBadge && !trustBadges) return null;

  const rounded = ratingBadge ? Math.round(ratingBadge.rating) : 0;

  return (
    <div className={styles.proofStrip}>
      {ratingBadge && (
        <span className={styles.proofRating}>
          <span className={styles.proofStars} aria-hidden="true">{'★'.repeat(rounded)}{'☆'.repeat(5 - rounded)}</span>
          <strong>{ratingBadge.rating.toFixed(1)}</strong>
          <span className={styles.proofRatingMeta}>{ratingBadge.reviewCount} {ratingBadge.sourceLabel}</span>
        </span>
      )}
      {trustBadges && trustBadges.badges.map((badge) => (
        <span key={badge.id} className={styles.proofChip}><span aria-hidden="true">✓</span> {badge.label}</span>
      ))}
    </div>
  );
}
