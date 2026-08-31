import Image from 'next/image';
import type { ReactNode } from 'react';
import styles from './real-proof.module.css';

/**
 * A SCREEN FROM THE RUNNING PRODUCT, on a page that has been describing it.
 *
 * Every feature page argues in prose and then draws its evidence by hand: an
 * ExampleFrame containing divs shaped like software, honestly labelled as an
 * example. Those explain the mechanism well and they are the right tool for
 * showing a thing that has no single screen — a lifecycle, a fee split, a text
 * thread. What none of them is, is proof. A reader who wants to know whether
 * this software exists cannot learn it from a drawing of it.
 *
 * Eight 2160x1350 captures of the real product were already in /public/features
 * — ai-smart-intake, client-esignature, hosted-website, online-booking,
 * payment-plans, recurring-plans, review-routing, stripe-payments — shipped in
 * the bundle and rendered on no page. This is the component that puts them on
 * one.
 *
 * WHAT THIS IS NOT. It is not a customer story, and it deliberately cannot
 * pretend to be one. See `CustomerProof` at the foot of this file: it renders
 * nothing at all until somebody supplies a real contractor, which is the only
 * honest behavior for a component whose entire job is to be believed.
 */

export type RealProofProps = {
  /** File under /public/features, without the extension. */
  image: string;
  /** Alt text. Describe the screen, not the feature — this is evidence. */
  alt: string;
  /** The eyebrow. Short, and true. */
  eyebrow?: string;
  /** What the reader is looking at, in the caption under it. */
  caption: ReactNode;
  /**
   * The claim this screen settles. One sentence, and it must be about the
   * SCREEN — "this is where the signature is recorded" — rather than a second
   * go at the page's pitch.
   */
  title: ReactNode;
  /** The narrower of the two layouts, for a section that already has a panel. */
  compact?: boolean;
  /** Intrinsic size, so next/image reserves the right box and nothing shifts. */
  width?: number;
  height?: number;
  id?: string;
};

export default function RealProof({
  image,
  alt,
  eyebrow = 'The actual screen',
  caption,
  title,
  compact = false,
  width = 2160,
  height = 1350,
  id,
}: RealProofProps) {
  return (
    <section className={`section-block ${styles.wrap}${compact ? ` ${styles.compact}` : ''}`} id={id}>
      <div className={styles.copy}>
        <p className="eyebrow">
          <span aria-hidden="true">✦</span> {eyebrow}
        </p>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.caption}>{caption}</p>
      </div>

      <figure className={styles.shot}>
        {/* Not `priority`. Every one of these sits below the fold on the page
            it appears on, and preloading a 2160px capture ahead of the hero is
            how a proof section makes the page it is proving feel slower. */}
        <Image
          src={`/features/${image}.jpg`}
          alt={alt}
          width={width}
          height={height}
          sizes="(max-width: 900px) 100vw, 60vw"
          loading="lazy"
          quality={80}
          className={styles.img}
        />
      </figure>
    </section>
  );
}

/* ---------------------------------------------------------------------------
   THE SLOT FOR A REAL CUSTOMER, WHICH IS EMPTY.

   Every page here would be stronger with a named contractor, their site and an
   outcome. We do not have one we can stand behind: the five published sites in
   the database are test accounts — "My Business", "BIGFATPIPEGUYS", a landscaper
   whose account is named after a fencing company — and there is no testimonial
   anyone has given permission to quote and no measured result to report.

   So this renders NOTHING until it is given a story. Not a placeholder, not a
   greyed-out card, not "trusted by contractors like you". A page that has no
   proof should look like a page that has no proof; the alternative is the one
   thing that would cost us every other honest claim on it.

   To fill it: a contractor's name, their published site URL, one sentence in
   their own words, and permission. Everything else this component needs it can
   read from the site itself.
   --------------------------------------------------------------------------- */

export type CustomerStory = {
  /** The business, as they write it. */
  business: string;
  /** Their trade, in their words. */
  trade: string;
  /** Their live site. Linked, because a link is the checkable part. */
  siteUrl: string;
  /** One sentence, theirs, quoted verbatim. */
  quote: string;
  /** Who said it. A person, not "the team". */
  attribution: string;
  /**
   * A number, only if it was measured. Optional on purpose — a story with no
   * metric is still proof, and a metric nobody counted is not.
   */
  result?: { figure: string; label: string };
};

export function CustomerProof({ story }: { story?: CustomerStory | null }) {
  if (!story) return null;

  return (
    <section className={`section-block ${styles.wrap} ${styles.customer}`}>
      <div className={styles.copy}>
        <p className="eyebrow">
          <span aria-hidden="true">✦</span> A contractor using this
        </p>
        <blockquote className={styles.quote}>&ldquo;{story.quote}&rdquo;</blockquote>
        <p className={styles.attribution}>
          {story.attribution} · {story.business} · {story.trade}
        </p>
        <p className={styles.caption}>
          {/* rel="noopener" and a real link: the site being reachable is the
              part that makes this proof rather than a claim. */}
          <a href={story.siteUrl} target="_blank" rel="noopener noreferrer">
            Their site, built with this →
          </a>
        </p>
      </div>
      {story.result ? (
        <div className={styles.result}>
          <strong>{story.result.figure}</strong>
          <span>{story.result.label}</span>
        </div>
      ) : null}
    </section>
  );
}
