import { describe, expect, it } from 'vitest';
import {
  applyPrecision,
  arrivalSettingsFromAccount,
  arrivalWindowTimes,
  buildArrivalMessage,
  canShareLocation,
  DEFAULT_ARRIVAL_TEMPLATE,
  DEFAULT_DELAY_TEMPLATE,
  DEFAULT_UPDATE_TEMPLATE,
  duplicateVerdict,
  estimateEtaMinutes,
  etaPhrase,
  formatArrivalWindow,
  isClosedStatus,
  locationExpiry,
  locationVisible,
  minutesLate,
  nearestEtaChoice,
  nearestWindowChoice,
  recalculateLiveArrivalTimes,
  roundCoordinate,
  TRACKING_LINK_HOURS,
} from '@/lib/arrival';
import {
  hashTrackingToken,
  newTrackingToken,
  type TrackingRow,
} from '@/lib/job-tracking';
import { calculateLiveArrivalEta } from '@/lib/client-rescheduling';
import { CAPABILITIES } from '@/lib/product-truth';
import { ALL_FEATURES_CATALOG } from '@/lib/all-features-catalog';
import fs from 'fs';
import path from 'path';

describe('Live Technician ETA Sharing & Expiring Map Links', () => {
  const NOON = new Date('2026-08-15T16:00:00.000Z'); // 12:00 PM EDT
  const TZ = 'America/New_York';

  describe('1. Expiring Map Link Generation & Security Tokens', () => {
    it('generates a 24-byte random hex token and matching SHA-256 hash', () => {
      const { token, hash } = newTrackingToken();
      expect(token).toBeDefined();
      expect(token.length).toBe(48); // 24 bytes in hex = 48 hex chars
      expect(hash).toBe(hashTrackingToken(token));
      expect(hash.length).toBe(64); // SHA-256 hex string = 64 chars
    });

    it('ensures separate tokens generate completely distinct hashes', () => {
      const first = newTrackingToken();
      const second = newTrackingToken();
      expect(first.token).not.toBe(second.token);
      expect(first.hash).not.toBe(second.hash);
    });

    it('enforces link expiration duration configured by settings', () => {
      const settings = arrivalSettingsFromAccount({ arrival_link_hours: 4 });
      expect(settings.linkHours).toBe(TRACKING_LINK_HOURS); // 4 hours
      const expiresAt = new Date(NOON.getTime() + settings.linkHours * 3_600_000);
      expect((expiresAt.getTime() - NOON.getTime()) / 3_600_000).toBe(4);
    });

    it('correctly detects expired link status past expiration timestamp', () => {
      const expiresAt = new Date(NOON.getTime() + 4 * 3_600_000).toISOString();
      const row: Partial<TrackingRow> = {
        status: 'en_route',
        expires_at: expiresAt,
      };

      // Before expiry
      const beforeNow = new Date(NOON.getTime() + 2 * 3_600_000);
      const isExpiredBefore = new Date(row.expires_at!).getTime() < beforeNow.getTime();
      expect(isExpiredBefore).toBe(false);

      // Past expiry
      const afterNow = new Date(NOON.getTime() + 5 * 3_600_000);
      const isExpiredAfter = new Date(row.expires_at!).getTime() < afterNow.getTime();
      expect(isExpiredAfter).toBe(true);
    });
  });

  describe('2. Dynamic Arrival Windows & Live Recalculation', () => {
    it('computes initial arrival window spanning from ETA to ETA + window width', () => {
      const settings = arrivalSettingsFromAccount({ arrival_window_minutes: 30 });
      const times = arrivalWindowTimes(NOON, 20, settings); // 20 min drive, 30 min window
      const label = formatArrivalWindow(times, TZ);

      expect(label).toBe('12:20 PM to 12:50 PM');
      expect((times.end.getTime() - times.start.getTime()) / 60_000).toBe(30);
    });

    it('dynamically recalculates arrival window when traffic or progress shifts ETA', () => {
      const settings = arrivalSettingsFromAccount({ arrival_window_minutes: 30 });
      const originalTimes = arrivalWindowTimes(NOON, 15, settings); // 12:15 to 12:45
      const originalEnd = originalTimes.end;

      // 10 minutes later, traffic increases ETA to 40 mins (arrival start moves to 12:50 PM, past 12:45 PM)
      const tenMinsLater = new Date(NOON.getTime() + 10 * 60_000); // 12:10 PM
      const recalculated = recalculateLiveArrivalTimes(tenMinsLater, 40, settings, originalEnd);

      expect(recalculated.times.start.toISOString()).toBe(new Date(tenMinsLater.getTime() + 40 * 60_000).toISOString());
      expect(formatArrivalWindow(recalculated.times, TZ)).toBe('12:50 PM to 1:20 PM');
      expect(recalculated.isDelayed).toBe(true); // 12:50 PM is past original 12:45 PM end
      expect(recalculated.minutesLate).toBe(5); // 12:50 - 12:45 = 5 min
    });

    it('snaps window choices to supported presets (30, 45, 60, 90 mins)', () => {
      expect(nearestWindowChoice(25)).toBe(30);
      expect(nearestWindowChoice(40)).toBe(45);
      expect(nearestWindowChoice(70)).toBe(60);
      expect(nearestWindowChoice(100)).toBe(90);
    });
  });

  describe('3. Delay Notices & Automatic Status Transitions', () => {
    it('detects traffic delay and calculates minutes late past promised window end', () => {
      const promisedTimes = arrivalWindowTimes(NOON, 15, { windowStyle: 'window', windowMinutes: 30 }); // 12:15 to 12:45
      const lateTime = new Date(NOON.getTime() + 60 * 60_000); // 1:00 PM (15 mins after 12:45 window end)

      expect(minutesLate(promisedTimes, lateTime)).toBe(15);
    });

    it('renders delay notice message with apology and updated arrival time', () => {
      const updatedTimes = arrivalWindowTimes(NOON, 45, { windowStyle: 'window', windowMinutes: 30 }); // 12:45 to 1:15
      const message = buildArrivalMessage({
        template: DEFAULT_DELAY_TEMPLATE,
        business: 'Apex Electric',
        crewName: 'Marcus Vance',
        customerName: 'Sarah Jenkins',
        times: updatedTimes,
        trackingUrl: '', // No redundant link on delay updates
        timeZone: TZ,
      });

      expect(message).toContain('Apex Electric: running behind');
      expect(message).toContain('Marcus now expects to reach you between 12:45 PM and 1:15 PM');
      expect(message).toContain('Sorry about that.');
      expect(message).toContain('Reply STOP to opt out.');
      expect(message).not.toContain('http');
    });

    it('calculates live arrival ETA tone, progress, and traffic delay in client rescheduling', () => {
      const techFar = { lat: 40.9000, lng: -74.2731 }; // ~11 miles away (~22 mins drive)
      const destCoord = { lat: 40.7312, lng: -74.2731 };

      const liveEta = calculateLiveArrivalEta({
        technicianCoord: techFar,
        destinationCoord: destCoord,
        promisedEndIso: new Date(NOON.getTime() + 5 * 60_000).toISOString(), // Window ends in 5 mins!
        now: NOON,
      });

      expect(liveEta.status).toBe('running_late');
      expect(liveEta.tone).toBe('warn');
      expect(liveEta.headline).toContain('behind due to traffic');
      expect(liveEta.varianceMinutes).toBeGreaterThan(15);
    });
  });

  describe('4. Privacy Controls & Automatic Geofence Safety', () => {
    it('applies street-level coordinate rounding (~100m precision)', () => {
      const rawCoord = { lat: 40.7128456, lng: -74.0059731 };
      const streetCoord = applyPrecision(rawCoord, 'street');

      expect(streetCoord).toEqual({ lat: 40.713, lng: -74.006 });
      expect(roundCoordinate(40.7128456, 'street')).toBe(40.713);
    });

    it('expires location sharing automatically after 90 minutes backstop', () => {
      const expiry = locationExpiry(NOON);
      expect((expiry.getTime() - NOON.getTime()) / 60_000).toBe(90);
    });

    it('revokes location sharing immediately when trip enters terminal state', () => {
      const trip: Partial<TrackingRow> = {
        status: 'en_route',
        share_location: true,
        location_expires_at: new Date(NOON.getTime() + 30 * 60_000).toISOString(),
      };

      // Live while en_route
      expect(locationVisible(trip as TrackingRow, NOON)).toBe(true);

      // Drops upon arrival or cancellation
      expect(locationVisible({ ...trip, status: 'arrived' } as TrackingRow, NOON)).toBe(false);
      expect(locationVisible({ ...trip, status: 'done' } as TrackingRow, NOON)).toBe(false);
      expect(locationVisible({ ...trip, status: 'cancelled' } as TrackingRow, NOON)).toBe(false);
      expect(locationVisible({ ...trip, status: 'rescheduled' } as TrackingRow, NOON)).toBe(false);
      expect(locationVisible({ ...trip, status: 'no_access' } as TrackingRow, NOON)).toBe(false);
    });
  });

  describe('5. Product Truth & FTC Substantiation Registry Alignment', () => {
    it('verifies live_technician_eta_sharing capability registered in product-truth.ts', () => {
      expect(CAPABILITIES.live_technician_eta_sharing).toBeDefined();
      expect(CAPABILITIES.live_technician_eta_sharing.status).toBe('live');
      expect(CAPABILITIES.live_technician_eta_sharing.name).toBe('Live Technician ETA Sharing');
      expect(CAPABILITIES.live_technician_eta_sharing.description).toContain('Expiring live map link');
    });

    it('verifies live-technician-eta-sharing feature in ALL_FEATURES_CATALOG', () => {
      const crewCategory = ALL_FEATURES_CATALOG.find((c) => c.slug === 'crew-field-app');
      expect(crewCategory).toBeDefined();

      const feature = crewCategory?.features.find((f) => f.id === 'live-technician-eta-sharing');
      expect(feature).toBeDefined();
      expect(feature?.name).toBe('Live Technician ETA Sharing');
      expect(feature?.desc).toBe('Give customers an expiring map link, updated arrival window, and delay notices.');
      expect(feature?.tags).toContain('GPS');
      expect(feature?.tags).toContain('ETA');
    });

    it('verifies CLM-012 entry in docs/ftc-substantiation-register.md', () => {
      const registerPath = path.join(process.cwd(), 'docs', 'ftc-substantiation-register.md');
      const content = fs.readFileSync(registerPath, 'utf8');

      expect(content).toContain('CLM-012');
      expect(content).toContain('Live technician ETA sharing — Give customers an expiring map link, updated arrival window, and delay notices.');
      expect(content).toContain('VERIFIED');
    });
  });
});
