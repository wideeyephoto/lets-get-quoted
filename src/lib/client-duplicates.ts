import { normalizeUsPhone } from '@/lib/phone';

/**
 * The same customer, entered twice.
 *
 * WHY THIS EXISTS. findOrCreateClientId dedupes on phone and then email at the
 * moment a client is created, which is the right check and catches most of it.
 * It cannot catch the rest, because the rest arrive by routes that bypass it or
 * defeat it:
 *
 *   - An import with the number written differently. The create path normalizes
 *     to E.164 before comparing; a CSV column of "(248) 555-0117" only matches
 *     if whatever wrote the row normalized it too.
 *   - A booking under a mobile when the file has a landline, or a work email
 *     when the file has a personal one. Neither field matches, so neither check
 *     fires, and both records are the same household.
 *   - A name typed twice with no contact details at all.
 *
 * So this is a SECOND pass, run over the book as it stands rather than at the
 * moment of writing, and it is deliberately allowed to be less certain than the
 * create-time check: it proposes, a person decides, and nothing merges without
 * being asked. That is why every group carries the reason it was grouped.
 *
 * WHAT IT WILL NOT DO. It does not group on name alone. "Smith" and "Smith" are
 * two households far more often than one, and a duplicate finder that cries
 * wolf gets switched off — after which it finds nothing at all, which is worse
 * than not having it.
 */

export type DuplicateCandidate = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
};

/** Why these records were put together, strongest evidence first. */
export type DuplicateReason = 'phone' | 'email' | 'name-and-address';

export type DuplicateGroup<T extends DuplicateCandidate = DuplicateCandidate> = {
  /** Stable across runs so the UI can key on it. */
  key: string;
  reason: DuplicateReason;
  /** What they share, for the UI to show. Already formatted for reading. */
  sharedValue: string;
  members: T[];
};

export const DUPLICATE_REASON_LABEL: Record<DuplicateReason, string> = {
  phone: 'Same phone number',
  email: 'Same email address',
  'name-and-address': 'Same name and address',
};

/** E.164 where possible, so "(248) 555-0117" and "2485550117" are one key. */
function phoneKey(value: string | null): string | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;
  // Unparseable numbers still group on their digits alone, so an extension or a
  // non-US line typed twice is still spotted.
  return normalizeUsPhone(trimmed) ?? (trimmed.replace(/\D/g, '') || null);
}

function emailKey(value: string | null): string | null {
  const trimmed = (value ?? '').trim().toLowerCase();
  return trimmed || null;
}

/**
 * Punctuation, case and spacing removed — the ways the same address gets typed
 * twice. Deliberately NOT a real address parser: "St" and "Street" stay
 * different here, which costs a few matches and never invents one.
 */
function loose(value: string | null): string | null {
  const cleaned = (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return cleaned || null;
}

function groupBy<T extends DuplicateCandidate>(
  clients: T[],
  keyOf: (client: T) => string | null,
): Map<string, T[]> {
  const buckets = new Map<string, T[]>();
  for (const client of clients) {
    const key = keyOf(client);
    if (!key) continue;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(client);
    else buckets.set(key, [client]);
  }
  return buckets;
}

/**
 * Groups of records that look like one customer.
 *
 * A record appears in at most ONE group. The rules run strongest-first and each
 * claims its members, so a pair sharing both a phone and an email is reported
 * once, as a phone match, rather than twice — two cards proposing the same
 * merge is how a list of five real duplicates reads as ten.
 */
export function findDuplicateGroups<T extends DuplicateCandidate>(clients: T[]): DuplicateGroup<T>[] {
  const claimed = new Set<string>();
  const groups: DuplicateGroup<T>[] = [];

  const rules: { reason: DuplicateReason; keyOf: (client: T) => string | null; display: (members: T[]) => string }[] = [
    { reason: 'phone', keyOf: (c) => phoneKey(c.phone), display: (m) => m.find((x) => x.phone)?.phone ?? '' },
    { reason: 'email', keyOf: (c) => emailKey(c.email), display: (m) => m.find((x) => x.email)?.email ?? '' },
    {
      reason: 'name-and-address',
      // Both, never either. See the note above about grouping on name alone.
      keyOf: (c) => {
        const name = loose(c.name);
        const address = loose(c.address);
        return name && address ? `${name}|${address}` : null;
      },
      display: (m) => `${m[0].name} · ${m[0].address ?? ''}`.trim(),
    },
  ];

  for (const rule of rules) {
    const available = clients.filter((client) => !claimed.has(client.id));
    for (const [key, members] of groupBy(available, rule.keyOf)) {
      if (members.length < 2) continue;
      for (const member of members) claimed.add(member.id);
      groups.push({
        key: `${rule.reason}:${key}`,
        reason: rule.reason,
        sharedValue: rule.display(members),
        members,
      });
    }
  }

  // Biggest tangles first — they are the ones costing the most confusion.
  return groups.sort((a, b) => b.members.length - a.members.length || a.key.localeCompare(b.key));
}

/**
 * THE IDENTITY OF A SUGGESTION, for remembering that it was turned down.
 *
 * Keyed on the MEMBERS rather than on `group.key`. A group's key is the value
 * the records share ("phone:+12485550117"), which stays the same while the
 * membership changes underneath it — so a dismissal stored against it would go
 * on hiding the group when a THIRD record turned up on that number, and a third
 * record on a number two people already share is the case most worth seeing.
 *
 * Sorted, so the key does not depend on the order findDuplicateGroups happened
 * to produce.
 */
export function duplicateMemberKey(members: { id: string }[]): string {
  return [...members.map((member) => member.id)].sort().join(':');
}

/**
 * Which record should survive a merge, if nobody says otherwise.
 *
 * The most complete one, then the oldest. Completeness first because the point
 * of the merge is to end up with the fullest record, and age second because
 * where two are equally complete the one that has been referenced longest is
 * the safer survivor. The caller can always override — this is only the
 * pre-selected radio button.
 */
export function suggestSurvivor<T extends DuplicateCandidate & { created_at?: string }>(members: T[]): T {
  const score = (client: T) =>
    (client.phone ? 1 : 0) + (client.email ? 1 : 0) + (client.address ? 1 : 0) + (client.name?.trim() ? 1 : 0);
  return [...members].sort((a, b) => {
    const byScore = score(b) - score(a);
    if (byScore !== 0) return byScore;
    return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''));
  })[0];
}

/**
 * What the survivor should look like afterwards.
 *
 * Fills BLANKS only. A merge must never overwrite something somebody typed with
 * something else somebody typed — if two records disagree about the phone
 * number, the survivor's own value stands and the other is left in the notes
 * rather than silently winning. Losing a customer's real number to a merge is
 * the one outcome that would make this feature worse than the duplicates.
 */
export function mergedFields<T extends DuplicateCandidate>(
  survivor: T,
  others: T[],
): { name: string; phone: string | null; email: string | null; address: string | null; conflicts: string[] } {
  const conflicts: string[] = [];
  const fill = (current: string | null, field: 'phone' | 'email' | 'address') => {
    const own = (current ?? '').trim();
    for (const other of others) {
      const theirs = (other[field] ?? '').trim();
      if (!theirs) continue;
      if (!own) return theirs;
      // Same thing written differently is not a conflict.
      const same =
        field === 'phone'
          ? phoneKey(own) === phoneKey(theirs)
          : field === 'email'
            ? emailKey(own) === emailKey(theirs)
            : loose(own) === loose(theirs);
      if (!same) conflicts.push(`${field}: kept "${own}", also had "${theirs}"`);
    }
    return own || null;
  };

  return {
    name: (survivor.name ?? '').trim() || others.find((o) => o.name?.trim())?.name?.trim() || 'Client',
    phone: fill(survivor.phone, 'phone'),
    email: fill(survivor.email, 'email'),
    address: fill(survivor.address, 'address'),
    conflicts,
  };
}
