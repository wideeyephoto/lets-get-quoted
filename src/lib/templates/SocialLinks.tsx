import type { Site } from '@/lib/sites';
import { getPublishedSocials } from '@/lib/site-content';
import { socialPlatform, socialLinkLabel } from '@/lib/socials';
import SocialIcon from './SocialIcon';
import styles from './themes.module.css';

// The icon row of social and review-platform profiles. One component for the
// footer (every layout, every theme) and the header utility bar, so the two can
// never drift apart.
//
// Every link is rel="noopener noreferrer" — noopener because target="_blank"
// otherwise hands the opened tab a window.opener reference back to the
// contractor's site, and noreferrer so the platform isn't told which page the
// visitor came from.
//
// The accessible name is "BrokePipes on Facebook", not "Facebook": a screen
// reader user tabbing a footer hears a list of platform names otherwise, with
// nothing saying whose profiles they are. The <title>-free svg is aria-hidden
// and the name lives on the link.

export default function SocialLinks({
  site,
  className,
  variant = 'footer',
}: {
  site: Site;
  className?: string;
  variant?: 'footer' | 'header';
}) {
  const socials = getPublishedSocials(site.content);
  if (socials.length === 0) return null;

  return (
    <ul
      className={`${styles.socialRow} ${variant === 'header' ? styles.socialRowHeader : ''} ${className ?? ''}`}
      data-edit="socials"
    >
      {socials.map(({ platform, url }) => {
        const meta = socialPlatform(platform);
        if (!meta) return null;
        return (
          <li key={platform}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={socialLinkLabel(platform, site.company_name)}
              title={meta.label}
            >
              <SocialIcon name={meta.icon} className={styles.socialGlyph} />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
