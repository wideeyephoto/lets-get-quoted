import { DEMO_COMPANY_NAME, DEMO_SITE_HOST } from '@/lib/demo-data';
import LinkBuilderScreen from '@/app/dashboard/marketing/links/LinkBuilderScreen';

export const metadata = { title: 'Campaign Link & QR Builder — Live Demo' };

export default async function DemoMarketingLinksPage() {
  const defaultBaseUrl = 'https://' + DEMO_SITE_HOST;
  return <LinkBuilderScreen defaultBaseUrl={defaultBaseUrl} businessName={DEMO_COMPANY_NAME} basePath="/demo" />;
}
