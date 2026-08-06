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
 */
export default function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [align, setAlign] = useState<'start' | 'end'>('start');
  const wrapRef = useRef<HTMLSpanElement>(null);
  const bubbleId = useId();

  // Which way the bubble opens. Measured from the icon rather than assumed,
  // because the same component is used in a one-column list and in the last
  // column of a four-across grid.
  function place() {
    const node = wrapRef.current;
    if (!node) return;
    const { left } = node.getBoundingClientRect();
    // 18rem is the bubble's max-width below; if that much space is not left to
    // the right of the icon, hang the bubble off its right edge instead.
    setAlign(left + 18 * 16 > window.innerWidth - 12 ? 'end' : 'start');
  }

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
      <span className="infotip-bubble" id={bubbleId} role="tooltip" data-open={open ? 'true' : 'false'}>
        {children}
      </span>
    </span>
  );
}
