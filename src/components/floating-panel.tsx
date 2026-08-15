'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

type FloatingPanelProps = {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  className?: string;
  width?: number;
  /**
   * So the trigger can name this panel in aria-controls. It matters more here
   * than for a popup that renders next to its button: this one is portaled to
   * the end of <body>, so nothing about the document's order says the two are
   * related, and the attribute is the only thing that does.
   */
  id?: string;
  /**
   * What this panel IS, and what to call it. Optional because two callers put
   * the role on their own inner element (the calendar's view menu), and two
   * roles nested is worse than one.
   */
  role?: 'dialog' | 'menu' | 'group' | 'listbox';
  label?: string;
  children: ReactNode;
};

type Placement = { left: number; width: number; top?: number; bottom?: number; maxHeight: number };

// Renders a popup (calendar/time list) into document.body, positioned next to an
// anchor with fixed coords. This escapes any scrolling/overflow ancestor (the
// schedule modal, day-card grids), so the popup floats over everything instead
// of being clipped and forcing the container to scroll. Flips above the anchor
// when there's more room there. Closes on outside click / Escape.
export default function FloatingPanel({ anchorRef, open, onClose, className, width, id, role, label, children }: FloatingPanelProps) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  // One focus move per opening, not one per placement recalculation — `place`
  // re-runs on every scroll and resize while the panel is open.
  const movedFocus = useRef(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }
    function place() {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const margin = 8;
      const w = Math.min(width ?? rect.width, window.innerWidth - margin * 2);
      let left = Math.min(rect.left, window.innerWidth - w - margin);
      left = Math.max(margin, left);
      const spaceBelow = window.innerHeight - rect.bottom - margin;
      const spaceAbove = rect.top - margin;
      if (spaceBelow >= 240 || spaceBelow >= spaceAbove) {
        setPlacement({ left, width: w, top: rect.bottom + margin, maxHeight: spaceBelow });
      } else {
        setPlacement({ left, width: w, bottom: window.innerHeight - rect.top + margin, maxHeight: spaceAbove });
      }
    }
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, anchorRef, width]);

  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, anchorRef, onClose]);

  /**
   * FOCUS, WHICH IS THE WHOLE REASON A PORTAL NEEDS MINDING.
   *
   * This panel renders into document.body, so it is the LAST thing in the
   * document no matter where its trigger sits. Tab from the button that opened
   * it therefore walks the entire rest of the page before arriving — the
   * calendar was reachable and unreachable in the same sense a menu with no
   * keyboard handler is. So opening moves focus in.
   *
   * Waits for `placement`, because until it resolves the panel is rendered at
   * -9999 with visibility:hidden, and a hidden element cannot take focus — the
   * call silently does nothing and focus stays on the trigger.
   */
  useEffect(() => {
    if (!open) { movedFocus.current = false; return; }
    if (!placement || movedFocus.current) return;
    const node = panelRef.current;
    if (!node) return;
    movedFocus.current = true;
    const first = node.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    (first ?? node).focus();
  }, [open, placement]);

  /**
   * And handing it back. Closing by choosing something — a date, a time slot —
   * destroys the button that was focused, and focus lands on <body>: a keyboard
   * user is dropped at the top of the document every time they pick a date.
   *
   * The condition is what keeps this from being obnoxious. Focus returns only
   * when it was inside the panel (or has already been orphaned onto body),
   * which covers Escape and selection. Clicking some other control leaves focus
   * on that control, and this does not yank it away.
   */
  useEffect(() => {
    if (!open) return;
    const node = panelRef.current;
    return () => {
      const active = document.activeElement;
      const wasInside = !active || active === document.body || (node?.contains(active) ?? false);
      if (wasInside) anchorRef.current?.focus();
    };
  }, [open, anchorRef]);

  if (!mounted || !open) return null;

  const style: CSSProperties = placement
    ? {
        position: 'fixed',
        left: placement.left,
        right: 'auto',
        width: placement.width,
        // Emit 'auto' rather than undefined so the panel class's own
        // top/left (e.g. .modern-calendar-panel { top: calc(100% + .5rem) })
        // can't leak through in the flip-above case and push us off-screen.
        top: placement.top ?? 'auto',
        bottom: placement.bottom ?? 'auto',
        maxHeight: placement.maxHeight,
        overflowY: 'auto',
        zIndex: 200,
      }
    : { position: 'fixed', top: -9999, left: -9999, visibility: 'hidden' };

  return createPortal(
    // tabIndex -1 so the panel itself can take focus when it holds no control
    // of its own to give it to.
    <div ref={panelRef} id={id} className={className} style={style} role={role} aria-label={label} tabIndex={-1}>
      {children}
    </div>,
    document.body
  );
}
