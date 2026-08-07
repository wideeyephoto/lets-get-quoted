import styles from './price-zero-dial.module.css';

/**
 * The $0 dial: a circular price mark whose only job is to state the one number
 * a pricing page is about, at a size you cannot skim past.
 *
 * NOT an ExampleFrame, and that is deliberate. Every product mock on these
 * pages wraps in one because it shows invented data. This shows the actual
 * price — $0 is a claim we make, not an illustration of one — and stamping
 * "Example" on it would read as a hedge on the number itself, which is the
 * opposite of true.
 *
 * It also invents nothing. There is no rating, count, tenure or volume figure
 * here and there must never be one: the only glyphs on screen are "$", "0" and
 * whatever caption the caller passes.
 *
 * Motion: there is none. No @keyframes, no transition, no animated transform,
 * so `prefers-reduced-motion` has nothing to switch off and the component
 * honours it by construction. The absence is the answer, not an oversight —
 * the marketing pages already carry `.ambient-glow` drift, and a second
 * ambient animation behind a static number is ornament. Do not add a pulse or
 * a rotating ring.
 */
export type PriceZeroDialProps = {
  /**
   * Sizing role. `lead` is a page's hero graphic; `inline` sits beside other
   * price furniture (a tier chart, a calculator) and steps down so it does not
   * shout over them.
   */
  variant?: 'lead' | 'inline';
  /**
   * The tracked caption inside the ring. Keep it a precise noun. A bare "$0"
   * with no qualifier over-claims, because a platform fee does apply on
   * collected payments — the caption is what keeps the graphic honest.
   */
  caption?: string;
  /**
   * The whole dial as one sentence, for assistive tech. Defaults to the
   * caption phrased as a price, so the spoken text cannot drift out of sync
   * with the printed text when a caller overrides `caption` alone.
   */
  srLabel?: string;
  /** Extra class on the outer element, for grid placement by the host page. */
  className?: string;
};

/** "Monthly subscription" -> "monthly subscription", leaving acronyms alone. */
function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

export default function PriceZeroDial({
  variant = 'lead',
  caption = 'Monthly subscription',
  srLabel,
  className,
}: PriceZeroDialProps) {
  /* The two visual fragments are aria-hidden and one .sr-only sentence carries
     the meaning, so a screen reader announces "$0 monthly subscription" rather
     than three orphan fragments: "dollar", "zero", "monthly subscription".
     role="img" with a long aria-label was rejected — it swallows children and
     is announced inconsistently across NVDA and VoiceOver. Nothing here is
     interactive, so there is no focus treatment to add. */
  return (
    <div className={[styles.dial, styles[variant], className].filter(Boolean).join(' ')}>
      <p className={styles.value} aria-hidden="true">
        <span className={styles.currency}>$</span>
        <strong className={styles.zero}>0</strong>
      </p>
      <span className={styles.caption} aria-hidden="true">
        {caption}
      </span>
      <span className="sr-only">{srLabel ?? `$0 ${lowerFirst(caption)}.`}</span>
    </div>
  );
}
