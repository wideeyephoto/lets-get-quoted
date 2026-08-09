import type { ReactNode } from 'react';
import { SiteHeaderSlot } from './site-chrome';

/**
 * ONE HEADER, ON EVERY PUBLIC PAGE.
 *
 * The marketing site was wearing three of them. Clicking the five nav links in
 * order took a visitor through all three:
 *
 *   /  /features  /how-it-works    the real one — 82px, fixed, full bleed
 *   /for  /pricing  /faq  …        AppShell's public top bar — 70px, sticky,
 *                                  a solid CTA and an extra button
 *   /founder                       MarketingHeader — 100px, static, a floating
 *                                  rounded card with a different logo and a
 *                                  nav that omitted "For your trade" and
 *                                  "Founder" while carrying FAQ and Contact
 *
 * This is the layout every one of those routes now mounts. It renders nothing
 * but the header, so a page keeps its own <main>, its own footer and its own
 * stylesheet — see SiteHeaderSlot for why the header can be dropped onto a
 * page that is not written in the flagship language, and §100 in
 * scripts/generate-flagship-css.mjs for what the wrapper has to reserve.
 *
 * A layout rather than a line in each page: /for and /resources each have an
 * index and a detail route, and there is no version of this where one of them
 * should have a different header from the other.
 *
 * EVERY ROUTE THAT MOUNTS THIS MUST ALSO BE ON OWN_CHROME_MARKETING_ROUTES
 * (src/lib/marketing-chrome.ts), or the page gets two headers. The pairing is
 * covered by test/marketing-chrome.test.ts.
 */
export default function PublicHeaderLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeaderSlot />
      {children}
    </>
  );
}
