import type { Site } from '@/lib/sites';
import { cspNonce } from '@/lib/csp-nonce';
import { buildLocalBusinessJsonLd } from '@/lib/seo/site-seo';

// Serialize JSON-LD safely for an inline <script>: escape the one sequence that
// could break out of the element if it appears in contractor-entered text.
function jsonLdSafe(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

// Emits LocalBusiness identity structured data (name, phone, area served,
// image, logo, canonical URL, description) for a published contractor site,
// using the most specific schema.org subtype the trade supports. Deliberately
// carries NO aggregateRating/review — Google disallows self-serving review
// markup on a LocalBusiness, so that stays out until reviews come from a
// verified third-party source. The node is built by the shared, tested
// buildLocalBusinessJsonLd so it stays consistent with the page's <title>/meta.
// Rendered once from the public routes, so it covers every template.
export default function SiteStructuredData({ site }: { site: Site }) {
  const data = buildLocalBusinessJsonLd(site);
  if (!data) return null;
  // nonce: script-src covers ld+json too, and Next only stamps its own scripts.
  // Without this, enforcing the CSP would drop this tag from every contractor
  // site — invisibly, since nothing on the page changes. See lib/csp-nonce.
  return <script type="application/ld+json" nonce={cspNonce()} dangerouslySetInnerHTML={{ __html: jsonLdSafe(data) }} />;
}
