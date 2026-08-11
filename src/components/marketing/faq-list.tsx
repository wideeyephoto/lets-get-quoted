import type { ReactNode } from 'react';
import styles from './suite-feature-page.module.css';

/**
 * The questions section, extracted so a page outside the suite shell can have
 * one.
 *
 * /features/client-portal is a bespoke FeatureDetailLayout page and had NO
 * questions at all — on the one subject where a contractor has the most of
 * them. "A link, not a login" is its whole pitch, and the immediate reaction is
 * "so anyone with that link can see my customer's address and what they paid?"
 * Answering that needed the same markup the seven suite pages already render,
 * and the choice was to copy twenty lines of JSX and a stylesheet, or to lift
 * the thing that existed. This is the second one.
 *
 * <details>, not a script: it works before hydration, is in the tab order for
 * free, and the browser's own find-in-page opens it. No `name` — an exclusive
 * accordion closes the answer you were reading and hides every other one from
 * find-in-page.
 */

export type FaqItem = { q: string; a: ReactNode };

export default function FaqList({
  items,
  eyebrow = 'Before you start',
  title = 'The practical questions.',
  id = 'faq',
}: {
  items: FaqItem[];
  eyebrow?: string;
  title?: ReactNode;
  id?: string;
}) {
  if (items.length === 0) return null;

  return (
    <section className="section-block" aria-labelledby={`${id}-title`}>
      <div className={styles.head}>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={`${id}-title`}>{title}</h2>
      </div>
      <div className={styles.faq}>
        {items.map((item, index) => (
          <details key={item.q} open={index === 0}>
            <summary>
              <span>{item.q}</span>
              <i aria-hidden="true" />
            </summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
