import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CREW_FIELD_TOOLS_DECLARATION,
  OWNER_FIELD_TOOLS_DECLARATION,
  processOwnerFieldClaim,
  processFieldIntakeClaim,
} from '@/lib/sms-owner-field-worker';
import {
  formatCrewCostConfirmation,
  formatCrewNoteConfirmation,
  formatCrewTaskConfirmation,
  formatFieldTaskCompletedConfirmation,
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

describe('Crew GSM-7 Confirmation Templates', () => {
  it('formats deterministic ASCII confirmation strings for crew actions under 160 chars', () => {
    const crewNote = formatCrewNoteConfirmation('J-101', 'John Smith', 'Mike Davis');
    expect(crewNote).toBe('[LGQ] J-101 (John Smith): Logged field note from Mike Davis.');
    expect(crewNote.length).toBeLessThanOrEqual(160);
    expect(/^[\x20-\x7E]+$/.test(crewNote)).toBe(true);

    const crewCost = formatCrewCostConfirmation('J-101', 'John Smith', 45.5, 'material', 'Mike Davis');
    expect(crewCost).toBe('[LGQ] J-101 (John Smith): Logged $45.50 material cost from Mike Davis.');
    expect(crewCost.length).toBeLessThanOrEqual(160);
    expect(/^[\x20-\x7E]+$/.test(crewCost)).toBe(true);

    const crewTask = formatCrewTaskConfirmation('J-101', 'John Smith', 'Pick up drywall screws', 'Mike Davis');
    expect(crewTask).toBe('[LGQ] J-101 (John Smith): Added task "Pick up drywall screws" from Mike Davis.');
    expect(crewTask.length).toBeLessThanOrEqual(160);
    expect(/^[\x20-\x7E]+$/.test(crewTask)).toBe(true);

    const crewComplete = formatFieldTaskCompletedConfirmation('J-101', 'John Smith', 'Rough plumbing', 'Mike Davis');
    expect(crewComplete).toBe('[LGQ] J-101 (John Smith): Marked task "Rough plumbing" completed by Mike Davis.');
    expect(crewComplete.length).toBeLessThanOrEqual(160);
    expect(/^[\x20-\x7E]+$/.test(crewComplete)).toBe(true);
  });
});

describe('Crew Field Intake Worker & Caller Detection', () => {
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

  function fieldMessageQuery(table: string, body: string) {
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
      return createMockQueryBuilder({ id: smsMessageId, body, media_urls: [] });
    }
    return null;
  }

  function createFieldRpcMock(applyResult: { data: unknown; error: null }) {
    return vi.fn(async (functionName: string) => {
      if (functionName === 'extend_sms_inbound_action_field_lease') {
        return { data: true, error: null };
      }
      if (functionName === 'apply_authorized_sms_field_action') {
        return applyResult;
      }
      return { data: null, error: null };
    });
  }

  it('provides crew-specific tools and restricts owner administrative functions', () => {
    const crewTools = CREW_FIELD_TOOLS_DECLARATION.map((t) => t.name);
    const ownerTools = OWNER_FIELD_TOOLS_DECLARATION.map((t) => t.name);

    // Crew has site update tools
    expect(crewTools).toContain('append_internal_note');
    expect(crewTools).toContain('log_cost');
    expect(crewTools).toContain('add_job_task');
    expect(crewTools).not.toContain('complete_job_task');
    expect(crewTools).toContain('report_ambiguity');
    expect(crewTools).toContain('no_action');

    // Crew DOES NOT have admin-only tools
    expect(crewTools).not.toContain('create_lead');
    expect(crewTools).not.toContain('reschedule_job');
    expect(crewTools).not.toContain('assign_crew');
    expect(crewTools).not.toContain('update_client');

    // Owner gains lead capture, but neither role is offered SQL-unsupported tools.
    expect(ownerTools).toContain('create_lead');
    expect(ownerTools).not.toContain('reschedule_job');
    expect(ownerTools).not.toContain('assign_crew');
    expect(ownerTools).not.toContain('update_client');
    expect(ownerTools).not.toContain('add_quote_line_item');
    expect(ownerTools).not.toContain('send_client_quote_link');
  });

  it('keeps a shared-number crew sender out of account context and Gemini', async () => {
    const accountId = '11111111-1111-4111-8111-111111111111';
    const taskId = '22222222-2222-4222-8222-222222222222';
    const claimToken = '33333333-3333-4333-8333-333333333333';
    const jobId = '44444444-4444-4444-8444-444444444444';
    const crewId = '66666666-6666-4666-8666-666666666666';

    const claim: SmsInboundActionClaim = {
      taskId,
      claimToken,
      provider: 'signalwire',
      providerEventId: 'ev-crew-1',
      accountId,
      senderNumberId: '55555555-5555-4555-8555-555555555555',
      senderPurpose: 'lgq_shared',
      fromNumber: '+15559876543', // Crew member's phone
      effectApplied: false,
    };

    mockGenerateContent.mockResolvedValueOnce({
      text: 'Finished the drywall on Smith job on Main St',
      functionCalls: [
        {
          name: 'append_internal_note',
          args: {
            jobId,
            note: 'Finished drywall, ready for paint inspection',
          },
        },
      ],
    });

    const mockRpc = createFieldRpcMock({
      data: { target_id: jobId, intent: 'append_internal_note' },
      error: null,
    });

    const crewQuery = createMockQueryBuilder([
      { id: crewId, name: 'Mike Davis', phone: '+15559876543', role_label: 'Lead Carpenter' },
    ]);

    const mockAdmin = {
      rpc: mockRpc,
      from: vi.fn((table: string) => {
        const messageQuery = fieldMessageQuery(table, 'Finished the drywall on Smith job on Main St');
        if (messageQuery) return messageQuery;
        if (table === 'accounts') {
          return createMockQueryBuilder({
            id: accountId,
            business_name: 'Apex Construction',
            alert_phone: '+15551112233', // Owner phone differs from crew phone
            high_value_sms_enabled: true,
          });
        }
        if (table === 'jobs') {
          return createMockQueryBuilder([
            { id: jobId, ref: 'J-101', client_name: 'John Smith', address: '124 Main St' },
          ]);
        }
        if (table === 'crew') {
          return crewQuery;
        }
        return createMockQueryBuilder([]);
      }),
    } as unknown as Parameters<typeof processOwnerFieldClaim>[1];

    const result = await processFieldIntakeClaim(claim, mockAdmin);

    expect(result).toMatchObject({
      handled: true,
      outcome: 'no_action',
      intent: 'no_action',
      confirmationText: expect.stringMatching(/temporarily unavailable by text/i),
    });
    expect(mockRpc).toHaveBeenNthCalledWith(1, 'extend_sms_inbound_action_field_lease', {
      p_task_id: taskId,
      p_claim_token: claimToken,
    });
    expect(mockAdmin.from).not.toHaveBeenCalledWith('jobs');
    expect(mockAdmin.from).not.toHaveBeenCalledWith('clients');
    expect(mockAdmin.from).not.toHaveBeenCalledWith('crew');
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(mockBeginFieldUsage).not.toHaveBeenCalled();
    expect(mockRpc).toHaveBeenCalledWith('apply_authorized_sms_field_action', {
      p_task_id: taskId,
      p_claim_token: claimToken,
      p_intent: 'no_action',
      p_params: { reason: 'crew_field_intake_not_supported' },
      p_transcript: 'Finished the drywall on Smith job on Main St',
      p_confirmation_text: expect.stringMatching(/temporarily unavailable by text/i),
    });
  });

  it('does not let a crew-like sender reach a field mutation', async () => {
    const accountId = '11111111-1111-4111-8111-111111111111';
    const taskId = '22222222-2222-4222-8222-222222222222';
    const claimToken = '33333333-3333-4333-8333-333333333333';
    const jobId = '44444444-4444-4444-8444-444444444444';
    const crewId = '66666666-6666-4666-8666-666666666666';

    const claim: SmsInboundActionClaim = {
      taskId,
      claimToken,
      provider: 'signalwire',
      providerEventId: 'ev-crew-2',
      accountId,
      senderNumberId: '55555555-5555-4555-8555-555555555555',
      senderPurpose: 'lgq_shared',
      fromNumber: '+15559876543',
      effectApplied: false,
    };

    mockGenerateContent.mockResolvedValueOnce({
      text: 'Bought $85 of copper pipe for Smith job',
      functionCalls: [
        {
          name: 'log_cost',
          args: {
            jobId,
            amount: 85,
            label: 'Copper pipe',
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
        const messageQuery = fieldMessageQuery(table, 'Bought $85 of copper pipe for Smith job');
        if (messageQuery) return messageQuery;
        if (table === 'accounts') {
          return createMockQueryBuilder({
            id: accountId,
            business_name: 'Apex Construction',
            alert_phone: '+15551112233',
            high_value_sms_enabled: true,
          });
        }
        if (table === 'jobs') {
          return createMockQueryBuilder([
            { id: jobId, ref: 'J-101', client_name: 'John Smith', address: '124 Main St' },
          ]);
        }
        if (table === 'crew') {
          return createMockQueryBuilder([
            { id: crewId, name: 'Mike Davis', phone: '+15559876543', role_label: 'Lead Carpenter' },
          ]);
        }
        return createMockQueryBuilder([]);
      }),
    } as unknown as Parameters<typeof processOwnerFieldClaim>[1];

    const result = await processFieldIntakeClaim(claim, mockAdmin);

    expect(result).toMatchObject({
      handled: true,
      outcome: 'no_action',
      intent: 'no_action',
    });
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(mockBeginFieldUsage).not.toHaveBeenCalled();
    expect(mockAdmin.from).not.toHaveBeenCalledWith('jobs');
    expect(mockAdmin.from).not.toHaveBeenCalledWith('clients');
    expect(mockAdmin.from).not.toHaveBeenCalledWith('crew');
    expect(mockRpc).toHaveBeenCalledWith('apply_authorized_sms_field_action', expect.objectContaining({
      p_intent: 'no_action',
      p_params: { reason: 'crew_field_intake_not_supported' },
    }));
  });
});

describe('Crew Field Intake SQL Migration Parity', () => {
  const migration = readFileSync(
    new URL('../migrations/20260830120000_crew_field_intake.sql', import.meta.url),
    'utf8',
  );

  it('updates ingest_sms_inbound_webhook to route shared number replies from crew scopes', () => {
    expect(migration).toContain('create or replace function public.ingest_sms_inbound_webhook');
    expect(migration).toMatch(/scope\.consent_scope = 'crew'/i);
    expect(migration).toMatch(/from public\.crew member/i);
    expect(migration).toMatch(/member\.active/i);
    expect(migration).toMatch(/member\.deleted_at is null/i);
    expect(migration).toMatch(/v_sender\.purpose = 'lgq_shared'/i);
  });

  it('updates apply_owner_field_action to validate both owner and crew consent', () => {
    expect(migration).toContain('create or replace function public.apply_owner_field_action');
    expect(migration).toMatch(/v_is_owner/i);
    expect(migration).toMatch(/v_crew public\.crew%rowtype/i);
    expect(migration).toMatch(/Sender consent is missing or revoked/i);
    expect(migration).toMatch(/Intent % is restricted to account owner/i);
    expect(migration).toMatch(/Crew: ' \|\| coalesce\(v_crew\.name/i);
  });

  it('enforces least-privilege security definer grants', () => {
    expect(migration).toMatch(/revoke all on function public\.ingest_sms_inbound_webhook[^\n]+from public, anon, authenticated/i);
    expect(migration).toMatch(/grant execute on function public\.ingest_sms_inbound_webhook[^\n]+to service_role/i);
    expect(migration).toMatch(/revoke all on function public\.apply_owner_field_action[^\n]+from public, anon, authenticated/i);
    expect(migration).toMatch(/grant execute on function public\.apply_owner_field_action[^\n]+to service_role/i);
  });
});
