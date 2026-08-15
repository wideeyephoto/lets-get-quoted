/**
 * BreadcrumbList structured data for the three page clusters that have a real
 * hierarchy: /features/*, /for/* and /resources/*.
 *
 * WHAT IT BUYS. Google renders the trail in place of the raw URL in a result,
 * so "letsgetquoted.com › For your trade › Roofers" replaces
 * "letsgetquoted.com/for/roofers". On 65 pages whose parent index is the page
 * doing the ranking work, that is the difference between a result that shows
 * where it sits and one that shows a slug.
 *
 * WHAT IT MUST NOT DO. The trail has to match a path the visitor can actually
 * walk — every level here is a real, linked, indexable page — and the last item
 * is the current page. Inventing a tier that has no page is the way this markup
 * gets a manual action rather than a rich result.
 *
 * The `item` on the final crumb is deliberately present. It is optional in the
 * spec, and Google is happy either way, but omitting it means the object is the
 * only one in the list without an identity, which makes the JSON harder to
 * diff against the sitemap when one of these slugs changes.
 */

const ORIGIN = 'https://letsgetquoted.com';

export type Crumb = {
  name: string;
  /** Path from the site root, e.g. "/for/roofers". "/" for home. */
  path: string;
};

export function breadcrumbJsonLd(trail: Crumb[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: `${ORIGIN}${crumb.path === '/' ? '' : crumb.path}`,
    })),
  };
}

/** The crumb every trail starts from. */
export const HOME_CRUMB: Crumb = { name: 'Home', path: '/' };
