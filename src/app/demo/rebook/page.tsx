import { listRebookCandidates, REBOOK_DAY_OPTIONS, DEFAULT_REBOOK_DAYS } from '@/lib/rebook';
import { DEMO_ACCOUNT_ID, DEMO_SITE_HOST } from '@/lib/demo-data';
import { demoSupabase } from '@/lib/demo-rows';
import RebookScreen from '@/app/dashboard/rebook/RebookScreen';

export const metadata = { title: 'Book again — Live Demo' };

/**
 * Past customers due to be asked again, for a logged-out visitor.
 *
 * listRebookCandidates runs unmodified, so who appears — and in what order — is
 * decided by how long each customer has actually been quiet in the demo's own
 * job history. The day-window tabs work, because they are links.
 */
export default async function DemoRebookPage({ searchParams }: { searchParams: { days?: string } }) {
  const requested = Number(searchParams.days);
  const days = REBOOK_DAY_OPTIONS.includes(requested) ? requested : DEFAULT_REBOOK_DAYS;

  const candidates = await listRebookCandidates(demoSupabase, DEMO_ACCOUNT_ID, days);

  return (
    <RebookScreen
      candidates={candidates}
      // The demo's website is published, so the page shows its working state
      // rather than the "publish your booking page first" notice.
      bookingUrl={`https://${DEMO_SITE_HOST}/book`}
      days={days}
      basePath="/demo"
      readOnly
    />
  );
}
