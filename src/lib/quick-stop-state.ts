/**
 * WHAT STATE IS QUICK STOPS IN? One answer, in one place.
 *
 * There were nine. Six of them could be on screen at once, and they
 * contradicted each other in ways an owner could read side by side:
 *
 *   - "Nothing can come in yet" fired on `!enabled` alone, so an account with
 *     days, hours, a fee band, a daily limit and Stripe all configured was still
 *     told nothing could come in.
 *   - "Finish the setup" and "Set your days, hours and fee band" fired on the
 *     same condition — saying finish when nothing was unfinished.
 *   - "Paused" meant two different things. The status block returned it for a
 *     plain switched-off account, while a support lock (the real pause) said
 *     "Paused by support". A third pause was suggested in the configurator:
 *     clear every weekday. That one puts the account into a state the status
 *     block then scolds it for, because having days set is one of the five
 *     conditions for being live.
 *   - The nav rail read `locked ? paused : enabled ? on : off` and knew nothing
 *     about setup gaps, so it could show a green ON beside a page saying
 *     "Not live yet".
 *
 * FOUR STATES, in precedence order, and the precedence is the design:
 *
 *   paused           support locked it. THE ONLY thing that is a pause. An owner
 *                    switching it off is not paused, it is off, and conflating
 *                    the two is what made "Paused" meaningless.
 *   setup_incomplete  something real is missing, and it says which things — all
 *                    of them, not just the first.
 *   ready_off        everything is configured; it is simply not switched on.
 *                    This is the state the old code had no name for, which is
 *                    why it reached for "finish the setup".
 *   on               taking requests.
 *
 * Pure, no IO — the page, the status block, the footer, the explainer and the
 * nav-rail API all call this, so none of them can invent a sixth opinion.
 */

export type SetupGapKey = 'website' | 'weekdays' | 'fee' | 'stripe';

export type SetupGap = {
  key: SetupGapKey;
  /** Imperative, lower case, for joining into a sentence: "publish your website". */
  label: string;
  href: string;
};

export type QuickStopState =
  | { kind: 'paused'; reason: string; untilIso: string | null }
  | {
      kind: 'setup_incomplete';
      gaps: SetupGap[];
      /**
       * The owner has already flipped the switch and is waiting on the setup.
       * Does NOT change the state — an account with gaps cannot take a request
       * either way — but the copy differs in tone, because "you still need to"
       * and "you also need to" land very differently on somebody who thinks
       * they are finished.
       */
      switchOn: boolean;
    }
  | { kind: 'ready_off' }
  | { kind: 'on'; maxPerDay: number };

export type QuickStopStateInput = {
  enabled: boolean;
  locked: boolean;
  lockedUntil: string | null;
  lockReason: string;
  feeSet: boolean;
  daysSet: boolean;
  stripeConnected: boolean;
  hasBookingUrl: boolean;
  maxPerDay: number;
};

const GAP_ORDER: Array<{ key: SetupGapKey; label: string; href: string; met: (input: QuickStopStateInput) => boolean }> = [
  // Ordered by what has to be true first. A customer needs somewhere to ask
  // from before anything else matters.
  { key: 'website', label: 'publish your website', href: '/dashboard/sites', met: (i) => i.hasBookingUrl },
  { key: 'weekdays', label: 'choose the days you take them', href: '/dashboard/quick-stops?tab=settings#quick-stop-setup', met: (i) => i.daysSet },
  { key: 'fee', label: 'set your fee band', href: '/dashboard/quick-stops?tab=settings#quick-stop-setup', met: (i) => i.feeSet },
  { key: 'stripe', label: 'connect Stripe', href: '/dashboard/settings#payments', met: (i) => i.stripeConnected },
];

export function quickStopState(input: QuickStopStateInput): QuickStopState {
  // Support's lock outranks everything, including the owner's own switch —
  // it is the only state they cannot resolve themselves.
  if (input.locked) {
    return {
      kind: 'paused',
      reason: input.lockReason || 'Paused after a reported no-show',
      untilIso: input.lockedUntil,
    };
  }

  // EVERY unmet requirement, never just the first. The old chain stopped at
  // whichever failed earliest, so an owner missing both their weekdays and
  // Stripe was told about the weekdays, fixed them, and only then learned there
  // was a second thing — one round trip per requirement, each one a surprise.
  const gaps = GAP_ORDER.filter((gap) => !gap.met(input)).map(({ key, label, href }) => ({ key, label, href }));
  if (gaps.length > 0) return { kind: 'setup_incomplete', gaps, switchOn: input.enabled };

  if (!input.enabled) return { kind: 'ready_off' };
  return { kind: 'on', maxPerDay: input.maxPerDay };
}

/** The word on the pill. Reads without colour, which is why the colour only agrees with it. */
export function quickStopStateLabel(state: QuickStopState): string {
  switch (state.kind) {
    case 'paused': return 'PAUSED';
    case 'setup_incomplete': return 'SETUP';
    case 'ready_off': return 'OFF';
    case 'on': return 'ON';
  }
}

/** The headline sentence — what is true right now, in one line. */
export function quickStopStateHeadline(state: QuickStopState): string {
  switch (state.kind) {
    case 'paused': return 'Paused by support';
    case 'setup_incomplete': return state.switchOn ? 'Switched on — not live yet' : 'Not set up yet';
    // The state the old code had no name for, and the reason it said "finish
    // the setup" to people who had finished it.
    case 'ready_off': return 'Ready — currently off';
    case 'on': return 'On — taking requests';
  }
}

/** "a", "a and b", "a, b and c". */
function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** The line under the headline. Names what is left, or what is happening. */
export function quickStopStateDetail(state: QuickStopState): string {
  switch (state.kind) {
    case 'paused': {
      const until = state.untilIso
        ? ` — reopens ${new Date(state.untilIso).toLocaleDateString('en-US', { dateStyle: 'medium' })}`
        : '';
      return `${state.reason}${until}. It lifts automatically.`;
    }
    case 'setup_incomplete': {
      const list = joinList(state.gaps.map((gap) => gap.label)).replace(/^./, (first) => first.toUpperCase());
      const stripeMissing = state.gaps.some((gap) => gap.key === 'stripe');
      return `${list} before this can take a request.${
        stripeMissing ? ' A Quick Stop is only confirmed once the customer has paid.' : ''
      }`;
    }
    case 'ready_off':
      // Said plainly, because the honest answer to "what is missing?" is
      // nothing. The old copy sent this owner looking for a setup step that did
      // not exist.
      return 'Everything is configured. Turn it on whenever you want to start taking same-day requests.';
    case 'on':
      return `Taking requests, up to ${state.maxPerDay} a day.`;
  }
}

/**
 * What the nav rail's pill shows.
 *
 * The rail had its own two-line rule that ignored setup gaps entirely, so it
 * could show green ON next to a page reading "Not live yet". 'off' covers both
 * ready-off and setup-incomplete: the rail has one word to spend and "not
 * accepting anything" is the true thing both states share.
 */
export function quickStopNavState(state: QuickStopState): 'on' | 'off' | 'paused' {
  if (state.kind === 'on') return 'on';
  if (state.kind === 'paused') return 'paused';
  return 'off';
}
