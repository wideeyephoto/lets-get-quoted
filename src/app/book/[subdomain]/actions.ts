'use server';

import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/auth';
import { getPublicSiteBySubdomain } from '@/lib/sites';
import { getSiteContent, isFullyBookedActive } from '@/lib/site-content';
import { normalizeUsPhone } from '@/lib/phone';
import {
  createBooking,
  createBookingRequestLead,
  getAvailableBookingDays,
  findOfferedSlot,
  type BookingDay,
} from '@/lib/booking';
import { evaluateBookingEligibility, bookingFallbackMessage, type BookingVerdict } from '@/lib/instant-booking';
import { listServices } from '@/lib/services';

export type BookingEvaluation = {
  verdict: BookingVerdict;
  businessName: string;
  days: BookingDay[]; // populated only when eligible
  fallback: { heading: string; body: string };
};

// Server-authoritative eligibility decision, called by the estimate-first flow
// once the AI estimate is in. Combines the owner's gate (enabled + floor) with
// the site's lead filters (service area / exclusions / fully-booked). When
// eligible it returns the live availability so the client can render slots in one
// round-trip; otherwise the days list is empty and the client shows the fallback.
export async function evaluateBookingAction(
  subdomain: string,
  input: { estimateMax: number | null; inArea: boolean | null; excluded: boolean },
): Promise<BookingEvaluation | null> {
  const admin = createAdminClient();
  const site = await getPublicSiteBySubdomain(admin, subdomain);
  if (!site) return null;
  const businessName = site.company_name || 'this contractor';

  const { data: account } = await admin
    .from('accounts')
    .select('instant_book_enabled, instant_book_min_amount')
    .eq('id', site.account_id)
    .maybeSingle();
  const leadFilters = getSiteContent(site.content as Record<string, unknown>).leadFilters;

  const verdict = evaluateBookingEligibility({
    enabled: Boolean(account?.instant_book_enabled),
    minAmount: Number(account?.instant_book_min_amount) || 0,
    fullyBooked: isFullyBookedActive(leadFilters),
    estimateMax: input.estimateMax,
    inArea: input.inArea,
    excluded: input.excluded,
  });

  const days = verdict.eligible ? await getAvailableBookingDays(admin, site.account_id) : [];
  return { verdict, businessName, days, fallback: bookingFallbackMessage(verdict.tier, businessName) };
}

function readContact(formData: FormData) {
  return {
    name: (formData.get('name') ?? '').toString().trim(),
    phone: normalizeUsPhone((formData.get('phone') ?? '').toString()),
    email: (formData.get('email') ?? '').toString().trim().toLowerCase() || null,
    address: (formData.get('address') ?? '').toString().trim() || null,
    description: (formData.get('description') ?? '').toString().trim() || null,
  };
}

export async function submitBookingAction(subdomain: string, formData: FormData) {
  const admin = createAdminClient();
  const site = await getPublicSiteBySubdomain(admin, subdomain);
  if (!site) redirect(`/book/${subdomain}?error=unavailable`);

  const { name, phone, email, address, description } = readContact(formData);
  const slot = (formData.get('slot') ?? '').toString();
  const [dateKey, time] = slot.split('|');

  // Need a name, a way to reach them, and a chosen slot.
  if (!name || (!phone && !email) || !dateKey || !time) {
    redirect(`/book/${subdomain}?error=incomplete`);
  }

  // Belt-and-braces value floor: if the gate is on and the flow posted an
  // estimate that lands below the owner's floor, capture a callback lead instead
  // of a premium slot (defends against a client that skipped the client-side
  // gate). Soft by design — a booking is a request the owner still approves.
  const estimateMaxRaw = Number(formData.get('estimateMax'));
  const estimateMax = Number.isFinite(estimateMaxRaw) && estimateMaxRaw > 0 ? Math.round(estimateMaxRaw) : null;
  const { data: gate } = await admin
    .from('accounts')
    .select('instant_book_enabled, instant_book_min_amount')
    .eq('id', site.account_id)
    .maybeSingle();
  const floor = Number(gate?.instant_book_min_amount) || 0;
  if (gate?.instant_book_enabled && floor > 0 && estimateMax != null && estimateMax < floor) {
    await createBookingRequestLead(admin, site.account_id, { name, phone, email, address, description });
    redirect(`/book/${subdomain}?requested=1`);
  }

  // Never trust the posted slot. Re-derive current availability and confirm the
  // chosen day + window is genuinely on offer — this rejects tampered/arbitrary
  // dates and times and shrinks the double-book window. The matched day/slot
  // carry the server's own labels, so a client time can never be echoed in.
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

// The graceful fallback: a visitor who isn't eligible for a self-serve slot still
// leaves a warm lead for the owner to schedule by hand. Never a dead end.
export async function submitCallbackAction(subdomain: string, formData: FormData) {
  const admin = createAdminClient();
  const site = await getPublicSiteBySubdomain(admin, subdomain);
  if (!site) redirect(`/book/${subdomain}?error=unavailable`);

  const { name, phone, email, address, description } = readContact(formData);
  if (!name || (!phone && !email)) {
    redirect(`/book/${subdomain}?error=incomplete`);
  }

  await createBookingRequestLead(admin, site.account_id, { name, phone, email, address, description });
  redirect(`/book/${subdomain}?requested=1`);
}
