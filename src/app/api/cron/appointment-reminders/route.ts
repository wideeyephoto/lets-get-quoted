import { cronRoute } from '@/lib/cron-runs';
import { runAppointmentReminders } from '@/lib/reminders';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Daily sweep (scheduled in vercel.json) that reminds clients the day before a
// scheduled job — texting an opted-in mobile, emailing otherwise. Opt-in per
// account.
export const GET = cronRoute('appointment-reminders', runAppointmentReminders);
