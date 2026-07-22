import type { SiteHowItWorksContent } from '@/lib/site-content';
import styles from './themes.module.css';

// Numbered "how it works" steps. Rendered once from SiteContentSections. Uses an
// <ol> so the sequence is conveyed to assistive tech; the visible number badge
// is decorative. Accent-tinted, currentColor text — adapts to any template.
export default function SiteProcess({ title, intro, steps }: Pick<SiteHowItWorksContent, 'title' | 'intro' | 'steps'>) {
  return (
    <section className={styles.extraSection} data-reveal id="how-it-works">
      <div className={styles.extraSectionHeader}>
        <p className={styles.kicker}>How it works</p>
        <h2>{title}</h2>
        {intro && <p>{intro}</p>}
      </div>
      <ol className={styles.processGrid}>
        {steps.map((step, index) => (
          <li key={step.id} className={styles.processStep}>
            <span className={styles.processNum} aria-hidden="true">{index + 1}</span>
            <h3>{step.title}</h3>
            {step.description && <p>{step.description}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
