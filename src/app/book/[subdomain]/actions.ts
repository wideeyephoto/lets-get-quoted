'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/auth';
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit';
import { getPublicSiteBySubdomain } from '@/lib/sites';
import { getSiteContent, isFullyBookedActive } from '@/lib/site-content';
import { normalizeUsPhone } from '@/lib/phone';
import {
  createBooking,
  createBookingRequestLead,
  getAvailableBookingDays,
  findOfferedSlot,
  claimBookingHold,
  type BookingDay,
} from '@/lib/booking';
import { expandScheduledJobs } from '@/lib/jobs';
import { geocodeAddress } from '@/lib/geocode';
import { coordOf, nearestMiles, type LatLng } from '@/lib/distance';
import { driveDistances } from '@/lib/drive-time';
import { rankByProximity, type RankedBookingDay } from '@/lib/route-density';
import { evaluateBookingEligibility, bookingFallbackMessage, normalizeGeoMode, type BookingVerdict } from '@/lib/instant-booking';
import { listServices } from '@/lib/services';
import { extraStopSettingsFromAccount, EXTRA_STOP_SETTINGS_COLUMNS } from '@/lib/extra-stop';
import { qualifyExtraStop, qualifyOptionsFromSettings } from '@/lib/extra-stop-qualify';
import { createExtraStopRequest, hasActiveExtraStopRequest } from '@/lib/extra-stop-requests';
import { uploadLeadPhoto } from '@/lib/lead-photo-storage';

export type ExtraStopSubmitResult =
  | { ok: true }
  | { ok: false; unsafe?: boolean; safety?: string | null; error: string };

export type BookingEvaluation = {
  verdict: BookingVerdict;
  businessName: string;
  days: RankedBookingDay[]; // populated only when eligible; `nearby` from route-density
  fallback: { heading: string; body: string };
};

// Server-authoritative eligibility decision, called by the estimate-first flow
// once the AI estimate is in. Combines the owner's gate (enabled + floor) with
// the site's lead filters (service area / exclusions / fully-booked). When
// eligible it returns the live availability so the client can render slots in one
// round-trip; otherwise the days list is empty and the client shows the fallback.
export async function evaluateBookingAction(
  subdomain: string,
  input: { estimateMax: number | null; inArea: boolean | null; excluded: boolean; address: string | null },
): Promise<BookingEvaluation | null> {
  const admin = createAdminClient();
  const site = await getPublicSiteBySubdomain(admin, subdomain);
  if (!site) return null;
  const businessName = site.company_name || 'this contractor';

  const { data: account } = await admin
    .from('accounts')
    .select('instant_book_enabled, instant_book_min_amount, instant_book_radius_miles, instant_book_geo_mode, instant_book_drive_time, schedule_day_hours')
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

  let days: RankedBookingDay[] = [];
  if (verdict.eligible) {
    const plain = await getAvailableBookingDays(admin, site.account_id);
    days = await rankNearby(admin, site.account_id, plain, input.address, {
      radiusMiles: Number(account?.instant_book_radius_miles) || 15,
      mode: normalizeGeoMode(account?.instant_book_geo_mode),
      scheduleDayHours: Number(account?.schedule_day_hours) || 8,
      driveTime: Boolean(account?.instant_book_drive_time),
    });
  }
  return { verdict, businessName, days, fallback: bookingFallbackMessage(verdict.tier, businessName) };
}

// Rank/annotate the open days by proximity to the contractor's existing same-day
// stops (route-density). Geocodes the lead address (precise-only) and gathers
// anchor jobs; when either is missing it degrades to plain availability with no
// proximity claim (cold start), so a customer is never stranded.
async function rankNearby(
  admin: ReturnType<typeof createAdminClient>,
  accountId: string,
  days: BookingDay[],
  address: string | null,
  opts: { radiusMiles: number; mode: 'prefer' | 'restrict'; scheduleDayHours: number; driveTime: boolean },
): Promise<RankedBookingDay[]> {
  if (days.length === 0) return [];
  const geo = await geocodeAddress(address);
  const leadCoord = geo?.precise ? { lat: geo.lat, lng: geo.lng } : null;
  if (!leadCoord) return days.map((day) => ({ ...day, nearby: false }));

  const { data: anchorJobs } = await admin
    .from('jobs')
    .select('scheduled_for, estimated_hours, status, lat, lng')
    .eq('account_id', accountId)
    .not('scheduled_for', 'is', null)
    .neq('status', 'archived')
    .not('lat', 'is', null);

  const anchorsByDate = new Map<string, LatLng[]>();
  for (const occ of expandScheduledJobs(anchorJobs ?? [], opts.scheduleDayHours)) {
    const coord = coordOf(occ);
    if (!coord) continue;
    const list = anchorsByDate.get(occ.scheduled_for) ?? [];
    list.push(coord);
    anchorsByDate.set(occ.scheduled_for, list);
  }

  // Optional drive-time refinement: one batched Distance Matrix call over the
  // unique anchor points. Null on any failure ⇒ we simply keep haversine.
  const key = (c: LatLng) => `${c.lat},${c.lng}`;
  let driveByPoint: Map<string, { miles: number; minutes: number }> | null = null;
  if (opts.driveTime) {
    const unique = new Map<string, LatLng>();
    for (const list of anchorsByDate.values()) for (const c of list) unique.set(key(c), c);
    const points = [...unique.values()];
    const results = await driveDistances(leadCoord, points);
    if (results) {
      driveByPoint = new Map();
      points.forEach((point, index) => {
        const r = results[index];
        if (r) driveByPoint!.set(key(point), r);
      });
    }
  }

  const nearestByDate = new Map<string, number>();
  const minutesByDate = new Map<string, number>();
  for (const [dateKey, anchors] of anchorsByDate) {
    if (anchors.length === 0) continue;
    // Prefer drive distance when we have it for this day's anchors.
    if (driveByPoint) {
      let bestMiles: number | null = null;
      let bestMinutes = 0;
      for (const c of anchors) {
        const r = driveByPoint.get(key(c));
        if (r && (bestMiles === null || r.miles < bestMiles)) {
          bestMiles = r.miles;
          bestMinutes = r.minutes;
        }
      }
      if (bestMiles !== null) {
        nearestByDate.set(dateKey, bestMiles);
        minutesByDate.set(dateKey, bestMinutes);
        continue;
      }
    }
    const straight = nearestMiles(leadCoord, anchors);
    if (straight !== null) nearestByDate.set(dateKey, straight);
  }

  return rankByProximity({
    days,
    hasLocation: true,
    nearestByDate,
    minutesByDate,
    radiusMiles: opts.radiusMiles,
    mode: opts.mode,
  });
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
  const ip = clientIpFrom(headers());
  if (!(await checkRateLimit(admin, `book:ip:${ip}`, 10, 60))) {
    redirect(`/book/${subdomain}?error=busy`);
  }
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

  // Race guard: claim an exclusive short hold so two simultaneous visitors can't
  // both pass the check above and double-book the same window.
  const held = await claimBookingHold(admin, site.account_id, dateKey, time);
  if (!held) {
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

// Create an Extra Stop request from the public Book flow. Called with JS (not a
// form redirect) so the client can render the verdict inline. ALWAYS re-runs the
// qualification server-side — the client verdict is advisory and never trusted:
// an unsafe or ineligible job cannot be forced through by a tampered request.
// Returns a small serializable result; never throws to the caller.
export async function submitExtraStopRequestAction(formData: FormData): Promise<ExtraStopSubmitResult> {
  try {
    const admin = createAdminClient();
    const ip = clientIpFrom(headers());
    // Burns paid AI + geocoding + accepts photo uploads — cap per IP.
    if (!(await checkRateLimit(admin, `extrastop:ip:${ip}`, 8, 60))) {
      return { ok: false, error: 'Too many requests — please wait a minute and try again.' };
    }
    const subdomain = (formData.get('subdomain') ?? '').toString();
    const site = await getPublicSiteBySubdomain(admin, subdomain);
    if (!site) return { ok: false, error: 'This booking link is unavailable.' };

    const { data: accountRow } = await admin
      .from('accounts')
      .select(`${EXTRA_STOP_SETTINGS_COLUMNS}, business_name`)
      .eq('id', site.account_id)
      .maybeSingle();
    const settings = extraStopSettingsFromAccount(accountRow as Parameters<typeof extraStopSettingsFromAccount>[0]);
    if (!settings.available) return { ok: false, error: 'Extra Stop isn’t available right now.' };

    const name = (formData.get('name') ?? '').toString().trim();
    const phone = normalizeUsPhone((formData.get('phone') ?? '').toString());
    const email = (formData.get('email') ?? '').toString().trim().toLowerCase() || null;
    const address = (formData.get('address') ?? '').toString().trim() || null;
    const issue = (formData.get('issue') ?? '').toString().trim();
    const startedWhen = (formData.get('startedWhen') ?? '').toString().trim() || null;
    const worsening = (formData.get('worsening') ?? '').toString().trim() || null;
    const propertyType = (formData.get('propertyType') ?? '').toString().trim() || null;
    const availability = (formData.get('availability') ?? '').toString().trim() || null;

    if (!name || (!phone && !email)) return { ok: false, error: 'Add your name and a phone or email so we can reach you.' };
    if (!issue) return { ok: false, error: 'Describe the issue first.' };

    // Photos are validated by type/size inside uploadLeadPhoto; count is gated here.
    const files = formData.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0);
    if (settings.requiredPhotos > 0 && files.length < settings.requiredPhotos) {
      return { ok: false, error: `Please attach at least ${settings.requiredPhotos} photo${settings.requiredPhotos === 1 ? '' : 's'} of the issue.` };
    }

    // Duplicate guard before doing any real work.
    if (await hasActiveExtraStopRequest(admin, site.account_id, phone, email)) {
      return { ok: false, error: 'You already have an Extra Stop request in progress with this contractor.' };
    }

    // Server-authoritative qualification. Unsafe ⇒ safety copy, never a booking.
    const qualification = await qualifyExtraStop(
      { issue, startedWhen: startedWhen ?? '', worsening: worsening ?? '', propertyType: propertyType ?? '', availability: availability ?? '', businessName: site.company_name || '', serviceArea: site.service_area ?? '' },
      qualifyOptionsFromSettings(settings),
    );
    if (qualification.unsafe) return { ok: false, unsafe: true, safety: qualification.safety, error: 'This needs urgent attention, not an online booking.' };
    if (!qualification.eligible) return { ok: false, error: qualification.reason || 'This job isn’t a fit for an Extra Stop. You can request a regular booking instead.' };

    // Upload photos (best-effort per file) and geocode the address (precise-only).
    const photoPaths: string[] = [];
    for (const file of files.slice(0, 6)) {
      try {
        photoPaths.push(await uploadLeadPhoto(site.account_id, file));
      } catch (error) {
        console.error('Extra Stop photo upload failed:', error instanceof Error ? error.message : error);
      }
    }
    const geo = await geocodeAddress(address);

    await createExtraStopRequest(
      admin,
      site.account_id,
      { name, phone, email, address, issue, startedWhen, worsening, propertyType, availability, photoPaths },
      qualification,
      {
        responseDeadlineMins: settings.responseDeadlineMins,
        lat: geo?.precise ? geo.lat : null,
        lng: geo?.precise ? geo.lng : null,
        businessName: (accountRow as { business_name?: string } | null)?.business_name || site.company_name || 'your contractor',
      },
    );

    return { ok: true };
  } catch (error) {
    console.error('submitExtraStopRequestAction failed:', error instanceof Error ? error.message : error);
    return { ok: false, error: 'Something went wrong creating your request. Please try again.' };
  }
}

// The graceful fallback: a visitor who isn't eligible for a self-serve slot still
// leaves a warm lead for the owner to schedule by hand. Never a dead end.
export async function submitCallbackAction(subdomain: string, formData: FormData) {
  const admin = createAdminClient();
  const ip = clientIpFrom(headers());
  if (!(await checkRateLimit(admin, `callback:ip:${ip}`, 10, 60))) {
    redirect(`/book/${subdomain}?error=busy`);
  }
  const site = await getPublicSiteBySubdomain(admin, subdomain);
  if (!site) redirect(`/book/${subdomain}?error=unavailable`);

  const { name, phone, email, address, description } = readContact(formData);
  if (!name || (!phone && !email)) {
    redirect(`/book/${subdomain}?error=incomplete`);
  }

  await createBookingRequestLead(admin, site.account_id, { name, phone, email, address, description });
  redirect(`/book/${subdomain}?requested=1`);
}
