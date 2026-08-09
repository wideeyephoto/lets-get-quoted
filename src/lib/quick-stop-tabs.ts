/**
 * The three tabs of the Quick Stops page, and which anchors belong to Settings.
 *
 * Pure and separate from the tab component so the deep-link rule can be tested
 * without a DOM, and so the server page can normalise `?tab=` with the same
 * list the client renders from. A dead anchor is invisible in a browser and
 * invisible in a test unless something like this is asserted against.
 */

export type QuickStopTabId = 'today' | 'settings' | 'insights';

export const QUICK_STOP_TABS: ReadonlyArray<{ id: QuickStopTabId; label: string; hint: string }> = [
  { id: 'today', label: 'Today', hint: 'Status, route and requests' },
  { id: 'settings', label: 'Settings', hint: 'Work, hours, distance, prices' },
  { id: 'insights', label: 'Insights', hint: 'Results and possible work' },
] as const;

/**
 * Section ids that live on the Settings tab.
 *
 * Five places in the app link into these, including Settings' own automations
 * card and the status block's "Review settings" button. Today is the default
 * tab, so without this every one of them would land on Today and scroll to
 * nothing — the whole page would look like the link was broken.
 *
 * `quick-stop-setup` is the configurator's own id and the one most of those
 * links use; the rest are its five drawers.
 */
export const QUICK_STOP_SETTINGS_ANCHORS = [
  'quick-stop-setup',
  'quick-stop-work',
  'quick-stop-when',
  'quick-stop-far',
  'quick-stop-price',
  'quick-stop-areas',
] as const;

export function isQuickStopSettingsAnchor(rawHash: string | null | undefined): boolean {
  const hash = (rawHash || '').replace(/^#/, '');
  if (!hash) return false;
  return (QUICK_STOP_SETTINGS_ANCHORS as readonly string[]).includes(hash);
}

/** Anything unrecognised opens Today — the tab an owner wants nine visits in ten. */
export function normalizeQuickStopTab(value: string | null | undefined): QuickStopTabId {
  return QUICK_STOP_TABS.some((tab) => tab.id === value) ? (value as QuickStopTabId) : 'today';
}
