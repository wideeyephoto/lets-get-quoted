import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OWNER_FIELD_TOOLS_DECLARATION,
  processOwnerFieldIntakeReceipt,
} from '@/lib/sms-owner-field-worker';

// Mock enqueueSmsDelivery
vi.mock('@/lib/sms-delivery', () => ({
  enqueueSmsDelivery: vi.fn().mockResolvedValue({
    eventId: '00000000-0000-4000-8000-000000000099',
    state: 'queued',
    created: true,
  }),
}));

// Mock GoogleGenAI
const mockGenerateContent = vi.fn();

vi.mock('@google/genai', async () => {
  const actual = await vi.importActual<typeof import('@google/genai')>('@google/genai');
  return {
    ...actual,
    GoogleGenAI: vi.fn().mockImplementation(() => ({
      models: {
        generateContent: mockGenerateContent,
      },
    })),
  };
});

describe('Owner Field Intake Worker (Voice/Text-to-Job)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, GEMINI_API_KEY: 'test-gemini-key' };
  });

  it('declares all required tool schemas for field operations', () => {
    const toolNames = OWNER_FIELD_TOOLS_DECLARATION.map((t) => t.name);
    expect(toolNames).toContain('update_job');
    expect(toolNames).toContain('add_quote_line_item');
    expect(toolNames).toContain('add_job_task');
    expect(toolNames).toContain('create_quick_lead');
    expect(toolNames).toContain('report_ambiguity');
    expect(toolNames).toContain('no_action');
  });

  it('applies update_job tool (status, notes) and queues confirmation SMS', async () => {
    const accountId = '11111111-1111-4111-8111-111111111111';
    const jobId = '22222222-2222-4222-8222-222222222222';
    const receiptId = '33333333-3333-4333-8333-333333333333';

    mockGenerateContent.mockResolvedValueOnce({
      functionCalls: [
        {
          name: 'update_job',
          args: {
            jobId,
            status: 'complete',
            appendNotes: 'Customer very happy with trim paint.',
            confirmationMessage: '✅ Updated Job J-101 (Smith): Marked complete & saved note.',
          },
        },
      ],
    });

    const updateJobMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    });

    const insertJobFeedMock = vi.fn().mockResolvedValue({ data: null, error: null });

    const mockAdmin = {
      from: vi.fn((table: string) => {
        if (table === 'sms_webhook_receipts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: receiptId,
                    provider: 'signalwire',
                    provider_event_id: 'ev-1',
                    account_id: accountId,
                    from_number: '+15551234567',
                    to_number: '+19479412323',
                    message_body: 'Finished the Smith job on Main St, client was super happy with the trim',
                    media_urls: [],
                    sender_number_id: '44444444-4444-4444-8444-444444444444',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'accounts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: accountId,
                    business_name: 'Acme Contracting',
                    alert_phone: '+15551234567',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'jobs') {
          return {
            select: vi.fn((fields: string) => {
              if (fields === '*') {
                return {
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: {
                          id: jobId,
                          ref: 'J-101',
                          client_name: 'John Smith',
                          scope: 'Interior Painting',
                          status: 'in_progress',
                          quoted_amount: 1500,
                          quote_items: [{ id: 'item-1', label: 'Paint walls', amount: 1500, kind: 'base' }],
                        },
                        error: null,
                      }),
                    }),
                  }),
                };
              }
              return {
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({
                      data: [
                        {
                          id: jobId,
                          ref: 'J-101',
                          client_name: 'John Smith',
                          client_phone: '+15559876543',
                          address: '124 Main St',
                          scope: 'Interior Painting',
                          status: 'in_progress',
                          quoted_amount: 1500,
                          scheduled_for: '2026-08-28',
                          scheduled_time: '09:00',
                        },
                      ],
                      error: null,
                    }),
                  }),
                }),
              };
            }),
            update: updateJobMock,
          };
        }
        if (table === 'job_feed') {
          return {
            insert: insertJobFeedMock,
          };
        }
        return { select: vi.fn() };
      }),
    } as unknown as Parameters<typeof processOwnerFieldIntakeReceipt>[1];

    const result = await processOwnerFieldIntakeReceipt(receiptId, mockAdmin);

    expect(result.handled).toBe(true);
    expect(result.outcome).toBe('field_action_applied');
    expect(result.actionKind).toBe('update_job');
    expect(result.targetJobId).toBe(jobId);
    expect(result.confirmationText).toContain('✅ Updated Job J-101 (Smith)');

    expect(updateJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'complete',
        scope: expect.stringContaining('[Field Note]: Customer very happy with trim paint.'),
      }),
    );
    expect(insertJobFeedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        account_id: accountId,
        job_id: jobId,
        kind: 'field_sms_update',
      }),
    );
  });

  it('applies add_quote_line_item and recalculates total quoted amount', async () => {
    const accountId = '11111111-1111-4111-8111-111111111111';
    const jobId = '22222222-2222-4222-8222-222222222222';
    const receiptId = '33333333-3333-4333-8333-333333333333';

    mockGenerateContent.mockResolvedValueOnce({
      functionCalls: [
        {
          name: 'add_quote_line_item',
          args: {
            jobId,
            label: 'Extra copper pipe & fittings',
            amount: 350,
            kind: 'base',
            confirmationMessage: '✅ Added $350 Extra copper pipe & fittings to J-101. Total: $1,850.',
          },
        },
      ],
    });

    const updateJobMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    });

    const insertJobFeedMock = vi.fn().mockResolvedValue({ data: null, error: null });

    const mockAdmin = {
      from: vi.fn((table: string) => {
        if (table === 'sms_webhook_receipts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: receiptId,
                    provider: 'signalwire',
                    provider_event_id: 'ev-1',
                    account_id: accountId,
                    from_number: '+15551234567',
                    to_number: '+19479412323',
                    message_body: 'Add $350 for extra copper pipe to the Smith job',
                    media_urls: [],
                    sender_number_id: '44444444-4444-4444-8444-444444444444',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'accounts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: accountId,
                    business_name: 'Acme Plumbing',
                    alert_phone: '+15551234567',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'jobs') {
          return {
            select: vi.fn((fields: string) => {
              if (fields.includes('quote_items')) {
                return {
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: {
                          id: jobId,
                          quote_items: [{ id: 'item-1', label: 'Rough-in plumbing', amount: 1500, kind: 'base' }],
                          quoted_amount: 1500,
                        },
                        error: null,
                      }),
                    }),
                  }),
                };
              }
              return {
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({
                      data: [
                        {
                          id: jobId,
                          ref: 'J-101',
                          client_name: 'John Smith',
                          address: '124 Main St',
                          status: 'in_progress',
                          quoted_amount: 1500,
                        },
                      ],
                      error: null,
                    }),
                  }),
                }),
              };
            }),
            update: updateJobMock,
          };
        }
        if (table === 'job_feed') {
          return {
            insert: insertJobFeedMock,
          };
        }
        return { select: vi.fn() };
      }),
    } as unknown as Parameters<typeof processOwnerFieldIntakeReceipt>[1];

    const result = await processOwnerFieldIntakeReceipt(receiptId, mockAdmin);

    expect(result.handled).toBe(true);
    expect(result.outcome).toBe('field_action_applied');
    expect(result.actionKind).toBe('add_quote_line_item');

    expect(updateJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        quoted_amount: 1850,
        quote_items: expect.arrayContaining([
          expect.objectContaining({ label: 'Extra copper pipe & fittings', amount: 350 }),
        ]),
      }),
    );
  });

  it('handles ambiguity by queuing clarification SMS without modifying DB', async () => {
    const accountId = '11111111-1111-4111-8111-111111111111';
    const receiptId = '33333333-3333-4333-8333-333333333333';

    mockGenerateContent.mockResolvedValueOnce({
      functionCalls: [
        {
          name: 'report_ambiguity',
          args: {
            message: '⚠️ We found 2 Smith jobs (124 Main St and 88 Oak Ave). Reply with the address to apply this note.',
          },
        },
      ],
    });

    const mockAdmin = {
      from: vi.fn((table: string) => {
        if (table === 'sms_webhook_receipts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: receiptId,
                    provider: 'signalwire',
                    provider_event_id: 'ev-1',
                    account_id: accountId,
                    from_number: '+15551234567',
                    to_number: '+19479412323',
                    message_body: 'Add $100 to Smith',
                    media_urls: [],
                    sender_number_id: '44444444-4444-4444-8444-444444444444',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'accounts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: accountId, business_name: 'Acme', alert_phone: '+15551234567' },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'jobs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({
                    data: [
                      { id: 'j1', ref: 'J-1', client_name: 'Bob Smith', address: '124 Main St' },
                      { id: 'j2', ref: 'J-2', client_name: 'Alice Smith', address: '88 Oak Ave' },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return { select: vi.fn() };
      }),
    } as unknown as Parameters<typeof processOwnerFieldIntakeReceipt>[1];

    const result = await processOwnerFieldIntakeReceipt(receiptId, mockAdmin);

    expect(result.handled).toBe(true);
    expect(result.outcome).toBe('ambiguity_clarification_sent');
    expect(result.confirmationText).toContain('⚠️ We found 2 Smith jobs');
  });

  it('returns handled: false when no_action is called for casual chatter', async () => {
    const accountId = '11111111-1111-4111-8111-111111111111';
    const receiptId = '33333333-3333-4333-8333-333333333333';

    mockGenerateContent.mockResolvedValueOnce({
      functionCalls: [
        {
          name: 'no_action',
          args: {
            reason: 'Message is casual greeting, no job update requested',
          },
        },
      ],
    });

    const mockAdmin = {
      from: vi.fn((table: string) => {
        if (table === 'sms_webhook_receipts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: receiptId,
                    provider: 'signalwire',
                    provider_event_id: 'ev-1',
                    account_id: accountId,
                    from_number: '+15551234567',
                    to_number: '+19479412323',
                    message_body: 'Hey how is the weather today?',
                    media_urls: [],
                    sender_number_id: '44444444-4444-4444-8444-444444444444',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'accounts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: accountId, business_name: 'Acme', alert_phone: '+15551234567' },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'jobs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
          };
        }
        return { select: vi.fn() };
      }),
    } as unknown as Parameters<typeof processOwnerFieldIntakeReceipt>[1];

    const result = await processOwnerFieldIntakeReceipt(receiptId, mockAdmin);

    expect(result.handled).toBe(false);
    expect(result.outcome).toBe('no_action');
  });
});
