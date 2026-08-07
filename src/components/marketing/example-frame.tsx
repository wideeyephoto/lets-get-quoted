import type { ReactNode } from 'react';
import styles from './example-frame.module.css';

/**
 * Wraps a product mock and says so.
 *
 * Every panel on the marketing pages shows invented data — a made-up job, a
 * made-up homeowner, a made-up dollar figure. Left unmarked, a screenshot-like
 * panel reads as a real account, and a number a visitor believes is real is a
 * claim we have not actually made. So the marker is not decoration: no mock
 * ships without one.
 *
 * It is a `<figure>` with a real `<figcaption>`, so the description is attached
 * to the panel for a screen reader instead of floating above it, and the badge
 * is legible text in the flow rather than a watermark.
 */
export type ExampleFrameProps = {
  /**
   * What the panel is showing, in plain words — "a scored lead as it arrives",
   * "a job portal as the homeowner sees it". Rendered as the caption and read
   * out with the figure. Required: an unlabelled example is barely better than
   * an unmarked one.
   */
  label: ReactNode;
  /** Optional line under the panel for a caveat or a pointer. */
  note?: ReactNode;
  /**
   * `card` (default) draws the border, padding and elevated ground.
   * `plain` draws none of it — use when the child already has its own card
   * chrome (HeroDashboard, QuickStopPanel, the map components).
   */
  variant?: 'card' | 'plain';
  /** Text of the marker itself. Defaults to "Example". */
  badgeLabel?: string;
  /** Extra class on the outer `<figure>`. */
  className?: string;
  /** Anchor target, when a CTA elsewhere on the page points at the mock. */
  id?: string;
  children: ReactNode;
};

export default function ExampleFrame({
  label,
  note,
  variant = 'card',
  badgeLabel = 'Example',
  className,
  id,
  children,
}: ExampleFrameProps) {
  return (
    <figure id={id} className={[styles.frame, className].filter(Boolean).join(' ')}>
      <figcaption className={styles.head}>
        <span className={styles.badge}>{badgeLabel}</span>
        <span className={styles.label}>{label}</span>
      </figcaption>
      <div className={variant === 'plain' ? styles.plain : styles.card}>{children}</div>
      {note ? <p className={styles.note}>{note}</p> : null}
    </figure>
  );
}
