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

/**
 * STOP and HELP had never been EXECUTED.
 *
 * Both keywords appear above, but only inside the suppressed case and the
 * audit-failure case -- and both of those return empty TwiML, so the
 * acknowledgement text itself was asserted for START and nothing else. STOP is
 * the single most compliance-critical message the rail sends; its wording was
 * carried entirely by the source file.
 */
describe('the compliance acknowledgements a carrier would audit', () => {
  beforeEach(() => {
    vi.resetModules();
    for (const fn of Object.values(mocks)) fn.mockReset();
    mocks.hasSignatureHeader.mockReturnValue(true);
    mocks.validateWebhookSignature.mockReturnValue({ ok: true, provider: 'signalwire' });
    mocks.outboundSmsLaneSuppression.mockReturnValue(null);
    mocks.parseSmsWebhookBody.mockReturnValue({});
    mocks.processSmsInboundActionReceipt.mockResolvedValue('completed');
    mocks.logWebhookFailure.mockResolvedValue(undefined);
  });

  /** Drive one keyword all the way through the real handler. */
  async function acknowledge(keyword: 'stop' | 'start' | 'help', brand = 'Example Contractor') {
    mocks.extractInboundWebhook.mockReturnValue({
      providerEventId: 'message-1', receiptKey: 'message-1',
      fromNumber: '+12485550101', toNumber: '+12485550102',
      body: keyword.toUpperCase(), mediaUrls: [], keyword, providerHandledKeyword: false,
    });
    mocks.loadInboundReceiptDisposition.mockResolvedValue(`keyword_${keyword}`);
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const maybeSingle = vi.fn().mockResolvedValue({ data: { business_name: brand }, error: null });
    const from = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }) });
    mocks.createAdminClient.mockReturnValue({ rpc, from });
    mocks.ingestInboundWebhook.mockResolvedValue({
      disposition: `keyword_${keyword}`, receiptId: RECEIPT_ID, accountId: ACCOUNT_ID,
      senderNumberId: null, senderPurpose: 'lgq_shared',
    });
    const { POST } = await import('@/app/api/sms/inbound/route');
    const body = await (await POST(callback())).text();
    // The message the carrier would actually transmit, not the XML around it.
    return {
      body,
      message: (body.match(/<Message>([\s\S]*?)<\/Message>/) || [])[1] ?? null,
      rpc,
      from,
    };
  }

  it('confirms the unsubscribe on STOP and says how to come back', async () => {
    // A STOP reply that does not confirm is the one a carrier complains about.
    const { message, rpc } = await acknowledge('stop');
    expect(message).toContain('unsubscribed');
    expect(message).toMatch(/reply start/i);
    expect(rpc).toHaveBeenCalledWith('record_sms_compliance_reply_result', expect.objectContaining({
      p_keyword: 'stop', p_egress_result: 'twiml',
    }));
  });

  it('gives HELP a contact, the opt-out and the rates disclosure', async () => {
    // All three are carrier expectations for a HELP response.
    const { message } = await acknowledge('help');
    expect(message).toContain('@');
    expect(message).toMatch(/reply stop/i);
    expect(message).toMatch(/rates may apply/i);
  });

  it('keeps START and HELP on their compliance acknowledgement path', async () => {
    for (const keyword of ['start', 'help'] as const) {
      const { message, from } = await acknowledge(keyword);
      expect(message).not.toBeNull();
      expect(from).not.toHaveBeenCalledWith('sms_sender_keyword_preferences');
    }
  });

  it('never sends a STOP reply that reads like an opt-IN', async () => {
    // "re-subscribed" belongs to START. Crossing them is the worst possible bug
    // on this path and the two strings sit one ternary branch apart.
    const stop = (await acknowledge('stop')).message ?? '';
    const start = (await acknowledge('start')).message ?? '';
    expect(stop).not.toContain('re-subscribed');
    expect(start).not.toContain('unsubscribed');
    expect(stop).not.toBe(start);
  });

  it('bills ONE segment per acknowledgement, even for a long brand name', async () => {
    // Same trap the shared-number notice fell into: a single non-GSM-7
    // character -- an em dash, a curly apostrophe -- moves the WHOLE message to
    // UCS-2, where a segment is 70 characters instead of 160. These three are
    // carrier-mandated and sent more often than anything else on this lane, and
    // nothing pinned their length. Asserted against the RESPONSE, so it cannot
    // drift from a re-implementation of the copy.
    // The hyphen is escaped deliberately: inside a character class `+-*` is a
    // reversed RANGE, not three literals, and would not mean what it reads as.
    const gsm7 = (t: string) => /^[A-Za-z0-9 @£$¥.,:;!?'"()+\-*/=<>%&#\r\n]*$/.test(t);
    const segments = (t: string) => (gsm7(t)
      ? (t.length <= 160 ? 1 : Math.ceil(t.length / 153))
      : (t.length <= 70 ? 1 : Math.ceil(t.length / 67)));
    for (const keyword of ['stop', 'start', 'help'] as const) {
      const { message } = await acknowledge(keyword, 'Evergreen Lawn & Landscape');
      expect(message, `${keyword}: no Message verb`).not.toBeNull();
      const text = (message ?? '').replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&quot;/g, '"');
      expect(gsm7(text), `${keyword} left GSM-7: ${text}`).toBe(true);
      expect(segments(text), `${keyword} is ${text.length} chars`).toBe(1);
    }
  });
});
