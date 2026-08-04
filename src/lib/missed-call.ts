// Missed-call text-back: the message, and whether the plumbing is actually
// connected.
//
// Pure and dependency-free so the settings preview and the sender can share it.
// A preview that is written out by hand in the UI is a preview that drifts from
// what the caller receives, and the whole point of showing it is that a
// contractor can read the words that go out under their name.

/**
 * The text an unanswered caller gets.
 *
 * Kept here rather than inline in sms.ts so the settings card renders the real
 * thing. Includes the STOP line: it is part of what the caller sees, and an
 * owner should be able to see the opt-out is handled without asking.
 */
export function missedCallTextBack(businessName: string): string {
  const name = businessName.trim() || 'us';
  return `Let's Get Quoted: sorry we missed your call at ${name}! Reply here and we'll help you out. Reply STOP to opt out.`;
}

export type MissedCallTone = 'live' | 'waiting' | 'setup' | 'error';

export type MissedCallStatus = {
  tone: MissedCallTone;
  label: string;
  detail: string;
};

export type MissedCallInput = {
  enabled: boolean;
  /** The contractor's real line — where the tracking number rings first. */
  forwardNumber: string | null;
  /** The number customers dial. */
  trackingNumber: string | null;
  /** When we first saw a real call arrive on that number. Null = never. */
  verifiedAt: string | null;
};

/**
 * What to say about the connection, and never more than we know.
 *
 * "Connected" is deliberately NOT derived from "they typed a number into a
 * box" — the number also has to have its Voice webhook pointed at us in Twilio,
 * which is a thing we cannot see from here. So the only honest evidence is a
 * call that actually arrived, which is what verifiedAt records.
 *
 * There is no "number disconnected" state. A released or re-pointed number
 * sends us nothing, and silence is indistinguishable from a quiet week — a red
 * "disconnected" warning that fires on a slow Tuesday teaches people to ignore
 * warnings.
 */
export function missedCallStatus(input: MissedCallInput): MissedCallStatus {
  if (!input.trackingNumber) {
    return {
      tone: 'setup',
      label: 'Setup needed',
      detail: 'Add the number your customers call. Don’t have a separate one yet? We’ll set it up for you.',
    };
  }

  // The live failure: callers hear a dead-end recording instead of ringing
  // anybody. Worth shouting about, because from the outside it looks like the
  // business has stopped answering the phone.
  if (!input.forwardNumber) {
    return {
      tone: 'error',
      label: 'Calls aren’t reaching you',
      detail: 'There’s no phone for your tracking number to ring, so callers hear a recording. Add one below.',
    };
  }

  if (!input.verifiedAt) {
    return {
      tone: 'waiting',
      label: 'Waiting for the first call',
      detail: 'Your numbers are saved. We’ll confirm the connection the first time someone calls your tracking number.',
    };
  }

  return {
    tone: 'live',
    label: 'Tracking number connected',
    detail: input.enabled
      ? 'Unanswered calls receive an automatic text-back.'
      : 'Calls still ring your phone. Unanswered ones get no text while this is off.',
  };
}
