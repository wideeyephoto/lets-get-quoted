'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The product tour, across the middle of /features.
 *
 * WHY A COMPONENT AND NOT MARKUP ON THE PAGE. Everything difficult here is
 * behavioural: the 2.4MB must not be fetched by somebody who never scrolls this
 * far, it must not start for somebody who has asked their browser for less
 * motion or less data, it must stop when it leaves the screen or the tab goes
 * to the background, and whatever it decides has to be overridable by a button.
 * That is a state machine, and it belongs in one file with the reasons written
 * next to it.
 *
 * TWO SOURCES, WEBM FIRST. 1.4MB of VP9 against 2.4MB of H.264 — a browser that
 * understands the first never downloads the second, and one that does not falls
 * through to it. Both are held back behind `data-src` until the section is
 * within a screen, because <source src> is fetched by the element as soon as it
 * has one; swapping them in and calling load() is the documented way to say
 * "now".
 *
 * WHAT IT IS NOT. Not a customer, not a result, not a claim. It is a recording
 * of the dashboard, and the caption says exactly that.
 */

const BASE = '/videos/lets-get-quoted-hero-video-paced';
/** The capture's real pixel size. Fixes the box's shape before it loads. */
const WIDTH = 1280;
const HEIGHT = 720;

export default function ProductTour() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  /** The section has come within a screen. Gates the sources — nobody who
   *  never scrolls here pays for the file. Latches on. */
  const [near, setNear] = useState(false);
  /** The section is actually on screen. Unlatches — this is what pauses. */
  const [onScreen, setOnScreen] = useState(false);
  /** Answered on the client only; the server cannot know. The first render is
   *  therefore always the not-allowed state, and hydration has nothing to
   *  disagree about. The poster shows either way, so there is no flash. */
  const [autoAllowed, setAutoAllowed] = useState(false);
  /** 'auto' defers to the browser's stated preferences; the other two are the
   *  visitor pressing the button, which outranks them in both directions. */
  const [intent, setIntent] = useState<'auto' | 'play' | 'pause'>('auto');
  /** Mirrors the element rather than our wish for it: an autoplay a browser
   *  refuses must not leave the button saying "Pause". */
  const [playing, setPlaying] = useState(false);

  // Three separate ways to say no, and any one of them is enough: less motion,
  // less data, and the Save-Data header a phone sets when data saving is on.
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    // Not shipped by every browser. An unsupported query never matches, which
    // is the right default: absence of a preference is not a preference.
    const data = window.matchMedia('(prefers-reduced-data: reduce)');
    const decide = () => {
      const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
      setAutoAllowed(!motion.matches && !data.matches && conn?.saveData !== true);
    };
    decide();
    motion.addEventListener('change', decide);
    data.addEventListener('change', decide);
    return () => {
      motion.removeEventListener('change', decide);
      data.removeEventListener('change', decide);
    };
  }, []);

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
      { rootMargin: '300px 0px' },
    );
    const here = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), {
      threshold: 0.2,
    });
    ahead.observe(node);
    here.observe(node);
    return () => {
      ahead.disconnect();
      here.disconnect();
    };
  }, []);

  // A backgrounded tab is not "on screen" in any sense a visitor cares about,
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

  /**
   * The sources are attached exactly once, when the section is first approached.
   *
   * <source src> is fetched by the element the moment it has one, so the URLs
   * live in data-src until here. Setting them and calling load() is what tells
   * the browser to pick one and start; without the load() the element keeps
   * showing the poster and never notices the sources changed.
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !near) return;
    let attached = false;
    for (const source of Array.from(video.querySelectorAll('source'))) {
      if (!source.src && source.dataset.src) {
        source.src = source.dataset.src;
        attached = true;
      }
    }
    if (attached) video.load();
  }, [near]);

  const wantsPlay = intent === 'play' || (intent === 'auto' && autoAllowed);
  const shouldPlay = wantsPlay && near && onScreen;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (shouldPlay) {
      // A refusal is normal — a browser may decline for reasons of its own, and
      // the poster and the button both still work when it does.
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [shouldPlay]);

  const toggle = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) {
      setIntent('pause');
      video.pause();
      return;
    }
    setIntent('play');
    // Pressing play before the section was ever approached has to attach the
    // sources itself, or there is nothing to play.
    if (!near) setNear(true);
    video.play().catch(() => {});
  }, [playing, near]);

  return (
    <section className="tour-band" id="tour" aria-labelledby="tour-title" ref={sectionRef}>
      <h2 className="sr-only" id="tour-title">
        A walkthrough of the full customer and contractor journey
      </h2>
      <div className="tour-frame">
        <video
          className="tour-video"
          ref={videoRef}
          poster={`${BASE}-poster.jpg`}
          width={WIDTH}
          height={HEIGHT}
          aria-label="A screen recording of the full Let’s Get Quoted journey: a homeowner submits an emergency plumbing leak with an attached photo, AI analyzes the scope, the contractor prepares and sends a quote, the customer approves and pays online, the job is completed, and revenue insights update."
          muted
          loop
          playsInline
          // Never "auto", and never "metadata" either: the sources are not even
          // attached until the section is approached, so this only describes
          // what happens after they are.
          preload="none"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        >
          {/* WebM first: 1.4MB against 2.4MB, and a browser that understands it
              never asks for the other one. */}
          <source data-src={`${BASE}.webm`} type="video/webm" />
          <source data-src={`${BASE}.mp4`} type="video/mp4" />
        </video>

        <button type="button" className="tour-play" onClick={toggle}>
          <span aria-hidden="true" data-icon={playing ? 'pause' : 'play'} />
          {playing ? 'Pause' : 'Play'}
          <span className="sr-only"> the full tour recording</span>
        </button>
      </div>
      <p className="tour-note">
        The full customer and job journey, recorded as it is. The business on it is a demo account (Broke Pipes Plumbing) — the numbers are
        invented and the software around them is not.
      </p>
    </section>
  );
}
