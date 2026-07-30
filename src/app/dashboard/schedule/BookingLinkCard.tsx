'use client';

import { useState } from 'react';
import Link from 'next/link';

type BookingLinkCardProps = {
  bookingUrl: string | null;
  sitePublished: boolean;
  openWindowCount: number;
  openDayCount: number;
};

export default function BookingLinkCard({ bookingUrl, sitePublished, openWindowCount, openDayCount }: BookingLinkCardProps) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    if (!bookingUrl) return;
    try {
      await navigator.clipboard.writeText(bookingUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  // Not live yet: point the owner at what unlocks self-serve booking.
  if (!bookingUrl) {
    return (
      <p className="empty-state">
        {sitePublished
          ? 'Add a free letsgetquoted.com subdomain to your website to switch on self-serve booking. '
          : 'Publish your website to switch on self-serve booking — customers pick an open window and it lands on this calendar automatically. '}
        <Link href="/dashboard/sites">Go to your website →</Link>
      </p>
    );
  }

  const displayUrl = bookingUrl.replace(/^https?:\/\//, '');

  return (
    <div className="booking-link-card">
      <p className="workspace-details-copy">
        Share this link and customers pick an open window themselves. Each request lands here as a scheduled job and a
        warm lead — no phone tag.
      </p>
      <div className="booking-link-row">
        <input
          className="booking-link-url"
          value={displayUrl}
          readOnly
          aria-label="Your booking page link"
          onFocus={(event) => event.currentTarget.select()}
        />
        <button type="button" className="btn secondary" onClick={copyLink}>{copied ? 'Copied ✓' : 'Copy link'}</button>
        <a href={bookingUrl} target="_blank" rel="noopener noreferrer" className="btn primary">Open page ↗</a>
      </div>
      <p className="booking-link-note">
        {openWindowCount > 0
          ? `${openWindowCount} open window${openWindowCount === 1 ? '' : 's'} across ${openDayCount} day${openDayCount === 1 ? '' : 's'} on offer right now. More open up as you keep weekdays free on the calendar.`
          : 'No open windows are showing right now — your next few weekdays are full. Free up a weekday to offer online slots.'}
      </p>
    </div>
  );
}
