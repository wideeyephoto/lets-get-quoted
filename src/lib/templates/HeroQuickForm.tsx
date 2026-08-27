'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { compressImage } from '@/lib/client-images';
import { extractMediaDataUrls } from '@/lib/client-media-frames';
import { assessImageQuality } from '@/lib/client-photo-quality';
import { getTradePhotoTip } from '@/lib/trade-photo-tips';
import { classifyEmail, suggestEmailFix } from '@/lib/email-quality';
import { normalizeUsPhone } from '@/lib/phone';
import { matchesServedCity } from '@/lib/service-area-match';
import { HoneypotField } from '@/components/honeypot-field';
import { DEFAULT_FULLY_BOOKED_MESSAGE, getEstimateButtonLabel, getPublishedRatingBadge, getSiteContent, isFullyBookedActive } from '@/lib/site-content';
import type { Site } from '@/lib/sites';
import { getOrCreateAiIntakeThread } from '@/lib/ai-intake-thread';
import IntroVideo from './IntroVideo';
import styles from './themes.module.css';

type HeroQuickFormProps = {
  site: Pick<Site, 'id' | 'published' | 'content' | 'company_name' | 'tagline' | 'headline' | 'service_area' | 'phone' | 'avg_response_ms'>;
  /**
   * Rendered for the owner to try, not for a customer to use — the builder's
   * "Preview your AI Intake". Everything behaves normally, including the AI
   * questions, right up to the submit, which stops rather than creating a lead.
   * A contractor testing their own form must not end up in their own pipeline.
   */
  demo?: boolean;
};

// "within 25 minutes" / "within 2 hours" — always rounded UP so the claim is
// conservative; the stat itself is only attached when it's honest (≥3 real
// responses, average under 4h — see withResponseStat in lib/sites).
function formatReplyTime(ms: number): string {
  const minutes = Math.ceil(ms / 60000 / 5) * 5;
  if (minutes < 60) return `${Math.max(5, minutes)} minutes`;
  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? '1 hour' : `${hours} hours`;
}

const MAX_PHOTOS = 6;
const MAX_INTAKE_QUESTIONS = 3;

/* --- the contact fields ----------------------------------------------------
   This is the step the whole intake has been walking toward, and it used to be
   three unlabelled boxes with grey placeholder text — indistinguishable from
   every form anyone has ever abandoned. A homeowner who has just answered four
   questions about their broken faucet is asked to hand over a phone number, and
   nothing on screen acknowledges that or shows them getting anywhere.

   So each field is named, carries an icon, shows an EXAMPLE rather than
   repeating its own label, and ticks when it's filled. The ticks are the point:
   three of them is visible progress toward a price, on a step that otherwise
   gives you nothing back until you submit. */

const FIELD_ICONS = {
  user: '<circle cx="12" cy="8" r="3.4"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  phone: '<path d="M7 3.5h3l1.4 4-2 1.4a12 12 0 0 0 5.7 5.7l1.4-2 4 1.4v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 5 5.7 2 2 0 0 1 7 3.5Z"/>',
  pin: '<path d="M19 10c0 5.2-7 11-7 11s-7-5.8-7-11a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2.6"/>',
  mail: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/>',
} as const;

// Drawn rather than typed. Emoji render differently on every platform and read
// as decoration; these have to read as part of the field.
function FieldIcon({ name }: { name: keyof typeof FIELD_ICONS }) {
  return (
    <svg
      className={styles.heroFieldIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: FIELD_ICONS[name] }}
    />
  );
}

/**
 * A named field. The <label> wraps the input, which is what associates the two
 * — so the inputs inside deliberately carry NO aria-label: it would win over
 * the visible text and a screen reader would hear a different name from the one
 * on screen.
 */
function Field({
  icon,
  label,
  filled,
  children,
}: {
  icon: keyof typeof FIELD_ICONS;
  label: string;
  filled: boolean;
  children: ReactNode;
}) {
  return (
    <label className={styles.heroField} data-filled={filled || undefined}>
      <span className={styles.heroFieldLabel}>{label}</span>
      <span className={styles.heroFieldBox}>
        <FieldIcon name={icon} />
        {children}
        <span className={styles.heroFieldTick} aria-hidden="true">✓</span>
      </span>
    </label>
  );
}

type EstimateRange = {
  min: number;
  max: number;
  basis?: string;
  requiresSiteVisit?: boolean;
  visitReason?: string;
};

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
export default function HeroQuickForm({ site, demo = false }: HeroQuickFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const startedAt = useRef(Date.now());
  const siteContent = getSiteContent(site.content);
  const quoteForm = siteContent.quoteForm;
  const emailRequired = quoteForm.emailRequired;
  const estimateLabel = getEstimateButtonLabel(quoteForm);
  const wizardEnabled = siteContent.estimateRanges.enabled;
  const [classicFallback, setClassicFallback] = useState(false);
  const smartIntakeActive = wizardEnabled && !classicFallback;
  const intakeThreadIdRef = useRef<string | null>(null);
  // Owner-controlled email field on the AI intake ('off' | 'optional' |
  // 'required') — phone is always the required contact there.
  const wizardEmailField = siteContent.estimateRanges.emailField;
  // Lead-quality gates (see SiteLeadFiltersContent): timeline question,
  // service-area question (only when the owner listed cities), minimum job
  // note, and fully-booked capacity banner. Gates flag, never block.
  const leadFilters = siteContent.leadFilters;
  const askTimeline = smartIntakeActive && leadFilters.askTimeline;
  const configuredCities = siteContent.serviceAreas.cities.map((city) => city.trim()).filter(Boolean);
  const askLocation = smartIntakeActive && leadFilters.serviceAreaGate && configuredCities.length > 0;
  const primaryServedCity = configuredCities[0] || (site.service_area || 'Your city or town');
  const locationPlaceholder = primaryServedCity.startsWith('e.g.') ? primaryServedCity : `e.g. ${primaryServedCity}`;
  // Real, earned response-time stat (absent = no honest claim to make).
  const avgReplyMs = typeof site.avg_response_ms === 'number' && site.avg_response_ms > 0 ? site.avg_response_ms : null;
  const replyPromise = avgReplyMs
    ? `we typically reply within ${formatReplyTime(avgReplyMs)}`
    : 'we\u2019ll follow up as soon as possible';
  const responseTiming = avgReplyMs
    ? `Typically within ${formatReplyTime(avgReplyMs)} to confirm the details and next steps.`
    : 'As soon as possible to confirm the details and next steps.';

  // Star rating for the result screen — the owner's published rating badge
  // (enabled + real review count), the same source SiteProofStrip uses.
  const ratingBadge = getPublishedRatingBadge(site.content);
  const ratingStars = ratingBadge ? Math.round(ratingBadge.rating) : 0;

  // Trade-specific example text: real service names beat generic cross-trade
  // examples ("AC repair, deep clean, fence installation") that read wrong on
  // any single contractor's site.
  const serviceExamples = siteContent.services.items.map((item) => item.title.trim()).filter(Boolean).slice(0, 3);
  const describePlaceholder = serviceExamples.length >= 2
    ? `e.g. ${serviceExamples.map((example) => example.toLowerCase()).join(', ')}...`
    : siteContent.trade.trim()
      ? `Describe your ${siteContent.trade.trim().toLowerCase()} job — what's going on?`
      : 'Tell us what you need done — the more detail, the better the estimate.';
  const bookedUntil = leadFilters.fullyBooked.until ? new Date(`${leadFilters.fullyBooked.until}T00:00:00`) : null;
  const bookedNote = isFullyBookedActive(leadFilters)
    ? `${leadFilters.fullyBooked.message || DEFAULT_FULLY_BOOKED_MESSAGE}${bookedUntil && !Number.isNaN(bookedUntil.getTime()) ? ` (booked through ${bookedUntil.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})` : ''}`
    : '';

  const [step, setStep] = useState<'describe' | 'qa' | 'contact' | 'result'>(wizardEnabled ? 'describe' : 'contact');
  const [chatQuestion, setChatQuestion] = useState('');
  const [chatPhotoPrompt, setChatPhotoPrompt] = useState<string | null>(null);
  const [qaFollowUpPhotos, setQaFollowUpPhotos] = useState<File[]>([]);
  const qaPhotoInputRef = useRef<HTMLInputElement>(null);
  const [chatAnswer, setChatAnswer] = useState('');
  const [chatResponseId, setChatResponseId] = useState('');
  const [chatTurn, setChatTurn] = useState(0);

  // Sync across duplicate forms on the same page (e.g. hero and footer).
  useEffect(() => {
    function handleRemoteSubmit(event: Event) {
      const custom = event as CustomEvent<{ siteId: string }>;
      if (custom.detail?.siteId === site.id && step !== 'result') {
        setStatus({
          tone: 'success',
          text: "We've received your request! Our team is already reviewing your details.",
        });
        setStep('result');
      }
    }
    window.addEventListener('lgq:lead-submitted', handleRemoteSubmit);
    return () => window.removeEventListener('lgq:lead-submitted', handleRemoteSubmit);
  }, [site.id, step]);

  // `step` is seeded from wizardEnabled, which is fine on a live site where the
  // intake method never changes mid-visit — but the builder's live preview
  // switches it under a mounted form. Without this, turning Smart Intake off
  // left the hero on the wizard's 'describe' screen: the progress dots and
  // data-edit updated, while the heading, "a couple quick questions" line and
  // the describe box all stayed, because those are gated on `step`, not on
  // wizardEnabled. Re-seed whenever the method changes so the hero matches the
  // rest of the page.
  useEffect(() => {
    setClassicFallback(false);
    setStep(wizardEnabled ? 'describe' : 'contact');
  }, [wizardEnabled]);

  // On each wizard step change (not initial mount / StrictMode re-run), move
  // focus into the new step so keyboard/SR users aren't dropped on <body> when
  // the previous step's button unmounts — the focused field's accessible name
  // (or the result heading) announces the step. Mirrors the main quote form.
  const focusScreenKey = `${step}:${step === 'qa' ? chatTurn : 0}`;
  const prevFocusScreenKeyRef = useRef(focusScreenKey);
  useEffect(() => {
    if (prevFocusScreenKeyRef.current === focusScreenKey) return;
    prevFocusScreenKeyRef.current = focusScreenKey;
    const form = formRef.current;
    if (!form) return;
    const field = form.querySelector<HTMLElement>('input:not([tabindex="-1"]):not([type="file"]), textarea');
    const target = field ?? form.querySelector<HTMLElement>('h2');
    if (!target) return;
    if (target.tagName === 'H2') target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }, [focusScreenKey]);
  const [description, setDescription] = useState('');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  // Wizard-only extra email field (the wizard's main contact field is always a
  // phone number — the promised follow-up is a text or call).
  const [email, setEmail] = useState('');
  // Derived, not stored: recomputed as they type, so it disappears the moment
  // the address is fixed — by the button or by hand.
  const emailFix = suggestEmailFix(email.trim());
  // The AI-priced range for the described job; null when the AI couldn't
  // price it (the lead still submits, just without a shown number).
  const [estimate, setEstimate] = useState<EstimateRange | null>(null);
  const [timeline, setTimeline] = useState<'asap' | 'month' | 'researching' | null>(null);
  const [location, setLocation] = useState('');
  // Everything the submit will actually insist on. Drives the button's lit
  // state only — never a disabled attribute, so the real check still runs and
  // still says which field is wrong. In the preview it is always lit, because
  // in the preview the button always works.
  const contactReady = demo || Boolean(
    name.trim() &&
    contact.trim() &&
    (!askLocation || location.trim()) &&
    (!askTimeline || timeline) &&
    (!smartIntakeActive || wizardEmailField !== 'required' || classifyEmail(email.trim()).valid),
  );
  // How the homeowner wants the follow-up: some people never answer calls.
  const [contactPref, setContactPref] = useState<'any' | 'text'>('any');
  // Soft fit signals from the AI (out-of-area / excluded work) — shown as
  // notes and passed along as lead flags, never used to block submission.
  const [fit, setFit] = useState<{ inArea: boolean | null; excluded: boolean }>({ inArea: null, excluded: false });
  // Phone verification (owner-enabled): the server texts a code and returns an
  // HMAC token; we submit code+token with the lead. 'skipped' means the server
  // said verification isn't active (toggle off / texting not configured).
  const [verify, setVerify] = useState<{ token: string; expiresAt: number } | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifySkipped, setVerifySkipped] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const needsVerification = smartIntakeActive && leadFilters.phoneVerification && !verifySkipped;

  async function sendVerifyCode() {
    const trimmed = contact.trim();
    if (!normalizeUsPhone(trimmed)) {
      setStatus({ tone: 'error', text: 'Enter a valid phone number first.' });
      return;
    }
    setIsSendingCode(true);
    setStatus(null);
    try {
      const response = await fetch('/api/public/leads/verify-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: site.id, phone: trimmed }),
      });
      const result = await response.json().catch(() => null);
      if (result?.skipped) {
        setVerifySkipped(true);
        return;
      }
      if (!response.ok || !result?.token) throw new Error(result?.error || 'Could not send the code.');
      setVerify({ token: result.token, expiresAt: Number(result.expiresAt) });
      setStatus({ tone: 'success', text: 'Code queued — it should arrive shortly. Enter it below.' });
    } catch (error) {
      setStatus({ tone: 'error', text: error instanceof Error ? error.message : 'Could not send the code.' });
    } finally {
      setIsSendingCode(false);
    }
  }
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  // An intake lead landed, but the AI couldn't price it — so there's no 'result'
  // screen to hang the intro video off. The lead is in either way, which is the
  // condition the video is actually keyed on.
  const [sentWithoutEstimate, setSentWithoutEstimate] = useState(false);
  const introVideo = siteContent.introVideo;

  const [selectedPhotos, setSelectedPhotos] = useState<File[]>([]);
  const [photoQualityWarning, setPhotoQualityWarning] = useState<string | null>(null);
  const [visualObservation, setVisualObservation] = useState<string | null>(null);
  const MAX_MEDIA_BYTES = 35 * 1024 * 1024;

  async function addPhotos(files: FileList | File[]) {
    const rawMedia = Array.from(files).filter((file) => file.type.startsWith('image/') || file.type.startsWith('video/'));
    const oversized = rawMedia.filter((f) => f.size > MAX_MEDIA_BYTES);
    if (oversized.length > 0) {
      setPhotoQualityWarning('💡 One of your files is over 35 MB. Short 10–20 second video clips work best!');
    }
    const media = rawMedia.filter((f) => f.size <= MAX_MEDIA_BYTES);
    if (media.length === 0) return;

    setSelectedPhotos((current) => [...current, ...media].slice(0, MAX_PHOTOS));
    if (photoInputRef.current) photoInputRef.current.value = '';

    for (const file of media) {
      if (file.type.startsWith('image/')) {
        try {
          const quality = await assessImageQuality(file);
          if (quality.tip) {
            setPhotoQualityWarning(quality.tip);
            break;
          }
        } catch {
          // Quality check fallback
        }
      }
    }
  }

  function removePhoto(index: number) {
    setSelectedPhotos((current) => {
      const updated = current.filter((_, photoIndex) => photoIndex !== index);
      if (updated.length === 0) setPhotoQualityWarning(null);
      return updated;
    });
  }

  function applyChatResult(result: { type?: string; question?: string; photoPrompt?: string; responseId?: string; min?: number; max?: number; basis?: string; inArea?: boolean | null; excluded?: boolean; requiresSiteVisit?: boolean; requires_site_visit?: boolean; visitReason?: string; visit_reason?: string; visualObservation?: string } | null) {
    if (typeof result?.visualObservation === 'string' && result.visualObservation) {
      setVisualObservation(result.visualObservation.trim());
    }
    if (result?.type === 'classic_fallback') {
      setClassicFallback(true);
      setEstimate(null);
      setChatQuestion('');
      setChatPhotoPrompt(null);
      setChatAnswer('');
      setChatResponseId('');
      setStatus(null);
      setStep('contact');
      return;
    }
    if (result?.type === 'question' && result.question) {
      setChatQuestion(result.question);
      setChatPhotoPrompt(typeof result.photoPrompt === 'string' ? result.photoPrompt.trim() : null);
      setChatResponseId(result.responseId ?? '');
      setChatTurn((current) => current + 1);
      setChatAnswer('');
      setStep('qa');
      return;
    }
    const min = Number(result?.min);
    const max = Number(result?.max);
    const basis = typeof result?.basis === 'string' ? result.basis.trim().slice(0, 60) : '';
    const requiresSiteVisit = result?.requiresSiteVisit === true || result?.requires_site_visit === true;
    const visitReason = typeof result?.visitReason === 'string'
      ? result.visitReason.trim().slice(0, 100)
      : typeof result?.visit_reason === 'string'
        ? result.visit_reason.trim().slice(0, 100)
        : '';
    setEstimate(
      Number.isFinite(min) && Number.isFinite(max) && min > 0 && min < max
        ? { min: Math.round(min), max: Math.round(max), ...(basis ? { basis } : {}), ...(requiresSiteVisit ? { requiresSiteVisit, visitReason } : {}) }
        : null
    );
    const namedLocation = location.trim() && !/^\d{5}(?:-\d{4})?$/.test(location.trim());
    const configuredCities = siteContent.serviceAreas.cities.map((city) => city.trim()).filter(Boolean);
    const deterministicArea = askLocation && namedLocation && configuredCities.length > 0
      ? matchesServedCity(location, configuredCities)
      : null;
    setFit({
      // The submitted town and the published list are authoritative for Smart
      // Intake. A ZIP remains unknown until the server has a deterministic map;
      // never let a model guess become a customer-facing rejection warning.
      inArea: askLocation ? deterministicArea : null,
      excluded: result?.excluded === true,
    });
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
      setStatus({ tone: 'error', text: 'Add the town or city where the work is so we can confirm we serve your area.' });
      return;
    }
    setStatus(null);
    setIsClassifying(true);
    try {
      let mediaUrls: string[] = [];
      if (selectedPhotos.length > 0) {
        try {
          mediaUrls = await extractMediaDataUrls(selectedPhotos, 4);
        } catch {
          // Graceful fallback on frame extraction error
        }
      }
      const result = await classify({
        siteId: site.id,
        description: trimmedDescription,
        turn: 0,
        maxQuestions: MAX_INTAKE_QUESTIONS,
        businessName: site.company_name,
        businessSummary: site.tagline || site.headline || '',
        serviceArea: site.service_area || '',
        location: location.trim(),
        ...(mediaUrls.length > 0 ? { images: mediaUrls } : {}),
      });
      applyChatResult(result);
    } catch {
      // AI is a convenience, not a requirement — fall back to contact info
      // silently. A transport failure is just as uncertain as an explicit
      // entitlement fallback, so it must use the normal quote path too.
      applyChatResult({ type: 'classic_fallback' });
    } finally {
      setIsClassifying(false);
    }
  }

  async function handleChatAnswerSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedAnswer = chatAnswer.trim();
    if (!trimmedAnswer && qaFollowUpPhotos.length === 0) return;
    setIsClassifying(true);
    try {
      let qaMediaUrls: string[] = [];
      if (qaFollowUpPhotos.length > 0) {
        try {
          qaMediaUrls = await extractMediaDataUrls(qaFollowUpPhotos, 2);
        } catch {
          // Graceful fallback
        }
      }
      const result = await classify({
        siteId: site.id,
        previousResponseId: chatResponseId,
        answer: trimmedAnswer || 'Attached requested photo for visual inspection.',
        turn: chatTurn,
        maxQuestions: MAX_INTAKE_QUESTIONS,
        ...(qaMediaUrls.length > 0 ? { images: qaMediaUrls } : {}),
      });
      setQaFollowUpPhotos([]);
      applyChatResult(result);
    } catch {
      applyChatResult({ type: 'classic_fallback' });
    } finally {
      setIsClassifying(false);
    }
  }

  // Impatient visitors can bail out of the questions and still get a number —
  // turn 99 clamps to the server's max, which forces a best-judgment estimate.
  async function skipToEstimate() {
    setIsClassifying(true);
    setStatus(null);
    try {
      const result = await classify({
        siteId: site.id,
        previousResponseId: chatResponseId,
        answer: 'Please skip the remaining questions and give your best-judgment estimate from what you already know.',
        turn: 99,
        maxQuestions: MAX_INTAKE_QUESTIONS,
      });
      applyChatResult(result);
    } catch {
      applyChatResult({ type: 'classic_fallback' });
    } finally {
      setIsClassifying(false);
    }
  }

  /* --- the estimator must never be the reason a lead is lost ---------------
     Nothing below this point needs the AI: submitLead posts to
     /api/public/leads, which makes no AI call at all and scores the lead from
     the form fields. So a DOWN estimator is already survivable — every call
     site falls through to the contact step.

     SLOW is the shape that actually loses people. fetch has no deadline of its
     own, so a hanging request leaves a homeowner watching "Thinking…" with no
     way forward, and the catch never fires because nothing threw. Eight
     seconds is longer than a good answer takes and shorter than anyone will
     wait for one. On timeout the abort throws, the existing catch runs, and
     they land on the contact fields exactly as if the estimator had errored. */
  const CLASSIFY_TIMEOUT_MS = 8000;
  const classifyAbortRef = useRef<AbortController | null>(null);

  async function classify(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    classifyAbortRef.current?.abort();
    const controller = new AbortController();
    classifyAbortRef.current = controller;
    const deadline = setTimeout(() => controller.abort(), CLASSIFY_TIMEOUT_MS);
    try {
      let threadBody: Record<string, unknown> = {};
      try {
        if (!intakeThreadIdRef.current) {
          intakeThreadIdRef.current = getOrCreateAiIntakeThread({
            siteId: site.id,
            flowKind: 'smart_intake',
          }).id;
        }
        threadBody = {
          intakeThreadId: intakeThreadIdRef.current,
          intakeFlowKind: 'smart_intake',
        };
      } catch {
        // The server flag is authoritative. With it off, omitting these fields
        // preserves the legacy request; with it on, the route falls back safely.
      }
      const response = await fetch('/api/public/leads/classify-estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, ...threadBody }),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => null);
      const type = result && typeof result === 'object' ? (result as { type?: unknown }).type : null;
      if (!response.ok || !['question', 'estimate', 'classic_fallback'].includes(String(type))) {
        throw new Error('Estimator unavailable.');
      }
      return result as Record<string, unknown>;
    } finally {
      clearTimeout(deadline);
      if (classifyAbortRef.current === controller) classifyAbortRef.current = null;
    }
  }

  // The manual way out, and the only control here that touches no network.
  // Aborting the in-flight call matters: without it a late reply could answer
  // with a question and drag someone back out of the form they were filling in.
  // What they already typed still travels with the lead — submitLead carries
  // the description — they just don't get a price first.
  function skipTheEstimate() {
    // Belt-and-braces on the render guard above. A lead with no description is
    // a phone number and a shrug — the contractor has to ring back just to find
    // out what the job is, which is the phone tag this form exists to remove.
    if (!description.trim()) return;
    classifyAbortRef.current?.abort();
    setStatus(null);
    setEstimate(null);
    setStep('contact');
  }

  // Restart the wizard from the description (kept, so it can be edited).
  // Chat state is reset — the AI thread can't be resumed after backtracking.
  function restartWizard() {
    setChatQuestion('');
    setChatPhotoPrompt(null);
    setQaFollowUpPhotos([]);
    setChatAnswer('');
    setChatResponseId('');
    setChatTurn(0);
    setEstimate(null);
    setFit({ inArea: null, excluded: false });
    setTimeline(null);
    setStatus(null);
    setVisualObservation(null);
    setPhotoQualityWarning(null);
    setSentWithoutEstimate(false);
    setStep('describe');
  }

  function handleContactSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // The preview exists to show the owner the screens, so nothing on this one
    // is enforced there. Making a contractor invent a name and a phone number
    // to reach their own last screen tests our validation, not their intake —
    // and the fields are still on show, just not gates. The live form is
    // untouched: every check below still runs for a real homeowner.
    if (demo) {
      setStatus(null);
      submitLead(smartIntakeActive
        ? { description }
        : classicFallback
          ? { description, classicFallback: true }
          : undefined);
      return;
    }

    const trimmedContact = contact.trim();
    if (!name.trim() || !trimmedContact) return;

    if (smartIntakeActive) {
      // Smart Intake always needs a real phone number so the contractor can
      // follow up by text or call.
      if (!normalizeUsPhone(trimmedContact)) {
        setStatus({ tone: 'error', text: 'Enter a valid phone number so we can text or call you with your quote.' });
        return;
      }
      if (askLocation && !location.trim()) {
        setStatus({ tone: 'error', text: 'Add the town or city where the work is so we can confirm we serve your area.' });
        return;
      }
      if (askTimeline && !timeline) {
        setStatus({ tone: 'error', text: 'Choose when you need the work done.' });
        return;
      }
      if (needsVerification && (!verify || !verifyCode.trim())) {
        setStatus({ tone: 'error', text: 'Verify your phone first — tap "Text me a code" and enter the code.' });
        return;
      }
      const trimmedEmail = email.trim();
      if (wizardEmailField === 'required' && !classifyEmail(trimmedEmail).valid) {
        setStatus({ tone: 'error', text: 'Enter a valid email address.' });
        return;
      }
      if (wizardEmailField === 'optional' && trimmedEmail && !classifyEmail(trimmedEmail).valid) {
        setStatus({ tone: 'error', text: 'That email address doesn’t look right — fix it or leave it blank.' });
        return;
      }
      setStatus(null);
      submitLead({ description });
      return;
    }

    const isEmail = emailRequired || trimmedContact.includes('@');
    const valid = isEmail ? classifyEmail(trimmedContact).valid : Boolean(normalizeUsPhone(trimmedContact));
    if (!valid) {
      setStatus({ tone: 'error', text: isEmail ? 'Enter a valid email address.' : 'Enter a valid phone number.' });
      return;
    }

    setStatus(null);
    submitLead(classicFallback ? { description, classicFallback: true } : undefined);
  }

  async function submitLead(details?: { description: string; classicFallback?: boolean }) {
    // The preview creates no lead — but it does show the last screen, because
    // the screen before it just promised a price "on the next screen" and
    // stopping short of the number makes the preview end on the one thing the
    // owner most wants to see. The number is the real one the estimator
    // returned for what they typed; only the send is skipped.
    //
    // Checked before the published/iframe guard so the message is the true one:
    // "this was a preview", not "publish your site".
    if (demo) {
      if (details && estimate) {
        setStep('result');
        setStatus({
          tone: 'success',
          text: 'That’s the whole journey, price and all — and because this is a preview, nothing was sent and no lead was created.',
        });
        return;
      }
      setStatus({
        tone: 'success',
        text: estimate === null && details
          ? 'That’s the whole journey. There’s no price screen this time because the estimator didn’t return a range — a real customer would land on the "we’ll be in touch" message instead. Nothing was sent and no lead was created.'
          : 'That’s the whole journey — and because this is a preview, nothing was sent and no lead was created.',
      });
      return;
    }
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
      if (details && !details.classicFallback) {
        data.set('phone', contact.trim());
        if (email.trim()) data.set('email', email.trim());
      } else if (emailRequired || contact.includes('@')) {
        data.set('email', contact.trim());
      } else {
        data.set('phone', contact.trim());
      }

      if (details?.classicFallback) {
        data.set('message', details.description.trim());
        if (location.trim()) data.set('location', location.trim());
      } else if (details) {
        const timelineLabel = timeline === 'asap'
          ? 'Needed ASAP'
          : timeline === 'month'
            ? 'In the next month'
            : timeline === 'researching'
              ? 'Just researching prices'
              : '';
        const parts = [
          estimate
            ? `AI estimate shown to the customer: ${formatCurrency(estimate.min)}-${formatCurrency(estimate.max)}.`
            : 'AI estimate was unavailable — no price range was shown; needs a manual quote.',
          askTimeline && timelineLabel ? `Timing: ${timelineLabel}.` : '',
          location.trim() ? `Location given: ${location.trim()}.` : '',
          contactPref === 'text' ? 'Contact preference: TEXT ONLY — asked not to be called.' : '',
        ].filter(Boolean);
        const trimmedDescription = details.description.trim();
        data.set('message', trimmedDescription ? `${trimmedDescription}\n\n${parts.join(' ')}` : parts.join(' '));
        if (askTimeline && timeline) data.set('timeline', timeline);
        if (location.trim()) data.set('location', location.trim());
        if (estimate) {
          data.set('estimateMin', String(estimate.min));
          data.set('estimateMax', String(estimate.max));
        }
        if (fit.excluded) data.set('excluded', 'true');
        data.set('wizard', '1');
        data.set('contactPreference', contactPref);
        if (verify && verifyCode.trim()) {
          data.set('verifyToken', verify.token);
          data.set('verifyExpires', String(verify.expiresAt));
          data.set('verifyCode', verifyCode.trim());
        }
      }

      data.delete('photos');
      for (const photo of selectedPhotos.slice(0, MAX_PHOTOS)) {
        data.append('photos', await compressImage(photo, 1600, 0.8));
      }

      const response = await fetch('/api/public/leads', { method: 'POST', body: data });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Unable to send your request.');

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('lgq:lead-submitted', { detail: { siteId: site.id } }));
      }

      if (details && estimate) {
        setStep('result');
      } else {
        if (details) setSentWithoutEstimate(true);
        setStatus({
          tone: 'success',
          text: details && !details.classicFallback
            ? `Thanks! Your request is in — one of our experts will ${contactPref === 'text' ? 'text' : 'text or call'} you ${avgReplyMs ? `typically within ${formatReplyTime(avgReplyMs)}` : 'as soon as possible'} to confirm the details and next steps.`
            : `Thanks! Your request is in — ${avgReplyMs ? `we typically reply within ${formatReplyTime(avgReplyMs)}` : 'we\u2019ll follow up as soon as possible'} to confirm the details and next steps.`,
        });
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
  const isEmergency = Boolean(
    description &&
    /\b(burst\s*pipe|pipe\s*burst|flooding|water\s*pouring|leak(?:ing)?\s*everywhere|spraying\s*water|gushing|sewage\s*backup|smell\s*gas|gas\s*leak|no\s*heat|furnace\s*out)\b/i.test(description)
  );

  const thinkingLabel = description.toLowerCase().includes('drain')
    ? 'Scoping drain cleaning'
    : description.toLowerCase().includes('water heater')
      ? 'Scoping water heater'
      : description.toLowerCase().includes('pipe') || description.toLowerCase().includes('leak')
        ? 'Analyzing pipe repair'
        : 'Preparing your estimate';

  const thinking = (
    <span className={styles.heroFormThinking}>
      {thinkingLabel}
      <span className={styles.heroFormDots} aria-hidden="true"><i /><i /><i /></span>
    </span>
  );

  return (
    <form
      ref={formRef}
      className={styles.heroQuickForm}
      onSubmit={step === 'describe' ? handleDescribeContinue : step === 'qa' ? handleChatAnswerSubmit : step === 'contact' ? handleContactSubmit : (event) => event.preventDefault()}
      data-edit={smartIntakeActive ? 'estimate' : 'quoteForm'}
    >
      <HoneypotField />

      {bookedNote && step !== 'result' && <p className={styles.heroFormBooked}>{bookedNote}</p>}

      {smartIntakeActive && (
        <div className={styles.heroFormProgress} aria-hidden="true">
          {[0, 1, 2].map((index) => <span key={index} data-active={index <= Math.min(stepIndex, 2)} />)}
        </div>
      )}

      {step === 'describe' && (
        <div className={styles.heroFormStep} key="describe">
          <h2 className={styles.heroFormTitle}>{estimateLabel}</h2>
          {isEmergency && (
            <div className={styles.heroFormEmergencyAlert} role="alert">
              <span aria-hidden="true">🚨</span>
              <div>
                <strong>Emergency Safety Guidance</strong>
                <p>If water or gas is actively leaking, locate and turn off your main shutoff valve immediately.</p>
                {site.phone && (
                  <a className={styles.heroFormEmergencyCallBtn} href={`tel:${site.phone}`}>
                    📞 Call Emergency Dispatch ({site.phone})
                  </a>
                )}
              </div>
            </div>
          )}
          <p className={styles.heroFormNote}>Tell us about the job. We may ask up to {MAX_INTAKE_QUESTIONS} quick questions, then collect contact details before showing your range.</p>
          {avgReplyMs && <span className={styles.heroFormReplyChip}><span aria-hidden="true">⚡</span> Typically replies within {formatReplyTime(avgReplyMs)}</span>}
          <textarea
            aria-label="Describe your project"
            placeholder={describePlaceholder}
            maxLength={500}
            rows={2}
            required
            aria-invalid={status?.tone === 'error' ? 'true' : undefined}
            aria-describedby={status ? 'hqf-status' : undefined}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                formRef.current?.requestSubmit();
              }
            }}
          />

          <div className={styles.heroFormPhotoRow} style={{ marginTop: '0.4rem', marginBottom: '0.6rem' }}>
            <input
              ref={photoInputRef}
              className={styles.heroFormPhotoInput}
              tabIndex={-1}
              aria-hidden="true"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/quicktime,video/webm"
              multiple
              onChange={(event) => addPhotos(event.currentTarget.files ?? [])}
            />
            <button type="button" className={styles.heroFormPhotoButton} onClick={() => photoInputRef.current?.click()} disabled={selectedPhotos.length >= MAX_PHOTOS}>
              {selectedPhotos.length > 0 ? `📷 Photos/Video attached (${selectedPhotos.length}/${MAX_PHOTOS})` : '📷 Add photos / video for AI visual analysis'}
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
            {photoQualityWarning && (
              <p style={{ margin: '0.35rem 0 0', padding: '0.35rem 0.55rem', borderRadius: '6px', background: 'rgba(255, 209, 102, 0.14)', border: '1px solid var(--cedge-amber-12, rgba(255, 209, 102, 0.4))', fontSize: '0.74rem', color: 'var(--text)', lineHeight: '1.35' }}>
                {photoQualityWarning}
              </p>
            )}
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.72rem', color: 'var(--mute-t70)', lineHeight: '1.35' }}>
              {getTradePhotoTip(siteContent.trade, description)}
            </p>
          </div>

          {askLocation && (
            <Field icon="pin" label="Town or city where the work is" filled={Boolean(location.trim())}>
              <input
                placeholder={locationPlaceholder}
                autoComplete="address-level2"
                maxLength={80}
                required={!demo}
                aria-invalid={status?.tone === 'error' ? 'true' : undefined}
                aria-describedby={status ? 'hqf-status' : undefined}
                value={location}
                onChange={(event) => setLocation(event.target.value)}
              />
            </Field>
          )}
          {askLocation && location.trim() && !/^\d{5}(?:-\d{4})?$/.test(location.trim()) && configuredCities.length > 0 && matchesServedCity(location, configuredCities) === false && (
            <p className={styles.heroFormFitNote}>
              Heads up: <strong>{location.trim()}</strong> appears outside our primary service area. Travel fees or limited availability may apply.
            </p>
          )}
          <button type="submit" disabled={isClassifying}>{isClassifying ? thinking : 'Continue'}</button>
          {isEmergency && !isClassifying && (
            <button
              type="button"
              className={styles.heroFormRestart}
              onClick={() => {
                classifyAbortRef.current?.abort();
                setStatus(null);
                setEstimate(null);
                setTimeline('asap');
                setStep('contact');
              }}
            >
              ⚡ Urgent: Skip questions — go straight to contact details →
            </button>
          )}
          {isClassifying && (
            <button type="button" className={styles.heroFormRestart} onClick={skipTheEstimate}>
              Taking too long? Just send my details →
            </button>
          )}
        </div>
      )}

      {step === 'qa' && (
        <div className={styles.heroFormStep} key="qa">
          <h2 className={styles.heroFormTitle}>{estimateLabel}</h2>
          <p className={styles.heroFormQaMeta}>Question {chatTurn} <span>· up to {MAX_INTAKE_QUESTIONS} total</span></p>
          {visualObservation && (
            <p className={styles.heroFormFitNote} style={{ marginTop: '0.2rem', marginBottom: '0.5rem' }}>
              👁️ <strong>What we spotted:</strong> {visualObservation}
            </p>
          )}
          <p id="hqf-question" className={styles.heroFormQuestion}>{chatQuestion}</p>
          
          <input
            ref={qaPhotoInputRef}
            className={styles.heroFormPhotoInput}
            tabIndex={-1}
            aria-hidden="true"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/quicktime,video/webm"
            onChange={(event) => {
              if (event.currentTarget.files?.length) {
                addPhotos(event.currentTarget.files);
                setQaFollowUpPhotos((prev) => [...prev, ...Array.from(event.currentTarget.files!)]);
              }
            }}
          />

          {chatPhotoPrompt && (
            <div style={{ marginBottom: '0.65rem', padding: '0.45rem 0.65rem', border: '1px dashed var(--cedge-orange-66, rgba(255,122,33,0.4))', borderRadius: '6px', background: 'rgba(255,122,33,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text)' }}>
                  📸 <strong>Helpful photo:</strong> {chatPhotoPrompt}
                </span>
                <button
                  type="button"
                  style={{ fontSize: '0.72rem', padding: '0.25rem 0.55rem', borderRadius: '4px', background: 'var(--accent-ink, #ff7a21)', color: '#fff', border: 'none', cursor: 'pointer', flexShrink: 0 }}
                  onClick={() => qaPhotoInputRef.current?.click()}
                  disabled={selectedPhotos.length >= MAX_PHOTOS}
                >
                  Snap Photo
                </button>
              </div>
            </div>
          )}

          {qaFollowUpPhotos.length > 0 && (
            <div className={styles.heroFormPhotoList} style={{ marginBottom: '0.5rem' }}>
              {qaFollowUpPhotos.map((photo, index) => (
                <span className={styles.heroFormPhotoChip} key={`qa-${photo.name}-${index}`}>
                  📷 Attached: {photo.name.length > 14 ? `${photo.name.slice(0, 11)}\u2026` : photo.name}
                </span>
              ))}
            </div>
          )}

          {photoQualityWarning && (
            <p style={{ margin: '0 0 0.5rem', padding: '0.35rem 0.55rem', borderRadius: '6px', background: 'rgba(255, 209, 102, 0.14)', border: '1px solid var(--cedge-amber-12, rgba(255, 209, 102, 0.4))', fontSize: '0.74rem', color: 'var(--text)', lineHeight: '1.35' }}>
              {photoQualityWarning}
            </p>
          )}

          <input
            aria-labelledby="hqf-question"
            placeholder={qaFollowUpPhotos.length > 0 ? "Add any details (or leave blank to submit photo)" : "Your answer"}
            maxLength={300}
            required={qaFollowUpPhotos.length === 0}
            value={chatAnswer}
            onChange={(event) => setChatAnswer(event.target.value)}
          />
          <button type="submit" disabled={isClassifying}>{isClassifying ? thinking : 'Next'}</button>
          {/* Two different asks. This one still wants a number, so it costs an
              AI call and is disabled while one is running. */}
          <button type="button" className={styles.heroFormRestart} onClick={skipToEstimate} disabled={isClassifying}>Skip the questions — show my ballpark →</button>
          {/* This one wants out. No network, and deliberately only surfaced
              while a call is in flight — that's when the wait it answers is
              actually happening, and the step has enough buttons otherwise. */}
          {isClassifying && (
            <button type="button" className={styles.heroFormRestart} onClick={skipTheEstimate}>
              Taking too long? Just send my details →
            </button>
          )}
          <button type="button" className={styles.heroFormRestart} onClick={restartWizard} disabled={isClassifying}>← Edit project details</button>
        </div>
      )}

      {step === 'contact' && (
        <div className={styles.heroFormStep} key="contact">
          <h2 className={styles.heroFormTitle}>{classicFallback ? 'Request a Free Quote' : estimateLabel}</h2>
          {classicFallback && (
            <p className={styles.heroFormNote}>The instant estimate isn&apos;t available right now. Your project details are saved here—send the normal quote request and {site.company_name} can follow up directly.</p>
          )}
          {/* The price already exists at this point — it is deliberately held
              back until the details are in. Saying so plainly, and once, turns
              the form from a toll gate into the last step of something. */}
          {smartIntakeActive && estimate ? (
            <div className={styles.heroFormReady}>
              <span className={styles.heroFormReadyMark} aria-hidden="true">✓</span>
              <span>
                <strong>Your estimate is ready.</strong>
                <small>Fill these in and it&rsquo;s on the next screen — free, no obligation, {replyPromise}.</small>
              </span>
            </div>
          ) : (
            <p className={styles.heroFormNote}>Free &amp; no obligation — {replyPromise}.</p>
          )}
          <div className={styles.heroQuickFormRow}>
            <Field icon="user" label="Your name" filled={Boolean(name.trim())}>
              {/* `required` is dropped in the preview along with the JS checks.
                  Leaving it would hand the block to the BROWSER, which refuses
                  to submit before onSubmit ever runs — the owner would click
                  and get "Please fill out this field" with no way past it. */}
              <input name="name" placeholder="Jane Homeowner" autoComplete="name" maxLength={100} required={!demo} value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field
              icon={smartIntakeActive || !emailRequired ? 'phone' : 'mail'}
              label={smartIntakeActive ? 'Mobile number' : emailRequired ? 'Email' : 'Phone or email'}
              filled={Boolean(contact.trim())}
            >
              <input
                name="contact"
                type={smartIntakeActive ? 'tel' : emailRequired ? 'email' : 'text'}
                // An example, not the label again. A placeholder that repeats
                // the field name is a wasted line and tells nobody what shape
                // the answer should be.
                placeholder={smartIntakeActive ? '(248) 555-0199' : emailRequired ? 'you@email.com' : '(248) 555-0199'}
                autoComplete={smartIntakeActive ? 'tel' : emailRequired ? 'email' : 'tel'}
                maxLength={160}
                required={!demo}
                value={contact}
                onChange={(event) => {
                  setContact(event.target.value);
                  if (smartIntakeActive) {
                    setVerify(null);
                    setVerifyCode('');
                  }
                }}
              />
            </Field>
          </div>
          {askTimeline && (
            <div className={styles.heroFormChoice} role="group" aria-label="When do you need this done?">
              <span className={styles.heroFormChoiceLabel}>When do you need this done?</span>
              <div className={styles.heroFormChipRow}>
                {([
                  { key: 'asap', label: 'ASAP' },
                  { key: 'month', label: 'Within a month' },
                  { key: 'researching', label: 'Just researching' },
                ] as const).map((option) => (
                  <button
                    type="button"
                    key={option.key}
                    className={styles.heroFormChip}
                    data-selected={timeline === option.key}
                    aria-pressed={timeline === option.key}
                    onClick={() => setTimeline(option.key)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {needsVerification && (
            <div className={styles.heroFormVerifyRow}>
              <button type="button" className={styles.heroFormVerifyBtn} onClick={sendVerifyCode} disabled={isSendingCode}>
                {isSendingCode ? 'Sending…' : verify ? 'Resend code' : 'Text me a code'}
              </button>
              {verify && (
                <input
                  aria-label="Verification code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6-digit code"
                  maxLength={6}
                  required={!demo}
                  value={verifyCode}
                  onChange={(event) => setVerifyCode(event.target.value.replace(/\D/g, ''))}
                />
              )}
            </div>
          )}
          {smartIntakeActive && (
            <div className={styles.heroFormChoice} role="group" aria-label="Best way to reach you">
              <span className={styles.heroFormChoiceLabel}>Best way to reach you?</span>
              <div className={styles.heroFormChipRow}>
                {([
                  { key: 'any', label: 'Call or text' },
                  { key: 'text', label: 'Text only' },
                ] as const).map((option) => (
                  <button
                    type="button"
                    key={option.key}
                    className={styles.heroFormChip}
                    data-selected={contactPref === option.key}
                    aria-pressed={contactPref === option.key}
                    onClick={() => setContactPref(option.key)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {smartIntakeActive && wizardEmailField !== 'off' && (
            <>
              <Field
                icon="mail"
                label={wizardEmailField === 'required' ? 'Email' : 'Email (optional)'}
                filled={Boolean(email.trim())}
              >
                <input
                  type="email"
                  placeholder="you@email.com"
                  autoComplete="email"
                  maxLength={160}
                  required={!demo && wizardEmailField === 'required'}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>
              {/* "Did you mean gmail.com?" — a typo'd domain is the single most
                  common way a dead address gets collected, and the only one the
                  person would fix themselves if anyone asked. Offered, never
                  applied: silently correcting an address that was right sends
                  somebody's quote to a stranger. */}
              {emailFix && (
                <button
                  type="button"
                  className={styles.heroFormEmailFix}
                  onClick={() => setEmail(emailFix)}
                >
                  Did you mean <strong>{emailFix}</strong>? <span aria-hidden="true">↩</span>
                </button>
              )}
            </>
          )}
          <small className={styles.heroFormPrivacy}><span aria-hidden="true">🔒</span> Your request goes only to {site.company_name} — never sold or shared.</small>
          <div className={styles.heroFormPhotoRow}>
            <p className={styles.heroFormPhotoPrompt}><span aria-hidden="true">📷</span> Add a job photo for a more accurate follow-up (optional).</p>
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
              {selectedPhotos.length > 0 ? `Add more photos (${selectedPhotos.length}/${MAX_PHOTOS})` : '📷 Add job photos'}
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
          {smartIntakeActive && (() => {
            const notes = [
              fit.inArea === false ? 'your location may be outside our usual service area' : '',
              fit.excluded ? "this may be a type of job we don't take on" : '',
              estimate && leadFilters.minJobAmount > 0 && estimate.max < leadFilters.minJobAmount ? `our minimum job size is ${formatCurrency(leadFilters.minJobAmount)}` : '',
            ].filter(Boolean);
            return notes.length ? <p className={styles.heroFormFitNote}>Heads up: {notes.join('; ')} — send your request and we&apos;ll confirm when we reach out.</p> : null;
          })()}
          <small className={styles.heroFormConsent}>
            By submitting, you agree to be contacted {smartIntakeActive && contactPref === 'text' ? 'by text or email' : 'by phone, text, or email'} about your request. Message &amp; data rates may apply.{siteContent.legal.privacyEnabled && <> See our <a href="/privacy">Privacy Policy</a>.</>}
          </small>
          {/* Lights up once everything required is in. The button is never
              disabled — a dead button explains nothing and the real validation
              is on submit, with a message — but it should look like the next
              thing to do the moment it actually is. */}
          <button type="submit" data-ready={contactReady || undefined} disabled={isSubmitting}>
            {isSubmitting
              ? 'Sending...'
              : classicFallback
                ? 'Request a Free Quote'
                : smartIntakeActive && estimate
                  ? 'See My Free Estimate'
                  : 'Get My Free Estimate'}
          </button>
          {site.phone && <a className={styles.heroFormOrCall} href={`tel:${site.phone}`}>or call <strong>{site.phone}</strong> — free quote</a>}
          {smartIntakeActive && <button type="button" className={styles.heroFormRestart} onClick={restartWizard} disabled={isSubmitting || isClassifying}>← Edit project details</button>}
        </div>
      )}

      {step === 'result' && estimate && (
        <div className={styles.heroFormStep} key="result">
          <h2 className={styles.heroFormTitle}>{estimate.requiresSiteVisit ? 'Estimate & Inspection Scope' : 'Your estimated range'}</h2>
          {estimate.requiresSiteVisit && (
            <div className={styles.heroFormFitNote} style={{ background: '#fef3c7', borderColor: '#f59e0b', color: '#92400e', fontWeight: 600 }}>
              <span>🔍 <strong>On-Site Assessment Required:</strong> {estimate.visitReason || 'Major scope detected — final pricing requires visual inspection of structural access and line runs.'}</span>
            </div>
          )}
          <div className={styles.heroFormResultPanel}>
            <p className={styles.heroFormResult}>
              {estimate.requiresSiteVisit ? `Baseline: ${formatCurrency(estimate.min)} – ${formatCurrency(estimate.max)}` : `${formatCurrency(estimate.min)} – ${formatCurrency(estimate.max)}`}
            </p>
            {/* The badge is a statement of fact about a request. In the preview
                no request exists, so it must not claim one — the price is real,
                the send is the part that didn't happen. */}
            <span className={styles.heroFormResultBadge}>{demo ? 'Preview — nothing sent' : '✓ Request sent'}</span>
          </div>
          <p className={styles.heroFormBasis}>{estimate.basis ? `Based on ${estimate.basis}. ` : ''}{estimate.requiresSiteVisit ? 'Subject to visual site inspection.' : 'A rough estimate, not a final quote.'}</p>
          {fit.inArea === false && (
            <p className={styles.heroFormFitNote}>📍 Note: Your location ({location.trim() || 'provided'}) is outside our standard primary service area. Our dispatcher will confirm coverage when following up.</p>
          )}
          {/* Below the number, never over it. The range is what the visitor
              waited for; the video is what fills the moment after they've read
              it. Anything that covered or preceded the estimate would be a toll
              gate on the one thing the whole intake promised. */}
          <IntroVideo video={introVideo} />
          {ratingBadge && (
            <div className={styles.heroFormResultRating}>
              <span className={styles.heroFormResultStars} aria-hidden="true">{'★'.repeat(ratingStars)}{'☆'.repeat(5 - ratingStars)}</span>
              <strong>{ratingBadge.rating.toFixed(1)}</strong>
              <span>· {ratingBadge.reviewCount} {ratingBadge.sourceLabel}</span>
            </div>
          )}
          <ol className={styles.heroFormSteps}>
            <li><strong>Request sent</strong><span>{demo ? 'What a real customer sees here — yours wasn’t sent.' : 'We got your details.'}</span></li>
            <li><strong>We {contactPref === 'text' ? 'text' : 'reach'} you</strong><span>{responseTiming}</span></li>
            <li><strong>Book your job</strong><span>Or a free in-person estimate — your call.</span></li>
          </ol>
          {site.phone && <a className={styles.heroFormCall} href={`tel:${site.phone}`}>Call now to lock it in</a>}
        </div>
      )}

      {status && <p id="hqf-status" className={styles.heroFormStatus} data-tone={status.tone} role={status.tone === 'error' ? 'alert' : 'status'} aria-live="polite">{status.text}</p>}
      {sentWithoutEstimate && step !== 'result' && <IntroVideo video={introVideo} />}
    </form>
  );
}
