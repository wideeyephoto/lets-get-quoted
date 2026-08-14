'use client';

import { useEffect, useRef } from 'react';
import styles from './quotes.module.css';

/**
 * THE STEP 2 RECORDING, PLAYING BY ITSELF.
 *
 * It is three seconds of the preview panel with one add-on being taken, and the
 * point of it is the total moving. Behind a play button that point only lands
 * for the fraction of visitors who press it, so it runs on its own and loops.
 *
 * WHY IT IS NOT JUST `autoPlay` ON THE TAG. Two things the attribute cannot do:
 *
 *  - It starts on LOAD, not on arrival. This section sits well down the page,
 *    and the file is 400KB. The attribute spends that on every visitor to the
 *    page, including the ones who never scroll to it. Here nothing is fetched
 *    until the panel is actually on screen.
 *  - It ignores `prefers-reduced-motion`. A three-second clip set to loop is
 *    motion that never stops, which is exactly what that preference is about.
 *    Someone who has asked for stillness gets the poster and the controls, and
 *    the clip plays if they press it.
 *
 * The visitor's own pause outranks all of it: press pause and nothing in here
 * starts it again, however many times the section scrolls past. `controls`
 * stays on the element for that reason as much as any other — WCAG 2.2.2 wants
 * a way to stop motion that starts on its own and outlasts five seconds, and a
 * loop outlasts everything.
 */

export default function ShotVideo({
  src,
  poster,
  width,
  height,
  label,
}: {
  src: string;
  poster: string;
  width: number;
  height: number;
  /** What is happening in the clip, for somebody who cannot see it. */
  label: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    /** Set once the visitor pauses it themselves. Never cleared. */
    let surrendered = false;
    /**
     * Distinguishes our pause from theirs.
     *
     * `pause()` queues its event rather than firing it inline, so a flag set
     * around the call is already back to false by the time the handler reads
     * it. The handler clears it instead — and we only ever pause a video that
     * is playing, so the flag cannot be left standing to swallow the visitor's
     * next press.
     */
    let selfPause = false;

    const onPause = () => {
      if (selfPause) {
        selfPause = false;
        return;
      }
      surrendered = true;
    };
    video.addEventListener('pause', onPause);

    const hold = () => {
      if (video.paused) return;
      selfPause = true;
      video.pause();
    };
    const resume = () => {
      if (surrendered || document.hidden || !onScreen) return;
      // The tag ships preload="none" so the load costs nothing until now.
      video.preload = 'auto';
      // Rejects where a policy refuses muted autoplay; the poster and the
      // controls are already the answer to that.
      void video.play().catch(() => {});
    };

    let onScreen = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        if (onScreen) resume();
        else hold();
      },
      { threshold: 0.4 },
    );
    observer.observe(video);

    // A loop running in a background tab is decoding for nobody.
    const onVisibility = () => {
      if (document.hidden) hold();
      else resume();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      video.removeEventListener('pause', onPause);
    };
  }, []);

  return (
    <video
      ref={ref}
      className={styles.shotVideo}
      src={src}
      poster={poster}
      width={width}
      height={height}
      aria-label={label}
      /* The pause mechanism, and the way in for anyone whose browser refuses
         to start it or who asked for no motion. */
      controls
      /* Muted is what makes unprompted playback legal in the first place, and
         playsInline is what stops iOS taking it fullscreen when it starts. */
      muted
      loop
      playsInline
      preload="none"
    />
  );
}
