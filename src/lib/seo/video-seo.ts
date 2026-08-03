import type { SiteVideoItem, SiteVideoSectionContent } from '@/lib/site-content';
import { parseVideoSource } from '@/lib/video-source';
import { youTubeEmbedSrc, youTubeSchemaThumbnail, youTubeWatchUrl } from '@/lib/youtube';

// VideoObject structured data for a contractor's clips.
//
// The /videos page exists to be shared and indexed — that is the reason it is a
// real URL instead of an anchor into the middle of the homepage. Without
// VideoObject markup Google can see a page with videos on it but cannot produce
// a video result for it, which is the entire point of the page.
//
// It is also one of the few rich results a one-truck contractor can realistically
// win. Nobody is out-ranking Angi on "roofer near me", but "what does a roof
// tear-off look like" with a thumbnail and a duration beside it is a different
// and much smaller fight.
//
// Everything here is derived from fields the studio already collects. Nothing is
// invented: a clip that can't produce a valid node is left out entirely, because
// an invalid VideoObject is worse than no VideoObject — Google reports it as an
// error against the whole page rather than ignoring the one item.

/** Seconds → ISO 8601 duration ("PT1M42S"). '' when the length is unknown. */
export function isoDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  // 0 means "we never read a duration", not "a zero-length video". Emitting
  // PT0S would assert something false about the clip.
  if (total <= 0) return '';
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return `PT${hours ? `${hours}H` : ''}${minutes ? `${minutes}M` : ''}${secs ? `${secs}S` : ''}`;
}

export type VideoSeoEntry = { item: SiteVideoItem; section: SiteVideoSectionContent };

export type VideoSeoContext = {
  /** Canonical origin of the site, e.g. https://acme.letsgetquoted.com. */
  siteUrl: string;
  /** Falls back into uploadDate for clips added before we stamped one. */
  siteUpdatedAt: string | null;
  businessName: string;
};

function trimmed(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** A date Google will accept, or '' — never a guess. */
function isoDate(value: string | null | undefined): string {
  const raw = trimmed(value);
  if (!raw) return '';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

/**
 * One VideoObject, or null when the clip can't support a valid one.
 *
 * Google requires name, description, thumbnailUrl and uploadDate, plus at least
 * one of contentUrl/embedUrl. The two that actually go missing here are the
 * thumbnail (an uploaded file whose poster capture failed — see
 * video-upload.ts) and the date (anything added before uploadedAt existed, which
 * falls back to the site's own updated_at rather than to today: claiming a clip
 * was uploaded at build time would be a lie that changes on every deploy).
 */
export function buildVideoObject(entry: VideoSeoEntry, context: VideoSeoContext): Record<string, unknown> | null {
  const { item, section } = entry;
  const source = parseVideoSource(item.url);
  if (!source) return null;

  // The clip's own label first, then the band's headline — the same fallback
  // the /videos page uses for its caption, so the markup and the visible text
  // agree, which is exactly what Google checks for.
  const name = trimmed(item.label) || trimmed(section.headline) || `${context.businessName} video`;
  if (!name) return null;

  // A testimonial's quote is a genuine description of the clip. Otherwise the
  // band's body copy describes what the video shows.
  const description = trimmed(item.quote) || trimmed(section.body) || name;

  const thumbnailUrl = trimmed(item.posterUrl) || (source.kind === 'youtube' ? youTubeSchemaThumbnail(source.video) : '');
  if (!thumbnailUrl) return null;

  const uploadDate = isoDate(item.uploadedAt) || isoDate(context.siteUpdatedAt);
  if (!uploadDate) return null;

  const duration = isoDuration(item.duration);

  return {
    '@type': 'VideoObject',
    name,
    description,
    thumbnailUrl,
    uploadDate,
    ...(duration ? { duration } : {}),
    ...(source.kind === 'youtube'
      ? { embedUrl: youTubeEmbedSrc(source.video, { autoplay: false }), url: youTubeWatchUrl(source.video) }
      : { contentUrl: source.url }),
    ...(context.siteUrl ? { publisher: { '@type': 'Organization', name: context.businessName, url: context.siteUrl } } : {}),
  };
}

/**
 * Make every name in the set distinct.
 *
 * A clip with no label of its own is named after its band's headline, which is
 * right when the band has one clip and wrong the moment it has three: the
 * /videos page lists every upload, so a band with three unlabelled clips emitted
 * three VideoObjects with identical names and identical descriptions. That is a
 * duplicate signal aimed at the exact page we built to be indexed.
 *
 * Numbering only the ones that actually collide, so a properly labelled set is
 * never touched — and the first of a group keeps the clean name, because it is
 * the one most likely to be the band's own featured clip.
 */
function disambiguate(nodes: Record<string, unknown>[]): Record<string, unknown>[] {
  const counts = new Map<string, number>();
  for (const node of nodes) {
    const name = String(node.name);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return nodes.map((node) => {
    const name = String(node.name);
    if ((counts.get(name) ?? 0) < 2) return node;
    const nth = (seen.get(name) ?? 0) + 1;
    seen.set(name, nth);
    return nth === 1 ? node : { ...node, name: `${name} (${nth})` };
  });
}

/**
 * The whole /videos page as one ItemList of VideoObjects.
 *
 * An ItemList rather than a bare array because the page IS a list, and it lets
 * Google attribute a carousel to the URL. Returns null when nothing survived —
 * emitting an empty list would describe a page that has no videos on it.
 */
export function buildVideoListJsonLd(
  entries: VideoSeoEntry[],
  context: VideoSeoContext,
): Record<string, unknown> | null {
  const items = disambiguate(
    entries.map((entry) => buildVideoObject(entry, context)).filter((node): node is Record<string, unknown> => node !== null),
  );
  if (items.length === 0) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((node, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: node,
    })),
  };
}

/**
 * The videos embedded on the homepage, as standalone VideoObject nodes.
 *
 * Not an ItemList: these are individual videos that happen to share a page, not
 * a gallery the page is about. A @graph keeps them alongside the LocalBusiness
 * node without either pretending to contain the other.
 */
export function buildVideoGraphJsonLd(
  entries: VideoSeoEntry[],
  context: VideoSeoContext,
): Record<string, unknown> | null {
  const items = disambiguate(
    entries.map((entry) => buildVideoObject(entry, context)).filter((node): node is Record<string, unknown> => node !== null),
  );
  if (items.length === 0) return null;

  return { '@context': 'https://schema.org', '@graph': items };
}
