'use client';

import { useRef, useState } from 'react';
import { compressImage } from '@/lib/client-images';
import { getEstimateButtonLabel, getSiteContent } from '@/lib/site-content';
import type { Site } from '@/lib/sites';
import AddressAutocomplete from '@/components/address-autocomplete';
import styles from './quote-request-form.module.css';

const MAX_PHOTOS = 6;

type QuoteRequestFormProps = {
  site: Pick<Site, 'id' | 'published' | 'content'>;
};

export default function QuoteRequestForm({ site }: QuoteRequestFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const quoteForm = getSiteContent(site.content).quoteForm;
  const emailRequired = quoteForm.emailRequired;
  const estimateLabel = getEstimateButtonLabel(quoteForm);
  const [progress, setProgress] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<File[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const startedAt = useRef(Date.now());

  function addPhotos(files: FileList | File[]) {
    const images = Array.from(files).filter((file) => file.type.startsWith('image/'));
    setSelectedPhotos((current) => [...current, ...images].slice(0, MAX_PHOTOS));
    if (photoInputRef.current) photoInputRef.current.value = '';
  }

  function removePhoto(index: number) {
    setSelectedPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index));
  }

  function formatFileSize(size: number) {
    if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!site.published || window.self !== window.top) {
      setMessage({ type: 'error', text: `${estimateLabel} requests become active when this website is published.` });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    setProgress(5);

    try {
      const form = event.currentTarget;
      const data = new FormData(form);
      data.set('siteId', site.id);
      data.set('startedAt', String(startedAt.current));
      data.delete('photos');
      const photos = selectedPhotos.slice(0, MAX_PHOTOS);
      for (const photo of photos) data.append('photos', await compressImage(photo, 1600, 0.8));

      await new Promise<void>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open('POST', '/api/public/leads');
        request.upload.onprogress = (uploadEvent) => {
          if (uploadEvent.lengthComputable) setProgress(Math.max(5, Math.round(uploadEvent.loaded / uploadEvent.total * 100)));
        };
        request.onload = () => {
          const response = JSON.parse(request.responseText || '{}') as { error?: string };
          if (request.status >= 200 && request.status < 300) resolve();
          else reject(new Error(response.error || 'Unable to send your request.'));
        };
        request.onerror = () => reject(new Error('Network error. Please call the contractor directly.'));
        request.send(data);
      });

      setProgress(100);
      setMessage({ type: 'success', text: 'Your project request was sent. The contractor will follow up soon.' });
      formRef.current?.reset();
      setSelectedPhotos([]);
      if (photoInputRef.current) photoInputRef.current.value = '';
      startedAt.current = Date.now();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to send your request.' });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form ref={formRef} className={styles.form} onSubmit={handleSubmit}>
      <label className={styles.field}><span>Name</span><input name="name" autoComplete="name" maxLength={100} required /></label>
      <label className={styles.field}><span>Phone</span><input name="phone" type="tel" autoComplete="tel" maxLength={40} /></label>
      <label className={`${styles.field} ${styles.wide}`}><span>Email {emailRequired ? '(required)' : '(optional)'}</span><input name="email" type="email" autoComplete="email" maxLength={160} required={emailRequired} /></label>
      <div className={`${styles.field} ${styles.wide}`}><label htmlFor="quote-address">Project address</label><AddressAutocomplete id="quote-address" name="address" placeholder="1418 Maplewood Ave, Royal Oak, MI" maxLength={240} /></div>
      <label className={`${styles.field} ${styles.wide}`}><span>Tell us about the project</span><textarea name="message" maxLength={3000} required /></label>
      <div className={`${styles.field} ${styles.wide}`}>
        <div className={styles.photoHeader}>
          <span>Project photos</span>
          <em>{selectedPhotos.length}/{MAX_PHOTOS} selected</em>
        </div>
        <div
          className={styles.photoDropzone}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            addPhotos(event.dataTransfer.files);
          }}
        >
          <input ref={photoInputRef} id="quote-photos" className={styles.photoInput} name="photos" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple onChange={(event) => addPhotos(event.currentTarget.files ?? [])} />
          <div className={styles.photoActions}>
            <button type="button" className={styles.photoChooseButton} onClick={() => photoInputRef.current?.click()} disabled={selectedPhotos.length >= MAX_PHOTOS}>
              Choose photos
            </button>
            <p className={styles.help}>Optional. Add up to {MAX_PHOTOS} photos; they are compressed before upload.</p>
          </div>
          {selectedPhotos.length > 0 ? (
            <div className={styles.photoList} aria-label="Selected project photos">
              {selectedPhotos.map((photo, index) => (
                <div className={styles.photoItem} key={`${photo.name}-${photo.lastModified}-${index}`}>
                  <span>
                    <strong>{photo.name}</strong>
                    <small>{formatFileSize(photo.size)}</small>
                  </span>
                  <button type="button" onClick={() => removePhoto(index)} aria-label={`Remove ${photo.name}`}>Remove</button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <label className={styles.honeypot} aria-hidden="true">Company<input name="company" tabIndex={-1} autoComplete="off" /></label>
      {isSubmitting && <div className={styles.progress}><progress value={progress} max="100" /><span>{progress}%</span></div>}
      <button className={styles.submit} type="submit" disabled={isSubmitting}>{isSubmitting ? 'Sending request...' : estimateLabel}</button>
      {message && <p className={`${styles.message} ${message.type === 'success' ? styles.success : styles.error}`} role="status">{message.text}</p>}
    </form>
  );
}