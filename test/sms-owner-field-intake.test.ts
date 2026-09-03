import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  fieldCostValidationError,
  normalizeFieldActionParams,
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
const { mockBeginFieldUsage, mockCommitFieldUsage } = vi.hoisted(() => ({
  mockBeginFieldUsage: vi.fn(),
  mockCommitFieldUsage: vi.fn(),
}));

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

vi.mock('@/lib/sms-field-intake-usage', () => ({
  beginSmsFieldIntakeUsage: mockBeginFieldUsage,
  commitSmsFieldIntakeUsage: mockCommitFieldUsage,
}));

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

describe('Owner Field Intake Schema Contract', () => {
  const worker = readFileSync(
    new URL('../src/lib/sms-owner-field-worker.ts', import.meta.url),
    'utf8',
  );
  const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');

  it('orders jobs by the real created_at column and selects no nonexistent account owner_name', () => {
    expect(schema).toMatch(/create table if not exists jobs \([\s\S]*?created_at\s+timestamptz/i);
    expect(schema).toMatch(/alter table accounts add column if not exists alert_phone text/i);
    expect(schema).not.toMatch(/(?:create|alter)\s+table[^;]*accounts[^;]*owner_name/i);

    const contextQuery = worker.slice(
      worker.indexOf(".from('accounts')"),
      worker.indexOf('const activeJobs:'),
    );
    const jobsQuery = contextQuery.slice(
      contextQuery.indexOf(".from('jobs')"),
      contextQuery.indexOf(".from('clients')"),
    );
    expect(contextQuery).toContain(".select('id, business_name, alert_phone, high_value_sms_enabled, suspended_at')");
    expect(contextQuery).toContain(".is('suspended_at', null)");
    expect(contextQuery).toContain("sms_consent_scopes!inner(consent_scope)");
    expect(contextQuery).toContain(".eq('sms_consent_scopes.consent_scope', 'owner')");
    expect(jobsQuery).toContain(".order('created_at', { ascending: false })");
    expect(contextQuery).not.toContain('owner_name');
    expect(jobsQuery).not.toContain(".order('updated_at', { ascending: false })");
  });
});

describe('Owner Field Intake Claim Worker (Async & Atomic)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, GEMINI_API_KEY: 'test-gemini-key' };
    mockBeginFieldUsage.mockResolvedValue({
      kind: 'allowed',
      lease: {
        reservationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        finalizationKey: 'field-intake-ai-commit-test',
        needsCommit: true,
      },
    });
    mockCommitFieldUsage.mockResolvedValue(true);
  });

  function createMockQueryBuilder(resolvedData: unknown = []) {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn().mockReturnValue(builder);
    builder.eq = vi.fn().mockReturnValue(builder);
    builder.is = vi.fn().mockReturnValue(builder);
    builder.order = vi.fn().mockReturnValue(builder);
    builder.limit = vi.fn().mockResolvedValue({ data: resolvedData, error: null });
    builder.maybeSingle = vi.fn().mockResolvedValue({ data: resolvedData, error: null });
    return builder;
  }

  const smsMessageId = '99999999-9999-4999-8999-999999999999';
  const smsReceiptId = '88888888-8888-4888-8888-888888888888';

  function fieldMessageQuery(
    table: string,
    body: string,
    mediaUrls: string[] = [],
  ) {
    if (table === 'sms_inbound_action_tasks') {
      return createMockQueryBuilder({
        webhook_receipt_id: smsReceiptId,
        sms_message_id: smsMessageId,
      });
    }
    if (table === 'sms_webhook_receipts') {
      return createMockQueryBuilder({ id: smsReceiptId, to_number: '+12485550141' });
    }
    if (table === 'sms_messages') {
      return createMockQueryBuilder({ id: smsMessageId, body, media_urls: mediaUrls });
    }
    return null;
  }

  function createFieldRpcMock(
    applyResult: { data: unknown; error: { message: string } | null } = {
      data: { target_id: null, intent: 'no_action' },
      error: null,
    },
  ) {
    return vi.fn(async (functionName: string, _args?: Record<string, unknown>) => {
      if (functionName === 'extend_sms_inbound_action_field_lease') {
        return { data: true, error: null };
      }
      if (functionName === 'apply_authorized_sms_field_action') {
        return applyResult;
      }
      return { data: null, error: null };
    });
  }

  async function runOwnerMediaClaim(
    provider: SmsInboundActionClaim['provider'],
    mediaUrls: string[],
  ) {
    const accountId = '11111111-1111-4111-8111-111111111111';
    const claim: SmsInboundActionClaim = {
      taskId: '22222222-2222-4222-8222-222222222222',
      claimToken: '33333333-3333-4333-8333-333333333333',
      provider,
      providerEventId: 'ev-media-security',
      accountId,
      senderNumberId: '55555555-5555-4555-8555-555555555555',
      senderPurpose: 'lgq_shared',
      fromNumber: '+15551234567',
      effectApplied: false,
    };
    mockGenerateContent.mockResolvedValueOnce({
      text: 'Media security test',
      functionCalls: [{ name: 'no_action', args: { reason: 'Test media intake' } }],
    });
    const mockAdmin = {
      rpc: createFieldRpcMock(),
      from: vi.fn((table: string) => {
        const messageQuery = fieldMessageQuery(table, 'Attached media', mediaUrls);
        if (messageQuery) return messageQuery;
        if (table === 'accounts') {
          return createMockQueryBuilder({
            id: accountId,
            business_name: 'Acme',
            alert_phone: '+15551234567',
            high_value_sms_enabled: true,
          });
        }
        return createMockQueryBuilder([]);
      }),
    } as unknown as Parameters<typeof processOwnerFieldClaim>[1];

    const result = await processOwnerFieldClaim(claim, mockAdmin);
    const request = mockGenerateContent.mock.calls.at(-1)?.[0] as {
      contents?: Array<{ parts?: Array<{ inlineData?: unknown; text?: string }> }>;
    };
    return {
      result,
      parts: request.contents?.[0]?.parts ?? [],
    };
  }

  it.each([
    {
      leaseResult: { data: false, error: null },
      expectedError: /lease is no longer active/i,
    },
    {
      leaseResult: { data: null, error: { message: 'lease update failed' } },
      expectedError: /unable to extend field intake lease: lease update failed/i,
    },
  ])('fails closed before reads, media, or Gemini when lease extension fails', async ({
    leaseResult,
    expectedError,
  }) => {
    const taskId = '22222222-2222-4222-8222-222222222222';
    const claimToken = '33333333-3333-4333-8333-333333333333';
    const claim: SmsInboundActionClaim = {
      taskId,
      claimToken,
      provider: 'signalwire',
      providerEventId: 'ev-expired-lease',
      accountId: '11111111-1111-4111-8111-111111111111',
      senderNumberId: '55555555-5555-4555-8555-555555555555',
      senderPurpose: 'lgq_shared',
      fromNumber: '+15551234567',
      effectApplied: false,
    };
    const mockRpc = vi.fn().mockResolvedValue(leaseResult);
    const mockFrom = vi.fn();
    const mockAdmin = {
      rpc: mockRpc,
      from: mockFrom,
    } as unknown as Parameters<typeof processOwnerFieldClaim>[1];

    await expect(processOwnerFieldClaim(claim, mockAdmin)).resolves.toMatchObject({
      handled: false,
      outcome: 'error',
      errorMessage: expect.stringMatching(expectedError),
    });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('extend_sms_inbound_action_field_lease', {
      p_task_id: taskId,
      p_claim_token: claimToken,
    });
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('atomically completes no_credits without Gemini or a domain action', async () => {
    const accountId = '11111111-1111-4111-8111-111111111111';
    const taskId = '22222222-2222-4222-8222-222222222222';
    const claimToken = '33333333-3333-4333-8333-333333333333';
    const claim: SmsInboundActionClaim = {
      taskId,
      claimToken,
      provider: 'signalwire',
      providerEventId: 'ev-no-ai-credits',
      accountId,
      senderNumberId: '55555555-5555-4555-8555-555555555555',
      senderPurpose: 'lgq_shared',
      fromNumber: '+15551234567',
      effectApplied: false,
    };
    mockBeginFieldUsage.mockResolvedValue({ kind: 'no_credits' });
    const mockRpc = createFieldRpcMock({
      data: { target_id: null, intent: 'no_action' },
      error: null,
    });
    const mockAdmin = {
      rpc: mockRpc,
      from: vi.fn((table: string) => {
        const messageQuery = fieldMessageQuery(table, 'Log a note on the Smith job');
        if (messageQuery) return messageQuery;
        if (table === 'accounts') {
          return createMockQueryBuilder({
            id: accountId,
            business_name: 'Acme',
            alert_phone: claim.fromNumber,
            high_value_sms_enabled: true,
          });
        }
        return createMockQueryBuilder([]);
      }),
    } as unknown as Parameters<typeof processOwnerFieldClaim>[1];

    await expect(processOwnerFieldClaim(claim, mockAdmin)).resolves.toMatchObject({
      handled: true,
      outcome: 'no_action',
      intent: 'no_action',
      errorMessage: 'No AI Intake credits are available',
      confirmationText: expect.stringMatching(/No AI Intake credits remain/),
    });

    expect(mockBeginFieldUsage).toHaveBeenCalledWith(mockAdmin, {
      accountId,
      taskId,
    });
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(mockCommitFieldUsage).not.toHaveBeenCalled();
    const actionCalls = mockRpc.mock.calls.filter(([name]) => name === 'apply_authorized_sms_field_action');
    expect(actionCalls).toHaveLength(1);
    expect(actionCalls[0]?.[1]).toEqual({
      p_task_id: taskId,
      p_claim_token: claimToken,
      p_intent: 'no_action',
      p_params: { reason: 'No AI Intake credits are available' },
      p_transcript: 'Log a note on the Smith job',
      p_confirmation_text: expect.stringMatching(/No AI Intake credits remain/),
    });
  });

  it('does not apply a domain action when usage commit fails', async () => {
    const accountId = '11111111-1111-4111-8111-111111111111';
    const taskId = '22222222-2222-4222-8222-222222222222';
    const claim: SmsInboundActionClaim = {
      taskId,
      claimToken: '33333333-3333-4333-8333-333333333333',
      provider: 'signalwire',
      providerEventId: 'ev-usage-commit-failed',
      accountId,
      senderNumberId: '55555555-5555-4555-8555-555555555555',
      senderPurpose: 'lgq_shared',
      fromNumber: '+15551234567',
      effectApplied: false,
    };
    mockGenerateContent.mockResolvedValueOnce({
      text: 'Gate code is 4821',
      functionCalls: [{
        name: 'append_internal_note',
        args: {
          jobId: '44444444-4444-4444-8444-444444444444',
          note: 'Gate code is 4821',
        },
      }],
    });
    mockCommitFieldUsage.mockResolvedValue(false);
    const mockRpc = createFieldRpcMock({
      data: { target_id: null, intent: 'append_internal_note' },
      error: null,
    });
    const mockAdmin = {
      rpc: mockRpc,
      from: vi.fn((table: string) => {
        const messageQuery = fieldMessageQuery(table, 'Log gate code 4821 on Smith');
        if (messageQuery) return messageQuery;
        if (table === 'accounts') {
          return createMockQueryBuilder({
            id: accountId,
            business_name: 'Acme',
            alert_phone: claim.fromNumber,
            high_value_sms_enabled: true,
          });
        }
        return createMockQueryBuilder([]);
      }),
    } as unknown as Parameters<typeof processOwnerFieldClaim>[1];

    await expect(processOwnerFieldClaim(claim, mockAdmin)).resolves.toMatchObject({
      handled: false,
      outcome: 'error',
      errorMessage: 'AI intake usage reservation could not be committed',
    });

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockCommitFieldUsage).toHaveBeenCalledWith(
      mockAdmin,
      expect.objectContaining({ reservationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
    );
    expect(mockRpc).not.toHaveBeenCalledWith('apply_authorized_sms_field_action', expect.anything());
  });

  it('offers Gemini only intents the atomic SQL rail actually implements', () => {
    const toolNames = OWNER_FIELD_TOOLS_DECLARATION.map((t) => t.name);
    expect(toolNames).toEqual([
      'append_internal_note',
      'log_cost',
      'add_job_task',
      'create_lead',
      'report_ambiguity',
      'no_action',
    ]);

    const createLead = OWNER_FIELD_TOOLS_DECLARATION.find((tool) => tool.name === 'create_lead');
    expect(createLead?.description).toMatch(/create a new job or estimate[\s\S]*stage the request as a lead/i);
    expect(createLead?.parameters.required).toEqual(['clientName', 'notes']);
    expect(createLead?.parameters.properties?.notes?.description).toMatch(/address\/location[\s\S]*dollar estimate/i);
  });

  it('normalizes Gemini camelCase arguments to the SQL JSON contract', () => {
    expect(normalizeFieldActionParams({
      jobId: 'job-1',
      costType: 'material',
      itemsSummary: 'Copper fittings',
      candidateJobIds: ['job-1', 'job-2'],
      nestedValue: { clientPhone: '+15551234567' },
    })).toEqual({
      job_id: 'job-1',
      cost_type: 'material',
      items_summary: 'Copper fittings',
      candidate_job_ids: ['job-1', 'job-2'],
      nested_value: { client_phone: '+15551234567' },
    });
  });

  it('rejects non-finite, non-positive, oversized, and untyped field costs', () => {
    expect(fieldCostValidationError({ amount: Number.NaN, cost_type: 'material' })).toMatch(/positive number/i);
    expect(fieldCostValidationError({ amount: Number.POSITIVE_INFINITY, cost_type: 'material' })).toMatch(/positive number/i);
    expect(fieldCostValidationError({ amount: 0, cost_type: 'material' })).toMatch(/positive number/i);
    expect(fieldCostValidationError({ amount: 1_000_000.01, cost_type: 'material' })).toMatch(/positive number/i);
    expect(fieldCostValidationError({ amount: '45', cost_type: 'material' })).toMatch(/positive number/i);
    expect(fieldCostValidationError({ amount: 45, cost_type: 'equipment' })).toMatch(/cost type/i);
    expect(fieldCostValidationError({ amount: 45, cost_type: 'receipt' })).toBeNull();
  });

  it('processes append_internal_note through the authorized atomic RPC', async () => {
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
      effectApplied: false,
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

    const mockRpc = createFieldRpcMock({
      data: { target_id: jobId, intent: 'append_internal_note' },
      error: null,
    });

    const mockFrom = vi.fn((table: string) => {
      const messageQuery = fieldMessageQuery(table, 'Gate code for Smith job on Main St is 4821');
      if (messageQuery) return messageQuery;
      if (table === 'accounts') {
        return createMockQueryBuilder({
          id: accountId,
          business_name: 'Acme General Contracting',
          alert_phone: '+15551234567',
          high_value_sms_enabled: true,
        });
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
    });
    const mockAdmin = {
      rpc: mockRpc,
      from: mockFrom,
    } as unknown as Parameters<typeof processOwnerFieldClaim>[1];

    const result = await processOwnerFieldClaim(claim, mockAdmin);

    expect(result.handled).toBe(true);
    expect(result.outcome).toBe('completed');
    expect(result.intent).toBe('append_internal_note');
    expect(result.confirmationText).toContain('[LGQ] J-101 (John Smith): Logged field note.');
    expect(result.confirmationText).toContain(`/field/intake/${taskId}`);
    expect(mockFrom).toHaveBeenCalledWith('sms_inbound_action_tasks');
    expect(mockFrom).toHaveBeenCalledWith('sms_webhook_receipts');
    expect(mockFrom).toHaveBeenCalledWith('sms_messages');
    expect(mockRpc).toHaveBeenNthCalledWith(1, 'extend_sms_inbound_action_field_lease', {
      p_task_id: taskId,
      p_claim_token: claimToken,
    });

    expect(mockRpc).toHaveBeenCalledWith('apply_authorized_sms_field_action', {
      p_task_id: taskId,
      p_claim_token: claimToken,
      p_intent: 'append_internal_note',
      p_params: { job_id: jobId, note: 'Gate code is 4821' },
      p_transcript: 'Gate code for the Smith job is 4821',
      p_confirmation_text: expect.stringContaining(`/field/intake/${taskId}`),
    });
  });

  it('atomically finalizes an explicit Gemini no_action result', async () => {
    const accountId = '11111111-1111-4111-8111-111111111111';
    const taskId = '22222222-2222-4222-8222-222222222222';
    const claim: SmsInboundActionClaim = {
      taskId,
      claimToken: '33333333-3333-4333-8333-333333333333',
      provider: 'signalwire',
      providerEventId: 'ev-no-action',
      accountId,
      senderNumberId: '55555555-5555-4555-8555-555555555555',
      senderPurpose: 'lgq_shared',
      fromNumber: '+15551234567',
      effectApplied: false,
    };
    mockGenerateContent.mockResolvedValueOnce({
      text: 'Thanks',
      functionCalls: [{ name: 'no_action', args: { reason: 'Conversational reply' } }],
    });
    const mockRpc = createFieldRpcMock({
      data: { target_id: null, intent: 'no_action' },
      error: null,
    });
    const mockAdmin = {
      rpc: mockRpc,
      from: vi.fn((table: string) => {
        const messageQuery = fieldMessageQuery(table, 'Thanks');
        if (messageQuery) return messageQuery;
        if (table === 'accounts') {
          return createMockQueryBuilder({
            id: accountId,
            business_name: 'Acme',
            alert_phone: '+15551234567',
            high_value_sms_enabled: true,
          });
        }
        return createMockQueryBuilder([]);
      }),
    } as unknown as Parameters<typeof processOwnerFieldClaim>[1];

    await expect(processOwnerFieldClaim(claim, mockAdmin)).resolves.toMatchObject({
      handled: true,
      outcome: 'no_action',
      intent: 'no_action',
      errorMessage: 'Conversational reply',
    });
    expect(mockRpc).toHaveBeenCalledWith('apply_authorized_sms_field_action', expect.objectContaining({
      p_task_id: taskId,
      p_intent: 'no_action',
      p_params: { reason: 'Conversational reply' },
      p_confirmation_text: '',
    }));
  });

  it('atomically finalizes a missing Gemini function call as no_action', async () => {
    const accountId = '11111111-1111-4111-8111-111111111111';
    const taskId = '22222222-2222-4222-8222-222222222222';
    const claimToken = '33333333-3333-4333-8333-333333333333';
    const claim: SmsInboundActionClaim = {
      taskId,
      claimToken,
      provider: 'signalwire',
      providerEventId: 'ev-missing-function-call',
      accountId,
      senderNumberId: '55555555-5555-4555-8555-555555555555',
      senderPurpose: 'lgq_shared',
      fromNumber: '+15551234567',
      effectApplied: false,
    };
    mockGenerateContent.mockResolvedValueOnce({
      text: 'Model response without a tool call',
      functionCalls: [],
    });
    const mockRpc = createFieldRpcMock({
      data: { target_id: null, intent: 'no_action' },
      error: null,
    });
    const mockAdmin = {
      rpc: mockRpc,
      from: vi.fn((table: string) => {
        const messageQuery = fieldMessageQuery(table, 'Thanks for the update');
        if (messageQuery) return messageQuery;
        if (table === 'accounts') {
          return createMockQueryBuilder({
            id: accountId,
            business_name: 'Acme',
            alert_phone: '+15551234567',
            high_value_sms_enabled: true,
          });
        }
        return createMockQueryBuilder([]);
      }),
    } as unknown as Parameters<typeof processOwnerFieldClaim>[1];

    await expect(processOwnerFieldClaim(claim, mockAdmin)).resolves.toMatchObject({
      handled: true,
      outcome: 'no_action',
      intent: 'no_action',
      confirmationText: '',
      errorMessage: 'Field intake model returned no function call',
    });
    expect(mockRpc).toHaveBeenCalledWith('apply_authorized_sms_field_action', {
      p_task_id: taskId,
      p_claim_token: claimToken,
      p_intent: 'no_action',
      p_params: { reason: 'Field intake model returned no function call' },
      p_transcript: 'Model response without a tool call',
      p_confirmation_text: '',
    });
    expect(mockRpc).not.toHaveBeenCalledWith('reserve_usage_credits', expect.anything());
  });

  it('terminalizes an authorized non-owner without account context, usage, or Gemini', async () => {
    const accountId = '11111111-1111-4111-8111-111111111111';
    const claim: SmsInboundActionClaim = {
      taskId: '22222222-2222-4222-8222-222222222222',
      claimToken: '33333333-3333-4333-8333-333333333333',
      provider: 'signalwire',
      providerEventId: 'ev-unknown-sender',
      accountId,
      senderNumberId: '55555555-5555-4555-8555-555555555555',
      senderPurpose: 'lgq_shared',
      fromNumber: '+15551234567',
      effectApplied: false,
    };
    const mockRpc = createFieldRpcMock({ data: { target_id: null }, error: null });
    const mockAdmin = {
      rpc: mockRpc,
      from: vi.fn((table: string) => {
        const messageQuery = fieldMessageQuery(table, 'Create a lead for Taylor');
        if (messageQuery) return messageQuery;
        if (table === 'accounts') {
          return createMockQueryBuilder({
            id: accountId,
            business_name: 'Acme',
            alert_phone: '+15557654321',
            high_value_sms_enabled: true,
          });
        }
        return createMockQueryBuilder([]);
      }),
    } as unknown as Parameters<typeof processOwnerFieldClaim>[1];

    await expect(processOwnerFieldClaim(claim, mockAdmin)).resolves.toMatchObject({
      handled: true,
      outcome: 'no_action',
      intent: 'no_action',
      confirmationText: expect.stringMatching(/temporarily unavailable by text/i),
    });
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(mockBeginFieldUsage).not.toHaveBeenCalled();
    expect(mockAdmin.from).not.toHaveBeenCalledWith('jobs');
    expect(mockAdmin.from).not.toHaveBeenCalledWith('clients');
    expect(mockAdmin.from).not.toHaveBeenCalledWith('crew');
    expect(mockRpc).toHaveBeenCalledWith('apply_authorized_sms_field_action', {
      p_task_id: claim.taskId,
      p_claim_token: claim.claimToken,
      p_intent: 'no_action',
      p_params: { reason: 'crew_field_intake_not_supported' },
      p_transcript: 'Create a lead for Taylor',
      p_confirmation_text: expect.stringMatching(/temporarily unavailable by text/i),
    });
  });

  it('stops a sender-specific opt-out before account context or Gemini', async () => {
    const accountId = '11111111-1111-4111-8111-111111111111';
    const claim: SmsInboundActionClaim = {
      taskId: '22222222-2222-4222-8222-222222222222',
      claimToken: '33333333-3333-4333-8333-333333333333',
      provider: 'signalwire',
      providerEventId: 'ev-stopped-sender',
      accountId,
      senderNumberId: '55555555-5555-4555-8555-555555555555',
      senderPurpose: 'lgq_shared',
      fromNumber: '+15551234567',
      effectApplied: false,
    };
    const mockRpc = createFieldRpcMock();
    const mockFrom = vi.fn((table: string) => {
      const messageQuery = fieldMessageQuery(table, 'Do not process this');
      if (messageQuery) return messageQuery;
      if (table === 'sms_sender_numbers') {
        return createMockQueryBuilder({ id: claim.senderNumberId });
      }
      if (table === 'sms_sender_keyword_preferences') {
        return createMockQueryBuilder([{ sender_number_id: claim.senderNumberId }]);
      }
      return createMockQueryBuilder([]);
    });
    const mockAdmin = {
      rpc: mockRpc,
      from: mockFrom,
    } as unknown as Parameters<typeof processOwnerFieldClaim>[1];

    await expect(processOwnerFieldClaim(claim, mockAdmin)).resolves.toMatchObject({
      handled: false,
      outcome: 'error',
      errorMessage: expect.stringMatching(/opted out/i),
    });
    expect(mockFrom).not.toHaveBeenCalledWith('accounts');
    expect(mockFrom).not.toHaveBeenCalledWith('jobs');
    expect(mockFrom).not.toHaveBeenCalledWith('clients');
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(mockBeginFieldUsage).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalledWith('apply_authorized_sms_field_action', expect.anything());
  });

  it('treats a missing task-to-message link as a retryable field error', async () => {
    const claim: SmsInboundActionClaim = {
      taskId: '22222222-2222-4222-8222-222222222222',
      claimToken: '33333333-3333-4333-8333-333333333333',
      provider: 'signalwire',
      providerEventId: 'ev-missing-message',
      accountId: '11111111-1111-4111-8111-111111111111',
      senderNumberId: '55555555-5555-4555-8555-555555555555',
      senderPurpose: 'lgq_shared',
      fromNumber: '+15551234567',
      effectApplied: false,
    };
    const mockAdmin = {
      rpc: createFieldRpcMock(),
      from: vi.fn(() => createMockQueryBuilder(null)),
    } as unknown as Parameters<typeof processOwnerFieldClaim>[1];

    await expect(processOwnerFieldClaim(claim, mockAdmin)).resolves.toMatchObject({
      handled: false,
      outcome: 'error',
      errorMessage: expect.stringMatching(/no linked SMS message/i),
    });
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('stages a new-person job/estimate request as a lead and preserves the exact owner text', async () => {
    const accountId = '11111111-1111-4111-8111-111111111111';
    const taskId = '22222222-2222-4222-8222-222222222222';
    const claimToken = '33333333-3333-4333-8333-333333333333';
    const leadId = '44444444-4444-4444-8444-444444444444';
    const ownerMessage = 'Create a new job for Steve Whatchamacallit located in Birmingham Michigan for an estimate of $1000';

    const claim: SmsInboundActionClaim = {
      taskId,
      claimToken,
      provider: 'signalwire',
      providerEventId: 'ev-new-person-estimate',
      accountId,
      senderNumberId: '55555555-5555-4555-8555-555555555555',
      senderPurpose: 'lgq_shared',
      fromNumber: '+15551234567',
      effectApplied: false,
    };

    mockGenerateContent.mockImplementationOnce(async (request) => {
      const config = request.config as {
        systemInstruction?: string;
        tools?: Array<{ functionDeclarations?: Array<{ name?: string }> }>;
        toolConfig?: {
          functionCallingConfig?: {
            mode?: string;
            allowedFunctionNames?: string[];
          };
        };
      };
      expect(config.systemInstruction).toMatch(/OWNER NEW-RECORD RULE[\s\S]*create a new job[\s\S]*invoke create_lead/i);
      expect(config.systemInstruction).toMatch(/notes are mandatory[\s\S]*address\/location[\s\S]*dollar estimate/i);
      const offeredNames = config.tools?.[0]?.functionDeclarations?.map((tool) => tool.name) ?? [];
      expect(offeredNames).toContain('create_lead');
      expect(offeredNames).not.toContain('reschedule_job');
      expect(offeredNames).not.toContain('update_client');
      expect(offeredNames).not.toContain('assign_crew');
      expect(offeredNames).not.toContain('add_quote_line_item');
      expect(offeredNames).not.toContain('send_client_quote_link');
      expect(config.toolConfig?.functionCallingConfig).toEqual({
        mode: 'ANY',
        allowedFunctionNames: offeredNames,
      });

      return {
        text: ownerMessage,
        functionCalls: [
          {
            name: 'create_lead',
            args: {
              clientName: 'Steve Whatchamacallit',
              address: 'Birmingham, Michigan',
              // Deliberately terse: the worker must retain the exact source text
              // even when model extraction omits the location or dollar amount.
              notes: 'New estimate request',
            },
          },
        ],
      };
    });

    const mockRpc = createFieldRpcMock({
      data: { target_id: leadId, intent: 'create_lead' },
      error: null,
    });

    const mockAdmin = {
      rpc: mockRpc,
      from: vi.fn((table: string) => {
        const messageQuery = fieldMessageQuery(table, ownerMessage);
        if (messageQuery) return messageQuery;
        if (table === 'accounts') {
          return createMockQueryBuilder({
            id: accountId,
            business_name: 'Acme',
            alert_phone: '+15551234567',
            high_value_sms_enabled: true,
          });
        }
        return createMockQueryBuilder([]);
      }),
    } as unknown as Parameters<typeof processOwnerFieldClaim>[1];

    const result = await processOwnerFieldClaim(claim, mockAdmin);

    expect(result.handled).toBe(true);
    expect(result.outcome).toBe('completed');
    expect(result.intent).toBe('create_lead');
    expect(result.confirmationText).toContain('[LGQ] Created new lead for Steve Whatchamacallit.');
    expect(result.confirmationText).not.toMatch(/created (?:a )?new job/i);
    expect(result.confirmationText).toContain(`/field/intake/${taskId}`);

    expect(mockRpc).toHaveBeenCalledWith('apply_authorized_sms_field_action', expect.objectContaining({
      p_intent: 'create_lead',
      p_params: {
        client_name: 'Steve Whatchamacallit',
        address: 'Birmingham, Michigan',
        notes: `New estimate request\n\nOriginal owner message: ${ownerMessage}`,
      },
      p_transcript: ownerMessage,
    }));
  });

  it('fetches authenticated media attachments concurrently before calling Gemini', async () => {
    const accountId = '11111111-1111-4111-8111-111111111111';
    const taskId = '22222222-2222-4222-8222-222222222222';
    const claimToken = '33333333-3333-4333-8333-333333333333';
    const signalWireProjectId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const mediaPrefix = `https://lgq-test.signalwire.com/api/laml/2010-04-01/Accounts/${signalWireProjectId}/Messages/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/Media`;
    const firstUrl = `${mediaPrefix}/cccccccc-cccc-4ccc-8ccc-cccccccccccc`;
    const secondUrl = `${mediaPrefix}/dddddddd-dddd-4ddd-8ddd-dddddddddddd`;
    process.env.SIGNALWIRE_SPACE_URL = 'https://lgq-test.signalwire.com';
    process.env.SIGNALWIRE_PROJECT_ID = signalWireProjectId;
    process.env.SIGNALWIRE_API_TOKEN = 'signalwire-test-token';
    const claim: SmsInboundActionClaim = {
      taskId,
      claimToken,
      provider: 'signalwire',
      providerEventId: 'ev-parallel-media',
      accountId,
      senderNumberId: '55555555-5555-4555-8555-555555555555',
      senderPurpose: 'lgq_shared',
      fromNumber: '+15551234567',
      effectApplied: false,
    };

    let firstResolved = false;
    let secondStartedBeforeFirstResolved = false;
    const firstResponse = new Promise<Response>((resolve) => {
      setTimeout(() => {
        firstResolved = true;
        resolve(new Response(new Uint8Array([1]), {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        }));
      }, 25);
    });
    const fetchMock = vi.fn((input: string | URL | Request) => {
      if (String(input) === firstUrl) return firstResponse;
      secondStartedBeforeFirstResolved = !firstResolved;
      return Promise.resolve(new Response(new Uint8Array([2]), {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      }));
    });
    vi.stubGlobal('fetch', fetchMock);

    mockGenerateContent.mockResolvedValueOnce({
      text: 'Two receipt images received',
      functionCalls: [{ name: 'no_action', args: { reason: 'Test media intake' } }],
    });
    const mockRpc = createFieldRpcMock({
      data: { target_id: null, intent: 'no_action' },
      error: null,
    });
    const mockAdmin = {
      rpc: mockRpc,
      from: vi.fn((table: string) => {
        const messageQuery = fieldMessageQuery(
          table,
          'Receipt has a front and back image',
          [firstUrl, secondUrl],
        );
        if (messageQuery) return messageQuery;
        if (table === 'accounts') {
          return createMockQueryBuilder({
            id: accountId,
            business_name: 'Acme',
            alert_phone: '+15551234567',
            high_value_sms_enabled: true,
          });
        }
        return createMockQueryBuilder([]);
      }),
    } as unknown as Parameters<typeof processOwnerFieldClaim>[1];

    try {
      await expect(processOwnerFieldClaim(claim, mockAdmin)).resolves.toMatchObject({
        handled: true,
        outcome: 'no_action',
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(secondStartedBeforeFirstResolved).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        firstUrl,
        expect.objectContaining({
          headers: {
            Authorization: `Basic ${Buffer.from(`${signalWireProjectId}:signalwire-test-token`).toString('base64')}`,
          },
          redirect: 'manual',
        }),
      );
      const request = mockGenerateContent.mock.calls[0]?.[0] as {
        contents?: Array<{ parts?: Array<{ inlineData?: unknown }> }>;
      };
      expect(
        request.contents?.[0]?.parts?.filter((part) => part.inlineData),
      ).toHaveLength(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects arbitrary and cross-account media URLs before fetch can receive provider credentials', async () => {
    const projectId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    process.env.SIGNALWIRE_SPACE_URL = 'https://lgq-test.signalwire.com';
    process.env.SIGNALWIRE_PROJECT_ID = projectId;
    process.env.SIGNALWIRE_API_TOKEN = 'signalwire-test-token';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    try {
      const { result, parts } = await runOwnerMediaClaim('signalwire', [
        'https://attacker.example/steal.jpg',
        'https://other.signalwire.com/api/laml/2010-04-01/Accounts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/Messages/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/Media/cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        'https://lgq-test.signalwire.com/api/laml/2010-04-01/Accounts/ffffffff-ffff-4fff-8fff-ffffffffffff/Messages/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/Media/cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      ]);

      expect(result).toMatchObject({ handled: true, outcome: 'no_action' });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(parts.filter((part) => part.inlineData)).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does not follow provider media redirects or forward Basic credentials to the Location host', async () => {
    const accountSid = 'ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const mediaUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/SMbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/Media/MEcccccccccccccccccccccccccccccccc`;
    process.env.TWILIO_ACCOUNT_SID = accountSid;
    process.env.TWILIO_AUTH_TOKEN = 'twilio-test-token';
    const fetchMock = vi.fn().mockResolvedValue(new Response('redirect', {
      status: 302,
      headers: { location: 'https://attacker.example/capture' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      const { result, parts } = await runOwnerMediaClaim('twilio', [mediaUrl]);

      expect(result).toMatchObject({ handled: true, outcome: 'no_action' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        mediaUrl,
        expect.objectContaining({
          headers: {
            Authorization: `Basic ${Buffer.from(`${accountSid}:twilio-test-token`).toString('base64')}`,
          },
          redirect: 'manual',
        }),
      );
      expect(parts.filter((part) => part.inlineData)).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('enforces one streaming byte budget across all attachments and cancels at the cap', async () => {
    const accountSid = 'ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const mediaPrefix = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/SMbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/Media`;
    const firstUrl = `${mediaPrefix}/MEcccccccccccccccccccccccccccccccc`;
    const secondUrl = `${mediaPrefix}/MEdddddddddddddddddddddddddddddddd`;
    process.env.TWILIO_ACCOUNT_SID = accountSid;
    process.env.TWILIO_AUTH_TOKEN = 'twilio-test-token';

    let oversizedStreamCancelled = false;
    const oversizedStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(6 * 1024 * 1024));
      },
      cancel() {
        oversizedStreamCancelled = true;
      },
    });
    const fetchMock = vi.fn((input: string | URL | Request) => {
      if (String(input) === firstUrl) {
        return Promise.resolve(new Response(new Uint8Array(10 * 1024 * 1024), {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        }));
      }
      return new Promise<Response>((resolve) => {
        setTimeout(() => resolve(new Response(oversizedStream, {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        })), 10);
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const { result, parts } = await runOwnerMediaClaim('twilio', [firstUrl, secondUrl]);

      expect(result).toMatchObject({ handled: true, outcome: 'no_action' });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(parts.filter((part) => part.inlineData)).toHaveLength(1);
      expect(oversizedStreamCancelled).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
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
      effectApplied: false,
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

    const mockRpc = createFieldRpcMock({
      data: { target_id: jobId, intent: 'log_cost' },
      error: null,
    });

    const mockAdmin = {
      rpc: mockRpc,
      from: vi.fn((table: string) => {
        const messageQuery = fieldMessageQuery(
          table,
          'Home Depot receipt for Smith',
          ['https://example.com/receipt.jpg'],
        );
        if (messageQuery) return messageQuery;
        if (table === 'accounts') {
          return createMockQueryBuilder({
            id: accountId,
            business_name: 'Acme Pro',
            alert_phone: '+15551234567',
            high_value_sms_enabled: true,
          });
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
    expect(result.confirmationText).toContain('[LGQ] J-101 (John Smith): Logged $148.50 Home Depot receipt (Plumbing fittings).');
    expect(result.confirmationText).toContain(`/field/intake/${taskId}`);

    expect(mockRpc).toHaveBeenCalledWith('apply_authorized_sms_field_action', expect.objectContaining({
      p_intent: 'log_cost',
      p_params: expect.objectContaining({
        job_id: jobId,
        amount: 148.5,
        vendor: 'Home Depot',
        items_summary: 'Plumbing fittings',
        cost_type: 'material',
      }),
    }));
  });

  it('fails closed if the model returns an action that was not declared', async () => {
    const accountId = '11111111-1111-4111-8111-111111111111';
    const taskId = '22222222-2222-4222-8222-222222222222';
    const claimToken = '33333333-3333-4333-8333-333333333333';
    const jobId = '44444444-4444-4444-8444-444444444444';

    const claim: SmsInboundActionClaim = {
      taskId,
      claimToken,
      provider: 'signalwire',
      providerEventId: 'ev-undeclared-action',
      accountId,
      senderNumberId: '55555555-5555-4555-8555-555555555555',
      senderPurpose: 'lgq_shared',
      fromNumber: '+15551234567',
      effectApplied: false,
    };

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

    const mockRpc = createFieldRpcMock();

    const mockAdmin = {
      rpc: mockRpc,
      from: vi.fn((table: string) => {
        const messageQuery = fieldMessageQuery(table, 'Add $450 to Smith job for pantry outlet');
        if (messageQuery) return messageQuery;
        if (table === 'accounts') {
          return createMockQueryBuilder({
            id: accountId,
            business_name: 'Acme Pro',
            alert_phone: '+15551234567',
            high_value_sms_enabled: true,
          });
        }
        if (table === 'jobs') {
          return createMockQueryBuilder([
            { id: jobId, ref: 'J-101', client_name: 'John Smith', address: '124 Main St', quoted_amount: 2800, client_phone: '(248) 555-0123' },
          ]);
        }
        return createMockQueryBuilder([]);
      }),
    } as unknown as Parameters<typeof processOwnerFieldClaim>[1];

    await expect(processOwnerFieldClaim(claim, mockAdmin)).resolves.toMatchObject({
      handled: false,
      outcome: 'error',
      errorMessage: 'Field intake model selected unsupported action: add_quote_line_item',
    });
    expect(mockRpc).not.toHaveBeenCalledWith('apply_authorized_sms_field_action', expect.anything());
  });
});
