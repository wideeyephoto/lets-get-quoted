'use client';

import { useEffect, useRef } from 'react';

/**
 * Open a thread at the bottom, the way every phone does.
 *
 * The message list is a fixed-height scroller, so it was opening on the OLDEST
 * text in the conversation — which on a thread of any length means the first
 * thing you see is a text from three weeks ago and the reply you are answering
 * is somewhere below the fold. Nobody noticed because the demo threads are four
 * messages long and four messages fit.
 *
 * Jumped, not smooth-scrolled: this is where the thread was always supposed to
 * be, and animating to it makes the page look like it moved on its own.
 */
export default function ScrollToLatest({ threadKey }: { threadKey: string }) {
  const anchor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroller = anchor.current?.closest('.inbox-messages');
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
    // Keyed on the thread so switching conversations lands at the bottom of the
    // new one rather than holding the old one's scroll position.
  }, [threadKey]);

  return <div ref={anchor} aria-hidden="true" />;
}
