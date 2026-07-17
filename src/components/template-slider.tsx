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

type Props = {
  templates: TemplateConfig[];
};

export default function TemplateSlider({ templates }: Props) {
  const [active, setActive] = useState(0);
  const pausedRef = useRef(false);

  useEffect(() => {
    const id = setInterval(() => {
      if (!pausedRef.current) setActive((current) => (current + 1) % templates.length);
    }, 5000);
    return () => clearInterval(id);
  }, [templates.length]);

  function goTo(index: number) {
    setActive(((index % templates.length) + templates.length) % templates.length);
  }

  const current = templates[active];

  return (
    <div
      className="template-slider"
      onMouseEnter={() => { pausedRef.current = true; }}
      onMouseLeave={() => { pausedRef.current = false; }}
    >
      <div className="template-slider-viewport">
        <div className="template-slider-track" style={{ transform: `translateX(-${active * 100}%)` }}>
          {templates.map((template) => (
            <Link href={`/themes/${template.id}`} className="template-slider-slide" key={template.id}>
              <div className="template-card-image">
                {template.previewImage ? (
                  <img src={template.previewImage} alt={`${template.name} website template preview`} loading="lazy" />
                ) : null}
              </div>
            </Link>
          ))}
        </div>

        <button type="button" className="template-slider-arrow template-slider-arrow-prev" onClick={() => goTo(active - 1)} aria-label="Previous template">
          <ChevronLeftIcon />
        </button>
        <button type="button" className="template-slider-arrow template-slider-arrow-next" onClick={() => goTo(active + 1)} aria-label="Next template">
          <ChevronRightIcon />
        </button>
      </div>

      <Link href={`/themes/${current.id}`} className="template-slider-info">
        <strong>{current.name}</strong>
        <span className="template-card-desc">{current.description}</span>
        <span className="template-card-cta">
          View live demo <ArrowRightIcon />
        </span>
      </Link>

      <div className="template-slider-dots">
        {templates.map((template, index) => (
          <button
            key={template.id}
            type="button"
            className={`template-slider-dot${index === active ? ' active' : ''}`}
            onClick={() => goTo(index)}
            aria-label={`Show ${template.name} template`}
            aria-current={index === active}
          />
        ))}
      </div>
    </div>
  );
}
