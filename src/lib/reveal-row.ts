// Scroll a record's row into view and flash it, so clicking its pin on the map
// lands you on the thing you clicked rather than leaving you to find it.
//
// Shared by the leads and jobs pipelines: both draw the same map, and a pin
// should behave the same way on either.

export const REVEAL_FLASH_MS = 1500;

export function revealRow(elementId: string): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.getElementById(elementId);
  if (!el) return false;

  // 'center' rather than 'start': these lists sit below a map, and putting the
  // row at the very top of the viewport hides the context around it.
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Restart cleanly if the same pin is clicked twice — without removing it
  // first the class is already present and the animation never replays.
  el.classList.remove('row-revealed');
  void el.offsetWidth;
  el.classList.add('row-revealed');
  window.setTimeout(() => el.classList.remove('row-revealed'), REVEAL_FLASH_MS);
  return true;
}

/** `job-<uuid>` / `lead-<uuid>` — the id shape getMapPins mints. */
export function pinRecordId(pinId: string, kind: 'job' | 'lead'): string | null {
  const prefix = `${kind}-`;
  return pinId.startsWith(prefix) ? pinId.slice(prefix.length) : null;
}
