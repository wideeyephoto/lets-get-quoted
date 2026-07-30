'use client';

import { useState } from 'react';
import ServiceIcon from '@/lib/templates/ServiceIcon';
import { getTradeGlyph } from '@/lib/site-content';
import styles from './focus.module.css';

// Every job and every lead gets a cover. If it has photos, the first one is it.
// If it doesn't, we draw one rather than showing an empty grey box or — worse —
// a stock photo of somebody else's house, which would read as a picture of THIS
// job.
//
// The drawn cover is derived from the record itself: the glyph comes from the
// same trade-matching the brand mark uses (a "sewer line" job gets a droplet, a
// "remodel" gets a hammer), and the colour is hashed off the record id so a
// given record always looks like itself and two side by side never look alike.

function hueFor(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) % 360;
  return hash;
}

export default function RecordCover({
  recordId,
  subject,
  photoUrl,
  photoCount,
  photoTotal,
}: {
  /** Job or lead id — hashed for the drawn cover's hue. */
  recordId: string;
  /** What the work is (a job's scope, a lead's project type), used to pick the glyph. */
  subject: string | null;
  /** Signed URL of the first photo, once the detail request has landed. */
  photoUrl?: string | null;
  /** Photos on the record, known from the list payload before any fetch. */
  photoCount: number;
  /** Total once known, for the "+3" badge. */
  photoTotal?: number;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const hue = hueFor(recordId);
  const glyph = getTradeGlyph(subject || '');
  const showPhoto = Boolean(photoUrl) && !failed;
  // A record we know has photos, whose URL hasn't arrived yet: hold the drawn
  // cover and let the photo fade over it, rather than popping a grey box first.
  const awaitingPhoto = photoCount > 0 && !photoUrl && !failed;
  const extra = (photoTotal ?? photoCount) - 1;

  return (
    <figure
      className={styles.cover}
      style={{ '--cover-hue': hue } as React.CSSProperties}
      data-awaiting={awaitingPhoto || undefined}
    >
      <span className={styles.coverArt} aria-hidden="true">
        <ServiceIcon name={glyph} className={styles.coverGlyph} />
      </span>

      {showPhoto && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl as string}
          alt=""
          className={`${styles.coverImg}${loaded ? ` ${styles.coverImgOn}` : ''}`}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          // A signed URL expires after an hour. Falling back to the drawn cover
          // beats a broken-image icon on a tab left open at a job site.
          onError={() => setFailed(true)}
        />
      )}

      {showPhoto && loaded && extra > 0 && (
        <figcaption className={styles.coverCount}>+{extra}</figcaption>
      )}
      {!showPhoto && !awaitingPhoto && (
        <figcaption className={styles.coverCount} data-empty="true">No photos</figcaption>
      )}
    </figure>
  );
}
