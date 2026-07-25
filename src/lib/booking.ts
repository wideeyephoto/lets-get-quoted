import type { SupabaseClient } from '@supabase/supabase-js';
import { expandScheduledJobs } from '@/lib/jobs';
import { createLead, type Lead } from '@/lib/leads';
import { getAccountOwnerEmail, sendLeadNotificationEmail } from '@/lib/email';

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');

// Two offerable arrival windows per open day. Kept coarse on purpose — a
// contractor commits to a morning/afternoon, not a to-the-minute slot.
const SLOT_TEMPLATES = [
  { time: '08:00', label: 'Morning · 8:00 AM' },
  { time: '13:00', label: 'Afternoon · 1:00 PM' },
];
// A day already carrying this many scheduled jobs is treated as full.
const DAY_CAPACITY = 4;
const LOOKAHEAD_DAYS = 21;
const MAX_OFFERED_DAYS = 8;

export type BookingSlot = { time: string; label: string };
export type BookingDay = { dateKey: string; dayLabel: string; slots: BookingSlot[] };

function dateKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Open arrival windows over the next few weeks, derived from the same schedule
// data the calendar uses: weekdays that aren't at capacity, minus any window
// already taken by a scheduled job that day.
export async function getAvailableBookingDays(admin: SupabaseClient, accountId: string, scheduleDayHours: number): Promise<BookingDay[]> {
  const { data: jobs } = await admin
    .from('jobs')
    .select('scheduled_for, scheduled_time, status, estimated_hours')
    .eq('account_id', accountId)
    .not('scheduled_for', 'is', null)
    .neq('status', 'archived');

  const occurrences = expandScheduledJobs(jobs ?? [], scheduleDayHours);
  const countByDate = new Map<string, number>();
  const takenTimesByDate = new Map<string, Set<string>>();
  for (const occurrence of occurrences) {
    const key = occurrence.scheduled_for;
    countByDate.set(key, (countByDate.get(key) ?? 0) + 1);
    const time = (occurrence as { scheduled_time?: string | null }).scheduled_time;
    if (time) {
      const set = takenTimesByDate.get(key) ?? new Set<string>();
      set.add(time.slice(0, 5));
      takenTimesByDate.set(key, set);
    }
  }

  const days: BookingDay[] = [];
  const start = new Date();
  for (let offset = 1; offset <= LOOKAHEAD_DAYS && days.length < MAX_OFFERED_DAYS; offset++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset);
    const weekday = date.getDay();
    if (weekday === 0 || weekday === 6) continue; // weekends off
    const key = dateKeyOf(date);
    if ((countByDate.get(key) ?? 0) >= DAY_CAPACITY) continue;

    const taken = takenTimesByDate.get(key) ?? new Set<string>();
    const slots = SLOT_TEMPLATES.filter((slot) => !taken.has(slot.time));
    if (slots.length === 0) continue;

    days.push({
      dateKey: key,
      dayLabel: date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
      slots,
    });
  }
  return days;
}

export type BookingInput = {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  description: string | null;
  dateKey: string;
  dateLabel: string;
  time: string;
  timeLabel: string;
};

// A self-serve booking becomes a warm, pre-scheduled lead the owner confirms —
// carrying the requested window so it lands ready to put on the calendar. The
// owner is emailed like any website lead. Best-effort on the email.
export async function createBooking(admin: SupabaseClient, accountId: string, input: BookingInput): Promise<Lead> {
  const requested = `${input.dateLabel} — ${input.timeLabel}`;
  const message = `📅 Online booking request for ${requested}.${input.description ? `\n\n${input.description}` : ''}`;

  const lead = await createLead(admin, accountId, {
    source: 'website_form',
    name: input.name,
    phone: input.phone,
    email: input.email,
    address: input.address,
    projectType: 'Online booking',
    message,
    sourcePage: '/book',
    triage: { score: 'warm', flags: [], timeline: requested, contactPreference: 'any' },
  });

  try {
    const [ownerEmail, { data: account }] = await Promise.all([
      getAccountOwnerEmail(admin, accountId),
      admin.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
    ]);
    if (ownerEmail) {
      await sendLeadNotificationEmail({
        recipientEmail: ownerEmail,
        businessName: account?.business_name || "Let's Get Quoted contractor",
        lead,
        dashboardUrl: `${APP_ORIGIN}/dashboard/leads/${lead.id}`,
      });
    }
  } catch (error) {
    console.error(`Booking owner notification failed for account ${accountId}:`, error instanceof Error ? error.message : error);
  }

  return lead;
}
