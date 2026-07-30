import { requireOwnerContext } from '@/lib/auth';
import { bookingAvailabilityFromAccount, TIMEZONE_OPTIONS } from '@/lib/booking-availability';
import { listUpcomingBlocks } from '@/lib/availability-blocks';
import { getAvailableBookingDays } from '@/lib/booking';
import BookingSetup from './BookingSetup';

export const metadata = { title: 'Booking & availability' };

// Everything that governs the public /book page, on one screen: whether it's
// open at all, which days and arrival windows it offers, how much it will take,
// and the days you've blocked out. It used to be a form folded into the bottom
// of the schedule page, which meant reading the settings without being able to
// see what they produced.
export default async function BookingSetupPage() {
  const { supabase, accountId } = await requireOwnerContext();

  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const [{ data: account }, { data: site }, blocks] = await Promise.all([
    supabase
      .from('accounts')
      .select(
        'timezone, booking_enabled, booking_weekdays, booking_windows, booking_max_per_day, booking_lead_days, workday_start, workday_end, schedule_day_hours, job_buffer_minutes, instant_book_enabled, instant_book_min_amount, instant_book_radius_miles, instant_book_geo_mode, instant_book_drive_time',
      )
      .eq('id', accountId)
      .maybeSingle(),
    supabase.from('sites').select('published, subdomain').eq('account_id', accountId).maybeSingle(),
    listUpcomingBlocks(supabase, accountId, todayKey),
  ]);

  const availability = bookingAvailabilityFromAccount(
    account as Parameters<typeof bookingAvailabilityFromAccount>[0],
  );

  const appOrigin = (process.env.NEXT_PUBLIC_APP_URL || `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com'}`).replace(/\/$/, '');
  const bookingSubdomain = site?.published ? site?.subdomain ?? null : null;
  const bookingUrl = bookingSubdomain ? `${appOrigin}/book/${bookingSubdomain}` : null;

  // What the public page is actually offering right now — the honest version of
  // "is this working", as opposed to "is the switch on".
  const bookingDays = bookingUrl ? await getAvailableBookingDays(supabase, accountId) : [];
  const openWindowCount = bookingDays.reduce((sum, day) => sum + day.slots.length, 0);

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
      sitePublished={Boolean(site?.published)}
      openWindowCount={openWindowCount}
      openDayCount={bookingDays.length}
      timezoneOptions={TIMEZONE_OPTIONS}
      todayKey={todayKey}
    />
  );
}
