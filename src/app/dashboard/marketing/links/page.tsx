import { requireOfficeContext } from '@/lib/auth';
import LinkBuilderScreen from './LinkBuilderScreen';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Campaign Link & QR Builder' };

export default async function LinkBuilderPage() {
  const { supabase, accountId } = await requireOfficeContext('settings.write');

  const [{ data: accountRow }, { data: siteRow }] = await Promise.all([
    supabase.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
    supabase.from('sites').select('subdomain, custom_domain, company_name').eq('account_id', accountId).maybeSingle(),
  ]);

  const businessName = (siteRow?.company_name || accountRow?.business_name || 'Your Business').trim();
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';
  
  let defaultBaseUrl = 'https://' + rootDomain;
  if (siteRow?.custom_domain) {
    defaultBaseUrl = `https://${siteRow.custom_domain}`;
  } else if (siteRow?.subdomain) {
    defaultBaseUrl = `https://${siteRow.subdomain}.${rootDomain}`;
  }

  return <LinkBuilderScreen defaultBaseUrl={defaultBaseUrl} businessName={businessName} />;
}
