'use server';

import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/auth';
import { getPublicSiteBySubdomain } from '@/lib/sites';
import { normalizeUsPhone } from '@/lib/phone';
import { createBooking, getAvailableBookingDays, findOfferedSlot } from '@/lib/booking';
import { listServices } from '@/lib/services';

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

  // Never trust the posted slot. Re-derive current availability and confirm the
  // chosen day + window is genuinely on offer — this rejects tampered/arbitrary
  // dates and times (past days, weekends, full days, off-template times) and
  // shrinks the window where two people grab the same slot. The matched day/slot
  // carry the server's own labels, so a client-supplied time can never be echoed
  // into the booking record.
  const availableDays = await getAvailableBookingDays(admin, site.account_id);
  const offered = findOfferedSlot(availableDays, dateKey, time);
  if (!offered) {
    redirect(`/book/${subdomain}?error=slot_taken`);
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
    dateLabel: offered.day.dayLabel,
    time,
    timeLabel: offered.slot.label,
  });

  redirect(`/book/${subdomain}?booked=1`);
}
