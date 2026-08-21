'use client';

import { useRef, useState, type ReactNode } from 'react';
import SaveButton from '@/components/save-button';
import type { QuickStopDayOption } from '@/lib/quick-stop';
import BookingSteps from './BookingSteps';
import QuickStopFlow from './QuickStopFlow';
import { submitBookingAction } from './actions';

/**
 * THE STANDARD BOOKING PATH, AS ACTUAL STEPS.
 *
 * The page already drew a step indicator — "Pick a window", "Your details" —
 * above a single form that contained both of them at once. It named steps
 * without having any: nothing advanced, nothing was ever behind you, and the
 * only thing the numbering achieved was telling somebody on a phone, two
 * thousand pixels down, that there had been a plan. A contents list would have
 * been honest. Steps are better, so these are real ones.
 *
 * HOW THE FORM STILL POSTS. Every value lives in React state and is written
 * into hidden inputs that are mounted for the whole flow. The visible controls
 * carry no `name` at all. That matters: a stepped form built by unmounting
 * fieldsets silently drops their values out of the FormData when the step
 * changes, and the failure looks exactly like a customer forgetting to fill
 * something in. What posts is the state, always, whatever is on screen.
 *
 * The server action, its redirect, and every re-validation behind it are
 * untouched — this is a different arrangement of the same submit, not a new
 * route. submitBookingAction still re-derives availability, still refuses a
 * tampered slot, still claims the hold.
 */

export type FlowSlot = { time: string; label: string };
export type FlowDay = { dateKey: string; dayLabel: string; slots: FlowSlot[] };
export type FlowService = { id: string; name: string; detail: string };

type Props = {
  subdomain: string;
  businessName: string;
  days: FlowDay[];
  services: FlowService[];
  addressExample: string;
  jobExample: string;
  phoneExample: string;
  /**
   * What the Quick Stop path needs, or null when the owner does not offer it.
   * The DECISION is the server's — whether Quick Stop is available is five
   * settings and a clock, and none of that belongs on the client. This
   * component only decides whether it is the path being shown.
   */
  quickStop: { siteId: string; serviceArea: string | null; days: QuickStopDayOption[] } | null;
  /** The raw ?ref from the URL, posted back for the server action to verify. */
  referralCode: string | null;
};

type Errors = Partial<Record<'slot' | 'name' | 'contact' | 'address', string>>;

const STEPS = [
  { n: 1, label: 'Choose a window' },
  { n: 2, label: 'Your details' },
  { n: 3, label: 'Review' },
];

export default function RequestVisitFlow({
  subdomain,
  businessName,
  referralCode,
  days,
  services,
  addressExample,
  jobExample,
  phoneExample,
  quickStop,
}: Props) {
  const [path, setPath] = useState<'standard' | 'quick'>('standard');
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<Errors>({});

  const [service, setService] = useState('');
  const [slot, setSlot] = useState('');
  /** Empty means "no backup", which is the honest default rather than a nag. */
  const [altSlot, setAltSlot] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [note, setNote] = useState('');

  /**
   * Moving to a new step scrolls it to the top and moves focus to its heading.
   * Without the focus move a keyboard or screen-reader user presses Continue
   * and lands nowhere — the button they pressed has just been replaced, so the
   * focus ring falls back to the top of the document silently.
   */
  const headingRef = useRef<HTMLHeadingElement>(null);
  const goTo = (next: number) => {
    setStep(next);
    requestAnimationFrame(() => {
      headingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      headingRef.current?.focus({ preventScroll: true });
    });
  };

  const label = (value: string): string | null => {
    for (const day of days) {
      const match = day.slots.find((s) => `${day.dateKey}|${s.time}` === value);
      if (match) return `${day.dayLabel} · ${match.label}`;
    }
    return null;
  };
  const chosenLabel = label(slot);
  const altLabel = label(altSlot);
  const chosenService = services.find((s) => s.id === service);
  // How many windows there are to pick a SECOND from. With one open window in
  // the whole list there is no backup to offer, and the picker would be a
  // heading over a single "no backup" button.
  const slotCount = days.reduce((sum, day) => sum + day.slots.length, 0);

  function checkWindow(): boolean {
    const next: Errors = slot ? {} : { slot: 'Choose a window before carrying on.' };
    setErrors(next);
    return !next.slot;
  }

  /**
   * Every rule the server enforces, checked here too and reported against the
   * field that broke it. The server keeps its own copy — this is a public
   * endpoint and a direct POST ignores anything the browser was told — so this
   * exists to give somebody a sentence under the box rather than a redirect to
   * a banner at the top of a page they have to re-read.
   */
  function checkDetails(): boolean {
    const next: Errors = {};
    if (!name.trim()) next.name = 'We need a name to put on the job.';
    if (!phone.trim() && !email.trim()) next.contact = `Add a mobile or an email — ${businessName} needs one to confirm.`;
    if (!address.trim()) next.address = 'We need somewhere to send them.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  if (path === 'quick' && quickStop) {
    return (
      <>
        <QuickStopFlow
          subdomain={subdomain}
          siteId={quickStop.siteId}
          businessName={businessName}
          serviceArea={quickStop.serviceArea}
          days={quickStop.days}
          // Chosen, not stumbled upon: the teaser card has already been read as
          // one of two options, so a second press to open it buys nothing.
          startOpen
          onExit={() => setPath('standard')}
        />
      </>
    );
  }

  return (
    <>
      {/* THE FORK USED TO BE HERE, above everything, and it was the wrong shape.
          A homeowner arrives on a page headed "Request a visit" and the first
          thing it did was stop them to choose between "Standard visit" and
          "Quick Stop" — two co-equal buttons, one of them named after a product
          they have never heard of and carrying a fee. Being asked to pick a
          lane before being asked what is wrong is the confusion.

          So the page does the thing it says it does, and the alternative sits
          under it as an alternative: read after the windows, by somebody who
          has just looked at them and thought "that is too long to wait". */}
      <form action={submitBookingAction.bind(null, subdomain)} className="panel workspace-section-card booking-form">
        <BookingSteps steps={STEPS} current={step} />

        {/* Mounted for the whole flow, never unmounted with their step. This is
            what the form actually posts; nothing visible above carries a name. */}
        <input type="hidden" name="service" value={service} />
        <input type="hidden" name="slot" value={slot} />
        <input type="hidden" name="altSlot" value={altSlot} />
        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="phone" value={phone} />
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="address" value={address} />
        <input type="hidden" name="description" value={description} />
        <input type="hidden" name="note" value={note} />
        <input type="hidden" name="ref" value={referralCode ?? ''} />

        {step === 1 ? (
          <>
            <div className="section-heading workspace-section-heading book-step-head">
              <p className="eyebrow">Step 1 of 3</p>
              <h2 tabIndex={-1} ref={headingRef}>Choose a window</h2>
            </div>
            <p className="workspace-details-copy book-step-lead">
              Pick the arrival window you&apos;d prefer. {businessName} confirms it with you before anything is
              booked.
            </p>

            {services.length > 0 ? (
              <>
                <p className="book-field-group-label">
                  What do you need? <span className="book-opt">Optional</span>
                </p>
                <div className="booking-slots">
                  {services.map((option) => (
                    <label className="booking-slot" key={option.id}>
                      {/* A name the server never reads, purely so the browser
                          treats these as one radio group and arrow keys move
                          between them. Nameless radios are not a group, and
                          dropping the name — which the hidden inputs made
                          possible — would quietly cost keyboard navigation. */}
                      <input
                        type="radio"
                        name="ui-service"
                        checked={service === option.id}
                        onChange={() => setService(option.id)}
                      />
                      <span className="booking-slot-day">{option.name}</span>
                      <span className="booking-slot-time">{option.detail}</span>
                    </label>
                  ))}
                  <label className="booking-slot">
                    <input type="radio" name="ui-service" checked={service === ''} onChange={() => setService('')} />
                    <span className="booking-slot-day">Not sure yet</span>
                    <span className="booking-slot-time">We&apos;ll figure it out together</span>
                  </label>
                </div>
              </>
            ) : null}

            <p className="book-field-group-label" id="window-label">
              Preferred window <span className="book-req">Required</span>
            </p>
            {errors.slot ? <FieldError id="err-slot">{errors.slot}</FieldError> : null}
            <div className="booking-days" role="radiogroup" aria-labelledby="window-label">
              {days.map((day) => (
                <div className="booking-day-group" key={day.dateKey}>
                  <p className="booking-day-heading">{day.dayLabel}</p>
                  <div className="booking-slots">
                    {day.slots.map((option) => {
                      const value = `${day.dateKey}|${option.time}`;
                      return (
                        <label className="booking-slot" key={value}>
                          <input
                            type="radio"
                            name="ui-slot"
                            checked={slot === value}
                            aria-describedby={errors.slot ? 'err-slot' : undefined}
                            onChange={() => {
                              setSlot(value);
                              // A window cannot be both choices. Picking the
                              // backup as your first choice drops the backup
                              // rather than posting the same slot twice.
                              setAltSlot((prev) => (prev === value ? '' : prev));
                              setErrors((prev) => ({ ...prev, slot: undefined }));
                            }}
                          />
                          <span className="booking-slot-time">{option.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* THE BACKUP, AFTER THE THING IT BACKS UP.
                Shown once a first choice exists, for two reasons: a "second
                choice" offered before there is a first one is a puzzle, and
                rendering both lists at once doubles the length of the only
                screen on this page that matters. The chosen window is filtered
                out of it, so the two lists cannot disagree. */}
            {slot && slotCount > 1 ? (
              <div className="book-backup">
                <p className="book-field-group-label" id="backup-label">
                  A second time you could do <span className="book-opt">Optional</span>
                </p>
                <p className="book-backup-hint">
                  {businessName} confirms one of the two. Giving them a second option is usually the
                  difference between a yes and a phone call. Your first choice is held while they
                  decide; a backup is a preference, so someone else may take it first.
                </p>
                <div className="booking-days" role="radiogroup" aria-labelledby="backup-label">
                  {days.map((day) => {
                    const options = day.slots.filter((s) => `${day.dateKey}|${s.time}` !== slot);
                    if (options.length === 0) return null;
                    return (
                      <div className="booking-day-group" key={`alt-${day.dateKey}`}>
                        <p className="booking-day-heading">{day.dayLabel}</p>
                        <div className="booking-slots">
                          {options.map((option) => {
                            const value = `${day.dateKey}|${option.time}`;
                            return (
                              <label className="booking-slot" key={`alt-${value}`}>
                                <input
                                  type="radio"
                                  name="ui-alt"
                                  checked={altSlot === value}
                                  onChange={() => setAltSlot(value)}
                                />
                                <span className="booking-slot-time">{option.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Not a radio in the group above. "No backup" is how you UNDO
                    a choice you already made, and a homeowner who has picked
                    one needs a way back out that isn't reloading the page. */}
                {altSlot ? (
                  <button type="button" className="linklike book-backup-clear" onClick={() => setAltSlot('')}>
                    Clear my second choice
                  </button>
                ) : null}
              </div>
            ) : null}

            <div className="book-stepnav">
              <button
                type="button"
                className="btn primary book-submit"
                onClick={() => {
                  if (checkWindow()) goTo(2);
                }}
              >
                Continue
              </button>
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <div className="section-heading workspace-section-heading book-step-head">
              <p className="eyebrow">Step 2 of 3</p>
              <h2 tabIndex={-1} ref={headingRef}>Your details</h2>
            </div>
            <p className="workspace-details-copy book-step-lead">
              So {businessName} can confirm your window and find the place.
            </p>

            <div className="form-grid">
              <div className="field full">
                <label htmlFor="rv-name">Full name <span className="book-req">Required</span></label>
                <input
                  id="rv-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Homeowner"
                  autoComplete="name"
                  aria-invalid={errors.name ? true : undefined}
                  aria-describedby={errors.name ? 'err-name' : undefined}
                />
                {errors.name ? <FieldError id="err-name">{errors.name}</FieldError> : null}
              </div>

              {/* Above the pair it governs. Underneath, it is a rule you read
                  for the first time while looking at the error it would have
                  prevented. */}
              <p className="field-hint booking-contact-hint booking-contact-rule">
                Add a mobile <strong>or</strong> an email &mdash; {businessName} needs one to confirm.{' '}
                <span className="book-req">Required</span>
              </p>
              {errors.contact ? (
                <div className="field full book-contact-error">
                  <FieldError id="err-contact">{errors.contact}</FieldError>
                </div>
              ) : null}
              <div className="field">
                <label htmlFor="rv-phone">Mobile</label>
                <input
                  id="rv-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={phoneExample}
                  autoComplete="tel"
                  aria-invalid={errors.contact ? true : undefined}
                  aria-describedby={errors.contact ? 'err-contact' : undefined}
                />
              </div>
              <div className="field">
                <label htmlFor="rv-email">Email</label>
                <input
                  id="rv-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@email.com"
                  autoComplete="email"
                  aria-invalid={errors.contact ? true : undefined}
                  aria-describedby={errors.contact ? 'err-contact' : undefined}
                />
              </div>

              <div className="field full">
                <label htmlFor="rv-address">Address <span className="book-req">Required</span></label>
                <input
                  id="rv-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={addressExample}
                  autoComplete="street-address"
                  aria-invalid={errors.address ? true : undefined}
                  aria-describedby={errors.address ? 'err-address' : undefined}
                />
                {errors.address ? <FieldError id="err-address">{errors.address}</FieldError> : null}
              </div>

              <div className="field full">
                <label htmlFor="rv-description">What&apos;s the job? <span className="book-opt">Optional</span></label>
                <textarea
                  id="rv-description"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={jobExample}
                />
              </div>
              <div className="field full">
                <label htmlFor="rv-note">Anything we should know? <span className="book-opt">Optional</span></label>
                <textarea
                  id="rv-note"
                  rows={2}
                  maxLength={500}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Gate code, where to park, a dog in the yard, which door to use…"
                />
                <small className="field-hint">This goes to whoever turns up, not just the office.</small>
              </div>
            </div>

            <div className="book-stepnav">
              <button type="button" className="btn ghost book-back" onClick={() => goTo(1)}>
                Back
              </button>
              <button
                type="button"
                className="btn primary book-submit"
                onClick={() => {
                  if (checkDetails()) goTo(3);
                }}
              >
                Continue
              </button>
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <div className="section-heading workspace-section-heading book-step-head">
              <p className="eyebrow">Step 3 of 3</p>
              <h2 tabIndex={-1} ref={headingRef}>Review and request</h2>
            </div>
            <p className="workspace-details-copy book-step-lead">
              Check this over — nothing is sent until you press the button.
            </p>

            {/* Every line editable from where it is. A review step that can only
                be corrected by going Back twice is a review step people skip. */}
            <dl className="book-review">
              <ReviewRow label={altLabel ? 'First choice' : 'Window'} onEdit={() => goTo(1)}>
                {chosenLabel ?? '—'}
              </ReviewRow>
              {altLabel ? (
                <ReviewRow label="Second choice" onEdit={() => goTo(1)}>
                  {altLabel}
                </ReviewRow>
              ) : null}
              {services.length > 0 ? (
                <ReviewRow label="Service" onEdit={() => goTo(1)}>
                  {chosenService?.name ?? 'Not sure yet'}
                </ReviewRow>
              ) : null}
              <ReviewRow label="Name" onEdit={() => goTo(2)}>{name}</ReviewRow>
              <ReviewRow label="Contact" onEdit={() => goTo(2)}>
                {[phone, email].filter(Boolean).join(' · ')}
              </ReviewRow>
              <ReviewRow label="Address" onEdit={() => goTo(2)}>{address}</ReviewRow>
              {description.trim() ? (
                <ReviewRow label="The job" onEdit={() => goTo(2)}>{description}</ReviewRow>
              ) : null}
              {note.trim() ? (
                <ReviewRow label="On the day" onEdit={() => goTo(2)}>{note}</ReviewRow>
              ) : null}
            </dl>

            <div className="book-stepnav">
              <button type="button" className="btn ghost book-back" onClick={() => goTo(2)}>
                Back
              </button>
              <SaveButton className="btn primary book-submit" pendingLabel="Sending…" savedLabel="Sent ✓">
                {/* Two windows are under the button. "Request this time" over a
                    list of two invites the reader to work out which one. */}
                {altLabel ? 'Request these times' : 'Request this time'}
              </SaveButton>
            </div>
            <p className="book-reassure">
              This is a request, not a charge.{' '}
              {altLabel
                ? `${businessName} confirms one of your two times before anything is booked.`
                : `${businessName} confirms before anything is booked.`}
            </p>
          </>
        ) : null}
      </form>

      {/* Shown on the window step only. This is the answer to "none of these
          are soon enough", which is a thought somebody has while looking at the
          windows — not while typing their address on step 2, and certainly not
          on the review screen where the page has one job left. */}
      {quickStop && step === 1 ? <SoonerOffer businessName={businessName} onChoose={() => setPath('quick')} /> : null}
    </>
  );
}

/**
 * THE ALTERNATIVE, WHERE IT ANSWERS A QUESTION SOMEBODY IS ACTUALLY ASKING.
 *
 * This has now been in three places. It was a card at the foot of the page,
 * below the standard form's own submit — so the way to find the faster option
 * was to scroll past the slower one and everything it asks for. Then it became
 * a fork at the top, two co-equal buttons before either path asked anything,
 * and that is the version reported as confusing: a homeowner arrives on a page
 * headed "Request a visit" and is stopped to choose a lane, one of them named
 * after a product they have never heard of and carrying a fee.
 *
 * It sits under the windows now. That is the exact moment the thought occurs —
 * you have just read the earliest one on offer and it is Thursday. The heading
 * is the question rather than our name for the answer, the fee is in the first
 * sentence, and the button is quiet: this is the alternative, not the offer.
 */
function SoonerOffer({ businessName, onChoose }: { businessName: string; onChoose: () => void }) {
  return (
    <section className="panel workspace-section-card book-aside book-sooner">
      <div className="section-heading workspace-section-heading compact-heading">
        <p className="eyebrow">None of these soon enough?</p>
        <h2>Ask for a priority visit</h2>
      </div>
      <p className="workspace-details-copy book-sooner-copy">
        {businessName} can add you to a route they are already running. They review the job first, then
        set an arrival window and a priority visit fee for making the extra trip. The fee reserves the
        visit; the work itself is quoted and billed separately, and nothing is charged until you have
        seen both.
      </p>
      <button type="button" className="btn secondary" onClick={onChoose}>
        Ask about a priority visit
      </button>
    </section>
  );
}

/** One reviewed line, with the way to change it attached to the line itself. */
function ReviewRow({ label, children, onEdit }: { label: string; children: ReactNode; onEdit: () => void }) {
  return (
    <div className="book-review-row">
      <dt>{label}</dt>
      <dd>
        <span className="book-review-value">{children}</span>
        <button type="button" className="linklike book-review-edit" onClick={onEdit}>
          Change<span className="sr-only"> {label.toLowerCase()}</span>
        </button>
      </dd>
    </div>
  );
}

/**
 * Beneath the field it belongs to, and announced. role="alert" rather than a
 * plain paragraph: the message appears after a press, so a screen reader user
 * gets nothing at all unless the region announces itself.
 */
function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p className="field-error" id={id} role="alert">
      {children}
    </p>
  );
}
