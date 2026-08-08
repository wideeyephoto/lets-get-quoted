'use client';

import { useEffect, type RefObject } from 'react';

/**
 * What a real dialog owes the person using it.
 *
 * The schedule page has two overlays — the job actions panel and, on anything
 * narrower than a desktop, the unscheduled queue. Both used to be a div with an
 * onClick backdrop: no role, no focus management, no Escape, and a page behind
 * them that still took Tab. A keyboard user opening the job panel landed nowhere
 * and tabbed straight out of it into the calendar underneath.
 *
 * ONE HOOK RATHER THAN TWO IMPLEMENTATIONS, because the two overlays must also
 * agree with each other: only one may be open at a time, and whichever is open
 * marks the document so the other can stand down (see BODY_FLAG). That
 * bookkeeping is the sort of thing that drifts the moment it is written twice.
 *
 * THE KEYDOWN TRAP IS NOT ENOUGH ON ITS OWN, and that was the gap.
 *
 * Trapping Tab keeps a KEYBOARD user inside the dialog. It does nothing for a
 * screen reader in browse mode, which walks the accessibility tree rather than
 * the tab order and could still read the whole calendar underneath an open job
 * panel — with no indication that any of it was unreachable.
 *
 * So the trap now has a partner: everything outside the overlay is marked
 * `inert` while it is open, which takes it out of the tab order AND out of the
 * accessibility tree in one attribute, and is restored on close. This is the
 * standard walk — from the overlay up to <body>, marking each level's other
 * children — rather than aria-hidden on a hardcoded list of containers, which
 * is the version that goes stale the first time the page gains a section.
 *
 * A note on where the walk starts: the OVERLAY is the panel's PARENT, not the
 * panel. Both overlays put a click-to-close backdrop beside the panel, and
 * marking that inert would kill the click.
 */

/** Set while any schedule overlay is open. CSS uses it to stand the others down. */
export const BODY_FLAG = 'scheduleOverlay';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusable(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) => element.offsetWidth > 0 || element.offsetHeight > 0 || element === document.activeElement,
  );
}

/**
 * Everything that is not the overlay, made unreachable.
 *
 * Walks from the overlay to <body>, marking each level's OTHER children. That
 * covers a dialog portalled to body and one that lives inside the page tree
 * with equal correctness, which matters because this page has one of each.
 *
 * `inert` already implies removal from the accessibility tree; aria-hidden
 * rides along for the handful of assistive technologies that support one and
 * not the other. Anything already inert for its own reasons is skipped and left
 * alone, so restoring cannot switch something back on that was off before.
 */
function inertOutside(overlay: HTMLElement): () => void {
  const marked: HTMLElement[] = [];
  let node: HTMLElement = overlay;

  while (node.parentElement) {
    const parent: HTMLElement = node.parentElement;
    for (const child of Array.from(parent.children)) {
      if (child === node || !(child instanceof HTMLElement)) continue;
      if (child.hasAttribute('inert')) continue;
      child.setAttribute('inert', '');
      child.setAttribute('aria-hidden', 'true');
      marked.push(child);
    }
    if (parent === document.body) break;
    node = parent;
  }

  return () => {
    for (const element of marked) {
      element.removeAttribute('inert');
      element.removeAttribute('aria-hidden');
    }
  };
}

export function useModal(
  open: boolean,
  panelRef: RefObject<HTMLElement>,
  onClose: () => void,
  /** Which overlay this is. Written to the body so CSS can tell them apart. */
  kind: string,
) {
  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    // Where focus came from, so it can go back. Reading it here rather than on
    // close: by then the trigger may have been re-rendered away.
    const opener = document.activeElement as HTMLElement | null;

    document.body.dataset[BODY_FLAG] = kind;
    // The page behind must not scroll under the overlay — on a phone that reads
    // as the dialog sliding off its own content.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus the panel itself rather than its first control: a dialog that opens
    // with the cursor already in a date field has silently decided what you came
    // to do, and a screen reader announces the field instead of the dialog.
    const focusTimer = window.setTimeout(() => {
      if (!panel) return;
      (panel.querySelector<HTMLElement>('[data-autofocus]') ?? panel).focus({ preventScroll: true });
    }, 0);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;

      const items = focusable(panel);
      if (items.length === 0) {
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;

      // Wrapping both ways, and catching the case where focus has escaped the
      // panel entirely (a click on the backdrop leaves it on <body>).
      if (event.shiftKey && (active === first || active === panel || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);

    // The panel's parent is the overlay — the backdrop, or the fixed wrapper
    // that holds both the scrim and the panel. Marking from the panel itself
    // would make the click-to-close backdrop inert, which is the one part of
    // the overlay that must keep taking pointer events.
    const restore = panel?.parentElement ? inertOutside(panel.parentElement) : () => {};

    return () => {
      window.clearTimeout(focusTimer);
      restore();
      document.removeEventListener('keydown', onKeyDown, true);
      delete document.body.dataset[BODY_FLAG];
      document.body.style.overflow = previousOverflow;
      // Only take focus back if it is still loose inside the panel we are
      // closing — if something else has claimed it since, stealing it is worse.
      if (opener && document.body.contains(opener)) {
        const active = document.activeElement;
        if (!active || active === document.body || panel?.contains(active)) {
          opener.focus({ preventScroll: true });
        }
      }
    };
  }, [open, panelRef, onClose, kind]);
}
