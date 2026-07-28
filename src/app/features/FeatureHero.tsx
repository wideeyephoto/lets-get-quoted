'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import './feature-hero.css';

// Features hero: "Quote it. Sign it. Get paid." with a unified dashboard panel
// (the paid figure + the favorite tools). Copy + CTAs are the real content; the
// panel is decorative. Count-up + staggered reveal run once on mount.
export default function FeatureHero() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const REDUCE = window.matchMedia('(prefers-reduced-motion:reduce)').matches;

    root.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => {
      const target = parseFloat(el.getAttribute('data-count') || '0');
      if (!Number.isFinite(target)) return;
      const fmt = (v: number) => '$' + Math.round(v).toLocaleString();
      if (REDUCE) {
        el.textContent = fmt(target);
        return;
      }
      const t0 = performance.now();
      const dur = 900;
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        el.textContent = fmt(target * e);
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = fmt(target);
      };
      requestAnimationFrame(step);
    });

    if (!REDUCE) root.querySelector('.fh-win')?.classList.add('fh-play');
  }, []);

  return (
    <section className="fh-hero" aria-labelledby="fx-hero-title" ref={ref}>
      <div className="fh-copy">
        <p className="eyebrow">The whole loop, one tool</p>
        <h1 id="fx-hero-title" className="fh-title">
          Quote it. Sign it. <span className="fh-grad">Get paid.</span>
        </h1>
        <p className="fh-sub">
          Every tool the job needs — from the AI estimate on your website to money in your bank. One command center, no
          monthly subscription.
        </p>
        <div className="actions">
          <Link href="/login" className="btn primary">
            Create Free Account
          </Link>
          <Link href="/demo" className="btn secondary">
            Explore the demo &mdash; no signup
          </Link>
        </div>
      </div>

      <div className="fh-win" aria-hidden="true">
        <div className="fh-bar">
          <i />
          <i />
          <i />
          <span className="u">letsgetquoted.com &middot; dashboard</span>
        </div>
        <div className="fh-body">
          <div className="fh-paid">
            <div>
              <div className="l">Paid &middot; deposited to your bank</div>
              <div className="amt" data-count="4250">$4,250</div>
            </div>
            <span className="fh-badge">
              <span className="ck">✓</span> Get paid
            </span>
          </div>
          <div className="fh-grid">
            <div className="fh-cell pri">
              <span className="ic">
                <svg viewBox="0 0 24 24"><path d="M4 5h16v11H8l-4 4z" /><path d="M8 10h8M8 13h5" /></svg>
              </span>
              <div>
                <b>AI Smart Intake <span className="star">★</span></b>
                <small>Prices leads 24/7</small>
              </div>
            </div>
            <div className="fh-cell">
              <span className="ic">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18" /></svg>
              </span>
              <div>
                <b>Website</b>
                <small>Your own domain</small>
              </div>
            </div>
            <div className="fh-cell">
              <span className="ic">
                <svg viewBox="0 0 24 24"><path d="M4 20l4-1L18 8a2 2 0 0 0-3-3L5 15z" /><path d="M14 6l3 3" /></svg>
              </span>
              <div>
                <b>Quotes &amp; e-sign</b>
                <small>Signed on a phone</small>
              </div>
            </div>
            <div className="fh-cell">
              <span className="ic">
                <svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-3-5.3 3 1.1-6L3.4 9.4l6-.8z" /></svg>
              </span>
              <div>
                <b>Reviews &rarr; Google</b>
                <small>Auto-requested</small>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
