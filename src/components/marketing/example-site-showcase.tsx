/* eslint-disable @next/next/no-img-element */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './example-site-showcase.module.css';

/**
 * A real published site, shown scrolling, in the frame it was captured in.
 *
 * WHY A COMPONENT AND NOT MARKUP ON THE PAGE. Everything hard here is
 * behavioural, not visual: exactly one video may exist at a time, it must stop
 * downloading when it stops being the selected one, it must not start at all
 * for somebody who has asked their browser for less motion or less data, and it
 * must stop when it scrolls out of view. That is a state machine, and it wants
 * to be in one file with the reasons written next to it.
 *
 * WHAT THIS IS NOT. It is not a case study and it does not say a customer said
 * anything. Lawn & Order is an example site built with the product, described
 * as exactly that. No performance claim, no testimonial, no logo wall — none of
 * which we have the evidence for.
 *
 * ONE VIDEO, NOT TWO HIDDEN BEHIND EACH OTHER. The unselected tab panel is
 * empty. A `hidden` <video> still holds its src, and a browser is entitled to
 * keep pulling on it; the only way to be sure the visitor pays for one clip is
 * for one clip to exist. The cost is that switching restarts playback, which is
 * the behaviour the brief asks for anyway.
 */

export type ExampleSiteMode = 'desktop' | 'mobile';

type Media = {
  /** The switcher's label, and part of every control's accessible name. */
  tab: string;
  src: string;
  poster: string;
  /** The capture's real pixel size. Fixes the frame's shape before it loads. */
  width: number;
  height: number;
  /** What is on screen, for somebody who cannot see it. */
  alt: string;
};

const BASE = '/media/website-builder/lawn-and-order';

const MEDIA: Record<ExampleSiteMode, Media> = {
  desktop: {
    tab: 'Desktop',
    src: `${BASE}/lawn-and-order-desktop-scroll.mp4`,
    poster: `${BASE}/lawn-and-order-desktop-hero.jpg`,
    width: 1424,
    height: 890,
    alt: 'Lawn & Order landscaping website with an instant-estimate form.',
  },
  mobile: {
    tab: 'Mobile',
    src: `${BASE}/lawn-and-order-mobile-scroll.mp4`,
    poster: `${BASE}/lawn-and-order-mobile-hero.jpg`,
    width: 464,
    height: 968,
    alt: 'Mobile version of the Lawn & Order website and instant-estimate form.',
  },
};

const MODES: ExampleSiteMode[] = ['desktop', 'mobile'];

const SITE_URL = 'https://lawnandorder.letsgetquoted.com/';
const SITE_HOST = 'lawnandorder.letsgetquoted.com';

/** Below this the phone capture is the honest default — it is the shape the
 *  visitor is holding. */
const PHONE = '(max-width: 720px)';

/**
 * May this page start a video without being asked?
 *
 * Three separate ways to say no, and any one of them is enough: less motion,
 * less data, and the Save-Data header a phone sets when the owner has turned
 * data saving on. Answered on the client only — the server cannot know — so the
 * first render is always the not-allowed state and hydration has nothing to
 * disagree about. The poster is what shows either way, so there is no flash.
 */
function useAutoAllowed(): boolean {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    // Not shipped by every browser. An unsupported query simply never matches,
    // which is the right default: absence of a preference is not a preference.
    const data = window.matchMedia('(prefers-reduced-data: reduce)');
    const decide = () => {
      const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
      setAllowed(!motion.matches && !data.matches && conn?.saveData !== true);
    };
    decide();
    motion.addEventListener('change', decide);
    data.addEventListener('change', decide);
    return () => {
      motion.removeEventListener('change', decide);
      data.removeEventListener('change', decide);
    };
  }, []);

  return allowed;
}

export type ExampleSiteShowcaseProps = {
  eyebrow: string;
  title: React.ReactNode;
  body: React.ReactNode;
  linkLabel: string;
  /** The still that carries the section when the video is only decoration. */
  support: { src: string; alt: string; caption: React.ReactNode; label: string; width: number; height: number };
  id?: string;
};

export default function ExampleSiteShowcase({
  eyebrow,
  title,
  body,
  linkLabel,
  support,
  id = 'example-site',
}: ExampleSiteShowcaseProps) {
  const [mode, setMode] = useState<ExampleSiteMode>('desktop');
  /** Set the moment the visitor touches the switcher, and never cleared. After
   *  that the viewport does not get to overrule them. */
  const [picked, setPicked] = useState(false);
  /** The section has come within a screen of the viewport. Gates the src, so
   *  nobody who never scrolls this far pays for a 4MB clip. Latches on. */
  const [near, setNear] = useState(false);
  /** The section is actually on screen. Unlatches — this is what pauses. */
  const [onScreen, setOnScreen] = useState(false);
  /** 'auto' defers to the browser's stated preferences; the other two are the
   *  visitor pressing the button, which outranks them in both directions. */
  const [intent, setIntent] = useState<'auto' | 'play' | 'pause'>('auto');
  /** Mirrors the element, not our wish for it: an autoplay a browser refuses
   *  must not leave the button saying "Pause". */
  const [playing, setPlaying] = useState(false);

  const autoAllowed = useAutoAllowed();
  const sectionRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const media = MEDIA[mode];
  const wantsPlay = intent === 'play' || (intent === 'auto' && autoAllowed);
  const shouldPlay = wantsPlay && near && onScreen;

  // The phone default. Only ever applied while the visitor has not chosen, and
  // it listens rather than reading once, so rotating a tablet is honoured too.
  useEffect(() => {
    if (picked) return;
    const phone = window.matchMedia(PHONE);
    const decide = () => setMode(phone.matches ? 'mobile' : 'desktop');
    decide();
    phone.addEventListener('change', decide);
    return () => phone.removeEventListener('change', decide);
  }, [picked]);

  // Two thresholds, one observer each, because they answer different questions:
  // "is it worth downloading yet" wants a generous margin, and "is anybody
  // looking at it" wants none.
  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;
    if (!('IntersectionObserver' in window)) {
      setNear(true);
      setOnScreen(true);
      return;
    }
    const ahead = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNear(true);
          ahead.disconnect();
        }
      },
      { rootMargin: '400px 0px' },
    );
    const here = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), {
      threshold: 0.25,
    });
    ahead.observe(node);
    here.observe(node);
    return () => {
      ahead.disconnect();
      here.disconnect();
    };
  }, []);

  // A backgrounded tab is not "on screen" in any sense the visitor cares about,
  // and IntersectionObserver does not fire for it.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) setOnScreen(false);
      else if (sectionRef.current) {
        const box = sectionRef.current.getBoundingClientRect();
        setOnScreen(box.top < window.innerHeight && box.bottom > 0);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (shouldPlay) {
      // A refusal is normal — a browser may decline for reasons of its own, and
      // the poster and the play button both still work when it does.
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [shouldPlay, mode, near]);

  /**
   * Switching away really does stop the download.
   *
   * Pausing is not enough and unmounting is not reliably enough: a detached
   * media element can keep its connection open. Clearing the source and calling
   * load() is the documented way to tell the browser to abandon it. The
   * currentTime reset is what makes the next visit to this tab start at the
   * beginning rather than wherever it was abandoned.
   */
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      if (!video) return;
      video.pause();
      try {
        video.currentTime = 0;
      } catch {
        // Not seekable yet. It is being thrown away regardless.
      }
      video.removeAttribute('src');
      video.load();
    };
  }, [mode]);

  const choose = useCallback((next: ExampleSiteMode) => {
    setPicked(true);
    setMode(next);
    setPlaying(false);
  }, []);

  // Arrow keys move selection AND focus, which is what makes a tablist a
  // tablist rather than two buttons wearing the role.
  const onTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const current = MODES.indexOf(mode);
    let next = current;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (current + 1) % MODES.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (current - 1 + MODES.length) % MODES.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = MODES.length - 1;
    else return;
    event.preventDefault();
    choose(MODES[next]);
    tabRefs.current[next]?.focus();
  };

  const headingId = `${id}-title`;

  return (
    <section className={styles.band} id={id} aria-labelledby={headingId} ref={sectionRef}>
      <div className={styles.head}>
        <p className={styles.eyebrow}>
          <span aria-hidden="true">✦</span> {eyebrow}
        </p>
        <h2 id={headingId}>{title}</h2>
        <p className={styles.body}>{body}</p>
        <a className={styles.visit} href={SITE_URL} target="_blank" rel="noopener noreferrer">
          {linkLabel}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>

      <div className={styles.stageWrap}>
        {/* Tabs rather than a toggle: there are two panels and the control
            picks which one you are looking at, which is what the role means. */}
        <div
          className={styles.tabs}
          role="tablist"
          aria-label="Choose a screen size for the example site"
          onKeyDown={onTabKeyDown}
        >
          {MODES.map((option, index) => (
            <button
              key={option}
              type="button"
              role="tab"
              id={`${id}-tab-${option}`}
              aria-selected={mode === option}
              aria-controls={`${id}-panel-${option}`}
              // Roving tabindex — one stop for the whole group, then arrows.
              tabIndex={mode === option ? 0 : -1}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              className={styles.tab}
              data-on={mode === option ? 'true' : 'false'}
              onClick={() => choose(option)}
            >
              {MEDIA[option].tab}
            </button>
          ))}
        </div>

        {MODES.map((option) => (
          <div
            key={option}
            role="tabpanel"
            id={`${id}-panel-${option}`}
            aria-labelledby={`${id}-tab-${option}`}
            hidden={mode !== option}
            // A tab panel holding one focusable control does not need a tab stop
            // of its own; the control is reachable without it.
            className={styles.panel}
          >
            {mode === option ? (
              <div className={option === 'desktop' ? styles.browser : styles.phone}>
                {option === 'desktop' ? (
                  <div className={styles.browserBar}>
                    <span className={styles.dots} aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className={styles.url}>{SITE_HOST}</span>
                  </div>
                ) : (
                  <span className={styles.speaker} aria-hidden="true" />
                )}

                <div className={option === 'desktop' ? styles.stageDesktop : styles.stageMobile}>
                  {/* The still under the video, and the reason the frame is
                      never an empty box. loading="lazy" is what keeps it behind
                      the hero in the queue — <video poster> has no such control
                      and would be fetched at once. */}
                  <img
                    className={styles.still}
                    src={media.poster}
                    alt=""
                    aria-hidden="true"
                    width={media.width}
                    height={media.height}
                    loading="lazy"
                    decoding="async"
                    fetchPriority="low"
                  />
                  <video
                    ref={videoRef}
                    className={styles.video}
                    // Held back until the section is within a screen. Before
                    // that this is an empty element over the still above.
                    src={near ? media.src : undefined}
                    poster={near ? media.poster : undefined}
                    aria-label={media.alt}
                    muted
                    loop
                    playsInline
                    // Never "auto": whether it plays or waits, the file is
                    // fetched by play(). This only decides what is pulled down
                    // beforehand, and on a section nobody may reach that is the
                    // whole clip for nothing.
                    preload="metadata"
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                  />
                </div>

                <button
                  type="button"
                  className={styles.playBtn}
                  onClick={() => {
                    setIntent(playing ? 'pause' : 'play');
                    const video = videoRef.current;
                    if (video && playing) video.pause();
                    else video?.play().catch(() => {});
                  }}
                >
                  <span aria-hidden="true" data-icon={playing ? 'pause' : 'play'} />
                  {playing ? 'Pause' : 'Play'}
                  <span className="sr-only"> the {MEDIA[option].tab.toLowerCase()} walkthrough</span>
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {/* The still that does not move. Whatever a visitor's browser has decided
          about video, this is the part of the argument they still get. */}
      <figure className={styles.support}>
        <img
          className={styles.supportImg}
          src={support.src}
          alt={support.alt}
          width={support.width}
          height={support.height}
          loading="lazy"
          decoding="async"
          fetchPriority="low"
        />
        <figcaption className={styles.supportCopy}>
          <span className={styles.supportLabel}>{support.label}</span>
          <span>{support.caption}</span>
        </figcaption>
      </figure>
    </section>
  );
}
