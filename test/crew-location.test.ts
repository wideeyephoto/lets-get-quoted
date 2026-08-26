import { describe, expect, it } from 'vitest';
import {
  resolveFreshness,
  formatElapsedShift,
  resolveTechnicianStatus,
  type CrewLocationStateRow,
} from '@/lib/crew-location';

describe('resolveFreshness', () => {
  const baseTime = new Date('2026-08-26T12:00:00.000Z').getTime();

  it('labels samples < 2 minutes as live', () => {
    // 30 seconds ago
    const capture30s = new Date(baseTime - 30 * 1000).toISOString();
    const res30s = resolveFreshness(capture30s, baseTime);
    expect(res30s.freshness).toBe('live');
    expect(res30s.label).toBe('Updated 30s ago');

    // 90 seconds ago
    const capture90s = new Date(baseTime - 90 * 1000).toISOString();
    const res90s = resolveFreshness(capture90s, baseTime);
    expect(res90s.freshness).toBe('live');
    expect(res90s.label).toBe('Updated 1m ago');
  });

  it('labels samples between 2 and 10 minutes as stale', () => {
    const capture5m = new Date(baseTime - 5 * 60 * 1000).toISOString();
    const res5m = resolveFreshness(capture5m, baseTime);
    expect(res5m.freshness).toBe('stale');
    expect(res5m.label).toContain('stale');
    expect(res5m.label).toContain('5m');
  });

  it('labels samples older than 10 minutes as unavailable', () => {
    const capture25m = new Date(baseTime - 25 * 60 * 1000).toISOString();
    const res25m = resolveFreshness(capture25m, baseTime);
    expect(res25m.freshness).toBe('unavailable');
    expect(res25m.label).toBe('Last seen 25m ago');

    const noCapture = resolveFreshness(null, baseTime);
    expect(noCapture.freshness).toBe('unavailable');
    expect(noCapture.label).toBe('No recent signal');
  });
});

describe('formatElapsedShift', () => {
  const baseTime = new Date('2026-08-26T12:00:00.000Z').getTime();

  it('formats shift duration into decimal hours and human string', () => {
    const start2h30m = new Date(baseTime - 150 * 60 * 1000).toISOString();
    const res = formatElapsedShift(start2h30m, baseTime);
    expect(res.hours).toBe(2.5);
    expect(res.label).toBe('2h 30m');

    const start45m = new Date(baseTime - 45 * 60 * 1000).toISOString();
    const res45m = formatElapsedShift(start45m, baseTime);
    expect(res45m.hours).toBe(0.8);
    expect(res45m.label).toBe('45m');
  });

  it('handles null/missing start timestamps', () => {
    const res = formatElapsedShift(null, baseTime);
    expect(res.hours).toBe(0);
    expect(res.label).toBe('0m');
  });
});

describe('resolveTechnicianStatus', () => {
  const jobCoord = { lat: 40.7312, lng: -74.2731 };
  const mockLocation: CrewLocationStateRow = {
    account_id: 'acc1',
    crew_id: 'c1',
    time_entry_id: 'te1',
    job_id: 'j1',
    lat: 40.7313,
    lng: -74.2731,
    accuracy_m: 10,
    heading_deg: 90,
    speed_mps: 0,
    captured_at: '2026-08-26T12:00:00Z',
    received_at: '2026-08-26T12:00:01Z',
    expires_at: '2026-08-26T12:10:00Z',
    source: 'shift',
    client_sequence: 1,
    permission_state: 'granted',
    created_at: '2026-08-26T12:00:00Z',
    updated_at: '2026-08-26T12:00:00Z',
  };

  it('resolves off_duty when not on shift and not en route', () => {
    const res = resolveTechnicianStatus({
      isOnShift: false,
      isEnRoute: false,
      freshness: 'unavailable',
    });
    expect(res.status).toBe('off_duty');
    expect(res.statusLabel).toBe('Off Duty');
    expect(res.statusTone).toBe('neutral');
  });

  it('resolves en_route when active arrival exists', () => {
    const res = resolveTechnicianStatus({
      isOnShift: false,
      isEnRoute: true,
      freshness: 'live',
    });
    expect(res.status).toBe('en_route');
    expect(res.statusLabel).toBe('En Route');
    expect(res.statusTone).toBe('info');
  });

  it('resolves on_site when on shift and verified inside geofence', () => {
    const res = resolveTechnicianStatus({
      isOnShift: true,
      isEnRoute: false,
      locationState: mockLocation,
      jobCoord,
      geofenceRadiusFeet: 200,
      freshness: 'live',
    });
    expect(res.status).toBe('on_site');
    expect(res.statusTone).toBe('success');
    expect(res.statusLabel).toContain('On Site');
  });

  it('resolves off_site when on shift but far from job site', () => {
    const farLocation = { ...mockLocation, lat: 40.755, lng: -74.2731 };
    const res = resolveTechnicianStatus({
      isOnShift: true,
      isEnRoute: false,
      locationState: farLocation,
      jobCoord,
      geofenceRadiusFeet: 200,
      freshness: 'live',
    });
    expect(res.status).toBe('off_site');
    expect(res.statusTone).toBe('warn');
    expect(res.statusLabel).toContain('Off Site');
  });

  it('resolves job_not_mapped when job lacks coordinates', () => {
    const res = resolveTechnicianStatus({
      isOnShift: true,
      isEnRoute: false,
      locationState: mockLocation,
      jobCoord: null,
      freshness: 'live',
    });
    expect(res.status).toBe('job_not_mapped');
    expect(res.statusLabel).toBe('Job Not Mapped');
  });
});
