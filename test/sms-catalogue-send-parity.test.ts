import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SMS_CATALOGUE } from '@/lib/sms-catalogue';
import { CREW_SMS_WELCOME_MESSAGE } from '@/lib/crew-sms-disclosure';
import { ownerEstimateAcceptedText } from '@/lib/estimate-offers';
import { confirmedSmsBody, declinedSmsBody } from '@/lib/booking-requests';
import { quickStopStatusText } from '@/lib/sms-templates';
import { segmentSms } from '@/lib/sms-segments';
import {
  sendBookingDecisionSms,
  sendCallerVoicePostCallFollowupSms,
  sendCrewWelcomeSms,
  sendClientJobDashboardSms,
  sendOwnerEstimateAcceptedSms,
  sendQuickStopStatusSms,
  sendQuoteFollowupSms,
} from '@/lib/sms';
import { sendLienWaiverSmsAction, sendNoiNoticeSmsAction } from '@/app/dashboard/payments/actions';

const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  rpc: vi.fn(),
  payment: {
    id: '11111111-1111-4111-8111-111111111111',
    amount: 1200,
    homeowner_phone: '+12485550123',
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth', () => {
  const admin = {
    rpc: mocks.rpc,
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: mocks.payment, error: null }),
      };
      return query;
    },
  };
  return {
    createAdminClient: () => admin,
    requireOfficeContext: async () => ({ accountId: 'account-1', supabase: admin }),
  };
});
vi.mock('@/lib/business-name', () => ({ loadBusinessName: async () => 'Evergreen Lawn & Landscape' }));
vi.mock('@/lib/sms-delivery', () => ({ enqueueSmsDelivery: mocks.enqueue }));

const businessName = 'Evergreen Lawn & Landscape';
const sampleId = '11111111-1111-4111-8111-111111111111';
const recipient = { accountId: 'account-1', toPhone: '+12485550123', idempotencyKey: 'catalogue-test' };
const catalogueBody = (id: string) => {
  const entry = SMS_CATALOGUE.find((candidate) => candidate.id === id);
  expect(entry, `missing catalogue entry ${id}`).toBeDefined();
  return entry!.body;
};
const lastBody = () => mocks.enqueue.mock.calls.at(-1)?.[0].body as string;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.letsgetquoted.com');
  mocks.rpc.mockResolvedValue({ data: false, error: null });
  mocks.enqueue.mockResolvedValue({ eventId: sampleId, state: 'queued', created: true });
});

afterEach(() => vi.unstubAllEnvs());

describe('catalogue previews equal real queued message bodies', () => {
  it('includes the actual generated job URL overhead in the quote preview', async () => {
    const token = 'a'.repeat(43);
    await sendClientJobDashboardSms({
      accountId: recipient.accountId, phone: recipient.toPhone, businessName,
      jobRef: 'J-1009', token, includesScheduleOptions: true, idempotencyKey: recipient.idempotencyKey,
    });
    expect(catalogueBody('client-job-dashboard')).toBe(lastBody());
    const url = `https://app.letsgetquoted.com/client/jobs/${token}`;
    expect(lastBody()).toContain(url);
    expect(segmentSms(lastBody()).units).toBeGreaterThan(segmentSms(lastBody().replace(url, 'lgq.co/x7Kp2')).units);
  });

  it.each([
    ['quote-followup', 'first'], ['quote-followup-final', 'final'],
  ] as const)('shows the %s stage that the sender queues', async (id, stage) => {
    await sendQuoteFollowupSms({
      accountId: recipient.accountId, phone: recipient.toPhone, businessName,
      clientName: 'Karen', url: `https://app.letsgetquoted.com/client/jobs/${'a'.repeat(43)}`, stage,
    });
    expect(catalogueBody(id)).toBe(lastBody());
    expect(catalogueBody('quote-followup')).not.toBe(catalogueBody('quote-followup-final'));
  });

  it('shows the subscription welcome actually sent to crew, including its disclosures', async () => {
    await sendCrewWelcomeSms({ accountId: 'account-1', crewId: sampleId, phone: recipient.toPhone, crewName: 'Mike', businessName });
    expect(mocks.enqueue).toHaveBeenCalledOnce();
    expect(catalogueBody('crew-welcome')).toBe(lastBody());
    expect(lastBody()).toBe(CREW_SMS_WELCOME_MESSAGE);
    expect(lastBody()).toContain('Message frequency varies. Msg & data rates may apply.');
    expect(lastBody()).toContain('Reply STOP to unsubscribe or HELP for help.');
  });

  it.each([
    ['caller-voice-post-call-followup', 'Karen', 'Water heater maintenance and inspection'],
    ['caller-voice-post-call-no-summary', null, null],
  ] as const)('shows %s with only the context settlement supplies', async (id, callerName, issueSummary) => {
    await sendCallerVoicePostCallFollowupSms({
      accountId: recipient.accountId,
      callerPhone: recipient.toPhone,
      callerName,
      issueSummary,
    });
    expect(mocks.enqueue).toHaveBeenCalledOnce();
    expect(catalogueBody(id)).toBe(lastBody());
    expect(lastBody()).not.toMatch(/reserved|confirmed|https:\/\/|9:00 AM/i);
  });

  it('uses the actual lien-waiver action, including business identity and document type', async () => {
    const result = await sendLienWaiverSmsAction({
      waiverId: sampleId,
      phone: recipient.toPhone,
      customerName: 'Karen',
      jobRef: 'J-1009',
      waiverTypeTitle: 'Unconditional Waiver on Final Payment',
    });
    expect(result.success).toBe(true);
    expect(mocks.enqueue).toHaveBeenCalledOnce();
    expect(catalogueBody('lien-waiver')).toBe(lastBody());
    expect(lastBody()).toContain(businessName);
    expect(lastBody()).toContain('Unconditional Waiver on Final Payment');
    expect(lastBody()).toContain(`/waivers/${sampleId}`);
  });

  it('covers the NOI action outside the central sender list', async () => {
    const form = new FormData();
    form.set('paymentId', sampleId);
    expect((await sendNoiNoticeSmsAction(form)).success).toBe(true);
    expect(mocks.enqueue).toHaveBeenCalledOnce();
    expect(catalogueBody('noi-notice')).toBe(lastBody());
    expect(lastBody()).toContain('$1,200.00');
    expect(lastBody()).toContain(`/pay/${sampleId}`);
  });

  it.each([
    ['quick-stop-status', 'en_route', undefined],
    ['quick-stop-arrived', 'arrived', undefined],
    ['quick-stop-eta', 'eta', 20],
  ] as const)('shows the queued %s status including the sender envelope', async (id, kind, minutes) => {
    await sendQuickStopStatusSms({ ...recipient, message: quickStopStatusText(kind, { businessName, minutes }) });
    expect(mocks.enqueue).toHaveBeenCalledOnce();
    expect(catalogueBody(id)).toBe(lastBody());
    expect(lastBody()).toContain(businessName);
    expect(lastBody().match(/Reply STOP to opt out\./g)).toHaveLength(1);
  });

  it.each([
    ['booking-decision', confirmedSmsBody(businessName, 'Wed, Aug 12 at 9:00 AM')],
    ['booking-declined', declinedSmsBody(businessName, 'Wed, Aug 12 at 9:00 AM')],
    ['booking-declined-both-windows', declinedSmsBody(businessName, 'Wed, Aug 12 at 9:00 AM', 'Thu, Aug 13 at 9:00 AM')],
  ])('shows %s using the same decision builder and sender envelope', async (id, message) => {
    await sendBookingDecisionSms({ ...recipient, message });
    expect(mocks.enqueue).toHaveBeenCalledOnce();
    expect(catalogueBody(id)).toBe(lastBody());
  });

  it.each([
    ['owner-estimate-accepted', 'booked', 'Estimate added to your day'],
    ['owner-estimate-accepted-late', 'expired', 'nothing was booked. Call them.'],
    ['owner-estimate-booking-failed', 'booking_failed', 'Book it manually.'],
  ] as const)('preserves the actual booking outcome in %s', async (id, outcome, nextStep) => {
    await sendOwnerEstimateAcceptedSms({
      accountId: recipient.accountId,
      alertPhone: recipient.toPhone,
      idempotencyKey: recipient.idempotencyKey,
      message: ownerEstimateAcceptedText({ leadName: 'Karen Whitfield', windowLabel: '2-4 PM', outcome }),
    });
    expect(mocks.enqueue).toHaveBeenCalledOnce();
    expect(catalogueBody(id)).toBe(lastBody());
    expect(lastBody()).toContain(nextStep);
  });

  it('keeps the settlement preview free of booking context until the real caller supplies it', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/voice/settlement.ts'), 'utf8');
    const call = source.match(/triggerVoicePostCallFollowup\([\s\S]*?\{([\s\S]*?)\},\s*\)/);
    expect(call, 'update this parity test when the settlement call changes').not.toBeNull();
    expect(call![1]).toContain('callerName');
    expect(call![1]).toContain('issueSummary');
    expect(call![1]).not.toMatch(/scheduledTime|portalUrl/);
  });
});
