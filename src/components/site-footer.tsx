import Link from 'next/link';
import { FOOTER_LEGAL, FOOTER_PRIMARY } from '@/components/marketing/footer-nav';
import MarketingAiAssistant from '@/components/marketing/MarketingAiAssistant';

// Shared marketing footer — the nav + the copyright year (computed at render so
// it never goes stale), used across every public marketing page that draws from
// globals.css rather than the flagship stylesheet.
//
// The LINKS are no longer written here: they come from footer-nav, which
// flagship/site-chrome's footer also renders, so the two footers can differ in
// markup and styling but never in where they let a visitor go. See that file.
export default function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <>
      <footer className="marketing-footer">
        <div className="marketing-footer-brand">
          <p className="footer-slogan">Built thoughtfully, for thoughtful contractors</p>
          <span>© {year} Let&apos;s Get Quoted</span>
        </div>
        {/* flexWrap is inline because the shared `.marketing-footer nav` rule is a
            single non-wrapping row, and this list is now long enough to run off a
            narrow screen. Belongs in the stylesheet; lives here until it can go
            there. */}
        <nav aria-label="Site" style={{ flexWrap: 'wrap' }}>
          <Link href="/">Home</Link>
          {[...FOOTER_PRIMARY, ...FOOTER_LEGAL].map(([href, label]) => (
            <Link key={href} href={href}>{label}</Link>
          ))}
        </nav>
      </footer>
      <MarketingAiAssistant />
    </>
  );
}
