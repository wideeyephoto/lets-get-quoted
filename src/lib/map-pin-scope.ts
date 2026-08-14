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

/**
 * Why the map is empty, when a filter is what emptied it.
 *
 * Scoping the pins fixed the contradiction and created a smaller one. Filter
 * Jobs to Complete and the map is now correctly empty — under PinMap's standing
 * empty copy, "No mapped locations yet — addresses are geocoded as leads and
 * jobs come in", which is about a new account with nothing in it. Read beside a
 * list of eleven completed jobs it says the geocoder is broken.
 *
 * It is never the whole reason, either. Two things keep a record off the map and
 * only one of them is the filter: getMapPins has never pinned finished work, and
 * it cannot pin an address it has not geocoded. Both belong in the sentence,
 * because the one the reader needs is whichever one they are looking at.
 *
 * Undefined when no filter is on — then an empty map really does mean nothing is
 * geocoded yet, and PinMap's own copy is the right thing to say.
 */
const NOT_PINNED: Record<'job' | 'lead', string> = {
  job: 'Completed and archived jobs are never pinned, and a job with no address yet cannot be.',
  lead: 'Won, lost, snoozed and archived leads are never pinned, and a lead with no address yet cannot be.',
};

export function mapEmptyNote(kind: 'job' | 'lead', filtered: boolean): string | undefined {
  if (!filtered) return undefined;
  // The way out, said where the dead end is. Clearing the filter is also what
  // brings back the other record type, which scoping drops on purpose.
  return `Nothing on this filter has a pin. ${NOT_PINNED[kind]} Clear the filter to see the rest of the map.`;
}
