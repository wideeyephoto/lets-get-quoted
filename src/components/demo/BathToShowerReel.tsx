'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import styles from './bath-to-shower-reel.module.css';

const BEFORE_IMAGE = '/demo/bath-to-shower/before.png';
const AFTER_IMAGE = '/demo/bath-to-shower/after.png';
const SCENE_DURATIONS = [5200, 6000, 7800, 5700, 5600] as const;

const quoteItems = [
  { label: 'Demo + plumbing prep', price: '$1,650' },
  { label: 'Waterproof + tile install', price: '$2,950' },
  { label: 'Pan, glass + safety kit', price: '$3,500' },
] as const;

type BathToShowerReelProps = {
  initialScene?: number;
  autoplay?: boolean;
  variant?: 'standalone' | 'embed';
};

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m21 3-7 18-4-7-7-4 18-7Z" />
      <path d="m10 14 4-4" />
    </svg>
  );
}

const sceneLabels = ['Lead arrives', 'Scope the work', 'Build the quote', 'Customer preview', 'Deposit paid'] as const;

function SceneOne() {
  return (
    <section className={`${styles.scene} ${styles.leadScene}`} data-reel-scene="lead-arrival">
      <Image
        className={styles.heroImage}
        src={BEFORE_IMAGE}
        alt="Outdated bathtub ready for conversion"
        fill
        priority
        sizes="(max-aspect-ratio: 9/16) 100vw, 56.25vh"
      />
      <div className={styles.photoShade} />
      <span className={`${styles.floatingStatus} ${styles.livePill}`}><i />LIVE LEAD</span>

      <div className={styles.leadCopy}>
        <div className={styles.eyebrow}><span>8:42 PM</span><b>NEW LEAD</b></div>
        <h1>A bathroom lead just landed.</h1>
        <p>“Replace this tub with a safer walk-in shower.”</p>
        <div className={styles.swipeCue}>
          <span>Turn the request into a quote</span>
          <ArrowIcon />
        </div>
      </div>
    </section>
  );
}

function SceneTwo() {
  return (
    <section className={`${styles.scene} ${styles.scopeScene}`} data-reel-scene="contractor-scope">
      <span className={`${styles.floatingStatus} ${styles.sceneCount}`}>02 / 05</span>

      <div className={styles.sceneHeading}>
        <span className={styles.kicker}>CONTRACTOR VIEW</span>
        <h2>Scope it in seconds.</h2>
      </div>

      <div className={styles.leadCard}>
        <div className={styles.customerRow}>
          <div className={styles.avatar}>MC</div>
          <div>
            <strong>Michelle Carter</strong>
            <span>Bath-to-shower conversion</span>
          </div>
          <span className={styles.hotFit}>HOT FIT</span>
        </div>

        <div className={styles.scopePhoto}>
          <Image
            src={BEFORE_IMAGE}
            alt="Michelle's existing bathtub"
            fill
            priority
            sizes="(max-aspect-ratio: 9/16) 92vw, 52vh"
          />
          <span>Customer photo</span>
        </div>

        <div className={styles.projectFacts}>
          <div><span>FOOTPRINT</span><strong>60&quot; alcove</strong></div>
          <div><span>TIMELINE</span><strong>30 days</strong></div>
          <div><span>BUDGET</span><strong>$8k–$10k</strong></div>
        </div>

        <div className={styles.scopeTags}>
          <span><CheckIcon />Low threshold</span>
          <span><CheckIcon />Grab bar + seat</span>
          <span><CheckIcon />Glass door</span>
          <span><CheckIcon />Shower niche</span>
        </div>
      </div>

      <div className={styles.nextAction}>
        <span>Scope confirmed</span>
        <strong>Build the quote <ArrowIcon /></strong>
      </div>
    </section>
  );
}

function SceneThree() {
  return (
    <section className={`${styles.scene} ${styles.quoteScene}`} data-reel-scene="quote-builder">
      <span className={`${styles.floatingStatus} ${styles.sceneCount}`}>03 / 05</span>

      <div className={styles.sceneHeading}>
        <span className={styles.kicker}>SMART QUOTE</span>
        <h2>Price the job.<br />Keep the margin.</h2>
      </div>

      <div className={styles.quoteBuilder}>
        <div className={styles.quoteMeta}>
          <div>
            <span>QUOTE #1048</span>
            <strong>Bath-to-shower conversion</strong>
          </div>
          <span className={styles.draftPill}>DRAFT</span>
        </div>

        <div className={styles.lineItems}>
          {quoteItems.map((item, index) => (
            <div className={styles.lineItem} key={item.label} style={{ '--item-index': index } as React.CSSProperties}>
              <span className={styles.itemCheck}><CheckIcon /></span>
              <span>{item.label}</span>
              <strong>{item.price}</strong>
            </div>
          ))}
        </div>

        <div className={styles.quoteTotal}>
          <span>PROJECT TOTAL</span>
          <strong>$8,100</strong>
        </div>
        <div className={styles.depositLine}>
          <span>10% booking deposit</span>
          <strong>$810 due today</strong>
        </div>

        <div className={styles.sendButton} data-reel-action="send-quote">
          Send quote to Michelle <SendIcon />
        </div>
      </div>

      <p className={styles.microProof}>Clear scope. Clean pricing. No spreadsheet.</p>
    </section>
  );
}

function SceneFour() {
  return (
    <section className={`${styles.scene} ${styles.previewScene}`} data-reel-scene="customer-preview">
      <span className={`${styles.floatingStatus} ${styles.sentPill}`}><CheckIcon /> SENT BY TEXT</span>

      <div className={styles.afterPhoto}>
        <Image
          src={AFTER_IMAGE}
          alt="Finished low-threshold walk-in shower"
          fill
          priority
          sizes="(max-aspect-ratio: 9/16) 100vw, 56.25vh"
        />
        <div className={styles.afterLabel}>
          <span>PROPOSED RESULT</span>
          <strong>Safer. Cleaner. Built to last.</strong>
        </div>
      </div>

      <div className={styles.customerPhone}>
        <div className={styles.messageHeader}>
          <div className={styles.avatarSmall}>LGQ</div>
          <div><strong>Alpine Bath Co.</strong><span>Quote delivered just now</span></div>
        </div>
        <p>Michelle — your quote is ready.</p>
        <div className={styles.previewTotal}>
          <span>Bath-to-shower conversion</span>
          <strong>$8,100</strong>
          <small>$810 to book</small>
        </div>
        <div className={styles.approveButton}>Approve &amp; reserve date</div>
      </div>

      <div className={styles.previewCaption}>
        <span>CUSTOMER EXPERIENCE</span>
        <strong>The quote sells the work.</strong>
      </div>
    </section>
  );
}

function SceneFive() {
  return (
    <section className={`${styles.scene} ${styles.bookedScene}`} data-reel-scene="deposit-booked">
      <div className={styles.bookedBackdrop}>
        <Image
          src={AFTER_IMAGE}
          alt="Completed walk-in shower project"
          fill
          priority
          sizes="(max-aspect-ratio: 9/16) 100vw, 56.25vh"
        />
      </div>
      <div className={styles.bookedShade} />
      <span className={`${styles.floatingStatus} ${styles.livePill}`}><i />BOOKED</span>

      <div className={styles.paymentToast}>
        <span className={styles.successIcon}><CheckIcon /></span>
        <div>
          <span>DEPOSIT PAID</span>
          <strong>$810 received</strong>
          <small>Michelle Carter · just now</small>
        </div>
      </div>

      <div className={styles.finalCopy}>
        <span className={styles.kicker}>FROM LEAD TO BOOKED</span>
        <h2>One lead.<br />One quote.<br /><em>One booked job.</em></h2>
        <div className={styles.appointmentCard}>
          <span>FINAL MEASURE</span>
          <strong>Thursday · 4:30 PM</strong>
          <small>Added to your schedule</small>
        </div>
        <p><b>LET&apos;S GET QUOTED</b> · Quote faster.</p>
      </div>
    </section>
  );
}

const scenes = [SceneOne, SceneTwo, SceneThree, SceneFour, SceneFive] as const;

export default function BathToShowerReel({
  initialScene = 0,
  autoplay = true,
  variant = 'standalone',
}: BathToShowerReelProps) {
  const [scene, setScene] = useState(initialScene);
  const [embedScale, setEmbedScale] = useState(1);
  const [isPlaying, setIsPlaying] = useState(autoplay);
  const [isInView, setIsInView] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const embedRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (media.matches && autoplay) setIsPlaying(false);
  }, [autoplay]);

  useEffect(() => {
    const onVisibilityChange = () => setPageVisible(document.visibilityState === 'visible');
    onVisibilityChange();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useEffect(() => {
    const root = embedRootRef.current;
    if (variant !== 'embed' || !root || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsInView(entry.isIntersecting && entry.intersectionRatio >= 0.35),
      { threshold: [0, 0.35, 1] },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, [variant]);

  useEffect(() => {
    if (!isPlaying || !isInView || !pageVisible || scene >= scenes.length - 1) return;
    const timer = window.setTimeout(() => setScene((current) => current + 1), SCENE_DURATIONS[scene]);
    return () => window.clearTimeout(timer);
  }, [isInView, isPlaying, pageVisible, scene]);

  useEffect(() => {
    if (scene === scenes.length - 1) setIsPlaying(false);
  }, [scene]);

  useEffect(() => {
    if (variant !== 'embed') return;
    const root = embedRootRef.current;
    if (!root) return;

    const measure = () => setEmbedScale(root.clientWidth / 720);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [variant]);

  const CurrentScene = scenes[scene];

  const reel = (
      <div
        className={`${styles.reelCanvas}${variant === 'embed' ? ` ${styles.reelCanvasEmbed}` : ''}`}
        data-reel-current={scene}
        data-reel-ready="true"
        key={scene}
        style={variant === 'embed' ? { transform: `scale(${embedScale})` } : undefined}
      >
        <CurrentScene />

        <div
          aria-label={`Scene ${scene + 1} of ${scenes.length}`}
          aria-valuemax={scenes.length}
          aria-valuemin={1}
          aria-valuenow={scene + 1}
          className={styles.sceneProgress}
          role="progressbar"
        >
          {scenes.map((_, index) => (
            <span
              className={index <= scene ? styles.progressActive : undefined}
              key={index}
            />
          ))}
        </div>

      </div>
  );

  if (variant === 'embed') {
    return (
      <div className={styles.reelShellEmbed}>
        <div
          aria-label="Bath-to-shower quote walkthrough"
          className={styles.reelViewportEmbed}
          ref={embedRootRef}
          role="region"
        >
          {reel}
        </div>

        <div className={styles.playerBar}>
          <button
            className={styles.playButton}
            onClick={() => {
              if (scene === scenes.length - 1) setScene(0);
              setIsPlaying((current) => scene === scenes.length - 1 || !current);
            }}
            type="button"
          >
            {isPlaying ? 'Pause' : scene === scenes.length - 1 ? 'Play again' : 'Play'}
          </button>

          <div className={styles.playerTimeline} aria-label="Choose a scene">
            {sceneLabels.map((label, index) => (
              <button
                aria-label={`Show scene ${index + 1}: ${label}`}
                className={index <= scene ? styles.timelineActive : undefined}
                key={label}
                onClick={() => {
                  setScene(index);
                  setIsPlaying(false);
                }}
                type="button"
              />
            ))}
          </div>

          <span aria-live="polite" className={styles.playerStatus}>
            {scene + 1} / {scenes.length} · 32 sec
          </span>
        </div>
      </div>
    );
  }

  return (
    <main className={styles.reelShell}>
      {reel}
    </main>
  );
}
