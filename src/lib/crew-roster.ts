// What the crew roster should tell you to do next.
//
// The Focus layout pins one instruction beside the list, the same way Hours &
// pay does, so the answer to "is my crew actually set up" doesn't depend on
// reading every row. This picks WHICH instruction, and the order matters more
// than the wording: the gaps are ranked by what they cost if left alone.
//
// Pure and dependency-free so the ranking can be tested without a roster, a
// database, or a browser.

import { needsInvite, type FieldAppState } from '@/lib/crew-invite';

export type RosterMember = {
  id: string;
  name: string;
  active: boolean;
  hourlyRate: number | null;
  fieldApp: FieldAppState;
  jobs: unknown[];
};

export type RosterStep = {
  /** Which gap this is, for the filter the card links to. */
  id: 'rate' | 'invite' | 'email' | 'revoked' | 'idle' | 'empty' | 'ready';
  title: string;
  body: string;
  /** Names to show under the instruction, so it's about people not a count. */
  names: string[];
  tone: 'alert' | 'warn' | 'ok';
};

function list(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

/**
 * The one thing worth doing about this crew right now.
 *
 * Ranked by consequence, not by how easy each is to fix:
 *
 *   1. No hourly rate. Their hours land on the pay screen at zero and quietly
 *      make every period total wrong — the only gap here that corrupts numbers
 *      rather than just inconveniencing somebody.
 *   2. Has an email, never invited. One click from being able to log their own
 *      hours from site instead of you keying them in.
 *   3. No email at all. Same destination, but it needs you to go and ask them
 *      for it, so it can't be the top ask.
 *   4. Everyone set up and nobody on a job. Not a fault — just the state where
 *      the useful thing is to assign somebody.
 */
export function rosterNextStep(members: RosterMember[]): RosterStep {
  const active = members.filter((member) => member.active);
  if (active.length === 0) {
    return {
      id: 'empty',
      title: 'No crew yet',
      body: 'Add the people who work with you and their hours, jobs and pay all roll up here.',
      names: [],
      tone: 'warn',
    };
  }

  const noRate = active.filter((member) => !(member.hourlyRate != null && member.hourlyRate > 0));
  if (noRate.length > 0) {
    return {
      id: 'rate',
      title: `${noRate.length} ${noRate.length === 1 ? 'person has' : 'people have'} no hourly rate`,
      body: 'Their hours cost nothing on the pay screen, so every period total is short until a rate is set.',
      names: noRate.map((member) => member.name),
      tone: 'alert',
    };
  }

  // Never invited AND invite-expired, together: from the owner's side they are
  // the same instruction — press the button — and separating them would leave
  // the expired ones sitting under a card that says everybody is set up. An
  // expired invitation used to read as "Not invited" and was indistinguishable
  // from one that had never been sent.
  const invitable = active.filter((member) => needsInvite(member.fieldApp));
  if (invitable.length > 0) {
    const expired = invitable.filter((member) => member.fieldApp === 'expired').length;
    return {
      id: 'invite',
      title: `Invite ${invitable.length} to the field app`,
      body: expired > 0
        ? `They can see their jobs and log their own hours from site. ${expired === invitable.length ? 'These invitations have' : `${expired} of these has`} expired — the link only lasts an hour.`
        : 'They can see their jobs and log their own hours from site, instead of you keying them in.',
      names: invitable.map((member) => member.name),
      tone: 'warn',
    };
  }

  const noEmail = active.filter((member) => member.fieldApp === 'no-email');
  if (noEmail.length > 0) {
    return {
      id: 'email',
      title: `${noEmail.length} ${noEmail.length === 1 ? 'person has' : 'people have'} no email`,
      body: 'An email address is what the field app invite goes to — without one they can only be texted job details.',
      names: noEmail.map((member) => member.name),
      tone: 'warn',
    };
  }

  // Below the setup gaps and above "nobody's on a job", because a revoked
  // member is a DELIBERATE state — somebody chose it — so it is reported rather
  // than treated as something to fix. It still earns a line: an owner who
  // revoked access during a dispute that has since been settled has no other
  // surface that would remind them.
  const revoked = active.filter((member) => member.fieldApp === 'revoked');
  if (revoked.length > 0) {
    return {
      id: 'revoked',
      title: `${revoked.length} ${revoked.length === 1 ? 'person has' : 'people have'} no field-app access`,
      body: 'They are still on the crew, but the app is shut to them. Invite them again to give it back.',
      names: revoked.map((member) => member.name),
      tone: 'warn',
    };
  }

  const idle = active.filter((member) => member.jobs.length === 0);
  if (idle.length > 0) {
    return {
      id: 'idle',
      title: `${idle.length} available right now`,
      body: 'Nobody has them booked. Assign a job and they get a text with the details.',
      names: idle.map((member) => member.name),
      tone: 'ok',
    };
  }

  return {
    id: 'ready',
    title: 'Everyone is set up and working',
    body: 'Rates are set, everyone is on the field app, and nobody is sitting idle.',
    names: [],
    tone: 'ok',
  };
}

/** "Danny, Mike and 2 more" — the names under the instruction. */
export function rosterStepNames(step: RosterStep): string {
  return list(step.names);
}

export type RosterTotals = {
  activeCount: number;
  onJob: number;
  available: number;
  archived: number;
  periodHours: number;
  periodPay: number;
};

export function rosterTotals(members: Array<RosterMember & { periodHours: number; periodPay: number; isBusyToday?: boolean }>): RosterTotals {
  const active = members.filter((member) => member.active);
  return {
    activeCount: active.length,
    onJob: active.filter((member) => Boolean(member.isBusyToday ?? member.jobs.length > 0)).length,
    available: active.filter((member) => !(member.isBusyToday ?? member.jobs.length > 0)).length,
    archived: members.length - active.length,
    // Across the ACTIVE crew only: an archived person's past hours are real, but
    // they aren't part of what this roster is currently costing.
    periodHours: active.reduce((sum, member) => sum + member.periodHours, 0),
    periodPay: active.reduce((sum, member) => sum + member.periodPay, 0),
  };
}
