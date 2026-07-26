'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

// Client-side blog nudge. The owner sets a cadence (2/4/8 weeks) in the builder's
// Blog section; this shows on the dashboard once that long has passed since the
// last PUBLISHED post (or immediately, if they've never published one). "Snooze
// 2 weeks" is a local, per-browser delay so it doesn't nag every visit.
const SNOOZE_KEY = 'lgq-blog-reminder-snooze';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type Props = { reminderWeeks: number; lastPublishedISO: string | null; sitesHref: string };

export default function BlogReminderBanner({ reminderWeeks, lastPublishedISO, sitesHref }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!reminderWeeks) return;
    const snoozeUntil = Number(window.localStorage.getItem(SNOOZE_KEY) || 0);
    if (snoozeUntil && Date.now() < snoozeUntil) return;
    const last = lastPublishedISO ? new Date(`${lastPublishedISO}T00:00:00`).getTime() : 0;
    if (!last || Date.now() - last >= reminderWeeks * WEEK_MS) setVisible(true);
  }, [reminderWeeks, lastPublishedISO]);

  if (!visible) return null;

  return (
    <section className="panel workspace-section-card" style={{ borderColor: '#f5a623', background: 'rgba(245, 166, 35, 0.06)' }}>
      <div className="section-heading workspace-section-heading">
        <p className="eyebrow" style={{ color: '#f5a623' }}>📝 Blog reminder</p>
        <h2>Time to publish a fresh post</h2>
      </div>
      <p className="workspace-card-copy">
        {lastPublishedISO ? "It's been a while since your last published post." : "You haven't published a blog post yet."} A new article keeps your site ranking on Google and gives past customers a reason to come back.
      </p>
      <div className="actions" style={{ marginTop: '0.75rem', display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
        <Link href={sitesHref} className="btn primary">Write a post</Link>
        <button type="button" className="btn" onClick={() => { window.localStorage.setItem(SNOOZE_KEY, String(Date.now() + 2 * WEEK_MS)); setVisible(false); }}>
          Snooze 2 weeks
        </button>
      </div>
    </section>
  );
}
