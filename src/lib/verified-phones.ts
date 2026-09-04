import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { formatUsPhone, normalizeUsPhone } from '@/lib/phone';

export type VerifiedPhoneOption = Readonly<{
  number: string;
  label: string;
  source: 'owner_alert' | 'business_phone' | 'call_forward' | 'crew' | 'sms_consent' | 'current_configured';
}>;

/**
 * Loads all verified and candidate business phone numbers for an account:
 * 1. Owner's 2FA-verified alert mobile (`accounts.alert_phone`)
 * 2. Main business telephone (`accounts.phone`)
 * 3. Office call-forwarding destination (`accounts.call_forward_number`)
 * 4. Active crew members' contact phones (`crew` table)
 * 5. Opted-in verified phone numbers (`sms_consent` table with status 'opted_in')
 * 6. Preserves existing selected numbers so saved configurations don't appear blank
 */
export async function loadVerifiedPhoneOptions(
  admin: SupabaseClient,
  accountId: string,
  currentTransfer?: string | null,
  currentAlert?: string | null,
): Promise<VerifiedPhoneOption[]> {
  const optionsMap = new Map<string, VerifiedPhoneOption>();

  try {
    const [accountRes, crewRes, consentRes] = await Promise.all([
      admin
        .from('accounts')
        .select('phone, alert_phone, call_forward_number')
        .eq('id', accountId)
        .maybeSingle(),
      admin
        .from('crew')
        .select('name, phone')
        .eq('account_id', accountId)
        .eq('active', true)
        .is('deleted_at', null),
      admin
        .from('sms_consent')
        .select('phone_number, status')
        .eq('account_id', accountId)
        .eq('status', 'opted_in'),
    ]);

    const account = accountRes?.data;
    const crewMembers = (crewRes?.data ?? []) as Array<{ name?: string | null; phone?: string | null }>;
    const consentRows = (consentRes?.data ?? []) as Array<{ phone_number?: string | null }>;

    // 1. Owner Mobile (verified via 2FA)
    const ownerAlert = normalizeUsPhone(account?.alert_phone ?? '');
    if (ownerAlert) {
      optionsMap.set(ownerAlert, {
        number: ownerAlert,
        label: `${formatUsPhone(ownerAlert)} — Owner Mobile (Verified)`,
        source: 'owner_alert',
      });
    }

    // 2. Business Primary Phone
    const bizPhone = normalizeUsPhone(account?.phone ?? '');
    if (bizPhone && !optionsMap.has(bizPhone)) {
      optionsMap.set(bizPhone, {
        number: bizPhone,
        label: `${formatUsPhone(bizPhone)} — Main Business Line`,
        source: 'business_phone',
      });
    }

    // 3. Call Forwarding Phone
    const forwardPhone = normalizeUsPhone(account?.call_forward_number ?? '');
    if (forwardPhone && !optionsMap.has(forwardPhone)) {
      optionsMap.set(forwardPhone, {
        number: forwardPhone,
        label: `${formatUsPhone(forwardPhone)} — Call Forwarding Line`,
        source: 'call_forward',
      });
    }

    // 4. Active Crew Members
    for (const member of crewMembers) {
      const crewPhone = normalizeUsPhone(member.phone ?? '');
      if (crewPhone && !optionsMap.has(crewPhone)) {
        const name = member.name?.trim() || 'Crew Member';
        optionsMap.set(crewPhone, {
          number: crewPhone,
          label: `${formatUsPhone(crewPhone)} — ${name} (Crew)`,
          source: 'crew',
        });
      }
    }

    // 5. Opted-in Consent Numbers
    for (const consent of consentRows) {
      const consentPhone = normalizeUsPhone(consent.phone_number ?? '');
      if (consentPhone && !optionsMap.has(consentPhone)) {
        optionsMap.set(consentPhone, {
          number: consentPhone,
          label: `${formatUsPhone(consentPhone)} — Verified Phone`,
          source: 'sms_consent',
        });
      }
    }

    // 6. Currently configured numbers that may not be in the above lists
    const transfer = normalizeUsPhone(currentTransfer ?? '');
    if (transfer && !optionsMap.has(transfer)) {
      optionsMap.set(transfer, {
        number: transfer,
        label: `${formatUsPhone(transfer)} — Current Transfer Line`,
        source: 'current_configured',
      });
    }

    const alert = normalizeUsPhone(currentAlert ?? '');
    if (alert && !optionsMap.has(alert)) {
      optionsMap.set(alert, {
        number: alert,
        label: `${formatUsPhone(alert)} — Current Alert Mobile`,
        source: 'current_configured',
      });
    }
  } catch (error) {
    console.error('Failed to load verified phone numbers:', error);
  }

  return Array.from(optionsMap.values());
}
