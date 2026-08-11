/**
 * The Let's Get Quoted mark.
 *
 * WHY THIS REPLACED A PNG. The top bar rendered /SITE-LOGO-1.png — three
 * green-and-yellow tick tiles from a previous brand, dated months before the
 * orange the rest of the product uses. It was only visible on the surfaces that
 * get the minimal chrome, which is every HOMEOWNER-facing page: the client job
 * dashboard, an invoice, a payment. So the one logo a contractor's customer
 * ever saw was the one nothing else matched.
 *
 * Inline SVG rather than a new file: it is the same shape as public/favicon.png
 * (orange ring, dark disc, orange tick), it stays crisp at any size, it takes
 * its color from the accent token so a theme change cannot leave it behind,
 * and it costs no request on a page a homeowner opens once from a text.
 */
export default function BrandLogo({ className, size = 34 }: { className?: string; size?: number }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="32" cy="32" r="28" fill="var(--brand-disc, #0e1622)" />
      <circle cx="32" cy="32" r="28" fill="none" stroke="var(--accent, #ff7a21)" strokeWidth="6" />
      <path
        d="M20.5 33.5 28 41l16-17"
        stroke="var(--accent, #ff7a21)"
        strokeWidth="6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
