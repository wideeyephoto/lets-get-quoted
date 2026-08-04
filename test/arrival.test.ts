import { describe, expect, it } from 'vitest';
import {
  applyPrecision, arrivalPermissionsFromCrew, arrivalSettingsFromAccount, arrivalWindowTimes,
  buildArrivalMessage, canShareLocation, DEFAULT_ARRIVAL_TEMPLATE, DEFAULT_DELAY_TEMPLATE,
  describeArrivalOutcome, duplicateVerdict, estimateEtaMinutes, etaPhrase,
  firstName, formatArrivalWindow, homeownerReply, isActiveStatus, isClosedStatus, locationDefaultsOn,
  locationExpiry, locationVisible, MAX_ETA_MINUTES, minutesLate, nearestEtaChoice, renderTemplate,
  roundCoordinate, unknownTokens, HOMEOWNER_REPLIES, nearestWindowChoice, ARRIVAL_WINDOW_CHOICES,
} from '@/lib/arrival';

const TZ = 'America/New_York';
// A fixed instant so every window assertion below is a real clock time, not a
// relative one: 2026-08-03 14:00 in New York.
const NOON = new Date('2026-08-03T18:00:00.000Z');

describe('arrival settings', () => {
  it('falls back to documented defaults for an un-migrated account row', () => {
    // Every one of these columns is absent before the migration; a field app
    // opened in a driveway must not care.
    const settings = arrivalSettingsFromAccount({});
    expect(settings.enabled).toBe(true);
    expect(settings.locationPolicy).toBe('ask');
    expect(settings.windowStyle).toBe('window');
    expect(settings.windowMinutes).toBe(30);
    expect(settings.linkHours).toBe(4);
    expect(settings.defaultMinutes).toBeNull();
    expect(settings.messageTemplate).toBeNull();
  });

  it('reads a missing master switch as ON, never as off', () => {
    // The feature works today. A switch that defaulted to off on an
    // un-migrated database would silently stop every arrival text, and nobody
    // would find out until a customer complained that nobody warned them.
    expect(arrivalSettingsFromAccount({}).enabled).toBe(true);
    expect(arrivalSettingsFromAccount({ arrival_updates_enabled: null }).enabled).toBe(true);
    expect(arrivalSettingsFromAccount({ arrival_updates_enabled: true }).enabled).toBe(true);
    expect(arrivalSettingsFromAccount({ arrival_updates_enabled: false }).enabled).toBe(false);
  });

  it('ignores the columns behind settings that are no longer offered', () => {
    // These had a control and no decision behind them: one answer is right for
    // essentially every contractor and the wrong answer is quietly harmful.
    // The columns are kept so any of them can come back without a migration —
    // which is exactly why nothing may half-honour them in the meantime. A
    // stored value the interface no longer shows must not govern what a
    // customer receives.
    const settings = arrivalSettingsFromAccount({
      arrival_window_style: 'exact',
      arrival_location_precision: 'exact',
      arrival_link_hours: 12,
      arrival_message_template: 'Custom wording from the old editor',
    });
    expect(settings.windowStyle).toBe('window');
    expect(settings.locationPrecision).toBe('street');
    expect(settings.linkHours).toBe(4);
    expect(settings.messageTemplate).toBeNull();
  });

  it('still honours the location-sharing policy, which is only hidden', () => {
    // Removed from the settings page, NOT from the product. The crew's
    // per-visit prompt is unchanged.
    expect(arrivalSettingsFromAccount({ arrival_location_policy: 'off' }).locationPolicy).toBe('off');
    expect(arrivalSettingsFromAccount({ arrival_location_policy: 'on' }).locationPolicy).toBe('on');
  });

  it('treats null and a missing row identically', () => {
    expect(arrivalSettingsFromAccount(null)).toEqual(arrivalSettingsFromAccount(undefined));
  });

  it('rejects junk in the enum columns rather than passing it through', () => {
    const settings = arrivalSettingsFromAccount({
      arrival_location_policy: 'everywhere',
      arrival_window_style: 'vibes',
      arrival_location_precision: 'satellite',
    });
    expect(settings.locationPolicy).toBe('ask');
    expect(settings.windowStyle).toBe('window');
    expect(settings.locationPrecision).toBe('street');
  });

  it('snaps a stored width to a width the picker actually offers', () => {
    // The width used to be a free number from 0 to 120. Leaving a stored 20 as
    // 20 would mean the settings page highlighting "30 min" while the customer
    // is told something else — the interface lying about the promise.
    expect(arrivalSettingsFromAccount({ arrival_window_minutes: 20 }).windowMinutes).toBe(30);
    expect(arrivalSettingsFromAccount({ arrival_window_minutes: 50 }).windowMinutes).toBe(45);
    expect(arrivalSettingsFromAccount({ arrival_window_minutes: 9999 }).windowMinutes).toBe(90);
    // A stored 0 is an exact time dressed as a window — the one thing this
    // feature exists to avoid.
    expect(arrivalSettingsFromAccount({ arrival_window_minutes: 0 }).windowMinutes).toBe(30);
  });

  it('leaves an already-valid width alone', () => {
    for (const width of [30, 45, 60, 90]) {
      expect(arrivalSettingsFromAccount({ arrival_window_minutes: width }).windowMinutes).toBe(width);
    }
  });
});

describe('nearestWindowChoice', () => {
  it('picks the closest offered width', () => {
    expect(nearestWindowChoice(30)).toBe(30);
    expect(nearestWindowChoice(37)).toBe(30);
    expect(nearestWindowChoice(38)).toBe(45);
    expect(nearestWindowChoice(75)).toBe(60);
    expect(nearestWindowChoice(76)).toBe(90);
  });

  it('never returns something outside the offered set', () => {
    for (const value of [-100, 0, 1, 500, Number.MAX_SAFE_INTEGER]) {
      expect(ARRIVAL_WINDOW_CHOICES).toContain(nearestWindowChoice(value) as 30 | 45 | 60 | 90);
    }
  });
});

describe('crew permissions', () => {
  it('preserves what everyone could already do, and starts rescheduling off', () => {
    // The migration must not change anyone's access on the day it runs.
    const perms = arrivalPermissionsFromCrew({});
    expect(perms.send).toBe(true);
    expect(perms.shareLocation).toBe(true);
    expect(perms.viewContact).toBe(true);
    // The one genuinely new capability. A new power that grants itself to
    // everybody is not a default, it's a surprise.
    expect(perms.reschedule).toBe(false);
  });

  it('honours an explicit revocation', () => {
    expect(arrivalPermissionsFromCrew({ can_send_arrival: false }).send).toBe(false);
    expect(arrivalPermissionsFromCrew({ can_share_location: false }).shareLocation).toBe(false);
  });

  it("won't let an employer's 'on' policy override a revoked crew permission", () => {
    const settings = arrivalSettingsFromAccount({ arrival_location_policy: 'on' });
    const revoked = arrivalPermissionsFromCrew({ can_share_location: false });
    expect(canShareLocation(settings, revoked)).toBe(false);
    expect(locationDefaultsOn(settings, revoked)).toBe(false);
  });

  it('pre-ticks the share only under an "on" policy, never under "ask"', () => {
    const allowed = arrivalPermissionsFromCrew({});
    expect(locationDefaultsOn(arrivalSettingsFromAccount({ arrival_location_policy: 'on' }), allowed)).toBe(true);
    expect(locationDefaultsOn(arrivalSettingsFromAccount({ arrival_location_policy: 'ask' }), allowed)).toBe(false);
    expect(canShareLocation(arrivalSettingsFromAccount({ arrival_location_policy: 'off' }), allowed)).toBe(false);
  });
});

describe('arrival windows', () => {
  it('opens AT the estimate and runs later, never earlier', () => {
    // A customer told "2:00 to 2:30" who finds someone on the step at 1:45 is
    // not delighted. The tech said 15 minutes; the window starts there.
    const times = arrivalWindowTimes(NOON, 15, { windowStyle: 'window', windowMinutes: 30 });
    expect(formatArrivalWindow(times, TZ)).toBe('2:15 PM to 2:45 PM');
  });

  it('renders an exact ETA as a single time, not a zero-width range', () => {
    const times = arrivalWindowTimes(NOON, 15, { windowStyle: 'exact', windowMinutes: 30 });
    expect(formatArrivalWindow(times, TZ)).toBe('2:15 PM');
  });

  it('clamps an absurd custom ETA instead of promising next week', () => {
    const times = arrivalWindowTimes(NOON, 99999, { windowStyle: 'exact', windowMinutes: 0 });
    const minutes = (times.start.getTime() - NOON.getTime()) / 60_000;
    expect(minutes).toBe(MAX_ETA_MINUTES);
  });

  it('formats in the account timezone, not the server timezone', () => {
    const times = arrivalWindowTimes(NOON, 15, { windowStyle: 'exact', windowMinutes: 0 });
    expect(formatArrivalWindow(times, 'America/Los_Angeles')).toBe('11:15 AM');
  });

  it('survives a garbage timezone rather than blanking the status page', () => {
    const times = arrivalWindowTimes(NOON, 15, { windowStyle: 'exact', windowMinutes: 0 });
    expect(formatArrivalWindow(times, 'Mars/Olympus')).toMatch(/\d{1,2}:\d{2}/);
  });

  it('has no window at all when none was promised', () => {
    expect(formatArrivalWindow(null, TZ)).toBeNull();
  });
});

describe('lateness', () => {
  const times = arrivalWindowTimes(NOON, 15, { windowStyle: 'window', windowMinutes: 30 });

  it('is zero anywhere inside the window — that is what a window is for', () => {
    expect(minutesLate(times, NOON)).toBe(0);
    expect(minutesLate(times, new Date(NOON.getTime() + 20 * 60_000))).toBe(0);
    expect(minutesLate(times, times.end)).toBe(0);
  });

  it('counts from the LATE edge once it has passed', () => {
    expect(minutesLate(times, new Date(times.end.getTime() + 10 * 60_000))).toBe(10);
  });

  it('is zero when nothing was promised — you cannot be late for nothing', () => {
    expect(minutesLate(null, new Date(NOON.getTime() + 10 * 60 * 60_000))).toBe(0);
  });
});

describe('the message', () => {
  const base = {
    business: 'BrokePipes',
    crewName: 'Danny Fletcher',
    customerName: 'Maria Alvarez',
    times: arrivalWindowTimes(NOON, 15, { windowStyle: 'window', windowMinutes: 30 }),
    trackingUrl: 'https://letsgetquoted.com/track/abc123',
    timeZone: TZ,
  };

  it('substitutes every token', () => {
    const message = buildArrivalMessage(base);
    expect(message).toContain('BrokePipes');
    expect(message).toContain('Danny');
    expect(message).toContain('between 2:15 PM and 2:45 PM');
    expect(message).toContain('https://letsgetquoted.com/track/abc123');
  });

  it('uses a first name only — never a crew member’s surname', () => {
    expect(buildArrivalMessage(base)).not.toContain('Fletcher');
  });

  it('always appends the opt-out line', () => {
    expect(buildArrivalMessage(base)).toContain('Reply STOP to opt out.');
  });

  it('re-attaches the tracking link when a tech deletes it from their edit', () => {
    // The editable part is the sentence; the machinery is bolted on after. A
    // customer with a status page they cannot reach is worse than no page.
    const message = buildArrivalMessage({ ...base, override: 'Heading over now, see you shortly' });
    expect(message).toContain('https://letsgetquoted.com/track/abc123');
    expect(message).toContain('Reply STOP to opt out.');
  });

  it('does not duplicate a link the tech kept', () => {
    const message = buildArrivalMessage({ ...base, override: `On my way — ${base.trackingUrl}` });
    expect(message.match(/track\/abc123/g)).toHaveLength(1);
  });

  it('falls back to the business name when there is no crew name', () => {
    expect(buildArrivalMessage({ ...base, crewName: '' })).toContain('BrokePipes is on the way');
  });

  it('says "shortly" rather than inventing a time when none was promised', () => {
    expect(etaPhrase(null, TZ)).toBe('shortly');
    expect(buildArrivalMessage({ ...base, times: null })).toContain('shortly');
  });

  it('reads "by" for an exact time and "between" for a window', () => {
    expect(etaPhrase(arrivalWindowTimes(NOON, 15, { windowStyle: 'exact', windowMinutes: 0 }), TZ)).toBe('by 2:15 PM');
    expect(etaPhrase(arrivalWindowTimes(NOON, 15, { windowStyle: 'window', windowMinutes: 30 }), TZ))
      .toBe('between 2:15 PM and 2:45 PM');
  });
});

describe('template rendering', () => {
  const values = { business: 'BrokePipes', name: 'Danny', customer: 'Maria', eta: 'by 2:15 PM', link: 'https://x.test/t' };

  it('is whitespace- and case-tolerant inside the braces', () => {
    expect(renderTemplate('{{ Business }} / {{NAME}}', values)).toBe('BrokePipes / Danny');
  });

  it('leaves an unknown token visible instead of blanking it', () => {
    // An owner who typed {{adress}} should see their typo in the preview, not a
    // sentence with a silent hole where they cannot tell what went wrong.
    expect(renderTemplate('Coming to {{adress}}', values)).toBe('Coming to {{adress}}');
    expect(unknownTokens('Hi {{customer}} at {{adress}} on {{day}}')).toEqual(['adress', 'day']);
    expect(unknownTokens(DEFAULT_ARRIVAL_TEMPLATE)).toEqual([]);
  });

  it('renders the shipped default cleanly', () => {
    expect(renderTemplate(DEFAULT_ARRIVAL_TEMPLATE, values)).toBe(
      'BrokePipes: Danny is on the way and should reach you by 2:15 PM. Track the visit here: https://x.test/t',
    );
  });
});

describe('duplicate protection', () => {
  it('is clear when there is no trip in flight', () => {
    expect(duplicateVerdict(null, NOON).kind).toBe('clear');
  });

  it('calls a fast second tap a double tap', () => {
    const verdict = duplicateVerdict(
      { status: 'en_route', last_sent_at: new Date(NOON.getTime() - 20_000).toISOString() },
      NOON,
    );
    expect(verdict).toEqual({ kind: 'double_tap', secondsAgo: 20 });
  });

  it('calls a later repeat an already-sent, so the tech is offered an UPDATE', () => {
    // Different problems deserve different answers: swallow the stutter, offer
    // the revised-ETA flow for the deliberate resend.
    const sentAt = new Date(NOON.getTime() - 12 * 60_000).toISOString();
    expect(duplicateVerdict({ status: 'en_route', last_sent_at: sentAt }, NOON)).toEqual({
      kind: 'already_sent', sentAt, minutesAgo: 12,
    });
  });

  it('is clear once the trip has ended — the next tap is a new trip', () => {
    expect(duplicateVerdict({ status: 'arrived', last_sent_at: NOON.toISOString() }, NOON).kind).toBe('clear');
    expect(duplicateVerdict({ status: 'cancelled', last_sent_at: NOON.toISOString() }, NOON).kind).toBe('clear');
  });

  it('falls back to en_route_at when nothing has been re-sent yet', () => {
    expect(duplicateVerdict({ status: 'en_route', en_route_at: new Date(NOON.getTime() - 5_000).toISOString() }, NOON).kind)
      .toBe('double_tap');
  });

  it('is clear on an unparseable timestamp rather than blocking a real send', () => {
    expect(duplicateVerdict({ status: 'en_route', last_sent_at: 'not a date' }, NOON).kind).toBe('clear');
  });
});

describe('location privacy', () => {
  it('blurs to ~100m by default and only shows exact when asked', () => {
    expect(roundCoordinate(40.7128456, 'street')).toBe(40.713);
    expect(roundCoordinate(40.7128456, 'exact')).toBe(40.7128456);
    expect(applyPrecision({ lat: 40.7128456, lng: -74.0059731 }, 'street')).toEqual({ lat: 40.713, lng: -74.006 });
    expect(applyPrecision(null, 'street')).toBeNull();
  });

  const live = {
    status: 'en_route' as const,
    share_location: true,
    location_expires_at: new Date(NOON.getTime() + 30 * 60_000).toISOString(),
  };

  it('shows the tech only while the share is genuinely live', () => {
    expect(locationVisible(live, NOON)).toBe(true);
  });

  it('stops at the expiry even if nothing else ever happens', () => {
    // The backstop for the trip that never formally ends because the tech got
    // busy and never tapped Arrived.
    expect(locationVisible(live, new Date(NOON.getTime() + 31 * 60_000))).toBe(false);
  });

  it('stops the moment the trip reaches any terminal state', () => {
    for (const status of ['arrived', 'cancelled', 'rescheduled', 'no_access', 'done'] as const) {
      expect(locationVisible({ ...live, status }, NOON)).toBe(false);
    }
  });

  it('keeps showing through a delay — a late tech is exactly when you want the map', () => {
    expect(locationVisible({ ...live, status: 'delayed' }, NOON)).toBe(true);
  });

  it('never shows without consent, or without an expiry set', () => {
    expect(locationVisible({ ...live, share_location: false }, NOON)).toBe(false);
    expect(locationVisible({ ...live, location_expires_at: null }, NOON)).toBe(false);
  });

  it('expires the share well inside a working day', () => {
    expect((locationExpiry(NOON).getTime() - NOON.getTime()) / 60_000).toBe(90);
  });
});

describe('status vocabulary', () => {
  it('splits live from finished', () => {
    expect(isActiveStatus('en_route')).toBe(true);
    expect(isActiveStatus('delayed')).toBe(true);
    expect(isActiveStatus('arrived')).toBe(true);
    expect(isClosedStatus('cancelled')).toBe(true);
    expect(isClosedStatus('no_access')).toBe(true);
    expect(isClosedStatus('arrived')).toBe(false);
  });
});

describe('homeowner replies', () => {
  it('resolves a known id and rejects anything else', () => {
    expect(homeownerReply('gate_locked')?.note).toContain('Gate is locked');
    expect(homeownerReply('drop_tools_and_run')).toBeNull();
    expect(homeownerReply('')).toBeNull();
  });

  it('flags the ones a tech needs to see BEFORE they knock', () => {
    const urgent = HOMEOWNER_REPLIES.filter((reply) => reply.urgent).map((reply) => reply.id);
    expect(urgent).toContain('gate_locked');
    expect(urgent).toContain('side_entrance');
    expect(urgent).toContain('reschedule');
    // "I'm ready" is good news; it does not need to interrupt anybody.
    expect(urgent).not.toContain('ready');
  });

  it('gives every reply a note, an acknowledgement and a unique id', () => {
    const ids = HOMEOWNER_REPLIES.map((reply) => reply.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const reply of HOMEOWNER_REPLIES) {
      expect(reply.note.length).toBeGreaterThan(0);
      expect(reply.ack.length).toBeGreaterThan(0);
    }
  });
});

describe('firstName', () => {
  it('takes the first word and tolerates junk', () => {
    expect(firstName('Danny Fletcher')).toBe('Danny');
    expect(firstName('  Maria   Alvarez ')).toBe('Maria');
    expect(firstName('')).toBe('');
  });
});

describe('the suggested ETA', () => {
  // Times Square → Empire State Building, about 0.8 straight-line miles.
  const midtown = { lat: 40.758, lng: -73.9855 };
  const empire = { lat: 40.7484, lng: -73.9857 };

  it('turns a short hop into a floored 5 minutes, not 2', () => {
    // Nobody is ever two minutes from a house. The floor is the honest answer.
    expect(estimateEtaMinutes(midtown, empire)).toBe(5);
  });

  it('scales with distance', () => {
    const philly = { lat: 39.9526, lng: -75.1652 };
    const estimate = estimateEtaMinutes(midtown, philly);
    expect(estimate).toBeGreaterThan(120);
  });

  it('returns null rather than guessing when either end is unknown', () => {
    expect(estimateEtaMinutes(null, empire)).toBeNull();
    expect(estimateEtaMinutes(midtown, null)).toBeNull();
    expect(estimateEtaMinutes({ lat: NaN, lng: 0 }, empire)).toBeNull();
  });

  it('snaps to the nearest quick-pick so a GPS answer lands on a chip', () => {
    expect(nearestEtaChoice(23)).toBe(30);
    expect(nearestEtaChoice(12)).toBe(10);
    expect(nearestEtaChoice(1)).toBe(5);
    // Above the top chip it stays on the top chip; the tech uses Custom.
    expect(nearestEtaChoice(400)).toBe(60);
  });
});

describe('reporting the outcome back', () => {
  it('reports a failed text as a FAILURE even though the visit started fine', () => {
    // The visit is real either way. The only question that matters next is
    // whether somebody is expecting a knock at the door.
    const failed = describeArrivalOutcome('started', 'failed');
    expect(failed?.error).toBe(true);
    expect(failed?.text).toContain('has not been told');
  });

  it('distinguishes every reason a text did not go out', () => {
    for (const reason of ['opted_out', 'no_phone', 'not_configured'] as const) {
      const outcome = describeArrivalOutcome('started', reason);
      expect(outcome?.error).toBe(true);
      expect(outcome?.text).not.toContain('undefined');
    }
    expect(describeArrivalOutcome('started', 'sent')?.error).toBe(false);
  });

  it('treats a swallowed double tap as normal, not as an error', () => {
    expect(describeArrivalOutcome('duplicate', undefined)?.error).toBe(false);
  });

  it('says nothing when nothing happened', () => {
    expect(describeArrivalOutcome(undefined, undefined)).toBeNull();
    expect(describeArrivalOutcome('who-knows', undefined)).toBeNull();
  });
});

describe('the update text', () => {
  const times = arrivalWindowTimes(NOON, 40, { windowStyle: 'window', windowMinutes: 30 });
  const base = {
    business: 'BrokePipes',
    crewName: 'Danny',
    customerName: 'Maria',
    times,
    timeZone: TZ,
  };

  it('carries no link, because the customer already has one', () => {
    // A second link in the same thread is a second thing to be confused by,
    // and the page it would open is the page that just changed anyway.
    const message = buildArrivalMessage({ ...base, template: DEFAULT_DELAY_TEMPLATE, trackingUrl: '' });
    expect(message).not.toContain('http');
    expect(message).toContain('running behind');
    expect(message).toContain('Reply STOP to opt out.');
  });

  it('does not leave a dangling "here:" when a custom template wanted a link', () => {
    const message = buildArrivalMessage({ ...base, template: 'Update — new time {{eta}}. Track here: {{link}}', trackingUrl: '' });
    expect(message).not.toMatch(/here:\s+Reply STOP/);
    expect(message).toContain('Update — new time');
  });
});
