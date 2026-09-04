import { redirect } from 'next/navigation';

export default async function MarketingMerchandiseRedirectPage() {
  redirect('/dashboard/merchandise');
}
