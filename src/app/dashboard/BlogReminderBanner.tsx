'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

// Client-side blog nudge. The owner sets a cadence (2/4/8 weeks) in the builder's
// Blog section; this shows on the dashboard once that long has passed since the
// last PUBLISHED post (or immediately, if they've never published one). "Snooze
// 2 weeks" is a local, per-browser delay so it doesn't nag every visit.
const SNOOZE_KEY = 'lgq-blog-reminder-snooze';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type Props = { reminderWeeks: number; lastPublishedISO: string | null; suggestedTopic: string };

export default function BlogReminderBanner({ reminderWeeks, lastPublishedISO, suggestedTopic }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!reminderWeeks) return;
    const snoozeUntil = Number(window.localStorage.getItem(SNOOZE_KEY) || 0);
    if (snoozeUntil && Date.now() < snoozeUntil) return;
    const last = lastPublishedISO ? new Date(`${lastPublishedISO}T00:00:00`).getTime() : 0;
    if (!last || Date.now() - last >= reminderWeeks * WEEK_MS) setVisible(true);
  }, [reminderWeeks, lastPublishedISO]);

  if (!visible) return null;

  // Marketing → Blog, not the website builder. Writing a post is marketing.
  const writeHref = `/dashboard/marketing/blog?topic=${encodeURIComponent(suggestedTopic)}`;

  return (
    // The amber tint, the loud topic and the spacing are all in globals.css now.
    // They were inline, and one of them — a `background` SHORTHAND — replaced the
    // panel's own fill rather than tinting it, so in the light theme this card
    // rendered as a dark slab with the sheet's near-black ink on it. See
    // .blog-reminder-card for the measurements.
    <section className="panel workspace-section-card blog-reminder-card">
      <div className="section-heading workspace-section-heading">
        <p className="eyebrow blog-reminder-eyebrow">📝 Blog reminder</p>
        <h2>Your website needs a new blog post</h2>
      </div>
      <p className="workspace-card-copy blog-reminder-copy">
        We recommend starting with an AI template about{' '}
        <span className="blog-reminder-topic">“{suggestedTopic}”</span>
      </p>
      <div className="actions blog-reminder-actions">
        <Link href={writeHref} className="btn primary">✨ Draft this post</Link>
        <button type="button" className="btn" onClick={() => { window.localStorage.setItem(SNOOZE_KEY, String(Date.now() + 2 * WEEK_MS)); setVisible(false); }}>
          Snooze 2 weeks
        </button>
      </div>
    </section>
  );
}
