import type { Site } from '@/lib/sites';
import { getHeaderStyle, getSiteContent, getPublishedSocials } from '@/lib/site-content';
import SocialLinks from './SocialLinks';
import styles from './themes.module.css';

// The slim accent strip above the header for the 'utility' header style — the
// classic contractor top bar carrying phone, hours, and a licensed badge. Only
// renders for that style and only when there's something to show; on public
// routes `site.phone` is already null when the owner hid it (withPublicContact).
//
// Social icons are opt-in here (Setup → Socials) and always shown in the footer.
// The default is footer-only on purpose: this bar is the narrowest strip on the
// page and the first thing to wrap on a phone, and the icons would push the
// phone number — the one thing a visitor with a burst pipe is looking for — onto
// a second line.
export default function SiteHeaderUtilityBar({ site }: { site: Site }) {
  if (getHeaderStyle(site.template, site.content) !== 'utility') return null;

  const phone = site.phone?.trim();
  const hours = site.hours?.trim();
  const licensed = Boolean(site.license?.trim());
  const showSocials =
    getSiteContent(site.content).socialsInHeader && getPublishedSocials(site.content).length > 0;
  if (!phone && !hours && !licensed && !showSocials) return null;

  return (
    <div className={styles.headerUtilityBar}>
      {phone && <a href={`tel:${phone}`} data-edit="bizPhone"><span aria-hidden="true">📞</span> {phone}</a>}
      {hours && <span data-edit="bizHours">{hours}</span>}
      {licensed && <span data-edit="bizLicense"><span aria-hidden="true">✓</span> Licensed &amp; insured</span>}
      {showSocials && <SocialLinks site={site} variant="header" />}
    </div>
  );
}
