import type { SupabaseClient } from '@supabase/supabase-js';

type Recipient = { email: string; accountId: string | null };

export const isPlatformEmailScope = (scope: string) => scope === 'platform' || scope === 'test-preview';

export async function suppressPlatformEmail(admin: SupabaseClient, email: string, reason: string): Promise<boolean> {
  const { data, error } = await admin.rpc('record_platform_email_suppression', {
    p_email: email.trim().toLowerCase(), p_reason: reason,
  });
  return !error && data === true;
}

/** Exact bounded lookups, preserving recipient order and workspace binding. */
export async function platformCampaignEligibility(admin: SupabaseClient, recipients: Recipient[]): Promise<boolean[]> {
  const eligible: boolean[] = [];
  for (let offset = 0; offset < recipients.length; offset += 100) {
    const pairs = recipients.slice(offset, offset + 100).map(r => ({ email: r.email.trim().toLowerCase(), account_id: r.accountId }));
    if (pairs.some(pair => !pair.email || /[\s<>]/.test(pair.email)
      || (pair.account_id !== null && (typeof pair.account_id !== 'string' || !pair.account_id.trim())))) {
      throw new Error('Platform campaign recipient scope could not be verified.');
    }
    const { data, error } = await admin.rpc('platform_campaign_recipient_status', { p_recipients: pairs });
    if (error || !Array.isArray(data) || data.length !== pairs.length
      || data.some((row, index) => !row || row.email !== pairs[index].email
        || row.account_id !== pairs[index].account_id || typeof row.blocked !== 'boolean')) {
      throw new Error('Email suppression lookup failed; no unchecked platform campaign email was submitted.');
    }
    eligible.push(...data.map(row => !row.blocked));
  }
  return eligible;
}

export async function assertPlatformCampaignAllowed(admin: SupabaseClient, recipient: Recipient): Promise<void> {
  if (!(await platformCampaignEligibility(admin, [recipient]))[0]) {
    throw new Error('Recipient has opted out or cannot receive platform campaign email.');
  }
}
