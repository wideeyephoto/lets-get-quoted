'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  hasSignedEnough,
  SIGNATURE_ASPECT,
  strokesToPath,
  type SignatureStroke,
} from '@/lib/signature';

/**
 * Signing with a finger.
 *
 * POINTER EVENTS, NOT TOUCH EVENTS. One code path covers a thumb, a mouse, an
 * Apple Pencil and a Surface pen, and `setPointerCapture` means a stroke that
 * leaves the pad still belongs to the pad — without it, signing off the right
 * edge drops the stroke mid-letter and the mark ends up chopped.
 *
 * `touch-action: none` on the canvas is the other half of that and is set in
 * CSS rather than here: without it the browser claims the gesture for scrolling
 * and the first downstroke of every signature scrolls the page instead.
 *
 * WHAT IT KEEPS. Strokes in units of the pad's own width — never device pixels
 * — so a rotation, a resize or a redraw at any scale reproduces the same mark.
 * See @/lib/signature for why the stored form is path data rather than a PNG.
 *
 * NOT KEYBOARD-OPERABLE, and nothing can make a drawing surface so. That is
 * exactly why the caller must offer typing as a real, equal alternative rather
 * than as a fallback buried behind this — see QuoteAcceptance.
 */
export default function SignaturePad({
  onChange,
  label = 'Sign here',
  hint = 'Use your finger, a stylus, or your mouse.',
}: {
  /** Path data when there is enough of a mark, null when there is not. */
  onChange: (path: string | null) => void;
  label?: string;
  hint?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<SignatureStroke[]>([]);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  /** Repaint every stroke at the canvas's current size. */
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    // Retina and everything above it. Without this the mark is the soft,
    // half-resolution line that reads as a scan of a signature rather than one.
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.lineWidth = Math.max(1.8, width * 0.005);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    // The ink follows the page's own text color, so the pad reads correctly in
    // both themes without being told which one it is in.
    context.strokeStyle = getComputedStyle(canvas).color;

    for (const stroke of strokes.current) {
      if (stroke.length === 0) continue;
      context.beginPath();
      if (stroke.length === 1) {
        context.arc(stroke[0].x * width, stroke[0].y * width, context.lineWidth / 2, 0, Math.PI * 2);
        context.fillStyle = context.strokeStyle;
        context.fill();
        continue;
      }
      context.moveTo(stroke[0].x * width, stroke[0].y * width);
      for (let i = 1; i < stroke.length - 1; i += 1) {
        const midX = ((stroke[i].x + stroke[i + 1].x) / 2) * width;
        const midY = ((stroke[i].y + stroke[i + 1].y) / 2) * width;
        context.quadraticCurveTo(stroke[i].x * width, stroke[i].y * width, midX, midY);
      }
      const last = stroke[stroke.length - 1];
      context.lineTo(last.x * width, last.y * width);
      context.stroke();
    }
  }, []);

  useEffect(() => {
    redraw();
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => redraw());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [redraw]);

  const publish = useCallback(() => {
    const enough = hasSignedEnough(strokes.current);
    setHasInk(strokes.current.length > 0);
    onChange(enough ? strokesToPath(strokes.current) : null);
  }, [onChange]);

  function pointFrom(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    // Divided by width for BOTH axes on purpose: the pad has a fixed aspect
    // ratio, so one scale keeps the mark's proportions at any size.
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.width };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    // A stray second finger during a two-finger scroll would otherwise draw.
    if (!event.isPrimary) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    strokes.current = [...strokes.current, [pointFrom(event)]];
    redraw();
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !event.isPrimary) return;
    const stroke = strokes.current[strokes.current.length - 1];
    if (!stroke) return;
    const point = pointFrom(event);
    const previous = stroke[stroke.length - 1];
    // Drop samples the pen barely moved for: they add path data and nothing
    // visible, and a phone can emit a great many of them.
    if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 0.004) return;
    stroke.push(point);
    redraw();
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    publish();
  }

  function clear() {
    strokes.current = [];
    redraw();
    publish();
  }

  function undo() {
    strokes.current = strokes.current.slice(0, -1);
    redraw();
    publish();
  }

  return (
    <div className="sigpad">
      <div className="sigpad-head">
        <span className="sigpad-label" id="sigpad-label">{label}</span>
        <span className="sigpad-tools">
          <button type="button" className="linklike" onClick={undo} disabled={!hasInk}>Undo</button>
          <button type="button" className="linklike" onClick={clear} disabled={!hasInk}>Clear</button>
        </span>
      </div>

      <div className="sigpad-surface" style={{ aspectRatio: String(SIGNATURE_ASPECT) }}>
        <canvas
          ref={canvasRef}
          className="sigpad-canvas"
          aria-labelledby="sigpad-label"
          role="img"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
        />
        {/* The line people sign on. Hidden from assistive tech and from the
            pointer — it is a place to aim, not a control. */}
        <span className="sigpad-rule" aria-hidden="true" />
        {!hasInk ? <span className="sigpad-ghost" aria-hidden="true">✍︎</span> : null}
      </div>

      <p className="sigpad-hint">{hint}</p>
    </div>
  );
}
