import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const upsert = vi.fn();
const update = vi.fn();
const getUser = vi.fn();
const supabase = {
  from: (table: string) => {
    if (table === 'voice_settings') return { upsert };
    if (table === 'accounts') return { update: (...args: unknown[]) => { update(...args); return { eq: () => Promise.resolve({ error: null }) }; } };
    throw new Error(`unexpected table ${table}`);
  },
  auth: { getUser },
};
const admin = {};
const requireOwnerContext = vi.fn();
const loadVoiceEntitlement = vi.fn();
const loadVoiceRouteReadiness = vi.fn();

vi.mock('@/lib/auth', () => ({
  requireOwnerContext: () => requireOwnerContext(),
  createAdminClient: () => admin,
}));
vi.mock('@/lib/voice/entitlement', () => ({
  loadVoiceEntitlement: (...args: unknown[]) => loadVoiceEntitlement(...args),
}));
vi.mock('@/lib/voice/route-readiness', () => ({
  loadVoiceRouteReadiness: (...args: unknown[]) => loadVoiceRouteReadiness(...args),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
const recordAccountEvent = vi.fn();
vi.mock('@/lib/account-events', () => ({
  recordAccountEvent: (...a: unknown[]) => recordAccountEvent(...a),
}));

const {
  setVoiceRecordingAction,
  updateVoiceSettingsAction,
  setVoicePostCallSmsAction,
  setVoiceContractorNotificationsAction,
} = await import('@/app/dashboard/settings/voice-actions');

const ACCOUNT = '11111111-1111-4111-8111-111111111111';

const input = (over: Record<string, unknown> = {}) => ({
  status: 'active',
  answerMode: 'after_hours',
  greeting: 'Rivera Plumbing.',
  transferNumber: '(248) 555-0100',
  businessHours: { 1: ['08:00', '17:00'] as [string, string] },
  ...over,
}) as never;

beforeEach(() => {
  vi.stubEnv('LGQ_AI_VOICE_ENABLED', '1');
  upsert.mockReset();
  upsert.mockResolvedValue({ error: null });
  update.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'owner@example.com' } } });
  recordAccountEvent.mockReset();
  loadVoiceEntitlement.mockReset();
  loadVoiceEntitlement.mockResolvedValue({ available: true, enabled: true, concurrentCalls: 1 });
  loadVoiceRouteReadiness.mockReset();
  loadVoiceRouteReadiness.mockResolvedValue({
    kind: 'ready', number: '+12485550199', verifiedAt: '2026-08-21T12:00:00Z',
  });
  requireOwnerContext.mockReset();
  requireOwnerContext.mockResolvedValue({ supabase, accountId: ACCOUNT });
});

describe('the settings write stays on the owner session', () => {
  it('uses admin only for the internal entitlement read', () => {
    const source = readFileSync(
      join(process.cwd(), 'src', 'app', 'dashboard', 'settings', 'voice-actions.ts'), 'utf8',
    );
    expect(source).toContain('requireOwnerContext');
    expect(source).toContain('const admin = createAdminClient()');
    expect(source).toContain('loadVoiceEntitlement(admin, accountId)');
    expect(source).toContain('loadVoiceRouteReadiness(admin, accountId)');
    expect(source).toMatch(/const \{ error \} = await supabase\s*\.from\('voice_settings'\)/);
  });

  it('pins the row to the caller\'s own workspace', async () => {
    await updateVoiceSettingsAction(input());
    expect(upsert.mock.calls[0][0]).toMatchObject({ account_id: ACCOUNT });
  });
});

describe('what the server does with what the form sends', () => {
  it('normalises the supported transfer number the way everything else stores it', async () => {
    await updateVoiceSettingsAction(input());
    expect(upsert.mock.calls[0][0]).toMatchObject({
      transfer_number: '+12485550100',
    });
    expect(upsert.mock.calls[0][0]).not.toHaveProperty('emergency_transfer_number');
  });

  it('clearing transfer number writes null to both voice_settings and accounts', async () => {
    await updateVoiceSettingsAction(input({ transferNumber: '  ' }));
    expect(upsert.mock.calls[0][0]).toMatchObject({
      transfer_number: null,
    });
    expect(update).toHaveBeenCalledWith({ call_forward_number: null });
  });

  it('normalises and updates alertPhone on accounts table', async () => {
    await updateVoiceSettingsAction(input({ alertPhone: '(248) 555-0199' }));
    expect(update).toHaveBeenCalledWith({ alert_phone: '+12485550199' });
  });

  it('synchronises call_forward_number on accounts table when transferNumber is updated', async () => {
    await updateVoiceSettingsAction(input({ transferNumber: '(248) 555-0100' }));
    expect(update).toHaveBeenCalledWith({ call_forward_number: '+12485550100' });
  });

  it('nulls call_forward_number on accounts table when transferNumber is blank', async () => {
    await updateVoiceSettingsAction(input({ transferNumber: '' }));
    expect(update).toHaveBeenCalledWith({ call_forward_number: null });
  });

  it('rejects an invalid nonblank transfer number instead of silently erasing it', async () => {
    await expect(updateVoiceSettingsAction(input({ transferNumber: 'call me maybe' })))
      .rejects.toThrow(/valid US transfer number/i);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rejects unsupported status and answer-mode values instead of coercing them', async () => {
    await expect(updateVoiceSettingsAction(input({ status: 'ANSWERING ALWAYS' })))
      .rejects.toThrow(/Choose Off, Answering, or Paused/i);
    await expect(updateVoiceSettingsAction(input({ answerMode: 'weekends' })))
      .rejects.toThrow(/every call or only after hours/i);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rejects an oversized greeting instead of saving different words than the owner typed', async () => {
    await expect(updateVoiceSettingsAction(input({ greeting: 'x'.repeat(4000) })))
      .rejects.toThrow(/1000 characters or fewer/i);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('drops a backwards window and SAYS it dropped it', async () => {
    // Storing 17:00–08:00 would be worse than refusing it: the hours reader
    // treats a backwards window as closed, so the contractor would see "Saved"
    // and their receptionist would answer all day with nothing explaining why.
    const result = await updateVoiceSettingsAction(input({
      businessHours: { 1: ['08:00', '17:00'], 2: ['17:00', '08:00'], 3: ['09:00', '09:00'] },
    }));
    expect(result.droppedDays).toEqual(['2', '3']);
    expect(upsert.mock.calls[0][0].business_hours).toEqual({ 1: ['08:00', '17:00'] });
  });

  it('keeps only real days and real times', async () => {
    await updateVoiceSettingsAction(input({
      businessHours: {
        1: ['8:00', '17:00'], 9: ['08:00', '17:00'],
        4: ['25:00', '26:00'], 5: 'open', 6: ['08:00'],
      },
    }));
    // 8:00 is padded to 08:00 so stored times sort and compare as strings.
    expect(upsert.mock.calls[0][0].business_hours).toEqual({ 1: ['08:00', '17:00'] });
  });

  it('cannot set recording, whatever it is sent', async () => {
    // Folding it into the general save would let somebody turn recording on by
    // editing their opening times.
    await updateVoiceSettingsAction(input({ recordingEnabled: true, recording_enabled: true }));
    expect(upsert.mock.calls[0][0]).not.toHaveProperty('recording_enabled');
  });

  it('refuses to activate without an explicit base-plan or add-on entitlement', async () => {
    loadVoiceEntitlement.mockResolvedValue({ available: true, enabled: false, concurrentCalls: 0 });
    await expect(updateVoiceSettingsAction(input({ status: 'active' })))
      .rejects.toThrow(/not included.*active add-on/i);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('allows an unentitled workspace to prepare settings while remaining off', async () => {
    loadVoiceEntitlement.mockResolvedValue({ available: true, enabled: false, concurrentCalls: 0 });
    await expect(updateVoiceSettingsAction(input({ status: 'off' }))).resolves.toMatchObject({ saved: true });
    expect(loadVoiceEntitlement).not.toHaveBeenCalled();
  });

  it('does not call an entitlement outage a missing purchase', async () => {
    loadVoiceEntitlement.mockResolvedValue({ available: false, enabled: false, concurrentCalls: 0 });
    await expect(updateVoiceSettingsAction(input({ status: 'active' })))
      .rejects.toThrow(/could not verify.*entitlement/i);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('refuses activation while the private runtime flag is dark', async () => {
    vi.stubEnv('LGQ_AI_VOICE_ENABLED', '0');
    await expect(updateVoiceSettingsAction(input({ status: 'active' })))
      .rejects.toThrow(/not enabled in this environment/i);
    expect(loadVoiceEntitlement).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('requires a verified customer-facing route before claiming to answer', async () => {
    loadVoiceRouteReadiness.mockResolvedValue({
      kind: 'not_ready', reason: 'unverified', number: '+12485550199',
    });
    await expect(updateVoiceSettingsAction(input({ status: 'active' })))
      .rejects.toThrow(/Call the customer-facing number once/i);
    expect(upsert).not.toHaveBeenCalled();

    loadVoiceRouteReadiness.mockResolvedValue({
      kind: 'not_ready', reason: 'dedicated_number_not_ready', number: '+12485550199',
    });
    await expect(updateVoiceSettingsAction(input({ status: 'active' })))
      .rejects.toThrow(/active dedicated SignalWire number/i);
    expect(upsert).not.toHaveBeenCalled();

    loadVoiceRouteReadiness.mockResolvedValue({
      kind: 'not_ready', reason: 'missing_number', number: null,
    });
    await expect(updateVoiceSettingsAction(input({ status: 'active' })))
      .rejects.toThrow(/Add a valid customer-facing number/i);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('does not turn a route-read failure into a missing number', async () => {
    loadVoiceRouteReadiness.mockResolvedValue({ kind: 'unavailable' });
    await expect(updateVoiceSettingsAction(input({ status: 'active' })))
      .rejects.toThrow(/could not verify the customer-facing call route/i);
    expect(upsert).not.toHaveBeenCalled();
  });
});

afterEach(() => vi.unstubAllEnvs());

describe('recording toggle enforces two-party consent disclosure and saves state', () => {
  it('refuses to turn on without acknowledgement', async () => {
    await expect(setVoiceRecordingAction({ enabled: true, acknowledged: false }))
      .rejects.toThrow(/consent requirements/i);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('turns on recording with disclosure timestamp and user attribution when acknowledged', async () => {
    const result = await setVoiceRecordingAction({ enabled: true, acknowledged: true });
    expect(result).toEqual({ enabled: true });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        account_id: ACCOUNT,
        recording_enabled: true,
        recording_disclosure_accepted_by: 'user-1',
      }),
      { onConflict: 'account_id' },
    );
    expect(recordAccountEvent).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'ai_voice_recording_changed',
      summary: 'Call recording turned on',
    }));
  });

  it('turns recording off and records audit event', async () => {
    const result = await setVoiceRecordingAction({ enabled: false, acknowledged: false });
    expect(result).toEqual({ enabled: false });
    const row = upsert.mock.calls[0][0];
    expect(row.recording_enabled).toBe(false);
    expect(row).not.toHaveProperty('recording_disclosure_accepted_at');
    expect(recordAccountEvent).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'ai_voice_recording_changed',
      summary: 'Call recording kept off',
    }));
  });
});

describe('post-call SMS and contractor notification toggles', () => {
  it('toggles post-call SMS setting', async () => {
    const result = await setVoicePostCallSmsAction({ enabled: false });
    expect(result).toEqual({ enabled: false });
    expect(upsert).toHaveBeenCalledWith(
      { account_id: ACCOUNT, post_call_sms_enabled: false },
      { onConflict: 'account_id' },
    );
  });

  it('toggles contractor notifications setting and channel', async () => {
    const result = await setVoiceContractorNotificationsAction({ enabled: true, channel: 'both' });
    expect(result).toEqual({ enabled: true, channel: 'both' });
    expect(upsert).toHaveBeenCalledWith(
      {
        account_id: ACCOUNT,
        contractor_notifications_enabled: true,
        contractor_notification_channel: 'both',
      },
      { onConflict: 'account_id' },
    );
  });
});
