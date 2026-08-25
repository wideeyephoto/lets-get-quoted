import Link from 'next/link';
import { APP_SIGNUP_URL } from '@/components/marketing/links';

// Pinned to the top of every /demo page — makes it unmissable that this is a
// sample account (fictional data, no real business) while funneling visitors
// straight into signing up for their own account.
export default function DemoBanner() {
  return (
    <div className="stripe-alert-wrap demo-banner-wrap">
      <div className="demo-banner">
        <span className="demo-banner-icon" aria-hidden="true">🎬</span>
        <div className="demo-banner-copy">
          <strong>Interactive product demo using sample data.</strong>
          <span>
            No messages, bookings, or payments are sent — this is what an established contractor account looks like inside Let&apos;s Get Quoted.
          </span>
        </div>
        <div className="demo-banner-actions">
          <Link href="/demo/tour/site" className="btn primary" style={{ background: '#50e3bd', color: '#09212f', fontWeight: 700 }}>
            Start 5-min tour &rarr;
          </Link>
          <Link href="/" className="demo-banner-back">
            <span aria-hidden="true">←</span> Exit demo
          </Link>
          <a href={APP_SIGNUP_URL} className="btn secondary">
            Build my free site
          </a>
        </div>
      </div>
    </div>
  );
}
