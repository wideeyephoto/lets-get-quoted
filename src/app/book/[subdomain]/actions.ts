'use server';

import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/auth';
import { getPublicSiteBySubdomain } from '@/lib/sites';
import { normalizeUsPhone } from '@/lib/phone';
import { createBooking } from '@/lib/booking';
import { listServices } from '@/lib/services';

function labelForDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (!year || !month || !day) return dateKey;
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function labelForTime(time: string): string {
  if (time === '08:00') return 'Morning · 8:00 AM';
  if (time === '13:00') return 'Afternoon · 1:00 PM';
  return time;
}

export async function submitBookingAction(subdomain: string, formData: FormData) {
  const admin = createAdminClient();
  const site = await getPublicSiteBySubdomain(admin, subdomain);
  if (!site) redirect(`/book/${subdomain}?error=unavailable`);

  const name = (formData.get('name') ?? '').toString().trim();
  const phone = normalizeUsPhone((formData.get('phone') ?? '').toString());
  const email = (formData.get('email') ?? '').toString().trim().toLowerCase() || null;
  const address = (formData.get('address') ?? '').toString().trim() || null;
  const description = (formData.get('description') ?? '').toString().trim() || null;
  const slot = (formData.get('slot') ?? '').toString();
  const [dateKey, time] = slot.split('|');

  // Need a name, a way to reach them, and a chosen slot.
  if (!name || (!phone && !email) || !dateKey || !time) {
    redirect(`/book/${subdomain}?error=incomplete`);
  }

  // Resolve the optionally-chosen price-book service id → its name (server-side,
  // so a tampered value can't inject arbitrary text). Empty / unknown → null.
  const serviceId = (formData.get('service') ?? '').toString();
  let serviceName: string | null = null;
  if (serviceId) {
    const services = await listServices(admin, site.account_id, { activeOnly: true });
    serviceName = services.find((s) => s.id === serviceId)?.name ?? null;
  }

  await createBooking(admin, site.account_id, {
    name,
    phone,
    email,
    address,
    description,
    serviceName,
    dateKey,
    dateLabel: labelForDateKey(dateKey),
    time,
    timeLabel: labelForTime(time),
  });

  redirect(`/book/${subdomain}?booked=1`);
}
