import type { Metadata } from 'next';
import SitePortalPage from '@/lib/templates/SitePortalPage';
import GlobalPortalRequestForm from './GlobalPortalRequestForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Client Portal · Find Your Jobs & Quotes',
  description: 'Look up your past work, quotes, invoices, and warranties.',
  robots: { index: false, follow: false },
};

export default function GlobalPortalPage() {
  return (
    <SitePortalPage
      accent="#2563eb"
      businessName="Client Portal"
      enabled={true}
      form={<GlobalPortalRequestForm />}
    />
  );
}
