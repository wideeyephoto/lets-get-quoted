// The homeowner selection board.
//
// Colours, materials and fixtures the customer has to choose, with what the
// quote allows for and what an upgrade costs. It exists to settle one argument
// in advance: "that is absolutely not the beige I picked."
//
// Which makes the RECORD the feature, not the picker. A choice is frozen with
// the person's name, the moment, and a snapshot of exactly what they were
// looking at — because the contractor may reasonably edit that option next
// month, and doing so must never rewrite what somebody agreed to.

export type SelectionStatus = 'open' | 'chosen' | 'cancelled';

export type SelectionOption = {
  id: string;
  name: string;
  description: string;
  price: number;
  /** "Sherwin-Williams SW7036". Not a matter of opinion, which is the point. */
  reference: string;
  photoPath: string | null;
  sortOrder: number;
};

/** What an option said WHEN IT WAS PICKED. Never re-read from the live option. */
export type ChosenSnapshot = {
  optionId: string;
  name: string;
  description: string;
  price: number;
  reference: string;
};

/** A decision that was made and then reopened. Kept, never overwritten. */
export type PreviousChoice = {
  snapshot: ChosenSnapshot;
  chosenAt: string | null;
  chosenByName: string | null;
  reopenedAt: string;
  reason: string;
};

export type Selection = {
  id: string;
  jobId: string;
  title: string;
  description: string;
  allowance: number;
  decideBy: string | null;
  creditUnderspend: boolean;
  status: SelectionStatus;
  chosenOptionId: string | null;
  chosenSnapshot: ChosenSnapshot | null;
  chosenAt: string | null;
  chosenByName: string | null;
  /** Oldest first. Empty for the overwhelming majority of selections. */
  reopened: PreviousChoice[];
  /** When the homeowner was nudged before the date. Null = not yet. */
  chaseSentAt: string | null;
  /** When they were nudged after it passed. Null = not yet. */
  overdueSentAt: string | null;
  sortOrder: number;
  options: SelectionOption[];
};

export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// -- Money --------------------------------------------------------------------

export type OptionCost = {
  /** What they pay on top. 0 when at or under the allowance. */
  upgrade: number;
  /** What comes back off. 0 when over the allowance, or when crediting is off. */
  credit: number;
  /** upgrade - credit. The single number the job total moves by. */
  net: number;
  /** True when this option costs exactly what was allowed for. */
  included: boolean;
};

/**
 * What one option does to the price.
 *
 * Picking under the allowance normally gives the money back — that IS what an
 * allowance means in a construction contract, and a contractor who keeps the
 * difference without saying so is the reason customers distrust the word. It's
 * switchable for those who write theirs as "up to", but the default is credit.
 *
 * The customer is never asked to do this subtraction themselves.
 */
export function optionCost(option: Pick<SelectionOption, 'price'>, selection: Pick<Selection, 'allowance' | 'creditUnderspend'>): OptionCost {
  const price = round2(option.price);
  const allowance = round2(selection.allowance);
  if (price > allowance) return { upgrade: round2(price - allowance), credit: 0, net: round2(price - allowance), included: false };
  if (price < allowance && selection.creditUnderspend) {
    const credit = round2(allowance - price);
    return { upgrade: 0, credit, net: round2(-credit), included: false };
  }
  return { upgrade: 0, credit: 0, net: 0, included: true };
}

/** Plain words for the option list. Never a bare signed number. */
export function describeOptionCost(cost: OptionCost): string {
  if (cost.included) return 'Included';
  if (cost.upgrade > 0) return `+${money(cost.upgrade)}`;
  return `${money(cost.credit)} back`;
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

/**
 * What the decisions so far have done to the job total.
 *
 * Only CHOSEN selections count. An option somebody is still thinking about has
 * not changed the price of anything, and showing it in a total invites a
 * contractor to bank money nobody has agreed to.
 */
export function selectionTotals(selections: Selection[]): { upgrades: number; credits: number; net: number; decided: number; waiting: number } {
  let upgrades = 0;
  let credits = 0;
  let decided = 0;
  let waiting = 0;

  for (const selection of selections) {
    if (selection.status === 'cancelled') continue;
    if (selection.status !== 'chosen' || !selection.chosenSnapshot) {
      waiting += 1;
      continue;
    }
    decided += 1;
    // From the SNAPSHOT, not the live option. If the contractor edited the
    // option after it was picked, the customer still owes what they agreed to.
    const cost = optionCost({ price: selection.chosenSnapshot.price }, selection);
    upgrades += cost.upgrade;
    credits += cost.credit;
  }

  return { upgrades: round2(upgrades), credits: round2(credits), net: round2(upgrades - credits), decided, waiting };
}

// -- Deadlines ----------------------------------------------------------------

export type DeadlineState = { due: boolean; overdue: boolean; daysLeft: number | null; label: string };

/** Inside this many days, a pending decision is worth chasing. */
export const DECISION_CHASE_DAYS = 7;

export function todayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * How a pending decision reads.
 *
 * Silent on a selection with no deadline, and silent once it's been made. A
 * board that nags about every row is a board nobody scrolls.
 */
export function deadlineState(selection: Pick<Selection, 'decideBy' | 'status'>, today = todayKey()): DeadlineState {
  if (selection.status !== 'open' || !selection.decideBy) {
    return { due: false, overdue: false, daysLeft: null, label: '' };
  }
  const from = Date.parse(`${today}T00:00:00Z`);
  const to = Date.parse(`${selection.decideBy}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return { due: false, overdue: false, daysLeft: null, label: '' };

  const daysLeft = Math.round((to - from) / 86_400_000);
  if (daysLeft < 0) {
    const late = Math.abs(daysLeft);
    return { due: true, overdue: true, daysLeft, label: `${late} day${late === 1 ? '' : 's'} past the date we needed this` };
  }
  if (daysLeft === 0) return { due: true, overdue: false, daysLeft, label: 'Needed today' };
  return {
    due: daysLeft <= DECISION_CHASE_DAYS,
    overdue: false,
    daysLeft,
    label: `${daysLeft} day${daysLeft === 1 ? '' : 's'} to decide`,
  };
}

/**
 * The job-level status line. "Waiting on homeowner" is the one that matters —
 * it's what turns a stalled job from the contractor's problem into a shared one.
 */
export function boardStatus(selections: Selection[], today = todayKey()): { waiting: number; overdue: number; label: string } {
  const open = selections.filter((s) => s.status === 'open');
  const overdue = open.filter((s) => deadlineState(s, today).overdue).length;

  if (open.length === 0) {
    return { waiting: 0, overdue: 0, label: selections.length > 0 ? 'All choices made' : '' };
  }
  const label =
    overdue > 0
      ? `Waiting on homeowner — ${overdue} past the date we needed`
      : `Waiting on homeowner — ${open.length} choice${open.length === 1 ? '' : 's'} to make`;
  return { waiting: open.length, overdue, label };
}

// -- Client-facing ------------------------------------------------------------

export type ClientSelectionOption = {
  id: string;
  name: string;
  description: string;
  reference: string;
  /**
   * A signed URL, filled in by the data layer — never a storage path.
   *
   * The job-photos bucket is private, so a raw path renders as a broken image.
   * It's typed as the URL rather than the path so a caller that forgets to sign
   * gets null and no picture, instead of a 404 in front of a customer.
   */
  photoUrl: string | null;
  costLabel: string;
  upgrade: number;
  credit: number;
  included: boolean;
};

export type ClientSelection = {
  id: string;
  title: string;
  description: string;
  allowance: number;
  decideBy: string | null;
  deadlineLabel: string;
  overdue: boolean;
  status: SelectionStatus;
  options: ClientSelectionOption[];
  /** What they picked, from the snapshot — so it reads the same forever. */
  chosen: { name: string; reference: string; costLabel: string; at: string | null; byName: string | null } | null;
  /**
   * What they picked before it was reopened, most recent first.
   *
   * Shown rather than hidden: a homeowner who confirmed a choice and later finds
   * the question being asked again should be told why, not left wondering
   * whether their answer was lost.
   */
  previouslyPicked: { name: string; reference: string; at: string | null }[];
  awaitingDecision: boolean;
};

/**
 * What the homeowner sees.
 *
 * Cancelled selections are dropped entirely — a decision the contractor took off
 * the table is not one to invite comment on. Everything else is shown, including
 * choices already made: seeing "you picked SW7036 on 12 March" is the whole
 * reason this exists.
 */
export function toClientSelections(selections: Selection[], today = todayKey()): ClientSelection[] {
  return selections
    .filter((selection) => selection.status !== 'cancelled')
    .map((selection) => {
      const deadline = deadlineState(selection, today);
      return {
        id: selection.id,
        title: selection.title,
        description: selection.description,
        allowance: selection.allowance,
        decideBy: selection.decideBy,
        // The homeowner is told the date, not scolded with a day count.
        deadlineLabel: selection.decideBy && selection.status === 'open' ? formatDeadlineForClient(selection.decideBy, deadline) : '',
        overdue: deadline.overdue,
        status: selection.status,
        // Once they've chosen, the alternatives are dropped entirely — not just
        // hidden. A client component's props are serialised into the page, so
        // "not rendered" still ships them; and offering options somebody can no
        // longer take only raises "can I change my mind?".
        options: (selection.status === 'chosen' ? [] : selection.options).map((option) => {
          const cost = optionCost(option, selection);
          return {
            id: option.id,
            name: option.name,
            description: option.description,
            reference: option.reference,
            // Signed later. See the note on the type.
            photoUrl: null,
            costLabel: describeOptionCost(cost),
            upgrade: cost.upgrade,
            credit: cost.credit,
            included: cost.included,
          };
        }),
        chosen: selection.chosenSnapshot
          ? {
              name: selection.chosenSnapshot.name,
              reference: selection.chosenSnapshot.reference,
              costLabel: describeOptionCost(optionCost({ price: selection.chosenSnapshot.price }, selection)),
              at: selection.chosenAt,
              byName: selection.chosenByName,
            }
          : null,
        // Newest first: the one they'll remember is the one they made last.
        previouslyPicked: [...selection.reopened]
          .reverse()
          .map((previous) => ({
            name: previous.snapshot.name,
            reference: previous.snapshot.reference,
            at: previous.chosenAt,
          })),
        awaitingDecision: selection.status === 'open',
      };
    });
}

function formatDeadlineForClient(decideBy: string, deadline: DeadlineState): string {
  const when = new Date(`${decideBy}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric' });
  if (deadline.overdue) return `We needed this by ${when} — let us know as soon as you can so it doesn't hold the job up.`;
  if (deadline.daysLeft === 0) return `We need this today to keep the job on track.`;
  return `We need to know by ${when} to keep the job on track.`;
}

// -- Templates ----------------------------------------------------------------

export type SelectionTemplateOption = {
  name: string;
  description: string;
  price: number;
  reference: string;
  photoPath: string | null;
};

export type SelectionTemplateItem = {
  title: string;
  description: string;
  allowance: number;
  creditUnderspend: boolean;
  options: SelectionTemplateOption[];
};

export type SelectionTemplateBody = { items: SelectionTemplateItem[] };

/** Keep a template a template, not a database. */
export const MAX_TEMPLATE_ITEMS = 30;
export const MAX_TEMPLATE_OPTIONS = 20;

/**
 * Turn a job's board into something reusable.
 *
 * Carries the titles, allowances, options, prices and product codes — the parts
 * that are the same on every job of this kind. Deliberately drops:
 *
 *   - the needed-by date, which belongs to a job. Copying one would give every
 *     future job either a deadline in the past or a date nobody chose.
 *   - which option was picked. A template is the question, not last customer's
 *     answer, and pre-filling somebody else's choice is how a board stops being
 *     a decision.
 *
 * Photos ARE carried: they are most of what makes a choice possible, the
 * storage objects are account-scoped and outlive the job row, and one that
 * won't sign already degrades to no photo rather than a broken image.
 */
export function boardToTemplate(selections: Selection[]): SelectionTemplateBody {
  return {
    items: selections
      .filter((selection) => selection.status !== 'cancelled')
      .slice(0, MAX_TEMPLATE_ITEMS)
      .map((selection) => ({
        title: selection.title,
        description: selection.description,
        allowance: round2(selection.allowance),
        creditUnderspend: selection.creditUnderspend,
        options: selection.options.slice(0, MAX_TEMPLATE_OPTIONS).map((option) => ({
          name: option.name,
          description: option.description,
          price: round2(option.price),
          reference: option.reference,
          photoPath: option.photoPath,
        })),
      })),
  };
}

/** Read a stored template defensively — it is a jsonb blob, not a schema. */
export function parseTemplateBody(raw: unknown): SelectionTemplateBody {
  const root = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const items = Array.isArray(root.items) ? root.items : [];
  return {
    items: items.slice(0, MAX_TEMPLATE_ITEMS).map((entry) => {
      const item = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
      const options = Array.isArray(item.options) ? item.options : [];
      return {
        title: String(item.title ?? '').slice(0, 160) || 'Choice to make',
        description: String(item.description ?? '').slice(0, 1000),
        allowance: Math.max(0, round2(Number(item.allowance) || 0)),
        // Same default as a new selection: crediting the under-spend is what an
        // allowance means, so a malformed template must not silently opt out.
        creditUnderspend: item.creditUnderspend !== false,
        options: options.slice(0, MAX_TEMPLATE_OPTIONS).map((raw) => {
          const option = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
          return {
            name: String(option.name ?? '').slice(0, 160) || 'Option',
            description: String(option.description ?? '').slice(0, 600),
            price: Math.max(0, round2(Number(option.price) || 0)),
            reference: String(option.reference ?? '').slice(0, 120),
            photoPath: typeof option.photoPath === 'string' ? option.photoPath : null,
          };
        }),
      };
    }),
  };
}

/** How a template reads in the picker, without opening it. */
export function describeTemplate(body: SelectionTemplateBody): string {
  const items = body.items.length;
  const options = body.items.reduce((sum, item) => sum + item.options.length, 0);
  if (items === 0) return 'Empty';
  return `${items} choice${items === 1 ? '' : 's'} · ${options} option${options === 1 ? '' : 's'}`;
}

// -- Chasing a decision -------------------------------------------------------

/** Which nudge, if any, a selection is owed. */
export type ChaseKind = 'none' | 'due' | 'overdue';

/**
 * Whether this selection needs the homeowner told, and which message.
 *
 * Exactly two nudges in a selection's life: one as the date approaches, one
 * once it has passed. A third is nagging, and a board that nags is a board
 * whose texts get muted — at which point the genuinely urgent one is muted too.
 *
 * Silent with no deadline. A contractor who left the date blank said this one
 * doesn't matter yet, and inventing a reason to text somebody is exactly what
 * the blank field exists to prevent. Also silent on an option-less selection,
 * which the caller checks: "you have a choice to make" with nothing to choose
 * between is a message that wastes the one bit of attention it buys.
 */
export function chaseNeeded(
  selection: Pick<Selection, 'status' | 'decideBy' | 'chaseSentAt' | 'overdueSentAt'>,
  today = todayKey(),
): ChaseKind {
  if (selection.status !== 'open' || !selection.decideBy) return 'none';
  const state = deadlineState({ decideBy: selection.decideBy, status: 'open' }, today);
  if (state.overdue) return selection.overdueSentAt ? 'none' : 'overdue';
  if (state.due) return selection.chaseSentAt ? 'none' : 'due';
  return 'none';
}

/**
 * One message per JOB, not per selection.
 *
 * A kitchen with six choices due the same day is one text. Six would read as a
 * malfunction, and the homeowner would stop opening any of them.
 */
export function chaseMessage(input: {
  businessName: string;
  clientName: string;
  count: number;
  overdue: boolean;
  url: string;
}): string {
  const first = input.clientName.trim().split(/\s+/)[0] || 'there';
  const what = input.count === 1 ? 'a choice' : `${input.count} choices`;
  const body = input.overdue
    ? `we're waiting on ${what} from you before we can order`
    : `${what} to make when you get a minute`;
  return `Let's Get Quoted: ${first}, ${input.businessName} here — ${body}: ${input.url}. Reply STOP to opt out.`;
}

// -- Changing your mind -------------------------------------------------------

/**
 * What reopening a decision does to the job total.
 *
 * Exactly the opposite of what choosing it did — computed from the SNAPSHOT,
 * because that is the number the job total actually moved by. Reading the live
 * option instead would reverse a different amount than was applied whenever the
 * contractor had edited it since, and quietly leave the job mispriced.
 */
export function reopenAdjustment(selection: Pick<Selection, 'allowance' | 'creditUnderspend' | 'chosenSnapshot'>): number {
  if (!selection.chosenSnapshot) return 0;
  return round2(-optionCost({ price: selection.chosenSnapshot.price }, selection).net);
}

/** The choice being reopened, packaged for the history. */
export function toPreviousChoice(
  selection: Pick<Selection, 'chosenSnapshot' | 'chosenAt' | 'chosenByName'>,
  reason: string,
  now: Date = new Date(),
): PreviousChoice | null {
  if (!selection.chosenSnapshot) return null;
  return {
    snapshot: selection.chosenSnapshot,
    chosenAt: selection.chosenAt,
    chosenByName: selection.chosenByName,
    reopenedAt: now.toISOString(),
    reason: reason.trim().slice(0, 300),
  };
}

/** Snapshot an option at the moment it's chosen. */
export function snapshotOption(option: SelectionOption): ChosenSnapshot {
  return {
    optionId: option.id,
    name: option.name,
    description: option.description,
    price: round2(option.price),
    reference: option.reference,
  };
}
