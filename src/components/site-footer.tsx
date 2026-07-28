import Link from 'next/link';

// Shared marketing footer — one place for the nav + the copyright year (computed
// at render so it never goes stale), used across every public marketing page.
export default function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="marketing-footer">
      <span>© {year} Let&apos;s Get Quoted</span>
      <nav aria-label="Site">
        <Link href="/">Home</Link>
        <Link href="/#wheel">Features</Link>
        <Link href="/pricing">Pricing</Link>
        <Link href="/resources">Resources</Link>
        <Link href="/faq">FAQ</Link>
        <Link href="/security">Security</Link>
        <Link href="/privacy">Privacy Policy</Link>
        <Link href="/sms-terms">SMS Terms</Link>
      </nav>
    </footer>
  );
}
