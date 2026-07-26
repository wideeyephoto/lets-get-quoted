import styles from './themes.module.css';

// Renders the company name with its first word wrapped in .wmFirst, so the
// "Accent first word" wordmark treatment can colour it — CSS ::first-letter can
// only reach a single letter. A single-word name is treated as one word (the
// whole name accents). The span is inert under every other wordmark style.
export default function WordmarkName({ name }: { name: string }) {
  const value = name ?? '';
  const spaceIndex = value.indexOf(' ');
  if (spaceIndex === -1) {
    return <span className={styles.wmFirst}>{value}</span>;
  }
  return (
    <>
      <span className={styles.wmFirst}>{value.slice(0, spaceIndex)}</span>
      {value.slice(spaceIndex)}
    </>
  );
}
