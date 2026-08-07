import Link from 'next/link';

// Shared marketing footer — one place for the nav + the copyright year (computed
// at render so it never goes stale), used across every public marketing page.
export default function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="marketing-footer">
      <span>© {year} Let&apos;s Get Quoted</span>
      {/* flexWrap is inline because the shared `.marketing-footer nav` rule is a
          single non-wrapping row, and this list is now long enough to run off a
          narrow screen. Belongs in the stylesheet; lives here until it can go
          there. */}
      <nav aria-label="Site" style={{ flexWrap: 'wrap' }}>
        <Link href="/">Home</Link>
        {/* /features is a page again, not the homepage anchor it was while the
            section was folded into the home wheel. This link is also the only
            path a crawler has from the existing site into the new cluster —
            the five /features/* sub-pages hang off that index. */}
        <Link href="/features">Features</Link>
        <Link href="/how-it-works">How it works</Link>
        <Link href="/pricing">Pricing</Link>
        <Link href="/resources">Resources</Link>
        <Link href="/faq">FAQ</Link>
        <Link href="/security">Security</Link>
        <Link href="/contact">Contact</Link>
        <Link href="/founder">Founder</Link>
        <Link href="/terms">Terms of Service</Link>
        <Link href="/privacy">Privacy Policy</Link>
        <Link href="/sms-terms">SMS Terms</Link>
      </nav>
    </footer>
  );
}
