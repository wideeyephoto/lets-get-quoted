'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRef, useState, type KeyboardEvent } from 'react';

import { ACH_MIN_AMOUNT } from '@/lib/pricing';

import styles from './how-it-works.module.css';

type ProductVisual = {
  src: string;
  alt: string;
  width: number;
  height: number;
  label: string;
  badge?: string;
};

type WorkflowStage = {
  number: string;
  nav: string;
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  callout: string;
  href: string;
  cta: string;
  visuals: ProductVisual[];
};

const STAGES: WorkflowStage[] = [
  {
    number: '01',
    nav: 'Website',
    eyebrow: 'BUILD THE FRONT DOOR',
    title: 'Turn a website visit into a job worth reviewing.',
    body:
      'Publish on the included LGQ subdomain or connect a domain you own. Trade-specific pages and Smart Intake collect the details before you call.',
    points: [
      'Generate the site from your business name, trade, and service area',
      'Edit pages, services, FAQs, colors, photos, and service areas',
      'Show a preliminary estimate range, when available, after collecting contact details',
    ],
    callout: 'Your website and intake stay connected.',
    href: '/features/website-builder',
    cta: 'Explore the website builder',
    visuals: [
      {
        src: '/features/hosted-website.jpg',
        alt: 'Generated Apex Roofing contractor website with an Instant Quote form visible in the hero.',
        width: 2160,
        height: 1350,
        label: 'Generated contractor website',
        badge: 'GENERATED DEMO WEBSITE · DEMO DATA',
      },
      {
        src: '/product/website.webp',
        alt: 'Let’s Get Quoted website editor beside a live contractor-site preview.',
        width: 1600,
        height: 1000,
        label: 'Website editor and preview',
      },
    ],
  },
  {
    number: '02',
    nav: 'Smart Intake',
    eyebrow: 'QUALIFY WITH YOUR RULES',
    title: 'Understand the job before you pick up the phone.',
    body:
      'Trade-specific questions collect scope, photos, timing, location, and budget signals, then organize the request by fit, urgency, value, and service-area match.',
    points: [
      'Set minimum job size, excluded work, and service-area rules',
      'Turn optional phone verification on or off',
      'Keep lower-fit requests visible while leaving them quiet by default',
    ],
    callout: 'The estimate is a range. You set the final quote.',
    href: '/features/ai-intake',
    cta: 'Try a sample intake',
    visuals: [
      {
        src: '/features/smart-intake-qualification.png',
        alt: 'Let’s Get Quoted Smart Intake showing homeowner intake form with trade-specific questions, panel photo, and SMS verification connected to the contractor priority brief scored by fit and rules.',
        width: 2160,
        height: 1350,
        label: 'Smart Intake form & scored brief',
        badge: 'SMART INTAKE IN ACTION · DEMO DATA',
      },
      {
        src: '/features/ai-smart-intake.jpg',
        alt: 'Let’s Get Quoted Current Leads pipeline with needs-response, contacted, quote-sent, won, and lost columns.',
        width: 2160,
        height: 1350,
        label: 'Lead pipeline by stage',
        badge: 'ACTUAL PRODUCT SCREEN · DEMO DATA',
      },
    ],
  },
  {
    number: '03',
    nav: 'Quote & deposit',
    eyebrow: 'PRICE IT AND WIN THE WORK',
    title: 'Reuse your Price Book. Send a quote ready to approve.',
    body:
      'Pull saved services, units, and rates into an itemized quote, add optional upgrades, then send it for typed e-signature and, when required, a deposit.',
    points: [
      'Anything outside your Price Book is flagged before sending',
      'Optional upgrades update the homeowner’s total',
      'The approved quote, signature, and timestamp stay on the job',
    ],
    callout: 'Request details carry into the quote.',
    href: '/features/quotes',
    cta: 'Explore quotes and Price Book',
    visuals: [
      {
        src: '/features/quote-builder-modern.png',
        alt: 'Let’s Get Quoted itemized quote builder with Price Book line items, optional generator interlock upgrade, live total calculation, typed e-signature, and Stripe deposit clearance.',
        width: 2160,
        height: 1350,
        label: 'Itemized quote & e-signature',
        badge: 'QUOTE & DEPOSIT IN ACTION · DEMO DATA',
      },
      {
        src: '/media/quotes/quote-builder-payment-terms.jpg',
        alt: 'Quote payment terms offering pay in full, deposit plus balance, or scheduled installments.',
        width: 1568,
        height: 770,
        label: 'Deposit and payment terms',
        badge: 'ACTUAL PRODUCT SCREEN · DEMO DATA',
      },
    ],
  },
  {
    number: '04',
    nav: 'Schedule & run',
    eyebrow: 'BOOK IT AND SEND THE CREW',
    title: 'Offer the windows you can keep. Send the crew the job details.',
    body:
      'Text up to three arrival windows, let the customer choose, then assign yourself or your crew. Notes, photos, voice memos, and change orders stay with the job as the work moves.',
    points: [
      'The chosen arrival window writes itself onto the job',
      'Assigned crew receives the address, scope, photos, and any contact details you allow',
      'Reminders and on-my-way updates keep the customer informed',
    ],
    callout: 'Weather can flag a risk. It never moves the job automatically.',
    href: '/features/scheduling',
    cta: 'Explore scheduling and dispatch',
    visuals: [
      {
        src: '/features/online-booking.jpg',
        alt: 'Let’s Get Quoted job calendar with scheduled work and crew assignments.',
        width: 2160,
        height: 1350,
        label: 'Job calendar and crew assignment',
      },
      {
        src: '/product/jobs.webp',
        alt: 'Let’s Get Quoted job queue with job status and a location map.',
        width: 1600,
        height: 1000,
        label: 'Job queue and map',
      },
    ],
  },
  {
    number: '05',
    nav: 'Invoice & pay',
    eyebrow: 'CLOSE THE LOOP',
    title: 'One homeowner link—from approval to paid.',
    body:
      'The private job portal keeps the signed quote, schedule, conversation, itemized invoice, and payment together—without a homeowner app or password.',
    points: [
      'Collect a deposit and final balance through your connected Stripe account',
      `Offer card, bank debit on eligible one-off payments of $${ACH_MIN_AMOUNT.toLocaleString('en-US')} or more, or optional 0%-interest installments`,
      'Send the itemized invoice and receipt from the same job record',
    ],
    callout: 'Payment options and reporting stay connected to the job.',
    href: '/features/payments',
    cta: 'Explore invoices and payments',
    visuals: [
      {
        src: '/media/quotes/homeowner-payment-plan.png',
        alt: 'Homeowner authorization screen for a deposit and scheduled installment plan.',
        width: 1191,
        height: 794,
        label: 'Homeowner payment authorization',
      },
      {
        src: '/product/insights.webp',
        alt: 'Let’s Get Quoted insights view with collected revenue, costs, profit, and invoice status.',
        width: 1600,
        height: 1000,
        label: 'Revenue, costs, and margin',
      },
    ],
  },
];

export default function WorkflowShowcase() {
  const [activeStage, setActiveStage] = useState(0);
  const [activeVisual, setActiveVisual] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  const stage = STAGES[activeStage];
  const visual = stage.visuals[activeVisual];

  const selectStage = (index: number) => {
    const next = (index + STAGES.length) % STAGES.length;
    setActiveStage(next);
    setActiveVisual(0);
    dialogRef.current?.close();
    window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      tabRefs.current[next]?.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    });
  };

  const handleTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % STAGES.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + STAGES.length) % STAGES.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = STAGES.length - 1;
    else return;

    event.preventDefault();
    selectStage(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <>
      <div className={styles.workflowTabs} role="tablist" aria-label="Five connected workflow stages">
        {STAGES.map((item, index) => {
          const selected = index === activeStage;
          return (
            <button
              key={item.number}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`workflow-tab-${index}`}
              aria-selected={selected}
              aria-controls="workflow-panel"
              tabIndex={selected ? 0 : -1}
              className={selected ? styles.workflowTabActive : styles.workflowTab}
              onClick={() => selectStage(index)}
              onKeyDown={(event) => handleTabKey(event, index)}
            >
              <span>{item.number}</span>
              <strong>{item.nav}</strong>
            </button>
          );
        })}
      </div>

      <article
        className={styles.workflowPanel}
        id="workflow-panel"
        role="tabpanel"
        aria-labelledby={`workflow-tab-${activeStage}`}
      >
        <div className={styles.workflowCopy}>
          <p className={styles.stepNumber} aria-live="polite">STEP {stage.number} OF 05</p>
          <p className={styles.kicker}>{stage.eyebrow}</p>
          <h3>{stage.title}</h3>
          <p className={styles.workflowBody}>{stage.body}</p>
          <ul className={styles.checkList}>
            {stage.points.map((point) => (
              <li key={point}>
                <span aria-hidden="true">✓</span>
                {point}
              </li>
            ))}
          </ul>
          <Link className={styles.inlineLink} href={stage.href}>
            {stage.cta} <span aria-hidden="true">→</span>
          </Link>

          <div className={styles.stagePager} aria-label="Workflow step controls">
            <button type="button" onClick={() => selectStage(activeStage - 1)}>
              <span aria-hidden="true">←</span> Previous
            </button>
            <button type="button" onClick={() => selectStage(activeStage + 1)}>
              {activeStage === STAGES.length - 1 ? 'Start again' : `Next: ${STAGES[activeStage + 1].nav}`}
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>

        <figure className={styles.productFrame}>
          <div className={styles.productFrameTop}>
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <small>{visual.badge ?? 'ACTUAL PRODUCT SCREEN · DEMO DATA'}</small>
            <button
              className={styles.expandButton}
              type="button"
              aria-label={`Enlarge ${visual.label}`}
              onClick={() => dialogRef.current?.showModal()}
            >
              <span aria-hidden="true">↗</span> View full size
            </button>
          </div>
          <div className={styles.productViewport}>
            <Image
              key={visual.src}
              src={visual.src}
              alt={visual.alt}
              width={visual.width}
              height={visual.height}
              sizes="(max-width: 980px) calc(100vw - 40px), 58vw"
              priority={activeStage === 0 && activeVisual === 0}
            />
          </div>

          <figcaption className={styles.productFrameBottom}>
            <div>
              <strong>{visual.label}</strong>
              <p className={styles.productCallout}>
                <span aria-hidden="true">✓</span> {stage.callout}
              </p>
            </div>
            {stage.visuals.length > 1 ? (
              <div className={styles.visualTabs} role="group" aria-label={`${stage.nav} product screens`}>
                {stage.visuals.map((item, index) => (
                  <button
                    key={item.src}
                    type="button"
                    aria-pressed={index === activeVisual}
                    onClick={() => setActiveVisual(index)}
                  >
                    <span aria-hidden="true">{index + 1}</span>
                    {item.label}
                  </button>
                ))}
              </div>
            ) : (
              <span>{stage.number} / 05</span>
            )}
          </figcaption>
        </figure>
      </article>

      <dialog
        ref={dialogRef}
        className={styles.productDialog}
        aria-labelledby="product-dialog-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <div className={styles.productDialogCard}>
          <div className={styles.productDialogTop}>
            <div>
              <small>{visual.badge ?? 'ACTUAL PRODUCT SCREEN · DEMO DATA'} · SCROLL TO INSPECT</small>
              <strong id="product-dialog-title">{visual.label}</strong>
            </div>
            <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close enlarged product screen">
              Close <span aria-hidden="true">×</span>
            </button>
          </div>
          <Image
            src={visual.src}
            alt={visual.alt}
            width={visual.width}
            height={visual.height}
            sizes={`${visual.width}px`}
            unoptimized
          />
        </div>
      </dialog>
    </>
  );
}
