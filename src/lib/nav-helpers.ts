// Small pure helpers behind two bits of navigation UI, extracted so they can be
// unit-tested without a DOM: the settings tab a URL hash resolves to, and
// whether a create form (jobs / leads) should start open.

export type TabAnchors = { id: string; anchors?: string[] };

/**
 * The id of the tab that owns a URL hash — either the hash equals the tab's own
 * id, or it's listed among the tab's `anchors` (the section ids it contains).
 * Returns null for an empty or unrecognized hash. A leading '#' is optional.
 */
export function resolveTabForHash(tabs: TabAnchors[], rawHash: string | null | undefined): string | null {
  const hash = (rawHash || '').replace(/^#/, '');
  if (!hash) return null;
  const owner = tabs.find((tab) => tab.id === hash || (tab.anchors ?? []).includes(hash));
  return owner ? owner.id : null;
}

/**
 * How a link elsewhere in the app asks the Settings page to open a tab.
 *
 * A plain `#hash` link cannot do it, and the reason is not obvious: Next's
 * <Link> navigates with history.pushState, which does NOT fire `hashchange`. So
 * a sidebar link to /dashboard/settings#automations switched the tab when you
 * arrived from another page (fresh mount, hash read once) and did nothing at all
 * when you were already on Settings. Worse, clicking a tab writes its id into
 * the hash via replaceState — so once you had opened Automations, the URL
 * already said #automations and the link produced no URL change whatsoever.
 *
 * The event carries the intent explicitly instead of hoping a URL change is
 * observable.
 */
export const SETTINGS_TAB_EVENT = 'lgq:settings-tab';

export function settingsTabEvent(hash: string): CustomEvent<string> {
  return new CustomEvent<string>(SETTINGS_TAB_EVENT, { detail: hash.replace(/^#/, '') });
}

/**
 * The lightning bolt that means "automations", as one path.
 *
 * Three places draw it: the rail's Automations row, the demo rail's copy of that
 * row, and the Automations tab inside Settings. Written out three times it would
 * be three bolts that drift, and the rail is where somebody first learns what
 * the mark means — it has to be the same mark when they arrive.
 */
export const AUTOMATIONS_BOLT_PATH = 'M13 2 4.5 13.5H11l-1 8.5L19.5 10H13z';

/**
 * Whether a create form (e.g. jobs `?new`, leads `?add`) should render open:
 * always when the list is empty, otherwise only when the flag is present in the
 * URL (any value, including empty string; absent means undefined).
 */
export function shouldAutoOpenCreate(itemCount: number, flag: string | undefined): boolean {
  return itemCount === 0 || flag !== undefined;
}

/* --- "New" badges on the rail -----------------------------------------------
   A section is NEW when the newest thing in it arrived after the last time the
   owner opened that section. That's the whole rule, and it is deliberately
   about ARRIVAL TIME rather than a read/unread flag per row: nothing in the
   product marks a lead or a job as "read", and inventing that would mean a
   migration plus a write on every list render to answer a question the rail
   only asks once.

   The seen marks live in the browser, not the database. They describe one
   person's attention on one device, they are worthless to anyone else, and
   losing them costs a single extra badge that clears on the next visit — none
   of which is worth a column and a round trip. */

export type NavSeenMap = Record<string, string>;

export const NAV_SEEN_STORAGE_KEY = 'lgq-nav-seen';

/** Read the stored map, tolerating anything at all in that storage slot. */
export function parseNavSeen(raw: string | null | undefined): NavSeenMap {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: NavSeenMap = {};
    for (const [href, at] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof at === 'string' && at) out[href] = at;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Whether a section should wear a "New" badge.
 *
 * Never seen counts as new — someone who has never opened Leads has, by
 * definition, not seen the leads in it. An unparseable timestamp on either side
 * resolves to NOT new: a badge that can't be cleared is worse than a missing
 * one, because the only way to make it go away would be to stop looking.
 */
export function isSectionNew(newestCreatedAt: string | null | undefined, seenAt: string | null | undefined): boolean {
  if (!newestCreatedAt) return false;
  const newest = Date.parse(newestCreatedAt);
  if (Number.isNaN(newest)) return false;
  if (!seenAt) return true;
  const seen = Date.parse(seenAt);
  if (Number.isNaN(seen)) return false;
  return newest > seen;
}

/**
 * Mark a section seen, up to the newest item that existed at that moment.
 *
 * Only ever moves forward. Visiting a page while the status poll still holds a
 * stale, older "newest" would otherwise rewind the mark and re-raise the badge
 * for something already looked at.
 */
export function markNavSeen(seen: NavSeenMap, href: string, newestCreatedAt: string | null | undefined): NavSeenMap {
  if (!newestCreatedAt) return seen;
  const next = Date.parse(newestCreatedAt);
  if (Number.isNaN(next)) return seen;
  const current = seen[href] ? Date.parse(seen[href]) : NaN;
  if (!Number.isNaN(current) && current >= next) return seen;
  return { ...seen, [href]: newestCreatedAt };
}
