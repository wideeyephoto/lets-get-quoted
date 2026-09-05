import { requireOfficeContext } from '@/lib/auth';
import { getMerchandiseStudioData } from './actions';
import MerchandiseDesignStudio from './MerchandiseDesignStudio';

export const metadata = {
  title: 'Business Cards & Field Forms Studio',
  description: 'Design and order commercial-grade 16pt business cards and carbonless NCR work order pads.',
};

export default async function MerchandisePage() {
  const { accountId } = await requireOfficeContext('settings.read');
  const initialData = await getMerchandiseStudioData(accountId);

  return <MerchandiseDesignStudio initialData={initialData} />;
}
