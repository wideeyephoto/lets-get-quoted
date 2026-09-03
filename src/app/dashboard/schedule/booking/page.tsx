import { requireOfficeContext } from '@/lib/auth';
import { bookingAvailabilityFromAccount, TIMEZONE_OPTIONS } from '@/lib/booking-availability';
import { listUpcomingBlocks } from '@/lib/availability-blocks';
import { getAvailableBookingDays } from '@/lib/booking';
import { loadOwnerAlerts } from '@/lib/owner-sms';
import { todayIn } from '@/lib/quote-options';
import BookingSetup from './BookingSetup';

export const metadata = { title: 'Booking requests' };

// Everything that governs the public /book page, on one screen: whether it's
// open at all, which days and arrival windows it offers, how much it will take,
// and the days you've blocked out. It used to be a form folded into the bottom
// of the schedule page, which meant reading the settings without being able to
// see what they produced.
export default async function BookingSetupPage() {
  const { supabase, accountId } = await requireOfficeContext('schedule.write');

  const [{ data: account }, { data: site }, { data: dedicatedSender }, ownerAlerts] = await Promise.all([
    supabase
      .from('accounts')
      .select(
        'timezone, booking_enabled, booking_weekdays, booking_windows, booking_window_minutes, booking_max_per_day, booking_lead_days, workday_start, workday_end, schedule_day_hours, job_buffer_minutes, instant_book_enabled, instant_book_min_amount, instant_book_radius_miles, instant_book_geo_mode, instant_book_drive_time, alert_phone',
      )
      .eq('id', accountId)
      .maybeSingle(),
    supabase.from('sites').select('published, subdomain').eq('account_id', accountId).maybeSingle(),
    supabase
      .from('sms_sender_numbers')
      .select('e164_number')
      .eq('account_id', accountId)
      .eq('purpose', 'contractor_dedicated')
      .eq('provisioning_status', 'active')
      .is('suspended_at', null)
      .limit(1)
      .maybeSingle(),
    loadOwnerAlerts(accountId),
  ]);

  const availability = bookingAvailabilityFromAccount(
    account as Parameters<typeof bookingAvailabilityFromAccount>[0],
  );
  const todayKey = todayIn(availability.timezone);

  const appOrigin = (process.env.NEXT_PUBLIC_APP_URL || `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com'}`).replace(/\/$/, '');
  const bookingSubdomain = site?.published ? site?.subdomain ?? null : null;
  const bookingUrl = bookingSubdomain ? `${appOrigin}/book/${bookingSubdomain}` : null;

  // What the public page is actually offering right now — the honest version of
  // "is this working", as opposed to "is the switch on".
  const [blocks, bookingDays] = await Promise.all([
    listUpcomingBlocks(supabase, accountId, todayKey),
    bookingUrl ? getAvailableBookingDays(supabase, accountId) : Promise.resolve([]),
  ]);
  const openWindowCount = bookingDays.reduce((sum, day) => sum + day.slots.length, 0);
  // The dates themselves, not just how many. The preview strip used to re-derive
  // them in the browser from weekdays, lead time and blocks alone, so it showed
  // days this engine had already taken off the table for being at their limit or
  // fully taken.
  // The times come along too. Keeping the day and dropping its slots left the
  // preview half server-truth and half local config: the strip highlighted the
  // Monday the engine offered, and the list beside it led with a Morning the
  // engine had already ruled out on that day, green check and all.
  const bookableDays = bookingDays.map((day) => ({
    dateKey: day.dateKey,
    dayLabel: day.dayLabel,
    times: day.slots.map((slot) => slot.time),
  }));

  return (
    <BookingSetup
      availability={availability}
      instantBook={{
        enabled: Boolean(account?.instant_book_enabled),
        minAmount: account?.instant_book_min_amount ? Number(account.instant_book_min_amount) : 0,
        radiusMiles: account?.instant_book_radius_miles ? Number(account.instant_book_radius_miles) : 15,
        geoMode: account?.instant_book_geo_mode === 'restrict' ? 'restrict' : 'prefer',
        driveTime: Boolean(account?.instant_book_drive_time),
      }}
      blocks={blocks}
      bookingUrl={bookingUrl}
      openWindowCount={openWindowCount}
      bookableDays={bookableDays}
      timezoneOptions={TIMEZONE_OPTIONS}
      todayKey={todayKey}
      ownerAlerts={ownerAlerts.kind === 'ok' ? ownerAlerts : null}
      alertPhone={account?.alert_phone ?? null}
      dedicatedPhone={dedicatedSender?.e164_number ?? null}
    />
  );
}
