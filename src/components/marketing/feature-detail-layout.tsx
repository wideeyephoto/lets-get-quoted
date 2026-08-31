/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PageCTA, SiteFooter, SiteHeader } from '@/components/flagship/site-chrome';
import type { MarketingCtaProps } from './marketing-cta';
import { APP_SIGNUP_URL, FEATURES_URL, SECONDARY_SIGNUP_LABEL } from './links';
import { breadcrumbJsonLd, HOME_CRUMB, type Crumb } from '@/lib/seo/breadcrumbs';
import { cspNonce } from '@/lib/csp-nonce';
import styles from '@/components/flagship/flagship.module.css';
import LaunchBanner from '@/components/marketing/launch-banner';

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
  /**
   * This page's own crumb, for the Home › Features › … trail in search
   * results. Optional only so an unfinished page still compiles; every one of
   * the twelve live feature routes passes it.
   */
  breadcrumb?: Crumb;
  eyebrow: string;
  title: ReactNode;
  lede: ReactNode;
  /**
   * A sentence of reassurance, under the buttons, for somebody who has read
   * them and hesitated. Prose — the fee mechanics, what Stripe holds, what the
   * product will not do.
   */
  heroNote?: ReactNode;
  /**
   * The short "· separated" kind of reassurance — "Website included · No card ·
   * No monthly subscription" — which is not prose and was being set as though
   * it were, four lines under the button it qualifies.
   *
   * Rendered ABOVE the actions, as chips. The distinction is worth a second
   * prop: this is read BEFORE deciding whether to press, and heroNote is read
   * after deciding not to.
   */
  heroChips?: string[];
  demo?: ReactNode;
  /**
   * THE ONE ACTION THIS PAGE IS FOR.
   *
   * On a capability page that is "show me the thing" — Open the live calendar,
   * Try the quote builder, Open the live crew screen. It is not sign-up: eight
   * of these pages used to lead with "Build my free site" while selling
   * payments, scheduling or crew management, which answers a question the
   * reader did not ask.
   */
  primary?: { label: string; href?: string };
  /**
   * Signing up, quietly. Defaults to "Start free" at the app's signup route —
   * pass a spec to override, or null on a page where a second action would be
   * noise.
   *
   * There is no third. Eleven of the twelve feature pages offered three, which
   * is not a choice so much as an invitation to make none: a demo, a sign-up
   * and a jump link, all at once, all competing.
   */
  secondary?: { label: string; href?: string } | null;
  /**
   * The four-cell cream strip under the hero.
   *
   * OPTIONAL, like `story` and `steps`, and for the same reason a page can earn
   * its way out of those. On /features/quick-stops the hero IS the explanation —
   * a simulation the visitor takes part in — and four summary cards bolted to
   * the bottom of it read as a second section joined to the first, so the panel
   * stopped appearing to end where it ends. Omit it and the hero runs straight
   * into the story band, which carries its own spacing.
   */
  proof?: FeatureProofPoint[];
  /**
   * A section between the hero and the proof strip — the first thing under the
   * fold.
   *
   * For a page whose evidence IS the pitch. /features/website-builder shows a
   * real published site: the whole argument is "look at what it makes", and it
   * sat below the proof strip, the story and the benefits — 3,124px down on a
   * phone, with the video itself at 3,566px. Three and a half screens of
   * telling somebody about a thing they could have been shown.
   *
   * Use `afterProof` instead when the evidence answers the proof points rather
   * than replacing them.
   */
  afterHero?: ReactNode;
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
  /**
   * The cream band: one argument on the left, a grid of benefit cards on the
   * right.
   *
   * OPTIONAL, because a page can earn its way out of it. On
   * /features/website-builder the three cards were "look established", "answer
   * how much", "receive a request you can act on" — which is the hero's promise,
   * and then the customer-journey section's four beats, said a third time in
   * between them. Omitting both drops the band; a page that omits only one gets
   * the other on its own.
   */
  story?: {
    eyebrow: string;
    title: ReactNode;
    body: ReactNode;
  };
  benefits?: FeatureDetailCard[];
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
  /**
   * One line under the step cards, for the qualifier that belongs to all of
   * them rather than to any one — "Everything remains editable before and after
   * you publish." Repeated inside each card it is padding; repeated in a
   * section of its own it is a section.
   */
  stepsNote?: ReactNode;
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
export default async function FeatureDetailLayout({
  breadcrumb,
  eyebrow,
  title,
  lede,
  heroNote,
  heroChips,
  demo,
  primary,
  secondary,
  proof = [],
  afterHero,
  afterProof,
  story,
  benefits = [],
  afterBenefits,
  stepsEyebrow = 'BUILT INTO THE WORKFLOW',
  stepsTitle,
  steps = [],
  stepsNote,
  cta,
  backLink = DEFAULT_BACK_LINK,
  storyId = 'details',
  children,
}: FeatureDetailLayoutProps) {
  /* TWO ACTIONS, AND THE FIRST ONE BELONGS TO THIS PAGE.
     The old default was "Build my free site" for anything that did not override
     it, which is how a page about crew scheduling came to lead with an offer of
     a website. There is no default primary now — a page that does not say what
     its own action is falls back to signing up, and that fallback is a signal
     the page has not decided rather than a template doing it for them. */
  const primaryLabel = primary?.label ?? 'Build my free site';
  const primaryHref = primary?.href ?? APP_SIGNUP_URL;
  const secondarySpec =
    secondary === null ? null : (secondary ?? { label: SECONDARY_SIGNUP_LABEL, href: APP_SIGNUP_URL });

  const nonce = await cspNonce();

  return (
    <main className={`${styles.root} inner-site`}>
      {/* Home › Features › this page, so a result for one of these twelve
          shows where it sits instead of a bare /features/<slug>. */}
      {breadcrumb ? (
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(
              breadcrumbJsonLd([HOME_CRUMB, { name: 'Features', path: FEATURES_URL }, breadcrumb]),
            ),
          }}
        />
      ) : null}
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <SiteHeader />
      <LaunchBanner offsetHeader />

      <section className="detail-hero" id="main-content">
        <i className="glare" data-on="true" aria-hidden="true" />
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
          {heroChips?.length ? (
            <ul className="detail-hero-chips">
              {heroChips.map((chip) => (
                <li key={chip}>{chip}</li>
              ))}
            </ul>
          ) : null}
          <div className="hero-actions">
            <a className="button primary" href={primaryHref}>
              {primaryLabel} <span aria-hidden="true">→</span>
            </a>
            {/* next/link is deliberately not used for either: the signup host
                is external, and a demo route is a heavy screen that should not
                be prefetched on hover from every feature page. */}
            {secondarySpec ? (
              <a className="button secondary" href={secondarySpec.href ?? `#${storyId}`}>
                {secondarySpec.label}
              </a>
            ) : null}
          </div>
          {heroNote ? <p className="detail-hero-note">{heroNote}</p> : null}
        </div>

        {demo ?? null}
      </section>

      {afterHero ?? null}

      {proof.length ? (
        <section className="detail-proof" aria-label="What this does">
          {proof.map((point) => (
            <span key={point.title}>
              <b>{point.title}</b>
              <small>{point.body}</small>
            </span>
          ))}
        </section>
      ) : null}

      {afterProof ?? null}

      {story || benefits.length ? (
        <section className="detail-story" id={storyId}>
          <i className="glare" data-tone="cream" data-on="true" aria-hidden="true" />
          {story ? (
            <div>
              <p className="eyebrow">
                <span aria-hidden="true">✦</span> {story.eyebrow}
              </p>
              <h2>{story.title}</h2>
              <p>{story.body}</p>
            </div>
          ) : null}
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
      ) : null}

      {afterBenefits ?? null}

      {steps.length ? (
        <section className="detail-process">
          <i className="glare" data-on="true" aria-hidden="true" />
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
          {stepsNote ? <p className="detail-process-note">{stepsNote}</p> : null}
        </section>
      ) : null}

      {children}

      {/* The band takes strings only — it renders them into its own heading and
          eyebrow, and a page passing a fragment gets the band's default rather
          than markup in a place that cannot hold it. */}
      <PageCTA
        kicker={typeof cta.kicker === 'string' ? cta.kicker : undefined}
        title={typeof cta.title === 'string' ? cta.title : undefined}
        body={typeof cta.body === 'string' ? cta.body : undefined}
      />
      <SiteFooter />
    </main>
  );
}
