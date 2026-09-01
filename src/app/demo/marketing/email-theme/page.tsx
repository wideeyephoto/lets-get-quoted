import Link from 'next/link';
import { DEMO_COMPANY_NAME } from '@/lib/demo-data';
import { DEMO_SITE_ROW } from '@/lib/demo-rows';
import EmailThemeSection from '@/app/dashboard/marketing/EmailThemeSection';
import MarketingNav from '@/app/dashboard/marketing/MarketingNav';

export const metadata = { title: 'Email appearance — Live Demo' };

export default async function DemoMarketingEmailThemePage() {
  return (
    <main className="wide-shell workspace-shell">
      <MarketingNav basePath="/demo" />
      <header className="workspace-header-compact">
        <p className="mkt-crumb"><Link href="/demo/marketing">← Marketing overview</Link></p>
        <p className="eyebrow">Outgoing email · Live Demo</p>
        <h1 className="workspace-title">Email appearance</h1>
        <p className="workspace-lead">Preview what customers receive across quotes, invoices, reminders and campaigns, then choose your theme.</p>
      </header>
      <EmailThemeSection
        businessName={DEMO_COMPANY_NAME}
        accent={null}
        logoUrl={null}
        currentTheme={(DEMO_SITE_ROW.email_theme as string | null) ?? 'studio'}
        websiteTemplate="fresh"
        userEmail="dana@evergreenlawn.com"
        replyToEmail="office@evergreenlawn.com"
      />
    </main>
  );
}
