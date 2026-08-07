'use client';

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import type { SiteEstimateRangesContent, SiteLeadFiltersContent } from '@/lib/site-content';
import { intakeQuality, groupStatus } from '@/lib/intake-quality';
import { updateIntakeContentAction } from './actions';

/**
 * What the AI intake asks, and which answers matter.
 *
 * Moved out of the website builder, where it sat behind three numbered cards on
 * a page otherwise about headlines and photos. None of it changes how the site
 * LOOKS — it decides which leads interrupt a contractor and which quietly sink,
 * which is what the Automations tab is.
 *
 * Laid out as three numbered groups of tick boxes with the settings folded into
 * the row they belong to, so the whole intake reads as a checklist you can scan
 * in a second rather than a column of selects, number fields and free text. A
 * row's detail only unfolds once its box is ticked — the minimum-job amount is
 * meaningless while there is no minimum.
 *
 * Auto-saves. Each control writes only its own branch of the site content, so
 * nothing here can touch a headline.
 */

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  leadFilters: SiteLeadFiltersContent;
  emailField: SiteEstimateRangesContent['emailField'];
  hasCities: boolean;
  /** Smart Intake off means the classic form is running and none of this applies. */
  smartIntakeOn: boolean;
  /** The real preview modal's trigger, rendered into the right column. */
  preview?: ReactNode;
};

/** One tick-box row. `detail` unfolds only when it's on. */
function Row({
  checked,
  onChange,
  title,
  hint,
  detail,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  title: string;
  hint: string;
  detail?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className={`iq-row${checked ? ' is-on' : ''}${disabled ? ' is-disabled' : ''}`}>
      <label className="iq-row-head">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
        <span className="iq-row-copy">
          <strong>{title}</strong>
          <small>{hint}</small>
        </span>
      </label>
      {checked && detail ? <div className="iq-row-detail">{detail}</div> : null}
    </div>
  );
}

export default function IntakeContentSection({
  leadFilters: initialFilters,
  emailField: initialEmailField,
  hasCities,
  smartIntakeOn,
  preview,
}: Props) {
  const [filters, setFilters] = useState(initialFilters);
  const [emailField, setEmailField] = useState(initialEmailField);
  const [save, setSave] = useState<SaveState>('idle');
  const [, startSaving] = useTransition();
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
    if (debounce.current) clearTimeout(debounce.current);
  }, []);

  function persist(input: Parameters<typeof updateIntakeContentAction>[0], rollback: () => void) {
    setSave('saving');
    startSaving(async () => {
      try {
        await updateIntakeContentAction(input);
        setSave('saved');
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSave('idle'), 2400);
      } catch {
        // Put it back. A filter left showing the new state after a failed save
        // tells a contractor leads are being sorted a way they aren't.
        rollback();
        setSave('error');
      }
    });
  }

  /** Immediate — a toggle that waits feels broken. */
  function patchFilters(next: Partial<SiteLeadFiltersContent>) {
    const previous = filters;
    setFilters((current) => ({ ...current, ...next }));
    persist({ leadFilters: next }, () => setFilters(previous));
  }

  /** Debounced — typing a number or a phrase shouldn't save on every keystroke. */
  function patchFiltersSoon(next: Partial<SiteLeadFiltersContent>) {
    const previous = filters;
    setFilters((current) => ({ ...current, ...next }));
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => persist({ leadFilters: next }, () => setFilters(previous)), 800);
  }

  const qualityInput = {
    askTimeline: filters.askTimeline,
    serviceAreaGate: filters.serviceAreaGate,
    phoneVerification: filters.phoneVerification,
    minJobAmount: filters.minJobAmount,
    exclusionCount: filters.exclusions.filter((item) => item.trim()).length,
    emailField,
    fullyBooked: filters.fullyBooked.enabled,
  };
  // Read from what is SET, so a claim about lead quality changes the moment the
  // setting it describes does.
  const quality = intakeQuality(qualityInput);
  const status = groupStatus(qualityInput);
  const buttonText = 'Get my instant estimate';

  return (
    <div className={`intake-quality${smartIntakeOn ? '' : ' is-paused'}`}>
      {!smartIntakeOn ? (
        <div className="automation-prereq" style={{ marginBottom: '0.9rem' }}>
          <span aria-hidden="true">📝</span>
          <span>
            Smart Intake is off, so your website is running the <strong>classic quote form</strong> and none of this is
            in use. Everything below is kept, and applies again the moment you switch Smart Intake back on.
          </span>
        </div>
      ) : null}

      <div className="iq-grid">
        {/* ── Setup ─────────────────────────────────────────────────────── */}
        <div className="iq-setup">
          <div className="iq-setup-head">
            <span className="iq-spark" aria-hidden="true">✦</span>
            <div>
              <strong>Intake AI setup</strong>
              <small>Build a smarter intake. Get better leads.</small>
            </div>
          </div>

          <section className="iq-group">
            <header>
              <span className="iq-num" aria-hidden="true">1</span>
              <h4>What the intake asks</h4>
              <span className="iq-badge is-ok">{status.asks} ✓</span>
            </header>
            <p className="iq-group-lede">Collect the right info up front.</p>

            <Row
              checked={emailField !== 'off'}
              onChange={(next) => {
                const value = next ? 'optional' : 'off';
                const previous = emailField;
                setEmailField(value);
                persist({ emailField: value }, () => setEmailField(previous));
              }}
              title="Email address"
              hint="We’ll follow up in a text or call. A phone number is always required."
              detail={
                <label className="iq-field">
                  <span>How hard to push for it</span>
                  <select
                    value={emailField}
                    onChange={(event) => {
                      const value = event.target.value as Props['emailField'];
                      const previous = emailField;
                      setEmailField(value);
                      persist({ emailField: value }, () => setEmailField(previous));
                    }}
                  >
                    <option value="optional">Ask, but don&apos;t require it</option>
                    <option value="required">Require it</option>
                  </select>
                </label>
              }
            />

            {/* The "Instant Estimate" / "Instant Quote" wording picker was here.
                It let one product call the same tool two things, and the second
                name was the wrong one: a quote is the document that follows
                approval, so promising a "quote" on the spot promises a firm
                price nobody has committed to. getEstimateButtonLabel now always
                says Instant Estimate; sites still storing the old value simply
                render the accurate wording. */}
          </section>

          <section className="iq-group">
            <header>
              <span className="iq-num" aria-hidden="true">2</span>
              <h4>Lead qualification</h4>
              <span className={`iq-badge${quality.filtersOn > 0 ? ' is-ok' : ''}`}>{status.filters} {quality.filtersOn > 0 ? '✓' : ''}</span>
            </header>
            <p className="iq-group-lede">
              None of this turns a lead away. It changes what gets flagged and how it&apos;s ranked, so the jobs you
              want are the ones at the top.
            </p>

            <Row
              checked={filters.askTimeline}
              onChange={(next) => patchFilters({ askTimeline: next })}
              title="Ask “when do you need this done?”"
              hint="ASAP jobs rank Hot; “just researching” sinks to the bottom."
            />
            <Row
              checked={filters.serviceAreaGate}
              onChange={(next) => patchFilters({ serviceAreaGate: next })}
              title="Check the visitor’s service area"
              hint={
                hasCities
                  ? 'Asks for their ZIP or town and flags leads outside your list.'
                  : 'Add cities to “Cities you serve” in the website builder to activate this.'
              }
            />
            <Row
              checked={filters.phoneVerification}
              onChange={(next) => patchFilters({ phoneVerification: next })}
              title="Verify phone numbers with a text code"
              hint="The strongest junk filter — a 6-digit code before the intake submits. Skipped if texting isn’t configured."
            />
          </section>

          <section className="iq-group">
            <header>
              <span className="iq-num" aria-hidden="true">3</span>
              <h4>Job preferences</h4>
              <span className="iq-badge is-soft">{status.preferences}</span>
            </header>
            <p className="iq-group-lede">Understand job details and size.</p>

            {/* Stored as 0 = "no minimum", which is already how the rest of the
                app reads it — no second source of truth. */}
            <Row
              checked={filters.minJobAmount > 0}
              onChange={(next) => patchFilters({ minJobAmount: next ? 500 : 0 })}
              title="Minimum job size"
              hint="Flag jobs below your threshold. They still come through, just marked."
              detail={
                <label className="iq-field">
                  <span>Flag jobs estimated below</span>
                  <input
                    type="number"
                    min={1}
                    value={filters.minJobAmount}
                    onChange={(event) => patchFiltersSoon({ minJobAmount: Math.max(0, Math.round(Number(event.target.value) || 0)) })}
                  />
                </label>
              }
            />

            <Row
              checked={filters.exclusions.length > 0}
              onChange={(next) => patchFilters({ exclusions: next ? [''] : [] })}
              title="Jobs you don’t want"
              hint="Exclude work you don’t take."
              detail={
                <div className="iq-exclusions">
                  {filters.exclusions.map((item, index) => (
                    <div className="iq-exclusion" key={index}>
                      <input
                        value={item}
                        maxLength={80}
                        aria-label={`Exclusion ${index + 1}`}
                        placeholder="e.g. mobile homes, window AC units"
                        onChange={(event) =>
                          patchFiltersSoon({
                            exclusions: filters.exclusions.map((other, i) => (i === index ? event.target.value : other)),
                          })
                        }
                      />
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Remove ${item || 'exclusion'}`}
                        onClick={() => patchFilters({ exclusions: filters.exclusions.filter((_, i) => i !== index) })}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {filters.exclusions.length < 10 ? (
                    <button
                      type="button"
                      className="iq-add"
                      onClick={() => patchFilters({ exclusions: [...filters.exclusions, ''] })}
                    >
                      + Add exclusion
                    </button>
                  ) : null}
                </div>
              }
            />

            <Row
              checked={filters.fullyBooked.enabled}
              onChange={(next) => patchFilters({ fullyBooked: { ...filters.fullyBooked, enabled: next } })}
              title="Availability"
              hint="Let us know when you’re fully booked. Details are still collected for later."
              detail={
                <>
                  <label className="iq-field">
                    <span>Booked until (optional)</span>
                    <input
                      type="date"
                      value={filters.fullyBooked.until}
                      onChange={(event) => patchFilters({ fullyBooked: { ...filters.fullyBooked, until: event.target.value } })}
                    />
                    <small>The banner turns itself off after this date.</small>
                  </label>
                  <label className="iq-field">
                    <span>Message (optional)</span>
                    <input
                      maxLength={140}
                      value={filters.fullyBooked.message}
                      placeholder="We're currently booked up — send your request and we'll reach out."
                      onChange={(event) => patchFiltersSoon({ fullyBooked: { ...filters.fullyBooked, message: event.target.value } })}
                    />
                  </label>
                </>
              }
            />
          </section>

          <div className={`iq-autosave iq-save-${save}`} aria-live="polite">
            <span className="iq-autosave-mark" aria-hidden="true">✓</span>
            <div>
              <strong>
                {save === 'saving' ? 'Saving…' : save === 'error' ? 'Couldn’t save' : 'Auto-saved'}
              </strong>
              <small>
                {save === 'error'
                  ? 'Your last change was put back. Try again.'
                  : 'All changes are saved automatically.'}
              </small>
            </div>
          </div>
        </div>

        {/* ── Preview + effect ──────────────────────────────────────────── */}
        <div className="iq-preview-col">
          <div className="iq-preview-head">
            <div>
              <p className="iq-live"><i aria-hidden="true" /> Live intake preview</p>
              <small>This is what homeowners will see</small>
            </div>
            {preview}
          </div>

          {/* A representation, not the real form — the real one is a click away
              in "Open full preview", which renders the actual component against
              the draft site. What this HAS to get right is the button wording,
              because that is a setting on the left. */}
          <div className="iq-phone" aria-hidden="true">
            <p className="iq-phone-q">What can we help you with today?</p>
            <div className="iq-phone-steps">
              <i className="is-on" /><i /><i /><i />
            </div>
            <p className="iq-phone-btn">{buttonText}</p>
            <p className="iq-phone-fine">Takes 30 seconds &nbsp;•&nbsp; No commitment</p>
          </div>

          <div className="iq-benefits">
            <div><span className="iq-bicon is-a" aria-hidden="true">◎</span><strong>Higher quality leads</strong><small>Serious, in-area homeowners rank first.</small></div>
            <div><span className="iq-bicon is-b" aria-hidden="true">⛊</span><strong>Fewer unqualified jobs</strong><small>Filters flag junk and low-value requests.</small></div>
            <div><span className="iq-bicon is-c" aria-hidden="true">⚡</span><strong>Faster response</strong><small>Instant estimates start the conversation.</small></div>
          </div>

          <div className="iq-effect">
            <div className="iq-effect-head">
              <strong>How your settings affect lead quality</strong>
              <span className="iq-score">
                Quality score <b className={`is-${quality.score.toLowerCase()}`}>{quality.score}</b>
              </span>
            </div>
            {quality.signals.map((signal) => (
              <div className="iq-signal" key={signal.key}>
                <span className={`iq-sicon is-${signal.key}`} aria-hidden="true">{signal.icon}</span>
                <div>
                  <strong>{signal.title}</strong>
                  <small>{signal.detail}</small>
                </div>
                <span className={`iq-impact is-${signal.tone}`}>{signal.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
