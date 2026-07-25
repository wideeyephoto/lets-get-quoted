import { NextResponse } from 'next/server';
import { runAppointmentReminders } from '@/lib/reminders';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Daily sweep (scheduled in vercel.json) that reminds clients the day before a
// scheduled job — texting an opted-in mobile, emailing otherwise. Opt-in per
// account. Same CRON_SECRET auth as the other crons.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await runAppointmentReminders();
    return NextResponse.json(summary);
  } catch (error) {
    console.error('Appointment reminders cron failed:', error);
    return NextResponse.json({ error: 'Reminder run failed' }, { status: 500 });
  }
}
