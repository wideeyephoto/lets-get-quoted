'use client';

import { useMemo, useState, useTransition } from 'react';
import { updateIntakeSettingsAction } from './actions';

// Estimate strategy + lead alerts (account-level). Shared so it renders both in
// Settings and inside the Website Builder's intake section — both write the same
// account columns through updateIntakeSettingsAction, so they always mirror.
//
// Client-side because the save bar needs to know whether anything has changed:
// the action is called directly rather than through a plain form action, which
// is what makes "unsaved changes" and the saved confirmation possible.

// Three postures are offered, not the five the engine supports. "Lean" and
// "High-margin" remain valid stored values (accounts already on them keep their
// pricing) but they sit between the offered options and the labels never
// explained themselves — a contractor shouldn't have to guess what "Lean" means.
const POSTURE_CARDS = [
  { id: 'budget', label: 'Competitive', blurb: 'Lower, approachable ranges designed to encourage more inquiries.' },
  { id: 'balanced', label: 'Balanced', blurb: 'Realistic ranges that balance conversion and job quality.', recommended: true },
  { id: 'premium', label: 'Premium', blurb: 'Higher ranges that position your business around quality and expertise.' },
] as const;

// Map the two unlisted postures onto the nearest card so a contractor already on
// one sees a sensible selection rather than nothing selected.
const NEAREST_CARD: Record<string, string> = { lean: 'budget', high: 'premium' };

export default function IntakeAiSettingsSection({
  estimatePosture,
  highValueLeadAmount,
  muteLowQualityLeads,
  highValueSmsEnabled,
  alertPhone,
}: {
  estimatePosture: string;
  highValueLeadAmount: number | null;
  muteLowQualityLeads: boolean;
  highValueSmsEnabled: boolean;
  alertPhone: string;
}) {
  const [posture, setPosture] = useState(NEAREST_CARD[estimatePosture] ?? estimatePosture);
  const [threshold, setThreshold] = useState(highValueLeadAmount ? String(highValueLeadAmount) : '');
  const [smsOn, setSmsOn] = useState(highValueSmsEnabled);
  const [phone, setPhone] = useState(alertPhone);
  const [muteLow, setMuteLow] = useState(muteLowQualityLeads);

  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const touch = () => { setDirty(true); setSaved(false); setError(null); };

  const summary = useMemo(() => {
    const bits: { text: string; href: string }[] = [
      { text: 'Customers get an instant ballpark price', href: '#posture' },
      {
        text: threshold
          ? `Jobs over $${Number(threshold).toLocaleString('en-US')} are flagged high-value`
          : 'No high-value threshold set',
        href: '#threshold',
      },
    ];
    if (smsOn) bits.push({ text: 'High-value leads text your phone', href: '#alerts' });
    if (muteLow) bits.push({ text: 'Low-priority leads stay quiet', href: '#alerts' });
    return bits;
  }, [threshold, smsOn, muteLow]);

  function save() {
    const data = new FormData();
    data.set('estimatePosture', posture);
    data.set('highValueLeadAmount', threshold);
    if (muteLow) data.set('muteLowQualityLeads', 'on');
    if (smsOn) data.set('highValueSmsEnabled', 'on');
    data.set('alertPhone', phone);
    startTransition(async () => {
      try {
        await updateIntakeSettingsAction(data);
        setDirty(false);
        setSaved(true);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save your intake settings.');
      }
    });
  }

  return (
    <section className="panel workspace-section-card intake-ai-section" id="intake-ai">
      <div className="section-heading workspace-section-heading compact-heading">
        <h2>3. Estimate strategy &amp; lead alerts</h2>
      </div>
      <p className="workspace-details-copy intake-ai-lead">
        Control how your ballpark estimates are positioned and which leads get your immediate attention.
      </p>

      <div className="intake-summary">
        <strong>Your Smart Intake is active</strong>
        <ul>
          {summary.map((item) => (
            <li key={item.text}>
              <span>{item.text}</span>
              <a href={item.href}>Edit</a>
            </li>
          ))}
        </ul>
      </div>

      <div className="intake-block" id="posture">
        <div className="intake-block-head">
          <strong>How should your estimates be priced?</strong>
          <small>It never changes your real quote — only the pre-visit ballpark the homeowner sees.</small>
        </div>
        <div className="posture-cards" role="radiogroup" aria-label="Estimate pricing">
          {POSTURE_CARDS.map((card) => (
            <button
              type="button"
              key={card.id}
              role="radio"
              aria-checked={posture === card.id}
              className={`posture-card${posture === card.id ? ' on' : ''}`}
              onClick={() => { setPosture(card.id); touch(); }}
            >
              <span className="posture-card-mark" aria-hidden="true" />
              <strong>
                {card.label}
                {'recommended' in card && card.recommended ? <em>Recommended</em> : null}
              </strong>
              <small>{card.blurb}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="intake-block" id="threshold">
        <div className="intake-block-head">
          <strong>Alert me when a job may be worth more than</strong>
          <small>Those leads jump the queue. Leave blank to treat every lead the same.</small>
        </div>
        <div className="intake-amount">
          <span aria-hidden="true">$</span>
          <input
            aria-label="High-value threshold in dollars"
            type="number"
            min="0"
            step="100"
            inputMode="numeric"
            placeholder="5,000"
            value={threshold}
            onChange={(event) => { setThreshold(event.target.value); touch(); }}
          />
        </div>
      </div>

      <div className="intake-block" id="alerts">
        <div className="intake-block-head"><strong>Alerts</strong></div>

        <label className="intake-toggle">
          <input type="checkbox" checked={smsOn} onChange={(event) => { setSmsOn(event.target.checked); touch(); }} />
          <span className="intake-toggle-track" aria-hidden="true"><span /></span>
          <span className="intake-toggle-copy">
            <strong>Send me an instant text for high-value leads</strong>
            <small>Standard rates apply.</small>
          </span>
        </label>

        {smsOn && (
          <label className="intake-field">
            <span>Mobile number for those texts</span>
            <input
              type="tel"
              inputMode="tel"
              placeholder="(248) 555-0100"
              value={phone}
              onChange={(event) => { setPhone(event.target.value); touch(); }}
            />
          </label>
        )}

        <label className="intake-toggle">
          <input type="checkbox" checked={muteLow} onChange={(event) => { setMuteLow(event.target.checked); touch(); }} />
          <span className="intake-toggle-track" aria-hidden="true"><span /></span>
          <span className="intake-toggle-copy">
            <strong>Silence notifications for low-priority leads</strong>
            <small>These leads will still appear in your dashboard. This only controls alerts.</small>
          </span>
        </label>
      </div>

      {/* Sticky only once something has changed, so it doesn't sit there
          occupying the bottom of the screen for someone who's just reading. */}
      <div className={`intake-savebar${dirty ? ' stuck' : ''}`}>
        <p aria-live="polite">
          {error ? <span className="intake-save-error">{error}</span>
            : dirty ? 'You have unsaved changes'
            : saved ? <span className="intake-save-ok">Smart Intake settings saved</span>
            : ''}
        </p>
        <button type="button" className="btn primary" onClick={save} disabled={pending || !dirty}>
          {pending ? 'Saving…' : 'Save Smart Intake settings'}
        </button>
      </div>
    </section>
  );
}
