'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOfficeContext, createAdminClient } from '@/lib/auth';
import { isHomeownerFinancingFeatureEnabled } from '@/lib/acorn-financing';
import type { HomeownerFinancingEnrollmentRow } from '@/lib/bnpl-financing';

/**
 * Loads current homeowner financing enrollment for the signed-in account.
 */
export async function getHomeownerFinancingAction(): Promise<{
  enrollment: HomeownerFinancingEnrollmentRow | null;
  isEnabled: boolean;
}> {
  const isEnabled = isHomeownerFinancingFeatureEnabled();
  if (!isEnabled) {
    return { enrollment: null, isEnabled: false };
  }

  const { accountId } = await requireOfficeContext('settings.write');
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('homeowner_financing_enrollments')
    .select('*')
    .eq('account_id', accountId)
    .eq('provider', 'acorn')
    .maybeSingle();

  if (error) {
    console.error('Failed to query homeowner_financing_enrollments:', error);
    return { enrollment: null, isEnabled: true };
  }

  return {
    enrollment: (data as HomeownerFinancingEnrollmentRow) || null,
    isEnabled: true,
  };
}

/**
 * Saves contractor financing enrollment settings, dealer code, and surface toggles.
 * Requires `settings.write` capability.
 */
export async function saveHomeownerFinancingAction(formData: FormData): Promise<void> {
  const { accountId } = await requireOfficeContext('settings.write');
  const admin = createAdminClient();

  const enabledQuotes = formData.get('enabled_on_quotes') === 'on';
  const enabledInvoices = formData.get('enabled_on_invoices') === 'on';
  const rawCode = (formData.get('provider_code') as string | null) ?? '';
  const providerCode = rawCode.trim() || null;

  // Verify existing enrollment to keep enrolled_at immutable
  const { data: existing } = await admin
    .from('homeowner_financing_enrollments')
    .select('id, enrolled_at')
    .eq('account_id', accountId)
    .eq('provider', 'acorn')
    .maybeSingle();

  const now = new Date().toISOString();
  const enrolledAt = existing?.enrolled_at || (enabledQuotes || enabledInvoices ? now : null);

  const { error } = await admin
    .from('homeowner_financing_enrollments')
    .upsert(
      {
        account_id: accountId,
        provider: 'acorn',
        provider_code: providerCode,
        status: 'active',
        enabled_on_quotes: enabledQuotes,
        enabled_on_invoices: enabledInvoices,
        enrolled_at: enrolledAt,
        disabled_reason: null,
        updated_at: now,
      },
      { onConflict: 'account_id,provider' },
    );

  if (error) {
    console.error('Failed to save homeowner financing enrollment:', error);
    redirect('/dashboard/settings?financing=error#financing');
  }

  revalidatePath('/dashboard/settings');
  redirect('/dashboard/settings?financing=saved#financing');
}
