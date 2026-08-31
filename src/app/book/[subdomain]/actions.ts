'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/auth';
import { pickBusinessName } from '@/lib/business-name';
import { checkRateLimit, checkRateLimitStrict, clientIpFrom } from '@/lib/rate-limit';
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
import { expandScheduledJobs, isMissingEndDateColumn, SPAN_COLUMNS, SPAN_COLUMNS_BEFORE_END_DATE, type SchedulableJob } from '@/lib/jobs';
import { geocodeAddress } from '@/lib/geocode';
import { coordOf, nearestMiles, type LatLng } from '@/lib/distance';
import { driveDistances } from '@/lib/drive-time';
import { rankByProximity, type RankedBookingDay } from '@/lib/route-density';
import { evaluateBookingEligibility, bookingFallbackMessage, normalizeGeoMode, type BookingVerdict } from '@/lib/instant-booking';
import { listServices } from '@/lib/services';
import { quickStopSettingsFromAccount, isAllowedQuickStopDay, QUICK_STOP_SETTINGS_COLUMNS } from '@/lib/quick-stop';
import { qualifyQuickStop, qualifyOptionsFromSettings, reaffirmQualification } from '@/lib/quick-stop-qualify';
import { readQuickStopVerdictToken } from '@/lib/quick-stop-verdict';
import { recordQuickStopScreening } from '@/lib/quick-stop-screenings';
import { createQuickStopRequest, hasActiveQuickStopRequest } from '@/lib/quick-stop-requests';
import { uploadLeadPhoto } from '@/lib/lead-photo-storage';

export type QuickStopSubmitResult =
  | { ok: true }
  // `notAFit` separates "we screened this job and said no" from every other way
  // a submit can fail (rate limit, missing address, duplicate). They read
  // identically as a bare sentence, and one of them is a refusal that has to
  // announce itself as one — see the refusal panel in QuickStopFlow.
  | { ok: false; unsafe?: boolean; safety?: string | null; notAFit?: boolean; error: string };

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
  const ip = clientIpFrom(headers());
  // A flood guard on the action itself, and no more than that. This is a server
  // action, so it is reachable by anyone who can load the page — but everything
  // above rankNearby is three indexed reads, which makes this a question of
  // database load rather than money. Hence fail-OPEN and a loose ceiling: a real
  // visitor evaluates once, twice if they redo the estimate.
  //
  // The part that costs money is one level down, behind its own much tighter
  // budget. See rankNearby.
  if (!(await checkRateLimit(admin, `bookeval:ip:${ip}`, 60, 60))) return null;

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
      ip,
    });
  }
  return { verdict, businessName, days, fallback: bookingFallbackMessage(verdict.tier, businessName) };
}

// Rank/annotate the open days by proximity to the contractor's existing same-day
// stops (route-density). Geocodes the lead address (precise-only) and gathers
// anchor jobs; when either is missing it degrades to plain availability with no
// proximity claim (cold start), so a customer is never stranded. That same
// degradation is what the paid-lookup budget below spends when it runs out.
async function rankNearby(
  admin: ReturnType<typeof createAdminClient>,
  accountId: string,
  days: BookingDay[],
  address: string | null,
  opts: { radiusMiles: number; mode: 'prefer' | 'restrict'; scheduleDayHours: number; driveTime: boolean; ip: string },
): Promise<RankedBookingDay[]> {
  if (days.length === 0) return [];

  /**
   * THE BILLED LINE, AND THE ONLY BUDGET IN FRONT OF IT.
   *
   * geocodeAddress and driveDistances are paid Google calls, made on behalf of
   * an anonymous visitor, on a string that visitor typed. Everything else on
   * this route is a database read. Without this the booking page is an open,
   * unmetered tap on the Maps bill — the one place on the public surface where
   * traffic turns directly into money out.
   *
   * Fail CLOSED, which is affordable here only because going over budget fails
   * nothing. It returns the answer this function already gives when an address
   * won't geocode: every day is still offered, just without a proximity claim.
   * So the worst case for a real customer sharing a carrier NAT with a busy
   * neighbourhood is a missing "near you" badge rather than a lost booking, and
   * a limiter outage costs the platform that badge rather than its bookings.
   *
   * Checked HERE and not at the top of the action, so the budget is only spent
   * when a paid call is genuinely about to happen — an ineligible visitor, or
   * one the owner has no open days for, never reaches this line.
   */
  if (!(await checkRateLimitStrict(admin, `bookgeo:ip:${opts.ip}`, 12, 60))) {
    return days.map((day) => ({ ...day, nearby: false }));
  }

  const geo = await geocodeAddress(address);
  const leadCoord = geo?.precise ? { lat: geo.lat, lng: geo.lng } : null;
  if (!leadCoord) return days.map((day) => ({ ...day, nearby: false }));

  const anchorQuery = (columns: string) =>
    admin
      .from('jobs')
      .select(columns)
      .eq('account_id', accountId)
      .not('scheduled_for', 'is', null)
      .neq('status', 'archived')
      .not('lat', 'is', null);

  // Same pre-migration guard as the availability query — a failed select here
  // would quietly drop every anchor and rank no day as nearby.
  const withEndDate = await anchorQuery(`${SPAN_COLUMNS}, lat, lng`);
  const anchorJobs = isMissingEndDateColumn(withEndDate.error)
    ? (await anchorQuery(`${SPAN_COLUMNS_BEFORE_END_DATE}, lat, lng`)).data
    : withEndDate.data;

  // Runtime column list (see the fallback above) defeats PostgREST's inference.
  const anchorRows = (anchorJobs ?? []) as unknown as Array<SchedulableJob & { lat: number | null; lng: number | null }>;

  const anchorsByDate = new Map<string, LatLng[]>();
  for (const occ of expandScheduledJobs(anchorRows, opts.scheduleDayHours)) {
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
    // Public free text, so it's capped here rather than trusted to the textarea's
    // maxLength — a direct POST ignores that, and this string ends up in an email
    // and on a job screen.
    note: (formData.get('note') ?? '').toString().trim().slice(0, 500) || null,
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

  const { name, phone, email, address, description, note } = readContact(formData);
  const slot = (formData.get('slot') ?? '').toString();
  const [dateKey, time] = slot.split('|');

  // Need a name, a way to reach them, somewhere to go, and a chosen slot.
  //
  // The address is enforced HERE and not only by the `required` attribute on
  // the input. This is a public endpoint: `required` is a browser courtesy that
  // any direct POST skips, and a booking with no address is a van with nowhere
  // to drive — the owner has to phone the customer back to ask, which is the
  // phone tag this page exists to remove.
  if (!name || (!phone && !email) || !address || !dateKey || !time) {
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
    await createBookingRequestLead(admin, site.account_id, { name, phone, email, address, description, note });
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

  /**
   * THE SECOND CHOICE, AND WHY IT NEVER FAILS THE BOOKING.
   *
   * Re-derived against the same offered days as the first choice, so a tampered
   * or arbitrary backup can no more reach the record than a tampered first one
   * — and, as with the first, the labels written down are the server's own.
   *
   * But a backup that is no longer on offer is DROPPED rather than bounced.
   * It is the optional half of the form; refusing the whole submission over it
   * would lose the customer the window they actually wanted, to fix a field
   * they were told they could leave alone. Same for naming the first window
   * twice: that is one choice, so it is stored as one.
   *
   * Checked BEFORE claimBookingHold, so the hold is compared against a day list
   * that still contains the first choice.
   */
  const altSlot = (formData.get('altSlot') ?? '').toString();
  const [altDateKey, altTime] = altSlot.split('|');
  const altOffered =
    altSlot && altSlot !== slot && altDateKey && altTime
      ? findOfferedSlot(availableDays, altDateKey, altTime)
      : null;

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

  const lead = await createBooking(admin, site.account_id, {
    name,
    phone,
    email,
    address,
    description,
    serviceName,
    dateKey,
    dateLabel: offered.day.dayLabel,
    time,
    // From the server's own matched window, never from the post. The client
    // could otherwise name the end of its own arrival window.
    endTime: offered.slot.endTime,
    timeLabel: offered.slot.label,
    alt: altOffered
      ? {
          dateKey: altOffered.day.dateKey,
          dateLabel: altOffered.day.dayLabel,
          time: altOffered.slot.time,
          endTime: altOffered.slot.endTime,
          timeLabel: altOffered.slot.label,
        }
      : null,
    note,
  });

  // The id, not the window. The confirmation page reads the requested time back
  // off this record — passing the label itself would put the text of a booking
  // confirmation under the visitor's control.
  redirect(`/book/${subdomain}?booked=${lead.id}`);
}

// Create a Quick Stop request from the public Book flow. Called with JS (not a
// form redirect) so the client can render the verdict inline.
//
// The qualification is ALWAYS settled server-side; what the client sends is
// never taken at its word. It may, however, send back the SIGNED verdict this
// server minted when they pressed "Check if this qualifies" — in which case the
// AI's opinion is honored rather than rolled a second time, and only the
// deterministic screener runs again. See lib/quick-stop-verdict for why, and
// for the four things that void a token. Absent or invalid, we qualify from
// scratch exactly as before.
//
// Returns a small serializable result; never throws to the caller.
export async function submitQuickStopRequestAction(formData: FormData): Promise<QuickStopSubmitResult> {
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
      .select(`${QUICK_STOP_SETTINGS_COLUMNS}, business_name, timezone, connect_onboarded, stripe_connect_id`)
      .eq('id', site.account_id)
      .maybeSingle();
    const settings = quickStopSettingsFromAccount(accountRow as Parameters<typeof quickStopSettingsFromAccount>[0]);
    if (!settings.available) return { ok: false, error: 'Quick Stop isn’t available right now.' };
    // The page hides the form when the contractor can't take payment; this is the
    // same rule for a direct POST. Without payout setup the offer action refuses
    // to send an offer, so accepting the request here would only buy the customer
    // an AI screening, an address on file, and a wait for an answer that cannot
    // come. Worded identically to the line above — an anonymous visitor has no
    // business being told which of the two it is.
    const connect = accountRow as { connect_onboarded?: boolean; stripe_connect_id?: string | null } | null;
    if (!connect?.connect_onboarded || !connect?.stripe_connect_id) {
      return { ok: false, error: 'Quick Stop isn’t available right now.' };
    }

    const name = (formData.get('name') ?? '').toString().trim();
    const phone = normalizeUsPhone((formData.get('phone') ?? '').toString());
    const email = (formData.get('email') ?? '').toString().trim().toLowerCase() || null;
    const address = (formData.get('address') ?? '').toString().trim() || null;
    const issue = (formData.get('issue') ?? '').toString().trim();
    const startedWhen = (formData.get('startedWhen') ?? '').toString().trim() || null;
    const worsening = (formData.get('worsening') ?? '').toString().trim() || null;
    const propertyType = (formData.get('propertyType') ?? '').toString().trim() || null;
    const availability = (formData.get('availability') ?? '').toString().trim() || null;

    if (!name || !phone) return { ok: false, error: 'Add your name and mobile phone number so we can text you the priority visit offer.' };
    // A Quick Stop is a request to be slotted into a route that is already
    // running. Without an address there is no route position to work out, so
    // the screener cannot answer the one question it exists to answer.
    if (!address) return { ok: false, error: 'Add the service address — the contractor needs somewhere to go.' };
    if (!issue) return { ok: false, error: 'Describe the issue first.' };

    // Which day they asked for, re-checked here against the same rules that drew
    // the buttons. A public form's choices are a suggestion, not a constraint —
    // and an unchecked date would let somebody book a Sunday off a Mon–Fri
    // contractor, or next month off a same-day feature.
    const timeZone = (accountRow as { timezone?: string } | null)?.timezone || 'America/New_York';
    const rawRequestedDate = (formData.get('requestedDate') ?? '').toString().trim();
    const requestedDate = rawRequestedDate || null;
    if (requestedDate && !isAllowedQuickStopDay(requestedDate, settings, { timeZone })) {
      return { ok: false, error: 'That day isn’t available any more. Reload the page and pick another.' };
    }

    // Photos are validated by type/size inside uploadLeadPhoto; count is gated here.
    const files = formData.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0);
    if (settings.requiredPhotos > 0 && files.length < settings.requiredPhotos) {
      return { ok: false, error: `Please attach at least ${settings.requiredPhotos} photo${settings.requiredPhotos === 1 ? '' : 's'} of the issue.` };
    }

    // Duplicate guard before doing any real work.
    if (await hasActiveQuickStopRequest(admin, site.account_id, phone, email)) {
      return { ok: false, error: 'You already have a Quick Stop request in progress with this contractor.' };
    }

    // Server-authoritative qualification. Unsafe ⇒ safety copy, never a booking.
    //
    // The verdict this server already gave them, if they still hold a valid one:
    // signed, bound to this account and to this job's wording, and good for half
    // an hour. Being told "✓ this looks like a fit", filling in a form, and then
    // being refused for a different reason is not a screening — it is a coin
    // toss the customer paid for with their address.
    const facts = { issue, startedWhen, worsening, propertyType };
    const remembered = readQuickStopVerdictToken((formData.get('verdictToken') ?? '').toString(), site.account_id, facts);
    // The availability text arrives AFTER the check, and the screener reads it,
    // so the remembered verdict is re-screened over the fuller text.
    const screenText = [issue, startedWhen, worsening, propertyType, availability].filter(Boolean).join(' \n ');
    const qualification = remembered
      ? reaffirmQualification(remembered, screenText, settings)
      : await qualifyQuickStop(
          { issue, startedWhen: startedWhen ?? '', worsening: worsening ?? '', propertyType: propertyType ?? '', availability: availability ?? '', businessName: site.company_name || '', serviceArea: site.service_area ?? '' },
          qualifyOptionsFromSettings(settings),
        );
    // Log the verdict either way, and BEFORE returning. A refusal used to leave
    // no trace at all, so an owner staring at an empty queue couldn't tell
    // "nobody asked" from "everybody asked and we turned them all away" — two
    // problems with opposite fixes. Records what was asked and why, never who
    // asked; see migrations/2026-08-01-quick-stop-screenings.sql.
    await recordQuickStopScreening(admin, site.account_id, {
      outcome: qualification.unsafe ? 'unsafe' : qualification.eligible ? 'accepted' : 'not_a_fit',
      exclusions: qualification.exclusions,
      reason: qualification.reason,
      issue,
      visitMinutes: qualification.visitMinutes,
    });

    if (qualification.unsafe) return { ok: false, unsafe: true, safety: qualification.safety, error: 'This needs urgent attention, not an online booking.' };
    if (!qualification.eligible) {
      return { ok: false, notAFit: true, error: qualification.reason || 'This job needs longer than a single short visit on an existing route.' };
    }

    // Upload photos (best-effort per file) and geocode the address (precise-only).
    const photoPaths: string[] = [];
    for (const file of files.slice(0, 6)) {
      try {
        photoPaths.push(await uploadLeadPhoto(site.account_id, file, 'public_visitor'));
      } catch (error) {
        console.error('Quick Stop photo upload failed:', error instanceof Error ? error.message : error);
      }
    }
    const geo = await geocodeAddress(address);

    await createQuickStopRequest(
      admin,
      site.account_id,
      { name, phone, email, address, issue, startedWhen, worsening, propertyType, availability, photoPaths },
      qualification,
      {
        responseDeadlineMins: settings.responseDeadlineMins,
        lat: geo?.precise ? geo.lat : null,
        lng: geo?.precise ? geo.lng : null,
        // Site first. accounts.business_name is the "My Business" placeholder on
        // every live account, and this name is texted to the customer.
        businessName: pickBusinessName(site, accountRow as { business_name?: string } | null, 'your contractor'),
        requestedDate,
      },
    );

    return { ok: true };
  } catch (error) {
    console.error('submitQuickStopRequestAction failed:', error instanceof Error ? error.message : error);
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

  const { name, phone, email, address, description, note } = readContact(formData);
  // Same rule as a booking — see submitBookingAction. A callback lead without an
  // address is one the owner cannot price, route or quote without ringing back.
  if (!name || (!phone && !email) || !address) {
    redirect(`/book/${subdomain}?error=incomplete`);
  }

  await createBookingRequestLead(admin, site.account_id, { name, phone, email, address, description, note });
  redirect(`/book/${subdomain}?requested=1`);
}
