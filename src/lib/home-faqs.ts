/**
 * The homepage's questions, in one place.
 *
 * WHY THEY LIVE HERE. They are rendered twice: once as visible copy on the
 * homepage, and once as FAQPage structured data in the JSON-LD block. Google's
 * structured-data policy requires the marked-up content to be present on the
 * page — markup describing questions a visitor cannot see is grounds for a
 * manual action, not a rich result.
 *
 * Two copies of this array drift apart the first time somebody edits an answer,
 * and the drift is invisible: the page reads correctly and the schema quietly
 * describes a page that no longer exists. One array, read by both.
 */
export type HomeFaq = { q: string; a: string };

export const HOME_FAQS: HomeFaq[] = [
  {
    q: 'So what’s the catch?',
    a: 'Flex has no monthly base price and carries a 1.25% LGQ platform fee on eligible payments collected through LGQ. Solo, Growth, and Scale add a subscription in exchange for lower platform fees and more included capacity. There is no setup fee or contract; compare the exact prices and limits before choosing a plan.',
  },
  {
    q: 'Do you hold my money?',
    a: 'Never. Payments run on Stripe and land straight in your own bank account — we never touch your card numbers or park your cash. Our fee comes out of the payment automatically, the moment it clears.',
  },
  {
    q: 'How fast do I actually get paid?',
    a: 'Card and bank payments settle to your account on Stripe’s standard payout schedule — typically a couple of business days after a homeowner pays. You watch every payment land in your dashboard in real time.',
  },
  {
    q: 'Am I locked in? Do I keep my clients and my domain?',
    a: 'You’re never locked in — there’s no contract, and on a paid plan you cancel it yourself in Settings under Plan & usage. No email, no phone call, no retention script. The plan stays open until the end of the period you’ve already paid for and then stops renewing, and the workspace drops back to free Flex rather than closing. Your clients and job history stay yours, and any custom domain you connect is yours to keep.',
  },
  {
    q: 'Do I need my own website already?',
    a: 'No — building it is the first thing the platform does. Pick a template made for contractors, add your photos, and publish on the included subdomain or connect your own domain. Website capacity is included according to your plan.',
  },
  {
    q: 'Will this get me more leads, or just organize the ones I have?',
    a: 'Both — and here’s the honest line between them. Your new site plus the 24/7 AI Estimator captures and qualifies every visitor who lands on it, day or night, so far more of the traffic you already earn turns into booked jobs and not one lead slips through the cracks. It isn’t a lead-gen ad service — it makes the leads you’re already getting actually convert.',
  },
  {
    q: 'Is the AI going to talk to my customers without me?',
    a: 'Only the way you tell it to. You set your prices and the rules; the AI answers and prices jobs around the clock and alerts you the moment a real lead comes in. You stay the face of your business — nothing reaches a homeowner without your say.',
  },
];
