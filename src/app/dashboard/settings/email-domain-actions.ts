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
  toStoredStatus,
  failureReasonFor,
  ResendApiError,
  type SendingDomainRecord,
  type SendingDomainResponse,
  type StoredSendingDomainStatus,
} from '@/lib/resend-domains';

export interface EmailSendingDomainRow {
  id: string;
  account_id: string;
  domain: string;
  from_local_part: string;
  from_display_name: string | null;
  provider: string;
  provider_domain_id: string | null;
  // The column's vocabulary, not the provider's. The UI renders exactly these
  // four and has no badge for anything else.
  status: StoredSendingDomainStatus;
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
    isConfigured: await isSendingDomainProvisioningConfigured(),
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

  const isConfigured = await isSendingDomainProvisioningConfigured();
  if (!isConfigured) {
    throw new Error('Domain connection is temporarily unavailable — we have been notified.');
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
  let providerRes: SendingDomainResponse;
  try {
    providerRes = await createSendingDomain(domain);
  } catch (err: unknown) {
    const rawError =
      err instanceof ResendApiError
        ? err.providerBody
        : err instanceof Error
          ? err.message
          : String(err);
    const statusCode = err instanceof ResendApiError ? err.statusCode : undefined;
    console.error(
      `[email-domains] Failed to create sending domain for account ${accountId} (status ${statusCode ?? 'unknown'}):`,
      rawError,
    );
    if (
      statusCode === 401 ||
      statusCode === 403 ||
      /Resend API error \((?:401|403)\)/i.test(rawError)
    ) {
      throw new Error('Domain connection is temporarily unavailable — we have been notified.');
    }
    throw new Error('Could not configure sending domain with the email provider.');
  }

  // Filter DNS records to protect against hostile apex MX records
  const { safeRecords, warnings } = filterSafeSendingDnsRecords(providerRes.records, domain);
  if (warnings.length > 0) {
    console.warn(`[email-domains] Filtered dangerous records for ${domain}:`, warnings);
  }

  const storedStatus = toStoredStatus(providerRes.status);
  const verifiedAt = storedStatus === 'verified' ? new Date().toISOString() : null;

  const payload = {
    account_id: accountId,
    domain,
    from_local_part: localPart,
    from_display_name: input.fromDisplayName?.trim() || null,
    provider: 'resend',
    provider_domain_id: providerRes.id,
    status: storedStatus,
    dns_records: safeRecords,
    last_checked_at: new Date().toISOString(),
    verified_at: verifiedAt,
    failure_reason: failureReasonFor(providerRes.status),
    updated_at: new Date().toISOString(),
  };

  // DELIBERATELY NOT AN UPSERT.
  //
  // This was `.upsert(payload, { onConflict: 'domain' })`, which PostgREST turns
  // into `ON CONFLICT (domain)`. The only unique index here is on
  // `lower(domain)` — an expression index that `ON CONFLICT (domain)` cannot
  // infer — so every call raised 42P10 and no contractor could ever connect a
  // domain.
  //
  // Adding a second plain unique index on `domain` would have silenced that,
  // and would have kept the worse half of the bug: `on conflict do update` sets
  // `account_id` from the incoming row, so a request that raced the ownership
  // check above would have MOVED another tenant's verified sending domain onto
  // the caller's account. Branching explicitly means the losing side of that
  // race hits the unique index and is refused (23505) instead.
  const { data: owned, error: ownedErr } = await admin
    .from('email_sending_domains')
    .select('id')
    .eq('account_id', accountId)
    .eq('domain', domain)
    .maybeSingle();
  if (ownedErr) throw ownedErr;

  const write = owned
    ? admin.from('email_sending_domains').update(payload).eq('id', owned.id).eq('account_id', accountId)
    : admin.from('email_sending_domains').insert(payload);

  const { data: row, error: insertErr } = await write.select('*').maybeSingle();

  if (insertErr) {
    // 23505 is the ownership race above, or the one-verified-domain-per-account
    // partial index. Both mean someone else got there first, which the caller
    // can act on; anything else is ours and stays generic.
    if (insertErr.code === '23505') {
      throw new Error('This domain is already connected to another account.');
    }
    console.error('Failed to record email_sending_domain:', insertErr);
    throw new Error('Could not save sending domain configuration.');
  }
  // An accepted statement is not a changed row: without this, a domain the owner
  // disconnected mid-request would report success and return null to the UI.
  if (!row) {
    throw new Error('Your sending domain changed while it was being saved. Check it again.');
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

  const storedStatus = toStoredStatus(providerRes.status);
  const verifiedAt =
    storedStatus === 'verified'
      ? existing.verified_at || new Date().toISOString()
      : null;

  // Zero-row write protection: ensure row matches id, account_id, and domain
  const { data: updated, error: updateErr } = await admin
    .from('email_sending_domains')
    .update({
      status: storedStatus,
      dns_records: safeRecords,
      last_checked_at: new Date().toISOString(),
      verified_at: verifiedAt,
      failure_reason: failureReasonFor(providerRes.status),
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
