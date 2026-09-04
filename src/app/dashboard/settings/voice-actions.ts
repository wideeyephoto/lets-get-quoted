'use server';

import { revalidatePath } from 'next/cache';

import { createAdminClient, requireOwnerContext } from '@/lib/auth';
import { recordAccountEvent } from '@/lib/account-events';
import { normalizeUsPhone } from '@/lib/phone';
import type { BusinessHours } from '@/lib/voice/business-hours';
import { loadVoiceEntitlement } from '@/lib/voice/entitlement';
import { aiVoiceEnabled } from '@/lib/voice/admission';
import { loadVoiceRouteReadiness } from '@/lib/voice/route-readiness';

/**
 * Writing what a contractor configured about their AI receptionist.
 *
 * WRITES GO THROUGH THE SESSION CLIENT, not the admin one. `voice_settings`
 * carries an owner-only RLS policy. The service-role client is used only to
 * read the internal recurring-capacity ledger; the settings write stays on the
 * caller's session client, so RLS remains the second authorization boundary.
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
  alertPhone?: string;
  voiceTone?: string;
  businessHours: Record<string, [string, string] | null>;
};

function statusOf(value: unknown): 'off' | 'active' | 'paused' {
  if (value === 'off' || value === 'active' || value === 'paused') return value;
  throw new Error('Choose Off, Answering, or Paused.');
}

function voiceToneOf(value: unknown): 'friendly' | 'professional' | 'urgent_dispatcher' {
  if (value === 'friendly' || value === 'professional' || value === 'urgent_dispatcher') return value;
  return 'professional';
}

function answerModeOf(value: unknown): 'always' | 'after_hours' {
  if (value === 'always' || value === 'after_hours') return value;
  throw new Error('Choose whether the receptionist answers every call or only after hours.');
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
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Business hours must be a day-by-day schedule.');
  }
  const source = value as Record<string, unknown>;
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
  const rawGreeting = String(input?.greeting ?? '').trim();
  if (rawGreeting.length > GREETING_MAX) {
    throw new Error(`Greeting must be ${GREETING_MAX} characters or fewer.`);
  }
  const greeting = rawGreeting || null;
  const rawTransferNumber = String(input?.transferNumber ?? '').trim();
  const transferNumber = rawTransferNumber ? normalizeUsPhone(rawTransferNumber) : null;
  if (rawTransferNumber && !transferNumber) {
    throw new Error('Enter a valid US transfer number, or leave it blank.');
  }
  const { hours, dropped } = businessHoursOf(input?.businessHours);

  if (status === 'active') {
    if (!aiVoiceEnabled()) {
      throw new Error('AI Voice is not enabled in this environment.');
    }
    const admin = createAdminClient();
    const entitlement = await loadVoiceEntitlement(admin, accountId);
    if (!entitlement.available) {
      throw new Error('We could not verify your AI Voice entitlement. Nothing was changed; try again.');
    }
    if (!entitlement.enabled) {
      throw new Error('AI Voice is not included in this workspace or an active add-on.');
    }
    if (entitlement.concurrentCalls < 1) {
      throw new Error('AI Voice has no available call capacity in this workspace.');
    }

    // The provider finds a workspace only by the number that was dialled. The
    // generic call_tracking_verified_at can be written by the older missed-call
    // route, so activation requires route-specific evidence for the CURRENT
    // number instead.
    const route = await loadVoiceRouteReadiness(admin, accountId);
    if (route.kind === 'unavailable') {
      throw new Error('We could not verify the customer-facing call route. Nothing was changed; try again.');
    }
    if (route.kind === 'not_ready' && route.reason === 'missing_number') {
      throw new Error('Add a valid customer-facing number before turning on AI Voice.');
    }
    if (route.kind === 'not_ready' && route.reason === 'dedicated_number_not_ready') {
      throw new Error('Your customer-facing number must be an active dedicated SignalWire number before turning on AI Voice.');
    }
    if (route.kind !== 'ready') {
      throw new Error('Call the customer-facing number once to verify its Voice webhook before turning on AI Voice.');
    }
  }

  const rawAlertPhone = input?.alertPhone !== undefined ? String(input.alertPhone).trim() : null;
  const alertPhone = rawAlertPhone ? normalizeUsPhone(rawAlertPhone) : null;
  if (rawAlertPhone && !alertPhone) {
    throw new Error('Enter a valid US mobile number for emergency alerts, or leave it blank.');
  }

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
      voice_tone: voiceToneOf(input.voiceTone),
      business_hours: hours,
    }, { onConflict: 'account_id' });

  if (error) throw new Error(error.message);

  if (input?.alertPhone !== undefined) {
    await supabase
      .from('accounts')
      .update({ alert_phone: alertPhone })
      .eq('id', accountId);
  }

  const { data: { user } } = await supabase.auth.getUser();
  await recordAccountEvent({
    accountId,
    kind: 'ai_voice_settings_updated',
    summary: `AI receptionist ${status === 'active' ? 'turned on' : status === 'paused' ? 'paused' : 'turned off'}`,
    actorEmail: user?.email ?? null,
    meta: { status, answer_mode: answerMode, has_transfer: Boolean(transferNumber), has_alert_phone: Boolean(alertPhone), dropped_days: dropped },
  });

  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard/automations');
  revalidatePath('/dashboard/text-to-job');
  revalidatePath('/dashboard/voice-calls');
  return { saved: true, droppedDays: dropped };
}

/**
 * Compatibility endpoint retained for any already-loaded client bundle.
 *
 * The provider answer currently starts no `record_call` instruction and LGQ has
 * no recording retention/deletion rail. Claiming that this toggle records calls
 * would therefore be false. Enabling fails closed; disabling remains available
 * so a stale true row can always be made safe.
 */
export async function setVoiceRecordingAction(
  input: { enabled: boolean; acknowledged: boolean },
): Promise<{ enabled: boolean }> {
  const { supabase, accountId } = await requireOwnerContext();
  const enabled = input?.enabled === true;

  if (enabled) throw new Error('Call recording is not available yet.');

  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase
    .from('voice_settings')
    .upsert({ account_id: accountId, recording_enabled: false }, { onConflict: 'account_id' });
  if (error) throw new Error(error.message);

  await recordAccountEvent({
    accountId,
    kind: 'ai_voice_recording_changed',
    summary: 'Call recording kept off',
    actorEmail: user?.email ?? null,
    meta: { enabled: false },
  });

  revalidatePath('/dashboard/settings');
  return { enabled: false };
}
