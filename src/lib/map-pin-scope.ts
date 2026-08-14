import { pinRecordId } from '@/lib/reveal-row';

/**
 * What the map is allowed to show when the list beside it has been filtered.
 *
 * THE MISMATCH THIS EXISTS FOR. getMapPins is deliberately global — it returns
 * every lead AND every job that has coordinates, because "where is my work" is
 * a question about all of it. Every workspace then filters its own LIST and
 * handed the map that same global set, so the two panels answered different
 * questions side by side and both printed a count:
 *
 *   Jobs, filtered to Complete .... "5 of 39" over "Map 33" over "37 places"
 *   Leads, filtered to Lost 1 ..... one row in the list, seven active leads
 *                                   still on the map and in its legend
 *   Clients, "Nothing on the books
 *   22" .......................... list filtered, map still "21 of 42 pinned"
 *
 * None of those numbers is wrong on its own. Together, with nothing saying
 * which is which, they read as the page contradicting itself.
 *
 * THE RULE. A filter filters the page. When one is active the map shows exactly
 * the records the list is showing and nothing else — including no pins of the
 * OTHER record type, because a legend counting leads beside a list of complete
 * jobs is the competing-counts problem in a smaller box. With no filter active
 * the map keeps its full picture, which is the view worth having and the one
 * that was always there.
 *
 * Pure, so the rule is tested once and both workspaces get the same answer.
 */

/** Any pin, narrowed to what this decision actually reads. */
type PinLike = { id: string };

export function scopePinsToFilter<T extends PinLike>(
  pins: readonly T[],
  kind: 'job' | 'lead',
  /** Ids of the records the list is currently showing. */
  visibleIds: ReadonlySet<string>,
  /** False when the filter is "all" — the map keeps its full picture. */
  filtered: boolean,
): T[] {
  if (!filtered) return [...pins];
  return pins.filter((pin) => {
    const recordId = pinRecordId(pin.id, kind);
    // A pin of the other kind is not "unmatched", it is out of scope entirely.
    return recordId !== null && visibleIds.has(recordId);
  });
}

/**
 * What to call the number on the map's own toggle.
 *
 * The count was bare — "Map 33" — beside a list saying "5 of 39", which invites
 * exactly the arithmetic that does not work. Saying what the number counts is
 * cheaper than making the two agree in every case, and once the map IS the
 * filtered set the honest label is short.
 */
export function mapScopeLabel(shown: number, total: number, filtered: boolean): string {
  if (!filtered) return `${shown} on the map`;
  return `${shown} of ${total} on the map`;
}
