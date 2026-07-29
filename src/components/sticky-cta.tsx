'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

// Mobile-only sticky signup bar. The homepage builds peak desire mid-page
// (the wheel + command center) but has no CTA in reach until the comparison
// table — this keeps a button one thumb away. Fades in once the hero is scrolled
// past so it never competes with the hero's own CTAs.
export default function StickyCta() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > window.innerHeight * 0.9);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className={`sticky-cta${show ? ' is-on' : ''}`} aria-hidden={show ? undefined : true}>
      <Link href="/login?intent=signup" className="btn primary" tabIndex={show ? undefined : -1}>
        Create Free Account
      </Link>
      <span className="sticky-cta-sub">Free &middot; no card &middot; pay only when a homeowner pays you</span>
    </div>
  );
}
