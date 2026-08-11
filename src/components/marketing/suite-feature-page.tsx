import type { ReactNode } from 'react';
import FeatureDetailLayout, {
  type FeatureDetailCard,
  type FeatureProofPoint,
} from './feature-detail-layout';
import { FEATURE_CATEGORIES } from '@/lib/features';
import styles from './suite-feature-page.module.css';

/**
 * The shell for the seven suite pages the homepage links at.
 *
 * WHY A SECOND SHELL AND NOT SEVEN COPIES OF THE FIRST. Every one of these
 * pages is the same shape — a hero, a panel showing the thing, the argument,
 * and then the list of what the product actually does in that area. The five
 * flagship pages each earn their bespoke sections because each one demonstrates
 * something different (a live intake, a job record, a conversation). These
 * seven do not; what they need is to be accurate, and accuracy is much easier
 * to keep in one place.
 *
 * THE CAPABILITY LIST IS NOT WRITTEN HERE. It is read out of lib/features.ts,
 * which is the catalog /features and the homepage grid already render, so a
 * feature that is renamed, added or removed changes these pages with them. This
 * is the same rule the fee numbers follow: the page reads the source of truth
 * rather than restating it. A page that restates a catalog is a page that will
 * eventually describe a product that no longer exists.
 *
 * What each page DOES write for itself is the argument — hero, story, benefits,
 * steps, the panel and the questions. Those are judgements about what matters,
 * and they do not belong in a data file.
 */

export type SuiteFaq = { q: string; a: ReactNode };

export type SuiteFeaturePageProps = {
  eyebrow: string;
  title: ReactNode;
  lede: ReactNode;
  heroNote?: ReactNode;
  /** Short reassurance chips, above the actions. See FeatureDetailLayout. */
  heroChips?: string[];
  demo?: ReactNode;
  /** The contextual "show me" action — usually this feature's live demo screen.
   *  See FeatureDetailLayout for why it is not sign-up. */
  primary?: { label: string; href?: string };
  /** Signing up, quietly. Defaults to "Start free". There is no third action. */
  secondary?: { label: string; href?: string } | null;
  proof: FeatureProofPoint[];
  story: { eyebrow: string; title: ReactNode; body: ReactNode };
  benefits: FeatureDetailCard[];
  /**
   * A section between the benefits and the steps. See FeatureDetailLayout.
   *
   * `children` could not do it: that renders after the capability list, by
   * which point the page has finished arguing. /features/quotes needs it for
   * the real screenshots of the quote builder — evidence that answers the
   * three promises above it, not a coda after the catalog.
   */
  afterBenefits?: ReactNode;
  stepsEyebrow?: string;
  stepsTitle?: ReactNode;
  steps?: FeatureDetailCard[];
  cta: { title: string; note?: ReactNode };
  /**
   * Slugs from FEATURE_CATEGORIES, in the order they should read.
   *
   * More than one is allowed and is sometimes the honest answer: "Reviews +
   * growth" on the homepage is two categories in the catalog, and pretending
   * otherwise would either drop half the features or invent a category that
   * does not exist in the product.
   */
  catalog: string[];
  catalogEyebrow: string;
  catalogTitle: ReactNode;
  catalogNote: ReactNode;
  faq: SuiteFaq[];
  /** Extra sections, between the capability list and the questions. */
  children?: ReactNode;
};

/**
 * The capability section, on its own so a page that is not a suite page can
 * still show one.
 *
 * /features/website-builder is the case that forced this out: it is a flagship
 * page with its own structure, and the video studio's catalog entries would
 * otherwise have raised a count on /pricing and appeared in no list anywhere.
 * A catalog nothing renders is a catalog nobody maintains.
 */
export function CapabilitySection({
  catalog,
  eyebrow,
  title,
  note,
  id = 'capabilities',
}: {
  catalog: string[];
  eyebrow: string;
  title: ReactNode;
  note: ReactNode;
  id?: string;
}) {
  const groups = catalog.map((slug) => {
    const group = FEATURE_CATEGORIES.find((category) => category.slug === slug);
    // Loud rather than silent. A typo here would otherwise render a page whose
    // whole second half is missing, and nothing else would notice.
    if (!group) throw new Error(`page names a feature category that does not exist: ${slug}`);
    return group;
  });
  const count = groups.reduce((total, group) => total + group.features.length, 0);
  const total = FEATURE_CATEGORIES.reduce((n, g) => n + g.features.length, 0);

  return (
    <section className="section-block" id={id} aria-labelledby={`${id}-title`}>
      <div className={styles.head}>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={`${id}-title`}>{title}</h2>
        <p>{note}</p>
      </div>

      {groups.map((group) => (
        <div key={group.slug} className={styles.group}>
          <div className={styles.groupHead}>
            <h3>{group.title}</h3>
            {/* The count is decoration for a sighted reader and noise read
                aloud — the list underneath is already a list. */}
            <span aria-hidden="true">{String(group.features.length).padStart(2, '0')}</span>
          </div>
          <p className={styles.groupIntro}>{group.intro}</p>
          <ul className={styles.list}>
            {group.features.map((feature) => (
              <li key={feature.id}>
                <strong>{feature.name}</strong>
                <span>{feature.desc}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <p className={styles.total}>
        {count} of the {total} things the platform does.{' '}
        <a href="/features">See all of them</a>.
      </p>
    </section>
  );
}

export default function SuiteFeaturePage({
  catalog,
  catalogEyebrow,
  catalogTitle,
  catalogNote,
  faq,
  children,
  ...layout
}: SuiteFeaturePageProps) {
  return (
    <FeatureDetailLayout {...layout}>
      <CapabilitySection
        catalog={catalog}
        eyebrow={catalogEyebrow}
        title={catalogTitle}
        note={catalogNote}
      />

      {children}

      {/* <details>, not a script: it works before hydration, is in the tab order
          for free, and the browser's own find-in-page opens it. No `name` — an
          exclusive accordion closes the answer you were reading and hides every
          other one from find-in-page. */}
      <section className="section-block" aria-labelledby="faq-title">
        <div className={styles.head}>
          <p className="eyebrow">Before you start</p>
          <h2 id="faq-title">The practical questions.</h2>
        </div>
        <div className={styles.faq}>
          {faq.map((item, index) => (
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
    </FeatureDetailLayout>
  );
}

/* ---------------------------------------------------------------------------
   The panel primitives.

   Every one of these pages needs to SHOW the thing rather than assert it, and
   seven bespoke mock components would be seven times the surface for a claim to
   drift on. These four cover all seven panels between them, so what each page
   supplies is the words — which are the part that has to be true.
   --------------------------------------------------------------------------- */

/** The body of a mock, inside an ExampleFrame. */
export function Panel({ children }: { children: ReactNode }) {
  return <div className={styles.panel}>{children}</div>;
}

/** A title line with an optional status pill on the right. */
export function PanelHead({ title, pill, tone = 'plain' }: { title: string; pill?: string; tone?: 'plain' | 'good' | 'flag' }) {
  return (
    <div className={styles.panelHead}>
      <p>{title}</p>
      {pill ? <span className={styles[tone === 'good' ? 'pillGood' : tone === 'flag' ? 'pillFlag' : 'pill']}>{pill}</span> : null}
    </div>
  );
}

/** Label on the left, value on the right — money, dates, names. */
export function PanelRows({ rows }: { rows: { label: ReactNode; value: ReactNode; strong?: boolean }[] }) {
  return (
    <dl className={styles.rows}>
      {rows.map((row, index) => (
        <div key={index} className={row.strong ? styles.rowStrong : undefined}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A caveat or a mechanism, set apart from the numbers above it. */
export function PanelNote({ children }: { children: ReactNode }) {
  return <p className={styles.panelNote}>{children}</p>;
}

/** Controls the mock only depicts — spans, so they take no tab stop. */
export function PanelActions({ labels }: { labels: string[] }) {
  return (
    <div className={styles.actions}>
      {labels.map((label) => (
        <span key={label}>{label}</span>
      ))}
    </div>
  );
}
