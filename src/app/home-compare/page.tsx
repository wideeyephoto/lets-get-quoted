'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import styles from './home-compare.module.css';

/**
 * The live homepage and the candidate, framed side by side at one width.
 *
 * Flipping between two tabs does not work for this judgement. What you are
 * comparing is how fast each page reads in the first few seconds, and a tab
 * switch costs you the seconds — by the time the second page paints you are no
 * longer a cold visitor, you are someone who read the other one. Both at once,
 * at the same width, scrolling together, is the only version of the question
 * that can be answered honestly.
 *
 * Same-origin framing is permitted here (`X-Frame-Options: SAMEORIGIN` and CSP
 * `frame-src 'self'`), so these are the real pages, not screenshots — every
 * hover, every breakpoint, every animation is live.
 */

const DEVICES = [
  { key: 'phone', label: 'Phone', width: 390, height: 844 },
  { key: 'tablet', label: 'Tablet', width: 834, height: 1112 },
  { key: 'laptop', label: 'Laptop', width: 1280, height: 860 },
  { key: 'desktop', label: 'Desktop', width: 1600, height: 1000 },
] as const;

const GAP_PX = 20;

export default function HomeComparePage() {
  const [device, setDevice] = useState<(typeof DEVICES)[number]>(DEVICES[0]);
  const [scale, setScale] = useState(1);
  const rowRef = useRef<HTMLDivElement>(null);

  // Scale to whatever room there is rather than making the page scroll
  // sideways: two 1600px frames need 3,220px, and a horizontal scrollbar
  // between the two things you are comparing defeats the point of showing them
  // together. Never scales UP — a phone frame blown up past life size would
  // flatter both pages equally and tell you nothing.
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;

    const measure = () => {
      const available = (row.clientWidth - GAP_PX) / 2;
      setScale(Math.min(1, available / device.width));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [device]);

  const panes = [
    { key: 'live', label: 'Live', sub: '/', href: '/', src: '/' },
    { key: 'draft', label: 'Draft', sub: '/home-next', href: '/home-next', src: '/home-next?frame=1' },
  ];

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <div>
          <p className={styles.eyebrow}>Homepage</p>
          <h1 className={styles.title}>Live vs draft</h1>
        </div>

        <div className={styles.controls} role="group" aria-label="Frame width">
          {DEVICES.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`${styles.widthBtn} ${option.key === device.key ? styles.on : ''}`}
              aria-pressed={option.key === device.key}
              onClick={() => setDevice(option)}
            >
              {option.label}
              <span className={styles.widthPx}>{option.width}</span>
            </button>
          ))}
        </div>
      </header>

      <p className={styles.note}>
        Both frames are the real pages at {device.width}px wide
        {scale < 1 ? `, drawn at ${Math.round(scale * 100)}% to fit` : ''}. Scroll inside either one. The live
        homepage is untouched — the draft is a separate route and is not indexed.
      </p>

      <div className={styles.row} ref={rowRef}>
        {panes.map((pane) => (
          <section className={styles.pane} key={pane.key}>
            <div className={styles.paneHead}>
              <span className={styles.paneLabel}>{pane.label}</span>
              <code className={styles.paneSub}>{pane.sub}</code>
              <Link href={pane.href} className={styles.paneOpen} target="_blank" rel="noreferrer">
                Open full size →
              </Link>
            </div>
            <div
              className={styles.stage}
              style={{ width: device.width * scale, height: device.height * scale }}
            >
              <iframe
                title={`${pane.label} homepage`}
                src={pane.src}
                className={styles.frame}
                style={{
                  width: device.width,
                  height: device.height,
                  transform: `scale(${scale})`,
                }}
              />
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
