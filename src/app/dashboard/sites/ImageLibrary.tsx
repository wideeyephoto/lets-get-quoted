'use client';

import { useRef, useState, useTransition } from 'react';
import type { SiteImage } from '@/lib/site-images';
import { compressImage } from '@/lib/client-images';
import { deleteSiteImageAction } from './actions';
import styles from './SiteEditor.module.css';

type PickMode = { onPick: (image: SiteImage) => void };

type ImageLibraryProps = {
  stockImages: SiteImage[];
  initialUploads: SiteImage[];
  galleryImages: SiteImage[];
  heroUrl: string | null;
  onSelectHero: (image: SiteImage) => void;
  onToggleGallery: (image: SiteImage) => void;
  pickMode?: PickMode | null;
  onUpload?: (image: SiteImage) => void;
};

export default function ImageLibrary({
  stockImages,
  initialUploads,
  galleryImages,
  heroUrl,
  onSelectHero,
  onToggleGallery,
  pickMode,
  onUpload,
}: ImageLibraryProps) {
  const [source, setSource] = useState<'stock' | 'upload'>('upload');
  const [uploads, setUploads] = useState(initialUploads);
  const [message, setMessage] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const images = source === 'stock' ? stockImages : uploads;

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
          <button type="button" className={source === 'stock' ? styles.activeSegment : undefined} onClick={() => setSource('stock')}>Stock</button>
        </div>
        <label className={styles.uploadButton}>
          {isUploading ? `Uploading ${uploadProgress}%` : isPending ? 'Working...' : 'Upload image'}
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={isPending || isUploading} onChange={(event) => handleUpload(event.target.files?.[0])} />
        </label>
      </div>

      {isUploading && <div className={styles.uploadProgress}><span style={{ width: `${uploadProgress}%` }} /></div>}
      {message && <p className={styles.libraryMessage}>{message}</p>}
      {images.length === 0 ? (
        <div className={styles.emptyLibrary}>Upload project photos to build your image library.</div>
      ) : (
        <div className={styles.imageGrid}>
          {images.map((image) => {
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