// Content Security Policy.
//
// Ships in REPORT-ONLY first, deliberately. A content CSP is the one header that
// breaks a working site silently and completely when it's wrong, and this app
// renders contractor-authored pages, embeds Google Maps and Cloudflare Turnstile,
// and iframes its own builder preview. Report-only lets real traffic tell us what
// the policy would have blocked before anything actually is; the enforcing flip is
// a one-line change once the reports are quiet (see cspHeaderName).
//
// Shape is the standard nonce + 'strict-dynamic' recipe:
//   - every script Next emits carries the per-request nonce (Next reads it back
//     out of this header — see middleware)
//   - 'strict-dynamic' extends that trust to scripts those scripts inject, which
//     is exactly how Google Maps and Turnstile load here (both are appended by our
//     own bundle), so neither needs a host allowlist
//   - `https:` and 'unsafe-inline' are ignored by any browser that understands
//     nonces/strict-dynamic; they're the graceful fallback for ones that don't

export type CspOptions = {
  nonce: string;
  // Browser talks to Supabase directly (auth + storage), so its origin has to be
  // reachable. Derived from the public env var; omitted if unset/garbled.
  supabaseOrigin?: string | null;
};

// Flip to 'content-security-policy' to enforce. Keep the two names in one place so
// enforcing is a single edit rather than a hunt through middleware.
//
// STILL REPORT-ONLY, AND HERE IS WHAT CHANGED (2026-08-03)
//
// The flip had a live blocker that report-only was never going to make obvious.
// script-src governs EVERY script element, `application/ld+json` included, and
// Next stamps the nonce only onto scripts it emits itself. Measured against the
// running app: 19 of 20 scripts on the homepage were nonced and the one that
// wasn't was the structured data — same on /pricing, /faq, /resources/[slug],
// the blog article template, and SiteStructuredData, which renders on every
// published contractor site.
//
// Enforcing then would have stripped LocalBusiness markup from every customer's
// site without changing a single pixel. Nothing would error; Google would just
// stop seeing it, and we'd have found out in the rankings weeks later. All six
// now read the nonce back via lib/csp-nonce — a contractor site measures 44/44.
//
// WHAT A FULL ENFORCING DRY RUN FOUND (2026-08-03)
//
// Rather than reading the policy again, the enforcing header was applied to the
// running app in a real browser — the report-only header rewritten in flight, so
// the exact shipped policy was enforced for real — and every route crawled with
// a securitypolicyviolation listener attached.
//
// It found one, and it was serious: there was NO media-src, so it fell back to
// default-src 'self' and every uploaded video on every contractor site was
// blocked. The whole video suite, killed silently, on the one directive nobody
// had thought to write. That is the shape of this bug class — a missing
// directive is invisible on the page, because the fallback does something that
// looks deliberate. Now fixed and covered by a test.
//
// Clean afterwards, under enforcement: /, /pricing, /faq, /features, /contact
// (Turnstile), /book, /login, /site/<contractor> (JSON-LD + YouTube embeds),
// /site-preview-frame, /demo, /resources. Dev-only eval violations from Next's
// HMR were ignored; production never serves them.
//
// STILL NOT FLIPPED, and here is the honest reason:
//
//   1. Google Maps is untested. It only renders on /dashboard/schedule/plan,
//      and in the harness it never injected its script at all, so CSP had
//      nothing to block and the run proves nothing about it. connect-src lists
//      maps.googleapis.com but NOT maps.gstatic.com, which is a plausible gap
//      nobody has measured. Check this before flipping.
//   2. A dev server is still not production. Vercel's CLI only tails live logs,
//      so the `[csp-report]` history the endpoint writes (see api/csp-report)
//      can't be read back here — the reports go to console.warn on purpose,
//      since persisting an unauthenticated browser-driven endpoint's input
//      would be attacker-controllable storage.
//
// So: ship the media-src fix, let real traffic run against the corrected policy,
// confirm a contractor's map and a published site with embeds both behave, then
// flip. The dry run moved this from "unknown" to "one known unknown".
export const CSP_REPORT_ONLY = true;
export const CSP_REPORT_PATH = '/api/csp-report';

export function cspHeaderName(): string {
  return CSP_REPORT_ONLY ? 'content-security-policy-report-only' : 'content-security-policy';
}

export function buildCsp({ nonce, supabaseOrigin }: CspOptions): string {
  const connect = ["'self'", 'https://maps.googleapis.com'];
  if (supabaseOrigin) {
    connect.push(supabaseOrigin);
    // Supabase realtime/auth refresh uses a websocket on the same host.
    connect.push(supabaseOrigin.replace(/^https:/, 'wss:'));
  }

  const directives: Array<[string, string[]]> = [
    ['default-src', ["'self'"]],
    ['script-src', ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", 'https:', "'unsafe-inline'"]],
    // Next injects <style> tags and React writes inline style attributes, neither
    // of which a nonce covers. This is the standard, accepted compromise.
    // fonts.googleapis.com: the Google Maps SDK pulls its own stylesheets from
    // there. Report-only caught this — without it, enforcing would have broken
    // every map in the app.
    ['style-src', ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com']],
    // Contractors pick their own photos (Unsplash, Pexels, Supabase storage, their
    // own hosts), so any https image is allowed. Low risk, and anything tighter
    // would be pure noise.
    ['img-src', ["'self'", 'data:', 'blob:', 'https:']],
    // fonts.gstatic.com is where the Maps SDK fetches the font files for its own
    // labels and controls — same story as style-src above.
    ['font-src', ["'self'", 'data:', 'https://fonts.gstatic.com']],
    // MEDIA. Without this, media-src falls back to default-src 'self' and every
    // uploaded video on every contractor site is blocked — the hero background
    // clip and every video band alike. Caught by running the enforcing policy
    // against a real contractor site rather than by reading the policy, which is
    // exactly the failure this directive list is prone to: what's missing is
    // invisible, because a fallback silently does something reasonable-looking.
    //
    // Same reasoning as img-src: `parseVideoSource` accepts any absolute https
    // URL ending in a video extension, so a contractor can link a clip they host
    // elsewhere just as they can link a photo. Nothing executes from a video, so
    // the tight version of this would be noise rather than defence.
    //
    // blob: is the builder — readVideoFrame plays the picked file from an object
    // URL to grab its poster before anything is uploaded.
    ['media-src', ["'self'", 'blob:', 'data:', 'https:']],
    ['connect-src', connect],
    // Turnstile renders in an iframe; the builder previews our own pages; the
    // post-intake intro video is a YouTube embed (nocookie host — see
    // lib/youtube). Listed now rather than when the CSP flips to enforcing: that
    // flip is a one-line change, and the video is the one embed whose breakage
    // nobody would notice, since it only ever renders after a stranger submits.
    ['frame-src', ["'self'", 'https://challenges.cloudflare.com', 'https://www.youtube-nocookie.com']],
    // Kept from the previous header — the builder frames its own preview.
    ['frame-ancestors', ["'self'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['object-src', ["'none'"]],
  ];

  const policy = directives.map(([name, values]) => `${name} ${values.join(' ')}`).join('; ');
  return `${policy}; report-uri ${CSP_REPORT_PATH}`;
}

// Per-request nonce. Web Crypto so it works in the Edge middleware runtime.
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
