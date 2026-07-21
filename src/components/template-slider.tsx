'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { TemplateConfig } from '@/lib/templates/types';

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

// A template preview dressed as a browser window so it clearly reads as a real
// website (and fills the frame edge-to-edge instead of floating cropped).
function BrowserFrame({ template }: { template: TemplateConfig }) {
  return (
    <span className="template-browser">
      <span className="template-browser-bar" aria-hidden="true">
        <i /><i /><i />
        <span />
      </span>
      <span className="template-browser-body">
        {template.previewImage ? (
          <img src={template.previewImage} alt={`${template.name} website template preview`} loading="lazy" />
        ) : null}
      </span>
    </span>
  );
}

type Props = {
  templates: TemplateConfig[];
};

export default function TemplateSlider({ templates }: Props) {
  const [active, setActive] = useState(0);
  const pausedRef = useRef(false);
  const count = templates.length;

  useEffect(() => {
    const id = setInterval(() => {
      if (!pausedRef.current) setActive((current) => (current + 1) % count);
    }, 5000);
    return () => clearInterval(id);
  }, [count]);

  function goTo(index: number) {
    setActive(((index % count) + count) % count);
  }

  const current = templates[active];

  // Position each card relative to the active one: front-and-center, tilted
  // right-behind, or tilted left-behind (extra cards fall back to hidden).
  function slotFor(index: number): 'center' | 'right' | 'left' | 'hidden' {
    const rel = (index - active + count) % count;
    if (rel === 0) return 'center';
    if (rel === 1) return 'right';
    if (rel === count - 1) return 'left';
    return 'hidden';
  }

  return (
    <div
      className="template-deck"
      onMouseEnter={() => { pausedRef.current = true; }}
      onMouseLeave={() => { pausedRef.current = false; }}
    >
      <div className="template-deck-stage">
        {/* invisible sizer so the absolutely-positioned cards get real height */}
        <span className="template-browser template-deck-anchor" aria-hidden="true">
          <span className="template-browser-bar"><i /><i /><i /><span /></span>
          <span className="template-browser-body" />
        </span>

        {/* Every card is the same <Link> element (real, crawlable demo links)
            so React only swaps className between slots — letting the tilt/scale
            transition animate. The front card navigates; a side card click is
            intercepted to bring it to the front instead. */}
        {templates.map((template, index) => {
          const slot = slotFor(index);
          return (
            <Link
              href={`/themes/${template.id}`}
              key={template.id}
              className={`template-deck-card template-deck-${slot}`}
              aria-label={slot === 'center' ? `View the ${template.name} template live demo` : `Bring the ${template.name} template to the front`}
              aria-hidden={slot === 'hidden'}
              tabIndex={slot === 'hidden' ? -1 : 0}
              onClick={(event) => {
                if (slot !== 'center') {
                  event.preventDefault();
                  goTo(index);
                }
              }}
            >
              <BrowserFrame template={template} />
            </Link>
          );
        })}

        <button type="button" className="template-deck-arrow template-deck-arrow-prev" onClick={() => goTo(active - 1)} aria-label="Previous template">
          <ChevronLeftIcon />
        </button>
        <button type="button" className="template-deck-arrow template-deck-arrow-next" onClick={() => goTo(active + 1)} aria-label="Next template">
          <ChevronRightIcon />
        </button>
      </div>

      <Link href={`/themes/${current.id}`} className="template-deck-info">
        <strong>{current.name}</strong>
        <span className="template-card-desc">{current.description}</span>
        <span className="template-card-cta">
          View live demo <ArrowRightIcon />
        </span>
      </Link>

      <div className="template-deck-dots">
        {templates.map((template, index) => (
          <button
            key={template.id}
            type="button"
            className={`template-deck-dot${index === active ? ' active' : ''}`}
            onClick={() => goTo(index)}
            aria-label={`Show ${template.name} template`}
            aria-current={index === active}
          />
        ))}
      </div>
    </div>
  );
}
