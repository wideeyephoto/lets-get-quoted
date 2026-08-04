'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import type { SiteEstimateRangesContent, SiteLeadFiltersContent, SiteQuoteFormContent } from '@/lib/site-content';
import { updateIntakeContentAction } from './actions';

/**
 * What the AI intake asks, and which answers matter.
 *
 * Moved out of the website builder, where it sat behind three numbered cards on
 * a page otherwise about headlines and photos. None of it changes how the site
 * LOOKS — it decides which leads interrupt a contractor and which quietly sink,
 * which is what the Automations tab is.
 *
 * Auto-saves, like the rest of this tab. Each control writes only its own
 * branch of the site content, so nothing here can touch a headline.
 */

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  leadFilters: SiteLeadFiltersContent;
  emailField: SiteEstimateRangesContent['emailField'];
  estimateLabel: SiteQuoteFormContent['estimateLabel'];
  hasCities: boolean;
  /** Smart Intake off means the classic form is running and none of this applies. */
  smartIntakeOn: boolean;
};

export default function IntakeContentSection({
  leadFilters: initialFilters,
  emailField: initialEmailField,
  estimateLabel: initialLabel,
  hasCities,
  smartIntakeOn,
}: Props) {
  const [filters, setFilters] = useState(initialFilters);
  const [emailField, setEmailField] = useState(initialEmailField);
  const [estimateLabel, setEstimateLabel] = useState(initialLabel);
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

  return (
    <div className="intake-content">
      {!smartIntakeOn ? (
        <div className="automation-prereq" style={{ marginBottom: '0.9rem' }}>
          <span aria-hidden="true">📝</span>
          <span>
            Smart Intake is off, so your website is running the <strong>classic quote form</strong> and none of this is
            in use. Everything below is kept, and applies again the moment you switch Smart Intake back on.
          </span>
        </div>
      ) : null}

      <p className="eyebrow">What the intake asks</p>
      <div className="intake-grid">
        <label className="field">
          <span>Email address</span>
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
            <option value="off">Don&apos;t ask</option>
          </select>
          <small className="field-hint">
            A phone number is always required — the follow-up promised to visitors is a text or a call.
          </small>
        </label>

        <label className="field">
          <span>What visitors see it called</span>
          <select
            value={estimateLabel}
            onChange={(event) => {
              const value = event.target.value as Props['estimateLabel'];
              const previous = estimateLabel;
              setEstimateLabel(value);
              persist({ estimateLabel: value }, () => setEstimateLabel(previous));
            }}
          >
            <option value="instant">&ldquo;Instant Estimate&rdquo;</option>
            <option value="quick">&ldquo;Instant Quote&rdquo;</option>
          </select>
          <small className="field-hint">The heading and button on the intake card.</small>
        </label>
      </div>

      <p className="eyebrow intake-heading">Which jobs you want</p>
      <p className="intake-lede">
        None of this turns a lead away. It changes what gets flagged and how it&apos;s ranked, so the jobs you want are
        the ones at the top.
      </p>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={filters.askTimeline}
          onChange={(event) => patchFilters({ askTimeline: event.target.checked })}
        />
        <span>
          <strong>Ask &ldquo;when do you need this done?&rdquo;</strong>
          <small>ASAP jobs rank Hot; &ldquo;just researching&rdquo; sinks to the bottom of your leads.</small>
        </span>
      </label>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={filters.serviceAreaGate}
          onChange={(event) => patchFilters({ serviceAreaGate: event.target.checked })}
        />
        <span>
          <strong>Check the visitor&apos;s service area</strong>
          <small>
            Asks for their ZIP or town and flags leads outside your &ldquo;Cities you serve&rdquo; list.
            {hasCities ? '' : ' Add cities to that section in the website builder to activate this.'}
          </small>
        </span>
      </label>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={filters.phoneVerification}
          onChange={(event) => patchFilters({ phoneVerification: event.target.checked })}
        />
        <span>
          <strong>Verify phone numbers with a text code</strong>
          <small>
            The strongest junk filter — visitors confirm a 6-digit code before the intake submits. Verified leads get a
            green badge. Skipped automatically if texting isn&apos;t configured.
          </small>
        </span>
      </label>

      <p className="eyebrow intake-heading">Minimum job size</p>
      {/* 0 already meant "no minimum", so this reads and writes that same value
          rather than adding a second source of truth. */}
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={filters.minJobAmount === 0}
          onChange={(event) => patchFilters({ minJobAmount: event.target.checked ? 0 : 500 })}
        />
        <span>
          <strong>I don&apos;t have a minimum</strong>
          <small>Every job is worth quoting, whatever the size.</small>
        </span>
      </label>
      {filters.minJobAmount > 0 ? (
        <label className="field">
          <span>Flag jobs estimated below</span>
          <input
            type="number"
            min={1}
            value={filters.minJobAmount}
            onChange={(event) => patchFiltersSoon({ minJobAmount: Math.max(0, Math.round(Number(event.target.value) || 0)) })}
          />
          <small className="field-hint">
            Smaller jobs still come through — they&apos;re just marked &ldquo;Below minimum&rdquo;.
          </small>
        </label>
      ) : null}

      <p className="eyebrow intake-heading">Jobs you don&apos;t want</p>
      <div className="intake-exclusions">
        {filters.exclusions.map((item, index) => (
          <div className="intake-exclusion" key={index}>
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
      </div>
      {filters.exclusions.length < 10 ? (
        <button
          type="button"
          className="btn ghost"
          onClick={() => patchFilters({ exclusions: [...filters.exclusions, ''] })}
        >
          Add exclusion
        </button>
      ) : null}

      <p className="eyebrow intake-heading">Availability</p>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={filters.fullyBooked.enabled}
          onChange={(event) => patchFilters({ fullyBooked: { ...filters.fullyBooked, enabled: event.target.checked } })}
        />
        <span>
          <strong>I&apos;m currently fully booked</strong>
          <small>Tell new customers you&apos;re booked while still collecting their details for later.</small>
        </span>
      </label>
      {filters.fullyBooked.enabled ? (
        <div className="intake-grid">
          <label className="field">
            <span>Booked until (optional)</span>
            <input
              type="date"
              value={filters.fullyBooked.until}
              onChange={(event) => patchFilters({ fullyBooked: { ...filters.fullyBooked, until: event.target.value } })}
            />
            <small className="field-hint">
              The banner turns itself off after this date — no date means it runs until you switch it off.
            </small>
          </label>
          <label className="field">
            <span>Message (optional)</span>
            <input
              maxLength={140}
              value={filters.fullyBooked.message}
              placeholder="We're currently booked up — send your request and we'll reach out as soon as a spot opens."
              onChange={(event) => patchFiltersSoon({ fullyBooked: { ...filters.fullyBooked, message: event.target.value } })}
            />
          </label>
        </div>
      ) : null}

      <div className="intake-foot">
        <span className={`intake-save intake-save-${save}`} aria-live="polite">
          {save === 'saving' ? 'Saving…' : save === 'saved' ? '✓ Saved' : save === 'error' ? 'Couldn’t save' : ''}
        </span>
      </div>
    </div>
  );
}
