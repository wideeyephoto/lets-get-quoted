import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  handleContractorVoiceAction,
  resolveVoiceJob,
  type VoiceJobCandidate,
} from '@/lib/voice/contractor-actions';
import type { VoiceStaffCaller } from '@/lib/voice/caller-identity';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const PROVIDER_CALL_ID = 'signalwire-call-123';
const JOB_ID = '22222222-2222-4222-8222-222222222222';
const LEAD_ID = '33333333-3333-4333-8333-333333333333';

afterEach(() => vi.restoreAllMocks());

const ownerCaller: VoiceStaffCaller = {
  name: 'Brett',
  role: 'owner',
  normalizedPhone: '+18103042061',
  crewId: null,
  hourlyRate: null,
  burdenPct: 15,
};

const baseJob: VoiceJobCandidate = {
  id: JOB_ID,
  ref: 'LGQ-1042',
  client_name: 'Rosa Holbrook',
  client_phone: '+12485550105',
  address: '42 Maple Street',
};

type RpcResult = Readonly<{ data: unknown; error: unknown }>;

function mockAdmin(options: Readonly<{
  jobs?: VoiceJobCandidate[];
  jobsError?: unknown;
  rpcResults?: RpcResult[];
}> = {}) {
  const jobs = options.jobs ?? [];
  const jobQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  };
  jobQuery.select.mockReturnValue(jobQuery);
  jobQuery.eq.mockReturnValue(jobQuery);
  jobQuery.is.mockReturnValue(jobQuery);
  jobQuery.in.mockReturnValue(jobQuery);
  jobQuery.order.mockReturnValue(jobQuery);
  jobQuery.limit.mockResolvedValue({ data: jobs, error: options.jobsError ?? null });

  const from = vi.fn((table: string) => {
    if (table !== 'jobs') throw new Error(`Unexpected table lookup: ${table}`);
    return jobQuery;
  });
  const rpc = vi.fn();
  for (const result of options.rpcResults ?? []) rpc.mockResolvedValueOnce(result);

  return {
    admin: { from, rpc } as unknown as SupabaseClient,
    from,
    jobQuery,
    rpc,
  };
}

function actionContext(
  admin: SupabaseClient,
  functionName: string,
  args: Record<string, unknown>,
) {
  return {
    admin,
    accountId: ACCOUNT_ID,
    providerCallId: PROVIDER_CALL_ID,
    caller: ownerCaller,
    functionName,
    args,
  };
}

describe('AI Voice contractor job resolution', () => {
  it('resolves one exact job reference without relying on a fuzzy first match', async () => {
    const other = {
      ...baseJob,
      id: '44444444-4444-4444-8444-444444444444',
      ref: 'LGQ-1043',
      client_name: 'Rosa Holbrook',
      address: '84 Oak Street',
    };
    const { admin, jobQuery } = mockAdmin({ jobs: [other, baseJob] });

    await expect(resolveVoiceJob(admin, ACCOUNT_ID, 'job LGQ-1042')).resolves.toEqual({
      status: 'resolved',
      job: baseJob,
    });
    expect(jobQuery.eq).toHaveBeenCalledWith('account_id', ACCOUNT_ID);
    expect(jobQuery.is).toHaveBeenCalledWith('deleted_at', null);
    expect(jobQuery.limit).toHaveBeenCalledWith(201);
  });

  it('returns ambiguous when an exact customer name maps to multiple active jobs', async () => {
    const duplicateName = {
      ...baseJob,
      id: '44444444-4444-4444-8444-444444444444',
      ref: 'LGQ-1099',
      address: '84 Oak Street',
    };
    const { admin } = mockAdmin({ jobs: [baseJob, duplicateName] });

    await expect(resolveVoiceJob(admin, ACCOUNT_ID, 'Rosa Holbrook')).resolves.toEqual({
      status: 'ambiguous',
    });
  });

  it('does not fall through to a guessed result when the job read fails', async () => {
    const { admin } = mockAdmin({ jobs: [baseJob], jobsError: { code: '08006' } });

    await expect(resolveVoiceJob(admin, ACCOUNT_ID, 'LGQ-1042')).resolves.toEqual({
      status: 'unavailable',
    });
  });
});

describe('AI Voice contractor lead intent', () => {
  it('requires the caller to explicitly choose create or update before writing', async () => {
    const { admin, rpc } = mockAdmin();

    const result = await handleContractorVoiceAction(actionContext(
      admin,
      'create_or_update_lead',
      { name: 'Jamie Rivera', phone: '248-555-0105' },
    ));

    expect(result).toEqual({
      handled: true,
      response: 'Should I create a new lead or update an existing lead?',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('requires an exact lead UUID for update and never guesses from a name', async () => {
    const { admin, rpc } = mockAdmin();

    const result = await handleContractorVoiceAction(actionContext(
      admin,
      'create_or_update_lead',
      { operation: 'update', lead_id: 'Jamie Rivera', message: 'Needs a follow-up' },
    ));

    expect(result.response).toContain('exact lead ID');
    expect(result.response).toContain('will not guess');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('requires a name plus useful contact or project detail for create', async () => {
    const { admin, rpc } = mockAdmin();

    const result = await handleContractorVoiceAction(actionContext(
      admin,
      'create_or_update_lead',
      { operation: 'create', name: 'Jamie Rivera' },
    ));

    expect(result.response).toContain('customer name and at least one');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('sends a validated update to the RPC with the exact lead target', async () => {
    const { admin, rpc } = mockAdmin({
      rpcResults: [{
        data: { operation: 'update', lead_id: LEAD_ID, target_name: 'Jamie Rivera' },
        error: null,
      }],
    });

    const result = await handleContractorVoiceAction(actionContext(
      admin,
      'create_or_update_lead',
      {
        operation: 'update',
        lead_id: LEAD_ID,
        phone: '(248) 555-0105',
        message: 'Requested a Friday estimate',
      },
    ));

    expect(rpc).toHaveBeenCalledWith('apply_voice_contractor_action', {
      p_account_id: ACCOUNT_ID,
      p_provider_call_id: PROVIDER_CALL_ID,
      p_caller_number: ownerCaller.normalizedPhone,
      p_function_name: 'create_or_update_lead',
      p_target_job_id: null,
      p_target_lead_id: LEAD_ID,
      p_payload: {
        operation: 'update',
        phone: '+12485550105',
        message: 'Requested a Friday estimate',
      },
    });
    expect(result.response).toBe('I updated the lead for Jamie Rivera.');
  });
});

describe('AI Voice contractor durable action outcomes', () => {
  it('confirms a job mutation only after the RPC returns a durable outcome', async () => {
    const { admin, rpc } = mockAdmin({
      jobs: [baseJob],
      rpcResults: [{ data: { job_id: JOB_ID, job_ref: baseJob.ref }, error: null }],
    });

    const result = await handleContractorVoiceAction(actionContext(
      admin,
      'append_job_caution_or_note',
      { job_ref_or_client: baseJob.ref, note: 'Beware of the dog at the side gate.' },
    ));

    expect(rpc).toHaveBeenCalledWith('apply_voice_contractor_action', expect.objectContaining({
      p_target_job_id: JOB_ID,
      p_function_name: 'append_job_caution_or_note',
      p_payload: {
        note: 'Beware of the dog at the side gate.',
        is_caution: true,
      },
    }));
    expect(result.response).toBe('I added that caution to Rosa Holbrook\'s job (LGQ-1042).');
  });

  it('does not speak a success confirmation when the RPC rejects the authorization', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { admin } = mockAdmin({
      jobs: [baseJob],
      rpcResults: [{ data: null, error: { code: '42501', message: 'permission denied' } }],
    });

    const result = await handleContractorVoiceAction(actionContext(
      admin,
      'update_job_details',
      { job_ref_or_client: baseJob.ref, status: 'in_progress' },
    ));

    expect(result.response).toContain('authorization changed');
    expect(result.response).toContain('did not save anything');
    expect(result.response).not.toContain('I updated');
  });

  it('reports an idempotent replay while preserving the original confirmation semantics', async () => {
    const firstOutcome = { operation: 'create', lead_id: LEAD_ID, target_name: 'Jamie Rivera' };
    const { admin, rpc } = mockAdmin({
      rpcResults: [
        { data: firstOutcome, error: null },
        { data: [{ ...firstOutcome, replayed: true }], error: null },
      ],
    });
    const args = {
      operation: 'create',
      name: 'Jamie Rivera',
      phone: '248-555-0105',
    };

    const first = await handleContractorVoiceAction(actionContext(
      admin,
      'create_or_update_lead',
      args,
    ));
    const replay = await handleContractorVoiceAction(actionContext(
      admin,
      'create_or_update_lead',
      args,
    ));

    expect(first.response).toBe('I created the lead for Jamie Rivera.');
    expect(replay.response).toBe('That exact action was already saved. I created the lead for Jamie Rivera.');
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1]).toEqual(rpc.mock.calls[0]);
  });
});
