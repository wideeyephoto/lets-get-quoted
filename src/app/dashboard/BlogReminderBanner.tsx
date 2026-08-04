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

  // Loud, colorful topic so the recommendation grabs the eye.
  const topicStyle = {
    background: 'linear-gradient(92deg, #f59e0b 0%, #ef4444 40%, #a855f7 75%, #3b82f6 100%)',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent',
    fontWeight: 900,
    fontStyle: 'italic',
    letterSpacing: '.01em',
  } as const;
  // Marketing → Blog, not the website builder. Writing a post is marketing.
  const writeHref = `/dashboard/marketing/blog?topic=${encodeURIComponent(suggestedTopic)}`;

  return (
    <section className="panel workspace-section-card" style={{ borderColor: '#f5a623', background: 'rgba(245, 166, 35, 0.06)' }}>
      <div className="section-heading workspace-section-heading">
        <p className="eyebrow" style={{ color: 'var(--gold-ink)' }}>📝 Blog reminder</p>
        <h2>Your website needs a new blog post</h2>
      </div>
      <p className="workspace-card-copy" style={{ fontSize: '1.02rem', lineHeight: 1.5 }}>
        We recommend starting with an AI template about{' '}
        <span style={topicStyle}>“{suggestedTopic}”</span>
      </p>
      <div className="actions" style={{ marginTop: '0.75rem', display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
        <Link href={writeHref} className="btn primary">✨ Draft this post</Link>
        <button type="button" className="btn" onClick={() => { window.localStorage.setItem(SNOOZE_KEY, String(Date.now() + 2 * WEEK_MS)); setVisible(false); }}>
          Snooze 2 weeks
        </button>
      </div>
    </section>
  );
}
