import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The shared-number notice, EXECUTED rather than read.
 *
 * `shared-number-notice-reply.test.ts` beside this one asserts the copy and the
 * wiring by reading the route's source. That is the right shape for "is the
 * suppression check still in this function", and the wrong shape for the only
 * question that costs money: does a carrier `<Message>` verb actually leave this
 * route, and under exactly which conditions?
 *
 * A synchronous Message verb IS an outbound text. Everything here is about not
 * sending one when we should not.
 */

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  hasSignatureHeader: vi.fn(),
  outboundSmsLaneSuppression: vi.fn(),
  validateWebhookSignature: vi.fn(),
  extractInboundWebhook: vi.fn(),
  ingestInboundWebhook: vi.fn(),
  loadInboundReceiptDisposition: vi.fn(),
  parseSmsWebhookBody: vi.fn(),
  recordInvalidWebhook: vi.fn(),
  processSmsInboundActionReceipt: vi.fn(),
  logWebhookFailure: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock('@/lib/sms-provider', () => ({
  hasSignatureHeader: mocks.hasSignatureHeader,
  outboundSmsLaneSuppression: mocks.outboundSmsLaneSuppression,
  validateWebhookSignature: mocks.validateWebhookSignature,
}));
vi.mock('@/lib/sms-webhook-ingress', () => ({
  extractInboundWebhook: mocks.extractInboundWebhook,
  ingestInboundWebhook: mocks.ingestInboundWebhook,
  loadInboundReceiptDisposition: mocks.loadInboundReceiptDisposition,
  parseSmsWebhookBody: mocks.parseSmsWebhookBody,
  recordInvalidWebhook: mocks.recordInvalidWebhook,
}));
vi.mock('@/lib/sms-inbound-action-worker', () => ({
  processSmsInboundActionReceipt: mocks.processSmsInboundActionReceipt,
}));
vi.mock('@/lib/webhook-failures', () => ({ logWebhookFailure: mocks.logWebhookFailure }));

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
const RECEIPT_ID = '33333333-3333-4333-8333-333333333333';
const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

function callback() {
  return new Request('https://app.letsgetquoted.com/api/sms/inbound', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-signalwire-signature': 'signed',
    },
    body: 'MessageSid=message-notice',
  });
}

/** An admin client whose notice claim returns `claimed`. */
function admin(claimed: boolean, error: { message?: string } | null = null) {
  const rpc = vi.fn().mockResolvedValue({ data: claimed, error });
  const maybeSingle = vi.fn().mockResolvedValue({
    data: { business_name: 'BrokePipes' },
    error: null,
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  return { rpc, from: vi.fn().mockReturnValue({ select }) };
}

const ingress = (over: Record<string, unknown> = {}) => ({
  disposition: 'routed',
  receiptId: RECEIPT_ID,
  accountId: ACCOUNT_ID,
  senderNumberId: 'sender-1',
  senderPurpose: 'lgq_shared',
  ...over,
});

async function post() {
  const { POST } = await import('@/app/api/sms/inbound/route');
  return POST(callback());
}

describe('the shared number answers a reply', () => {
  beforeEach(() => {
    vi.resetModules();
    for (const fn of Object.values(mocks)) fn.mockReset();
    mocks.hasSignatureHeader.mockReturnValue(true);
    mocks.validateWebhookSignature.mockReturnValue({ ok: true, provider: 'signalwire' });
    mocks.outboundSmsLaneSuppression.mockReturnValue(null);
    mocks.parseSmsWebhookBody.mockReturnValue({});
    mocks.extractInboundWebhook.mockReturnValue({
      providerEventId: 'message-notice',
      receiptKey: 'message-notice',
      fromNumber: '+12485550101',
      toNumber: '+19479412323',
      body: 'thanks, will do',
      mediaUrls: [],
      keyword: null,
      providerHandledKeyword: false,
    });
    mocks.loadInboundReceiptDisposition.mockResolvedValue('routed');
    mocks.processSmsInboundActionReceipt.mockResolvedValue('completed');
    mocks.logWebhookFailure.mockResolvedValue(undefined);
  });

  it('returns the notice, branded, with the dashboard link', async () => {
    const client = admin(true);
    mocks.createAdminClient.mockReturnValue(client);
    mocks.ingestInboundWebhook.mockResolvedValue(ingress());

    const response = await post();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('<Message>BrokePipes: Alerts only');
    expect(body).toContain('/portal');
    expect(body).toMatch(/Reply STOP to opt out/);
    expect(client.rpc).toHaveBeenCalledWith('record_sms_shared_notice_reply', expect.objectContaining({
      p_webhook_receipt_id: RECEIPT_ID,
      p_egress_result: 'twiml',
      p_response_body_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
  });

  it('answers an UNROUTABLE reply too, which is the case with no other answer', async () => {
    // A stranger texting the number is exactly who gets silence otherwise.
    const client = admin(true);
    mocks.createAdminClient.mockReturnValue(client);
    mocks.ingestInboundWebhook.mockResolvedValue(
      ingress({ disposition: 'review', accountId: null, senderNumberId: null }),
    );

    const response = await post();
    expect(await response.text()).toContain('<Message>');
    expect(mocks.processSmsInboundActionReceipt).not.toHaveBeenCalled();
  });

  it('answers a routed reply only AFTER the action worker has run', async () => {
    const client = admin(true);
    mocks.createAdminClient.mockReturnValue(client);
    mocks.ingestInboundWebhook.mockResolvedValue(ingress());

    await post();
    expect(mocks.processSmsInboundActionReceipt).toHaveBeenCalledWith(RECEIPT_ID, client);
  });
});

describe('the shared number stays silent when it must', () => {
  beforeEach(() => {
    vi.resetModules();
    for (const fn of Object.values(mocks)) fn.mockReset();
    mocks.hasSignatureHeader.mockReturnValue(true);
    mocks.validateWebhookSignature.mockReturnValue({ ok: true, provider: 'signalwire' });
    mocks.outboundSmsLaneSuppression.mockReturnValue(null);
    mocks.parseSmsWebhookBody.mockReturnValue({});
    mocks.extractInboundWebhook.mockReturnValue({
      providerEventId: 'message-notice',
      receiptKey: 'message-notice',
      fromNumber: '+12485550101',
      toNumber: '+19479412323',
      body: 'thanks, will do',
      mediaUrls: [],
      keyword: null,
      providerHandledKeyword: false,
    });
    mocks.loadInboundReceiptDisposition.mockResolvedValue('routed');
    mocks.processSmsInboundActionReceipt.mockResolvedValue('completed');
    mocks.logWebhookFailure.mockResolvedValue(undefined);
  });

  it('sends NOTHING while outbound is suppressed, but still records the decision', async () => {
    // The whole point of a kill switch. Silence with no row and silence with a
    // `suppressed` row are different failures, so the audit is still written.
    mocks.outboundSmsLaneSuppression.mockReturnValue('kill-switch');
    const client = admin(true);
    mocks.createAdminClient.mockReturnValue(client);
    mocks.ingestInboundWebhook.mockResolvedValue(ingress());

    const response = await post();

    expect(await response.text()).toBe(EMPTY_TWIML);
    expect(client.rpc).toHaveBeenCalledWith('record_sms_shared_notice_reply', expect.objectContaining({
      p_egress_result: 'suppressed',
    }));
  });

  it('does not text twice when the provider retries the same receipt', async () => {
    // The claim is atomic; the loser answers empty.
    const client = admin(false);
    mocks.createAdminClient.mockReturnValue(client);
    mocks.ingestInboundWebhook.mockResolvedValue(ingress());

    const response = await post();
    expect(await response.text()).toBe(EMPTY_TWIML);
  });

  it('never answers on a contractor-dedicated number, and never even claims', async () => {
    // Auto-replying there puts words in the contractor's mouth mid-conversation
    // with their own customer.
    const client = admin(true);
    mocks.createAdminClient.mockReturnValue(client);
    mocks.ingestInboundWebhook.mockResolvedValue(ingress({ senderPurpose: 'contractor_dedicated' }));

    const response = await post();

    expect(await response.text()).toBe(EMPTY_TWIML);
    expect(client.rpc).not.toHaveBeenCalledWith('record_sms_shared_notice_reply', expect.anything());
  });

  it('stays silent on the 503 redelivery path, so a retry is never answered early', async () => {
    // The action is unfinished and the carrier is being asked to redeliver. An
    // answer here would claim the notice against a receipt still being worked.
    mocks.processSmsInboundActionReceipt.mockResolvedValue('busy');
    const client = admin(true);
    mocks.createAdminClient.mockReturnValue(client);
    mocks.ingestInboundWebhook.mockResolvedValue(ingress());

    const response = await post();

    expect(response.status).toBe(503);
    expect(await response.text()).toBe(EMPTY_TWIML);
    expect(client.rpc).not.toHaveBeenCalledWith('record_sms_shared_notice_reply', expect.anything());
  });

  it('degrades to silence rather than 5xx when the audit itself fails', async () => {
    // The receipt is already durable. A 5xx would ask the carrier to redeliver a
    // message we have stored, to re-send a courtesy we owe nobody.
    const client = admin(true, { message: 'deadlock detected' });
    mocks.createAdminClient.mockReturnValue(client);
    mocks.ingestInboundWebhook.mockResolvedValue(ingress());

    const response = await post();

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(EMPTY_TWIML);
    expect(mocks.logWebhookFailure).toHaveBeenCalled();
  });
});
