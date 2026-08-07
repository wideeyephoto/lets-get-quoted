import Link from 'next/link';
import type { ReactNode } from 'react';
import SiteFooter from '@/components/site-footer';
import StickyCta from '@/components/sticky-cta';
import MarketingCta, { type MarketingCtaProps } from './marketing-cta';
import MarketingHeader from './marketing-header';
import { APP_SIGNUP_URL, CtaLink, FEATURES_URL, type CtaLinkSpec } from './links';
import { MARKETING_MAIN_ID, MARKETING_PAGE_CLASS } from './marketing-page';
import styles from './feature-detail-layout.module.css';

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
  /** Uppercase kicker above the headline. */
  eyebrow: string;
  /**
   * The page's one `<h1>`. Accepts a fragment: `<em>` inside it is rendered
   * upright in gold, and `<span className="gradient-text">` gets the animated
   * treatment from globals.
   */
  title: ReactNode;
  /** The paragraph under the headline. */
  lede: ReactNode;
  /** Small reassurance line under the hero buttons. */
  heroNote?: ReactNode;

  /**
   * The product demonstration for the hero — wrap it in `<ExampleFrame>`.
   * Omit and the hero runs full width.
   */
  demo?: ReactNode;

  /** Primary hero button. `href` defaults to the app sign-up URL. */
  primary?: CtaLinkSpec;
  /**
   * Secondary hero button. Defaults to an anchor down to the story section.
   * Pass `null` for a single-action hero.
   */
  secondary?: CtaLinkSpec | null;

  /** The four-up bar under the hero. */
  proof: FeatureProofPoint[];

  /** The "why this matters" block, and the benefits grid beside it. */
  story: {
    eyebrow: string;
    title: ReactNode;
    body: ReactNode;
  };
  benefits: FeatureDetailCard[];

  /** The step sequence: kicker, the bridge line as its heading, then the steps. */
  stepsEyebrow?: string;
  stepsTitle: ReactNode;
  steps: FeatureDetailCard[];

  /** The closing band. `variant` is fixed by the layout. */
  cta: Omit<MarketingCtaProps, 'variant'>;

  /** Back to the features index. Pass `null` to drop it. */
  backLink?: { href: string; label: string } | null;

  /** Anchor id on the story section — the hero's default secondary points here. */
  storyId?: string;

  /**
   * Extra sections, rendered between the steps and the closing band. Use
   * globals' `.section-block` so they match the rest of the page.
   */
  children?: ReactNode;
};

const DEFAULT_BACK_LINK = { href: FEATURES_URL, label: 'All features' };

function NumberedCards({
  items,
  listClassName,
  ordered,
}: {
  items: FeatureDetailCard[];
  listClassName: string;
  /** Steps are a sequence and get an `<ol>`; benefits are a set and get a `<ul>`. */
  ordered: boolean;
}) {
  const className = `${styles.cardList} ${listClassName}`;
  const cards = items.map((item, index) => (
    <li key={item.title} className={styles.card}>
      {/* The numeral is a visual rhythm, not information: the list element
          already carries the order, and "01 Describe the work" read aloud is
          noise. */}
      <span className={styles.num} aria-hidden="true">
        {String(index + 1).padStart(2, '0')}
      </span>
      <h3 className={styles.cardTitle}>{item.title}</h3>
      <p className={styles.cardBody}>{item.body}</p>
    </li>
  ));

  return ordered ? <ol className={className}>{cards}</ol> : <ul className={className}>{cards}</ul>;
}

/**
 * The shared shell for the five feature detail pages.
 *
 * Every page has the same spine — hero with a live product panel, a proof bar,
 * a "why this matters" block with a benefits grid, a numbered step sequence,
 * and a closing band — so the spine lives once, here, and the pages supply only
 * their copy and their demonstration.
 *
 * The chrome is entirely this app's: `.marketing-shell`, `.hero-grid`,
 * `.hero-copy`, `.section-block`, `.eyebrow`, `.btn`, `.cta-band`, the ambient
 * glows and the sticky mobile CTA. AppShell renders NO chrome for these routes
 * (OWN_CHROME_MARKETING_ROUTES in src/components/app-shell.tsx), so the shared
 * MarketingHeader is rendered here — otherwise these five pages would ship with
 * no site navigation at all.
 */
export default function FeatureDetailLayout({
  eyebrow,
  title,
  lede,
  heroNote,
  demo,
  primary,
  secondary,
  proof,
  story,
  benefits,
  stepsEyebrow = 'Built into the workflow',
  stepsTitle,
  steps,
  cta,
  backLink = DEFAULT_BACK_LINK,
  storyId = 'details',
  children,
}: FeatureDetailLayoutProps) {
  // "Build my free site" is the source draft's one primary label, on every page
  // and in every position. Keeping it identical across the cluster is the point:
  // a visitor who bounces between three feature pages should be looking at the
  // same button each time, not three different offers.
  const primarySpec: CtaLinkSpec = primary ?? { label: 'Build my free site' };
  const secondarySpec =
    secondary === null ? null : (secondary ?? { label: 'See how it works', href: `#${storyId}` });

  return (
    <>
      <MarketingHeader current={FEATURES_URL} />

      <main className={MARKETING_PAGE_CLASS} id={MARKETING_MAIN_ID}>
        <div className="ambient-glow ambient-glow-a" aria-hidden="true" />
        <div className="ambient-glow ambient-glow-b" aria-hidden="true" />

        <div className="marketing-shell">
          {backLink ? (
            <Link href={backLink.href} className={styles.backLink}>
              <span aria-hidden="true">&larr;</span> {backLink.label}
            </Link>
          ) : null}

          <section className="hero-grid" aria-labelledby="feature-title">
            <div className="hero-copy">
              <p className="eyebrow">{eyebrow}</p>
              <h1 id="feature-title" className={styles.title}>
                {title}
              </h1>
              <p className={styles.lede}>{lede}</p>
              <div className="actions">
                <CtaLink spec={primarySpec} className="btn primary" arrow />
                {secondarySpec ? <CtaLink spec={secondarySpec} className="btn secondary" /> : null}
              </div>
              {heroNote ? <p className={styles.heroNote}>{heroNote}</p> : null}
            </div>

            {demo ? <div className={styles.heroDemo}>{demo}</div> : null}
          </section>

          <ul className={styles.proof} aria-label="What this does">
            {proof.map((point) => (
              <li key={point.title} className={styles.proofItem}>
                <span className={styles.proofTitle}>{point.title}</span>
                <span className={styles.proofBody}>{point.body}</span>
              </li>
            ))}
          </ul>

          <section className="section-block" id={storyId} aria-labelledby="feature-story-title">
            <div className={styles.storyGrid}>
              <div className={styles.storyIntro}>
                <p className="eyebrow">{story.eyebrow}</p>
                <h2 id="feature-story-title">{story.title}</h2>
                <p>{story.body}</p>
              </div>
              <NumberedCards items={benefits} listClassName={styles.benefitList} ordered={false} />
            </div>
          </section>

          <section className="section-block" aria-labelledby="feature-steps-title">
            <div className={styles.stepsHead}>
              <p className="eyebrow">{stepsEyebrow}</p>
              <h2 id="feature-steps-title">{stepsTitle}</h2>
            </div>
            <NumberedCards items={steps} listClassName={styles.stepList} ordered />
          </section>

          {children}

          <MarketingCta {...cta} />

          <SiteFooter />
        </div>

        <StickyCta href={APP_SIGNUP_URL} label="Build my free site" />
      </main>
    </>
  );
}
