'use client';

import { useEffect, useRef, useState } from 'react';
import { compressImage } from '@/lib/client-images';
import { normalizeUsPhone } from '@/lib/phone';
import { DEFAULT_FULLY_BOOKED_MESSAGE, getEstimateButtonLabel, getSiteContent } from '@/lib/site-content';
import type { Site } from '@/lib/sites';
import styles from './themes.module.css';

type HeroQuickFormProps = {
  site: Pick<Site, 'id' | 'published' | 'content' | 'company_name' | 'tagline' | 'headline' | 'service_area' | 'phone'>;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PHOTOS = 6;

type EstimateRange = { min: number; max: number };

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
  const emailRequired = quoteForm.emailRequired;
  const estimateLabel = getEstimateButtonLabel(quoteForm);
  const wizardEnabled = siteContent.estimateRanges.enabled;
  // Owner-controlled email field on the AI intake ('off' | 'optional' |
  // 'required') — phone is always the required contact there.
  const wizardEmailField = siteContent.estimateRanges.emailField;
  // Lead-quality gates (see SiteLeadFiltersContent): timeline question,
  // service-area question (only when the owner listed cities), minimum job
  // note, and fully-booked capacity banner. Gates flag, never block.
  const leadFilters = siteContent.leadFilters;
  const askTimeline = wizardEnabled && leadFilters.askTimeline;
  const askLocation = wizardEnabled && leadFilters.serviceAreaGate && siteContent.serviceAreas.cities.some((city) => city.trim());
  const bookedUntil = leadFilters.fullyBooked.until ? new Date(`${leadFilters.fullyBooked.until}T00:00:00`) : null;
  const bookedNote = leadFilters.fullyBooked.enabled
    ? `${leadFilters.fullyBooked.message || DEFAULT_FULLY_BOOKED_MESSAGE}${bookedUntil && !Number.isNaN(bookedUntil.getTime()) ? ` (booked through ${bookedUntil.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})` : ''}`
    : '';

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
  // Wizard-only extra email field (the wizard's main contact field is always a
  // phone number — the promised follow-up is a text or call).
  const [email, setEmail] = useState('');
  // The AI-priced range for the described job; null when the AI couldn't
  // price it (the lead still submits, just without a shown number).
  const [estimate, setEstimate] = useState<EstimateRange | null>(null);
  const [timeline, setTimeline] = useState<'asap' | 'month' | 'researching'>('asap');
  const [location, setLocation] = useState('');
  // Soft fit signals from the AI (out-of-area / excluded work) — shown as
  // notes and passed along as lead flags, never used to block submission.
  const [fit, setFit] = useState<{ inArea: boolean | null; excluded: boolean }>({ inArea: null, excluded: false });
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

  function applyChatResult(result: { type?: string; question?: string; responseId?: string; min?: number; max?: number; inArea?: boolean | null; excluded?: boolean } | null) {
    if (result?.type === 'question' && result.question) {
      setChatQuestion(result.question);
      setChatResponseId(result.responseId ?? '');
      setChatTurn((current) => current + 1);
      setChatAnswer('');
      setStep('qa');
      return;
    }
    const min = Number(result?.min);
    const max = Number(result?.max);
    setEstimate(Number.isFinite(min) && Number.isFinite(max) && min > 0 && min < max ? { min: Math.round(min), max: Math.round(max) } : null);
    setFit({ inArea: result?.inArea === true ? true : result?.inArea === false ? false : null, excluded: result?.excluded === true });
    setStep('contact');
  }

  async function handleDescribeContinue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedDescription = description.trim();
    if (!trimmedDescription) {
      setStatus({ tone: 'error', text: "Tell us what you need done." });
      return;
    }
    if (askLocation && !location.trim()) {
      setStatus({ tone: 'error', text: 'Add your ZIP code or town so we can confirm we serve your area.' });
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
          location: location.trim(),
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
    setEstimate(null);
    setFit({ inArea: null, excluded: false });
    setStatus(null);
    setStep('describe');
  }

  function handleContactSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedContact = contact.trim();
    if (!name.trim() || !trimmedContact) return;

    if (wizardEnabled) {
      // The AI intake always needs a real phone number — the follow-up we
      // promise is a text or call within a few hours.
      if (!normalizeUsPhone(trimmedContact)) {
        setStatus({ tone: 'error', text: 'Enter a valid phone number so we can text or call you with your quote.' });
        return;
      }
      const trimmedEmail = email.trim();
      if (wizardEmailField === 'required' && !EMAIL_REGEX.test(trimmedEmail)) {
        setStatus({ tone: 'error', text: 'Enter a valid email address.' });
        return;
      }
      if (wizardEmailField === 'optional' && trimmedEmail && !EMAIL_REGEX.test(trimmedEmail)) {
        setStatus({ tone: 'error', text: 'That email address doesn’t look right — fix it or leave it blank.' });
        return;
      }
      setStatus(null);
      submitLead({ description });
      return;
    }

    const isEmail = emailRequired || trimmedContact.includes('@');
    const valid = isEmail ? EMAIL_REGEX.test(trimmedContact) : Boolean(normalizeUsPhone(trimmedContact));
    if (!valid) {
      setStatus({ tone: 'error', text: isEmail ? 'Enter a valid email address.' : 'Enter a valid phone number.' });
      return;
    }

    setStatus(null);
    submitLead();
  }

  async function submitLead(details?: { description: string }) {
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
      if (details) {
        data.set('phone', contact.trim());
        if (email.trim()) data.set('email', email.trim());
      } else if (emailRequired || contact.includes('@')) {
        data.set('email', contact.trim());
      } else {
        data.set('phone', contact.trim());
      }

      if (details) {
        const timelineLabel = timeline === 'asap' ? 'Needed ASAP' : timeline === 'month' ? 'In the next month' : 'Just researching prices';
        const parts = [
          estimate
            ? `AI estimate shown to the customer: ${formatCurrency(estimate.min)}-${formatCurrency(estimate.max)}.`
            : 'AI estimate was unavailable — no price range was shown; needs a manual quote.',
          askTimeline ? `Timing: ${timelineLabel}.` : '',
          location.trim() ? `Location given: ${location.trim()}.` : '',
        ].filter(Boolean);
        const trimmedDescription = details.description.trim();
        data.set('message', trimmedDescription ? `${trimmedDescription}\n\n${parts.join(' ')}` : parts.join(' '));
        data.set('timeline', timeline);
        if (location.trim()) data.set('location', location.trim());
        if (estimate) {
          data.set('estimateMin', String(estimate.min));
          data.set('estimateMax', String(estimate.max));
        }
        if (fit.inArea !== null) data.set('inArea', String(fit.inArea));
        if (fit.excluded) data.set('excluded', 'true');
      }

      data.delete('photos');
      for (const photo of selectedPhotos.slice(0, MAX_PHOTOS)) {
        data.append('photos', await compressImage(photo, 1600, 0.8));
      }

      const response = await fetch('/api/public/leads', { method: 'POST', body: data });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Unable to send your request.');

      if (details && estimate) {
        setStep('result');
      } else {
        setStatus({ tone: 'success', text: details ? 'Thanks! Your request is in — one of our experts will text or call you within the next few hours with your exact quote.' : `Thanks! We'll call you back within about an hour with your free estimate.` });
        formRef.current?.reset();
        setName('');
        setContact('');
        setEmail('');
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
      data-edit={wizardEnabled ? 'estimate' : 'quoteForm'}
    >
      <label className={styles.heroFormHoneypot} aria-hidden="true">Company<input name="company" tabIndex={-1} autoComplete="off" /></label>

      {bookedNote && step !== 'result' && <p className={styles.heroFormBooked}>{bookedNote}</p>}

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
          {askTimeline && (
            <select aria-label="When do you need this done?" value={timeline} onChange={(event) => setTimeline(event.target.value as 'asap' | 'month' | 'researching')}>
              <option value="asap">Needed ASAP</option>
              <option value="month">In the next month</option>
              <option value="researching">Just researching prices</option>
            </select>
          )}
          {askLocation && (
            <input aria-label="Your ZIP code or town" placeholder="Your ZIP code or town" maxLength={80} required value={location} onChange={(event) => setLocation(event.target.value)} />
          )}
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
          <p className={styles.heroFormNote}>{wizardEnabled && estimate ? 'Add your info to see your range. Free & no obligation — we reply within about an hour.' : 'Free & no obligation — we reply within about an hour.'}</p>
          <div className={styles.heroQuickFormRow}>
            <input name="name" aria-label="Your name" placeholder="Your name" autoComplete="name" maxLength={100} required value={name} onChange={(event) => setName(event.target.value)} />
            <input
              name="contact"
              aria-label={wizardEnabled ? 'Phone number' : emailRequired ? 'Email' : 'Phone or email'}
              type={wizardEnabled ? 'tel' : emailRequired ? 'email' : 'text'}
              placeholder={wizardEnabled ? 'Phone number' : emailRequired ? 'Email' : 'Phone or email'}
              autoComplete={wizardEnabled ? 'tel' : emailRequired ? 'email' : 'tel'}
              maxLength={160}
              required
              value={contact}
              onChange={(event) => setContact(event.target.value)}
            />
          </div>
          {wizardEnabled && wizardEmailField !== 'off' && (
            <input
              aria-label={wizardEmailField === 'required' ? 'Email' : 'Email (optional)'}
              type="email"
              placeholder={wizardEmailField === 'required' ? 'Email' : 'Email (optional)'}
              autoComplete="email"
              maxLength={160}
              required={wizardEmailField === 'required'}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
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
          {wizardEnabled && (() => {
            const notes = [
              fit.inArea === false ? 'your location may be outside our usual service area' : '',
              fit.excluded ? "this may be a type of job we don't take on" : '',
              estimate && leadFilters.minJobAmount > 0 && estimate.max < leadFilters.minJobAmount ? `our minimum job size is ${formatCurrency(leadFilters.minJobAmount)}` : '',
            ].filter(Boolean);
            return notes.length ? <p className={styles.heroFormFitNote}>Heads up: {notes.join('; ')} — send your request and we&apos;ll confirm when we reach out.</p> : null;
          })()}
          <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Sending...' : wizardEnabled && estimate ? 'See My Free Estimate' : 'Get My Free Estimate'}</button>
          {site.phone && <a className={styles.heroFormOrCall} href={`tel:${site.phone}`}>or call <strong>{site.phone}</strong> — free quote</a>}
          {wizardEnabled && <button type="button" className={styles.heroFormRestart} onClick={restartWizard}>← Start over</button>}
        </div>
      )}

      {step === 'result' && estimate && (
        <div className={styles.heroFormStep} key="result">
          <h2>Your estimated range</h2>
          <div className={styles.heroFormResultPanel}>
            <p className={styles.heroFormResult}>{formatCurrency(estimate.min)} – {formatCurrency(estimate.max)}</p>
            <span className={styles.heroFormResultBadge}>✓ Request sent</span>
          </div>
          <p className={styles.heroFormNote}>This is a rough estimate, not a final quote — one of our experts will reach out by <strong>text or phone call within the next few hours</strong> to confirm exact pricing for your project.</p>
          {site.phone && <a className={styles.heroFormCall} href={`tel:${site.phone}`}>Call now to lock it in</a>}
        </div>
      )}

      {status && <p className={styles.heroFormStatus} data-tone={status.tone} role={status.tone === 'error' ? 'alert' : 'status'}>{status.text}</p>}
    </form>
  );
}
