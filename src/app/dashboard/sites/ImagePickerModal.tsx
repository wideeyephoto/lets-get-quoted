'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SiteImage } from '@/lib/site-images';
import type { PexelsPickPhoto } from '@/lib/stock/types';
import ImageLibrary from './ImageLibrary';
import styles from './SiteEditor.module.css';

type ImagePickerModalProps = {
  label: string;
  uploads: SiteImage[];
  galleryImages: SiteImage[];
  heroUrl: string | null;
  // The stock (Pexels) search is prefilled with a query based on the slot being
  // edited + the contractor's trade.
  pexelsQuery?: string;
  onPick: (image: SiteImage, pexels?: PexelsPickPhoto) => void;
  onSelectHero: (image: SiteImage) => void;
  onToggleGallery: (image: SiteImage) => void;
  onUpload?: (image: SiteImage) => void;
  onClose: () => void;
  onReset?: () => void;
};

// The "Replace photo" popup. Any image on the site opens this — upload your own
// or pick a stock/previously-uploaded photo, and the chosen image drops into
// whatever slot was clicked. Portaled to <body> so it floats over the builder.
export default function ImagePickerModal({
  label,
  uploads,
  galleryImages,
  heroUrl,
  pexelsQuery,
  onPick,
  onSelectHero,
  onToggleGallery,
  onUpload,
  onClose,
  onReset,
}: ImagePickerModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  if (!mounted) return null;

  return createPortal(
    <div className={styles.pickerOverlay} role="dialog" aria-modal="true" aria-label={`Replace ${label}`} onMouseDown={onClose}>
      <div className={styles.pickerModal} onMouseDown={(event) => event.stopPropagation()}>
        <div className={styles.pickerHead}>
          <div><strong>Replace {label}</strong><small>Upload your own photo or pick one below.</small></div>
          <div className={styles.pickerHeadActions}>
            {onReset && <button type="button" className={styles.secondaryAction} onClick={onReset}>Reset to default</button>}
            <button type="button" className={styles.pickerClose} onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>
        <div className={styles.pickerBody}>
          <ImageLibrary
            initialUploads={uploads}
            galleryImages={galleryImages}
            heroUrl={heroUrl}
            pexelsQuery={pexelsQuery}
            onSelectHero={onSelectHero}
            onToggleGallery={onToggleGallery}
            onUpload={onUpload}
            pickMode={{ onPick }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
