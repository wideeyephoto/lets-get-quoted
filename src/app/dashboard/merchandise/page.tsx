import { getMerchandiseStudioDataAction } from './actions';
import MerchandiseDesignStudio from './MerchandiseDesignStudio';

export const metadata = {
  title: 'Business Cards & Field Forms Studio',
  description: 'Design and order commercial-grade 16pt business cards and carbonless NCR work order pads.',
};

export default async function MerchandisePage() {
  const res = await getMerchandiseStudioDataAction();

  const initialData = res.ok && res.data ? res.data : {
    companyName: 'Let’s Get Quoted',
    trade: 'General Contractor',
    tagline: 'Precision Workmanship & Trusted Service',
    phone: '(555) 234-5678',
    website: 'www.letsgetquoted.com',
    license: 'LIC #109482',
    accentColor: '#2563eb',
    secondaryColor: '#f59e0b',
    currentLogoUrl: null,
    aiLogos: [],
    recentOrders: [],
  };

  return <MerchandiseDesignStudio initialData={initialData} />;
}
