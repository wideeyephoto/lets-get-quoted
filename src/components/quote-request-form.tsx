'use client';

import { useEffect, useRef, useState } from 'react';
import { compressImage } from '@/lib/client-images';
import { getEstimateButtonLabel, getSiteContent } from '@/lib/site-content';
import type { Site } from '@/lib/sites';
import AddressAutocomplete from '@/components/address-autocomplete';
import styles from './quote-request-form.module.css';

const MAX_PHOTOS = 6;
const STEP_LABELS = ['Your project', 'Your contact info'];
const TOTAL_STEPS = STEP_LABELS.length;
const LAST_STEP = TOTAL_STEPS - 1;

type QuoteRequestFormProps = {
  site: Pick<Site, 'id' | 'published' | 'content'>;
};

export default function QuoteRequestForm({ site }: QuoteRequestFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const projectStepRef = useRef<HTMLDivElement>(null);
  const contactStepRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const shouldFocusStepRef = useRef(false);
  const quoteForm = getSiteContent(site.content).quoteForm;
  const emailRequired = quoteForm.emailRequired;
  const estimateLabel = getEstimateButtonLabel(quoteForm);
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<File[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const startedAt = useRef(Date.now());

  // Move focus into a step only when the user navigated to it (Continue/Back),
  // so keyboard/SR users aren't dropped on <body> when a nav button unmounts.
  // Gating on the ref (not "not first mount") also avoids StrictMode's dev
  // double-effect and the post-submit reset both stealing focus into an empty
  // field. preventScroll keeps the viewport from jumping.
  useEffect(() => {
    if (!shouldFocusStepRef.current) return;
    shouldFocusStepRef.current = false;
    const container = step === 0 ? projectStepRef.current : contactStepRef.current;
    const first = container?.querySelector('input:not([tabindex="-1"]), textarea, select') as HTMLElement | null;
    first?.focus({ preventScroll: true });
  }, [step]);

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

  // Advance only once the current step's own constraints pass. The project step
  // is validated here (type="button", so no native submit fires); the contact
  // step is validated natively on submit. Because you can only reach the last
  // step through this gate, the (now-hidden) required project fields are always
  // valid at submit time — so no unfocusable-hidden-field submit error.
  function goToNextStep() {
    const container = projectStepRef.current;
    if (container) {
      const controls = Array.from(container.querySelectorAll('input, textarea, select'));
      for (const control of controls) {
        if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement) {
          if (!control.checkValidity()) {
            control.reportValidity();
            return;
          }
        }
      }
    }
    setMessage(null);
    shouldFocusStepRef.current = true;
    setStep((current) => Math.min(LAST_STEP, current + 1));
  }

  function goToPreviousStep() {
    setMessage(null);
    shouldFocusStepRef.current = true;
    setStep((current) => Math.max(0, current - 1));
  }

  // Enter on the project step advances — except inside the message textarea
  // (Enter = newline), on a nav button (its own click handles it), or when
  // AddressAutocomplete already consumed Enter to pick a suggestion
  // (defaultPrevented). There is no submit button on this step, so the browser
  // never implicitly submits here; this is the only Enter-to-advance path.
  function handleProjectKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Enter' || event.defaultPrevented) return;
    const tag = (event.target as HTMLElement).tagName;
    if (tag === 'TEXTAREA' || tag === 'BUTTON') return;
    event.preventDefault();
    goToNextStep();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Enter pressed on an earlier step advances instead of submitting.
    if (step < LAST_STEP) {
      goToNextStep();
      return;
    }
    const form = event.currentTarget;
    const phoneValue = (form.elements.namedItem('phone') as HTMLInputElement | null)?.value.trim() ?? '';
    const emailValue = (form.elements.namedItem('email') as HTMLInputElement | null)?.value.trim() ?? '';
    if (!phoneValue && !emailValue) {
      setMessage({ type: 'error', text: 'Add a phone number or email so we can reach you.' });
      return;
    }
    if (!site.published || window.self !== window.top) {
      setMessage({ type: 'error', text: `${estimateLabel} requests become active when this website is published.` });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    setProgress(5);

    try {
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
      setMessage({ type: 'success', text: "Your request was sent — we'll call you back within about an hour." });
      formRef.current?.reset();
      setSelectedPhotos([]);
      setStep(0);
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
      <div className={styles.stepper}>
        <div className={styles.stepBar}>
          <span className={styles.stepFill} style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }} />
        </div>
        <p className={styles.stepLabel} aria-live="polite">Step {step + 1} of {TOTAL_STEPS} — {STEP_LABELS[step]}</p>
      </div>

      <div ref={projectStepRef} className={styles.step} hidden={step !== 0} role="group" aria-label="Your project" onKeyDown={handleProjectKeyDown}>
        <label className={`${styles.field} ${styles.wide}`}><span>Tell us about the project</span><textarea name="message" maxLength={3000} required placeholder="e.g. Full kitchen remodel — new cabinets, quartz counters, and flooring. Hoping to start within the next month or two." /></label>
        <div className={`${styles.field} ${styles.wide}`}><label htmlFor="quote-address">Project address <em className={styles.optional}>(optional)</em></label><AddressAutocomplete id="quote-address" name="address" placeholder="1418 Maplewood Ave, Royal Oak, MI" maxLength={240} /></div>
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
      </div>

      <div ref={contactStepRef} className={styles.step} hidden={step !== 1} role="group" aria-label="Your contact info">
        <label className={styles.field}><span>Name</span><input name="name" autoComplete="name" maxLength={100} required /></label>
        <label className={styles.field}><span>Phone</span><input name="phone" type="tel" autoComplete="tel" maxLength={40} /></label>
        <label className={`${styles.field} ${styles.wide}`}><span>Email {emailRequired ? '(required)' : '(optional)'}</span><input name="email" type="email" autoComplete="email" maxLength={160} required={emailRequired} /></label>
        <p className={styles.reassure}>Free &amp; no obligation — we reply within about an hour.</p>
      </div>

      <label className={styles.honeypot} aria-hidden="true">Company<input name="company" tabIndex={-1} autoComplete="off" /></label>
      {isSubmitting && <div className={styles.progress}><progress value={progress} max="100" /><span>{progress}%</span></div>}

      <div className={styles.stepNav}>
        {step > 0 && <button type="button" className={styles.back} onClick={goToPreviousStep} disabled={isSubmitting}>Back</button>}
        {step < LAST_STEP
          ? <button type="button" className={styles.next} onClick={goToNextStep}>Continue</button>
          : <button type="submit" className={styles.next} disabled={isSubmitting}>{isSubmitting ? 'Sending request...' : 'Get My Free Estimate'}</button>}
      </div>

      {message && <p className={`${styles.message} ${message.type === 'success' ? styles.success : styles.error}`} role="status">{message.text}</p>}
    </form>
  );
}
