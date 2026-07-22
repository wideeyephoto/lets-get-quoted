import { getPublishedAnnouncement } from '@/lib/site-content';
import type { Site } from '@/lib/sites';
import styles from './themes.module.css';

// A thin availability/urgency band that mounts ABOVE the site header (rendered
// as the first child of each template's <main>), not in the mid-page content
// stack. Static server component — the only motion is a CSS dot pulse. The bar
// uses a dark neutral ground with the accent as the dot, so it stays legible
// regardless of the template's accent (Guild's terracotta is dark) or a
// contractor's custom accent override.
export default function SiteAnnouncementBar({ site }: { site: Pick<Site, 'content'> }) {
  const announcement = getPublishedAnnouncement(site.content);
  if (!announcement) return null;

  return (
    <div className={styles.announceBar} role="region" aria-label="Availability">
      <span className={styles.announceDot} aria-hidden="true" />
      <span className={styles.announceMsg}>{announcement.message}</span>
      {announcement.subtext && <span className={styles.announceSub}>{announcement.subtext}</span>}
    </div>
  );
}
