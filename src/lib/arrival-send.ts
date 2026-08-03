import type { SupabaseClient } from '@supabase/supabase-js';
import { APP_ORIGIN } from '@/lib/app-origin';
import {
  arrivalSettingsFromAccount, arrivalWindowTimes, buildArrivalMessage, DEFAULT_DELAY_TEMPLATE,
  duplicateVerdict, etaPhrase, firstName, formatArrivalWindow, homeownerReply, isClosedStatus,
  locationDefaultsOn, canShareLocation, minutesLate, renderTemplate,
  ARRIVAL_STATUS_LABEL, DEFAULT_ARRIVAL_TEMPLATE, DEFAULT_UPDATE_TEMPLATE,
  type ArrivalPermissions, type ArrivalSettings, type ArrivalStatus, type DuplicateVerdict,
} from '@/lib/arrival';
import { closeTravelShift, openTravelShift, travelClockEnabled } from '@/lib/arrival-clock';
import { createJobFeedEvent } from '@/lib/job-feed';
import {
  getActiveTracking, recordHomeownerNote, recordSmsOutcome, reviseArrival,
  setArrivalStatus, startArrival, type TrackingRow,
} from '@/lib/job-tracking';
import { sendArrivalSms } from '@/lib/sms';

// Orchestration for arrival management: everything that has to happen when
// somebody says "I'm on my way", changes their mind, or gets there.
//
// Lives here rather than in a route so the field app and the owner's dashboard
// run the SAME code — the alternative is two send paths that drift, and the one
// that drifts is always the one nobody tested.

export type ArrivalJob = {
  id: string;
  ref: string;
  client_name: string;
  client_phone: string | null;
  address: string | null;
  scope: string | null;
  scheduled_for: string | null;
  scheduled_time: string | null;
  lat: number | null;
  lng: number | null;
};

const JOB_FIELDS = 'id, ref, client_name, client_phone, address, scope, scheduled_for, scheduled_time, lat, lng';

export type ArrivalContext = {
  job: ArrivalJob;
  settings: ArrivalSettings;
  active: TrackingRow | null;
  businessName: string;
  jobLoc: { lat: number; lng: number } | null;
  /** Whether this account clocks drive time from "on my way" to "arrived". */
  clockTravel: boolean;
};

/** Everything the send sheet needs, in one round trip. */
export async function loadArrivalContext(
  admin: SupabaseClient,
  accountId: string,
  jobId: string,
): Promise<ArrivalContext | null> {
  const [{ data: job }, { data: account }, { data: site }, active] = await Promise.all([
    admin.from('jobs').select(JOB_FIELDS).eq('account_id', accountId).eq('id', jobId).maybeSingle(),
    admin.from('accounts').select('*').eq('id', accountId).maybeSingle(),
    admin.from('sites').select('company_name').eq('account_id', accountId).limit(1).maybeSingle(),
    getActiveTracking(admin, accountId, jobId),
  ]);
  if (!job) return null;

  const lat = Number(job.lat);
  const lng = Number(job.lng);
  return {
    job: job as ArrivalJob,
    settings: arrivalSettingsFromAccount(account as Record<string, unknown> | null),
    active,
    businessName: (site?.company_name as string | undefined) || (account?.business_name as string | undefined) || 'Your contractor',
    jobLoc: Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null,
    clockTravel: travelClockEnabled(account as Record<string, unknown> | null),
  };
}

export type SendArrivalInput = {
  accountId: string;
  jobId: string;
  actor: { crewId: string | null; name: string };
  permissions: ArrivalPermissions;
  etaMinutes: number;
  /** The GPS suggestion the tech was shown, whether or not they took it. */
  suggestedMinutes?: number | null;
  shareLocation: boolean;
  techLoc: { lat: number; lng: number } | null;
  /** The tech's own words, when they edited the preview. */
  override?: string | null;
  /** Set when the tech knowingly confirmed a resend past the double-tap guard. */
  confirmedResend?: boolean;
  now?: Date;
};

export type SendArrivalResult =
  | { ok: false; reason: 'not_found' | 'forbidden' }
  | { ok: false; reason: 'duplicate'; verdict: DuplicateVerdict }
  | {
      ok: true;
      mode: 'started' | 'revised';
      windowLabel: string | null;
      sms: Awaited<ReturnType<typeof sendArrivalSms>>;
      trackingUrl: string;
    };

/**
 * Tell the customer somebody is coming.
 *
 * Starts a trip, or revises the one already in flight. A second announcement
 * for the same visit is deliberately an UPDATE to the existing link rather than
 * a new one: the customer already has a page open, and the right behaviour is
 * for it to change under them, not for a second link to arrive.
 */
export async function sendArrival(
  admin: SupabaseClient,
  input: SendArrivalInput,
): Promise<SendArrivalResult> {
  if (!input.permissions.send) return { ok: false, reason: 'forbidden' };

  const now = input.now ?? new Date();
  const context = await loadArrivalContext(admin, input.accountId, input.jobId);
  if (!context) return { ok: false, reason: 'not_found' };

  const { job, settings, businessName } = context;

  // Only a trip still IN FLIGHT can be revised. A tech who already marked
  // arrived and then taps "on my way" again has left and is coming back —
  // that's a new trip with a new link, not an edit to a finished one.
  const active = context.active && (context.active.status === 'en_route' || context.active.status === 'delayed')
    ? context.active
    : null;

  // Double-tap protection. A stutter is swallowed and reported back so the UI
  // can say "already sent" rather than pretending; a deliberate resend needs
  // the tech to have confirmed it.
  const verdict = duplicateVerdict(active, now);
  if (verdict.kind === 'double_tap') return { ok: false, reason: 'duplicate', verdict };
  if (verdict.kind === 'already_sent' && !input.confirmedResend) return { ok: false, reason: 'duplicate', verdict };

  const share = input.shareLocation
    && canShareLocation(settings, input.permissions)
    && Boolean(input.techLoc);

  const times = arrivalWindowTimes(now, input.etaMinutes, settings);
  const revising = Boolean(active);
  // A revision that lands after the original promise expired isn't a new ETA,
  // it's an apology — and it should read like one.
  const late = revising && minutesLate(
    active?.arrival_start ? { start: new Date(active.arrival_start), end: new Date(active.arrival_end ?? active.arrival_start) } : null,
    now,
  ) > 0;

  // The owner's own wording governs the FIRST announcement — the one that sets
  // the tone. Updates use the built-in update/delay wording, which carries no
  // link, because only the storage layer knows the token and it only ever knows
  // the hash.
  const template = revising
    ? (late ? DEFAULT_DELAY_TEMPLATE : DEFAULT_UPDATE_TEMPLATE)
    : (settings.messageTemplate || DEFAULT_ARRIVAL_TEMPLATE);

  let token = '';
  let trackingId: string;
  if (active) {
    // Same trip, same link. The raw token is deliberately unrecoverable (only
    // its sha-256 is stored), so an update carries NO link — the customer
    // already has one, and the page it opens is the page that just changed.
    trackingId = active.id;
  } else {
    const started = await startArrival(admin, {
      accountId: input.accountId,
      jobId: input.jobId,
      crewId: input.actor.crewId,
      sentBy: input.actor.name,
      etaMinutes: input.etaMinutes,
      suggestedMinutes: input.suggestedMinutes ?? null,
      times,
      techLoc: input.techLoc,
      shareLocation: share,
      message: '',
      settings,
      now,
    });
    token = started.token;
    trackingId = started.trackingId;
  }

  const trackingUrl = token ? `${APP_ORIGIN}/track/${token}` : '';

  const message = buildArrivalMessage({
    template,
    business: businessName,
    crewName: input.actor.name,
    customerName: job.client_name,
    times,
    trackingUrl,
    timeZone: settings.timeZone,
    override: input.override,
  });

  if (active) {
    await reviseArrival(admin, active, {
      etaMinutes: input.etaMinutes,
      times,
      techLoc: input.techLoc,
      message,
      settings,
      late,
      now,
    });
  } else {
    await admin.from('job_tracking').update({ message_body: message }).eq('id', trackingId);
  }

  const sms = await sendArrivalSms({ accountId: input.accountId, phone: job.client_phone, message });
  await recordSmsOutcome(admin, trackingId, { status: sms.status, sid: sms.sid, error: sms.error });

  // Start the clock on the drive, when the account asked for that. Only on a
  // NEW trip — a revised ETA is the same journey, and restarting the clock
  // would bill the drive twice.
  if (!revising && context.clockTravel && input.actor.crewId) {
    await openTravelShift(admin, {
      accountId: input.accountId,
      crewId: input.actor.crewId,
      jobId: input.jobId,
      rate: await crewCostingRate(admin, input.actor.crewId),
    });
  }

  // Remember what they picked, so next time it's already selected. Last-used
  // rather than a true mode: a contractor's habit changes when their patch or
  // their van does, and an average would take weeks to catch up. Best-effort —
  // a preference write must never fail a send that already went out.
  if (input.etaMinutes !== settings.defaultMinutes) {
    try {
      await admin.from('accounts').update({ arrival_default_minutes: input.etaMinutes }).eq('id', input.accountId);
    } catch (error) {
      console.error('Remembering the default ETA failed:', error instanceof Error ? error.message : error);
    }
  }

  const windowLabel = formatArrivalWindow(times, settings.timeZone);
  await writeArrivalFeed(admin, input.accountId, input.jobId, {
    kind: revising ? 'arrival_revised' : 'arrival_en_route',
    title: revising ? (late ? 'Running late — customer told' : 'Updated arrival time sent') : 'On the way',
    body: [
      `${input.actor.name} ${revising ? 'updated the arrival time' : 'is en route'}${windowLabel ? ` — ${etaPhrase(times, settings.timeZone)}` : ''}.`,
      deliveryLine(sms.status, job.client_phone),
      share ? 'Location shared with the customer for this trip.' : null,
    ].filter(Boolean).join(' '),
    author: input.actor.name,
    meta: { etaMinutes: input.etaMinutes, windowLabel, sms: sms.status, shareLocation: share },
  });

  return { ok: true, mode: revising ? 'revised' : 'started', windowLabel, sms, trackingUrl };
}

/**
 * What an hour of this person's time costs a job.
 *
 * `crew.hourly_rate` is already the derived costing figure for salaried and
 * day-rate staff (see lib/pay-types), so travel costs out on the same basis as
 * every other hour they work — not on a second, drifting number.
 */
async function crewCostingRate(admin: SupabaseClient, crewId: string): Promise<number> {
  const { data } = await admin.from('crew').select('hourly_rate').eq('id', crewId).maybeSingle();
  return Number(data?.hourly_rate) || 0;
}

/** Plain English for the timeline about whether the customer actually heard. */
function deliveryLine(status: string, phone: string | null): string {
  switch (status) {
    case 'sent': return 'Customer texted.';
    case 'opted_out': return 'Not texted — this number has opted out of messages.';
    case 'no_phone': return phone ? 'Not texted — the number on file is not a valid mobile.' : 'Not texted — no phone number on this job.';
    case 'not_configured': return 'Not texted — texting is not set up on this account.';
    default: return 'The text did NOT go through.';
  }
}

export type ArrivalStatusInput = {
  accountId: string;
  jobId: string;
  actor: { crewId: string | null; name: string };
  permissions: ArrivalPermissions;
  status: Extract<ArrivalStatus, 'arrived' | 'no_access' | 'rescheduled' | 'cancelled'>;
  /** Free text from the tech — why they couldn't get in, when it's moving to. */
  note?: string | null;
  /**
   * Whether to tell the customer. Leave undefined for the per-status default:
   * an ARRIVAL is announced (somebody is at the door and should not have to
   * guess), and the awkward outcomes are not, because "we cancelled" should be
   * a message a person chose to send.
   */
  notify?: boolean;
  now?: Date;
};

/**
 * Record how the visit went. Every one of these ends the location share in the
 * same write, so there is no window where a finished visit keeps broadcasting.
 */
export async function applyArrivalStatus(
  admin: SupabaseClient,
  input: ArrivalStatusInput,
): Promise<{ ok: false; reason: 'no_active_trip' | 'forbidden' } | { ok: true; sms: Awaited<ReturnType<typeof sendArrivalSms>> | null }> {
  if (input.status === 'rescheduled' && !input.permissions.reschedule) return { ok: false, reason: 'forbidden' };

  const now = input.now ?? new Date();
  const active = await getActiveTracking(admin, input.accountId, input.jobId);
  if (!active) return { ok: false, reason: 'no_active_trip' };

  await setArrivalStatus(admin, active, input.status, now);

  // The drive is over the moment the trip ends, however it ended — arriving,
  // giving up at a locked gate, or turning around. An open travel shift left
  // behind blocks the tech's next clock-in for reasons they can't see.
  let travelHours: number | null = null;
  if (input.actor.crewId) {
    const { data: account } = await admin
      .from('accounts').select('arrival_clock_travel').eq('id', input.accountId).maybeSingle();
    if (travelClockEnabled(account as Record<string, unknown> | null)) {
      travelHours = await closeTravelShift(admin, {
        accountId: input.accountId,
        crewId: input.actor.crewId,
        crewName: input.actor.name,
        endedAt: now.toISOString(),
      });
    }
  }

  // The default lives HERE, not in each caller. It was in both action files
  // once, which is two places to forget it and one of them serving the person
  // standing on the doorstep.
  const notify = input.notify ?? input.status === 'arrived';

  let sms: Awaited<ReturnType<typeof sendArrivalSms>> | null = null;
  if (notify) {
    const [{ data: job }, { data: account }, { data: site }] = await Promise.all([
      admin.from('jobs').select('client_name, client_phone').eq('account_id', input.accountId).eq('id', input.jobId).maybeSingle(),
      admin.from('accounts').select('business_name').eq('id', input.accountId).maybeSingle(),
      admin.from('sites').select('company_name').eq('account_id', input.accountId).limit(1).maybeSingle(),
    ]);
    const businessName = (site?.company_name as string | undefined) || (account?.business_name as string | undefined) || 'Your contractor';
    const body = customerStatusText(input.status, businessName, firstName(input.actor.name), input.note ?? null);
    if (body) {
      sms = await sendArrivalSms({
        accountId: input.accountId,
        phone: (job?.client_phone as string | null) ?? null,
        message: `${body} Reply STOP to opt out.`,
      });
      await recordSmsOutcome(admin, active.id, { status: sms.status, sid: sms.sid, error: sms.error });
    }
  }

  await writeArrivalFeed(admin, input.accountId, input.jobId, {
    kind: `arrival_${input.status}`,
    title: statusFeedTitle(input.status),
    body: [
      `${input.actor.name} marked this visit: ${ARRIVAL_STATUS_LABEL[input.status]}.`,
      input.note ? `“${input.note}”` : null,
      sms ? deliveryLine(sms.status, null) : null,
      travelHours ? `Drive time logged: ${travelHours} hr.` : null,
    ].filter(Boolean).join(' '),
    author: input.actor.name,
    meta: { status: input.status, notified: notify, travelHours },
  });

  return { ok: true, sms };
}

function statusFeedTitle(status: ArrivalStatus): string {
  if (status === 'arrived') return 'Arrived on site';
  if (status === 'no_access') return 'Could not access the property';
  if (status === 'rescheduled') return 'Visit rescheduled';
  return 'Visit cancelled';
}

function customerStatusText(status: ArrivalStatus, business: string, techFirst: string, note: string | null): string | null {
  const who = techFirst || business;
  const tail = note ? ` ${note}` : '';
  switch (status) {
    case 'arrived': return `${business}: ${who} has arrived.${tail}`;
    case 'no_access': return `${business}: ${who} came by but couldn't get access to the property.${tail} Please get in touch to rebook.`;
    case 'rescheduled': return `${business}: today's visit has been rescheduled.${tail} We'll confirm a new time shortly.`;
    case 'cancelled': return `${business}: today's visit has been cancelled.${tail} Sorry for the inconvenience.`;
    default: return null;
  }
}

/**
 * The homeowner tapped a button on their status page.
 *
 * Written to the job timeline as a CLIENT-visible event, because it is
 * genuinely something the customer said. The urgent ones exist so a tech
 * checking their phone at the kerb learns about the locked gate before they
 * walk up to it.
 */
export async function applyHomeownerReply(
  admin: SupabaseClient,
  input: { accountId: string; jobId: string; trackingId: string; replyId: string; customerName: string },
): Promise<{ ok: boolean; ack: string | null }> {
  const reply = homeownerReply(input.replyId);
  if (!reply) return { ok: false, ack: null };

  await recordHomeownerNote(admin, input.trackingId, reply.note);
  await writeArrivalFeed(admin, input.accountId, input.jobId, {
    kind: `arrival_homeowner_${reply.id}`,
    title: reply.urgent ? `⚠ From the customer: ${reply.label}` : `From the customer: ${reply.label}`,
    body: reply.note,
    author: firstName(input.customerName) || 'Customer',
    meta: { replyId: reply.id, urgent: reply.urgent },
  });
  return { ok: true, ack: reply.ack };
}

/**
 * Timeline writes are best-effort. A feed insert that fails must never make a
 * tech think their "on my way" didn't send — the customer already has the text.
 */
async function writeArrivalFeed(
  admin: SupabaseClient,
  accountId: string,
  jobId: string,
  event: { kind: string; title: string; body: string; author: string; meta: Record<string, unknown> },
): Promise<void> {
  try {
    await createJobFeedEvent(admin, accountId, jobId, {
      kind: event.kind,
      title: event.title,
      body: event.body,
      visibility: 'internal',
      author: event.author,
      meta: event.meta,
    });
  } catch (error) {
    console.error('Arrival timeline write failed:', error instanceof Error ? error.message : error);
  }
}

/** The default template an owner starts editing from. */
export function defaultTemplateFor(settings: ArrivalSettings): string {
  return settings.messageTemplate || DEFAULT_ARRIVAL_TEMPLATE;
}

/** Preview text for the settings screen, rendered against a worked example. */
export function templatePreview(template: string, business: string, timeZone: string): string {
  return renderTemplate(template, {
    business,
    name: 'Danny',
    customer: 'Maria',
    eta: etaPhrase(arrivalWindowTimes(new Date(), 20, { windowStyle: 'window', windowMinutes: 30 }), timeZone),
    link: `${APP_ORIGIN}/track/…`,
  });
}

export { isClosedStatus, locationDefaultsOn };
