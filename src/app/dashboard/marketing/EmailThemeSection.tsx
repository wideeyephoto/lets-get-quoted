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
    audience: 'account',
    preheader: `${props.businessName} daily digest`,
    eyebrow: 'Daily digest',
    heading: 'Your business today',
    paragraphs: ['Friday, August 14'],
    bodyHtml: `
      <p style="margin:22px 0 4px;color:#b45309;font-weight:700;letter-spacing:0.04em;font-size:12px">MONEY</p>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:8px 0;color:#4b5563;font-size:15px">Payments received</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#059669">2 &middot; $1,250</td></tr>
        <tr><td style="padding:8px 0;color:#4b5563;font-size:15px">Awaiting payment</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#172033">14 &middot; $46,300</td></tr>
      </table>
      <p style="margin:22px 0 4px;color:#b45309;font-weight:700;letter-spacing:0.04em;font-size:12px">PIPELINE</p>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:8px 0;color:#4b5563;font-size:15px">New leads</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#059669">4</td></tr>
        <tr><td style="padding:8px 0;color:#4b5563;font-size:15px">Quotes approved</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#059669">2</td></tr>
      </table>
      <p style="margin:22px 0 4px;color:#b45309;font-weight:700;letter-spacing:0.04em;font-size:12px">TODAY&rsquo;S SCHEDULE &middot; 1 JOB</p>
      <p style="margin:0 0 6px;font-size:15px;color:#172033"><strong>11:45 AM</strong> &middot; Preston Voss <span style="color:#9ca3af">JOB-29</span></p>
    `,
    cta: { label: 'Open your dashboard', url: 'https://example.com/dashboard' },
  });
}

function ThemePicker(props: Props) {
  const selected = normalizeEmailTheme(props.currentTheme);

  return (
    <>
      <p className={`workspace-details-copy ${styles.intro}`}>
        Customer quotes, invoices, reminders, campaigns, and contractor account alerts like the daily digest all
        use one consistent layout. Every option keeps your logo and business color; customer replies still go to
        your saved reply address.
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
    </>
  );
}

export default function EmailThemeSection(props: Props) {
  return (
    <section className="panel workspace-section-card" id="email-theme">
      <div className="section-heading workspace-section-heading compact-heading">
        <p className="eyebrow">Outgoing email</p>
        <h2>Choose your email look</h2>
      </div>
      <ThemePicker {...props} />
    </section>
  );
}
