import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OWNER_FIELD_TOOLS_DECLARATION,
  processOwnerFieldClaim,
} from '@/lib/sms-owner-field-worker';
import {
  formatFieldCostConfirmation,
  formatFieldLeadConfirmation,
  formatFieldNoteConfirmation,
  formatFieldTaskConfirmation,
  sanitizeGsm7Text,
} from '@/lib/sms-field-templates';
import type { SmsInboundActionClaim } from '@/lib/sms-inbound-action-worker';

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

describe('GSM-7 Confirmation Templates', () => {
  it('sanitizes curly quotes, em-dashes and emojis to pure GSM-7 ASCII', () => {
    const raw = '“Hello”—here’s the gate code: 1234 🚪';
    const clean = sanitizeGsm7Text(raw);
    expect(clean).toBe('"Hello"-here\'s the gate code: 1234');
    // Ensure no characters outside printable ASCII (0x20 - 0x7E)
    expect(/^[\x20-\x7E]+$/.test(clean)).toBe(true);
  });

  it('formats deterministic ASCII confirmation strings under 160 chars', () => {
    const noteConfirm = formatFieldNoteConfirmation('J-101', 'John Smith');
    expect(noteConfirm).toBe('[LGQ] J-101 (John Smith): Logged field note.');
    expect(noteConfirm.length).toBeLessThanOrEqual(160);

    const costConfirm = formatFieldCostConfirmation('J-101', 'John Smith', 75, 'material');
    expect(costConfirm).toBe('[LGQ] J-101 (John Smith): Logged $75.00 material cost.');
    expect(costConfirm.length).toBeLessThanOrEqual(160);

    const taskConfirm = formatFieldTaskConfirmation('J-101', 'John Smith', 'Pick up 4 bags of mortar');
    expect(taskConfirm).toBe('[LGQ] J-101 (John Smith): Added task "Pick up 4 bags of mortar".');
    expect(taskConfirm.length).toBeLessThanOrEqual(160);

    const leadConfirm = formatFieldLeadConfirmation('Jane Doe');
    expect(leadConfirm).toBe('[LGQ] Created new lead for Jane Doe.');
    expect(leadConfirm.length).toBeLessThanOrEqual(160);
  });
});

describe('Owner Field Intake Claim Worker (Async & Atomic)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, GEMINI_API_KEY: 'test-gemini-key' };
  });

  it('declares all required refined intent tools', () => {
    const toolNames = OWNER_FIELD_TOOLS_DECLARATION.map((t) => t.name);
    expect(toolNames).toContain('append_internal_note');
    expect(toolNames).toContain('log_cost');
    expect(toolNames).toContain('add_job_task');
    expect(toolNames).toContain('create_lead');
    expect(toolNames).toContain('report_ambiguity');
    expect(toolNames).toContain('no_action');
  });

  it('processes append_internal_note and invokes atomic RPC apply_owner_field_action', async () => {
    const accountId = '11111111-1111-4111-8111-111111111111';
    const taskId = '22222222-2222-4222-8222-222222222222';
    const claimToken = '33333333-3333-4333-8333-333333333333';
    const jobId = '44444444-4444-4444-8444-444444444444';

    const claim: SmsInboundActionClaim = {
      taskId,
      claimToken,
      provider: 'signalwire',
      providerEventId: 'ev-100',
      accountId,
      senderNumberId: '55555555-5555-4555-8555-555555555555',
      senderPurpose: 'lgq_shared',
      fromNumber: '+15551234567',
    };

    mockGenerateContent.mockResolvedValueOnce({
      text: 'Gate code for the Smith job is 4821',
      functionCalls: [
        {
          name: 'append_internal_note',
          args: {
            jobId,
            note: 'Gate code is 4821',
          },
        },
      ],
    });

    const mockRpc = vi.fn().mockResolvedValue({
      data: { target_id: jobId, intent: 'append_internal_note' },
      error: null,
    });

    const mockAdmin = {
      rpc: mockRpc,
      from: vi.fn((table: string) => {
        if (table === 'sms_webhook_receipts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: taskId,
                    provider: 'signalwire',
                    account_id: accountId,
                    from_number: '+15551234567',
                    message_body: 'Gate code for Smith job on Main St is 4821',
                    media_urls: [],
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
                  data: { id: accountId, business_name: 'Acme General Contracting' },
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
                      {
                        id: jobId,
                        ref: 'J-101',
                        client_name: 'John Smith',
                        address: '124 Main St',
                        status: 'in_progress',
                        quoted_amount: 2500,
                      },
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
    } as unknown as Parameters<typeof processOwnerFieldClaim>[1];

    const result = await processOwnerFieldClaim(claim, mockAdmin);

    expect(result.handled).toBe(true);
    expect(result.outcome).toBe('completed');
    expect(result.intent).toBe('append_internal_note');
    expect(result.confirmationText).toBe('[LGQ] J-101 (John Smith): Logged field note.');

    expect(mockRpc).toHaveBeenCalledWith('apply_owner_field_action', {
      p_task_id: taskId,
      p_claim_token: claimToken,
      p_intent: 'append_internal_note',
      p_params: { jobId, note: 'Gate code is 4821' },
      p_transcript: 'Gate code for the Smith job is 4821',
      p_confirmation_text: '[LGQ] J-101 (John Smith): Logged field note.',
    });
  });

  it('processes log_cost and formats GSM-7 material cost confirmation', async () => {
    const accountId = '11111111-1111-4111-8111-111111111111';
    const taskId = '22222222-2222-4222-8222-222222222222';
    const claimToken = '33333333-3333-4333-8333-333333333333';
    const jobId = '44444444-4444-4444-8444-444444444444';

    const claim: SmsInboundActionClaim = {
      taskId,
      claimToken,
      provider: 'signalwire',
      providerEventId: 'ev-101',
      accountId,
      senderNumberId: '55555555-5555-4555-8555-555555555555',
      senderPurpose: 'lgq_shared',
      fromNumber: '+15551234567',
    };

    mockGenerateContent.mockResolvedValueOnce({
      text: 'Used $75 of cement on Smith job',
      functionCalls: [
        {
          name: 'log_cost',
          args: {
            jobId,
            amount: 75,
            label: '3 bags of cement',
            costType: 'material',
          },
        },
      ],
    });

    const mockRpc = vi.fn().mockResolvedValue({
      data: { target_id: jobId, intent: 'log_cost' },
      error: null,
    });

    const mockAdmin = {
      rpc: mockRpc,
      from: vi.fn((table: string) => {
        if (table === 'sms_webhook_receipts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: taskId,
                    provider: 'signalwire',
                    account_id: accountId,
                    from_number: '+15551234567',
                    message_body: 'Used $75 of cement on the Smith job',
                    media_urls: [],
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
                  data: { id: accountId, business_name: 'Acme' },
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
                      { id: jobId, ref: 'J-101', client_name: 'John Smith', address: '124 Main St' },
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
    } as unknown as Parameters<typeof processOwnerFieldClaim>[1];

    const result = await processOwnerFieldClaim(claim, mockAdmin);

    expect(result.handled).toBe(true);
    expect(result.outcome).toBe('completed');
    expect(result.intent).toBe('log_cost');
    expect(result.confirmationText).toBe('[LGQ] J-101 (John Smith): Logged $75.00 3 bags of cement cost.');

    expect(mockRpc).toHaveBeenCalledWith('apply_owner_field_action', expect.objectContaining({
      p_intent: 'log_cost',
      p_params: expect.objectContaining({ amount: 75 }),
    }));
  });
});
