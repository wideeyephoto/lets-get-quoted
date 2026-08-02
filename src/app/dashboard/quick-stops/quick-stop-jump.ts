'use client';

// Moving around the Quick Stops page.
//
// Shared rather than duplicated because the header and the page footer both
// offer the same two jumps, and the "how it works" one is not a plain anchor —
// getting it subtly different in one of the two places is exactly the kind of
// thing nobody notices until a contractor clicks the wrong one.

/**
 * Jump to the pitch section.
 *
 * It cannot be an `href="#quick-stop-earn-more"`: once Quick Stops is switched
 * ON the explainer is folded into a closed `<details>`, and an anchor into a
 * collapsed element scrolls to a zero-height box. So open the drawer first,
 * then scroll on the next frame, once it has laid out.
 */
export function jumpToHowItWorks() {
  const drawer = document.getElementById('quick-stop-how');
  if (drawer instanceof HTMLDetailsElement) drawer.open = true;
  requestAnimationFrame(() => {
    document.getElementById('quick-stop-earn-more')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

/** Jump to the settings block. A plain anchor — it is never inside a drawer. */
export function jumpToSetup() {
  document.getElementById('quick-stop-setup')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
