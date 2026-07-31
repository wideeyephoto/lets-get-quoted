// Which supply store a map pin is, at a glance.
//
// WHY NOT THE REAL LOGO. Shipping The Home Depot's or Lowe's actual logo means
// bundling and redistributing someone else's trademark, and a logo file is the
// one asset that quietly rots — a rebrand and every contractor's map is wrong.
// So each chain gets its own colour and its own initials, which is what anyone
// actually reads at 22 pixels anyway: orange square = Home Depot, blue = Lowe's,
// red = Ace. Recognisable without being a copy.
//
// Anything not on this list keeps a neutral storefront mark rather than being
// guessed at. An independent lumber yard mislabelled "HD" is worse than one
// labelled "supply store".
//
// Client-safe: names, colours and a pure matcher.

export type SupplyBrand = {
  /** Stable id — used by tests and to cache the drawn marker. */
  key: string;
  /** What to call it when the place's own name is unhelpful. */
  label: string;
  /** Up to three characters for the chip. Empty means "draw the storefront mark". */
  short: string;
  /** Chip fill, from the chain's own colour. */
  bg: string;
  /** Text/mark colour, picked for contrast against `bg`. */
  fg: string;
};

export const GENERIC_SUPPLY: SupplyBrand = {
  key: 'generic',
  label: 'Supply store',
  short: '',
  bg: '#12283c',
  fg: '#7dd3fc',
};

// Ordered: the first match wins, so anything that could be a substring of
// another name goes after it.
const BRANDS: Array<SupplyBrand & { match: RegExp }> = [
  { key: 'home-depot', label: 'The Home Depot', short: 'HD', bg: '#f96302', fg: '#ffffff', match: /home\s*depot/i },
  // "Lowe's Foods" is a grocery chain; the type filter keeps it out, but the
  // apostrophe is optional because Places writes it both ways.
  { key: 'lowes', label: "Lowe's", short: 'L', bg: '#004990', fg: '#ffffff', match: /\blowe'?s\b/i },
  // Requires the word "hardware" — a bare "ace" matches Palace, Ace Cafe, and
  // half the bars in Michigan.
  { key: 'ace', label: 'Ace Hardware', short: 'ACE', bg: '#e4002b', fg: '#ffffff', match: /\bace\b[^,]{0,12}\bhardware\b/i },
  { key: 'menards', label: 'Menards', short: 'M', bg: '#007a33', fg: '#ffffff', match: /menards/i },
  { key: 'true-value', label: 'True Value', short: 'TV', bg: '#d31245', fg: '#ffffff', match: /true\s*value/i },
  { key: 'do-it-best', label: 'Do It Best', short: 'DIB', bg: '#ee3124', fg: '#ffffff', match: /do\s*it\s*best/i },
  { key: 'harbor-freight', label: 'Harbor Freight Tools', short: 'HF', bg: '#c8102e', fg: '#ffffff', match: /harbor\s*freight/i },
  { key: 'northern-tool', label: 'Northern Tool', short: 'NT', bg: '#e31837', fg: '#ffffff', match: /northern\s*tool/i },
  { key: 'tractor-supply', label: 'Tractor Supply Co.', short: 'TSC', bg: '#a6192e', fg: '#ffffff', match: /tractor\s*supply/i },
  { key: 'sherwin-williams', label: 'Sherwin-Williams', short: 'SW', bg: '#0033a0', fg: '#ffffff', match: /sherwin/i },
  { key: 'benjamin-moore', label: 'Benjamin Moore', short: 'BM', bg: '#003da5', fg: '#ffffff', match: /benjamin\s*moore/i },
  { key: 'ferguson', label: 'Ferguson', short: 'F', bg: '#005eb8', fg: '#ffffff', match: /\bferguson\b/i },
  { key: 'grainger', label: 'Grainger', short: 'G', bg: '#cf102d', fg: '#ffffff', match: /grainger/i },
  { key: 'fastenal', label: 'Fastenal', short: 'FN', bg: '#002d62', fg: '#ffffff', match: /fastenal/i },
  { key: '84-lumber', label: '84 Lumber', short: '84', bg: '#00447c', fg: '#ffffff', match: /\b84\s*lumber/i },
  { key: 'carter-lumber', label: 'Carter Lumber', short: 'CL', bg: '#c8102e', fg: '#ffffff', match: /carter\s*lumber/i },
  { key: 'abc-supply', label: 'ABC Supply', short: 'ABC', bg: '#005baa', fg: '#ffffff', match: /abc\s*supply/i },
  { key: 'siteone', label: 'SiteOne Landscape Supply', short: 'S1', bg: '#00843d', fg: '#ffffff', match: /site\s*one/i },
  { key: 'ewing', label: 'Ewing Outdoor Supply', short: 'EW', bg: '#00693c', fg: '#ffffff', match: /\bewing\b/i },
  { key: 'white-cap', label: 'White Cap', short: 'WC', bg: '#1b365d', fg: '#ffffff', match: /white\s*cap/i },
];

/**
 * The brand for a place name, or the neutral storefront mark.
 *
 * Never throws and never returns null — every pin gets something to draw.
 */
export function supplyBrand(name: string | null | undefined): SupplyBrand {
  if (!name) return GENERIC_SUPPLY;
  const found = BRANDS.find((brand) => brand.match.test(name));
  if (!found) return GENERIC_SUPPLY;
  const { match, ...brand } = found;
  void match;
  return brand;
}

/** Every brand, for tests and any future legend. */
export function supplyBrands(): SupplyBrand[] {
  return BRANDS.map(({ match, ...brand }) => {
    void match;
    return brand;
  });
}
