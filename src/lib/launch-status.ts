/**
 * "Coming Summer 2026" — the one place that says so.
 *
 * WHY A BANNER AND NOT A LANDING PAGE. The product is real and most of it works;
 * what is not connected yet is the carrier registration behind outbound text
 * messaging, and that is the spine of half the promises the marketing site
 * makes — the quote that texts a homeowner, the arrival window, the payment
 * link, the subcontractor offer. Letting somebody sign up believing those send
 * today is the kind of thing they find out about at the worst possible moment,
 * standing in a customer's kitchen. So the site keeps selling the product and
 * states the one thing that is not on yet, above the fold, on every public page.
 *
 * WHY IT IS TIED TO MESSAGING RATHER THAN A DATE. `LAUNCH_BANNER_ENABLED` reads
 * an environment variable rather than comparing today to a hard-coded day,
 * because the thing that ends this banner is a carrier approval landing — not a
 * calendar page turning. A date-based flag would remove the notice on schedule
 * whether or not the sentence it makes had become true.
 *
 * TO TURN IT OFF: set NEXT_PUBLIC_LAUNCH_BANNER=off. One variable, no deploy of
 * this file, and nothing else in the app changes.
 *
 * Deliberately NOT shown on: a contractor's own published website (their site is
 * not our announcement space), the dashboard (a signed-in owner already knows),
 * or any token-bearing page a homeowner was sent — an invoice, a payment link, a
 * job feed. Somebody paying a bill does not need to be told the product is not
 * finished. See LaunchBanner's own note and isMarketingPath.
 */

export const LAUNCH_LABEL = 'Coming Summer 2026';

export const LAUNCH_HEADLINE = 'Let’s Get Quoted is opening to contractors in Summer 2026.';

/**
 * The specific, checkable claim. Not "we're polishing things" — the reader is a
 * contractor deciding whether to trust their livelihood to this, and vagueness
 * at this moment reads as something being hidden.
 */
export const LAUNCH_DETAIL =
  'Text messaging is still going through carrier registration, so automatic texts — quote links, arrival updates, payment requests — are not sending yet. Everything else is live and free to explore.';

export { CAPABILITIES, VERIFIED_CLAIMS, type FeatureStatus } from './product-truth';

export function isLaunchBannerEnabled(): boolean {
  return process.env.NEXT_PUBLIC_LAUNCH_BANNER !== 'off';
}
