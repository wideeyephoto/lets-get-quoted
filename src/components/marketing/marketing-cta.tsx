import type { ReactNode } from 'react';
import { CtaLink, DEMO_URL, type CtaLinkSpec } from './links';
import styles from './marketing-cta.module.css';

/**
 * The closing call to action every marketing page ends with.
 *
 * Deliberately thin: the band, the centring, the button shapes and the focus
 * ring all already exist in globals as .cta-band / .cta-band-inner / .actions /
 * .btn. This component's job is to make sure nine pages end the same way and
 * that the primary action always points at the app, never at a page-local
 * guess.
 */
export type MarketingCtaProps = {
  /**
   * Small uppercase line above the heading. Rendered with globals' .eyebrow.
   * Defaults to the source draft's, which every page but the founder page
   * inherited there.
   */
  kicker?: string;
  /** The heading. An `<h2>`; pass a fragment to accent part of it. */
  title: ReactNode;
  /** One or two sentences under the heading. Defaults to the source draft's. */
  body?: ReactNode;
  /**
   * Label on the primary button. Defaults to "Build my free site" — the source
   * draft's one primary label, used in every position on every page, and the
   * reason the default lives here rather than being retyped per page.
   */
  buttonLabel?: string;
  /**
   * Overrides the primary button entirely. `href` defaults to the app sign-up
   * URL, so passing only a label is the normal case — and `buttonLabel` is the
   * shorthand for exactly that.
   */
  primary?: CtaLinkSpec;
  /**
   * The second, quieter button. Defaults to the demo. Pass `null` for a
   * single-action band.
   */
  secondary?: CtaLinkSpec | null;
  /** Footnote under the buttons — the fee reassurance, usually. */
  note?: ReactNode;
  /**
   * `band` (default) is the full closing band. `inline` is a mid-page nudge
   * with no chrome, built on globals' .mid-cta row.
   */
  variant?: 'band' | 'inline';
  /** Extra class on the outer `<section>`. */
  className?: string;
  /** Anchor target. */
  id?: string;
};

const DEFAULT_SECONDARY: CtaLinkSpec = {
  label: 'Explore the demo — no signup',
  href: DEMO_URL,
};

/* The source draft's closing band, verbatim. It supplied the kicker and body as
   defaults and let each page pass only its own title; seven of its nine pages
   took them unchanged, so they are defaults here too rather than seven copies. */
const DEFAULT_KICKER = 'The full contractor suite is ready';
const DEFAULT_BODY = 'Create your site, qualify better leads and run every job from one place.';

export default function MarketingCta({
  kicker = DEFAULT_KICKER,
  title,
  body = DEFAULT_BODY,
  buttonLabel = 'Build my free site',
  primary,
  secondary = DEFAULT_SECONDARY,
  note,
  variant = 'band',
  className,
  id,
}: MarketingCtaProps) {
  const primarySpec: CtaLinkSpec = primary ?? { label: buttonLabel };

  const buttons = (
    <>
      <CtaLink spec={primarySpec} className="btn primary" />
      {secondary ? <CtaLink spec={secondary} className="btn secondary" /> : null}
    </>
  );

  if (variant === 'inline') {
    return (
      <section id={id} className={[styles.inline, className].filter(Boolean).join(' ')}>
        {kicker ? <p className="eyebrow">{kicker}</p> : null}
        <h2 className={styles.inlineTitle}>{title}</h2>
        {body ? <p className={styles.inlineBody}>{body}</p> : null}
        <div className="mid-cta">{buttons}</div>
        {note ? <p className={styles.note}>{note}</p> : null}
      </section>
    );
  }

  return (
    <section id={id} className={['cta-band', className].filter(Boolean).join(' ')}>
      <div className="cta-band-inner">
        {kicker ? <p className="eyebrow">{kicker}</p> : null}
        <h2>{title}</h2>
        {body ? <p>{body}</p> : null}
        <div className="actions">{buttons}</div>
        {note ? <p className={styles.note}>{note}</p> : null}
      </div>
    </section>
  );
}
