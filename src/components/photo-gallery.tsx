'use client';

import { useEffect, useRef, useState } from 'react';
import { compressImage } from '@/lib/client-images';
import { PhotoAnnotator } from './photo-annotator/PhotoAnnotator';
import { BeforeAfterSlider } from './photo-annotator/BeforeAfterSlider';

export type GalleryPhoto = {
  path: string;
  url: string;
};

type PhotoGalleryProps = {
  entityId: string;
  entityField: 'leadId' | 'jobId';
  uploadUrl: string;
  initialPhotos: GalleryPhoto[];
  emptyLabel?: string;
  deleteConfirmMessage?: string;
  uploadLabel?: string;
  helperText?: string;
  scope?: string;
  coverMode?: boolean;
  reorderEnabled?: boolean;
  /**
   * Told the current list whenever it changes — uploads, deletes and reorders
   * alike. Added for the overview's photo dialog, which needs to know on the way
   * out whether anything actually happened, so it can refresh the cover behind
   * it only when it has to. Optional, and nothing else passes it.
   */
  onPhotosChange?: (photos: GalleryPhoto[]) => void;
};

export default function PhotoGallery({
  entityId,
  entityField,
  uploadUrl,
  initialPhotos,
  emptyLabel,
  deleteConfirmMessage,
  uploadLabel = '+ Add photos',
  helperText,
  scope = '',
  coverMode = false,
  reorderEnabled = false,
  onPhotosChange,
}: PhotoGalleryProps) {
  const [photos, setPhotos] = useState<GalleryPhoto[]>(initialPhotos);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [draggedPath, setDraggedPath] = useState<string | null>(null);
  const [annotatingPhoto, setAnnotatingPhoto] = useState<GalleryPhoto | null>(null);
  const [comparingPhotos, setComparingPhotos] = useState<{ before: GalleryPhoto; after: GalleryPhoto } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragOriginalPhotosRef = useRef<GalleryPhoto[] | null>(null);
  const didDropRef = useRef(false);

  useEffect(() => {
    if (lightboxIndex === null) return;

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') setLightboxIndex(null);
      if (event.key === 'ArrowRight') setLightboxIndex((current) => (current === null ? null : (current + 1) % photos.length));
      if (event.key === 'ArrowLeft') setLightboxIndex((current) => (current === null ? null : (current - 1 + photos.length) % photos.length));
    }

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [lightboxIndex, photos.length]);

  useEffect(() => {
    setPhotos(initialPhotos);
  }, [initialPhotos]);

  /* One place rather than at each of the seven setPhotos calls — uploads,
     deletes, reorders and the initialPhotos sync all pass through here. Held in
     a ref so a parent passing an inline arrow does not re-fire it every render. */
  const reportRef = useRef(onPhotosChange);
  useEffect(() => {
    reportRef.current = onPhotosChange;
  }, [onPhotosChange]);
  useEffect(() => {
    reportRef.current?.(photos);
  }, [photos]);

  async function uploadOne(file: File) {
    const compressed = await compressImage(file, 2000, 0.84);
    const formData = new FormData();
    formData.set(entityField, entityId);
    formData.set('image', compressed);

    return new Promise<GalleryPhoto>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open('POST', uploadUrl);
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) setUploadProgress(Math.max(2, Math.round((event.loaded / event.total) * 100)));
      };
      request.onload = () => {
        const response = JSON.parse(request.responseText || '{}') as GalleryPhoto & { error?: string };
        if (request.status >= 200 && request.status < 300) resolve(response);
        else reject(new Error(response.error || 'Photo upload failed.'));
      };
      request.onerror = () => reject(new Error('Network error while uploading photo.'));
      request.send(formData);
    });
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).slice(0, 10);

    setMessage(null);
    setIsUploading(true);
    try {
      for (const file of files) {
        setUploadProgress(2);
        const photo = await uploadOne(file);
        setPhotos((current) => [...current, photo]);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Photo upload failed.');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleDelete(path: string) {
    if (deleteConfirmMessage && !window.confirm(deleteConfirmMessage)) return;
    setMessage(null);
    try {
      const response = await fetch(uploadUrl, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [entityField]: entityId, path }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Unable to remove photo.');
      setPhotos((current) => current.filter((photo) => photo.path !== path));
      setLightboxIndex(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to remove photo.');
    }
  }

  async function persistPhotoOrder(nextPhotos: GalleryPhoto[], previousPhotos: GalleryPhoto[]) {
    if (!reorderEnabled) return;
    setMessage('Saving photo order...');
    try {
      const response = await fetch(uploadUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [entityField]: entityId, paths: nextPhotos.map((photo) => photo.path) }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Unable to save photo order.');
      setMessage(nextPhotos[0] ? 'Default image updated.' : null);
    } catch (error) {
      setPhotos(previousPhotos);
      setMessage(error instanceof Error ? error.message : 'Unable to save photo order.');
    }
  }

  function moveDraggedPhotoOver(targetPath: string) {
    setPhotos((current) => {
      const sourceIndex = current.findIndex((photo) => photo.path === draggedPath);
      const targetIndex = current.findIndex((photo) => photo.path === targetPath);
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return current;

      const next = [...current];
      const [movedPhoto] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, movedPhoto);
      return next;
    });
  }

  function makeDefault(path: string) {
    const firstPhoto = photos[0];
    if (!firstPhoto || firstPhoto.path === path) return;

    const previousPhotos = photos;
    const selectedPhoto = previousPhotos.find((photo) => photo.path === path);
    if (!selectedPhoto) return;

    const nextPhotos = [selectedPhoto, ...previousPhotos.filter((photo) => photo.path !== path)];
    setPhotos(nextPhotos);
    void persistPhotoOrder(nextPhotos, previousPhotos);
  }

  const activePhoto = lightboxIndex !== null ? photos[lightboxIndex] : null;

  return (
    <div className={`photo-gallery${coverMode ? ' photo-gallery-cover-mode' : ''}`}>
      <div className="photo-gallery-toolbar">
        <label className="btn secondary photo-upload-btn">
          {isUploading ? `Uploading ${uploadProgress}%` : uploadLabel}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            multiple
            disabled={isUploading}
            onChange={(event) => handleFiles(event.target.files)}
          />
        </label>

        {photos.length >= 2 ? (
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              const beforePhoto = photos[1] || photos[0];
              const afterPhoto = photos[0];
              setComparingPhotos({ before: beforePhoto, after: afterPhoto });
            }}
            title="Compare Before & After photos with interactive split slider"
          >
            🔀 Compare
          </button>
        ) : null}

        {helperText ? <span className="photo-gallery-helper">{helperText}</span> : null}
        {message ? <span className="photo-gallery-message">{message}</span> : null}
      </div>

      {photos.length === 0 ? (
        <p className="empty-state">{emptyLabel || 'No photos yet.'}</p>
      ) : (
        <div className="photo-gallery-grid">
          {photos.map((photo, index) => (
            <div
              className={`photo-thumb${coverMode && index === 0 ? ' default-photo-thumb' : ''}${draggedPath === photo.path ? ' dragging-photo-thumb' : ''}`}
              draggable={reorderEnabled}
              key={photo.path}
              onDragStart={(event) => {
                if (!reorderEnabled) return;
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', photo.path);
                dragOriginalPhotosRef.current = photos;
                didDropRef.current = false;
                setDraggedPath(photo.path);
              }}
              onDragEnd={() => {
                if (!didDropRef.current && dragOriginalPhotosRef.current) {
                  setPhotos(dragOriginalPhotosRef.current);
                }
                dragOriginalPhotosRef.current = null;
                setDraggedPath(null);
              }}
              onDragOver={(event) => {
                if (!reorderEnabled || !draggedPath) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                if (draggedPath !== photo.path) moveDraggedPhotoOver(photo.path);
              }}
              onDrop={(event) => {
                if (!reorderEnabled) return;
                event.preventDefault();
                didDropRef.current = true;
                const previousPhotos = dragOriginalPhotosRef.current;
                dragOriginalPhotosRef.current = null;
                setDraggedPath(null);
                if (previousPhotos) void persistPhotoOrder(photos, previousPhotos);
              }}
            >
              {coverMode && index === 0 ? <span className="photo-default-badge">Default image</span> : null}
              {reorderEnabled ? <span className="photo-drag-handle" aria-hidden="true">Drag</span> : null}
              <button
                type="button"
                className="photo-thumb-annotate"
                aria-label="Annotate photo"
                title="Annotate & Markup"
                onClick={(e) => {
                  e.stopPropagation();
                  setAnnotatingPhoto(photo);
                }}
              >
                ✏️
              </button>
              <button type="button" className="photo-thumb-open" onClick={() => { setLightboxIndex(index); setZoomed(false); }}>
                <img src={photo.url} alt={`Photo ${index + 1}`} />
              </button>
              {coverMode && index > 0 ? (
                <button type="button" className="photo-make-default" onClick={() => makeDefault(photo.path)}>
                  Make default
                </button>
              ) : null}
              <button
                type="button"
                className="photo-thumb-remove"
                aria-label="Remove photo"
                onClick={() => handleDelete(photo.path)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {activePhoto ? (
        <div className="photo-lightbox-backdrop" onClick={() => setLightboxIndex(null)}>
          <button
            type="button"
            className="photo-lightbox-annotate"
            onClick={(event) => {
              event.stopPropagation();
              setAnnotatingPhoto(activePhoto);
            }}
            title="Annotate & Markup this Photo"
          >
            ✏️ Markup
          </button>
          <button type="button" className="photo-lightbox-close" aria-label="Close" onClick={() => setLightboxIndex(null)}>
            ×
          </button>
          {photos.length > 1 ? (
            <>
              <button
                type="button"
                className="photo-lightbox-nav prev"
                aria-label="Previous photo"
                onClick={(event) => {
                  event.stopPropagation();
                  setZoomed(false);
                  setLightboxIndex((current) => (current === null ? null : (current - 1 + photos.length) % photos.length));
                }}
              >
                ‹
              </button>
              <button
                type="button"
                className="photo-lightbox-nav next"
                aria-label="Next photo"
                onClick={(event) => {
                  event.stopPropagation();
                  setZoomed(false);
                  setLightboxIndex((current) => (current === null ? null : (current + 1) % photos.length));
                }}
              >
                ›
              </button>
            </>
          ) : null}
          <img
            src={activePhoto.url}
            alt={`Photo ${lightboxIndex !== null ? lightboxIndex + 1 : ''}`}
            className={`photo-lightbox-image${zoomed ? ' zoomed' : ''}`}
            onClick={(event) => {
              event.stopPropagation();
              setZoomed((current) => !current);
            }}
          />
          {photos.length > 1 ? (
            <span className="photo-lightbox-count">{(lightboxIndex ?? 0) + 1} / {photos.length}</span>
          ) : null}
        </div>
      ) : null}

      {/* Photo Annotator / Markup Modal */}
      {annotatingPhoto ? (
        <PhotoAnnotator
          photoUrl={annotatingPhoto.url}
          photoPath={annotatingPhoto.path}
          scope={scope}
          onClose={() => setAnnotatingPhoto(null)}
          onSave={async (file) => {
            setIsUploading(true);
            setMessage('Saving marked-up photo...');
            try {
              const newPhoto = await uploadOne(file);
              setPhotos((current) => [newPhoto, ...current]);
              setMessage('✓ Marked-up photo saved to gallery!');
              setTimeout(() => setMessage(null), 3500);
            } catch (err: any) {
              setMessage(err?.message || 'Failed to save marked-up photo.');
            } finally {
              setIsUploading(false);
              setAnnotatingPhoto(null);
            }
          }}
        />
      ) : null}

      {/* Before & After Comparison Modal */}
      {comparingPhotos ? (
        <BeforeAfterSlider
          beforeUrl={comparingPhotos.before.url}
          afterUrl={comparingPhotos.after.url}
          beforeLabel="Inspection Photo (Before)"
          afterLabel="Marked-Up / Complete (After)"
          onClose={() => setComparingPhotos(null)}
        />
      ) : null}
    </div>
  );
}
