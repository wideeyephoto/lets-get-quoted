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
 * The section ids that moved with Automations when it left Settings.
 *
 * Automations was a Settings TAB, so every link to one of its sections is
 * `/dashboard/settings#reviews`, `#reminders`, `#daily-digest` and so on. Those
 * links are real and live — the Messages page links to one — and a next.config
 * redirect cannot rescue any of them, because a URL fragment is never sent to
 * the server. There is nothing for a server-side rule to match on.
 *
 * So the redirect happens in the browser, in SettingsTabs, the one component
 * that already reads the hash. When a hash arrives that no remaining tab owns
 * and this list claims it, it forwards to /dashboard/automations with the hash
 * intact. Without it, eleven anchors would each land on Settings and silently do
 * nothing — the exact dead-link failure the SETTINGS_TAB_EVENT note above was
 * written about, reintroduced by moving the page.
 *
 * Kept here rather than in lib/automations.ts on purpose: that module's keys are
 * database column names, and these are URL anchors. They only partly overlap —
 * there is no `intake-ai`, `arrival` or `client-portal` column — and a list that
 * is nearly the same as another list is the kind of thing that gets merged by
 * somebody who does not know why they differ.
 */
export const AUTOMATION_ANCHORS = [
  'intake-ai',
  'booking-availability',
  'extra-stop',
  'missed-call',
  'reviews',
  'followups',
  'reminders',
  'arrival',
  'selections',
  'client-portal',
  'daily-digest',
] as const;

/**
 * The card on /dashboard/automations that owns a given automation switch.
 *
 * The two vocabularies are one apart: the switch for online booking is stored
 * in a column called `booking`, and the card that holds it is anchored
 * `booking-availability` — the anchor names the section, the key names the
 * column. Every other switch happens to spell them the same, which is exactly
 * why the one that does not needs a translation somebody can find.
 *
 * Returns null when a key has no card of its own (the email-confirmation
 * switches live inside other cards) — the caller sends those to the top of the
 * page rather than to a fragment that resolves to nothing.
 */
const AUTOMATION_KEY_ANCHOR: Record<string, string> = { booking: 'booking-availability' };

export function automationAnchorFor(key: string): string | null {
  const anchor = AUTOMATION_KEY_ANCHOR[key] ?? key;
  return (AUTOMATION_ANCHORS as readonly string[]).includes(anchor) ? anchor : null;
}

/** Does this hash belong to a section that now lives on /dashboard/automations? */
export function isAutomationsAnchor(rawHash: string | null | undefined): boolean {
  const hash = (rawHash || '').replace(/^#/, '');
  // 'automations' itself: the old tab id, which is what the rail's sublink and
  // any bookmark of the tab carried.
  if (hash === 'automations') return true;
  return (AUTOMATION_ANCHORS as readonly string[]).includes(hash);
}

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

/* --- what the numbers on the rail mean --------------------------------------
 *
 * THREE BADGES ON ONE ROW, ALL DIGITS. A leads row reading "Leads New 3 12"
 * gives a screen reader four things and explains none of them, and the
 * explanations existed — in `title` attributes on the <span>s. A title on a
 * non-interactive span is a hover tooltip: no touch device can reach it, and it
 * is not part of the accessible name, so the one place the meaning was written
 * down was the one place neither a phone nor a screen reader could look.
 *
 * The counts themselves were never the problem. leadSummary and leadRailTitle
 * are built server-side and shared with the dashboard card precisely so the two
 * cannot drift. This is only about saying, in text, which number is which.
 *
 * Here rather than in app-shell so the rail and the mobile top bar — which
 * render the same three attention counts in two different components — cannot
 * describe them differently.
 */
const ATTENTION_LABEL: Record<string, (count: number) => string> = {
  '/dashboard/leads': (n) => `${n} website ${n === 1 ? 'lead is' : 'leads are'} waiting for a reply`,
  '/dashboard/jobs': (n) => `${n} ${n === 1 ? 'job needs' : 'jobs need'} attention`,
  '/dashboard/schedule': (n) => `${n} approved ${n === 1 ? 'job has' : 'jobs have'} no date yet`,
  '/dashboard/messages': (n) => `${n} unread ${n === 1 ? 'message' : 'messages'}`,
  '/dashboard/quick-stops': (n) => `${n} Quick Stop ${n === 1 ? 'request is' : 'requests are'} waiting on you`,
};

/**
 * The filled badge: what needs you here today.
 *
 * Null for a section with no attention count, so a caller cannot invent a
 * label for a number this file has no definition of.
 */
export function navAttentionLabel(href: string, count: number): string | null {
  const make = ATTENTION_LABEL[href];
  return make ? make(count) : null;
}
