import {
  Anton,
  Barlow,
  Bebas_Neue,
  DM_Sans,
  Fraunces,
  Instrument_Sans,
  Inter,
  Manrope,
  Montserrat,
  Oswald,
  Outfit,
  Plus_Jakarta_Sans,
  Poppins,
  Sora,
  Urbanist,
  Work_Sans,
} from 'next/font/google';

/**
 * THE FONTS A CONTRACTOR'S OWN SITE CAN USE, LOADED WHERE THEY ARE USED.
 *
 * These sixteen families used to be declared in the root layout, which meant
 * every page in the product carried their @font-face rules: the marketing site,
 * the dashboard, the admin console, the booking page. Measured against the
 * production build before this change, one stylesheet of nothing but
 * `next/font` output was 51KB and held 164 @font-face rules across 40 families
 * (twenty real, twenty metric-override fallbacks), and it loaded on every
 * single route. Four of those families are the product's own; the rest exist so
 * a plumber can pick Oswald for their headings.
 *
 * Declaring them here instead puts them in the CSS chunk of the routes that
 * import this module, which Next works out for itself. That is the whole point
 * of putting the loaders next to the templates rather than in a route layout:
 * the coupling is to the COMPONENT that needs the fonts, so a route added later
 * cannot forget them, and a route that renders no contractor branding cannot
 * accidentally inherit them.
 *
 * WHAT IS NOT HERE, and why. IBM Plex Sans, Space Grotesk, JetBrains Mono and
 * Geist stay in the root layout: three are the product's own type and the
 * fourth is the marketing site's body face. Several templates also fall back to
 * `--font-display` (Space Grotesk) for their headings, so it has to be global
 * regardless.
 *
 * ADDING A SURFACE. Anywhere a site's own header_font or brandFont is applied —
 * a template root, the booking page's --book-display, the builder's font picker
 * — has to carry `templateFontVars` or the choice silently degrades to a system
 * font on a customer's live website. test/template-fonts.test.ts checks the
 * known surfaces so that failure mode is loud rather than discovered by a
 * contractor.
 */

// --- template theme faces: the display + body pairing each theme is built on
const forgeDisplayFont = Anton({ subsets: ['latin'], variable: '--font-forge-display', weight: '400' });
const forgeBodyFont = Barlow({ subsets: ['latin'], variable: '--font-forge-body', weight: ['400', '500', '600'] });
const guildDisplayFont = Fraunces({ subsets: ['latin'], variable: '--font-guild-display', weight: ['400', '600'] });
const guildBodyFont = Work_Sans({ subsets: ['latin'], variable: '--font-guild-body', weight: ['400', '500', '600'] });
const vistaBodyFont = Inter({ subsets: ['latin'], variable: '--font-vista-body', weight: ['400', '500', '600'] });
const careFont = Poppins({ subsets: ['latin'], variable: '--font-care', weight: ['400', '500', '600', '700', '800'] });

// --- the curated heading picker (see HEADING_FONT_OPTIONS in WebsiteBuilder).
// Variable fonts omit `weight` to ship the whole axis in one file; Bebas is
// single-weight.
const manropeFont = Manrope({ subsets: ['latin'], variable: '--font-manrope' });
const jakartaFont = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta' });
const dmSansFont = DM_Sans({ subsets: ['latin'], variable: '--font-dmsans' });
const instrumentFont = Instrument_Sans({ subsets: ['latin'], variable: '--font-instrument' });
const outfitFont = Outfit({ subsets: ['latin'], variable: '--font-outfit' });
const soraFont = Sora({ subsets: ['latin'], variable: '--font-sora' });
const urbanistFont = Urbanist({ subsets: ['latin'], variable: '--font-urbanist' });
const montserratFont = Montserrat({ subsets: ['latin'], variable: '--font-montserrat' });
const oswaldFont = Oswald({ subsets: ['latin'], variable: '--font-oswald' });
const bebasFont = Bebas_Neue({ subsets: ['latin'], variable: '--font-bebas', weight: '400' });

/**
 * Every variable above, as one className. Put it on the outermost element of
 * any surface that renders a contractor's own branding.
 */
export const templateFontVars = [
  forgeDisplayFont.variable,
  forgeBodyFont.variable,
  guildDisplayFont.variable,
  guildBodyFont.variable,
  vistaBodyFont.variable,
  careFont.variable,
  manropeFont.variable,
  jakartaFont.variable,
  dmSansFont.variable,
  instrumentFont.variable,
  outfitFont.variable,
  soraFont.variable,
  urbanistFont.variable,
  montserratFont.variable,
  oswaldFont.variable,
  bebasFont.variable,
].join(' ');
