import { describe, it, expect } from 'vitest';
import {
  calculateCandidateScore,
  draftWaitlistOfferBody,
  composeWaitlistOfferMessage,
  formatWaitlistWindowLabel,
  isCandidateQualified,
  parseWaitlistOfferReply,
  rankWaitlistCandidates,
  type OpenedSlotWindow,
  type WaitlistEntry,
} from '@/lib/cancellation-waitlist';

describe('cancellation-waitlist qualification & matching', () => {
  const baseSlot: OpenedSlotWindow = {
    dateKey: '2026-09-08', // Tuesday
    windowStart: '08:00',
    windowEnd: '12:00',
    durationHours: 4.0,
    anchors: [{ lat: 42.485, lng: -83.125 }],
  };

  const createEntry = (overrides: Partial<WaitlistEntry> = {}): WaitlistEntry => ({
    id: 'entry-1',
    account_id: 'acc-1',
    client_id: 'client-1',
    job_id: null,
    lead_id: null,
    client_name: 'Sarah Connor',
    client_phone: '+15552345678',
    client_email: 'sarah@example.com',
    address: '100 Main St, Royal Oak, MI',
    lat: 42.489,
    lng: -83.144,
    preferred_days: [1, 2, 3, 4, 5], // Mon-Fri
    preferred_window: 'morning',
    earliest_date: '2026-09-01',
    latest_date: '2026-09-30',
    service_name: 'Panel Upgrade',
    estimated_hours: 2.5,
    estimated_value: 850,
    urgency: 'high',
    notes: 'Flexible morning person',
    status: 'active',
    created_at: new Date(Date.now() - 4 * 86400000).toISOString(), // 4 days ago
    updated_at: new Date().toISOString(),
    ...overrides,
  });

  it('qualifies an active candidate matching date, weekday, and duration', () => {
    const candidate = createEntry();
    const result = isCandidateQualified(candidate, baseSlot);
    expect(result.qualified).toBe(true);
  });

  it('disqualifies a candidate when estimated hours exceed the opened window', () => {
    const candidate = createEntry({ estimated_hours: 5.0 });
    const result = isCandidateQualified(candidate, baseSlot);
    expect(result.qualified).toBe(false);
    expect(result.reasons[0]).toContain('exceeds window capacity');
  });

  it('disqualifies a candidate when slot date is outside requested range', () => {
    const candidate = createEntry({ earliest_date: '2026-09-10' });
    const result = isCandidateQualified(candidate, baseSlot);
    expect(result.qualified).toBe(false);
    expect(result.reasons[0]).toContain('before earliest requested');
  });

  it('disqualifies a candidate whose preferred weekdays do not match the slot', () => {
    // 2026-09-08 is Tuesday (2). If preferred is only [1, 3] (Mon, Wed), disqualify.
    const candidate = createEntry({ preferred_days: [1, 3] });
    const result = isCandidateQualified(candidate, baseSlot);
    expect(result.qualified).toBe(false);
    expect(result.reasons[0]).toContain('preferred days');
  });

  it('disqualifies inactive or already fulfilled waitlist entries', () => {
    const candidate = createEntry({ status: 'fulfilled' });
    const result = isCandidateQualified(candidate, baseSlot);
    expect(result.qualified).toBe(false);
  });

  it('allows emergency urgency to override window preference mismatches', () => {
    const afternoonSlot: OpenedSlotWindow = {
      ...baseSlot,
      windowStart: '13:00',
      windowEnd: '17:00',
    };
    // Candidate prefers morning, but is emergency -> qualified!
    const candidate = createEntry({ preferred_window: 'morning', urgency: 'emergency' });
    const result = isCandidateQualified(candidate, afternoonSlot);
    expect(result.qualified).toBe(true);
  });
});

describe('cancellation-waitlist scoring & priority ranking', () => {
  const testSlot: OpenedSlotWindow = {
    dateKey: '2026-09-09',
    windowStart: '09:00',
    windowEnd: '13:00',
    durationHours: 4.0,
    anchors: [{ lat: 42.485, lng: -83.125 }],
  };

  const now = new Date('2026-09-08T12:00:00Z');

  it('calculates higher proximity scores for nearby candidates', () => {
    const closeEntry: WaitlistEntry = {
      id: 'c1',
      account_id: 'a1',
      client_id: null,
      job_id: null,
      lead_id: null,
      client_name: 'Near Neighbor',
      client_phone: '+15551111111',
      client_email: null,
      address: 'Near stop',
      lat: 42.487, // ~0.2 miles away
      lng: -83.127,
      preferred_days: [],
      preferred_window: 'any',
      earliest_date: null,
      latest_date: null,
      service_name: 'Outlet repair',
      estimated_hours: 1.0,
      estimated_value: 150,
      urgency: 'medium',
      notes: null,
      status: 'active',
      created_at: new Date('2026-09-07T12:00:00Z').toISOString(),
      updated_at: new Date().toISOString(),
    };

    const farEntry: WaitlistEntry = {
      ...closeEntry,
      id: 'c2',
      client_name: 'Far Away',
      lat: 42.700, // ~15 miles away
      lng: -83.400,
    };

    const closeScore = calculateCandidateScore(closeEntry, testSlot, testSlot.anchors, now);
    const farScore = calculateCandidateScore(farEntry, testSlot, testSlot.anchors, now);

    expect(closeScore.proximityScore).toBeGreaterThan(farScore.proximityScore);
    expect(closeScore.totalScore).toBeGreaterThan(farScore.totalScore);
  });

  it('ranks multiple qualified candidates in correct deterministic priority order', () => {
    const emergencyFar: WaitlistEntry = {
      id: 'e1',
      account_id: 'a1',
      client_id: null,
      job_id: null,
      lead_id: null,
      client_name: 'Alice Emergency',
      client_phone: '+15550000001',
      client_email: null,
      address: 'North',
      lat: 42.550,
      lng: -83.200,
      preferred_days: [],
      preferred_window: 'any',
      earliest_date: null,
      latest_date: null,
      service_name: 'Main line leak',
      estimated_hours: 2.0,
      estimated_value: 1800,
      urgency: 'emergency',
      notes: null,
      status: 'active',
      created_at: new Date('2026-09-02T12:00:00Z').toISOString(), // 6 days ago
      updated_at: new Date().toISOString(),
    };

    const mediumClose: WaitlistEntry = {
      id: 'e2',
      account_id: 'a1',
      client_id: null,
      job_id: null,
      lead_id: null,
      client_name: 'Bob Neighbor',
      client_phone: '+15550000002',
      client_email: null,
      address: 'Next door',
      lat: 42.486,
      lng: -83.126, // Super close
      preferred_days: [],
      preferred_window: 'morning',
      earliest_date: null,
      latest_date: null,
      service_name: 'Inspection',
      estimated_hours: 1.5,
      estimated_value: 300,
      urgency: 'medium',
      notes: null,
      status: 'active',
      created_at: new Date('2026-09-07T12:00:00Z').toISOString(), // 1 day ago
      updated_at: new Date().toISOString(),
    };

    const flexibleFar: WaitlistEntry = {
      id: 'e3',
      account_id: 'a1',
      client_id: null,
      job_id: null,
      lead_id: null,
      client_name: 'Charlie Flex',
      client_phone: '+15550000003',
      client_email: null,
      address: 'South',
      lat: 42.300,
      lng: -83.300,
      preferred_days: [],
      preferred_window: 'any',
      earliest_date: null,
      latest_date: null,
      service_name: 'Consultation',
      estimated_hours: 1.0,
      estimated_value: 100,
      urgency: 'flexible',
      notes: null,
      status: 'active',
      created_at: new Date('2026-09-08T08:00:00Z').toISOString(),
      updated_at: new Date().toISOString(),
    };

    const ranked = rankWaitlistCandidates({
      candidates: [flexibleFar, emergencyFar, mediumClose],
      slot: testSlot,
      anchors: testSlot.anchors,
      now,
    });

    expect(ranked.length).toBe(3);
    // Rank #1 should be high scoring emergency or high proximity
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(2);
    expect(ranked[2].rank).toBe(3);
    expect(ranked[0].score.totalScore).toBeGreaterThanOrEqual(ranked[1].score.totalScore);
    expect(ranked[1].score.totalScore).toBeGreaterThanOrEqual(ranked[2].score.totalScore);
    expect(ranked[2].entry.client_name).toBe('Charlie Flex');
  });
});

describe('cancellation-waitlist SMS drafting and reply parsing', () => {
  it('formats custom offer body and business envelope accurately', () => {
    const body = draftWaitlistOfferBody({
      clientName: 'Diana Prince',
      dayText: 'tomorrow',
      windowLabel: '8:00 AM to 12:00 PM',
      serviceName: 'Roof Patch',
      holdMinutes: 30,
    });

    expect(body).toContain('Hi Diana');
    expect(body).toContain('earlier spot opened up tomorrow');
    expect(body).toContain('8:00 AM to 12:00 PM for your Roof Patch');
    expect(body).toContain('holding this spot for you for the next 30 minutes');

    const fullMessage = composeWaitlistOfferMessage('Apex Roofing Co', body);
    expect(fullMessage.startsWith('Apex Roofing Co:')).toBe(true);
    expect(fullMessage).toContain('Reply YES to claim this spot or NO to stay on the waitlist.');
    expect(fullMessage).toContain('Reply STOP to opt out.');
  });

  it('correctly parses positive acceptance replies', () => {
    expect(parseWaitlistOfferReply('YES').decision).toBe('accepted');
    expect(parseWaitlistOfferReply('Yes please').decision).toBe('accepted');
    expect(parseWaitlistOfferReply('yep').decision).toBe('accepted');
    expect(parseWaitlistOfferReply('1').decision).toBe('accepted');
    expect(parseWaitlistOfferReply('Sounds good').decision).toBe('accepted');
  });

  it('correctly parses decline replies', () => {
    expect(parseWaitlistOfferReply('NO').decision).toBe('declined');
    expect(parseWaitlistOfferReply('nope').decision).toBe('declined');
    expect(parseWaitlistOfferReply('No thanks').decision).toBe('declined');
    expect(parseWaitlistOfferReply('2').decision).toBe('declined');
  });

  it('flags ambiguous and long custom replies for human review', () => {
    expect(parseWaitlistOfferReply('Can you do Wednesday instead?').decision).toBe('ambiguous');
    expect(parseWaitlistOfferReply('How much will it cost?').decision).toBe('ambiguous');
    expect(parseWaitlistOfferReply('No thanks, please keep my original date').decision).toBe('ambiguous');
  });

  it('formats time window labels nicely', () => {
    expect(formatWaitlistWindowLabel('08:00', '12:00')).toBe('8:00 AM to 12:00 PM');
    expect(formatWaitlistWindowLabel('13:30', '16:00')).toBe('1:30 PM to 4:00 PM');
  });
});
