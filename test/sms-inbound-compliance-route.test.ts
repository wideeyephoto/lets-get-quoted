import { beforeEach, describe, expect, it, vi } from 'vitest';

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
const RECEIPT_ID = '22222222-2222-4222-8222-222222222222';
const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

function callback() {
  return new Request('https://app.letsgetquoted.com/api/sms/inbound', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-signalwire-signature': 'signed',
    },
    body: 'MessageSid=message-1',
  });
}

function adminWithAudit(result: boolean, error: { code?: string } | null = null) {
  const rpc = vi.fn().mockResolvedValue({ data: result, error });
  const maybeSingle = vi.fn().mockResolvedValue({
    data: { business_name: 'Example Contractor' },
    error: null,
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { rpc, from };
}

describe('inbound compliance reply boundary', () => {
  beforeEach(() => {
    vi.resetModules();
    for (const fn of Object.values(mocks)) fn.mockReset();
    mocks.hasSignatureHeader.mockReturnValue(true);
    mocks.validateWebhookSignature.mockReturnValue({ ok: true, provider: 'signalwire' });
    mocks.outboundSmsLaneSuppression.mockReturnValue(null);
    mocks.parseSmsWebhookBody.mockReturnValue({});
    mocks.extractInboundWebhook.mockReturnValue({
      providerEventId: 'message-1',
      receiptKey: 'message-1',
      fromNumber: '+12485550101',
      toNumber: '+12485550102',
      body: 'START',
      mediaUrls: [],
      keyword: 'start',
      providerHandledKeyword: false,
    });
    mocks.loadInboundReceiptDisposition.mockResolvedValue('keyword_start');
    mocks.processSmsInboundActionReceipt.mockResolvedValue('completed');
    mocks.logWebhookFailure.mockResolvedValue(undefined);
  });

  it('returns the audited START acknowledgement only to the request that claims it', async () => {
    const admin = adminWithAudit(true);
    mocks.createAdminClient.mockReturnValue(admin);
    mocks.ingestInboundWebhook.mockResolvedValue({
      disposition: 'keyword_start',
      receiptId: RECEIPT_ID,
      accountId: ACCOUNT_ID,
      senderNumberId: null,
      senderPurpose: 'lgq_shared',
    });

    const { POST } = await import('@/app/api/sms/inbound/route');
    const response = await POST(callback());

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<Message>Example Contractor: You are re-subscribed');
    expect(admin.rpc).toHaveBeenCalledWith('record_sms_compliance_reply_result', expect.objectContaining({
      p_webhook_receipt_id: RECEIPT_ID,
      p_keyword: 'start',
      p_egress_result: 'twiml',
      p_response_body_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
  });

  it('returns empty TwiML when a duplicate keyword receipt has already been claimed', async () => {
    const admin = adminWithAudit(false);
    mocks.createAdminClient.mockReturnValue(admin);
    mocks.ingestInboundWebhook.mockResolvedValue({
      disposition: 'duplicate',
      receiptId: RECEIPT_ID,
      accountId: ACCOUNT_ID,
      senderNumberId: null,
      senderPurpose: 'lgq_shared',
    });

    const { POST } = await import('@/app/api/sms/inbound/route');
    const response = await POST(callback());

    expect(await response.text()).toBe(EMPTY_TWIML);
    expect(mocks.loadInboundReceiptDisposition).toHaveBeenCalledWith(admin, RECEIPT_ID);
    expect(admin.rpc).toHaveBeenCalledTimes(1);
  });

  it('audits a suppressed compliance response and still returns empty TwiML', async () => {
    const admin = adminWithAudit(true);
    mocks.createAdminClient.mockReturnValue(admin);
    mocks.outboundSmsLaneSuppression.mockReturnValue('SMS_DISABLED');
    mocks.ingestInboundWebhook.mockResolvedValue({
      disposition: 'keyword_help',
      receiptId: RECEIPT_ID,
      accountId: ACCOUNT_ID,
      senderNumberId: null,
      senderPurpose: 'lgq_shared',
    });

    const { POST } = await import('@/app/api/sms/inbound/route');
    const response = await POST(callback());

    expect(await response.text()).toBe(EMPTY_TWIML);
    expect(admin.rpc).toHaveBeenCalledWith('record_sms_compliance_reply_result', expect.objectContaining({
      p_keyword: 'help',
      p_egress_result: 'suppressed',
    }));
  });

  it('keeps routed duplicates on the durable action-resume path', async () => {
    const admin = adminWithAudit(true);
    mocks.createAdminClient.mockReturnValue(admin);
    mocks.loadInboundReceiptDisposition.mockResolvedValue('routed');
    mocks.ingestInboundWebhook.mockResolvedValue({
      disposition: 'duplicate',
      receiptId: RECEIPT_ID,
      accountId: ACCOUNT_ID,
      senderNumberId: '33333333-3333-4333-8333-333333333333',
      senderPurpose: 'contractor_dedicated',
    });

    const { POST } = await import('@/app/api/sms/inbound/route');
    const response = await POST(callback());

    expect(await response.text()).toBe(EMPTY_TWIML);
    expect(mocks.processSmsInboundActionReceipt).toHaveBeenCalledWith(RECEIPT_ID, admin);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it('returns a retryable response when the compliance audit cannot commit', async () => {
    const admin = adminWithAudit(false, { code: '40001' });
    mocks.createAdminClient.mockReturnValue(admin);
    mocks.ingestInboundWebhook.mockResolvedValue({
      disposition: 'keyword_stop',
      receiptId: RECEIPT_ID,
      accountId: ACCOUNT_ID,
      senderNumberId: null,
      senderPurpose: 'lgq_shared',
    });

    const { POST } = await import('@/app/api/sms/inbound/route');
    const response = await POST(callback());

    expect(response.status).toBe(503);
    expect(await response.text()).toBe(EMPTY_TWIML);
    expect(mocks.logWebhookFailure).toHaveBeenCalledWith(expect.objectContaining({
      source: 'sms_inbound', referenceId: 'message-1',
    }));
  });
});
