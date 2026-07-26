import styles from './themes.module.css';

// Renders the company name wrapped in .wm (so every data-wordmark treatment
// targets one short selector across all themes), with each word tagged so the
// accent-word treatments can colour it: .wmFirst / .wmMid (any inner word) /
// .wmLast. A single-word name carries both first + last so "accent first" and
// "accent last" both light it up. The classes are inert under other styles.
export default function WordmarkName({ name }: { name: string }) {
  const value = (name ?? '').trim();
  const words = value ? value.split(/\s+/) : [];

  if (words.length <= 1) {
    return <span className={styles.wm}><span className={`${styles.wmFirst} ${styles.wmLast}`}>{value}</span></span>;
  }

  const lastIndex = words.length - 1;
  return (
    <span className={styles.wm}>
      {words.map((word, index) => {
        const cls = index === 0 ? styles.wmFirst : index === lastIndex ? styles.wmLast : styles.wmMid;
        return (
          <span key={index}>
            {index > 0 ? ' ' : ''}
            <span className={cls}>{word}</span>
          </span>
        );
      })}
    </span>
  );
}
