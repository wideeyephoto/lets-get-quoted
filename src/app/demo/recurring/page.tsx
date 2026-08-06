import { todayDateKey } from '@/lib/recurring';
import { buildRecurringView } from '@/lib/recurring-view';
import { normalizeRecurringView } from '@/lib/dashboard-views';
import { DEMO_ACCOUNT_ID } from '@/lib/demo-data';
import { demoSupabase } from '@/lib/demo-rows';
import RecurringScreen from '@/app/dashboard/recurring/RecurringScreen';

export const metadata = { title: 'Recurring — Live Demo' };

/**
 * Repeating jobs and auto-billing, for a logged-out visitor.
 *
 * buildRecurringView runs unmodified, which is the whole point here: the
 * monthly-recurring figure, the autopay coverage, the "needs attention" count,
 * the 30/90-day workload and the visit calendar are all PROJECTED from the demo
 * plans by walking the same cadence the cron walks. The old demo page asserted
 * those numbers, and they had drifted out of agreement with each other.
 *
 * Every plan card renders with no action slots filled — see PlanActionSlots.
 * The plan, its cadence, its next visit and its billing state are all visible;
 * nothing offers to change them, because nothing here could.
 */
export default async function DemoRecurringPage() {
  const today = todayDateKey();
  const view = await buildRecurringView(demoSupabase, DEMO_ACCOUNT_ID, today);

  return (
    <RecurringScreen
      view={view}
      // The default rather than the cookie: a visitor has no saved preference,
      // and reading the owner's would let their choice leak into the public demo.
      mode={normalizeRecurringView(undefined)}
      planActions={() => ({})}
      basePath="/demo"
    />
  );
}
