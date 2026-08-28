import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OWNER_FIELD_TOOLS_DECLARATION,
  processOwnerFieldClaim,
} from '@/lib/sms-owner-field-worker';
import {
  formatFieldClientConfirmation,
  formatFieldCostConfirmation,
  formatFieldCrewConfirmation,
  formatFieldLeadConfirmation,
  formatFieldNoteConfirmation,
  formatFieldScheduleConfirmation,
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

    const schedConfirm = formatFieldScheduleConfirmation('J-101', 'John Smith', '2026-09-01');
    expect(schedConfirm).toBe('[LGQ] J-101 (John Smith): Scheduled for 2026-09-01.');
    expect(schedConfirm.length).toBeLessThanOrEqual(160);

    const clientConfirm = formatFieldClientConfirmation('Dave Miller');
    expect(clientConfirm).toBe('[LGQ] Updated client profile for Dave Miller.');
    expect(clientConfirm.length).toBeLessThanOrEqual(160);

    const crewConfirm = formatFieldCrewConfirmation('J-101', 'John Smith', 'Mike');
    expect(crewConfirm).toBe('[LGQ] Assigned Mike to J-101 (John Smith).');
    expect(crewConfirm.length).toBeLessThanOrEqual(160);
  });
});

describe('Owner Field Intake Claim Worker (Async & Atomic)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, GEMINI_API_KEY: 'test-gemini-key' };
  });

  function createMockQueryBuilder(resolvedData: unknown = []) {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn().mockReturnValue(builder);
    builder.eq = vi.fn().mockReturnValue(builder);
    builder.order = vi.fn().mockReturnValue(builder);
    builder.limit = vi.fn().mockResolvedValue({ data: resolvedData, error: null });
    builder.maybeSingle = vi.fn().mockResolvedValue({ data: resolvedData, error: null });
    return builder;
  }

  it('declares all required refined intent tools including leads, jobs, schedule, clients, crew', () => {
    const toolNames = OWNER_FIELD_TOOLS_DECLARATION.map((t) => t.name);
    expect(toolNames).toContain('append_internal_note');
    expect(toolNames).toContain('log_cost');
    expect(toolNames).toContain('add_job_task');
    expect(toolNames).toContain('reschedule_job');
    expect(toolNames).toContain('update_client');
    expect(toolNames).toContain('assign_crew');
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
          return createMockQueryBuilder({
            id: taskId,
            provider: 'signalwire',
            account_id: accountId,
            from_number: '+15551234567',
            message_body: 'Gate code for Smith job on Main St is 4821',
            media_urls: [],
          });
        }
        if (table === 'accounts') {
          return createMockQueryBuilder({ id: accountId, business_name: 'Acme General Contracting' });
        }
        if (table === 'jobs') {
          return createMockQueryBuilder([
            {
              id: jobId,
              ref: 'J-101',
              client_name: 'John Smith',
              address: '124 Main St',
              status: 'in_progress',
              quoted_amount: 2500,
            },
          ]);
        }
        return createMockQueryBuilder([]);
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

  it('processes reschedule_job intent correctly', async () => {
    const accountId = '11111111-1111-4111-8111-111111111111';
    const taskId = '22222222-2222-4222-8222-222222222222';
    const claimToken = '33333333-3333-4333-8333-333333333333';
    const jobId = '44444444-4444-4444-8444-444444444444';

    const claim: SmsInboundActionClaim = {
      taskId,
      claimToken,
      provider: 'signalwire',
      providerEventId: 'ev-102',
      accountId,
      senderNumberId: '55555555-5555-4555-8555-555555555555',
      senderPurpose: 'lgq_shared',
      fromNumber: '+15551234567',
    };

    mockGenerateContent.mockResolvedValueOnce({
      text: 'Reschedule Smith to Friday 2026-09-04',
      functionCalls: [
        {
          name: 'reschedule_job',
          args: {
            jobId,
            scheduled_for: '2026-09-04',
            scheduled_time: '10:00',
          },
        },
      ],
    });

    const mockRpc = vi.fn().mockResolvedValue({
      data: { target_id: jobId, intent: 'reschedule_job' },
      error: null,
    });

    const mockAdmin = {
      rpc: mockRpc,
      from: vi.fn((table: string) => {
        if (table === 'sms_webhook_receipts') {
          return createMockQueryBuilder({
            id: taskId,
            provider: 'signalwire',
            account_id: accountId,
            from_number: '+15551234567',
            message_body: 'Move Smith job to Friday Sept 4th at 10am',
            media_urls: [],
          });
        }
        if (table === 'accounts') {
          return createMockQueryBuilder({ id: accountId, business_name: 'Acme' });
        }
        if (table === 'jobs') {
          return createMockQueryBuilder([
            { id: jobId, ref: 'J-101', client_name: 'John Smith', address: '124 Main St' },
          ]);
        }
        return createMockQueryBuilder([]);
      }),
    } as unknown as Parameters<typeof processOwnerFieldClaim>[1];

    const result = await processOwnerFieldClaim(claim, mockAdmin);

    expect(result.handled).toBe(true);
    expect(result.outcome).toBe('completed');
    expect(result.intent).toBe('reschedule_job');
    expect(result.confirmationText).toBe('[LGQ] J-101 (John Smith): Scheduled for 2026-09-04.');

    expect(mockRpc).toHaveBeenCalledWith('apply_owner_field_action', expect.objectContaining({
      p_intent: 'reschedule_job',
      p_params: expect.objectContaining({ scheduled_for: '2026-09-04' }),
    }));
  });

  it('processes receipt photo OCR and logs itemized material cost with vendor', async () => {
    const accountId = '11111111-1111-4111-8111-111111111111';
    const taskId = '22222222-2222-4222-8222-222222222222';
    const claimToken = '33333333-3333-4333-8333-333333333333';
    const jobId = '44444444-4444-4444-8444-444444444444';

    const claim: SmsInboundActionClaim = {
      taskId,
      claimToken,
      provider: 'signalwire',
      providerEventId: 'ev-103',
      accountId,
      senderNumberId: '55555555-5555-4555-8555-555555555555',
      senderPurpose: 'lgq_shared',
      fromNumber: '+15551234567',
    };

    mockGenerateContent.mockResolvedValueOnce({
      text: 'Home Depot receipt for $148.50 (Plumbing fittings)',
      functionCalls: [
        {
          name: 'log_cost',
          args: {
            jobId,
            amount: 148.5,
            vendor: 'Home Depot',
            itemsSummary: 'Plumbing fittings',
            label: 'Home Depot: Plumbing fittings',
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
          return createMockQueryBuilder({
            id: taskId,
            provider: 'signalwire',
            account_id: accountId,
            from_number: '+15551234567',
            message_body: 'Home Depot receipt for Smith',
            media_urls: ['https://example.com/receipt.jpg'],
          });
        }
        if (table === 'accounts') {
          return createMockQueryBuilder({ id: accountId, business_name: 'Acme Pro', alert_phone: '+15551234567' });
        }
        if (table === 'jobs') {
          return createMockQueryBuilder([
            { id: jobId, ref: 'J-101', client_name: 'John Smith', address: '124 Main St' },
          ]);
        }
        return createMockQueryBuilder([]);
      }),
    } as unknown as Parameters<typeof processOwnerFieldClaim>[1];

    const result = await processOwnerFieldClaim(claim, mockAdmin);

    expect(result.handled).toBe(true);
    expect(result.outcome).toBe('completed');
    expect(result.intent).toBe('log_cost');
    expect(result.confirmationText).toBe('[LGQ] J-101 (John Smith): Logged $148.50 Home Depot receipt (Plumbing fittings).');
    expect(result.confirmationText?.length).toBeLessThanOrEqual(160);

    expect(mockRpc).toHaveBeenCalledWith('apply_owner_field_action', expect.objectContaining({
      p_intent: 'log_cost',
      p_params: expect.objectContaining({
        amount: 148.5,
        vendor: 'Home Depot',
        itemsSummary: 'Plumbing fittings',
      }),
    }));
  });

  it('adds quote line item with Reply SEND action prompt and executes 1-tap client send', async () => {
    const accountId = '11111111-1111-4111-8111-111111111111';
    const taskId = '22222222-2222-4222-8222-222222222222';
    const claimToken = '33333333-3333-4333-8333-333333333333';
    const jobId = '44444444-4444-4444-8444-444444444444';

    const claim: SmsInboundActionClaim = {
      taskId,
      claimToken,
      provider: 'signalwire',
      providerEventId: 'ev-104',
      accountId,
      senderNumberId: '55555555-5555-4555-8555-555555555555',
      senderPurpose: 'lgq_shared',
      fromNumber: '+15551234567',
    };

    // Step 1: Add quote line item
    mockGenerateContent.mockResolvedValueOnce({
      text: 'Add $450 to Smith job for extra outlet',
      functionCalls: [
        {
          name: 'add_quote_line_item',
          args: {
            jobId,
            amount: 450,
            description: 'Extra outlet in pantry',
          },
        },
      ],
    });

    const mockRpc = vi.fn().mockResolvedValue({
      data: { target_id: jobId, intent: 'add_quote_line_item' },
      error: null,
    });

    const mockAdmin = {
      rpc: mockRpc,
      from: vi.fn((table: string) => {
        if (table === 'sms_webhook_receipts') {
          return createMockQueryBuilder({
            id: taskId,
            provider: 'signalwire',
            account_id: accountId,
            from_number: '+15551234567',
            message_body: 'Add $450 to Smith job for pantry outlet',
            media_urls: [],
          });
        }
        if (table === 'accounts') {
          return createMockQueryBuilder({ id: accountId, business_name: 'Acme Pro', alert_phone: '+15551234567' });
        }
        if (table === 'jobs') {
          return createMockQueryBuilder([
            { id: jobId, ref: 'J-101', client_name: 'John Smith', address: '124 Main St', quoted_amount: 2800, client_phone: '(248) 555-0123' },
          ]);
        }
        return createMockQueryBuilder([]);
      }),
    } as unknown as Parameters<typeof processOwnerFieldClaim>[1];

    const result1 = await processOwnerFieldClaim(claim, mockAdmin);

    expect(result1.handled).toBe(true);
    expect(result1.outcome).toBe('completed');
    expect(result1.intent).toBe('add_quote_line_item');
    expect(result1.confirmationText).toContain('Reply SEND to text approval link to client.');
    expect(result1.confirmationText?.length).toBeLessThanOrEqual(160);

    // Step 2: Owner replies "SEND"
    mockGenerateContent.mockResolvedValueOnce({
      text: 'SEND',
      functionCalls: [
        {
          name: 'send_client_quote_link',
          args: {
            jobId,
          },
        },
      ],
    });

    const result2 = await processOwnerFieldClaim(claim, mockAdmin);
    expect(result2.handled).toBe(true);
    expect(result2.outcome).toBe('completed');
    expect(result2.intent).toBe('send_client_quote_link');
    expect(result2.confirmationText).toBe('[LGQ] J-101: Updated quote approval link sent to John Smith ((248) 555-0123).');
    expect(result2.confirmationText?.length).toBeLessThanOrEqual(160);
  });
});
