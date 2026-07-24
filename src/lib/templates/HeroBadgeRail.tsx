import type { Site } from '@/lib/sites';
import { getHeroExtraBadges } from '@/lib/site-content';
import styles from './themes.module.css';

// The extra hero trust chips (badges 3-5) as a compact wrapped row under the
// hero text. The two primary badges float over the hero photo per template;
// these render inline so a page can advertise more trust signals without
// inventing extra float positions in every layout. Renders nothing until the
// owner adds any, so it's invisible on sites that don't use it.
export default function HeroBadgeRail({ site }: { site: Site }) {
  const badges = getHeroExtraBadges(site.content);
  if (badges.length === 0) return null;
  return (
    <div className={styles.heroBadgeRail} data-edit="heroBadge">
      {badges.map((badge) => (
        <span key={badge.key} className={styles.heroBadgeChip}>
          <span aria-hidden="true">{badge.icon}</span>
          {badge.label}
        </span>
      ))}
    </div>
  );
}
