import { redirect } from 'next/navigation';

// Hours & pay moved inside Crew & Labor. Kept as a redirect rather than deleted:
// this path is in browser histories, bookmarks and the odd emailed link, and a
// 404 on the page someone opens to pay their crew is a bad way to find out the
// navigation changed.
export default async function PayrollRedirect({ searchParams: searchParamsPromise }: { searchParams: Promise<{ period?: string }> }) {
  const searchParams = (await searchParamsPromise) || {};
  // The old page's four periods were quick filters, and two of them were
  // months. Map them onto the new mode+offset so an old link lands on the same
  // range rather than on whatever "this week" happens to be.
  const legacy: Record<string, string> = {
    'this-week': 'period=weekly&offset=0',
    'last-week': 'period=weekly&offset=-1',
    'this-month': 'period=monthly&offset=0',
    'last-month': 'period=monthly&offset=-1',
  };
  const suffix = searchParams.period && legacy[searchParams.period] ? `&${legacy[searchParams.period]}` : '';
  redirect(`/dashboard/crew?tab=hours${suffix}`);
}
