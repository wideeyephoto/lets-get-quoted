import Link from 'next/link';

// Pinned to the top of every /demo page — makes it unmissable that this is a
// sample account (fictional data, no real business) while funneling visitors
// straight into signing up for their own account.
export default function DemoBanner() {
  return (
    <div className="stripe-alert-wrap demo-banner-wrap">
      <div className="demo-banner">
        <span className="demo-banner-icon" aria-hidden="true">🎬</span>
        <div className="demo-banner-copy">
          <strong>You&apos;re viewing a live demo.</strong>
          <span>
            Every job, quote request, and client here is fictional - this is what a real, established contractor
            account looks like inside Let&apos;s Get Quoted.
          </span>
        </div>
        <div className="demo-banner-actions">
          <Link href="/login" className="btn secondary">
            Log in
          </Link>
          <Link href="/login" className="btn primary">
            Create free account
          </Link>
        </div>
      </div>
    </div>
  );
}
