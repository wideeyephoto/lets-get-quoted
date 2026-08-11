'use client';

import { useState, useTransition, type CSSProperties } from 'react';
import { QUOTE_STYLES, QUOTE_STYLE_META, quoteStyleClass, type QuoteStyle } from '@/lib/quote-style';
import { setQuoteStyleAction } from './actions';

/**
 * How your quotes look, chosen by looking at them.
 *
 * Three finished treatments rather than a theme editor: a contractor already
 * picks one color and uploads one logo, and that is the right amount of design
 * work to ask of somebody whose job is fencing. What they want to control is
 * tone — a heritage roofer and a two-year-old pressure-washing outfit should not
 * hand a homeowner the same document — and neither of them wants to choose a
 * border radius.
 *
 * THE PREVIEWS ARE THE REAL THING, not pictures of it. Each card renders the
 * customer page's own class (`qstyle-classic`, and so on) over the same
 * `--cbrand` variables the live page sets, so what a contractor sees here is
 * literally the stylesheet their customer will get, in their own color. A
 * screenshot would drift the first time the page changed; this cannot.
 */
export default function QuoteStyleSection({
  current,
  businessName,
  brandStyle,
}: {
  current: QuoteStyle;
  businessName: string;
  /** --cbrand and friends, computed by brandPaint. Undefined for an unreadable hex. */
  brandStyle?: CSSProperties;
}) {
  const [chosen, setChosen] = useState<QuoteStyle>(current);
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, startSaving] = useTransition();

  function choose(style: QuoteStyle) {
    if (style === chosen && !failed) return;
    const previous = chosen;
    // Optimistic: the whole point of this control is that the card lights up
    // the instant it is pressed. A failure puts it back rather than leaving a
    // selection on screen that the server does not hold.
    setChosen(style);
    setSaved(false);
    setFailed(false);
    startSaving(async () => {
      try {
        await setQuoteStyleAction(style);
        setSaved(true);
      } catch {
        setChosen(previous);
        setFailed(true);
      }
    });
  }

  return (
    <section className="panel workspace-section-card" id="quote-style">
      <div className="section-heading workspace-section-heading compact-heading">
        <p className="eyebrow">Customer-facing</p>
        <h2>How your quotes look</h2>
      </div>
      <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
        Every quote you send opens on a page in your name, your color and your logo. Pick the treatment that suits the way
        you sell. It changes nothing about what the quote says, what it costs, or the order your customer is asked things
        in — only how it reads.
      </p>

      <div className="qstyle-picker" role="radiogroup" aria-label="Quote page style">
        {QUOTE_STYLES.map((style) => {
          const meta = QUOTE_STYLE_META[style];
          const isOn = chosen === style;
          return (
            <button
              type="button"
              key={style}
              role="radio"
              aria-checked={isOn}
              className={`qstyle-choice${isOn ? ' is-chosen' : ''}`}
              onClick={() => choose(style)}
              disabled={pending}
            >
              <span className={`qstyle-preview client-job-dashboard ${quoteStyleClass(style)}`} style={brandStyle} aria-hidden="true">
                <span className="qstyle-preview-hero quote-hero">
                  <span className="qstyle-preview-eyebrow">{businessName}</span>
                  <span className="qstyle-preview-title">Here&rsquo;s your quote.</span>
                </span>
                <span className="qstyle-preview-body">
                  <span className="qstyle-preview-row"><i /><b /></span>
                  <span className="qstyle-preview-row"><i /><b /></span>
                  <span className="qstyle-preview-total">
                    <i />
                    <b>$3,500.00</b>
                  </span>
                  <span className="qstyle-preview-btn">Approve quote</span>
                </span>
              </span>

              <span className="qstyle-choice-meta">
                <strong>
                  {meta.name}
                  {isOn ? <span className="qstyle-choice-tick" aria-hidden="true">✓</span> : null}
                </strong>
                <small>{meta.tagline}</small>
                <small className="qstyle-choice-best">{meta.bestFor}</small>
              </span>
            </button>
          );
        })}
      </div>

      <p className="field-hint" role="status">
        {failed
          ? 'That did not save. Check your connection and try again.'
          : pending
            ? 'Saving…'
            : saved
              ? `Saved. Every quote you send from now on uses ${QUOTE_STYLE_META[chosen].name}.`
              : `Quotes you send use ${QUOTE_STYLE_META[chosen].name}. Changing this also changes quotes already sent — the link renders fresh each time it is opened.`}
      </p>
    </section>
  );
}
