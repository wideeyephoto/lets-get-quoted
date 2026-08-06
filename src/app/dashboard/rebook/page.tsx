import { requireOwnerContext } from '@/lib/auth';
import { listRebookCandidates, resolveRebookContext, REBOOK_DAY_OPTIONS, DEFAULT_REBOOK_DAYS } from '@/lib/rebook';
import RebookScreen from './RebookScreen';

/**
 * Past customers due to be asked again, for a signed-in owner.
 *
 * The read only — the screen is in RebookScreen so the demo renders the same
 * one.
 */
export default async function RebookPage({
  searchParams,
}: {
  searchParams: { days?: string; flash?: string; msg?: string; sent?: string; skipped?: string; failed?: string };
}) {
  const { supabase, accountId } = await requireOwnerContext();

  const requested = Number(searchParams.days);
  const days = REBOOK_DAY_OPTIONS.includes(requested) ? requested : DEFAULT_REBOOK_DAYS;

  const [{ bookingUrl }, candidates] = await Promise.all([
    resolveRebookContext(supabase, accountId),
    listRebookCandidates(supabase, accountId, days),
  ]);

  const flash = searchParams.flash ?? null;
  const flashText =
    flash === 'sent-sms'
      ? 'Booking link texted. It also shows in your Messages inbox.'
      : flash === 'sent-email'
        ? 'Booking link emailed.'
        : flash === 'batch'
          ? `Sent ${searchParams.sent ?? 0} booking link${Number(searchParams.sent) === 1 ? '' : 's'}.${Number(searchParams.skipped) > 0 ? ` ${searchParams.skipped} skipped (no contact).` : ''}${Number(searchParams.failed) > 0 ? ` ${searchParams.failed} failed.` : ''}`
          : null;

  return (
    <RebookScreen
      candidates={candidates}
      bookingUrl={bookingUrl}
      days={days}
      flashText={flashText}
      flashError={flash === 'error' ? (searchParams.msg ?? 'Could not send.') : null}
    />
  );
}
