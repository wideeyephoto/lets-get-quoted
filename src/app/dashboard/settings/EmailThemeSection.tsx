import SaveButton from '@/components/save-button';
import {
  EMAIL_THEMES,
  normalizeEmailTheme,
  renderBrandedEmail,
  safeAccent,
  type EmailBrand,
  type EmailThemeId,
} from '@/emails/brand';
import styles from './EmailThemeSection.module.css';

type Props = {
  businessName: string;
  accent: string | null;
  logoUrl: string | null;
  currentTheme: string | null | undefined;
  saveAction?: (formData: FormData) => Promise<void>;
};

function previewHtml(theme: EmailThemeId, props: Pick<Props, 'businessName' | 'accent' | 'logoUrl'>): string {
  const brand: EmailBrand = {
    businessName: props.businessName,
    accent: safeAccent(props.accent),
    logoUrl: props.logoUrl,
    phone: '(555) 014-2837',
    siteUrl: 'https://yourbusiness.com',
    replyTo: 'hello@yourbusiness.com',
    theme,
  };

  return renderBrandedEmail({
    brand,
    preheader: 'Quote #1048 is ready to review',
    eyebrow: 'Quote #1048',
    heading: 'Dana, your quote is ready',
    paragraphs: [
      'Front yard cleanup · $1,850',
      'Review the details and approve online — no login needed.',
    ],
    cta: { label: 'View & approve quote', url: 'https://example.com/quote' },
  });
}

export default function EmailThemeSection(props: Props) {
  const selected = normalizeEmailTheme(props.currentTheme);

  return (
    <section className="panel workspace-section-card" id="email-theme">
      <div className="section-heading workspace-section-heading compact-heading">
        <p className="eyebrow">Customer emails</p>
        <h2>Choose your email look</h2>
      </div>
      <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
        Quotes, invoices, reminders, booking updates, review requests, and campaigns all use one consistent
        layout. Every option keeps your logo, business color, contact details, and reply address.
      </p>

      <form action={props.saveAction}>
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Email theme</legend>
          <div className={styles.grid}>
            {EMAIL_THEMES.map((theme) => (
              <label className={styles.card} key={theme.id}>
                <input
                  className={styles.radio}
                  type="radio"
                  name="emailTheme"
                  value={theme.id}
                  defaultChecked={theme.id === selected}
                />
                <span className={styles.cardTop}>
                  <span>
                    <strong>{theme.name}</strong>
                    {theme.id === 'studio' ? <em>Recommended</em> : null}
                  </span>
                  <span className={styles.check} aria-hidden="true">✓</span>
                </span>
                <span className={styles.preview} aria-hidden="true">
                  <iframe
                    className={styles.iframe}
                    srcDoc={previewHtml(theme.id, props)}
                    title={`${theme.name} email preview`}
                    tabIndex={-1}
                    sandbox=""
                  />
                </span>
                <span className={styles.description}>{theme.description}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className={styles.actions}>
          <p>{props.saveAction
            ? 'New emails use the saved theme immediately. Past messages stay unchanged.'
            : 'Pick any card to compare it. Your real account saves this choice for future emails.'}</p>
          {props.saveAction ? <SaveButton onlyWhenChanged>Save email theme</SaveButton> : null}
        </div>
      </form>
    </section>
  );
}
