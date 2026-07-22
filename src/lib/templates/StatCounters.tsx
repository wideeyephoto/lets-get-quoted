'use client';

import { useEffect, useRef, useState } from 'react';
import type { SiteStatItem } from '@/lib/site-content';
import styles from './themes.module.css';

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

// Animated stat band. Numbers count up from 0 to their target the first time the
// section scrolls into view; prefers-reduced-motion (or a 0 target) jumps
// straight to the final value. Labels are always static text, so the meaning is
// present even before/without the animation.
export default function StatCounters({ title, items }: { title: string; items: SiteStatItem[] }) {
  const sectionRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0, rootMargin: '0px 0px -12% 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className={styles.extraSection} data-reveal id="stats">
      <div className={styles.extraSectionHeader}>
        <p className={styles.kicker}>Track record</p>
        <h2>{title}</h2>
      </div>
      <div className={styles.statGrid}>
        {items.map((item) => (
          <div key={item.id} className={styles.statItem}>
            <div className={styles.statValue}>
              {item.prefix}<StatNumber target={item.value} run={visible} />{item.suffix}
            </div>
            <div className={styles.statLabel}>{item.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function StatNumber({ target, run }: { target: number; run: boolean }) {
  const [display, setDisplay] = useState(0);
  // Animate only the first reveal. On any later target change (e.g. the
  // contractor editing the value in the live preview, which re-renders this same
  // instance rather than remounting it), snap straight to the new value so the
  // preview always reflects the edit instead of freezing at the old number.
  const animatedRef = useRef(false);

  useEffect(() => {
    if (!run) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (animatedRef.current || reduce || target <= 0) {
      setDisplay(target);
      animatedRef.current = true;
      return;
    }
    animatedRef.current = true;
    const duration = 1400;
    let startTime = 0;
    let raf = 0;
    const tick = (now: number) => {
      if (!startTime) startTime = now;
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(target * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
      else setDisplay(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, target]);

  return <>{formatNumber(display)}</>;
}
