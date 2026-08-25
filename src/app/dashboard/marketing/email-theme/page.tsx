import Link from 'next/link';
import { requireOfficeContext } from '@/lib/auth';
import { pickBusinessName } from '@/lib/business-name';
import EmailThemeSection from '../EmailThemeSection';
import MarketingNav from '../MarketingNav';
import { sendTestEmailThemeAction, updateEmailThemeAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Email appearance' };

export default async function MarketingEmailThemePage() {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
  const [{ data: site }, { data: account }, { data: userData }] = await Promise.all([
    supabase
      .from('sites')
      .select('company_name, accent_override, logo_url, email_theme, template')
      .eq('account_id', accountId)
      .maybeSingle(),
    supabase.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
    supabase.auth.getUser(),
  ]);

  return (
    <main className="wide-shell workspace-shell">
      <MarketingNav />
      <header className="workspace-header-compact">
        <p className="mkt-crumb"><Link href="/dashboard/marketing">← Marketing overview</Link></p>
        <p className="eyebrow">Outgoing email</p>
        <h1 className="workspace-title">Email appearance</h1>
        <p className="workspace-lead">Preview what customers receive across quotes, invoices, reminders and campaigns, then choose your theme.</p>
      </header>
      <EmailThemeSection
        businessName={pickBusinessName(site, account, 'Your business')}
        accent={(site?.accent_override as string | null) ?? null}
        logoUrl={(site?.logo_url as string | null) ?? null}
        currentTheme={(site?.email_theme as string | null) ?? null}
        websiteTemplate={(site?.template as string | null) ?? null}
        userEmail={userData?.user?.email ?? null}
        saveAction={updateEmailThemeAction}
        sendTestAction={sendTestEmailThemeAction}
      />
    </main>
  );
}
