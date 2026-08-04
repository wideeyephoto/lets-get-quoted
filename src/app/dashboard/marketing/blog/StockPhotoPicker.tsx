'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import type { PexelsPickPhoto } from '@/lib/stock/types';
import { searchPexelsAction } from '@/app/dashboard/sites/actions';

/**
 * Pick a cover photo from Pexels.
 *
 * Calls the same server action the website builder's "Replace photo" popup
 * uses, so there is one Pexels integration and one place its key, rate limit
 * and attribution live. The builder's own picker is not reused because it is
 * built around uploads, the photo gallery and the hero slot — none of which a
 * blog cover has.
 *
 * Landscape only: a blog cover renders as a wide banner on every layout, and a
 * portrait photo in that slot is cropped to a strip of somebody's knees.
 *
 * Portaled to <body>. A fixed overlay inside .panel gets trapped by that
 * element's backdrop-filter on iPad and renders behind the page.
 */
export default function StockPhotoPicker({
  defaultQuery,
  onPick,
  onClose,
}: {
  /** The post's own subject, so the first search is usually the right one. */
  defaultQuery: string;
  onPick: (photo: PexelsPickPhoto) => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState(defaultQuery);
  const [photos, setPhotos] = useState<PexelsPickPhoto[]>([]);
  const [configured, setConfigured] = useState(true);
  const [searched, setSearched] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  function search(term: string) {
    const trimmed = term.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const result = await searchPexelsAction(trimmed, 'landscape');
      setConfigured(result.configured);
      setPhotos(result.photos);
      setSearched(true);
    });
  }

  // Search the post's own subject on open, so the useful results are already
  // there rather than behind a button press.
  useEffect(() => {
    if (defaultQuery.trim()) search(defaultQuery);
    else inputRef.current?.focus();
    // Deliberately once, on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className="stock-overlay" role="dialog" aria-modal="true" aria-label="Choose a cover photo" onMouseDown={onClose}>
      <div className="stock-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="stock-head">
          <div>
            <strong>Choose a cover photo</strong>
            <small>Free stock photos from Pexels. Swap it for a photo of your own work whenever you have one.</small>
          </div>
          <button type="button" className="stock-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form
          className="stock-search"
          onSubmit={(event) => {
            event.preventDefault();
            search(query);
          }}
        >
          <input
            ref={inputRef}
            value={query}
            maxLength={80}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="e.g. gutter cleaning, furnace, deck staining"
            aria-label="Search stock photos"
          />
          <button type="submit" className="btn secondary" disabled={pending || !query.trim()}>
            {pending ? 'Searching…' : 'Search'}
          </button>
        </form>

        <div className="stock-body">
          {!configured ? (
            <p className="empty-state">Stock photo search isn&apos;t set up on this install yet. You can still upload your own.</p>
          ) : pending ? (
            <p className="empty-state">Searching Pexels…</p>
          ) : photos.length === 0 ? (
            <p className="empty-state">
              {searched ? 'Nothing found for that. Try a simpler word — “roof” beats “roof inspection checklist”.' : 'Search for a photo above.'}
            </p>
          ) : (
            <div className="stock-grid">
              {photos.map((photo) => (
                <button key={photo.id} type="button" className="stock-tile" onClick={() => onPick(photo)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.thumbnailUrl} alt={photo.alt || 'Stock photo'} loading="lazy" />
                  {/* Pexels asks for the photographer to be credited. Shown here
                      rather than only on the public page, so whoever picks it
                      knows whose work it is. */}
                  <span>{photo.photographerName ? `© ${photo.photographerName}` : 'Pexels'}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
