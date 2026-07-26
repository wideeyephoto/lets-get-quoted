import type { CSSProperties, ReactNode } from 'react';
import type { Site } from '@/lib/sites';
import styles from './themes.module.css';

// Standalone Privacy Policy / Terms page, rendered outside the template shell
// (its own route) with a clean readable layout that borrows the site's accent
// and name. The body is a tiny markdown subset from the legal-copy generator:
//   "# Title"  -> h1        "## Heading" -> h2
//   "- item"   -> bullet    blank line   -> paragraph break
function renderLegalBody(body: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let bullets: ReactNode[] = [];
  const flush = () => {
    if (bullets.length) {
      nodes.push(<ul key={`ul-${nodes.length}`}>{bullets}</ul>);
      bullets = [];
    }
  };
  body.split('\n').forEach((line, index) => {
    const text = line.trim();
    if (!text) { flush(); return; }
    if (text.startsWith('## ')) { flush(); nodes.push(<h2 key={index}>{text.slice(3)}</h2>); return; }
    if (text.startsWith('# ')) { flush(); nodes.push(<h1 key={index}>{text.slice(2)}</h1>); return; }
    if (text.startsWith('- ')) { bullets.push(<li key={index}>{text.slice(2)}</li>); return; }
    flush();
    nodes.push(<p key={index}>{text}</p>);
  });
  flush();
  return nodes;
}

export default function SiteLegalPage({ site, title, body }: { site: Site; title: string; body: string }) {
  const themeStyle = { '--theme-accent': site.accent_override || '#2563eb' } as CSSProperties;
  return (
    <main className={styles.legalShell} style={themeStyle}>
      <div className={styles.legalDoc}>
        <nav className={styles.blogCrumb} aria-label="Breadcrumb">
          <a href="/">{site.company_name || 'Home'}</a>
          <span aria-hidden="true">/</span>
          <span>{title}</span>
        </nav>
        <article className={styles.legalBody}>
          {renderLegalBody(body)}
        </article>
        <footer className={styles.legalFoot}>
          <a href="/">← Back to {site.company_name || 'home'}</a>
        </footer>
      </div>
    </main>
  );
}
