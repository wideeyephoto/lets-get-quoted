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
// referrer. A full content CSP (script-src/style-src) is intentionally NOT set
// here — it needs per-route nonces/allowlists (Stripe.js, Google Maps, Next inline)
// and testing before it can go on without breaking rendering.
const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=()' },
];

const nextConfig = {
  // Lets a verification build go somewhere other than `.next`. Building into the
  // running dev server's `.next` leaves it holding a production bundle, and the
  // dev server then 500s on every route until it is deleted and restarted.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
  // /features folded into the homepage — keep the old URL alive for inbound
  // links, the footer, and any indexed pages.
  async redirects() {
    return [
      { source: '/features', destination: '/', permanent: true },
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
    ];
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com', pathname: '/**' },
      { protocol: 'https', hostname: 'images.pexels.com', pathname: '/**' },
      { protocol: 'https', hostname: supabaseImageHost(), pathname: '/storage/v1/object/public/site-images/**' },
    ],
  },
};

export default nextConfig;
