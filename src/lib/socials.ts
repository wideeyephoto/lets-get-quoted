// Social and review-platform profile links for a contractor's website.
//
// The interesting part of this file is not the list of platforms — it is
// normalizeSocialUrl. What a contractor actually pastes into a "Facebook" box is
// almost never a clean profile URL. It is a share sheet link with a tracking
// parameter on it, a bare handle, a mobile deep link, the m. subdomain, or a
// Yelp URL in the Instagram slot because the fields look alike on a phone. Every
// one of those has to become either a real https URL on the right host, or a
// clear rejection — because these strings do two jobs:
//
//   1. an href in the footer of a published site, and
//   2. `sameAs` on the LocalBusiness JSON-LD, which is how Google ties the site
//      to the business's other profiles.
//
// A wrong URL in (1) is an embarrassing dead link. A wrong URL in (2) is worse:
// it tells Google this business is the same entity as some unrelated account.
//
// SECURITY. This is contractor-authored content rendered into an href on a
// public page, so `javascript:` and `data:` are rejected outright rather than
// escaped — and the per-platform host allowlist means a link can only ever point
// where its icon claims it does.

export type SocialPlatformId =
  | 'facebook' | 'instagram' | 'youtube' | 'tiktok' | 'linkedin' | 'x' | 'pinterest'
  | 'google' | 'yelp' | 'nextdoor' | 'angi' | 'houzz' | 'thumbtack' | 'bbb';

export type SocialPlatform = {
  id: SocialPlatformId;
  /** Shown in the builder and as the link's accessible name. */
  label: string;
  /** Key into SOCIAL_ICON_GLYPHS. */
  icon: string;
  /**
   * Hostnames this platform's links may point at. Matched as an exact host or
   * any subdomain of it, so m./www./en-gb. variants pass without listing each.
   */
  hosts: string[];
  /**
   * The host a bare @handle expands to, or null when a handle is meaningless
   * for this platform. Yelp, Google, BBB, Angi, Houzz, Thumbtack and LinkedIn
   * all identify a business by a listing path rather than a handle, so there is
   * nothing sensible to build from "mybiz" — they ask for the full URL instead.
   */
  handleHost: string | null;
  /** YouTube keeps the @ in its handle URLs; nothing else does. */
  handleKeepsAt?: boolean;
  /** Example shown in the field, so the expected shape is obvious. */
  placeholder: string;
  /** Which builder group it appears under. */
  group: 'social' | 'review';
};

// Order is the order they render in the footer and appear in the builder.
// Socials first (what people follow), then the review and directory listings —
// which for a one-truck contractor are lead sources, not vanity links, and are
// the reason this feature is worth more than a row of icons looks.
export const SOCIAL_PLATFORMS: readonly SocialPlatform[] = [
  {
    id: 'facebook', label: 'Facebook', icon: 'facebook', group: 'social',
    hosts: ['facebook.com', 'fb.com', 'fb.me'],
    handleHost: 'facebook.com',
    placeholder: 'facebook.com/yourbusiness',
  },
  {
    id: 'instagram', label: 'Instagram', icon: 'instagram', group: 'social',
    hosts: ['instagram.com', 'instagr.am'],
    handleHost: 'instagram.com',
    placeholder: '@yourbusiness',
  },
  {
    id: 'youtube', label: 'YouTube', icon: 'youtube', group: 'social',
    hosts: ['youtube.com', 'youtu.be'],
    handleHost: 'youtube.com', handleKeepsAt: true,
    placeholder: '@yourbusiness',
  },
  {
    id: 'tiktok', label: 'TikTok', icon: 'tiktok', group: 'social',
    hosts: ['tiktok.com'],
    handleHost: 'tiktok.com', handleKeepsAt: true,
    placeholder: '@yourbusiness',
  },
  {
    id: 'linkedin', label: 'LinkedIn', icon: 'linkedin', group: 'social',
    hosts: ['linkedin.com'],
    // /company/x and /in/x mean different things and a bare handle says which
    // it is — so it has to be the full URL.
    handleHost: null,
    placeholder: 'linkedin.com/company/yourbusiness',
  },
  {
    id: 'x', label: 'X', icon: 'x', group: 'social',
    hosts: ['x.com', 'twitter.com'],
    handleHost: 'x.com',
    placeholder: '@yourbusiness',
  },
  {
    id: 'pinterest', label: 'Pinterest', icon: 'pinterest', group: 'social',
    hosts: ['pinterest.com', 'pin.it'],
    handleHost: 'pinterest.com',
    placeholder: 'pinterest.com/yourbusiness',
  },
  {
    id: 'google', label: 'Google Business Profile', icon: 'google', group: 'review',
    // The share sheet in Google Maps hands out g.page and maps.app.goo.gl links;
    // the profile itself lives on google.com/maps. All three are the same thing.
    hosts: ['g.page', 'goo.gl', 'maps.app.goo.gl', 'google.com', 'share.google', 'business.google.com'],
    handleHost: null,
    placeholder: 'g.page/your-business',
  },
  {
    id: 'yelp', label: 'Yelp', icon: 'yelp', group: 'review',
    hosts: ['yelp.com', 'yelp.ca', 'yelp.co.uk'],
    handleHost: null,
    placeholder: 'yelp.com/biz/your-business',
  },
  {
    id: 'nextdoor', label: 'Nextdoor', icon: 'nextdoor', group: 'review',
    hosts: ['nextdoor.com'],
    handleHost: null,
    placeholder: 'nextdoor.com/pages/your-business',
  },
  {
    id: 'angi', label: 'Angi', icon: 'angi', group: 'review',
    hosts: ['angi.com', 'angieslist.com'],
    handleHost: null,
    placeholder: 'angi.com/companylist/us/...',
  },
  {
    id: 'houzz', label: 'Houzz', icon: 'houzz', group: 'review',
    hosts: ['houzz.com'],
    handleHost: null,
    placeholder: 'houzz.com/pro/yourbusiness',
  },
  {
    id: 'thumbtack', label: 'Thumbtack', icon: 'thumbtack', group: 'review',
    hosts: ['thumbtack.com'],
    handleHost: null,
    placeholder: 'thumbtack.com/.../service/...',
  },
  {
    id: 'bbb', label: 'Better Business Bureau', icon: 'bbb', group: 'review',
    hosts: ['bbb.org'],
    handleHost: null,
    placeholder: 'bbb.org/us/.../your-business',
  },
];

const BY_ID = new Map(SOCIAL_PLATFORMS.map((p) => [p.id, p]));

export function socialPlatform(id: string): SocialPlatform | null {
  return BY_ID.get(id as SocialPlatformId) ?? null;
}

export function isSocialPlatformId(id: string): id is SocialPlatformId {
  return BY_ID.has(id as SocialPlatformId);
}

// Params that share sheets bolt on. Dropped so the stored URL is the profile
// itself — a click id in `sameAs` is noise Google has to see through, and it
// leaks which post the owner happened to copy the link from.
const TRACKING_PARAMS = /^(fbclid|igshid|igsh|utm_[a-z_]+|_ga|gclid|mibextid|rdid|share_url|si|__cft__.*|__tn__)$/i;

/** True when `host` is exactly `base` or a subdomain of it. */
function hostMatches(host: string, base: string): boolean {
  return host === base || host.endsWith(`.${base}`);
}

/**
 * Turn whatever the owner pasted into a canonical https profile URL for that
 * platform, or null if it can't be one.
 *
 * Returning null rather than throwing because the caller is a form field: an
 * unparseable paste is an inline "that doesn't look like a Facebook link",
 * not an exception.
 */
export function normalizeSocialUrl(platformId: string, input: string): string | null {
  const platform = socialPlatform(platformId);
  if (!platform) return null;

  // Strip control characters as well as whitespace. A URL pasted out of an email
  // client can carry a stray newline, and browsers strip tabs/newlines from URLs
  // themselves — so a check that ran before that stripping would be checking a
  // different string from the one that gets fetched.
  let raw = input.replace(new RegExp('[\\u0000-\\u001f\\u007f]', 'g'), '').trim();
  // People paste out of markdown and rich text more than you'd think.
  raw = raw.replace(/^<|>$/g, '').trim();
  if (!raw) return null;

  // A bare handle, where the platform has one.
  if (raw.startsWith('@')) {
    if (!platform.handleHost) return null;
    const handle = raw.slice(1).replace(/\/+$/, '');
    if (!/^[A-Za-z0-9._-]{1,60}$/.test(handle)) return null;
    return `https://${platform.handleHost}/${platform.handleKeepsAt ? '@' : ''}${handle}`;
  }

  // Reject anything with a scheme that isn't http(s) BEFORE adding one of our
  // own — otherwise "javascript:alert(1)" becomes "https://javascript:alert(1)"
  // and quietly turns into a parse failure instead of an obvious rejection.
  const scheme = raw.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  if (scheme && !/^https?$/i.test(scheme[1])) return null;

  // No scheme at all: either a bare handle (if allowed) or a host-first URL.
  if (!scheme) {
    const looksLikeHost = raw.includes('.') || raw.startsWith('/');
    if (!looksLikeHost) {
      if (!platform.handleHost) return null;
      if (!/^[A-Za-z0-9._-]{1,60}$/.test(raw)) return null;
      return `https://${platform.handleHost}/${platform.handleKeepsAt ? '@' : ''}${raw}`;
    }
    raw = `https://${raw.replace(/^\/+/, '')}`;
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  // Upgrade rather than reject: every one of these platforms is https-only, and
  // an owner who typed http:// meant the same page.
  url.protocol = 'https:';
  // Credentials in a profile URL are never legitimate here and would render as
  // a link that leaks them.
  if (url.username || url.password) return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!platform.hosts.some((base) => hostMatches(host, base))) return null;

  // Google's own maps links are the one case where the path carries the
  // identity and the host is shared with everything else Google runs — so a
  // bare google.com link that isn't a maps/profile link is not a profile.
  if (platform.id === 'google' && hostMatches(host, 'google.com') && !/^\/maps\b/.test(url.pathname)) {
    return null;
  }

  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
  }
  url.hash = '';

  let out = url.toString();
  // Trailing slash on a bare profile path only; never strip one that is the
  // whole path, since "https://facebook.com" is not a profile anyway.
  if (out.endsWith('/') && url.pathname !== '/') out = out.slice(0, -1);
  return out;
}

/** The label a screen reader reads for the icon link. */
export function socialLinkLabel(platformId: string, businessName: string): string {
  const platform = socialPlatform(platformId);
  if (!platform) return businessName;
  const verb = platform.group === 'review' ? 'Reviews for' : '';
  return verb
    ? `${verb} ${businessName} on ${platform.label}`
    : `${businessName} on ${platform.label}`;
}
