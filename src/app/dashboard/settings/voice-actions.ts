'use server';

import { revalidatePath } from 'next/cache';

import { requireOwnerContext } from '@/lib/auth';
import { recordAccountEvent } from '@/lib/account-events';
import { normalizeUsPhone } from '@/lib/phone';
import type { BusinessHours } from '@/lib/voice/business-hours';

/**
 * Writing what a contractor configured about their AI receptionist.
 *
 * WRITES GO THROUGH THE SESSION CLIENT, not the admin one. `voice_settings`
 * carries an owner-only RLS policy, and using the service-role client here
 * would bypass it — leaving `requireOwnerContext` as the only thing between a
 * server action and another workspace's phone. A server action is a public
 * endpoint; one authorization check is not enough for a table that decides what
 * a business says to its customers and whether their calls are recorded.
 *
 * EVERY VALUE IS RE-VALIDATED SERVER-SIDE. The client sends what the form holds,
 * and the form is not the boundary.
 */

const GREETING_MAX = 1000;

export type VoiceSettingsInput = {
  status: string;
  answerMode: string;
  greeting: string;
  transferNumber: string;
  emergencyTransferNumber: string;
  businessHours: Record<string, [string, string] | null>;
};

function statusOf(value: unknown): 'off' | 'active' | 'paused' {
  return value === 'active' || value === 'paused' ? value : 'off';
}

function answerModeOf(value: unknown): 'always' | 'after_hours' {
  return value === 'always' ? 'always' : 'after_hours';
}

/** `H:MM` or `HH:MM` inside a real day, or null. */
function timeOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Keep only well-formed days, and drop a window that ends at or before it
 * starts rather than storing it.
 *
 * Storing it would be worse than refusing it: `isWithinBusinessHours` reads a
 * backwards window as CLOSED, so a contractor who typed 17:00–08:00 would see
 * their entry saved and their receptionist answer all day, with nothing
 * anywhere saying why.
 */
function businessHoursOf(value: unknown): { hours: BusinessHours; dropped: string[] } {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const hours: Record<string, [string, string]> = {};
  const dropped: string[] = [];

  for (let day = 0; day <= 6; day += 1) {
    const window = source[String(day)];
    if (!Array.isArray(window) || window.length !== 2) continue;
    const open = timeOf(window[0]);
    const close = timeOf(window[1]);
    if (open === null || close === null) {
      dropped.push(String(day));
      continue;
    }
    if (close <= open) {
      dropped.push(String(day));
      continue;
    }
    hours[String(day)] = [open, close];
  }

  return { hours, dropped };
}

export type VoiceSettingsResult = {
  saved: true;
  /** Days the server refused, so the form can say so instead of lying. */
  droppedDays: string[];
};

export async function updateVoiceSettingsAction(
  input: VoiceSettingsInput,
): Promise<VoiceSettingsResult> {
  const { supabase, accountId } = await requireOwnerContext();

  const status = statusOf(input?.status);
  const answerMode = answerModeOf(input?.answerMode);
  const greeting = String(input?.greeting ?? '').trim().slice(0, GREETING_MAX) || null;
  const transferNumber = normalizeUsPhone(String(input?.transferNumber ?? '')) || null;
  const emergencyTransferNumber =
    normalizeUsPhone(String(input?.emergencyTransferNumber ?? '')) || null;
  const { hours, dropped } = businessHoursOf(input?.businessHours);

  // Recording is NOT settable here. It is a legal act with its own action and
  // its own record of who accepted what; folding it into a general save would
  // let a contractor turn it on by editing their opening times.
  const { error } = await supabase
    .from('voice_settings')
    .upsert({
      account_id: accountId,
      status,
      answer_mode: answerMode,
      greeting,
      transfer_number: transferNumber,
      emergency_transfer_number: emergencyTransferNumber,
      business_hours: hours,
    }, { onConflict: 'account_id' });

  if (error) throw new Error(error.message);

  const { data: { user } } = await supabase.auth.getUser();
  await recordAccountEvent({
    accountId,
    kind: 'ai_voice_settings_updated',
    summary: `AI receptionist ${status === 'active' ? 'turned on' : status === 'paused' ? 'paused' : 'turned off'}`,
    actorEmail: user?.email ?? null,
    meta: { status, answer_mode: answerMode, has_transfer: Boolean(transferNumber), dropped_days: dropped },
  });

  revalidatePath('/dashboard/settings');
  return { saved: true, droppedDays: dropped };
}

/**
 * Turning call recording on or off.
 *
 * SEPARATE FROM EVERY OTHER SETTING, and it takes the acknowledgement rather
 * than a boolean, because recording somebody's phone call without telling them
 * is illegal in a good part of the country. The database will refuse
 * `recording_enabled = true` with no accepted disclosure, so this cannot
 * succeed by accident — but the row also records WHO accepted it and WHEN,
 * which a CHECK constraint cannot.
 *
 * Turning it off deliberately leaves the acceptance in place. It is a record of
 * something that happened, not a current preference, and erasing it would
 * destroy the evidence that the calls already recorded were disclosed.
 */
export async function setVoiceRecordingAction(
  input: { enabled: boolean; acknowledged: boolean },
): Promise<{ enabled: boolean }> {
  const { supabase, accountId } = await requireOwnerContext();
  const enabled = input?.enabled === true;

  if (enabled && input?.acknowledged !== true) {
    throw new Error(
      'Confirm that callers will be told the call is recorded before turning recording on.',
    );
  }

  const { data: { user } } = await supabase.auth.getUser();

  const patch: Record<string, unknown> = { account_id: accountId, recording_enabled: enabled };
  if (enabled) {
    patch.recording_disclosure_accepted_at = new Date().toISOString();
    patch.recording_disclosure_accepted_by = user?.id ?? null;
  }

  const { error } = await supabase
    .from('voice_settings')
    .upsert(patch, { onConflict: 'account_id' });
  if (error) throw new Error(error.message);

  await recordAccountEvent({
    accountId,
    kind: 'ai_voice_recording_changed',
    summary: `Call recording turned ${enabled ? 'on' : 'off'}`,
    actorEmail: user?.email ?? null,
    meta: { enabled },
  });

  revalidatePath('/dashboard/settings');
  return { enabled };
}
