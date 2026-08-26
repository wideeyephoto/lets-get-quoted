import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRevalidatePath = vi.fn();
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

const mockRequireOfficeContext = vi.fn();
vi.mock('@/lib/auth', () => ({
  requireOfficeContext: (...args: unknown[]) => mockRequireOfficeContext(...args),
}));

const mockCreateLead = vi.fn();
const mockConvertLeadToJob = vi.fn();
vi.mock('@/lib/leads', () => ({
  createLead: (...args: unknown[]) => mockCreateLead(...args),
  convertLeadToJob: (...args: unknown[]) => mockConvertLeadToJob(...args),
}));

import {
  addVoiceCallNoteAction,
  createLeadFromVoiceCallAction,
  convertVoiceCallToQuoteDraftAction,
  scheduleVoiceCallCallbackAction,
  updateVoiceCallDispositionAction,
} from '@/app/dashboard/voice-calls/actions';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '99999999-9999-4999-8999-999999999999';
const CALL_ID = 'call-12345';

describe('voice call workflow server actions', () => {
  let upserts: Record<string, unknown>[] = [];
  let inserts: Record<string, unknown>[] = [];
  let updates: Record<string, unknown>[] = [];

  const mockSupabase = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'eq']) {
        chain[method] = () => chain;
      }
      chain.maybeSingle = async () => {
        if (table === 'voice_calls') {
          return {
            data: { id: CALL_ID, caller_number: '+12485550100', summary: 'Sink leak', lead_id: null },
            error: null,
          };
        }
        return { data: null, error: null };
      };
      chain.upsert = async (row: Record<string, unknown>) => {
        upserts.push({ table, ...row });
        return { error: null };
      };
      chain.insert = async (row: Record<string, unknown>) => {
        inserts.push({ table, ...row });
        return { error: null };
      };
      chain.update = (row: Record<string, unknown>) => {
        updates.push({ table, ...row });
        return chain;
      };
      return chain;
    },
  };

  beforeEach(() => {
    upserts = [];
    inserts = [];
    updates = [];
    mockRevalidatePath.mockReset();
    mockRequireOfficeContext.mockReset();
    mockCreateLead.mockReset();
    mockConvertLeadToJob.mockReset();

    mockRequireOfficeContext.mockResolvedValue({
      supabase: mockSupabase,
      accountId: ACCOUNT_ID,
      userId: USER_ID,
      userEmail: 'dispatcher@example.com',
    });
    mockCreateLead.mockResolvedValue({ id: 'new-lead-123' });
    mockConvertLeadToJob.mockResolvedValue({ id: 'new-job-456', ref: 'JOB-0456' });
  });

  it('updates staff disposition with reviewed attribution', async () => {
    const formData = new FormData();
    formData.append('callId', CALL_ID);
    formData.append('disposition', 'contacted');

    await updateVoiceCallDispositionAction(formData);

    const workflowUpsert = upserts.find((u) => u.table === 'voice_call_workflows');
    expect(workflowUpsert).toBeDefined();
    expect(workflowUpsert).toMatchObject({
      call_id: CALL_ID,
      account_id: ACCOUNT_ID,
      disposition: 'contacted',
      reviewed_by: USER_ID,
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/voice-calls');
  });

  it('rejects invalid disposition values', async () => {
    const formData = new FormData();
    formData.append('callId', CALL_ID);
    formData.append('disposition', 'invalid_status');

    await expect(updateVoiceCallDispositionAction(formData)).rejects.toThrow('Invalid disposition');
  });

  it('schedules a callback and transitions disposition to callback_scheduled', async () => {
    const formData = new FormData();
    formData.append('callId', CALL_ID);
    formData.append('callbackDueAt', '2026-08-26T14:00:00.000Z');

    await scheduleVoiceCallCallbackAction(formData);

    const workflowUpsert = upserts.find((u) => u.table === 'voice_call_workflows');
    expect(workflowUpsert).toBeDefined();
    expect(workflowUpsert).toMatchObject({
      call_id: CALL_ID,
      account_id: ACCOUNT_ID,
      disposition: 'callback_scheduled',
      callback_due_at: '2026-08-26T14:00:00.000Z',
      reviewed_by: USER_ID,
    });
  });

  it('adds an internal note with user author attribution', async () => {
    const formData = new FormData();
    formData.append('callId', CALL_ID);
    formData.append('note', 'Customer prefers morning service appointments.');

    await addVoiceCallNoteAction(formData);

    const noteInsert = inserts.find((i) => i.table === 'voice_call_notes');
    expect(noteInsert).toBeDefined();
    expect(noteInsert).toMatchObject({
      call_id: CALL_ID,
      account_id: ACCOUNT_ID,
      author_user_id: USER_ID,
      author_name: 'dispatcher',
      note: 'Customer prefers morning service appointments.',
    });
  });

  it('creates linked lead from unlinked voice call', async () => {
    const formData = new FormData();
    formData.append('callId', CALL_ID);

    const res = await createLeadFromVoiceCallAction(formData);

    expect(res.leadId).toBe('new-lead-123');
    expect(mockCreateLead).toHaveBeenCalledWith(mockSupabase, ACCOUNT_ID, expect.objectContaining({
      source: 'ai_voice',
      phone: '+12485550100',
    }));
    const callUpdate = updates.find((u) => u.table === 'voice_calls');
    expect(callUpdate).toMatchObject({ lead_id: 'new-lead-123' });
  });

  it('converts voice call directly into a draft quote job and marks disposition converted', async () => {
    const formData = new FormData();
    formData.append('callId', CALL_ID);

    const res = await convertVoiceCallToQuoteDraftAction(formData);

    expect(res.jobId).toBe('new-job-456');
    expect(mockConvertLeadToJob).toHaveBeenCalledWith(mockSupabase, ACCOUNT_ID, 'new-lead-123', 0, null);

    const workflowUpsert = upserts.find((u) => u.table === 'voice_call_workflows');
    expect(workflowUpsert).toBeDefined();
    expect(workflowUpsert).toMatchObject({
      call_id: CALL_ID,
      account_id: ACCOUNT_ID,
      disposition: 'converted',
      reviewed_by: USER_ID,
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/voice-calls');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/jobs');
  });
});
