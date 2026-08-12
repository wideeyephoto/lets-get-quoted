import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { bookingAvailabilityFromAccount } from '@/lib/booking-availability';
import { listUpcomingBlocks } from '@/lib/availability-blocks';
import { getAvailableBookingDays } from '@/lib/booking';
import { weatherSettings } from '@/lib/weather-data';
import AutomationLink from '@/components/automation-link';
import WorkingHoursPanel from '@/components/working-hours-panel';
import WeatherPanel from '../WeatherPanel';

export const metadata = { title: 'Schedule settings' };

/**
 * WHAT CONFIGURES SCHEDULING, AWAY FROM WHAT IS SCHEDULED.
 *
 * These four surfaces used to sit at the foot of /dashboard/schedule: a booking
 * link, a working-hours panel, a weather panel and a reminders switch, stacked
 * under the calendar with a heading trying to explain what they had in common.
 * They are the reason that page ran ~2,700px on a desktop and ~2,200px on a
 * phone — and none of them is something you touch while dispatching. Working
 * hours change twice a year; the calendar changes every hour.
 *
 * A PAGE RATHER THAN A DRAWER, for two reasons. A closed drawer still ships its
 * markup, its client components and its forms on every load of a screen that is
 * opened dozens of times a day. And "the schedule page, plus everything that
 * configures the schedule page, collapsed" is still one page doing two jobs —
 * the collapse hides the length without changing what the page is about.
 *
 * The map does NOT come with them. It is a route tool, it is about work that is
 * already booked, and it belongs beside the calendar it annotates.
 */
export default async function ScheduleSettingsPage() {
  const { supabase, accountId } = await requireOwnerContext();

  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const [{ data: account }, { data: site }, blocks, weather] = await Promise.all([
    supabase
      .from('accounts')
      .select(
        'schedule_day_hours, appointment_reminders_enabled, job_buffer_minutes, workday_start, workday_end, timezone, booking_enabled, booking_weekdays, booking_windows, booking_max_per_day, booking_lead_days',
      )
      .eq('id', accountId)
      .maybeSingle(),
    supabase.from('sites').select('published, subdomain').eq('account_id', accountId).maybeSingle(),
    listUpcomingBlocks(supabase, accountId, todayKey),
    // Settings only. The forecast itself is fetched on demand — two requests to
    // a free public service per location is not something to spend on a page
    // load, and that was true when this panel lived on the calendar too.
    weatherSettings(supabase, accountId),
  ]);

  const scheduleDayHours = Number(account?.schedule_day_hours) || 8;
  const jobBufferMinutes = Number((account as { job_buffer_minutes?: number } | null)?.job_buffer_minutes) || 0;
  const remindersOn = Boolean((account as { appointment_reminders_enabled?: boolean } | null)?.appointment_reminders_enabled);

  const appOrigin = (process.env.NEXT_PUBLIC_APP_URL || `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com'}`).replace(/\/$/, '');
  const bookingSubdomain = site?.published ? site?.subdomain ?? null : null;
  const bookingUrl = bookingSubdomain ? `${appOrigin}/book/${bookingSubdomain}` : null;
  const bookingDays = bookingUrl ? await getAvailableBookingDays(supabase, accountId) : [];
  const openWindowCount = bookingDays.reduce((sum, day) => sum + day.slots.length, 0);

  // booking_weekdays is a stored string, not an array — read through the same
  // normalizer the form uses so this summary cannot drift from the form.
  const bookingAvailability = bookingAvailabilityFromAccount(
    account as Parameters<typeof bookingAvailabilityFromAccount>[0],
  );
  const bookingWeekdayCount = bookingAvailability.weekdays.length;

  // Clearing every weekday is how you pause online booking, so it counts as
  // paused even though booking_enabled is still true.
  const bookingPaused = !bookingAvailability.enabled || bookingWeekdayCount === 0;
  const bookingStatus = !bookingUrl ? 'Not live' : bookingPaused ? 'Paused' : `${openWindowCount} open`;
  const bookingTone: 'neutral' | 'on' | 'warn' = !bookingUrl
    ? 'neutral'
    : bookingPaused || openWindowCount === 0
      ? 'warn'
      : 'on';

  return (
    <main className="wide-shell workspace-shell">
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          {/* The way back is a control, not the browser button. Somebody who
              arrived here from the calendar is mid-task on the calendar. */}
          <Link className="sched-settings-back" href="/dashboard/schedule">
            <span aria-hidden="true">←</span> Job calendar
          </Link>
          <h1 className="workspace-title">Schedule settings</h1>
          <p className="workspace-lead">
            What decides when a day is full, which days customers can book, and who gets told what. None of it changes
            day to day — the calendar is where the work is.
          </p>
        </div>
      </section>

      <Link className="schedule-setup-link" href="/dashboard/schedule/booking" id="booking-availability">
        <span className="schedule-setup-link-copy">
          <span className="eyebrow">Setup</span>
          <strong>Online booking</strong>
          <span>
            {bookingStatus === 'Not live'
              ? 'Publish your website to let customers book themselves.'
              : bookingPaused
                ? 'Online booking is paused — no days are open.'
                : `${bookingWeekdayCount} day${bookingWeekdayCount === 1 ? '' : 's'} a week · ${openWindowCount} open window${openWindowCount === 1 ? '' : 's'} · ${blocks.length} day${blocks.length === 1 ? '' : 's'} blocked off`}
          </span>
        </span>
        <span className={`schedule-setup-pill tone-${bookingTone}`}>{bookingStatus}</span>
        <span className="schedule-setup-go" aria-hidden="true">→</span>
      </Link>

      {/* The four numbers that decide when a day is full. Condensed: the summary
          states them, so checking costs no clicks and only changing opens. */}
      <WorkingHoursPanel
        scheduleDayHours={scheduleDayHours}
        jobBufferMinutes={jobBufferMinutes}
        workdayStart={(account as { workday_start?: string } | null)?.workday_start ?? null}
        workdayEnd={(account as { workday_end?: string } | null)?.workday_end ?? null}
      />

      <WeatherPanel enabled={weather.enabled} profile={weather.sensitivity.label} />

      <div className="sched-settings-row">
        <AutomationLink id="reminders" label="Appointment reminders" on={remindersOn} />
      </div>
    </main>
  );
}
