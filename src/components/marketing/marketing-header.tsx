import Link from 'next/link';
import BrandLogo from '@/components/brand-logo';
import { APP_SIGNUP_URL } from './links';
import { MARKETING_MAIN_ID } from './marketing-page';
import styles from './marketing-header.module.css';

/* The nav, in one place. Every marketing page in the cluster shows the same
   five destinations in the same order — the brief asks for consistent
   navigation, and the only way that survives the next page being added is for
   there to be one list. */
const NAV = [
  { href: '/features', label: 'Features' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/faq', label: 'FAQ' },
  { href: '/contact', label: 'Contact' },
] as const;

export type MarketingHeaderProps = {
  /**
   * The nav entry to mark as the current page. Matches on `href`, so
   * `/features/ai-intake` should pass `/features` — the sub-pages live under
   * the Features destination and should light it up.
   */
  current?: string;
  /** Target of the skip link. The page's `<main>` must carry this id. */
  skipTo?: string;
};

/**
 * The header for the marketing routes AppShell renders no chrome for.
 *
 * AppShell early-returns for `/features` (and its five sub-pages),
 * `/how-it-works` and `/founder` — see OWN_CHROME_MARKETING_ROUTES in
 * src/components/app-shell.tsx — because wrapping an indexed marketing page in
 * the dashboard rail would be wrong for a signed-out prospect. That early
 * return is only correct if each of those pages actually draws a header, so
 * the header lives here and every one of them renders it.
 *
 * A server component on purpose: no state, no toggle, nothing to hydrate.
 */
export default function MarketingHeader({
  current,
  skipTo = MARKETING_MAIN_ID,
}: MarketingHeaderProps) {
  return (
    <>
      <a className={styles.skip} href={`#${skipTo}`}>
        Skip to content
      </a>

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={`brand-mark ${styles.brandLink}`} aria-label="Let’s Get Quoted home">
            <BrandLogo className="brand-logo-img" size={30} />
            <strong className="brand-title">Let’s Get Quoted</strong>
          </Link>
          <nav className={styles.headerNav} aria-label="Marketing">
            {NAV.map((item) => {
              const isCurrent = item.href === current;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`topnav-link${isCurrent ? ' active' : ''}`}
                  aria-current={isCurrent ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <a href={APP_SIGNUP_URL} className={`btn primary ${styles.headerCta}`}>
            Build my free site
          </a>
        </div>
      </header>
    </>
  );
}
