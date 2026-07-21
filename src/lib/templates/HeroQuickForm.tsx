'use client';

import { useRef, useState } from 'react';
import { normalizeUsPhone } from '@/lib/phone';
import { computeEstimateRange, getEstimateButtonLabel, getSiteContent, type EstimateMaterialTier, type EstimateSize } from '@/lib/site-content';
import type { Site } from '@/lib/sites';
import styles from './themes.module.css';

type HeroQuickFormProps = {
  site: Pick<Site, 'id' | 'published' | 'content'>;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SIZE_OPTIONS: { value: EstimateSize; label: string; hint: string }[] = [
  { value: 'small', label: 'Small', hint: 'Touch-up or single room' },
  { value: 'medium', label: 'Medium', hint: 'Full room remodel' },
  { value: 'large', label: 'Large', hint: 'Whole-home or addition' },
];

const TIER_OPTIONS: { value: EstimateMaterialTier; label: string; hint: string }[] = [
  { value: 'economical', label: 'Economical', hint: 'Budget-friendly materials' },
  { value: 'standard', label: 'Standard', hint: 'Balanced quality & cost' },
  { value: 'premium', label: 'Premium', hint: 'High-end finishes' },
];

function formatCurrency(value: number): string {
  return `$${value.toLocaleString('en-US')}`;
}

// Compact lead capture rendered inside the hero section so it's visible above
// the fold without scrolling. When the contractor has enabled instant
// estimate ranges (see site-content.ts), this expands into a short wizard —
// name/contact, then job size + material tier — and shows a rough $ range
// client-side before submitting a single lead with everything included.
// Otherwise it's just the two-field quick capture, submitted immediately.
export default function HeroQuickForm({ site }: HeroQuickFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const startedAt = useRef(Date.now());
  const [step, setStep] = useState<'contact' | 'details' | 'result'>('contact');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [size, setSize] = useState<EstimateSize>('medium');
  const [tier, setTier] = useState<EstimateMaterialTier>('standard');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const siteContent = getSiteContent(site.content);
  const quoteForm = siteContent.quoteForm;
  const estimateRanges = siteContent.estimateRanges;
  const emailRequired = quoteForm.emailRequired;
  const estimateLabel = getEstimateButtonLabel(quoteForm);
  const wizardEnabled = estimateRanges.enabled;

  function handleContactContinue(event: React.FormEvent<HTMLFormElement>) {
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
    if (wizardEnabled) setStep('details');
    else submitLead();
  }

  async function submitLead(details?: { size: EstimateSize; tier: EstimateMaterialTier }) {
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
        data.set('message', `Instant estimate request — Job size: ${sizeLabel}. Materials: ${tierLabel}. Estimated range shown: ${formatCurrency(range.min)}-${formatCurrency(range.max)}.`);
      }

      const response = await fetch('/api/public/leads', { method: 'POST', body: data });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Unable to send your request.');

      if (details) {
        setStep('result');
      } else {
        setStatus({ tone: 'success', text: `Thanks! We'll follow up shortly with your ${estimateLabel.toLowerCase()}.` });
        formRef.current?.reset();
        setName('');
        setContact('');
        startedAt.current = Date.now();
      }
    } catch (error) {
      setStatus({ tone: 'error', text: error instanceof Error ? error.message : 'Unable to send your request.' });
    } finally {
      setIsSubmitting(false);
    }
  }

  const range = wizardEnabled ? computeEstimateRange(estimateRanges, size, tier) : null;

  return (
    <form ref={formRef} className={styles.heroQuickForm} onSubmit={step === 'contact' ? handleContactContinue : (event) => event.preventDefault()}>
      <label className={styles.heroFormHoneypot} aria-hidden="true">Company<input name="company" tabIndex={-1} autoComplete="off" /></label>

      {step === 'contact' && (
        <>
          <h2>{estimateLabel}</h2>
          <p className={styles.heroFormNote}>{wizardEnabled ? 'Two quick steps — see a rough range instantly.' : "Just two fields — we'll follow up with the rest."}</p>
          <div className={styles.heroQuickFormRow}>
            <input name="name" placeholder="Your name" autoComplete="name" maxLength={100} required value={name} onChange={(event) => setName(event.target.value)} />
            <input
              name="contact"
              type={emailRequired ? 'email' : 'text'}
              placeholder={emailRequired ? 'Email' : 'Phone or email'}
              autoComplete={emailRequired ? 'email' : 'tel'}
              maxLength={160}
              required
              value={contact}
              onChange={(event) => setContact(event.target.value)}
            />
          </div>
          <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Sending...' : wizardEnabled ? 'Continue' : `Get My ${estimateLabel}`}</button>
        </>
      )}

      {step === 'details' && (
        <>
          <h2>{estimateLabel}</h2>
          <p className={styles.heroFormNote}>Job size</p>
          <div className={styles.heroFormChipRow}>
            {SIZE_OPTIONS.map((option) => (
              <button type="button" key={option.value} className={styles.heroFormChip} data-selected={size === option.value} onClick={() => setSize(option.value)}>
                {option.label}
              </button>
            ))}
          </div>
          <p className={styles.heroFormNote}>Materials</p>
          <div className={styles.heroFormChipRow}>
            {TIER_OPTIONS.map((option) => (
              <button type="button" key={option.value} className={styles.heroFormChip} data-selected={tier === option.value} onClick={() => setTier(option.value)}>
                {option.label}
              </button>
            ))}
          </div>
          <button type="button" disabled={isSubmitting} onClick={() => submitLead({ size, tier })}>{isSubmitting ? 'Calculating...' : 'See My Instant Estimate'}</button>
        </>
      )}

      {step === 'result' && range && (
        <>
          <h2>Your estimated range</h2>
          <p className={styles.heroFormResult}>{formatCurrency(range.min)} – {formatCurrency(range.max)}</p>
          <p className={styles.heroFormNote}>This is a rough estimate, not a final quote — we&apos;ll follow up to confirm exact pricing for your project.</p>
        </>
      )}

      {status && <p className={styles.heroFormStatus} data-tone={status.tone} role="status">{status.text}</p>}
    </form>
  );
}
