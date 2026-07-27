'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { FAVORITE_FEATURES } from '@/lib/features';

// Each favorite tile shows a real product screenshot (captured from the live
// demo/theme pages into /public/features) and enlarges into a lightbox that also
// links straight to that live demo page.
type Shot = { src: string; demo: string; demoLabel: string };
const SHOTS: Record<string, Shot> = {
  'hosted-website': { src: '/features/hosted-website.jpg', demo: '/themes/modern', demoLabel: 'See a live site' },
  'ai-smart-intake': { src: '/features/ai-smart-intake.jpg', demo: '/demo/leads', demoLabel: 'Open the live demo' },
  'client-esignature': { src: '/features/client-esignature.jpg', demo: '/demo/jobs', demoLabel: 'Open the live demo' },
  'stripe-payments': { src: '/features/stripe-payments.jpg', demo: '/demo/insights', demoLabel: 'Open the live demo' },
  'payment-plans': { src: '/features/payment-plans.jpg', demo: '/demo/clients', demoLabel: 'Open the live demo' },
  'online-booking': { src: '/features/online-booking.jpg', demo: '/demo/schedule', demoLabel: 'Open the live demo' },
  'recurring-plans': { src: '/features/recurring-plans.jpg', demo: '/demo/recurring', demoLabel: 'Open the live demo' },
  'review-routing': { src: '/features/review-routing.jpg', demo: '/demo/reviews', demoLabel: 'Open the live demo' },
};

const TILE_SIZE: Record<string, 'big' | 'wide'> = {
  'hosted-website': 'big',
  'ai-smart-intake': 'big',
  'payment-plans': 'wide',
  'review-routing': 'wide',
};

function favoriteIcon(id: string) {
  const paths: Record<string, JSX.Element> = {
    'hosted-website': (<><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.6 2.6 2.6 15.4 0 18M12 3c-2.6 2.6-2.6 15.4 0 18" /></>),
    'ai-smart-intake': (<><path d="M12 3.2 13.7 8 18.5 9.7 13.7 11.4 12 16.2 10.3 11.4 5.5 9.7 10.3 8z" /><path d="m18.4 14.2.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z" /></>),
    'client-esignature': (<><path d="M3 20.5s3.6-.7 5.6-2.7l9.1-9.1a2.1 2.1 0 0 0-3-3l-9.1 9.1C3.6 15.9 3 20.5 3 20.5z" /><path d="m13.5 6 3 3" /><path d="M4 21h16" /></>),
    'stripe-payments': (<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /><path d="M7 15h4" /></>),
    'payment-plans': (<><path d="m12 2 9 5-9 5-9-5z" /><path d="m3 12 9 5 9-5" /><path d="m3 17 9 5 9-5" /></>),
    'online-booking': (<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /><path d="m9 15 2 2 4-4" /></>),
    'recurring-plans': (<><path d="m17 2 4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></>),
    'review-routing': (<><path d="m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" /></>),
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[id] ?? paths['hosted-website']}
    </svg>
  );
}

type OpenShot = { id: string; name: string; desc: string; category: string; shot: Shot };

export default function FeatureBento() {
  const [open, setOpen] = useState<OpenShot | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const lastTriggerRef = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    setOpen(null);
    lastTriggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  return (
    <>
      <div className="fx-bento">
        {FAVORITE_FEATURES.map((feature) => {
          const size = TILE_SIZE[feature.id];
          const shot = SHOTS[feature.id];
          return (
            <button
              type="button"
              key={feature.id}
              className={`fx-tile fx-tile--shot${size === 'big' ? ' fx-tile--big' : ''}${size === 'wide' ? ' fx-tile--wide' : ''}`}
              style={shot ? { backgroundImage: `url(${shot.src})` } : undefined}
              onClick={(event) => {
                if (!shot) return;
                lastTriggerRef.current = event.currentTarget;
                setOpen({ id: feature.id, name: feature.name, desc: feature.desc, category: feature.category, shot });
              }}
              aria-label={`${feature.name} — enlarge screenshot`}
            >
              <span className="fx-tile-ic" aria-hidden="true">{favoriteIcon(feature.id)}</span>
              <span className="fx-tile-expand" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4H4v5M15 4h5v5M15 20h5v-5M9 20H4v-5" /></svg>
              </span>
              <span className="fx-tile-tag">{feature.category}</span>
              <span className="fx-tile-name">{feature.name}</span>
              <span className="fx-tile-desc">{feature.desc}</span>
            </button>
          );
        })}
      </div>

      {open ? (
        <div className="fx-lightbox" role="dialog" aria-modal="true" aria-label={`${open.name} screenshot`} onClick={close}>
          <div className="fx-lightbox-inner" onClick={(event) => event.stopPropagation()}>
            <div className="fx-lightbox-head">
              <div>
                <span className="fx-lightbox-tag">{open.category}</span>
                <h3 className="fx-lightbox-title">{open.name}</h3>
              </div>
              <button ref={closeRef} type="button" className="fx-lightbox-close" onClick={close} aria-label="Close (Esc)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <img className="fx-lightbox-img" src={open.shot.src} alt={`${open.name} in Let’s Get Quoted`} />
            <div className="fx-lightbox-foot">
              <p>{open.desc}</p>
              <Link href={open.shot.demo} className="btn primary">{open.shot.demoLabel} &rarr;</Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
