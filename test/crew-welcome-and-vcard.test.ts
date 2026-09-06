import { beforeEach, describe, it, expect, vi } from 'vitest';
import { crewWelcomeText } from '@/lib/sms-templates';
import { formatFieldVcard } from '@/lib/sms-field-templates';
import { CREW_SMS_WELCOME_MESSAGE } from '@/lib/crew-sms-disclosure';

const mocks = vi.hoisted(() => ({
  enqueueSmsDelivery: vi.fn(),
  smsAccountRecipientOptedOut: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => ({
    rpc: mocks.smsAccountRecipientOptedOut,
  }),
}));

vi.mock('@/lib/sms-delivery', () => ({
  enqueueSmsDelivery: mocks.enqueueSmsDelivery,
}));

const { sendCrewWelcomeSms } = await import('@/lib/sms');

beforeEach(() => {
  mocks.enqueueSmsDelivery.mockReset();
  mocks.smsAccountRecipientOptedOut.mockReset();
  mocks.smsAccountRecipientOptedOut.mockResolvedValue({ data: false, error: null });
  mocks.enqueueSmsDelivery.mockResolvedValue({
    eventId: '33333333-3333-4333-8333-333333333333',
    state: 'queued',
    created: true,
  });
});

describe('Crew Welcome Onboarding SMS', () => {
  it('generates a clean GSM-7 onboarding message explaining field intake', () => {
    const text = crewWelcomeText({
      crewName: 'Mike',
      businessName: 'Apex Roofing',
    });

    expect(text).toContain('Apex Roofing');
    expect(text).toContain('Mike');
    expect(text).toContain('progress updates, gate codes, or material receipt photos');
    expect(text).toContain('Reply STOP to opt out');
    expect(/^[\x20-\x7E]+$/.test(text)).toBe(true);
  });

  it('queues with a validator-safe, stable per-member and phone idempotency key', async () => {
    const input = {
      accountId: '11111111-1111-4111-8111-111111111111',
      crewId: '22222222-2222-4222-8222-222222222222',
      phone: '(248) 555-0123',
    };

    await expect(sendCrewWelcomeSms(input)).resolves.toEqual({
      status: 'queued',
      eventId: '33333333-3333-4333-8333-333333333333',
    });
    await sendCrewWelcomeSms(input);

    expect(mocks.enqueueSmsDelivery).toHaveBeenCalledTimes(2);
    const first = mocks.enqueueSmsDelivery.mock.calls[0]?.[0];
    const second = mocks.enqueueSmsDelivery.mock.calls[1]?.[0];
    expect(first).toMatchObject({
      accountId: input.accountId,
      phoneNumber: '+12485550123',
      body: CREW_SMS_WELCOME_MESSAGE,
      messageKind: 'crew-welcome',
      billingCategory: 'crew_message',
      context: 'crew',
      eventType: 'crew_welcome',
      crewId: input.crewId,
      senderPurpose: 'lgq_dispatch',
      idempotencyKey: `crew-welcome:${input.crewId}:12485550123`,
    });
    expect(first.idempotencyKey).toMatch(/^[A-Za-z0-9][A-Za-z0-9:._/-]{2,199}$/);
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
  });

  it('does not enqueue when campaign or account suppression is active', async () => {
    mocks.smsAccountRecipientOptedOut.mockResolvedValue({ data: true, error: null });

    await expect(sendCrewWelcomeSms({
      accountId: '11111111-1111-4111-8111-111111111111',
      crewId: '22222222-2222-4222-8222-222222222222',
      phone: '(248) 555-0123',
    })).resolves.toEqual({ status: 'opted_out' });
    expect(mocks.enqueueSmsDelivery).not.toHaveBeenCalled();
  });
});

describe('Field vCard Contact Generation', () => {
  it('generates a valid vCard 3.0 string with name, phone, and notes', () => {
    const vcard = formatFieldVcard('Apex Roofing & Construction', '+12485550199');

    expect(vcard).toContain('BEGIN:VCARD');
    expect(vcard).toContain('VERSION:3.0');
    expect(vcard).toContain('FN:Apex Roofing & Construction Field Updates');
    expect(vcard).toContain('ORG:Apex Roofing & Construction');
    expect(vcard).toContain('TEL;TYPE=CELL,VOICE,TEXT,PREF:+12485550199');
    expect(vcard).toContain('Let\'s Get Quoted AI Voice & Text-to-Job Field Intake Line');
    expect(vcard).toContain('END:VCARD');
  });
});
