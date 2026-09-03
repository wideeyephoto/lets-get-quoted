import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { isCrewPhoneVerified } from '@/lib/crew-verification';
import { normalizeUsPhone } from '@/lib/phone';

export type VoiceStaffRole = 'owner' | 'office' | 'crew';

export type VoiceStaffCaller = Readonly<{
  name: string;
  role: VoiceStaffRole;
  normalizedPhone: string;
  crewId: string | null;
  hourlyRate: number | null;
  burdenPct: number | null;
}>;

export type VoiceCallerIdentity =
  | Readonly<{ status: 'staff'; caller: VoiceStaffCaller }>
  | Readonly<{ status: 'customer' }>
  | Readonly<{ status: 'ambiguous' | 'unavailable' }>;

type AccountRow = {
  business_name: string | null;
  alert_phone: string | null;
  call_forward_number: string | null;
  default_burden_pct: number | string | null;
  suspended_at: string | null;
};

type MembershipRow = { user_id: string; role: 'owner' | 'office' };

type CrewRow = {
  id: string;
  name: string | null;
  phone: string | null;
  active: boolean;
  user_id: string | null;
  last_signed_in_at: string | null;
  phone_verified_at: string | null;
  phone_verified: boolean | null;
  hourly_rate: number | string | null;
  burden_pct: number | string | null;
};

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function samePhone(value: unknown, normalized: string): boolean {
  return typeof value === 'string' && normalizeUsPhone(value) === normalized;
}

/**
 * Resolve the signed inbound caller against the live workspace lifecycle.
 *
 * This is deliberately the one resolver used by admission/grounding, SWAIG
 * mutation authorization, and receipt settlement. A database error is not a
 * customer result: callers must never gain or lose privileged mode because one
 * of the identity reads silently failed.
 */
export async function resolveVoiceCallerIdentity(
  admin: SupabaseClient,
  accountId: string,
  callerPhone?: string | null,
): Promise<VoiceCallerIdentity> {
  const normalized = callerPhone ? normalizeUsPhone(callerPhone) : null;
  if (!normalized) return Object.freeze({ status: 'customer' as const });

  const { data: accountData, error: accountError } = await admin
    .from('accounts')
    .select('business_name, alert_phone, call_forward_number, default_burden_pct, suspended_at')
    .eq('id', accountId)
    .maybeSingle();

  if (accountError || !accountData) return Object.freeze({ status: 'unavailable' as const });
  const account = accountData as AccountRow;
  if (account.suspended_at) return Object.freeze({ status: 'unavailable' as const });

  const [siteResult, settingsResult] = await Promise.all([
    admin
      .from('sites')
      .select('company_name, phone')
      .eq('account_id', accountId)
      .maybeSingle(),
    admin
      .from('voice_settings')
      .select('transfer_number')
      .eq('account_id', accountId)
      .maybeSingle(),
  ]);

  if (siteResult.error || settingsResult.error) {
    return Object.freeze({ status: 'unavailable' as const });
  }

  const site = siteResult.data as { company_name?: string | null; phone?: string | null } | null;
  const settings = settingsResult.data as { transfer_number?: string | null } | null;
  const ownerPhoneMatch = [
    account.alert_phone,
    account.call_forward_number,
    settings?.transfer_number,
    site?.phone,
  ].some((phone) => samePhone(phone, normalized));

  if (ownerPhoneMatch) {
    return Object.freeze({
      status: 'staff' as const,
      caller: Object.freeze({
        name: account.business_name?.trim() || site?.company_name?.trim() || 'Owner',
        role: 'owner' as const,
        normalizedPhone: normalized,
        crewId: null,
        hourlyRate: null,
        burdenPct: finiteNumber(account.default_burden_pct),
      }),
    });
  }

  const { data: membershipData, error: membershipError } = await admin
    .from('memberships')
    .select('user_id, role')
    .eq('account_id', accountId)
    .in('role', ['owner', 'office'])
    .is('deactivated_at', null);

  if (membershipError || !Array.isArray(membershipData)) {
    return Object.freeze({ status: 'unavailable' as const });
  }

  const authMatches: Array<{ name: string; role: 'owner' | 'office' }> = [];
  let authLookupFailed = false;
  await Promise.all((membershipData as MembershipRow[]).map(async (member) => {
    try {
      const { data, error } = await admin.auth.admin.getUserById(member.user_id);
      if (error) {
        authLookupFailed = true;
        return;
      }
      const user = data?.user;
      if (!user?.phone || normalizeUsPhone(user.phone) !== normalized) return;
      const meta = user.user_metadata as Record<string, unknown> | undefined;
      const rawName = meta?.full_name ?? meta?.name ?? meta?.first_name;
      authMatches.push({
        name: typeof rawName === 'string' && rawName.trim()
          ? rawName.trim()
          : member.role === 'owner' ? 'Owner' : 'Office Staff',
        role: member.role,
      });
    } catch {
      authLookupFailed = true;
    }
  }));

  if (authLookupFailed) return Object.freeze({ status: 'unavailable' as const });
  if (authMatches.length > 1) return Object.freeze({ status: 'ambiguous' as const });
  if (authMatches.length === 1) {
    const match = authMatches[0];
    return Object.freeze({
      status: 'staff' as const,
      caller: Object.freeze({
        name: match.name,
        role: match.role,
        normalizedPhone: normalized,
        crewId: null,
        hourlyRate: null,
        burdenPct: finiteNumber(account.default_burden_pct),
      }),
    });
  }

  const { data: crewData, error: crewError } = await admin
    .from('crew')
    .select('id, name, phone, active, user_id, last_signed_in_at, phone_verified_at, phone_verified, hourly_rate, burden_pct')
    .eq('account_id', accountId)
    .eq('active', true)
    .is('deleted_at', null)
    .is('access_revoked_at', null);

  if (crewError || !Array.isArray(crewData)) {
    return Object.freeze({ status: 'unavailable' as const });
  }

  const phoneMatches = (crewData as CrewRow[]).filter((crew) => samePhone(crew.phone, normalized));
  if (phoneMatches.length > 1) return Object.freeze({ status: 'ambiguous' as const });
  if (phoneMatches.length === 0) return Object.freeze({ status: 'customer' as const });

  const crew = phoneMatches[0];
  if (!isCrewPhoneVerified(crew)) return Object.freeze({ status: 'unavailable' as const });

  return Object.freeze({
    status: 'staff' as const,
    caller: Object.freeze({
      name: crew.name?.trim() || 'Team Member',
      role: 'crew' as const,
      normalizedPhone: normalized,
      crewId: crew.id,
      hourlyRate: finiteNumber(crew.hourly_rate),
      burdenPct: finiteNumber(crew.burden_pct) ?? finiteNumber(account.default_burden_pct),
    }),
  });
}

