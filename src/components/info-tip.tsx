'use client';

import { useEffect, useId, useRef, useState } from 'react';

/**
 * The small ⓘ that carries a sentence the card no longer has to spend a line on.
 *
 * WHY IT IS A BUTTON. A `title` attribute would be less code and is what the
 * crew initials used, but it never appears on touch, waits about a second on
 * desktop, and cannot be reached from the keyboard. This opens on hover, on
 * focus and on tap, which is three ways in rather than one and a half.
 *
 * WHY IT SITS NEXT TO THE LABEL. Pinned to the far edge of a card, the icon is
 * an orphan — you have to guess what it annotates. Immediately after the words
 * it explains, it is unambiguous, and the reading order matches the tab order.
 *
 * THE BUBBLE MUST NOT COVER THE THING IT EXPLAINS. It opens BELOW the icon, so
 * the value and the action above it stay readable while you read the
 * explanation, and it flips its horizontal alignment near a viewport edge — see
 * the measurement in `place()`. Without that, every icon in the right-hand
 * column of a metric grid opens a bubble that is half off-screen.
 *
 * WHY IT MEASURES BEFORE ANYONE TOUCHES IT. A closed bubble is `visibility:
 * hidden`, not `display: none`, so it still occupies layout and still counts
 * toward the document's scrollable width. `place()` used to run only on hover,
 * focus and tap, which left every bubble left-aligned until first contact — and
 * on a 375px phone the dashboard's metric tips stuck out to 551px and put a
 * horizontal scrollbar on a page nobody had interacted with yet.
 */
export default function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [align, setAlign] = useState<'start' | 'end'>('start');
  // Null until measured, so the server render and the first client render agree
  // and CSS keeps its own default.
  const [maxWidth, setMaxWidth] = useState<number | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const bubbleId = useId();

  // Which way the bubble opens, and how wide it may be. Measured from the icon
  // rather than assumed, because the same component is used in a one-column
  // list and in the last column of a four-across grid.
  function place() {
    const node = wrapRef.current;
    if (!node) return;
    const { left, right } = node.getBoundingClientRect();
    const GUTTER = 12;
    const IDEAL = 18 * 16; // .infotip-bubble's max-width in CSS.
    // Hanging off the icon's LEFT edge, the bubble grows rightward; off its
    // RIGHT edge, leftward. Take whichever side has room, preferring the
    // reading direction when both do.
    const roomRight = window.innerWidth - left - GUTTER;
    const roomLeft = right - GUTTER;
    const next = roomRight >= IDEAL || roomRight >= roomLeft ? 'start' : 'end';
    setAlign(next);
    // Flipping alone is not enough: on a narrow screen the far side can be
    // shorter than the bubble too, and it would then hang off the OTHER edge.
    // Never below 9rem, or the text becomes a column of single words.
    setMaxWidth(Math.max(9 * 16, Math.min(IDEAL, next === 'start' ? roomRight : roomLeft)));
  }

  // On mount and on resize, not just on interaction — see the note above about
  // hidden bubbles still counting toward page width.
  useEffect(() => {
    place();
    const onResize = () => place();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Tap elsewhere closes it. Pointerdown rather than click so it closes on the
  // press that begins a scroll, and capture so a tap on another InfoTip closes
  // this one before that one opens.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span className="infotip" ref={wrapRef} data-align={align}>
      <button
        type="button"
        className="infotip-btn"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? bubbleId : undefined}
        onClick={() => {
          place();
          setOpen((was) => !was);
        }}
        onPointerEnter={place}
        onFocus={place}
        // The wrapper carries :hover and :focus-within in CSS, so hover and
        // keyboard focus need no state at all — this only handles tap, which
        // has to latch.
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          {/* The same glyph as the booking icons' `info`. */}
          <circle cx="12" cy="12" r="9" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
      </button>
      <span
        className="infotip-bubble"
        id={bubbleId}
        role="tooltip"
        data-open={open ? 'true' : 'false'}
        style={maxWidth === null ? undefined : { maxWidth: `${Math.round(maxWidth)}px` }}
      >
        {children}
      </span>
    </span>
  );
}
