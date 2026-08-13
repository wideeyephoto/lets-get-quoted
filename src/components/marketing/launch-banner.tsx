import { LAUNCH_DETAIL, LAUNCH_HEADLINE, LAUNCH_LABEL, isLaunchBannerEnabled } from '@/lib/launch-status';
import styles from './launch-banner.module.css';

/**
 * The pre-launch notice, at the very top of our own public pages.
 *
 * NOT DISMISSIBLE, and that is a decision rather than an omission. A dismiss
 * button would need a cookie to remember the choice, and the one visit where
 * this sentence matters most is the one where somebody arrives on the pricing
 * page from a search result and signs up in ninety seconds. The banner is two
 * lines and it is the truth; it stays.
 *
 * `role="status"` rather than `role="alert"`: this is a standing fact about the
 * product, not something that just happened. An alert would interrupt a screen
 * reader mid-sentence on every navigation.
 *
 * WHERE THIS IS AND IS NOT RENDERED is the part worth getting right, and the
 * rule is "our own sales pages, nowhere else":
 *
 *   YES — /, /features, /how-it-works, /pricing, /faq, /founder, /contact and
 *         the rest of isMarketingPath.
 *   NO  — a contractor's published website. Their site is theirs; our launch
 *         status is not their announcement.
 *   NO  — the dashboard. A signed-in owner has already read this once and does
 *         not need it on every page of the thing they are using.
 *   NO  — any token-bearing page a homeowner was sent: an invoice, a payment
 *         link, a job feed, a booking page, a subcontractor offer. Somebody
 *         about to pay a bill does not need to be told the product is not
 *         finished, and saying so there would cost the contractor the payment.
 */
export default function LaunchBanner({
  /**
   * True on the pages that render <SiteHeader /> directly, where nothing
   * reserves the fixed header's height. False (the default) after
   * <SiteHeaderSlot />, which is itself the spacer. See the long note in
   * launch-banner.module.css — the two cases look identical in the code and
   * completely different on screen.
   */
  offsetHeader = false,
}: { offsetHeader?: boolean } = {}) {
  if (!isLaunchBannerEnabled()) return null;

  return (
    <div className={`${styles.banner}${offsetHeader ? ` ${styles.offsetHeader}` : ''}`} role="status">
      <p className={styles.inner}>
        <span className={styles.badge}>{LAUNCH_LABEL}</span>
        <span className={styles.headline}>{LAUNCH_HEADLINE}</span>
        <span className={styles.detail}>{LAUNCH_DETAIL}</span>
      </p>
    </div>
  );
}
