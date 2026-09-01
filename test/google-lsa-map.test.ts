import { describe, expect, it } from 'vitest';
import {
  googleLocalDateTimeToIso,
  googleLsaConversationRow,
  googleLsaCrmLeadInput,
  googleLsaLeadRow,
  shiftGoogleCalendarDate,
} from '@/lib/google-lsa/map';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const CUSTOMER = '1234567890';

describe('Google Local Services provider normalization', () => {
  it('shifts provider calendar windows without DST-sensitive millisecond subtraction', () => {
    expect(shiftGoogleCalendarDate('2026-11-01', -89)).toBe('2026-08-04');
    expect(shiftGoogleCalendarDate('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('interprets offset-free Google timestamps in the Ads account timezone', () => {
    expect(googleLocalDateTimeToIso('2026-07-01 09:30:00', 'America/New_York'))
      .toBe('2026-07-01T13:30:00.000Z');
    expect(googleLocalDateTimeToIso('2026-01-01 09:30:00', 'America/New_York'))
      .toBe('2026-01-01T14:30:00.000Z');
  });

  it('keeps an explicit offset authoritative', () => {
    expect(googleLocalDateTimeToIso('2026-07-01T09:30:00-04:00', 'UTC'))
      .toBe('2026-07-01T13:30:00.000Z');
  });

  it('projects charged and credit facts without inventing an amount', () => {
    const row = googleLsaLeadRow({
      accountId: ACCOUNT,
      customerId: CUSTOMER,
      customerTimeZone: 'America/New_York',
      now: '2026-09-01T12:00:00.000Z',
      lead: {
        resourceName: `customers/${CUSTOMER}/localServicesLeads/lead-1`,
        id: 'lead-1',
        leadType: 'PHONE_CALL',
        leadStatus: 'ACTIVE',
        creationDateTime: '2026-08-31 16:00:00',
        contactDetails: { consumerName: 'Ana', phoneNumber: '+15551234567', phoneNumberExtension: '42' },
        leadCharged: true,
        creditDetails: { creditState: 'CREDITED', creditStateLastUpdateDateTime: '2026-09-01 09:00:00' },
      },
    });

    expect(row).toMatchObject({
      google_lead_id: 'lead-1',
      consumer_name: 'Ana',
      lead_charged: true,
      credit_state: 'CREDITED',
      google_created_at: '2026-08-31T20:00:00.000Z',
    });
    expect(row).not.toHaveProperty('cost');
    expect(row).not.toHaveProperty('credit_amount');
  });

  it('links conversations to their immutable provider lead id', () => {
    const row = googleLsaConversationRow({
      accountId: ACCOUNT,
      customerId: CUSTOMER,
      customerTimeZone: 'UTC',
      conversation: {
        resourceName: `customers/${CUSTOMER}/localServicesLeadConversations/conversation-1`,
        id: 'conversation-1',
        localServicesLead: `customers/${CUSTOMER}/localServicesLeads/lead-1`,
        conversationChannel: 'PHONE_CALL',
        participantType: 'CONSUMER',
        eventDateTime: '2026-09-01 10:00:00',
        phoneCallDetails: { callDurationMillis: '90500', callRecordingUrl: 'https://example.test/recording' },
      },
    });
    expect(row).toMatchObject({ google_lead_id: 'lead-1', call_duration_seconds: 91 });
  });

  it('creates historical CRM intake without inferring messaging consent', () => {
    const input = googleLsaCrmLeadInput({
      resourceName: `customers/${CUSTOMER}/localServicesLeads/lead-1`,
      id: 'lead-1',
      leadType: 'BOOKING',
      serviceId: 'roof-repair',
      contactDetails: { consumerName: 'Mira', phoneNumber: '+15550001111' },
    }, `customers/${CUSTOMER}/localServicesLeads/lead-1`, '2026-08-20T12:00:00.000Z');

    expect(input).toMatchObject({
      source: 'google_lsa',
      projectType: 'roof-repair',
      createdAt: '2026-08-20T12:00:00.000Z',
      sourceGoogleLsaResource: `customers/${CUSTOMER}/localServicesLeads/lead-1`,
    });
    expect(input.triage).not.toHaveProperty('consent');
  });
});
