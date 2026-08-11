import type { CSSProperties } from 'react';
import type { ContractorBrand } from '@/lib/contractor-brand';

/**
 * The contractor's name and mark, at the top of a page their customer opened.
 *
 * A server component with no interactivity, because these pages are the ones
 * that must render for somebody on a phone in a driveway with one bar of
 * signal. It also can't be the app shell's job: that bar is a client component
 * in the root layout and has no idea which account a link token belongs to,
 * which is exactly why it drew our logo on every one of these pages.
 *
 * `--accent` is re-pointed at the contractor's color on THIS BAR ONLY, not on
 * the page under it, and that is deliberate. Repainting the page's controls
 * would hand `.btn.primary` an arbitrary hex: a contractor who picks a deep
 * navy or a mid-blue gets a Pay button that fails contrast against this dark
 * ground, and there is no upper bound on what they can choose. The mark and the
 * name are the brand; the control color stays the one that is known to be
 * readable. Giving them the buttons too needs a derived, contrast-checked shade
 * — real work, not a variable swap.
 */
export function ContractorBrandBar({
  brand,
  /** What this page is — "Invoice", "Payment", "Your jobs". Sits under the name. */
  context,
}: {
  brand: ContractorBrand;
  context?: string;
}) {
  const style = { '--accent': brand.accent } as CSSProperties;
  return (
    <header className="cbrand" style={style}>
      <div className="cbrand-inner">
        <span className="cbrand-id">
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="cbrand-logo" src={brand.logoUrl} alt="" width={44} height={44} />
          ) : brand.markSvg ? (
            // Inline rather than a data-URI <img> so it inherits nothing and
            // costs no second request on a slow connection. Not a script, so the
            // enforcing CSP has no opinion about it.
            <span className="cbrand-mark" aria-hidden="true" dangerouslySetInnerHTML={{ __html: brand.markSvg }} />
          ) : null}
          <span className="cbrand-copy">
            <strong className="cbrand-name">{brand.businessName}</strong>
            {context ? <small className="cbrand-context">{context}</small> : null}
          </span>
        </span>

        <span className="cbrand-actions">
          {brand.phone ? (
            <a className="cbrand-call" href={`tel:${brand.phone.replace(/[^\d+]/g, '')}`}>
              {brand.phone}
            </a>
          ) : null}
          {brand.siteUrl ? (
            <a className="cbrand-site" href={brand.siteUrl} target="_blank" rel="noreferrer">
              Visit website
            </a>
          ) : null}
        </span>
      </div>
    </header>
  );
}

/**
 * Us, at the bottom, small.
 *
 * Worth keeping rather than dropping entirely: a homeowner who wants to check
 * that the payment page they were texted is run by a real company needs
 * something to check, and a page with no attribution at all is the shape of a
 * phishing page. It just isn't the headline.
 */
export function ContractorBrandFoot({ businessName }: { businessName: string }) {
  return (
    <p className="cbrand-foot">
      Sent by {businessName} · Powered by{' '}
      <a href="https://letsgetquoted.com" target="_blank" rel="noreferrer">
        Let&apos;s Get Quoted
      </a>
    </p>
  );
}
