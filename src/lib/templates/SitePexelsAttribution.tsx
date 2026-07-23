import { getSiteContent } from '@/lib/site-content';
import type { Site } from '@/lib/sites';
import styles from './themes.module.css';

// Required Pexels attribution: a visible link back to Pexels plus credit to the
// photographers whose photos are in use. Renders nothing when the site has no
// Pexels stock images (e.g. an all-uploads site). Kept subtle and factual — it
// never implies the photos show the contractor's own work.
export default function SitePexelsAttribution({ site }: { site: Site }) {
  const content = getSiteContent(site.content);
  // Reconcile against what's actually on the page: an owner can replace/remove
  // any auto-selected photo through several setters, so credit only Pexels
  // photos whose URL is still displayed. This prunes stale attribution (and
  // hides the block entirely on an all-uploads site) no matter how the image
  // was swapped out.
  const displayed = new Set(
    [
      site.hero_url,
      ...Object.values(content.images),
      ...content.heroImages,
      ...content.showcase.items.map((item) => item.url),
    ].filter((url): url is string => Boolean(url)),
  );
  const stock = content.stockImages.filter((image) => image.provider === 'pexels' && displayed.has(image.imageUrl));
  if (stock.length === 0) return null;

  const credits = new Map<string, string>();
  for (const image of stock) {
    const name = (image.photographerName || '').trim();
    if (name && !credits.has(name)) credits.set(name, image.photographerUrl || 'https://www.pexels.com');
  }
  const photographers = Array.from(credits.entries()).slice(0, 8);

  return (
    <p className={styles.pexelsCredit}>
      Representative photos from{' '}
      <a href="https://www.pexels.com" target="_blank" rel="noopener noreferrer nofollow">Pexels</a>
      {photographers.length > 0 && (
        <>
          {' — '}
          {photographers.map(([name, url], index) => (
            <span key={name}>
              {index > 0 ? ', ' : ''}
              <a href={url} target="_blank" rel="noopener noreferrer nofollow">{name}</a>
            </span>
          ))}
        </>
      )}
    </p>
  );
}
