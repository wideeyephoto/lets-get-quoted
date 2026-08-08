import Link from 'next/link';
import { APP_LOGIN_URL, APP_SIGNUP_URL } from '@/components/marketing/links';

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
            Every job, lead, and client here is fictional - this is what a real, established contractor
            account looks like inside Let&apos;s Get Quoted.
          </span>
        </div>
        <div className="demo-banner-actions">
          <Link href="/" className="demo-banner-back">
            <span aria-hidden="true">←</span> Exit the LIVE Demo
          </Link>
          {/* Plain anchors on the app host. next/link prefetched a bare
              /login on the marketing host — a route that only ever redirects —
              on every demo page, and logged an error for each before falling
              back to a normal navigation. */}
          <a href={APP_LOGIN_URL} className="btn secondary">
            Log in
          </a>
          <a href={APP_SIGNUP_URL} className="btn primary">
            Build my free site
          </a>
        </div>
      </div>
    </div>
  );
}
