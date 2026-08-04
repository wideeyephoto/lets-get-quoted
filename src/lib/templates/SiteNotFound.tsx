import type { CSSProperties } from 'react';
import type { Site } from '@/lib/sites';
import styles from './themes.module.css';

// The 404 a visitor sees on a CONTRACTOR's host.
//
// Before this, a mistyped or stale URL on their domain rendered Next's stock
// error — unstyled black-on-white "404: This page could not be found.", no way
// back, and a browser tab reading "Let's Get Quoted — Contractor websites that
// get you paid". On the contractor's own domain that is somebody else's brand
// on a page that looks broken.
//
// Borrows the same standalone shell as the legal pages: their accent, their
// name, and — the part that matters — a way back to the site the visitor was
// actually trying to reach, plus their phone number, since somebody who hit a
// dead link on a plumber's website is quite likely trying to call a plumber.
export default function SiteNotFound({ site }: { site: Site }) {
  const themeStyle = { '--theme-accent': site.accent_override || '#2563eb' } as CSSProperties;
  const name = site.company_name || 'this site';
  return (
    <main className={styles.legalShell} style={themeStyle}>
      <div className={styles.legalDoc}>
        <nav className={styles.blogCrumb} aria-label="Breadcrumb">
          <a href="/">{site.company_name || 'Home'}</a>
          <span aria-hidden="true">/</span>
          <span>Page not found</span>
        </nav>
        <article className={styles.legalBody}>
          <h1>We couldn’t find that page</h1>
          <p>
            The link may be out of date, or the address may have a typo in it. Everything else on
            {' '}{name} is still right where it was.
          </p>
        </article>
        <footer className={styles.legalFoot}>
          <a href="/">← Back to {site.company_name || 'home'}</a>
          {site.phone && <> &nbsp;·&nbsp; <a href={`tel:${site.phone}`}>Call {site.phone}</a></>}
        </footer>
      </div>
    </main>
  );
}
