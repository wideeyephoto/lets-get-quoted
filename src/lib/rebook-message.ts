/**
 * WHAT THE WIN-BACK NUDGE ACTUALLY SAYS, AND WHICH WAY IT LEAVES.
 *
 * The page offered one button — "Send booking link" — to every past customer,
 * and the two things a contractor wants to know before pressing it were both
 * absent: what the customer is about to receive, and whether it reaches them as
 * a text or as an email. Those are different messages with different rules (a
 * marketing email must carry a postal address; a text must carry an opt-out),
 * and one of them silently does not send at all when the business has no
 * mailing address on file.
 *
 * So both live here, as pure functions, and the senders and the preview read
 * the same ones. A preview built from a second copy of the copy is a preview
 * that starts telling the truth and stops at the first edit.
 */

export type RebookChannel = 'sms' | 'email' | 'none';

export type RebookReachInput = {
  /** A mobile with an opted-in consent row. */
  smsReady: boolean;
  /** An email on file that has not unsubscribed or bounced. */
  hasEmail: boolean;
};

export type RebookSendContext = {
  /** The published booking page. Without it there is no link to send. */
  bookingUrl: string | null;
  /**
   * The business's postal address. Absent, the email path is not merely
   * unattractive — deliverRebookInvite refuses to send it, because a marketing
   * email without a physical address is not lawful to send (CAN-SPAM).
   */
  mailingAddress: string | null;
};

/**
 * Which way this customer would be reached, by exactly the rule the sender
 * uses. Mirrors the branch in deliverRebookInvite: an opted-in mobile wins,
 * email is the fallback, and email needs the mailing address.
 */
export function rebookChannelFor(candidate: RebookReachInput, context: RebookSendContext): RebookChannel {
  if (!context.bookingUrl) return 'none';
  if (candidate.smsReady) return 'sms';
  if (candidate.hasEmail && context.mailingAddress) return 'email';
  return 'none';
}

/**
 * Why nothing can be sent — the four reasons, each with a different fix.
 *
 * The one worth separating out is the third: an email address on file, and no
 * business mailing address to put in the footer. The row looked reachable, the
 * button looked live, and the send came back "this client has no opted-in phone
 * or reachable email", which is not what was wrong.
 */
export function rebookBlockReason(candidate: RebookReachInput, context: RebookSendContext): string | null {
  if (!context.bookingUrl) return 'Publish your booking page';
  if (candidate.smsReady) return null;
  if (candidate.hasEmail && !context.mailingAddress) return 'Add your business mailing address';
  if (candidate.hasEmail) return null;
  return 'No opted-in mobile or email';
}

export const REBOOK_CHANNEL_LABEL: Record<RebookChannel, string> = {
  sms: 'Text',
  email: 'Email',
  none: 'Not reachable',
};

/** How many go each way, for the line above the "Send to all" button. */
export function rebookReachSplit(
  candidates: RebookReachInput[],
  context: RebookSendContext,
): { sms: number; email: number; none: number } {
  const split = { sms: 0, email: 0, none: 0 };
  for (const candidate of candidates) split[rebookChannelFor(candidate, context)] += 1;
  return split;
}

/* --- the two messages ------------------------------------------------------ */

export type RebookEmailContent = {
  subject: string;
  preheader: string;
  eyebrow: string;
  heading: string;
  paragraphs: string[];
  ctaLabel: string;
};

/**
 * The email's words, apart from the machinery that sends it.
 *
 * Read by sendRebookInviteEmail and by the preview on the page, so what the
 * contractor is shown is the message rather than a description of it.
 */
export function rebookInviteEmailContent(input: { businessName: string; clientName: string }): RebookEmailContent {
  return {
    subject: `Ready to book ${input.businessName} again?`,
    preheader: `Book ${input.businessName} again in a couple of taps`,
    eyebrow: 'We would love to help again',
    heading: `${input.clientName}, it has been a while!`,
    paragraphs: [
      `Thanks again for trusting ${input.businessName}. Whenever you are ready for your next project, you can grab a time online in a couple of taps — no phone tag.`,
    ],
    ctaLabel: 'Book us again',
  };
}

/**
 * The name the preview greets, when it is standing in for a real customer.
 *
 * A preview headed "there, it has been a while!" is a preview of a bug. The
 * page has a list of real names to hand, so it uses the first one it would
 * actually send to.
 */
export function previewFirstName(name: string | null | undefined): string {
  const first = (name || '').trim().split(/\s+/)[0] ?? '';
  // Digits mean the "name" is a phone number somebody typed into the name box.
  return first && !/\d/.test(first) ? first : 'Dana';
}
