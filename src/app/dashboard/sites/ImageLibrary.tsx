'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import type { SiteImage } from '@/lib/site-images';
import type { PexelsPickPhoto } from '@/lib/stock/types';
import { compressImage } from '@/lib/client-images';
import { deleteSiteImageAction, searchPexelsAction } from './actions';
import styles from './SiteEditor.module.css';

type PickMode = { onPick: (image: SiteImage, pexels?: PexelsPickPhoto) => void };

type ImageLibraryProps = {
  initialUploads: SiteImage[];
  galleryImages: SiteImage[];
  heroUrl: string | null;
  onSelectHero: (image: SiteImage) => void;
  onToggleGallery: (image: SiteImage) => void;
  pickMode?: PickMode | null;
  onUpload?: (image: SiteImage) => void;
  // Default Pexels query for the Stock tab, based on the slot/role being edited
  // and the contractor's trade (e.g. "window cleaning home exterior").
  pexelsQuery?: string;
};

function pexelsToSiteImage(photo: PexelsPickPhoto): SiteImage {
  return { id: photo.id, url: photo.url, alt: photo.alt || 'Representative service photo', category: 'craft', source: 'stock' };
}

export default function ImageLibrary({
  initialUploads,
  galleryImages,
  heroUrl,
  onSelectHero,
  onToggleGallery,
  pickMode,
  onUpload,
  pexelsQuery = '',
}: ImageLibraryProps) {
  const [source, setSource] = useState<'stock' | 'upload'>('upload');
  const [uploads, setUploads] = useState(initialUploads);
  const [message, setMessage] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Pexels stock search state.
  const [query, setQuery] = useState(pexelsQuery);
  const [pexels, setPexels] = useState<PexelsPickPhoto[]>([]);
  const [pexelsConfigured, setPexelsConfigured] = useState(true);
  const [pexelsLoading, setPexelsLoading] = useState(false);
  const [pexelsSearched, setPexelsSearched] = useState(false);

  const runSearch = (term: string) => {
    const q = term.trim();
    if (!q) return;
    setPexelsLoading(true);
    startTransition(async () => {
      try {
        const result = await searchPexelsAction(q);
        setPexelsConfigured(result.configured);
        setPexels(result.photos);
      } catch {
        setPexels([]);
      } finally {
        setPexelsLoading(false);
        setPexelsSearched(true);
      }
    });
  };

  // Auto-run the role/trade default query the first time the Stock tab opens.
  useEffect(() => {
    if (source === 'stock' && !pexelsSearched && !pexelsLoading) runSearch(query || pexelsQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  async function handleUpload(file: File | undefined) {
    if (!file) return;

    setMessage(null);
    setIsUploading(true);
    setUploadProgress(2);
    try {
      const compressed = await compressImage(file, 2000, 0.84);
      const formData = new FormData();
      formData.set('image', compressed);
      const image = await new Promise<SiteImage>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open('POST', '/api/site-images');
        request.upload.onprogress = (event) => {
          if (event.lengthComputable) setUploadProgress(Math.max(2, Math.round(event.loaded / event.total * 100)));
        };
        request.onload = () => {
          const response = JSON.parse(request.responseText || '{}') as SiteImage & { error?: string };
          if (request.status >= 200 && request.status < 300) resolve(response);
          else reject(new Error(response.error || 'Image upload failed.'));
        };
        request.onerror = () => reject(new Error('Network error while uploading image.'));
        request.send(formData);
      });
      setUploadProgress(100);
      setUploads((current) => [image, ...current]);
      onUpload?.(image);
      setSource('upload');
      setMessage(`Image optimized from ${(file.size / 1024 / 1024).toFixed(1)} MB to ${(compressed.size / 1024 / 1024).toFixed(1)} MB.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Image upload failed.');
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function handleDelete(image: SiteImage) {
    if (!image.storagePath) return;
    if (heroUrl === image.url || galleryImages.some((item) => item.id === image.id)) {
      setMessage('Remove this image from the hero and gallery before deleting it.');
      return;
    }

    startTransition(async () => {
      try {
        await deleteSiteImageAction(image.storagePath!);
        setUploads((current) => current.filter((item) => item.id !== image.id));
        setMessage('Image removed from your uploads.');
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Unable to remove image.');
      }
    });
  }

  return (
    <div className={styles.library}>
      <div className={styles.libraryToolbar}>
        <div className={styles.segmented} aria-label="Image source">
          <button type="button" className={source === 'upload' ? styles.activeSegment : undefined} onClick={() => setSource('upload')}>Your uploads</button>
          <button type="button" className={source === 'stock' ? styles.activeSegment : undefined} onClick={() => setSource('stock')}>Stock photos</button>
        </div>
        <label className={styles.uploadButton}>
          {isUploading ? `Uploading ${uploadProgress}%` : 'Upload image'}
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={isPending || isUploading} onChange={(event) => handleUpload(event.target.files?.[0])} />
        </label>
      </div>

      {isUploading && <div className={styles.uploadProgress}><span style={{ width: `${uploadProgress}%` }} /></div>}
      {message && <p className={styles.libraryMessage}>{message}</p>}

      {source === 'stock' ? (
        <div className={styles.pexelsPanel}>
          <form
            className={styles.pexelsSearch}
            onSubmit={(event) => { event.preventDefault(); runSearch(query); }}
          >
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search stock photos (e.g. roofing, clean windows)" aria-label="Search stock photos" />
            <button type="submit" disabled={pexelsLoading || !query.trim()}>{pexelsLoading ? 'Searching…' : 'Search'}</button>
          </form>
          <p className={styles.pexelsNote}>Representative stock photos from Pexels. Pick one now, or replace it later with a photo of your own work.</p>

          {!pexelsConfigured ? (
            <div className={styles.emptyLibrary}>Stock photos aren’t set up yet. Add a PEXELS_API_KEY to enable them, or upload your own photo.</div>
          ) : pexelsLoading ? (
            <div className={styles.emptyLibrary}>Searching Pexels…</div>
          ) : pexels.length === 0 ? (
            <div className={styles.emptyLibrary}>{pexelsSearched ? 'No photos found — try different words, or upload your own.' : 'Search for stock photos above.'}</div>
          ) : (
            <div className={styles.imageGrid}>
              {pexels.map((photo) => (
                <article className={styles.imageTile} key={photo.id}>
                  <img src={photo.thumbnailUrl || photo.url} alt={photo.alt} loading="lazy" />
                  <div className={styles.imageMeta}><span>{photo.photographerName ? `© ${photo.photographerName}` : 'Pexels'}</span></div>
                  <div className={styles.imageActions}>
                    <button type="button" onClick={() => pickMode?.onPick(pexelsToSiteImage(photo), photo)}>Use this photo</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      ) : uploads.length === 0 ? (
        <div className={styles.emptyLibrary}>Upload project photos to build your image library.</div>
      ) : (
        <div className={styles.imageGrid}>
          {uploads.map((image) => {
            const inGallery = galleryImages.some((item) => item.id === image.id);
            const isHero = heroUrl === image.url;
            const isInUse = inGallery || isHero;
            return (
              <article className={styles.imageTile} key={image.id}>
                <img src={image.url} alt={image.alt} />
                <div className={styles.imageMeta}><span>{image.category}</span>{isHero ? <strong>Hero</strong> : inGallery ? <strong>In gallery</strong> : null}</div>
                <div className={styles.imageActions}>
                  {pickMode ? (
                    <button type="button" onClick={() => pickMode.onPick(image)}>Use this photo</button>
                  ) : (
                    <>
                      <button type="button" onClick={() => onSelectHero(image)} disabled={isHero}>{isHero ? 'Current hero' : 'Set as hero'}</button>
                      <button type="button" onClick={() => onToggleGallery(image)}>{inGallery ? 'Remove from gallery' : 'Add to gallery'}</button>
                      {image.source === 'upload' && <button type="button" className={styles.deleteImage} onClick={() => handleDelete(image)} disabled={isInUse} aria-label={`Delete ${image.alt}`}>{isInUse ? 'In use' : 'Delete'}</button>}
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
