/**
 * THE FIVE MESSAGES EVERY CONTRACTOR SENDS.
 *
 * Saved replies started empty, with a panel inviting you to write some. That is
 * the wrong way round: the whole value of a canned reply is not having to
 * compose one, and a contractor standing in a driveway at 7:40am with a job
 * running late is not going to open a manager and type a template first. The
 * empty state was asking for work at precisely the moment somebody wanted less
 * of it.
 *
 * These are not rows. Nothing is written to a database, nothing is seeded on
 * signup, and nothing has to be migrated onto the accounts that already exist —
 * they are simply always there, in their own group, ahead of whatever the
 * contractor has saved. Pressing one FILLS THE BOX; it does not send. Every one
 * of them is a first draft somebody is expected to adjust before pressing Send,
 * which is why none of them commits to a time, a price or a date the app cannot
 * verify.
 *
 * WHY THESE FIVE. They are the moments where saying nothing is the actual
 * failure: arriving, not arriving, the quote landing, money still open, and the
 * job being over. Four of the five exist to stop a customer wondering.
 *
 * The greeting takes the customer's first name when the thread has one and
 * degrades to "Hi there" when it does not — a text from a number nobody in the
 * book owns is an ordinary event in this inbox, and "Hi ," is worse than no
 * name at all.
 */

export type StarterReply = {
  id: string;
  title: string;
  /** Given the customer's first name, or null when the number is unknown. */
  body: (firstName: string | null) => string;
};

/** "Dana Whitfield" → "Dana". Null in, null out. */
export function firstNameOf(name: string | null | undefined): string | null {
  const first = (name ?? '').trim().split(/\s+/)[0] ?? '';
  // Guard against a "name" that is really a phone number or a company suffix
  // like "LLC" — greeting somebody as "Hi 2485550117," is worse than "Hi there".
  if (!first || /\d/.test(first)) return null;
  return first;
}

const greet = (firstName: string | null) => (firstName ? `Hi ${firstName},` : 'Hi there,');

export const STARTER_REPLIES: readonly StarterReply[] = [
  {
    id: 'on-my-way',
    title: 'On my way',
    body: (n) => `${greet(n)} on my way to you now. I'll text again when I'm pulling up.`,
  },
  {
    id: 'running-late',
    title: 'Running late',
    body: (n) =>
      `${greet(n)} I'm running behind this morning and I don't want to leave you guessing. I'll be with you as soon as I can and I'll text you a proper time within the hour. Sorry for the mess-around.`,
  },
  {
    id: 'quote-sent',
    title: 'Quote sent',
    body: (n) =>
      `${greet(n)} your quote is ready — the link I've sent opens it, and you can approve it right there. Nothing is booked until you do. Happy to walk through any line of it if you'd like.`,
  },
  {
    id: 'payment-due',
    title: 'Payment reminder',
    body: (n) =>
      `${greet(n)} just a gentle reminder that the balance is still open. The payment link in your last message is still live. If anything about it isn't working, tell me and I'll sort it.`,
  },
  {
    id: 'job-finished',
    title: 'Job finished',
    body: (n) =>
      `${greet(n)} all finished and tidied up. Thanks for having us out. If anything isn't right, tell me and I'll come back — and if you were happy with it, a quick review genuinely helps a small business like mine.`,
  },
] as const;

/** The five, resolved against whoever this thread is with and contractor's sign-off. */
export function starterRepliesFor(
  clientName: string | null | undefined,
  signoff?: string | null,
): { id: string; title: string; body: string }[] {
  const first = firstNameOf(clientName);
  const cleanSignoff = (signoff ?? '').trim();
  const suffix = cleanSignoff ? ` ${cleanSignoff.startsWith('—') || cleanSignoff.startsWith('-') ? cleanSignoff : `— ${cleanSignoff}`}` : '';
  return STARTER_REPLIES.map((reply) => ({
    id: reply.id,
    title: reply.title,
    body: `${reply.body(first)}${suffix}`,
  }));
}
