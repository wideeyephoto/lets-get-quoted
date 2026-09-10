import { requireOfficeContext } from '@/lib/auth';
import { getMerchandiseStudioData } from './actions';
import CardPurchaseScreen from './CardPurchaseScreen';

export const metadata = {
  title: 'Business Cards & Field Essentials',
  description: 'Instant contractor business card purchasing with dynamic booking QR codes fulfilled via Printful.',
};

export default async function MerchandisePage() {
  const { accountId } = await requireOfficeContext('settings.read');
  const initialData = await getMerchandiseStudioData(accountId);

  return <CardPurchaseScreen initialData={initialData} />;
}
