'use server';

import { revalidatePath } from 'next/cache';
import { requireOfficeContext, createAdminClient } from '@/lib/auth';
import { validateCustomDomain } from '@/lib/domains';
import {
  createSendingDomain,
  deleteSendingDomain,
  isSendingDomainProvisioningConfigured,
  isEmailSendingDomainsFeatureEnabled,
  triggerSendingDomainVerify,
  validateFromLocalPart,
  filterSafeSendingDnsRecords,
  type SendingDomainRecord,
  type SendingDomainStatus,
} from '@/lib/resend-domains';

export interface EmailSendingDomainRow {
  id: string;
  account_id: string;
  domain: string;
  from_local_part: string;
  from_display_name: string | null;
  provider: string;
  provider_domain_id: string | null;
  status: SendingDomainStatus | 'disabled';
  dns_records: SendingDomainRecord[];
  last_checked_at: string | null;
  verified_at: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
}

export async function getEmailSendingDomainAction(): Promise<{
  domain: EmailSendingDomainRow | null;
  isConfigured: boolean;
  isEnabled: boolean;
}> {
  const { accountId } = await requireOfficeContext('settings.write');
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('email_sending_domains')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Failed to query email_sending_domains:', error);
  }

  return {
    domain: (data as EmailSendingDomainRow) ?? null,
    isConfigured: isSendingDomainProvisioningConfigured(),
    isEnabled: isEmailSendingDomainsFeatureEnabled(),
  };
}

export async function createEmailSendingDomainAction(input: {
  domain: string;
  fromLocalPart?: string;
  fromDisplayName?: string;
}): Promise<EmailSendingDomainRow> {
  const { accountId } = await requireOfficeContext('settings.write');

  if (!isEmailSendingDomainsFeatureEnabled()) {
    throw new Error('Custom email sending domains are currently disabled.');
  }

  const domain = validateCustomDomain(input.domain);
  const localPart = (input.fromLocalPart || 'hello').trim().toLowerCase();
  const localPartValidation = validateFromLocalPart(localPart);
  if (!localPartValidation.valid) {
    throw new Error(localPartValidation.error || 'Invalid email prefix.');
  }

  const admin = createAdminClient();

  // Check if another account already connected this domain
  const { data: conflict, error: conflictErr } = await admin
    .from('email_sending_domains')
    .select('account_id')
    .eq('domain', domain)
    .neq('account_id', accountId)
    .maybeSingle();

  if (conflictErr) throw conflictErr;
  if (conflict) {
    throw new Error('This domain is already connected to another account.');
  }

  // Create or retrieve domain from provider
  const providerRes = await createSendingDomain(domain);

  // Filter DNS records to protect against hostile apex MX records
  const { safeRecords, warnings } = filterSafeSendingDnsRecords(providerRes.records, domain);
  if (warnings.length > 0) {
    console.warn(`[email-domains] Filtered dangerous records for ${domain}:`, warnings);
  }

  const verifiedAt = providerRes.status === 'verified' ? new Date().toISOString() : null;

  // Insert or update domain row for this account
  const { data: row, error: insertErr } = await admin
    .from('email_sending_domains')
    .upsert(
      {
        account_id: accountId,
        domain,
        from_local_part: localPart,
        from_display_name: input.fromDisplayName?.trim() || null,
        provider: 'resend',
        provider_domain_id: providerRes.id,
        status: providerRes.status,
        dns_records: safeRecords,
        last_checked_at: new Date().toISOString(),
        verified_at: verifiedAt,
        failure_reason: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'domain' },
    )
    .select('*')
    .single();

  if (insertErr) {
    console.error('Failed to record email_sending_domain:', insertErr);
    throw new Error('Could not save sending domain configuration.');
  }

  revalidatePath('/dashboard/settings');
  return row as EmailSendingDomainRow;
}

export async function verifyEmailSendingDomainAction(
  domainId: string,
): Promise<EmailSendingDomainRow> {
  const { accountId } = await requireOfficeContext('settings.write');
  const admin = createAdminClient();

  const { data: existing, error: fetchErr } = await admin
    .from('email_sending_domains')
    .select('*')
    .eq('id', domainId)
    .eq('account_id', accountId)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (!existing) {
    throw new Error('Sending domain configuration not found.');
  }

  if (!existing.provider_domain_id) {
    throw new Error('Domain has no active provider binding.');
  }

  let providerRes;
  try {
    providerRes = await triggerSendingDomainVerify(existing.provider_domain_id);
  } catch (err) {
    console.error('Provider verification check timed out or failed:', err);
    // Never downgrade an existing verified domain on temporary network error
    await admin
      .from('email_sending_domains')
      .update({
        last_checked_at: new Date().toISOString(),
        failure_reason: 'Provider verification call timed out. Retrying on next check.',
        updated_at: new Date().toISOString(),
      })
      .eq('id', domainId)
      .eq('account_id', accountId);

    throw new Error('Could not contact domain provider. Your existing status was preserved.');
  }

  if (!providerRes) {
    throw new Error('Provider did not return domain verification status.');
  }

  const { safeRecords, warnings } = filterSafeSendingDnsRecords(
    providerRes.records,
    existing.domain,
  );
  if (warnings.length > 0) {
    console.warn(`[email-domains] Filtered dangerous records during verify:`, warnings);
  }

  const verifiedAt =
    providerRes.status === 'verified'
      ? existing.verified_at || new Date().toISOString()
      : null;

  // Zero-row write protection: ensure row matches id, account_id, and domain
  const { data: updated, error: updateErr } = await admin
    .from('email_sending_domains')
    .update({
      status: providerRes.status,
      dns_records: safeRecords,
      last_checked_at: new Date().toISOString(),
      verified_at: verifiedAt,
      failure_reason:
        providerRes.status === 'failed'
          ? 'Required DNS records (DKIM / SPF) were not detected at your DNS provider.'
          : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', domainId)
    .eq('account_id', accountId)
    .eq('domain', existing.domain)
    .select('*')
    .maybeSingle();

  if (updateErr) throw updateErr;
  if (!updated) {
    throw new Error('Domain changed or was removed during verification.');
  }

  revalidatePath('/dashboard/settings');
  return updated as EmailSendingDomainRow;
}

export async function deleteEmailSendingDomainAction(
  domainId: string,
): Promise<{ success: boolean }> {
  const { accountId } = await requireOfficeContext('settings.write');
  const admin = createAdminClient();

  const { data: existing, error: fetchErr } = await admin
    .from('email_sending_domains')
    .select('*')
    .eq('id', domainId)
    .eq('account_id', accountId)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (!existing) {
    return { success: true };
  }

  let providerDeleted = true;
  if (existing.provider_domain_id) {
    providerDeleted = await deleteSendingDomain(existing.provider_domain_id);
  }

  if (!providerDeleted) {
    // If provider delete failed, mark disabled and retain so reconciler can clean up
    await admin
      .from('email_sending_domains')
      .update({
        status: 'disabled',
        failure_reason: 'Provider delete request failed. Marked disabled for retry.',
        updated_at: new Date().toISOString(),
      })
      .eq('id', domainId)
      .eq('account_id', accountId);

    revalidatePath('/dashboard/settings');
    throw new Error('Could not delete domain from provider. Domain was disabled instead.');
  }

  const { error: deleteErr } = await admin
    .from('email_sending_domains')
    .delete()
    .eq('id', domainId)
    .eq('account_id', accountId);

  if (deleteErr) throw deleteErr;

  revalidatePath('/dashboard/settings');
  return { success: true };
}
