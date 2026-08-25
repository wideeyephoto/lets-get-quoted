/**
 * ONE FOOTER LINK SET, TWO FOOTERS THAT HAVE TO RENDER IT.
 *
 * The public site ships two footer components and cannot ship one:
 * flagship/site-chrome's is styled entirely by rules scoped to `.root` (a full
 * CSS reset — see SiteHeaderSlot's note on why /pricing and friends cannot
 * adopt that wrapper), while components/site-footer draws from globals.css.
 * Merging the components means merging the two stylesheets, which is a much
 * larger change than the difference warrants.
 *
 * What was actually wrong is not that there are two components — it is that
 * they listed DIFFERENT LINKS. The homepage, /features and /how-it-works
 * offered six destinations and no way to reach Resources, the FAQ, Security or
 * the SMS terms; /pricing, the trade pages and the resource articles offered
 * twelve. Which pages a visitor could navigate to depended on which page they
 * happened to land on, and the four missing from the larger surfaces are
 * exactly the four somebody checks before trusting a product with their
 * business.
 *
 * So the LIST lives here and both components render it. The markup and the
 * styling stay separate; the answer to "what is in the footer" does not.
 *
 * Home is deliberately absent: both footers already link home from the logo (or
 * from the page they are on being it).
 */

export type FooterLink = readonly [href: string, label: string];

/** Product and company. The main row. */
export const FOOTER_PRIMARY: readonly FooterLink[] = [
  ['/features', 'Product'],
  ['/features/website-builder', 'Website'],
  ['/how-it-works', 'How it works'],
  ['/for', 'For your trade'],
  ['/pricing', 'Pricing'],
  ['/compare', 'Compare'],
  ['/tools', 'Free Tools'],
  ['/resources', 'Resources'],
  ['/faq', 'FAQ'],
  ['/founder', 'Founder'],
] as const;

/**
 * Legal, security and the way to reach a person. Quieter second row — the
 * convention people scan for, and the reason these are not mixed into the row
 * above.
 */
export const FOOTER_LEGAL: readonly FooterLink[] = [
  ['/security', 'Security'],
  ['/contact', 'Contact'],
  ['/privacy', 'Privacy'],
  ['/terms', 'Terms'],
  ['/sms-terms', 'SMS Terms'],
] as const;
