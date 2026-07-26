import type { Site } from '@/lib/sites';
import { getHeaderStyle } from '@/lib/site-content';
import styles from './themes.module.css';

// The slim accent strip above the header for the 'utility' header style — the
// classic contractor top bar carrying phone, hours, and a licensed badge. Only
// renders for that style and only when there's something to show; on public
// routes `site.phone` is already null when the owner hid it (withPublicContact).
export default function SiteHeaderUtilityBar({ site }: { site: Site }) {
  if (getHeaderStyle(site.template, site.content) !== 'utility') return null;

  const phone = site.phone?.trim();
  const hours = site.hours?.trim();
  const licensed = Boolean(site.license?.trim());
  if (!phone && !hours && !licensed) return null;

  return (
    <div className={styles.headerUtilityBar}>
      {phone && <a href={`tel:${phone}`} data-edit="bizPhone"><span aria-hidden="true">📞</span> {phone}</a>}
      {hours && <span data-edit="bizHours">{hours}</span>}
      {licensed && <span data-edit="bizLicense"><span aria-hidden="true">✓</span> Licensed &amp; insured</span>}
    </div>
  );
}
