/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PageCTA, SiteFooter, SiteHeader } from '@/components/flagship/site-chrome';
import type { MarketingCtaProps } from './marketing-cta';
import { APP_SIGNUP_URL, FEATURES_URL } from './links';
import styles from '@/components/flagship/flagship.module.css';

/** One cell of the proof bar under the hero. */
export type FeatureProofPoint = {
  title: string;
  body: ReactNode;
};

/** A numbered card. Used for both the benefits grid and the step sequence. */
export type FeatureDetailCard = {
  title: string;
  body: ReactNode;
};

export type FeatureDetailLayoutProps = {
  eyebrow: string;
  title: ReactNode;
  lede: ReactNode;
  heroNote?: ReactNode;
  demo?: ReactNode;
  primary?: { label: string; href?: string };
  secondary?: { label: string; href?: string } | null;
  /**
   * A third hero action, for the live demo of the thing the page is about.
   *
   * The two existing buttons are "sign up" and "read on". Neither of them is
   * "show me", which is the smallest ask on the page and the one closest to
   * what most visitors arrive wanting — and the route to it was the /demo index
   * and then the right tab.
   *
   * Deliberately absent on the pages where no demo screen IS the feature: a
   * third button that lands somewhere adjacent is worse than two, because the
   * disappointment is what the visitor remembers.
   */
  tertiary?: { label: string; href: string } | null;
  proof: FeatureProofPoint[];
  /**
   * A section between the proof strip and the story.
   *
   * There was nowhere to put a page's single strongest piece of evidence
   * except after the story, the benefits and the four steps — three sections
   * of argument in front of the thing that settles it. /features/back-office
   * had exactly that problem: the one-job-record panel is the most
   * differentiated thing on the page and it was the fourth thing you reached.
   */
  afterProof?: ReactNode;
  story: {
    eyebrow: string;
    title: ReactNode;
    body: ReactNode;
  };
  benefits: FeatureDetailCard[];
  /**
   * A section between the benefits and the steps.
   *
   * The sibling of `afterProof`, for evidence that answers the benefits rather
   * than introducing them. /features/website-builder shows a site somebody
   * actually published here: after the three things the page has just promised
   * a visitor, and before the four answers it takes to get one.
   *
   * `children` could not do it — that renders after the steps, three sections
   * further down, by which point the page has finished arguing.
   */
  afterBenefits?: ReactNode;
  stepsEyebrow?: string;
  /** Omit both to drop the section — a page whose steps only restate its story
      should not print the same argument twice. */
  stepsTitle?: ReactNode;
  steps?: FeatureDetailCard[];
  cta: Omit<MarketingCtaProps, 'variant'>;
  backLink?: { href: string; label: string } | null;
  storyId?: string;
  children?: ReactNode;
};

const DEFAULT_BACK_LINK = { href: FEATURES_URL, label: 'All features' };

/**
 * The shared shell for the five feature detail pages, in the marketing site's
 * visual language.
 *
 * WHY THIS FILE AND NOT THE FIVE PAGES. The pages pass data — eyebrow, title,
 * lede, proof, story, benefits, steps, cta — and that shape already matched the
 * source site's own detail template almost field for field. So the aesthetic
 * change lives here, once, and all five pages move without a line of their copy
 * being touched. That matters: those pages carry content the source does not
 * have (a six-stage intake flow against its four, a seven-beat Quick Stops
 * mechanism, seventeen back-office capabilities), and a rewrite would have put
 * every bit of it at risk for no reason.
 *
 * WHAT DELIBERATELY DID NOT COME ACROSS. The source's own template ships a
 * DetailVisual switch whose mocks invent a 4.9-star rating, "12 yrs
 * Experience", a LICENSED · INSURED · LOCAL badge, a per-lead "3.2 mi"
 * distance the product never computes, and a greeting using the founder's real
 * first name. All of that was removed from this codebase once already. The
 * `demo` slot stays a slot, so each page passes its own labelled panel instead.
 *
 * Chrome is the shared flagship header and footer; AppShell renders none for
 * these routes (OWN_CHROME_MARKETING_ROUTES).
 */
export default function FeatureDetailLayout({
  eyebrow,
  title,
  lede,
  heroNote,
  demo,
  primary,
  secondary,
  tertiary,
  proof,
  afterProof,
  story,
  benefits,
  afterBenefits,
  stepsEyebrow = 'BUILT INTO THE WORKFLOW',
  stepsTitle,
  steps = [],
  cta,
  backLink = DEFAULT_BACK_LINK,
  storyId = 'details',
  children,
}: FeatureDetailLayoutProps) {
  // One primary label across the whole cluster. A visitor bouncing between
  // three feature pages should see the same button each time, not three offers.
  const primaryLabel = primary?.label ?? 'Build my free site';
  const primaryHref = primary?.href ?? APP_SIGNUP_URL;
  const secondarySpec =
    secondary === null ? null : (secondary ?? { label: 'See how it works', href: `#${storyId}` });

  return (
    <main className={`${styles.root} inner-site`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <SiteHeader />

      <section className="detail-hero" id="main-content">
        <div className="detail-hero-copy">
          {backLink ? (
            <Link href={backLink.href} className="detail-back">
              <span aria-hidden="true">&larr;</span> {backLink.label}
            </Link>
          ) : null}
          <p className="eyebrow">
            <span aria-hidden="true">✦</span> {eyebrow}
          </p>
          <h1>{title}</h1>
          <p>{lede}</p>
          <div className="hero-actions">
            <a className="button primary" href={primaryHref}>
              {primaryLabel} <span aria-hidden="true">→</span>
            </a>
            {secondarySpec ? (
              <a className="button secondary" href={secondarySpec.href ?? `#${storyId}`}>
                {secondarySpec.label}
              </a>
            ) : null}
            {/* next/link would prefetch a demo route on hover from every feature
                page. It is a heavy screen and most visitors will not press it. */}
            {tertiary ? (
              <a className="button secondary" href={tertiary.href}>
                {tertiary.label}
              </a>
            ) : null}
          </div>
          {heroNote ? <p className="detail-hero-note">{heroNote}</p> : null}
        </div>

        {demo ?? null}
      </section>

      <section className="detail-proof" aria-label="What this does">
        {proof.map((point) => (
          <span key={point.title}>
            <b>{point.title}</b>
            <small>{point.body}</small>
          </span>
        ))}
      </section>

      {afterProof ?? null}

      <section className="detail-story" id={storyId}>
        <div>
          <p className="eyebrow">
            <span aria-hidden="true">✦</span> {story.eyebrow}
          </p>
          <h2>{story.title}</h2>
          <p>{story.body}</p>
        </div>
        <div className="detail-benefits">
          {benefits.map((item, index) => (
            <article key={item.title}>
              {/* The numeral is rhythm, not information — the heading already
                  carries the meaning and "01 Ask better questions" read aloud
                  is noise. */}
              <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      {afterBenefits ?? null}

      {steps.length ? (
        <section className="detail-process">
          <div className="detail-process-head">
            <p className="eyebrow">
              <span aria-hidden="true">✦</span> {stepsEyebrow}
            </p>
            <h2>{stepsTitle}</h2>
          </div>
          <div className="process-steps">
            {steps.map((item, index) => (
              <article key={item.title}>
                <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {children}

      <PageCTA title={typeof cta.title === 'string' ? cta.title : undefined} />
      <SiteFooter />
    </main>
  );
}
