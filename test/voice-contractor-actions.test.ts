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
    range: vi.fn(),
  };
  jobQuery.select.mockReturnValue(jobQuery);
  jobQuery.eq.mockReturnValue(jobQuery);
  jobQuery.is.mockReturnValue(jobQuery);
  jobQuery.in.mockReturnValue(jobQuery);
  jobQuery.order.mockReturnValue(jobQuery);
  jobQuery.limit.mockResolvedValue({ data: jobs, error: options.jobsError ?? null });
  jobQuery.range.mockImplementation(async (start: number, end: number) => ({
    data: jobs.slice(start, end + 1), error: options.jobsError ?? null,
  }));

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
    stepUpVerified: true,
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
    expect(jobQuery.range).toHaveBeenCalledWith(0, 199);
    expect(jobQuery.order).toHaveBeenCalledWith('id', { ascending: false });
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
      candidates: [baseJob, duplicateName],
    });
  });

  it('does not fall through to a guessed result when the job read fails', async () => {
    const { admin } = mockAdmin({ jobs: [baseJob], jobsError: { code: '08006' } });

    await expect(resolveVoiceJob(admin, ACCOUNT_ID, 'LGQ-1042')).resolves.toEqual({
      status: 'unavailable',
    });
  });
});

describe('AI Voice spoken job choices', () => {
  const olderJobs = Array.from({ length: 251 }, (_, index) => ({
    ...baseJob,
    id: `other-${index}`,
    ref: `LGQ-${2000 + index}`,
    client_name: `Different Customer ${index}`,
    address: `${index} Other Road`,
  }));
  const secondJob = {
    ...baseJob,
    id: '44444444-4444-4444-8444-444444444444',
    ref: 'LGQ-1099',
    scope: 'Sewer camera inspection',
    status: 'in_progress',
    address: '84 Oak Street',
    scheduled_for: '2026-09-08',
    scheduled_time: '09:00',
    quoted_amount: 350,
  };

  it('finds an older job beyond the former 201-row cutoff', async () => {
    const { admin, jobQuery } = mockAdmin({ jobs: [...olderJobs, baseJob] });
    await expect(resolveVoiceJob(admin, ACCOUNT_ID, baseJob.ref)).resolves.toEqual({ status: 'resolved', job: baseJob });
    expect(jobQuery.range).toHaveBeenCalledWith(200, 399);
  });

  it('does not invent ambiguity for a missing name in a 252-job workspace', async () => {
    const { admin } = mockAdmin({ jobs: [...olderJobs, baseJob] });
    await expect(resolveVoiceJob(admin, ACCOUNT_ID, 'Harry Lou')).resolves.toEqual({ status: 'not_found' });
  });

  it('checks later pages before treating a client name as unique', async () => {
    const { admin } = mockAdmin({ jobs: [baseJob, ...olderJobs, secondJob] });
    await expect(resolveVoiceJob(admin, ACCOUNT_ID, baseJob.client_name)).resolves.toEqual({
      status: 'ambiguous', candidates: [baseJob, secondJob],
    });
  });

  it('fails closed if a later page cannot be read', async () => {
    const { admin, jobQuery } = mockAdmin({ jobs: [baseJob, ...olderJobs] });
    jobQuery.range.mockResolvedValueOnce({ data: [baseJob, ...olderJobs].slice(0, 200), error: null });
    jobQuery.range.mockResolvedValueOnce({ data: null, error: { code: '08006' } });
    await expect(resolveVoiceJob(admin, ACCOUNT_ID, baseJob.client_name)).resolves.toEqual({ status: 'unavailable' });
  });

  it('reads both job descriptions and references without applying any action', async () => {
    const { admin, rpc, jobQuery } = mockAdmin({ jobs: [{ ...baseJob, scope: 'Replace water heater' }, secondJob] });
    const result = await handleContractorVoiceAction(actionContext(admin, 'lookup_jobs', { query: baseJob.client_name }));
    for (const detail of ['2 matching jobs', baseJob.ref, secondJob.ref, 'Replace water heater', 'Sewer camera inspection', '84 Oak Street', 'in progress', '2026-09-08', '09:00', '$350.00']) {
      expect(result.response).toContain(detail);
    }
    expect(jobQuery.eq).toHaveBeenCalledWith('account_id', ACCOUNT_ID);
    expect(jobQuery.is).toHaveBeenCalledWith('deleted_at', null);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns choices on an ambiguous update, then saves only the chosen exact job', async () => {
    const { admin, rpc } = mockAdmin({ jobs: [baseJob, secondJob], rpcResults: [{ data: { job_id: secondJob.id, job_ref: secondJob.ref }, error: null }] });
    const result = await handleContractorVoiceAction(actionContext(admin, 'append_job_caution_or_note', { job_ref_or_client: baseJob.client_name, note: 'Use the side gate.' }));
    expect(result.response).toContain(baseJob.ref);
    expect(result.response).toContain(secondJob.ref);
    expect(result.response).toContain('description or option number');
    expect(rpc).not.toHaveBeenCalled();
    await handleContractorVoiceAction(actionContext(admin, 'append_job_caution_or_note', { job_ref_or_client: secondJob.ref, note: 'Use the side gate.' }));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('apply_voice_contractor_action', expect.objectContaining({ p_target_job_id: secondJob.id, p_payload: { note: 'Use the side gate.', is_caution: true } }));
  });

  it('does not disclose jobs before call verification', async () => {
    const { admin, from, rpc } = mockAdmin({ jobs: [baseJob] });
    const result = await handleContractorVoiceAction({ ...actionContext(admin, 'lookup_jobs', {}), stepUpVerified: false });
    expect(result.response).toContain('verify this call');
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not expose workspace-wide job lists to crew callers', async () => {
    const { admin, from } = mockAdmin({ jobs: [baseJob] });
    const result = await handleContractorVoiceAction({ ...actionContext(admin, 'lookup_jobs', {}), caller: { ...ownerCaller, role: 'crew', crewId: 'crew-1' } });
    expect(result.response).toContain('owner or office authorization');
    expect(from).not.toHaveBeenCalled();
  });

  it('lists at most five current jobs and asks to narrow larger lists', async () => {
    const { admin } = mockAdmin({ jobs: [{ ...baseJob, status: 'complete' }, ...olderJobs.slice(0, 6)] });
    const result = await handleContractorVoiceAction(actionContext(admin, 'lookup_jobs', {}));
    expect(result.response).toContain('6 current jobs');
    expect(result.response).toContain('Showing five of 6');
    expect(result.response).not.toContain(baseJob.ref);
    expect(result.response).not.toContain(olderJobs[5].ref);
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

  it('creates a new lead without requiring step-up verification and with optional phone', async () => {
    const { admin, rpc } = mockAdmin({
      rpcResults: [{
        data: { operation: 'create', lead_id: LEAD_ID, target_name: 'John Davis' },
        error: null,
      }],
    });

    const result = await handleContractorVoiceAction({
      ...actionContext(
        admin,
        'create_or_update_lead',
        {
          operation: 'create',
          name: 'John Davis',
          address: '142 Elm St',
          project_type: 'roof leak',
          message: 'Needs inspection Friday',
        },
      ),
      stepUpVerified: false,
    });

    expect(rpc).toHaveBeenCalledWith('apply_voice_contractor_action', {
      p_account_id: ACCOUNT_ID,
      p_provider_call_id: PROVIDER_CALL_ID,
      p_caller_number: ownerCaller.normalizedPhone,
      p_function_name: 'create_or_update_lead',
      p_target_job_id: null,
      p_target_lead_id: null,
      p_payload: {
        operation: 'create',
        name: 'John Davis',
        address: '142 Elm St',
        project_type: 'roof leak',
        message: 'Needs inspection Friday',
      },
    });
    expect(result.response).toBe('I created the lead for John Davis.');
  });

  it('sanitizes negative phone phrases to null when creating a lead', async () => {
    const { admin, rpc } = mockAdmin({
      rpcResults: [{
        data: { operation: 'create', lead_id: LEAD_ID, target_name: 'Jane Smith' },
        error: null,
      }],
    });

    const result = await handleContractorVoiceAction({
      ...actionContext(
        admin,
        'create_or_update_lead',
        {
          operation: 'create',
          name: 'Jane Smith',
          phone: 'none',
          address: '456 Oak St',
          message: 'Water heater leaking',
        },
      ),
      stepUpVerified: false,
    });

    expect(rpc).toHaveBeenCalledWith('apply_voice_contractor_action', {
      p_account_id: ACCOUNT_ID,
      p_provider_call_id: PROVIDER_CALL_ID,
      p_caller_number: ownerCaller.normalizedPhone,
      p_function_name: 'create_or_update_lead',
      p_target_job_id: null,
      p_target_lead_id: null,
      p_payload: {
        operation: 'create',
        name: 'Jane Smith',
        address: '456 Oak St',
        message: 'Water heater leaking',
      },
    });
    expect(result.response).toBe('I created the lead for Jane Smith.');
  });
});

describe('AI Voice contractor durable action outcomes', () => {
  it('prompts for step-up and performs no reads or writes until the call is verified', async () => {
    const { admin, from, rpc } = mockAdmin({ jobs: [baseJob] });

    const result = await handleContractorVoiceAction({
      ...actionContext(
        admin,
        'append_job_caution_or_note',
        { job_ref_or_client: baseJob.ref, note: 'Side gate is locked.' },
      ),
      stepUpVerified: false,
    });

    expect(result).toEqual({
      handled: true,
      response: 'Before I can save that dispatch change, I need to text a six-digit verification code to the verified phone calling now.',
    });
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

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
