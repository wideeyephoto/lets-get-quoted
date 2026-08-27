import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import { isLeadVerificationValid, leadVerificationToken } from '@/lib/lead-verification';
import { normalizeUsPhone } from '@/lib/phone';
import { sendRawSms } from '@/lib/sms';

export type CrewVerificationState = {
  isVerified: boolean;
  verifiedAt: string | null;
  reason: 'signed_in' | 'verified_sms' | 'owner_verified' | 'unverified';
};

/**
 * Checks whether a crew member's phone number is verified and authorized
 * to use the 2-way Voice Hotline on the shared business number.
 */
export function isCrewPhoneVerified(crew: {
  user_id?: string | null;
  last_signed_in_at?: string | null;
  phone_verified_at?: string | null;
  phone_verified?: boolean | null;
  active?: boolean;
}): boolean {
  if (crew.active === false) return false;
  // 1. Explicit phone verification timestamp or flag
  if (crew.phone_verified_at || crew.phone_verified === true) return true;
  // 2. Active field app user who has authenticated with their account
  if (crew.user_id || crew.last_signed_in_at) return true;
  return false;
}

/**
 * Resolves the detailed verification state and human-readable reason.
 */
export function resolveCrewPhoneVerification(crew: {
  user_id?: string | null;
  last_signed_in_at?: string | null;
  phone_verified_at?: string | null;
  phone_verified?: boolean | null;
  active?: boolean;
}): CrewVerificationState {
  if (crew.phone_verified_at) {
    return { isVerified: true, verifiedAt: crew.phone_verified_at, reason: 'verified_sms' };
  }
  if (crew.user_id || crew.last_signed_in_at) {
    return { isVerified: true, verifiedAt: crew.last_signed_in_at ?? null, reason: 'signed_in' };
  }
  if (crew.phone_verified === true) {
    return { isVerified: true, verifiedAt: null, reason: 'owner_verified' };
  }
  return { isVerified: false, verifiedAt: null, reason: 'unverified' };
}

/**
 * Generates a 6-digit verification code and token for phone verification.
 */
export function createCrewPhoneOtp(phone: string): {
  code: string;
  token: string;
  expiresAt: number;
} {
  const normalized = normalizeUsPhone(phone) || phone;
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes
  const token = leadVerificationToken(normalized, code, expiresAt);
  return { code, token, expiresAt };
}

/**
 * Sends a 6-digit phone verification SMS to a crew member.
 */
export async function sendCrewPhoneVerificationSms(
  supabase: SupabaseClient,
  accountId: string,
  crewId: string,
  businessName: string
): Promise<{ ok: boolean; token?: string; expiresAt?: number; error?: string }> {
  const { data: crew, error } = await supabase
    .from('crew')
    .select('id, name, phone')
    .eq('account_id', accountId)
    .eq('id', crewId)
    .maybeSingle();

  if (error || !crew || !crew.phone) {
    return { ok: false, error: 'Crew member not found or missing phone number.' };
  }

  const normalized = normalizeUsPhone(crew.phone);
  if (!normalized) {
    return { ok: false, error: 'Invalid mobile phone number format.' };
  }

  const { code, token, expiresAt } = createCrewPhoneOtp(normalized);

  const message = `${businessName}: Your 6-digit verification code for Voice Assistant & Field Access is ${code}. Expires in 15 mins. Reply STOP to opt out.`;
  const result = await sendRawSms({
    to: normalized,
    body: message,
    accountId,
  });

  if (!result.ok) {
    return { ok: false, error: result.error || 'Failed to send SMS verification.' };
  }

  return { ok: true, token, expiresAt };
}

/**
 * Verifies an entered 6-digit OTP and stamps the crew phone as verified.
 */
export async function verifyCrewPhoneWithOtp(
  supabase: SupabaseClient,
  accountId: string,
  crewId: string,
  code: string,
  token: string,
  expiresAt: number
): Promise<{ ok: boolean; error?: string }> {
  const { data: crew, error } = await supabase
    .from('crew')
    .select('id, phone')
    .eq('account_id', accountId)
    .eq('id', crewId)
    .maybeSingle();

  if (error || !crew || !crew.phone) {
    return { ok: false, error: 'Crew member not found.' };
  }

  const normalized = normalizeUsPhone(crew.phone) || crew.phone;
  const isValid = isLeadVerificationValid(normalized, code.trim(), expiresAt, token.trim());
  if (!isValid) {
    return { ok: false, error: 'Invalid or expired verification code. Please request a new code.' };
  }

  const now = new Date().toISOString();
  const admin = createAdminClient();
  const { error: updateErr } = await admin
    .from('crew')
    .update({
      phone_verified_at: now,
      phone_verified: true,
      updated_at: now,
    })
    .eq('account_id', accountId)
    .eq('id', crewId);

  if (updateErr) {
    console.error('Failed to stamp crew phone verified:', updateErr);
    return { ok: false, error: 'Failed to update crew verification record.' };
  }

  return { ok: true };
}
