/** @type {import('next').NextConfig} */

// Derive the Supabase Storage hostname from the public env var at config-eval
// time (mirrors src/lib/supabase-url.ts). Falls back to a wildcard so a
// missing/garbled env var never crashes the build and uploads still load once
// the var is set.
function supabaseImageHost() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, '');
  if (raw) {
    const dash = raw.match(/https?:\/\/supabase\.com\/dashboard\/project\/([a-z0-9-]+)/i);
    if (dash) return `${dash[1]}.supabase.co`;
    try {
      return new URL(raw).hostname;
    } catch {
      // fall through to the wildcard
    }
  }
  return '**.supabase.co';
}

// Baseline security headers applied to every response. Deliberately conservative:
// clickjacking (X-Frame-Options + CSP frame-ancestors 'self' — the builder frames
// its own preview same-origin, so 'self' is safe), MIME-sniff, transport, and
// referrer.
//
// The full content CSP (script-src/style-src) is NOT here, and the reason has
// changed since this was written: it isn't "not yet built", it's that it needs a
// per-request nonce, which static config can't produce. It lives in lib/csp.ts
// and is set by middleware.ts. The frame-ancestors line below is the
// belt-and-braces copy covering any response the middleware matcher skips.
const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // includeSubDomains is load-bearing, not decorative: every contractor site is
  // a subdomain of the root domain, and one subdomain reachable over plain HTTP
  // is enough to plant a cookie the parent domain will read. Vercel already
  // serves all of these over HTTPS, so this only closes a downgrade path we
  // never use.
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self)' },
];

const nextConfig = {
  // Lets a verification build go somewhere other than `.next`. Building into the
  // running dev server's `.next` leaves it holding a production bundle, and the
  // dev server then 500s on every route until it is deleted and restarted.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  // pdfkit reads its standard fonts from .afm files on disk at runtime
  // (js/data/Helvetica.afm and friends). Webpack bundles the JS and leaves the
  // font data behind, so every PDF threw ENOENT the moment it tried to set a
  // font — which is every PDF. Marking it external keeps it in node_modules
  // where it can find its own files.
  //
  // This broke BOTH the "Download PDF" link and the PDF attached to invoice
  // emails; the email path caught the failure and sent without an attachment,
  // so it looked like it was working.
  serverExternalPackages: ['pdfkit'],
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
  // /features is a real page again — it is no longer folded into the homepage,
  // so there is deliberately no rule for it here. Do not re-add one: a redirect
  // on that source would shadow the live route and take its five sub-pages with
  // it (/features/ai-intake and friends inherit nothing from this rule, but the
  // index they all link back to would 308 away).
  async redirects() {
    return [
      // "Extra Stops" became "Quick Stops". These sources are the OLD paths and
      // must stay spelled that way — a find-and-replace over this file turns
      // every rule below into a redirect to itself.
      //
      // The first one is not tidiness: it is live in customers' phones. Every
      // status link this product has ever texted points at /extra-stop/<id>, and
      // a sent message cannot be edited, so that path has to resolve forever.
      //
      // `permanent: true` is a 308, which preserves the METHOD. That matters for
      // the qualify endpoint: a browser still running a cached copy of the old
      // booking page would POST to the old path, and a 308 forwards the POST
      // instead of turning it into a GET and dropping the body.
      { source: '/extra-stop/:id', destination: '/quick-stop/:id', permanent: true },
      { source: '/dashboard/extra-stops', destination: '/dashboard/quick-stops', permanent: true },
      { source: '/admin/extra-stops', destination: '/admin/quick-stops', permanent: true },
      { source: '/admin/extra-stops/:id', destination: '/admin/quick-stops/:id', permanent: true },
      { source: '/api/public/leads/extra-stop-qualify', destination: '/api/public/leads/quick-stop-qualify', permanent: true },
      { source: '/api/cron/extra-stop-sweep', destination: '/api/cron/quick-stop-sweep', permanent: true },
      // "Text-to-Record" became "Text-to-Job".
      { source: '/features/text-to-record', destination: '/features/text-to-job', permanent: true },
      // Convenience shortcuts for quick-stops feature page.
      { source: '/quickstops', destination: '/features/quick-stops', permanent: true },
      { source: '/quick-stops', destination: '/features/quick-stops', permanent: true },
      // Convenience shortcuts for AI Copilot / Sparky feature page.
      { source: '/sparky', destination: '/features/sparky', permanent: true },
      { source: '/ai-copilot', destination: '/features/ai-copilot', permanent: true },
      { source: '/copilot', destination: '/features/ai-copilot', permanent: true },
      { source: '/aicopilot', destination: '/features/ai-copilot', permanent: true },
      // The campaign composer moved onto the seasonal-calendar page when the two
      // became one destination. Here rather than as a redirect() in a page
      // component: that renders, and by the time the redirect throws Next has
      // already flushed the shell, so it cannot set a status and falls back to a
      // <meta refresh> — a 200, a blank flash, and nothing a non-browser client
      // will follow. This fires before any render. Next carries the querystring
      // across on its own, so ?draft= and ?sent= survive.
      //
      // Canonical dashboard redirects
      { source: '/dashboard/payroll', destination: '/dashboard/crew', permanent: true },
      { source: '/dashboard/campaigns', destination: '/dashboard/marketing/campaigns', permanent: false },
      { source: '/dashboard/quotes', destination: '/dashboard/jobs', permanent: false },
      { source: '/dashboard/timecards', destination: '/dashboard/crew?tab=timecards', permanent: false },
      { source: '/dashboard/price-book', destination: '/dashboard/services', permanent: false },
      { source: '/dashboard/invoices', destination: '/dashboard/payments', permanent: false },
      { source: '/dashboard/reports/cash-flow', destination: '/dashboard/cash-flow', permanent: false },
      { source: '/dashboard/intake', destination: '/dashboard/automations#intake-ai', permanent: false },
    ];
  },
  images: {
    formats: ['image/webp'],
    qualities: [75, 80],
    remotePatterns: [
      { protocol: 'https', hostname: 'files.cdn.printful.com', pathname: '/**' },
      { protocol: 'https', hostname: 'images.unsplash.com', pathname: '/**' },
      { protocol: 'https', hostname: 'images.pexels.com', pathname: '/**' },
      { protocol: 'https', hostname: supabaseImageHost(), pathname: '/storage/v1/object/public/**' },
    ],
  },
};

export default nextConfig;
