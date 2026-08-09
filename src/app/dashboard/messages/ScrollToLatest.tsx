'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';

/**
 * Open a thread at the bottom, the way every phone does.
 *
 * The message list is a scroller, so it was opening on the OLDEST text in the
 * conversation — which on a thread of any length means the first thing you see
 * is a text from three weeks ago and the reply you are answering is somewhere
 * below the fold. Nobody noticed because the demo threads are four messages
 * long and four messages fit.
 *
 * Jumped, not smooth-scrolled: this is where the thread was always supposed to
 * be, and animating to it makes the page look like it moved on its own.
 *
 * WHY THIS IS MORE THAN ONE LINE. Setting scrollTop once landed the thread at
 * the bottom on a full page load and left it at the top when the thread was
 * picked from the list — the case that matters, because on a phone that is the
 * ONLY way in. Three things break the single write:
 *
 *   1. On a phone the thread pane is `display: none` until the conversation is
 *      chosen. A hidden element has no scrollHeight, so the write happened
 *      against zero. Hence useLayoutEffect: it runs after the class that
 *      reveals the pane is in the DOM and reading scrollHeight forces the
 *      layout, so the number is real.
 *   2. Photos are `loading="lazy"` and arrive after layout. Each one that
 *      decodes pushes the newest message further down, past where we just
 *      scrolled to.
 *   3. Web fonts reflow the whole thread once, late.
 *
 * So it pins, and keeps pinning until the reader takes over — scrolling up to
 * read back clears the flag and nothing yanks them down again.
 */

// Client components still render on the server, where useLayoutEffect warns.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

// Within this many pixels of the end counts as "still at the bottom". A couple
// of pixels of sub-pixel rounding is not the reader scrolling away.
const AT_BOTTOM_SLACK = 48;

export default function ScrollToLatest({ threadKey }: { threadKey: string }) {
  const anchor = useRef<HTMLDivElement>(null);

  useIsomorphicLayoutEffect(() => {
    const scroller = anchor.current?.closest('.inbox-messages') as HTMLElement | null;
    if (!scroller) return;

    let stick = true;
    const pin = () => {
      if (stick) scroller.scrollTop = scroller.scrollHeight;
    };

    pin();
    const frame = requestAnimationFrame(pin);

    const onScroll = () => {
      stick = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= AT_BOTTOM_SLACK;
    };
    // `load` does not bubble, so this listens in the capture phase — that is
    // how one handler covers every photo in the thread.
    const onLoad = () => pin();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    scroller.addEventListener('load', onLoad, true);

    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener('scroll', onScroll);
      scroller.removeEventListener('load', onLoad, true);
    };
    // Keyed on the thread so switching conversations lands at the bottom of the
    // new one rather than holding the old one's scroll position.
  }, [threadKey]);

  return <div ref={anchor} aria-hidden="true" />;
}
