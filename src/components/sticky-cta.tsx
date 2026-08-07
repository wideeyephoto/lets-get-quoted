'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

// Mobile-only sticky signup bar. The homepage builds peak desire mid-page
// (the wheel + command center) but has no CTA in reach until the comparison
// table — this keeps a button one thumb away. Fades in once the hero is scrolled
// past so it never competes with the hero's own CTAs, and hides again while the
// pinned wheel is on screen (the wheel is full-height there and the bar would
// otherwise overlap the bottom of each card).
export type StickyCtaProps = {
  /**
   * Where the button goes. Defaults to the in-app signup route the homepage has
   * always used. The public marketing cluster passes APP_SIGNUP_URL so that the
   * one button a phone visitor actually sees agrees with every other primary
   * CTA on the same page; an absolute URL is rendered as a plain anchor,
   * because next/link is the wrong element for another host.
   */
  href?: string;
  /** Button label. Defaults to the homepage's. */
  label?: string;
};

export default function StickyCta({
  href = '/login?intent=signup',
  label = 'Create free account',
}: StickyCtaProps = {}) {
  const [pastHero, setPastHero] = useState(false);
  const [wheelOnScreen, setWheelOnScreen] = useState(false);

  useEffect(() => {
    const onScroll = () => setPastHero(window.scrollY > window.innerHeight * 0.9);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    // Hide the bar while the pinned wheel section fills the viewport.
    let io: IntersectionObserver | undefined;
    const story = document.querySelector('.fw-story');
    if (story && 'IntersectionObserver' in window) {
      io = new IntersectionObserver(
        ([entry]) => setWheelOnScreen(entry.isIntersecting),
        { threshold: 0 },
      );
      io.observe(story);
    }

    return () => {
      window.removeEventListener('scroll', onScroll);
      io?.disconnect();
    };
  }, []);

  const show = pastHero && !wheelOnScreen;
  const isInternal = href.startsWith('/');
  const tabIndex = show ? undefined : -1;

  return (
    <div className={`sticky-cta${show ? ' is-on' : ''}`} aria-hidden={show ? undefined : true}>
      {isInternal ? (
        <Link href={href} className="btn primary" tabIndex={tabIndex}>
          {label}
        </Link>
      ) : (
        <a href={href} className="btn primary" tabIndex={tabIndex}>
          {label}
        </a>
      )}
      <span className="sticky-cta-sub">Free &middot; no card &middot; pay only when a homeowner pays you</span>
    </div>
  );
}
