'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

type FloatingPanelProps = {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  className?: string;
  width?: number;
  children: ReactNode;
};

type Placement = { left: number; width: number; top?: number; bottom?: number; maxHeight: number };

// Renders a popup (calendar/time list) into document.body, positioned next to an
// anchor with fixed coords. This escapes any scrolling/overflow ancestor (the
// schedule modal, day-card grids), so the popup floats over everything instead
// of being clipped and forcing the container to scroll. Flips above the anchor
// when there's more room there. Closes on outside click / Escape.
export default function FloatingPanel({ anchorRef, open, onClose, className, width, children }: FloatingPanelProps) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);

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
    <div ref={panelRef} className={className} style={style}>
      {children}
    </div>,
    document.body
  );
}
