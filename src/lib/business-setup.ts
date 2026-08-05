import type { InsuranceState } from './insurance';

/**
 * "Is my account actually set up?" — answered in one place.
 *
 * The Business tab was a stack of eight forms with no way to tell, without
 * opening every one of them, whether anything was missing. This turns that into
 * a count and a short list.
 *
 * Two rules keep it from becoming nagware:
 *
 * 1. An ALERT means something is broken, not something you haven't done. A
 *    contractor who has never uploaded a certificate is not in trouble; one who
 *    uploaded a certificate that expired last week is, and so is one whose
 *    promotional emails have stopped sending. Only 'attention' raises a banner.
 *
 * 2. Optional things stay out of the denominator. A checklist that can never
 *    reach the end is a permanent guilt badge — QuickBooks is a connection some
 *    businesses will never want, and counting it would leave those accounts
 *    reading "5 of 6" forever with nothing wrong.
 */

export type SetupState =
  /** Done, or done well enough that nothing is degraded. */
  | 'complete'
  /** Started and now wrong — this is the only state that raises an alert. */
  | 'attention'
  /** Never done. Worth doing, not worth shouting about. */
  | 'todo';

export type SetupSection = 'profile' | 'costs' | 'trust' | 'apps';

export type SetupItem = {
  id: string;
  label: string;
  state: SetupState;
  /** The status line under the label — what is true right now. */
  detail: string;
  /** What pressing the row does about it. */
  actionLabel: string;
  section: SetupSection;
  /** Counted in "N of M". False for anything a business can legitimately never want. */
  essential: boolean;
};

export type BusinessFacts = {
  companyName: string | null;
  trade: string | null;
  zip: string | null;
  operatingAddress: string | null;
  mailingAddress: string | null;
  /** Did the address we geocode actually resolve to a point? */
  hasServiceCenter: boolean;
  /** False means the account is still on our default, which is a guess about somebody else's business. */
  burdenConfigured: boolean;
  burdenPct: number;
  insurance: InsuranceState;
  quickBooksConnected: boolean;
};

const has = (value: string | null): boolean => typeof value === 'string' && value.trim().length > 0;

/**
 * A PO box is a perfectly good CAN-SPAM address and a hopeless place to start a
 * working day from. Worth detecting, because the failure is silent: the route
 * planner measures out and back from whatever it geocoded, and a mail counter
 * two towns over just makes every day's mileage quietly wrong.
 */
export function looksLikePoBox(address: string | null): boolean {
  if (!has(address)) return false;
  return /\bp\.?\s*o\.?\s*box\b|\bpost\s+office\s+box\b/i.test(address as string);
}

function profileItem(facts: BusinessFacts): SetupItem {
  const missing = [
    has(facts.companyName) ? null : 'company name',
    has(facts.trade) ? null : 'trade',
    has(facts.zip) ? null : 'ZIP code',
  ].filter(Boolean) as string[];
  return {
    id: 'profile',
    label: 'Business profile',
    // Never 'attention': a half-filled profile is unfinished, not broken.
    state: missing.length === 0 ? 'complete' : 'todo',
    detail: missing.length === 0
      ? `${facts.companyName} · ${facts.trade}`
      : `Still needs your ${listWords(missing)}.`,
    actionLabel: missing.length === 0 ? 'Edit' : 'Finish setup',
    section: 'profile',
    essential: true,
  };
}

function operatingItem(facts: BusinessFacts): SetupItem {
  if (has(facts.operatingAddress)) {
    return {
      id: 'operating',
      label: 'Operating location',
      state: facts.hasServiceCenter ? 'complete' : 'attention',
      detail: facts.hasServiceCenter
        ? (facts.operatingAddress as string)
        : 'We couldn’t place this address on the map, so the drive to your first job isn’t being counted.',
      actionLabel: facts.hasServiceCenter ? 'Edit' : 'Fix address',
      section: 'profile',
      essential: true,
    };
  }
  // Not set, so the planner is using the mailing address. That is fine — unless
  // the mailing address is a box at the post office.
  if (looksLikePoBox(facts.mailingAddress)) {
    return {
      id: 'operating',
      label: 'Operating location',
      state: 'attention',
      detail: 'Your day is being measured from a PO box. Add the yard or shop you actually leave from.',
      actionLabel: 'Add location',
      section: 'profile',
      essential: true,
    };
  }
  if (has(facts.mailingAddress)) {
    return {
      id: 'operating',
      label: 'Operating location',
      state: 'complete',
      detail: `Using your mailing address — ${facts.mailingAddress}`,
      actionLabel: 'Change',
      section: 'profile',
      essential: true,
    };
  }
  return {
    id: 'operating',
    label: 'Operating location',
    state: 'todo',
    detail: 'Where the day starts and ends. Used to work out the drive to your first job and back from your last.',
    actionLabel: 'Add location',
    section: 'profile',
    essential: true,
  };
}

function mailingItem(facts: BusinessFacts): SetupItem {
  return {
    id: 'mailing',
    label: 'Mailing address',
    // 'attention', not 'todo': campaign emails do not send without this, so it
    // is something already broken rather than something not yet started.
    state: has(facts.mailingAddress) ? 'complete' : 'attention',
    detail: has(facts.mailingAddress)
      ? (facts.mailingAddress as string)
      : 'Promotional emails can’t send until this is set — anti-spam law requires a postal address in the footer.',
    actionLabel: has(facts.mailingAddress) ? 'Edit' : 'Add address',
    section: 'profile',
    essential: true,
  };
}

function costItem(facts: BusinessFacts): SetupItem {
  return {
    id: 'labor',
    label: 'True labor cost',
    state: facts.burdenConfigured ? 'complete' : 'todo',
    detail: facts.burdenConfigured
      ? `Adding ${facts.burdenPct}% on top of every wage.`
      : `Still on our default of ${facts.burdenPct}%. Set yours and every job cost gets more accurate.`,
    actionLabel: facts.burdenConfigured ? 'Review' : 'Set it up',
    section: 'costs',
    essential: true,
  };
}

function insuranceItem(facts: BusinessFacts): SetupItem {
  const state = facts.insurance;
  const base = { id: 'insurance', label: 'Proof of insurance', section: 'trust' as const, essential: true };
  switch (state.kind) {
    case 'none':
      return { ...base, state: 'todo', detail: 'No certificate on file. Upload one and it goes out with every quote.', actionLabel: 'Upload' };
    case 'undated':
      // The one people will actually hit. A certificate with no expiry date can
      // never be pulled automatically, so the day it lapses it keeps going out.
      return { ...base, state: 'attention', detail: 'On file, but with no expiry date we can’t stop it going out after it lapses.', actionLabel: 'Add expiry date' };
    case 'expiring':
      return { ...base, state: 'attention', detail: `Expires in ${state.daysLeft} day${state.daysLeft === 1 ? '' : 's'}. Quotes stop carrying it the day after.`, actionLabel: 'Upload renewal' };
    case 'expired':
      return { ...base, state: 'attention', detail: `Expired ${state.daysAgo} day${state.daysAgo === 1 ? '' : 's'} ago and is no longer on your quotes.`, actionLabel: 'Upload renewal' };
    case 'hidden':
      return { ...base, state: 'complete', detail: 'On file and in date, but switched off — it isn’t going out with quotes.', actionLabel: 'Review' };
    case 'valid':
    default:
      return { ...base, state: 'complete', detail: `In date for another ${state.daysLeft} days. Going out with every quote.`, actionLabel: 'Edit' };
  }
}

function quickBooksItem(facts: BusinessFacts): SetupItem {
  return {
    id: 'quickbooks',
    label: 'QuickBooks',
    state: facts.quickBooksConnected ? 'complete' : 'todo',
    detail: facts.quickBooksConnected
      ? 'Connected. Invoices and payments go across on their own.'
      : 'Not connected. Connect it and your invoices and payments post themselves.',
    actionLabel: facts.quickBooksConnected ? 'View sync' : 'Connect',
    section: 'apps',
    // Plenty of businesses do their books somewhere else, or on paper. Counting
    // this would leave them permanently one short with nothing wrong.
    essential: false,
  };
}

export type BusinessSetup = {
  items: SetupItem[];
  /** Only the essentials, so the fraction can actually be finished. */
  done: number;
  total: number;
  /** Everything in 'attention' — the banner shows these and nothing else. */
  alerts: SetupItem[];
};

export function businessSetup(facts: BusinessFacts): BusinessSetup {
  const items = [
    profileItem(facts),
    operatingItem(facts),
    mailingItem(facts),
    costItem(facts),
    insuranceItem(facts),
    quickBooksItem(facts),
  ];
  const essentials = items.filter((item) => item.essential);
  return {
    items,
    done: essentials.filter((item) => item.state === 'complete').length,
    total: essentials.length,
    alerts: items.filter((item) => item.state === 'attention'),
  };
}

/** "company name, trade and ZIP code" — an Oxford-less list for a sentence. */
export function listWords(words: string[]): string {
  if (words.length === 0) return '';
  if (words.length === 1) return words[0];
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** The headline over the progress ring. */
export function setupHeadline(setup: BusinessSetup): string {
  if (setup.alerts.length > 0) {
    return setup.alerts.length === 1 ? 'One thing needs attention' : `${setup.alerts.length} things need attention`;
  }
  if (setup.done === setup.total) return 'Everything essential is set up';
  const left = setup.total - setup.done;
  return left === 1 ? 'One more to go' : `${left} more to go`;
}
