import { describe, expect, it } from 'vitest';
import { departurePlans, nextDeparture, LEAVE_SOON_MINUTES } from '@/lib/departure-plan';
import { navigationLinks, appleMapsUrl, googleMapsUrl, wazeUrl, isApplePlatform } from '@/lib/navigation-links';
import { withinArrivalGeofence, metersBetween, zonedInstant, formatClockTime } from '@/lib/arrival';

const TZ = 'America/New_York';
const DAY = '2026-08-03';

// Two points about 4 miles apart in Detroit — roughly a 9-minute drive at the
// 28mph city average the estimator assumes.
const SHOP = { lat: 42.4, lng: -83.1 };
const STOP_A = { lat: 42.45, lng: -83.12 };
const STOP_B = { lat: 42.5, lng: -83.15 };

describe('zoned instants', () => {
  it('reads a wall-clock time in the account timezone, not the server one', () => {
    // Parsing "2026-08-03 08:00" with new Date() uses the SERVER's zone, which
    // is how an 8 AM appointment becomes a 3 AM text on a UTC host.
    const instant = zonedInstant(DAY, '08:00', TZ);
    expect(instant?.toISOString()).toBe('2026-08-03T12:00:00.000Z');
    expect(formatClockTime(instant as Date, TZ)).toBe('8:00 AM');
  });

  it('handles a zone on the other side of the country', () => {
    expect(zonedInstant(DAY, '08:00', 'America/Los_Angeles')?.toISOString()).toBe('2026-08-03T15:00:00.000Z');
  });

  it('refuses junk rather than returning an Invalid Date', () => {
    expect(zonedInstant('not-a-day', '08:00', TZ)).toBeNull();
    expect(zonedInstant(DAY, 'nope', TZ)).toBeNull();
  });
});

describe('departure plans', () => {
  const stops = [
    { id: 'a', scheduledTime: '09:00', ...STOP_A },
    { id: 'b', scheduledTime: '11:00', ...STOP_B },
  ];

  it('works back from the appointment, allowing for the drive and the buffer', () => {
    const plans = departurePlans(stops, { day: DAY, timeZone: TZ, bufferMinutes: 10, origin: SHOP, now: zonedInstant(DAY, '07:00', TZ)! });
    const first = plans[0];
    expect(first.driveMinutes).toBeGreaterThan(0);
    // Leaving must be strictly before the appointment it serves.
    expect(first.leaveBy!.getTime()).toBeLessThan(zonedInstant(DAY, '09:00', TZ)!.getTime());
    // And it must account for the buffer on top of the drive.
    const gap = (zonedInstant(DAY, '09:00', TZ)!.getTime() - first.leaveBy!.getTime()) / 60_000;
    expect(gap).toBe(first.driveMinutes! + 10);
  });

  it('measures each leg from the PREVIOUS stop, not from the shop every time', () => {
    const plans = departurePlans(stops, { day: DAY, timeZone: TZ, origin: SHOP, now: zonedInstant(DAY, '07:00', TZ)! });
    const fromShopToB = departurePlans([{ id: 'b', scheduledTime: '11:00', ...STOP_B }], {
      day: DAY, timeZone: TZ, origin: SHOP, now: zonedInstant(DAY, '07:00', TZ)!,
    });
    expect(plans[1].driveMinutes).not.toBe(fromShopToB[0].driveMinutes);
  });

  it('flags a departure that has already passed', () => {
    const plans = departurePlans(stops, { day: DAY, timeZone: TZ, origin: SHOP, now: zonedInstant(DAY, '10:55', TZ)! });
    expect(plans[0].overdue).toBe(true);
    expect(plans[1].overdue).toBe(true);
  });

  it('flags one that is imminent but not yet missed', () => {
    const first = departurePlans([stops[0]], { day: DAY, timeZone: TZ, origin: SHOP, now: zonedInstant(DAY, '07:00', TZ)! })[0];
    const justBefore = new Date(first.leaveBy!.getTime() - (LEAVE_SOON_MINUTES - 1) * 60_000);
    const plans = departurePlans([stops[0]], { day: DAY, timeZone: TZ, origin: SHOP, now: justBefore });
    expect(plans[0].soon).toBe(true);
    expect(plans[0].overdue).toBe(false);
  });

  it('plans nothing for a stop with no promised time', () => {
    // "Leave by" is derived from a promise, and there isn't one.
    const plans = departurePlans([{ id: 'x', scheduledTime: null, ...STOP_A }], { day: DAY, timeZone: TZ, origin: SHOP });
    expect(plans[0].leaveBy).toBeNull();
    expect(plans[0].overdue).toBe(false);
  });

  it('keeps planning past a stop with no coordinates', () => {
    // One ungeocoded address in the middle of a day must not blank the rest.
    const plans = departurePlans(
      [
        { id: 'a', scheduledTime: '09:00', ...STOP_A },
        { id: 'blind', scheduledTime: '10:00', lat: null, lng: null },
        { id: 'b', scheduledTime: '11:00', ...STOP_B },
      ],
      { day: DAY, timeZone: TZ, origin: SHOP, now: zonedInstant(DAY, '07:00', TZ)! },
    );
    expect(plans[1].leaveBy).toBeNull();
    expect(plans[2].leaveBy).not.toBeNull();
  });

  it('plans nothing at all without an origin to measure from', () => {
    const plans = departurePlans([{ id: 'a', scheduledTime: '09:00', ...STOP_A }], { day: DAY, timeZone: TZ, origin: null });
    expect(plans[0].leaveBy).toBeNull();
  });
});

describe('the one departure worth shouting about', () => {
  const at = (id: string, offsetMinutes: number, now: Date) => ({
    id,
    leaveBy: new Date(now.getTime() + offsetMinutes * 60_000),
    driveMinutes: 10,
    overdue: offsetMinutes < 0,
    soon: offsetMinutes >= 0 && offsetMinutes <= LEAVE_SOON_MINUTES,
  });

  it('prefers the most overdue over the merely soon', () => {
    const now = new Date('2026-08-03T13:00:00.000Z');
    const pick = nextDeparture([at('soon', 5, now), at('late', -40, now), at('later', -10, now)]);
    expect(pick?.id).toBe('late');
  });

  it('otherwise picks the soonest still ahead', () => {
    const now = new Date('2026-08-03T13:00:00.000Z');
    expect(nextDeparture([at('b', 90, now), at('a', 20, now)])?.id).toBe('a');
  });

  it('picks nothing when nothing is plannable', () => {
    expect(nextDeparture([{ id: 'x', leaveBy: null, driveMinutes: null, overdue: false, soon: false }])).toBeNull();
  });
});

describe('the arrival geofence', () => {
  it('fires within about a block and not from the next suburb', () => {
    const house = { lat: 42.45, lng: -83.12 };
    const doorstep = { lat: 42.4501, lng: -83.1201 };
    expect(metersBetween(house, doorstep)).toBeLessThan(150);
    expect(withinArrivalGeofence(doorstep, house)).toBe(true);
    expect(withinArrivalGeofence(STOP_B, house)).toBe(false);
  });

  it('never fires without both ends', () => {
    expect(withinArrivalGeofence(null, STOP_A)).toBe(false);
    expect(withinArrivalGeofence(STOP_A, null)).toBe(false);
  });
});

describe('the morning-of window', () => {
  it('treats the appointment time as the START of the window, like a live ETA', async () => {
    // A customer must never hear two different shapes of promise from the same
    // business: 9:00 booked means "from 9:00", not "9:00 give or take".
    const { morningWindowLabel } = await import('@/lib/arrival-sweep');
    expect(morningWindowLabel(DAY, '09:00', { windowStyle: 'window', windowMinutes: 120, timeZone: TZ }))
      .toBe('between 9:00 AM and 11:00 AM');
  });

  it('says "around" when the account promises an exact time', async () => {
    const { morningWindowLabel } = await import('@/lib/arrival-sweep');
    expect(morningWindowLabel(DAY, '09:00', { windowStyle: 'exact', windowMinutes: 0, timeZone: TZ }))
      .toBe('around 9:00 AM');
  });

  it('refuses to invent a window from a junk time', async () => {
    const { morningWindowLabel } = await import('@/lib/arrival-sweep');
    expect(morningWindowLabel(DAY, 'sometime', { windowStyle: 'window', windowMinutes: 60, timeZone: TZ })).toBeNull();
  });
});

describe('navigation links', () => {
  const target = { address: '12 Elm St, Berkley MI', lat: 42.5, lng: -83.1 };

  it('starts DIRECTIONS, not a dropped pin', () => {
    expect(appleMapsUrl(target)).toContain('dirflg=d');
    expect(googleMapsUrl(target)).toContain('travelmode=driving');
    expect(wazeUrl(target)).toContain('navigate=yes');
  });

  it('gives Waze coordinates when it has them, and a query when it does not', () => {
    // Handed an address in `ll`, Waze silently strands the tech on a search
    // screen — exactly when they have no patience for it.
    expect(wazeUrl(target)).toContain('ll=42.5,-83.1');
    expect(wazeUrl({ address: '12 Elm St', lat: null, lng: null })).toContain('q=12%20Elm%20St');
  });

  it('prefers coordinates but still labels the destination', () => {
    const url = appleMapsUrl(target)!;
    expect(url).toContain('daddr=42.5%2C-83.1');
    expect(url).toContain('Elm');
  });

  it('offers Apple Maps only on Apple hardware', () => {
    // On Android it opens a web page that cannot navigate, which is worse than
    // not offering it.
    expect(navigationLinks(target, 'ios').map((l) => l.app)).toEqual(['apple', 'google', 'waze']);
    expect(navigationLinks(target, 'other').map((l) => l.app)).toEqual(['google', 'waze']);
  });

  it('offers nothing at all with no address and no coordinates', () => {
    expect(navigationLinks({ address: null, lat: null, lng: null }, 'ios')).toEqual([]);
  });

  it('catches an iPad pretending to be a Mac', () => {
    const iPadUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/604.1';
    expect(isApplePlatform(iPadUA, 5)).toBe('ios');
    expect(isApplePlatform(iPadUA, 0)).toBe('other');
    expect(isApplePlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('ios');
    expect(isApplePlatform('Mozilla/5.0 (Linux; Android 14)')).toBe('other');
  });
});
