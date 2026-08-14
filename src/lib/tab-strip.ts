/**
 * Arrow-key movement inside a tablist.
 *
 * WHY THIS IS NOT OPTIONAL ONCE A TAB STRIP USES A ROVING TABINDEX. The pattern
 * is `tabIndex={active ? 0 : -1}`, which gives the strip a single tab stop so
 * six tabs are not six Tab presses on the way to the content. The other half of
 * the pattern is that the arrows then move between them. Without it, tabIndex
 * -1 is simply "not reachable from the keyboard" — the strip goes from
 * needlessly slow to genuinely unusable, and every tab but the open one
 * disappears for anyone not holding a mouse.
 *
 * Three views shipped exactly that: Jobs, Leads and Clients all had the roving
 * tabindex in their Smoothie pane and no key handler anywhere near it.
 *
 * Pure and index-based so the wrap-around is tested once rather than written
 * out six times. QuickStopTabs is where the working version of this came from.
 */
export function nextTabIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  // A selection that is not in the list has no neighbours to move to. Returning
  // 0 here would look like a fix and would silently jump to the first tab on
  // any key press.
  if (current < 0 || current >= count) return null;
  // Both axes, because a tablist can be drawn as a column and the reading
  // direction is not something the strip gets to tell the user.
  if (key === 'ArrowRight' || key === 'ArrowDown') return (current + 1) % count;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (current - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}
