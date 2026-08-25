'use client';

import { useEffect, useState } from 'react';
import styles from './guide.module.css';

/** Scroll depth progress indicator at the top of the viewport */
export function ReadingProgressBar() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (totalHeight <= 0) return;
      const currentScroll = window.scrollY;
      const percentage = Math.min(100, Math.max(0, (currentScroll / totalHeight) * 100));
      setProgress(percentage);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return <div className={styles.progressBar} style={{ width: `${progress}%` }} aria-hidden="true" />;
}

/** 1-click share & copy link button with feedback */
export function CopyGuideLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      } else {
        const input = document.createElement('input');
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback silent
    }
  };

  return (
    <button type="button" className={styles.shareBtn} onClick={handleCopy} title="Copy link to clipboard">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        {copied ? (
          <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <>
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </>
        )}
      </svg>
      {copied ? 'Link copied!' : 'Share guide'}
    </button>
  );
}

/** Quick Jump Table of Contents for headings */
export function TableOfContents({ headings }: { headings: { id: string; text: string }[] }) {
  if (!headings || headings.length === 0) return null;

  return (
    <nav className={styles.tocBox} aria-label="Table of contents">
      <p className={styles.tocTitle}>In this guide</p>
      <ul className={styles.tocList}>
        {headings.map((heading) => (
          <li key={heading.id}>
            <a href={`#${heading.id}`} className={styles.tocLink}>
              <span aria-hidden="true">→</span>
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** High-contrast Key Takeaways callout */
export function KeyTakeaways({ text }: { text: string }) {
  return (
    <div className={styles.takeawaysBox}>
      <p className={styles.takeawaysTitle}>
        <span aria-hidden="true">⚡</span> Key Takeaway
      </p>
      <p>{text}</p>
    </div>
  );
}

/** Embedded Interactive Tool: Margin vs. Markup Live Calculator */
export function InteractiveMarginCalculator() {
  const [cost, setCost] = useState<number>(3500);
  const [margin, setMargin] = useState<number>(35);

  const safeMargin = Math.min(95, Math.max(1, margin)) / 100;
  const quotePrice = cost > 0 && safeMargin < 1 ? cost / (1 - safeMargin) : 0;
  const grossProfit = quotePrice - cost;
  const markupPercent = cost > 0 ? (grossProfit / cost) * 100 : 0;

  return (
    <div className={styles.widgetBox} id="interactive-calculator">
      <h3 className={styles.widgetHeading}>
        <span aria-hidden="true">🧮</span> Interactive Margin vs. Markup Calculator
      </h3>
      <p className={styles.widgetDesc}>
        Adjust your direct job costs and desired profit margin to calculate the exact quote price and markup multiplier required.
      </p>

      <div className={styles.calcGrid}>
        <label className={styles.calcField}>
          <span className={styles.calcLabel}>Direct Job Cost ($)</span>
          <div className={styles.calcInputWrap}>
            <span>$</span>
            <input
              type="number"
              min="0"
              step="100"
              className={styles.calcInput}
              value={cost}
              onChange={(e) => setCost(Math.max(0, Number(e.target.value)))}
            />
          </div>
        </label>

        <label className={styles.calcField}>
          <span className={styles.calcLabel}>Target Margin: {margin}%</span>
          <input
            type="range"
            min="10"
            max="70"
            step="1"
            value={margin}
            onChange={(e) => setMargin(Number(e.target.value))}
            style={{ accentColor: '#ff5a12', marginTop: '0.6rem' }}
          />
        </label>
      </div>

      <div className={styles.calcResults}>
        <div className={resultClass(styles.resultCard)}>
          <span className={styles.resultLabel}>Required Quote Price</span>
          <span className={styles.resultValueHighlight}>
            ${Math.round(quotePrice).toLocaleString('en-US')}
          </span>
        </div>
        <div className={styles.resultCard}>
          <span className={styles.resultLabel}>Gross Profit</span>
          <span className={styles.resultValue}>
            ${Math.round(grossProfit).toLocaleString('en-US')}
          </span>
        </div>
        <div className={styles.resultCard}>
          <span className={styles.resultLabel}>Required Markup</span>
          <span className={styles.resultValue}>
            +{markupPercent.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}

function resultClass(base: string) {
  return base;
}

/** Embedded Interactive Tool: 10DLC Compliance Checklist */
export function InteractiveChecklist10DLC() {
  const [checked, setChecked] = useState<Record<string, boolean>>({
    ein: true,
    privacy: true,
    disclosure: false,
    optout: false,
  });

  const toggle = (key: string) => {
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const total = 4;
  const completed = Object.values(checked).filter(Boolean).length;

  return (
    <div className={styles.widgetBox} id="10dlc-checklist">
      <h3 className={styles.widgetHeading}>
        <span aria-hidden="true">📋</span> 10DLC Carrier Verification Checklist
      </h3>
      <p className={styles.widgetDesc}>
        Check your business readiness before submitting for mobile carrier registration.
      </p>

      <ul className={styles.checkList}>
        <li
          className={`${styles.checkItem} ${checked.ein ? styles.checkItemDone : ''}`}
          onClick={() => toggle('ein')}
        >
          <input type="checkbox" className={styles.checkInput} checked={checked.ein} readOnly />
          <div className={styles.checkInfo}>
            <span className={styles.checkTitle}>Valid EIN & Registered Legal Name</span>
            <span className={styles.checkDesc}>Matches exactly with IRS Form CP 575 or official state registration.</span>
          </div>
        </li>
        <li
          className={`${styles.checkItem} ${checked.privacy ? styles.checkItemDone : ''}`}
          onClick={() => toggle('privacy')}
        >
          <input type="checkbox" className={styles.checkInput} checked={checked.privacy} readOnly />
          <div className={styles.checkInfo}>
            <span className={styles.checkTitle}>Compliant Website Privacy Policy</span>
            <span className={styles.checkDesc}>Explicitly states customer numbers will not be sold or shared with 3rd parties.</span>
          </div>
        </li>
        <li
          className={`${styles.checkItem} ${checked.disclosure ? styles.checkItemDone : ''}`}
          onClick={() => toggle('disclosure')}
        >
          <input type="checkbox" className={styles.checkInput} checked={checked.disclosure} readOnly />
          <div className={styles.checkInfo}>
            <span className={styles.checkTitle}>Clear SMS Opt-In Consent on Forms</span>
            <span className={styles.checkDesc}>Includes notice that submitting a form authorizes text messages for estimates.</span>
          </div>
        </li>
        <li
          className={`${styles.checkItem} ${checked.optout ? styles.checkItemDone : ''}`}
          onClick={() => toggle('optout')}
        >
          <input type="checkbox" className={styles.checkInput} checked={checked.optout} readOnly />
          <div className={styles.checkInfo}>
            <span className={styles.checkTitle}>Carrier STOP / UNSUBSCRIBE Keyword Handling</span>
            <span className={styles.checkDesc}>Automated handling when a homeowner texts STOP to unsubscribe immediately.</span>
          </div>
        </li>
      </ul>

      <p className={styles.checkProgress}>
        {completed === total ? '🎉 Fully Ready for 10DLC Approval!' : `${completed} of ${total} requirements completed`}
      </p>
    </div>
  );
}

/** Embedded Interactive Tool: Speed-to-Lead Lead Conversion Simulator */
export function SpeedToLeadEstimator() {
  const [minutes, setMinutes] = useState<number>(5);

  const getDrop = (mins: number) => {
    if (mins <= 5) return { drop: '0%', qualifyChance: '78%', status: 'Peak Conversion' };
    if (mins <= 15) return { drop: '-140%', qualifyChance: '54%', status: 'Moderate Decay' };
    if (mins <= 30) return { drop: '-391%', qualifyChance: '32%', status: 'High Drop-off' };
    if (mins <= 60) return { drop: '-600%', qualifyChance: '19%', status: 'Competitor Win Zone' };
    return { drop: '-850%', qualifyChance: '8%', status: 'Lost Opportunity' };
  };

  const stat = getDrop(minutes);

  return (
    <div className={styles.widgetBox} id="speed-simulator">
      <h3 className={styles.widgetHeading}>
        <span aria-hidden="true">⏱️</span> Speed-to-Lead Conversion Simulator
      </h3>
      <p className={styles.widgetDesc}>
        See how your average response time directly impacts lead qualification and win rates.
      </p>

      <div className={styles.calcGrid}>
        <label className={styles.calcField}>
          <span className={styles.calcLabel}>Average First Response Time: {minutes} minutes</span>
          <input
            type="range"
            min="1"
            max="120"
            step="1"
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            style={{ accentColor: '#ff5a12', marginTop: '0.6rem' }}
          />
        </label>
      </div>

      <div className={styles.calcResults}>
        <div className={styles.resultCard}>
          <span className={styles.resultLabel}>Qualification Chance</span>
          <span className={styles.resultValueHighlight}>{stat.qualifyChance}</span>
        </div>
        <div className={styles.resultCard}>
          <span className={styles.resultLabel}>Decay vs. 5-Min Benchmark</span>
          <span className={styles.resultValue}>{stat.drop}</span>
        </div>
        <div className={styles.resultCard}>
          <span className={styles.resultLabel}>Lead Status</span>
          <span className={styles.resultValue} style={{ fontSize: '1.05rem', color: minutes <= 5 ? '#4caf50' : '#ff9800' }}>
            {stat.status}
          </span>
        </div>
      </div>
    </div>
  );
}
