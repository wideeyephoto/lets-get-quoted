'use client';

import { useEffect, useRef, useState } from 'react';
import { compressImage } from '@/lib/client-images';
import { normalizeUsPhone } from '@/lib/phone';
import { computeEstimateRange, getEstimateButtonLabel, getSiteContent, type EstimateMaterialTier, type EstimateSize } from '@/lib/site-content';
import type { Site } from '@/lib/sites';
import styles from './themes.module.css';

type HeroQuickFormProps = {
  site: Pick<Site, 'id' | 'published' | 'content' | 'company_name' | 'tagline' | 'headline' | 'service_area' | 'phone'>;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PHOTOS = 6;

const SIZE_OPTIONS: { value: EstimateSize; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
];

const TIER_OPTIONS: { value: EstimateMaterialTier; label: string }[] = [
  { value: 'economical', label: 'Economical' },
  { value: 'standard', label: 'Standard' },
  { value: 'premium', label: 'Premium' },
];

function formatCurrency(value: number): string {
  return `$${value.toLocaleString('en-US')}`;
}

// Compact lead capture rendered inside the hero section so it's visible above
// the fold without scrolling. When the contractor has enabled instant
// estimate ranges (see site-content.ts), this expands into a short wizard —
// describe the project, then job size + material tier, then name/contact —
// and shows a rough $ range client-side only after contact info is given,
// submitting a single lead with everything included. Otherwise it's just the
// two-field quick capture, submitted immediately.
export default function HeroQuickForm({ site }: HeroQuickFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const startedAt = useRef(Date.now());
  const siteContent = getSiteContent(site.content);
  const quoteForm = siteContent.quoteForm;
  const estimateRanges = siteContent.estimateRanges;
  const emailRequired = quoteForm.emailRequired;
  const estimateLabel = getEstimateButtonLabel(quoteForm);
  const wizardEnabled = estimateRanges.enabled;

  const [step, setStep] = useState<'describe' | 'qa' | 'contact' | 'result'>(wizardEnabled ? 'describe' : 'contact');

  // On each wizard step change (not initial mount / StrictMode re-run), move
  // focus into the new step so keyboard/SR users aren't dropped on <body> when
  // the previous step's button unmounts — the focused field's accessible name
  // (or the result heading) announces the step. Mirrors the main quote form.
  const prevStepRef = useRef(step);
  useEffect(() => {
    if (prevStepRef.current === step) return;
    prevStepRef.current = step;
    const form = formRef.current;
    if (!form) return;
    const field = form.querySelector<HTMLElement>('input:not([tabindex="-1"]):not([type="file"]), textarea');
    const target = field ?? form.querySelector<HTMLElement>('h2');
    if (!target) return;
    if (target.tagName === 'H2') target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }, [step]);
  const [description, setDescription] = useState('');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [size, setSize] = useState<EstimateSize>('medium');
  const [tier, setTier] = useState<EstimateMaterialTier>('standard');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const [chatQuestion, setChatQuestion] = useState('');
  const [chatAnswer, setChatAnswer] = useState('');
  const [chatResponseId, setChatResponseId] = useState('');
  const [chatTurn, setChatTurn] = useState(0);
  const [selectedPhotos, setSelectedPhotos] = useState<File[]>([]);

  function addPhotos(files: FileList | File[]) {
    const images = Array.from(files).filter((file) => file.type.startsWith('image/'));
    setSelectedPhotos((current) => [...current, ...images].slice(0, MAX_PHOTOS));
    if (photoInputRef.current) photoInputRef.current.value = '';
  }

  function removePhoto(index: number) {
    setSelectedPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index));
  }

  function applyChatResult(result: { type?: string; question?: string; responseId?: string; size?: EstimateSize; tier?: EstimateMaterialTier } | null) {
    if (result?.type === 'question' && result.question) {
      setChatQuestion(result.question);
      setChatResponseId(result.responseId ?? '');
      setChatTurn((current) => current + 1);
      setChatAnswer('');
      setStep('qa');
      return;
    }
    if (result?.size) setSize(result.size);
    if (result?.tier) setTier(result.tier);
    setStep('contact');
  }

  async function handleDescribeContinue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedDescription = description.trim();
    if (!trimmedDescription) {
      setStatus({ tone: 'error', text: "Tell us what you need done." });
      return;
    }
    setStatus(null);
    setIsClassifying(true);
    try {
      const response = await fetch('/api/public/leads/classify-estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: site.id,
          description: trimmedDescription,
          turn: 0,
          businessName: site.company_name,
          businessSummary: site.tagline || site.headline || '',
          serviceArea: site.service_area || '',
        }),
      });
      const result = await response.json().catch(() => null);
      applyChatResult(result);
    } catch {
      // AI is a convenience, not a requirement — fall back to contact info silently.
      setStep('contact');
    } finally {
      setIsClassifying(false);
    }
  }

  async function handleChatAnswerSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedAnswer = chatAnswer.trim();
    if (!trimmedAnswer) return;
    setIsClassifying(true);
    try {
      const response = await fetch('/api/public/leads/classify-estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: site.id, previousResponseId: chatResponseId, answer: trimmedAnswer, turn: chatTurn }),
      });
      const result = await response.json().catch(() => null);
      applyChatResult(result);
    } catch {
      setStep('contact');
    } finally {
      setIsClassifying(false);
    }
  }

  // Restart the wizard from the description (kept, so it can be edited).
  // Chat state is reset — the AI thread can't be resumed after backtracking.
  function restartWizard() {
    setChatQuestion('');
    setChatAnswer('');
    setChatResponseId('');
    setChatTurn(0);
    setStatus(null);
    setStep('describe');
  }

  function handleContactSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedContact = contact.trim();
    if (!name.trim() || !trimmedContact) return;

    const isEmail = emailRequired || trimmedContact.includes('@');
    const valid = isEmail ? EMAIL_REGEX.test(trimmedContact) : Boolean(normalizeUsPhone(trimmedContact));
    if (!valid) {
      setStatus({ tone: 'error', text: isEmail ? 'Enter a valid email address.' : 'Enter a valid phone number.' });
      return;
    }

    setStatus(null);
    if (wizardEnabled) submitLead({ size, tier, description });
    else submitLead();
  }

  async function submitLead(details?: { size: EstimateSize; tier: EstimateMaterialTier; description: string }) {
    if (!site.published || window.self !== window.top) {
      setStatus({ tone: 'error', text: `${estimateLabel} requests become active when this website is published.` });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);
    try {
      const data = new FormData(formRef.current ?? undefined);
      data.set('siteId', site.id);
      data.set('startedAt', String(startedAt.current));
      data.set('name', name.trim());
      if (emailRequired || contact.includes('@')) data.set('email', contact.trim());
      else data.set('phone', contact.trim());

      if (details) {
        const range = computeEstimateRange(estimateRanges, details.size, details.tier);
        const sizeLabel = SIZE_OPTIONS.find((option) => option.value === details.size)?.label ?? details.size;
        const tierLabel = TIER_OPTIONS.find((option) => option.value === details.tier)?.label ?? details.tier;
        const summary = `Job size: ${sizeLabel}. Materials: ${tierLabel}. Estimated range shown: ${formatCurrency(range.min)}-${formatCurrency(range.max)}.`;
        const trimmedDescription = details.description.trim();
        data.set('message', trimmedDescription ? `${trimmedDescription}\n\n${summary}` : summary);
      }

      data.delete('photos');
      for (const photo of selectedPhotos.slice(0, MAX_PHOTOS)) {
        data.append('photos', await compressImage(photo, 1600, 0.8));
      }

      const response = await fetch('/api/public/leads', { method: 'POST', body: data });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Unable to send your request.');

      if (details) {
        setStep('result');
      } else {
        setStatus({ tone: 'success', text: `Thanks! We'll call you back within about an hour with your free estimate.` });
        formRef.current?.reset();
        setName('');
        setContact('');
        startedAt.current = Date.now();
      }
      setSelectedPhotos([]);
      if (photoInputRef.current) photoInputRef.current.value = '';
    } catch (error) {
      setStatus({ tone: 'error', text: error instanceof Error ? error.message : 'Unable to send your request.' });
    } finally {
      setIsSubmitting(false);
    }
  }

  const range = wizardEnabled ? computeEstimateRange(estimateRanges, size, tier) : null;
  const stepIndex = step === 'describe' ? 0 : step === 'qa' ? 1 : step === 'contact' ? 2 : 3;
  const thinking = (
    <span className={styles.heroFormThinking}>
      Thinking
      <span className={styles.heroFormDots} aria-hidden="true"><i /><i /><i /></span>
    </span>
  );

  return (
    <form
      ref={formRef}
      className={styles.heroQuickForm}
      onSubmit={step === 'describe' ? handleDescribeContinue : step === 'qa' ? handleChatAnswerSubmit : step === 'contact' ? handleContactSubmit : (event) => event.preventDefault()}
    >
      <label className={styles.heroFormHoneypot} aria-hidden="true">Company<input name="company" tabIndex={-1} autoComplete="off" /></label>

      {wizardEnabled && (
        <div className={styles.heroFormProgress} aria-hidden="true">
          {[0, 1, 2].map((index) => <span key={index} data-active={index <= Math.min(stepIndex, 2)} />)}
        </div>
      )}

      {step === 'describe' && (
        <div className={styles.heroFormStep} key="describe">
          <h2>{estimateLabel}</h2>
          <p className={styles.heroFormNote}>Tell us what you need done — a couple quick questions, then we&apos;ll show your range.</p>
          <textarea
            aria-label="Describe your project"
            placeholder="e.g. AC repair, deep clean, fence installation..."
            maxLength={500}
            rows={2}
            required
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                formRef.current?.requestSubmit();
              }
            }}
          />
          <button type="submit" disabled={isClassifying}>{isClassifying ? thinking : 'Continue'}</button>
        </div>
      )}

      {step === 'qa' && (
        <div className={styles.heroFormStep} key="qa">
          <h2>{estimateLabel}</h2>
          <p id="hqf-question" className={styles.heroFormQuestion}>{chatQuestion}</p>
          <input
            aria-labelledby="hqf-question"
            placeholder="Your answer"
            maxLength={300}
            required
            value={chatAnswer}
            onChange={(event) => setChatAnswer(event.target.value)}
          />
          <button type="submit" disabled={isClassifying}>{isClassifying ? thinking : 'Next'}</button>
          <button type="button" className={styles.heroFormRestart} onClick={restartWizard}>← Start over</button>
        </div>
      )}

      {step === 'contact' && (
        <div className={styles.heroFormStep} key="contact">
          <h2>{estimateLabel}</h2>
          <p className={styles.heroFormNote}>{wizardEnabled ? 'Add your info to see your range. Free & no obligation — we reply within about an hour.' : 'Free & no obligation — we reply within about an hour.'}</p>
          <div className={styles.heroQuickFormRow}>
            <input name="name" aria-label="Your name" placeholder="Your name" autoComplete="name" maxLength={100} required value={name} onChange={(event) => setName(event.target.value)} />
            <input
              name="contact"
              aria-label={emailRequired ? 'Email' : 'Phone or email'}
              type={emailRequired ? 'email' : 'text'}
              placeholder={emailRequired ? 'Email' : 'Phone or email'}
              autoComplete={emailRequired ? 'email' : 'tel'}
              maxLength={160}
              required
              value={contact}
              onChange={(event) => setContact(event.target.value)}
            />
          </div>
          <div className={styles.heroFormPhotoRow}>
            <input
              ref={photoInputRef}
              className={styles.heroFormPhotoInput}
              tabIndex={-1}
              aria-hidden="true"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              multiple
              onChange={(event) => addPhotos(event.currentTarget.files ?? [])}
            />
            <button type="button" className={styles.heroFormPhotoButton} onClick={() => photoInputRef.current?.click()} disabled={selectedPhotos.length >= MAX_PHOTOS}>
              {selectedPhotos.length > 0 ? `Add more photos (${selectedPhotos.length}/${MAX_PHOTOS})` : 'Add photos (optional)'}
            </button>
            {selectedPhotos.length > 0 && (
              <div className={styles.heroFormPhotoList}>
                {selectedPhotos.map((photo, index) => (
                  <span className={styles.heroFormPhotoChip} key={`${photo.name}-${photo.lastModified}-${index}`}>
                    {photo.name.length > 16 ? `${photo.name.slice(0, 13)}\u2026` : photo.name}
                    <button type="button" onClick={() => removePhoto(index)} aria-label={`Remove ${photo.name}`}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Sending...' : wizardEnabled ? 'See My Free Estimate' : 'Get My Free Estimate'}</button>
          {site.phone && <a className={styles.heroFormOrCall} href={`tel:${site.phone}`}>or call <strong>{site.phone}</strong> — free quote</a>}
          {wizardEnabled && <button type="button" className={styles.heroFormRestart} onClick={restartWizard}>← Start over</button>}
        </div>
      )}

      {step === 'result' && range && (
        <div className={styles.heroFormStep} key="result">
          <h2>Your estimated range</h2>
          <div className={styles.heroFormResultPanel}>
            <p className={styles.heroFormResult}>{formatCurrency(range.min)} – {formatCurrency(range.max)}</p>
            <span className={styles.heroFormResultBadge}>✓ Request sent</span>
          </div>
          <p className={styles.heroFormNote}>This is a rough estimate, not a final quote — we&apos;ll follow up to confirm exact pricing for your project.</p>
          {site.phone && <a className={styles.heroFormCall} href={`tel:${site.phone}`}>Call now to lock it in</a>}
        </div>
      )}

      {status && <p className={styles.heroFormStatus} data-tone={status.tone} role={status.tone === 'error' ? 'alert' : 'status'}>{status.text}</p>}
    </form>
  );
}
