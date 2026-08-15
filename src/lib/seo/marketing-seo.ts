/**
 * Length budgets for the public marketing site's <title> and <meta description>,
 * and the one helper that keeps titles inside them.
 *
 * These are not house style — they are where Google stops rendering. A title
 * past ~60 characters and a description past ~160 are truncated with an
 * ellipsis in the result, so the last clause is written for nobody. The audit
 * found 29 trade titles and 30 trade descriptions over the line, plus a
 * homepage description of 364 characters — more than twice what is shown.
 *
 * (Truncation is really by pixel width, not character count; 60/160 is the
 * conventional proxy and is what the guard test below enforces. It is a
 * deliberate approximation, not a measurement.)
 */

export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 160;

/** What the root layout's title template appends. Kept in sync by the test. */
export const BRAND_SUFFIX = ' · Let’s Get Quoted';

/**
 * The brand on the end of a page title, but only when it still fits.
 *
 * The root layout sets `title.template = "%s · Let's Get Quoted"`, which is
 * right for most of the site and is exactly what pushed 29 of the 49 trade
 * titles over the limit: "Website & Software for Water Damage Restoration
 * Companies" is 57 characters on its own and 76 with the brand, so the brand —
 * the part that was added for recognition — was itself the part being cut off,
 * taking the trade name with it.
 *
 * A page that calls this uses `title: { absolute: … }` to opt out of the
 * template, and gets the brand back whenever there is room for it. Short trades
 * ("Website & Software for Roofers") keep it; long ones drop it and spend the
 * characters on the words somebody actually searched for. The brand is still on
 * the page — in the H1's neighbourhood, the OpenGraph title, and the site name
 * Google shows above the result.
 */
export function titleWithBrand(title: string): string {
  const withBrand = `${title}${BRAND_SUFFIX}`;
  return withBrand.length <= TITLE_MAX ? withBrand : title;
}
