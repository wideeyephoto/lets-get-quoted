'use client';

import { useRef, useState } from 'react';
import { compressImage } from '@/lib/client-images';
import styles from './quote-request-form.module.css';

type QuoteRequestFormProps = {
  siteId: string;
  enabled: boolean;
};

export default function QuoteRequestForm({ siteId, enabled }: QuoteRequestFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [progress, setProgress] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const startedAt = useRef(Date.now());

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enabled || window.self !== window.top) {
      setMessage({ type: 'error', text: 'Quote requests become active when this website is published.' });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    setProgress(5);

    try {
      const form = event.currentTarget;
      const data = new FormData(form);
      data.set('siteId', siteId);
      data.set('startedAt', String(startedAt.current));
      const photoInput = form.elements.namedItem('photos') as HTMLInputElement;
      data.delete('photos');
      const photos = Array.from(photoInput.files ?? []).slice(0, 3);
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
      <label className={styles.field}><span>Email</span><input name="email" type="email" autoComplete="email" maxLength={160} /></label>
      <label className={styles.field}><span>Project type</span><select name="projectType" defaultValue=""><option value="" disabled>Select a project</option><option>Renovation</option><option>New construction</option><option>Repair</option><option>Kitchen or bathroom</option><option>Exterior work</option><option>Commercial project</option><option>Other</option></select></label>
      <label className={`${styles.field} ${styles.wide}`}><span>Project address</span><input name="address" autoComplete="street-address" maxLength={240} /></label>
      <label className={`${styles.field} ${styles.wide}`}><span>Tell us about the project</span><textarea name="message" maxLength={3000} required /></label>
      <label className={`${styles.field} ${styles.wide}`}><span>Project photos</span><input className={styles.photoInput} name="photos" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple /><p className={styles.help}>Optional. Add up to three photos; they are compressed before upload.</p></label>
      <label className={styles.honeypot} aria-hidden="true">Company<input name="company" tabIndex={-1} autoComplete="off" /></label>
      {isSubmitting && <div className={styles.progress}><progress value={progress} max="100" /><span>{progress}%</span></div>}
      <button className={styles.submit} type="submit" disabled={isSubmitting}>{isSubmitting ? 'Sending request...' : 'Request a quote'}</button>
      {message && <p className={`${styles.message} ${message.type === 'success' ? styles.success : styles.error}`} role="status">{message.text}</p>}
    </form>
  );
}