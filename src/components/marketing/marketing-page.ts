import styles from './marketing-page.module.css';

/**
 * The class every marketing page in the cluster puts on its `<main>`.
 *
 * `fx-page` is globals' own page ground. The second half is a local hook that
 * carries the keyboard focus ring globals' scoped selectors miss — see the note
 * at the top of marketing-page.module.css.
 */
export const MARKETING_PAGE_CLASS = `fx-page ${styles.page}`;

/** The skip-link target. The header links to it; each `<main>` carries it. */
export const MARKETING_MAIN_ID = 'main-content';
