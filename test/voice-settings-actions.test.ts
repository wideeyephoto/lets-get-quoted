import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const upsert = vi.fn();
const getUser = vi.fn();
const supabase = { from: () => ({ upsert }), auth: { getUser } };
const requireOwnerContext = vi.fn();

vi.mock('@/lib/auth', () => ({ requireOwnerContext: () => requireOwnerContext() }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
const recordAccountEvent = vi.fn();
vi.mock('@/lib/account-events', () => ({
  recordAccountEvent: (...a: unknown[]) => recordAccountEvent(...a),
}));

const { setVoiceRecordingAction, updateVoiceSettingsAction } =
  await import('@/app/dashboard/settings/voice-actions');

const ACCOUNT = '11111111-1111-4111-8111-111111111111';

const input = (over: Record<string, unknown> = {}) => ({
  status: 'active',
  answerMode: 'after_hours',
  greeting: 'Rivera Plumbing.',
  transferNumber: '(248) 555-0100',
  emergencyTransferNumber: '',
  businessHours: { 1: ['08:00', '17:00'] as [string, string] },
  ...over,
}) as never;

beforeEach(() => {
  upsert.mockReset();
  upsert.mockResolvedValue({ error: null });
  getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'owner@example.com' } } });
  recordAccountEvent.mockReset();
  requireOwnerContext.mockReset();
  requireOwnerContext.mockResolvedValue({ supabase, accountId: ACCOUNT });
});

describe('the write goes through the session client, not the admin one', () => {
  it('never reaches for the service-role client', () => {
    // voice_settings has an owner-only RLS policy. Using createAdminClient here
    // would bypass it and leave requireOwnerContext as the only thing between a
    // public endpoint and another workspace's phone.
    const source = readFileSync(
      join(process.cwd(), 'src', 'app', 'dashboard', 'settings', 'voice-actions.ts'), 'utf8',
    );
    expect(source).not.toContain('createAdminClient');
    expect(source).toContain('requireOwnerContext');
  });

  it('pins the row to the caller\'s own workspace', async () => {
    await updateVoiceSettingsAction(input());
    expect(upsert.mock.calls[0][0]).toMatchObject({ account_id: ACCOUNT });
  });
});

describe('what the server does with what the form sends', () => {
  it('normalises phone numbers the way everything else stores them', async () => {
    await updateVoiceSettingsAction(input({ emergencyTransferNumber: '248.555.0111' }));
    expect(upsert.mock.calls[0][0]).toMatchObject({
      transfer_number: '+12485550100',
      emergency_transfer_number: '+12485550111',
    });
  });

  it('stores a blank or unusable number as nothing', async () => {
    await updateVoiceSettingsAction(input({ transferNumber: '  ', emergencyTransferNumber: 'call me' }));
    expect(upsert.mock.calls[0][0]).toMatchObject({
      transfer_number: null, emergency_transfer_number: null,
    });
  });

  it('falls back to safe values for anything it does not recognise', async () => {
    // The form is not the boundary. A hand-rolled request must not be able to
    // put a status or a mode into the table that nothing else understands.
    await updateVoiceSettingsAction(input({ status: 'ANSWERING ALWAYS', answerMode: 'weekends' }));
    expect(upsert.mock.calls[0][0]).toMatchObject({ status: 'off', answer_mode: 'after_hours' });
  });

  it('truncates a greeting rather than letting the database refuse the save', async () => {
    await updateVoiceSettingsAction(input({ greeting: 'x'.repeat(4000) }));
    expect(String(upsert.mock.calls[0][0].greeting)).toHaveLength(1000);
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
});

describe('recording is a legal act, not a preference', () => {
  it('refuses to turn on without the acknowledgement', async () => {
    await expect(setVoiceRecordingAction({ enabled: true, acknowledged: false }))
      .rejects.toThrow(/told the call is recorded/i);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('records who accepted and when, which a CHECK constraint cannot', async () => {
    await setVoiceRecordingAction({ enabled: true, acknowledged: true });
    const row = upsert.mock.calls[0][0];
    expect(row.recording_enabled).toBe(true);
    expect(row.recording_disclosure_accepted_by).toBe('user-1');
    expect(typeof row.recording_disclosure_accepted_at).toBe('string');
  });

  it('leaves the acceptance in place when recording is turned off', async () => {
    // It is a record of something that happened, not a current preference.
    // Erasing it would destroy the evidence that calls already recorded were
    // disclosed.
    await setVoiceRecordingAction({ enabled: false, acknowledged: false });
    const row = upsert.mock.calls[0][0];
    expect(row.recording_enabled).toBe(false);
    expect(row).not.toHaveProperty('recording_disclosure_accepted_at');
  });

  it('writes an audit entry for both directions', async () => {
    await setVoiceRecordingAction({ enabled: true, acknowledged: true });
    expect(recordAccountEvent).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'ai_voice_recording_changed',
    }));
  });
});
