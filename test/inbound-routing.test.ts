import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  enqueueInboundReply,
  extractInboundWebhook,
  extractStatusWebhook,
  inboundReplyIdempotencyKey,
  parseSmsWebhookBody,
  webhookBodySha256,
} from '@/lib/sms-webhook-ingress';

describe('provider-neutral SMS webhook parsing', () => {
  it('reads compatibility form fields without losing ordered media values', () => {
    const raw = new URLSearchParams({
      MessageSid: 'SM-form-1',
      From: '+12485550101',
      To: '+12485550102',
      Body: 'photo attached',
      NumMedia: '2',
      MediaUrl0: 'https://carrier.test/one',
      MediaUrl1: 'https://carrier.test/two',
    }).toString();
    const inbound = extractInboundWebhook(
      parseSmsWebhookBody(raw, 'application/x-www-form-urlencoded; charset=utf-8'),
    );
    expect(inbound).toMatchObject({
      providerEventId: 'SM-form-1',
      receiptKey: 'SM-form-1',
      fromNumber: '+12485550101',
      toNumber: '+12485550102',
      body: 'photo attached',
      keyword: 'other',
      mediaUrls: ['https://carrier.test/one', 'https://carrier.test/two'],
    });
  });

  it('reads nested SignalWire-style JSON without normalizing the signed bytes', () => {
    const raw = JSON.stringify({
      id: 'outer-event-id',
      params: {
        message: {
          message_id: 'relay-message-1',
          from: '+12485550101',
          to: '+12485550102',
          body: 'STOP please',
          media: ['https://carrier.test/photo'],
        },
      },
    });
    const inbound = extractInboundWebhook(parseSmsWebhookBody(raw, 'application/json'));
    expect(inbound).toEqual({
      providerEventId: 'relay-message-1',
      receiptKey: 'relay-message-1',
      fromNumber: '+12485550101',
      toNumber: '+12485550102',
      body: 'STOP please',
      mediaUrls: ['https://carrier.test/photo'],
      keyword: 'stop',
      providerHandledKeyword: false,
    });
    expect(webhookBodySha256(raw)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('makes each status transition a provider-scoped logical receipt', () => {
    const status = extractStatusWebhook({
      message_id: 'relay-message-1',
      state: 'undelivered',
      reason: '30034',
    });
    expect(status).toEqual({
      providerEventId: 'relay-message-1',
      providerStatus: 'undelivered',
      providerErrorCode: '30034',
      receiptKey: 'relay-message-1:undelivered:30034',
    });
  });

  it('refuses bodies without a provider ID or both routing numbers', () => {
    expect(extractInboundWebhook({ From: '+12485550101', Body: 'hello' })).toBeNull();
    expect(extractStatusWebhook({ MessageStatus: 'delivered' })).toBeNull();
  });

  it('rejects an unaudited content type instead of guessing how to parse it', () => {
    expect(() => parseSmsWebhookBody('anything', 'multipart/form-data')).toThrow(/Unsupported/);
  });

  it('derives stable provider-scoped reply idempotency keys', () => {
    const key = inboundReplyIdempotencyKey('signalwire', 'relay-message-1', 'offer');
    expect(key).toBe(inboundReplyIdempotencyKey('signalwire', 'relay-message-1', 'offer'));
    expect(key).toMatch(/^inbound-reply:signalwire:offer:[0-9a-f]{64}$/);
    expect(key).not.toBe(inboundReplyIdempotencyKey('twilio', 'relay-message-1', 'offer'));
    expect(key).not.toBe(inboundReplyIdempotencyKey('signalwire', 'relay-message-2', 'offer'));
    expect(key).not.toBe(inboundReplyIdempotencyKey('signalwire', 'relay-message-1', 'reschedule'));
  });

  it('enqueues replies with the exact authenticated sender and audience scope', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const admin = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        return {
          data: [{
            sms_event_id: '33333333-3333-4333-8333-333333333333',
            task_state: 'queued',
            created: true,
          }],
          error: null,
        };
      },
    };
    const cases = [
      ['contractor_dedicated', 'customer_message'],
      ['lgq_dispatch', 'crew_message'],
      ['lgq_shared', 'owner_alert'],
    ] as const;
    for (const [senderPurpose, billingCategory] of cases) {
      const providerEventId = `relay-${senderPurpose}`;
      await enqueueInboundReply(admin as never, {
        provider: 'signalwire',
        providerEventId,
        accountId: '11111111-1111-4111-8111-111111111111',
        senderNumberId: '22222222-2222-4222-8222-222222222222',
        senderPurpose,
        phoneNumber: '+12485550101',
        body: 'Your appointment is confirmed.',
        kind: 'appointment_confirmation',
      });
      const call = calls.at(-1);
      expect(call?.name).toBe('enqueue_sms_delivery');
      expect(call?.args).toMatchObject({
        p_account_id: '11111111-1111-4111-8111-111111111111',
        p_sender_number_id: '22222222-2222-4222-8222-222222222222',
        p_sender_purpose: senderPurpose,
        p_billing_category: billingCategory,
        p_context: 'automation',
        p_event_type: 'inbound_appointment_reply',
      });
      expect(call?.args.p_idempotency_key).toBe(
        inboundReplyIdempotencyKey('signalwire', providerEventId, 'appointment_confirmation'),
      );
    }
  });
});

describe('strict tenant routing contract', () => {
  const messages = readFileSync(new URL('../src/lib/messages.ts', import.meta.url), 'utf8');
  const inboundRoute = readFileSync(new URL('../src/app/api/sms/inbound/route.ts', import.meta.url), 'utf8');
  const actionWorker = readFileSync(new URL('../src/lib/sms-inbound-action-worker.ts', import.meta.url), 'utf8');

  it('has no conversation-recency or consent-recency tenant fallback', () => {
    const resolver = messages.slice(
      messages.indexOf('export async function resolveAccountForInbound'),
      messages.indexOf('export async function logInboundMessage'),
    );
    expect(resolver).not.toContain('lastMessageAt');
    expect(resolver).not.toContain('consentUpdatedAt');
    expect(resolver).not.toContain("from('sms_messages')");
    expect(resolver).not.toContain("from('sms_consent')");
  });

  it('dispatches ordinary replies only through the receipt-keyed durable action worker', () => {
    expect(inboundRoute).toContain('processSmsInboundActionReceipt(ingress.receiptId, admin)');
    expect(inboundRoute).not.toContain('resolveOfferReply(');
    expect(inboundRoute).not.toContain('resolveRescheduleReply(');
    expect(inboundRoute).not.toContain('confirmUpcomingAppointment(');
  });

  it('queues ordinary replies on the exact authenticated sender and returns empty TwiML', () => {
    expect(actionWorker).toContain('senderNumberId: claim.senderNumberId');
    expect(actionWorker).toContain('senderPurpose: claim.senderPurpose');
    expect(actionWorker).toContain('providerEventId: claim.providerEventId');
    expect(actionWorker).toContain('enqueueInboundReply(admin');
    expect(inboundRoute).not.toMatch(/return\s+twiml\(/);
  });

  it('resumes duplicate receipts instead of treating them as successfully processed', () => {
    expect(inboundRoute).toContain('loadInboundReceiptDisposition(admin, ingress.receiptId)');
    expect(inboundRoute).toContain("effectiveDisposition !== 'routed'");
    expect(inboundRoute).toContain("actionStatus === 'busy'");
    expect(inboundRoute).toContain('if (data !== true) return emptyTwiml()');
  });

  it('keeps synchronous carrier egress limited to the named compliance exception', () => {
    expect(inboundRoute.match(/<Message>/g)).toHaveLength(1);
    expect(inboundRoute).toContain('function minimumComplianceKeywordTwiml(');
    expect(inboundRoute).toContain("'stop', brand, ingress.accountId, ingress.senderPurpose");
    expect(inboundRoute).toContain("'start', brand, ingress.accountId, ingress.senderPurpose");
    expect(inboundRoute).toContain("'help', brand, ingress.accountId, ingress.senderPurpose");
    expect(inboundRoute).toContain('outboundSmsLaneSuppression(accountId, senderPurpose)');
    expect(inboundRoute).toContain("rpc('record_sms_compliance_reply_result'");
    expect(inboundRoute).toContain('p_webhook_receipt_id: webhookReceiptId');
    expect(inboundRoute).toContain("createHash('sha256').update(responseBody, 'utf8')");
    expect(inboundRoute).toContain("admin, ingress.receiptId, 'start'");
    expect(inboundRoute).toContain("admin, ingress.receiptId, 'help'");
    expect(inboundRoute).not.toContain("binding,\n        'keyword_start'");
    expect(inboundRoute).not.toContain("binding,\n        'keyword_help'");
  });
});

describe('reply transcript ownership', () => {
  const offerData = readFileSync(new URL('../src/lib/estimate-offers-data.ts', import.meta.url), 'utf8');
  const rescheduleData = readFileSync(new URL('../src/lib/reschedule-offers-data.ts', import.meta.url), 'utf8');

  it('does not manufacture optimistic outbound transcript rows in reply resolvers', () => {
    for (const source of [offerData, rescheduleData]) {
      expect(source).not.toContain('logOutboundMessage');
      expect(source).not.toContain("from('sms_messages')");
    }
  });
});
