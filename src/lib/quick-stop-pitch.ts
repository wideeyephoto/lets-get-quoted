// The message that tells past customers Quick Stops exist.
//
// A feature nobody knows about produces exactly the demand you'd expect. The
// booking page has carried this for weeks and the queue stays empty, while the
// account's own job history says a good share of its work is the right shape —
// so the missing piece isn't the feature, it's that nobody was told.
//
// PURE, and written from the customer's side: they don't know or care what an
// "Quick Stop" is. What they recognise is "something broke and I'd rather not
// wait until next week."
//
// The fee is stated. Burying it would get more clicks and fewer bookings, and
// the first thing the booking page does is quote one anyway.

export type PitchInput = {
  businessName: string;
  bookingUrl: string;
  /** The floor of the owner's fee band, in cents. 0 when they haven't set one. */
  minFeeCents: number;
  /** How far ahead a customer can ask. 0 = same day only. */
  daysAhead: number;
};

export type QuickStopPitch = { subject: string; body: string; sms: string };

function money(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

/** "today" / "today or tomorrow" / "within a couple of days" */
function windowPhrase(daysAhead: number): string {
  if (daysAhead <= 0) return 'the same day';
  if (daysAhead === 1) return 'the same day or the next';
  return 'within a couple of days';
}

export function buildQuickStopPitch(input: PitchInput): QuickStopPitch {
  const when = windowPhrase(input.daysAhead);
  // Only promise a price when there is one to promise. "From $0" is worse than
  // saying nothing, and a band nobody set is not a band.
  const price = input.minFeeCents > 0 ? ` It starts at ${money(input.minFeeCents)}` : ' There’s a call-out fee';

  return {
    subject: `Need something fixed ${when}? We can usually fit you in`,
    body: [
      `Hi there,`,
      ``,
      `Quick one from ${input.businessName}.`,
      ``,
      `When something goes wrong you usually have to wait for the next opening. We’ve started keeping room on the van for short jobs, so if you catch us on a day we’re already out your way, we can often add you ${when}.`,
      ``,
      `It suits small stuff — a leak, a blockage, something that stopped working — not big installs.${price}, you see the exact amount before you agree to anything, and if we can’t fit you in you’re not charged.`,
      ``,
      `Tell us what’s wrong here and we’ll come straight back to you:`,
      input.bookingUrl,
      ``,
      `— ${input.businessName}`,
    ].join('\n'),
    // Kept tight on purpose. This is billed per 160-character segment PER
    // RECIPIENT, so a friendly extra clause is a bill, not a flourish. The URL
    // is whatever length the owner's domain is and isn't ours to shorten — the
    // prose around it is, and that is what the test holds.
    sms: `Something broken? We hold room for short jobs — often ${when}. Price up front: ${input.bookingUrl}`,
  };
}
