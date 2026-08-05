import { waitingLabel, type QueueLead } from '@/lib/lead-queue';

/**
 * What to do next, in order — the logic behind the Priority inbox.
 *
 * The old inbox sorted by heat alone, which meant a WON lead sat above a
 * website request nobody had answered, and a lost one sat there for ever. Heat
 * is a property of a lead; it is not a queue position. What decides a queue
 * position is whose move it is and how long it has been their move.
 *
 * Closed leads are excluded outright rather than sorted last. A queue is a list
 * of work, and a won job is not work — leaving it in means the count at the top
 * is not a number of things to do.
 *
 * Pure, and every ranked lead carries the SENTENCE that put it where it is. A
 * ranking nobody can read is a ranking nobody can trust, and the previous one
 * communicated itself with a coloured dot.
 */

export type PriorityLead = QueueLead & {
  textOnly: boolean;
  phone: string | null;
  email: string | null;
  /** ISO timestamp of the last logged touchpoint; null if nobody has reached out. */
  lastTouchAt: string | null;
};

/** The five ordering criteria, in the order they are applied. */
export type PriorityTier = 'needs-response' | 'overdue-followup' | 'quote-waiting' | 'working';

export type PriorityGroup = 'act-now' | 'follow-up' | 'snoozed';

export type RankedLead<T extends PriorityLead> = {
  lead: T;
  tier: PriorityTier;
  group: PriorityGroup;
  /** "Needs response · Hot · waiting 4 days" — printed on the card. */
  reason: string;
  /** Days since the last touchpoint, or since it arrived if there is none. */
  quietDays: number;
};

export const TIER_LABEL: Record<PriorityTier, string> = {
  'needs-response': 'Needs response',
  'overdue-followup': 'Overdue follow-up',
  'quote-waiting': 'Quote awaiting action',
  working: 'In the pipeline',
};

const TIER_RANK: Record<PriorityTier, number> = {
  'needs-response': 0,
  'overdue-followup': 1,
  'quote-waiting': 2,
  working: 3,
};

const HEAT_RANK: Record<QueueLead['score'], number> = { hot: 0, warm: 1, low: 2 };
const HEAT_WORD: Record<QueueLead['score'], string> = { hot: 'Hot', warm: 'Warm', low: 'Low' };

/**
 * How long a lead may sit after somebody has touched it before it counts as
 * overdue.
 *
 * Three days for a contacted lead and three for a quote: both are "you said you
 * would get back to them and you have not". Deliberately the same number —
 * inventing a different one for each would imply a precision nobody has, and
 * the point is only to separate "in flight" from "going cold".
 */
export const OVERDUE_AFTER_DAYS = 3;

const DAY_MS = 86_400_000;

function daysBetween(fromIso: string, now: Date): number {
  const at = new Date(fromIso).getTime();
  if (!Number.isFinite(at)) return 0;
  return Math.max(0, (now.getTime() - at) / DAY_MS);
}

/** A lead the queue should never show: the work is finished either way. */
export function isClosed(lead: { status: QueueLead['status'] }): boolean {
  return lead.status === 'won' || lead.status === 'lost';
}

/**
 * "4 days waiting" reads as a label on its own; inside a sentence it wants to
 * be "waiting 4 days". Same figure, and it comes from the same function, so the
 * card and the reason can never disagree about how long somebody has waited.
 */
function waitingPhrase(long: string): string {
  const match = /^(.+) waiting$/.exec(long);
  return match ? `waiting ${match[1]}` : long.toLowerCase();
}

function tierFor(lead: PriorityLead, quietDays: number): PriorityTier {
  if (lead.status === 'new') return 'needs-response';
  if (lead.status === 'contacted' && quietDays >= OVERDUE_AFTER_DAYS) return 'overdue-followup';
  if (lead.status === 'quoted' && quietDays >= OVERDUE_AFTER_DAYS) return 'quote-waiting';
  return 'working';
}

/**
 * Rank the open leads.
 *
 * Order, exactly as briefed: needs response, then overdue follow-up, then a
 * quote awaiting action, then heat and estimated value, then time waiting. The
 * first three are categories; the last two order everything inside a category,
 * so a hot $8k lead outranks a low-value one in the same tier and, when those
 * tie, whoever has waited longest goes first.
 *
 * `snoozed` comes in separately because the page filters those out before the
 * views ever see them — they are not open work, but they are not closed either,
 * and burying them in a drawer at the foot of the page is how a follow-up gets
 * forgotten.
 */
export function rankLeads<T extends PriorityLead>(
  leads: T[],
  options: { now?: Date; snoozed?: T[] } = {},
): { actNow: RankedLead<T>[]; followUp: RankedLead<T>[]; snoozed: RankedLead<T>[] } {
  const now = options.now ?? new Date();

  const rank = (lead: T, group: PriorityGroup): RankedLead<T> => {
    const quietDays = daysBetween(lead.lastTouchAt ?? lead.createdAt, now);
    const tier = tierFor(lead, quietDays);
    const waiting = waitingLabel(lead.createdAt, now);
    return {
      lead,
      tier,
      group,
      quietDays,
      // Three facts, in the order they decided the position: why it is in this
      // tier, how hot it is, how long it has been sitting.
      reason: `${TIER_LABEL[tier]} · ${HEAT_WORD[lead.score]} · ${waitingPhrase(waiting.long)}`,
    };
  };

  const open = leads.filter((lead) => !isClosed(lead)).map((lead) => rank(lead, 'act-now'));

  open.sort((a, b) => {
    if (TIER_RANK[a.tier] !== TIER_RANK[b.tier]) return TIER_RANK[a.tier] - TIER_RANK[b.tier];
    if (HEAT_RANK[a.lead.score] !== HEAT_RANK[b.lead.score]) return HEAT_RANK[a.lead.score] - HEAT_RANK[b.lead.score];
    const av = a.lead.estimate?.max ?? -1;
    const bv = b.lead.estimate?.max ?? -1;
    if (av !== bv) return bv - av;
    const at = new Date(a.lead.createdAt).getTime();
    const bt = new Date(b.lead.createdAt).getTime();
    if (at !== bt) return at - bt; // longest waiting first
    return a.lead.id.localeCompare(b.lead.id);
  });

  return {
    actNow: open.filter((entry) => entry.tier !== 'working').map((entry) => ({ ...entry, group: 'act-now' })),
    followUp: open.filter((entry) => entry.tier === 'working').map((entry) => ({ ...entry, group: 'follow-up' })),
    snoozed: (options.snoozed ?? [])
      .filter((lead) => !isClosed(lead))
      .map((lead) => rank(lead, 'snoozed'))
      .sort((a, b) => new Date(a.lead.createdAt).getTime() - new Date(b.lead.createdAt).getTime()),
  };
}

/**
 * The one action that should be a button, given how this homeowner asked to be
 * reached.
 *
 * One, not four. The inbox used to put call / text / snooze / open beside every
 * row, which on a phone left about 42px for the name — and it offered a Call
 * button to a lead who had explicitly asked not to be called.
 */
export type LeadAction = { kind: 'text' | 'call' | 'open'; label: string; href: string };

export function primaryAction(lead: PriorityLead, base = '/dashboard'): LeadAction {
  if (lead.phone && lead.textOnly) return { kind: 'text', label: 'Text', href: `sms:${lead.phone}` };
  if (lead.phone) return { kind: 'call', label: 'Call', href: `tel:${lead.phone}` };
  return { kind: 'open', label: 'Open', href: `${base}/leads/${lead.id}` };
}

/**
 * What the Board should offer on a card, given the stage it is in.
 *
 * A lost lead was still being offered "Decline", and a won one still had the
 * whole strip. An action that cannot sensibly apply is not a disabled button,
 * it is an absent one.
 */
export type BoardAction = 'contacted' | 'quote' | 'won' | 'decline';

export function boardActions(status: QueueLead['status']): BoardAction[] {
  if (status === 'new') return ['contacted', 'decline'];
  if (status === 'contacted') return ['quote', 'won', 'decline'];
  if (status === 'quoted') return ['won', 'decline'];
  return []; // won / lost — reopening is what "Move to…" is for
}

/** The stages the Board shows as columns, plus the collapsed group. */
export const BOARD_COLUMNS: { status: QueueLead['status']; label: string }[] = [
  { status: 'new', label: 'Needs response' },
  { status: 'contacted', label: 'Contacted' },
  { status: 'quoted', label: 'Quote sent' },
];

export const BOARD_CLOSED: { status: QueueLead['status']; label: string }[] = [
  { status: 'won', label: 'Won' },
  { status: 'lost', label: 'Lost' },
];
