import type { CSSProperties, ReactNode } from 'react';
import styles from './themes.module.css';

/**
 * "Find your past jobs" — the door a previous customer comes back through.
 *
 * One shell, three routes: the contractor's subdomain, their custom domain, and
 * the app-origin /portal/[subdomain] URL that predates both. A customer who
 * reaches this from a header link, an email signature and an invoice should not
 * find three different-looking pages, and the two tenant trees have to stay in
 * lockstep anyway.
 *
 * The form is passed in rather than imported: server actions live under app/ in
 * this codebase, so the route that owns the action composes it.
 */
export default function SitePortalPage({
  accent,
  businessName,
  enabled,
  form,
}: {
  /** site.accent_override — the contractor's color, so this reads as theirs. */
  accent: string | null;
  businessName: string;
  /** accounts.client_portal_enabled. */
  enabled: boolean;
  /** Omitted when there's no site to send the request through. */
  form: ReactNode;
}) {
  const themeStyle = { '--theme-accent': accent || '#2563eb' } as CSSProperties;
  return (
    <main className={styles.legalShell} style={themeStyle}>
      <div className={styles.portalDoc}>
        <nav className={styles.blogCrumb} aria-label="Breadcrumb">
          <a href="/">{businessName || 'Home'}</a>
          <span aria-hidden="true">/</span>
          <span>Your jobs</span>
        </nav>

        <div className={styles.portalCard}>
          <h1 className={styles.portalTitle}>Find your past jobs</h1>
          {enabled && form ? (
            <>
              <p className={styles.portalLede}>
                Everything {businessName} has done for you — what was quoted, what&apos;s covered by warranty, and
                how long you&apos;ve got left on it.
              </p>
              {form}
            </>
          ) : (
            /* A contractor who hasn't switched this on gets a page that says so
               plainly, rather than a form that silently does nothing. */
            <p className={styles.portalLede}>
              {businessName} doesn&apos;t have online job lookup switched on. Give them a call and they&apos;ll send
              you your details directly.
            </p>
          )}
        </div>

        <footer className={styles.legalFoot}>
          <a href="/">← Back to {businessName || 'home'}</a>
        </footer>
      </div>
    </main>
  );
}
