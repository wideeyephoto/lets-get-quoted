import { describe, expect, it } from 'vitest';
import {
  buildReferralQueue,
  quickStopReferralStatus,
  type ReferralQueueLead,
} from '@/lib/referral-queue';
import {
  isReferralConfigured,
  mintReferralCode,
  referrerFromCode,
  referralLink,
} from '@/lib/referral';
import { buildReferralShareText } from '@/lib/referrals';

const REFERRER_A = '11111111-1111-1111-1111-111111111111';
const REFERRER_B = '22222222-2222-2222-2222-222222222222';
const ACCOUNT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('Referral Queue & Quick-Stop Key Collisions', () => {
  it('assigns stopIds and empty leadIds for quick-stop-only referrals', () => {
    const leads: ReferralQueueLead[] = [
      {
        id: 'stop-101',
        source: 'quick_stop',
        name: 'Quick Stop Customer 1',
        phone: '555-111-2222',
        email: null,
        status: quickStopReferralStatus('confirmed'),
        client_id: null,
        created_at: '2026-08-10T10:00:00.000Z',
        referral_settled_at: null,
        value: 250,
      },
      {
        id: 'stop-102',
        source: 'quick_stop',
        name: 'Quick Stop Customer 2',
        phone: '555-333-4444',
        email: null,
        status: quickStopReferralStatus('completed'),
        client_id: null,
        created_at: '2026-08-11T10:00:00.000Z',
        referral_settled_at: null,
        value: 400,
      },
    ];

    const queue = buildReferralQueue(
      leads,
      (l) => (l.id === 'stop-101' ? REFERRER_A : REFERRER_B),
      (id) => (id === REFERRER_A ? 'Alice Referrer' : 'Bob Referrer'),
    );

    expect(queue.owed).toHaveLength(2);

    const row1 = queue.owed[0];
    const row2 = queue.owed[1];

    // Verify leadIds is empty for quick-stop only
    expect(row1.leadIds).toHaveLength(0);
    expect(row1.stopIds).toEqual(['stop-101']);
    expect(row1.value).toBe(250);

    expect(row2.leadIds).toHaveLength(0);
    expect(row2.stopIds).toEqual(['stop-102']);
    expect(row2.value).toBe(400);

    // Verify unique compound row keys preventing React DOM reuse bug
    const key1 = `${row1.referrerClientId}:${row1.leadIds[0] ?? row1.stopIds[0]}`;
    const key2 = `${row2.referrerClientId}:${row2.leadIds[0] ?? row2.stopIds[0]}`;

    expect(key1).toBe(`${REFERRER_A}:stop-101`);
    expect(key2).toBe(`${REFERRER_B}:stop-102`);
    expect(key1).not.toBe(key2);
  });

  it('collapses mixed lead and quick_stop requests into one owed debt', () => {
    const leads: ReferralQueueLead[] = [
      {
        id: 'lead-1',
        source: 'lead',
        name: 'Mixed Customer',
        phone: '(555) 888-9999',
        email: 'mixed@example.com',
        status: 'won',
        client_id: 'client-mixed',
        created_at: '2026-08-01T12:00:00.000Z',
        referral_settled_at: null,
        value: 1200,
      },
      {
        id: 'stop-1',
        source: 'quick_stop',
        name: 'Mixed Customer',
        phone: '555-888-9999',
        email: null,
        status: quickStopReferralStatus('confirmed'),
        client_id: 'client-mixed',
        created_at: '2026-08-02T12:00:00.000Z',
        referral_settled_at: null,
        value: 300,
      },
    ];

    const queue = buildReferralQueue(
      leads,
      () => REFERRER_A,
      () => 'Alice Referrer',
    );

    expect(queue.owed).toHaveLength(1);
    const row = queue.owed[0];
    expect(row.leadIds).toEqual(['lead-1']);
    expect(row.stopIds).toEqual(['stop-1']);
    expect(row.referredPhone).toBe('(555) 888-9999');
    expect(row.referredEmail).toBe('mixed@example.com');
    expect(row.value).toBe(1500);

    const key = `${row.referrerClientId}:${row.leadIds[0] ?? row.stopIds[0]}`;
    expect(key).toBe(`${REFERRER_A}:lead-1`);
  });
});

describe('Referral Link Generation & Share Text', () => {
  it('mints signed referral codes and verifies referrer roundtrip', () => {
    process.env.LGQ_REFERRAL_SECRET = 'test-secret-key-32-bytes-minimum-length-now';

    expect(isReferralConfigured()).toBe(true);

    const clientId = '33333333-3333-3333-3333-333333333333';
    const code = mintReferralCode(ACCOUNT_ID, clientId);
    expect(code).toBeDefined();
    expect(code).toContain('.');

    const bookingUrl = 'https://apex.letsgetquoted.com/book/apex';
    const link = referralLink(bookingUrl, code);
    expect(link).toContain('https://apex.letsgetquoted.com/book/apex?ref=');

    const recovered = referrerFromCode(ACCOUNT_ID, code);
    expect(recovered).toBe(clientId);

    // Fails for foreign account
    const foreignRecovered = referrerFromCode('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', code);
    expect(foreignRecovered).toBeNull();
  });

  it('builds friendly customer share copy', () => {
    const text = buildReferralShareText({
      referrerName: 'Sarah Chen',
      businessName: 'Apex Roofing',
      shareUrl: 'https://apex.letsgetquoted.com/book/apex?ref=SARAH-CODE',
    });

    expect(text).toContain('Sarah Chen used Apex Roofing');
    expect(text).toContain('$50 off');
    expect(text).toContain('https://apex.letsgetquoted.com/book/apex?ref=SARAH-CODE');
  });
});
