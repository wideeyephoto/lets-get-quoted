// Turn-by-turn hand-off from a job to whichever map app the tech actually uses.
//
// Pure URL construction, so the awkward bits are testable: every one of these
// three apps takes a different parameter for "where am I going", and two of
// them silently do something unhelpful rather than erroring when you get it
// wrong. Waze in particular drops you at a search screen if given an address
// where it wanted coordinates.

export type NavApp = 'apple' | 'google' | 'waze';

export type NavTarget = {
  address: string | null;
  lat: number | null;
  lng: number | null;
};

export type NavLink = { app: NavApp; label: string; href: string };

function coords(target: NavTarget): { lat: number; lng: number } | null {
  return typeof target.lat === 'number' && Number.isFinite(target.lat)
    && typeof target.lng === 'number' && Number.isFinite(target.lng)
    ? { lat: target.lat, lng: target.lng }
    : null;
}

/**
 * Apple Maps. `daddr` with `dirflg=d` starts driving directions rather than
 * just dropping a pin — the difference between "here's where that is" and
 * "start guiding me there", which is the whole point of the button.
 */
export function appleMapsUrl(target: NavTarget): string | null {
  const point = coords(target);
  const destination = point ? `${point.lat},${point.lng}` : target.address;
  if (!destination) return null;
  const query = new URLSearchParams({ daddr: destination, dirflg: 'd' });
  // Carry the address as the label when we're navigating by coordinates, so the
  // tech sees a street name in their map app and not a pair of decimals.
  if (point && target.address) query.set('q', target.address);
  return `https://maps.apple.com/?${query.toString()}`;
}

/** Google Maps universal link — works in the app and the browser, everywhere. */
export function googleMapsUrl(target: NavTarget): string | null {
  const point = coords(target);
  const destination = point ? `${point.lat},${point.lng}` : target.address;
  if (!destination) return null;
  const query = new URLSearchParams({ api: '1', destination, travelmode: 'driving' });
  return `https://www.google.com/maps/dir/?${query.toString()}`;
}

/**
 * Waze takes `ll` (coordinates) or `q` (a search string) — and NOT both
 * meaningfully. Given an address in `ll` it silently strands the tech on a
 * search screen, which is exactly the moment they have no patience for it.
 */
export function wazeUrl(target: NavTarget): string | null {
  const point = coords(target);
  if (point) return `https://waze.com/ul?ll=${point.lat},${point.lng}&navigate=yes`;
  if (target.address) return `https://waze.com/ul?q=${encodeURIComponent(target.address)}&navigate=yes`;
  return null;
}

/**
 * The apps worth offering, in the order they should appear.
 *
 * Apple Maps is listed only on Apple hardware: on Android it opens a web page
 * that cannot navigate, which is worse than not offering it. Google and Waze
 * both work everywhere, so they are always offered — a tech who doesn't have
 * Waze installed gets its web page, which still shows the route.
 */
export function navigationLinks(target: NavTarget, platform: 'ios' | 'other'): NavLink[] {
  const links: NavLink[] = [];
  const add = (app: NavApp, label: string, href: string | null) => {
    if (href) links.push({ app, label, href });
  };
  if (platform === 'ios') add('apple', 'Apple Maps', appleMapsUrl(target));
  add('google', 'Google Maps', googleMapsUrl(target));
  add('waze', 'Waze', wazeUrl(target));
  return links;
}

/** Apple hardware, from a user-agent string. iPadOS 13+ lies and claims to be a Mac. */
export function isApplePlatform(userAgent: string, maxTouchPoints = 0): 'ios' | 'other' {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  // An iPad in desktop mode reports "Macintosh" — the touch points give it away,
  // and a real Mac has none.
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'ios';
  return 'other';
}
