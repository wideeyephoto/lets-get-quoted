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
 * Whether a create form (e.g. jobs `?new`, leads `?add`) should render open:
 * always when the list is empty, otherwise only when the flag is present in the
 * URL (any value, including empty string; absent means undefined).
 */
export function shouldAutoOpenCreate(itemCount: number, flag: string | undefined): boolean {
  return itemCount === 0 || flag !== undefined;
}
