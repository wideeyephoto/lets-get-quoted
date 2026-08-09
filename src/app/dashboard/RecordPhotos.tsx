'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ModalDialog from '@/components/modal-dialog';
import PhotoGallery, { type GalleryPhoto } from '@/components/photo-gallery';
import RecordCover from './RecordCover';
import styles from './focus.module.css';

/**
 * The cover, opened.
 *
 * The overview covers were a picture with a "+7" on them and nothing behind the
 * click — to see the other seven, or to add one, you left the overview, opened
 * the record's own page and scrolled to its gallery. The photos are the fastest
 * way to know which job you are looking at, and they were the one thing on the
 * pane you could not act on.
 *
 * WHY THE TRIGGER IS A SIBLING AND NOT A WRAPPER. RecordCover is a <figure>,
 * which is flow content and not valid inside a <button>. Rather than reshape the
 * cover's markup — it is used in three places and its CSS is written against it
 * — the modal's own trigger is stretched over the top as a transparent overlay.
 * The whole cover is the hit area, the markup stays valid, and the cover
 * component itself did not have to learn that it is now clickable.
 */

const KINDS = {
  job: { url: '/api/job-photos', query: 'jobId', field: 'jobId' },
  lead: { url: '/api/lead-photos', query: 'leadId', field: 'leadId' },
} as const;

type Kind = keyof typeof KINDS;

/**
 * The dialog's contents, mounted only once it is open — which is what makes the
 * fetch below lazy without any extra bookkeeping.
 *
 * It fetches rather than reading the photos the overview already has, because
 * that payload is capped at eight (FOCUS_PHOTO_LIMIT) while the count beside it
 * is the true one. A job with twelve photos would say "+7" on the cover and then
 * show eight, which is a worse answer than the one it replaced.
 */
function RecordPhotosPanel({ kind, recordId, emptyLabel }: { kind: Kind; recordId: string; emptyLabel: string }) {
  const config = KINDS[kind];
  const router = useRouter();
  const [photos, setPhotos] = useState<GalleryPhoto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // What the record had when the dialog opened. Compared on the way out so the
  // page behind only re-renders when something actually changed.
  const openedWith = useRef<number | null>(null);
  const liveCount = useRef<number | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    fetch(`${config.url}?${config.query}=${encodeURIComponent(recordId)}`, { signal: abort.signal })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { photos?: GalleryPhoto[]; error?: string };
        if (!response.ok) throw new Error(body.error || 'Unable to load photos.');
        const list = body.photos ?? [];
        openedWith.current = list.length;
        liveCount.current = list.length;
        setPhotos(list);
      })
      .catch((cause: unknown) => {
        if (abort.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : 'Unable to load photos.');
      });
    return () => abort.abort();
  }, [config.query, config.url, recordId]);

  /**
   * The cover behind the dialog is drawn from the list payload the server sent,
   * so adding the first photo to a record would otherwise leave "No photos"
   * sitting under a dialog that just accepted one. Refresh on the way out, and
   * only if the count moved — closing a dialog you only looked in should cost
   * nothing.
   */
  useEffect(
    () => () => {
      if (openedWith.current !== null && liveCount.current !== openedWith.current) router.refresh();
    },
    [router],
  );

  if (error) return <p className="empty-state">{error}</p>;
  if (!photos) return <p className="empty-state">Loading photos…</p>;

  return (
    <PhotoGallery
      entityId={recordId}
      entityField={config.field}
      uploadUrl={config.url}
      initialPhotos={photos}
      emptyLabel={emptyLabel}
      uploadLabel="+ Add photos"
      helperText="The first photo is the cover. Drag photos to reorder them."
      coverMode
      reorderEnabled
      onPhotosChange={(next) => {
        liveCount.current = next.length;
      }}
    />
  );
}

export default function RecordPhotos({
  kind,
  recordId,
  subject,
  photoUrl,
  photoCount,
  photoTotal,
  title,
  emptyLabel,
  canOpen = true,
}: {
  kind: Kind;
  recordId: string;
  subject: string | null;
  photoUrl?: string | null;
  photoCount: number;
  photoTotal?: number;
  /** Names the record in the dialog header — "Photos · 14 Elm St". */
  title: string;
  emptyLabel: string;
  /**
   * False on the logged-out demo, which renders these very components against a
   * fixed dataset. Every route behind the dialog requires an owner session, so
   * there the trigger would open a panel that can only say "Sign in to manage
   * photos" — worse than a cover that is simply a picture. The demo keeps the
   * cover; only the way in goes.
   */
  canOpen?: boolean;
}) {
  const total = photoTotal ?? photoCount;
  const label = total > 0 ? `Open all ${total} photo${total === 1 ? '' : 's'}` : 'Add the first photo';

  if (!canOpen) {
    return (
      <RecordCover
        recordId={recordId}
        subject={subject}
        photoUrl={photoUrl}
        photoCount={photoCount}
        photoTotal={photoTotal}
      />
    );
  }

  return (
    <div className={styles.coverSlot}>
      <RecordCover
        recordId={recordId}
        subject={subject}
        photoUrl={photoUrl}
        photoCount={photoCount}
        photoTotal={photoTotal}
      />
      <ModalDialog
        title={title}
        triggerClassName={styles.coverOpen}
        // The cover behind it is decorative to a screen reader (empty alt), so
        // the button carries the whole meaning, and it says how many there are
        // rather than "view photos" — the count is the reason you press it.
        triggerLabel={<span className={styles.coverOpenLabel}>{label}</span>}
      >
        <RecordPhotosPanel kind={kind} recordId={recordId} emptyLabel={emptyLabel} />
      </ModalDialog>
    </div>
  );
}
