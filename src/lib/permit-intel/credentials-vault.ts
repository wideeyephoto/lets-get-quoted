import type { SupabaseClient } from '@supabase/supabase-js';
import type { JurisdictionDiscipline } from '../location-context/types';

export type ContractorCredentialType =
  | 'state_license'
  | 'municipal_registration'
  | 'liability_insurance'
  | 'workers_comp'
  | 'surety_bond';

export type ContractorCredentialStatus = 'active' | 'expiring_soon' | 'expired' | 'revoked';

export type ContractorCredential = {
  id: string;
  accountId: string;
  credentialType: ContractorCredentialType;
  tradeDiscipline: JurisdictionDiscipline | 'general';
  licenseNumber?: string | null;
  issuingAuthority: string;
  authorityId?: string | null;
  contractorPin?: string | null;
  holderName: string;
  policyNumber?: string | null;
  insuranceCarrier?: string | null;
  coverageAmount?: number | null;
  expiresAt?: string | null;
  status: ContractorCredentialStatus;
  documentUrl?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SaveContractorCredentialInput = {
  id?: string;
  credentialType: ContractorCredentialType;
  tradeDiscipline?: JurisdictionDiscipline | 'general';
  licenseNumber?: string | null;
  issuingAuthority: string;
  authorityId?: string | null;
  contractorPin?: string | null;
  holderName: string;
  policyNumber?: string | null;
  insuranceCarrier?: string | null;
  coverageAmount?: number | null;
  expiresAt?: string | null;
  documentUrl?: string | null;
  notes?: string | null;
};

/**
 * Lists all contractor credentials and computes up-to-date expiration statuses.
 */
export async function listContractorCredentials(
  supabase: SupabaseClient,
  accountId: string,
): Promise<ContractorCredential[]> {
  const { data, error } = await supabase
    .from('contractor_credentials')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error listing contractor credentials:', error);
    return [];
  }

  return (data || []).map(shapeContractorCredential);
}

/**
 * Retrieves a single credential by ID.
 */
export async function getContractorCredential(
  supabase: SupabaseClient,
  accountId: string,
  credentialId: string,
): Promise<ContractorCredential | null> {
  const { data, error } = await supabase
    .from('contractor_credentials')
    .select('*')
    .eq('account_id', accountId)
    .eq('id', credentialId)
    .single();

  if (error || !data) return null;
  return shapeContractorCredential(data);
}

/**
 * Creates or updates a contractor credential in the vault.
 */
export async function saveContractorCredential(
  supabase: SupabaseClient,
  accountId: string,
  input: SaveContractorCredentialInput,
): Promise<ContractorCredential> {
  const status = computeCredentialStatus(input.expiresAt);

  const payload: Record<string, unknown> = {
    account_id: accountId,
    credential_type: input.credentialType,
    trade_discipline: input.tradeDiscipline || 'building',
    license_number: input.licenseNumber || null,
    issuing_authority: input.issuingAuthority,
    authority_id: input.authorityId || null,
    contractor_pin: input.contractorPin || null,
    holder_name: input.holderName,
    policy_number: input.policyNumber || null,
    insurance_carrier: input.insuranceCarrier || null,
    coverage_amount: input.coverageAmount != null ? input.coverageAmount : null,
    expires_at: input.expiresAt || null,
    status,
    document_url: input.documentUrl || null,
    notes: input.notes || null,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { data, error } = await supabase
      .from('contractor_credentials')
      .update(payload)
      .eq('account_id', accountId)
      .eq('id', input.id)
      .select('*')
      .single();

    if (error || !data) {
      throw error || new Error('Failed to update contractor credential.');
    }
    return shapeContractorCredential(data);
  } else {
    const { data, error } = await supabase
      .from('contractor_credentials')
      .insert(payload)
      .select('*')
      .single();

    if (error || !data) {
      throw error || new Error('Failed to create contractor credential.');
    }
    return shapeContractorCredential(data);
  }
}

/**
 * Deletes a credential from the vault.
 */
export async function deleteContractorCredential(
  supabase: SupabaseClient,
  accountId: string,
  credentialId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('contractor_credentials')
    .delete()
    .eq('account_id', accountId)
    .eq('id', credentialId);

  if (error) {
    console.error('Error deleting contractor credential:', error);
    return false;
  }
  return true;
}

/**
 * Resolves active credentials for a given authority and trade discipline to pre-fill applications.
 */
export async function getCredentialsForAuthority(
  supabase: SupabaseClient,
  accountId: string,
  authorityId: string,
  discipline: JurisdictionDiscipline = 'building',
): Promise<{
  stateLicense?: ContractorCredential;
  municipalRegistration?: ContractorCredential;
  liabilityInsurance?: ContractorCredential;
  workersComp?: ContractorCredential;
}> {
  const all = await listContractorCredentials(supabase, accountId);

  const stateLicense = all.find(
    (c) =>
      c.credentialType === 'state_license' &&
      (c.tradeDiscipline === discipline || c.tradeDiscipline === 'general'),
  );

  const municipalRegistration = all.find(
    (c) =>
      c.credentialType === 'municipal_registration' &&
      (c.authorityId === authorityId || c.issuingAuthority.toLowerCase().includes(authorityId.replace('mi-', ''))),
  );

  const liabilityInsurance = all.find((c) => c.credentialType === 'liability_insurance');
  const workersComp = all.find((c) => c.credentialType === 'workers_comp');

  return {
    stateLicense,
    municipalRegistration,
    liabilityInsurance,
    workersComp,
  };
}

function computeCredentialStatus(expiresAt?: string | null): ContractorCredentialStatus {
  if (!expiresAt) return 'active';

  const expDate = new Date(expiresAt).getTime();
  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  if (expDate < now) {
    return 'expired';
  } else if (expDate - now <= thirtyDaysMs) {
    return 'expiring_soon';
  }
  return 'active';
}

function shapeContractorCredential(row: Record<string, unknown>): ContractorCredential {
  const computedStatus = computeCredentialStatus(row.expires_at ? String(row.expires_at) : null);
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    credentialType: row.credential_type as ContractorCredentialType,
    tradeDiscipline: row.trade_discipline as JurisdictionDiscipline | 'general',
    licenseNumber: row.license_number ? String(row.license_number) : null,
    issuingAuthority: String(row.issuing_authority || ''),
    authorityId: row.authority_id ? String(row.authority_id) : null,
    contractorPin: row.contractor_pin ? String(row.contractor_pin) : null,
    holderName: String(row.holder_name || ''),
    policyNumber: row.policy_number ? String(row.policy_number) : null,
    insuranceCarrier: row.insurance_carrier ? String(row.insurance_carrier) : null,
    coverageAmount: row.coverage_amount ? Number(row.coverage_amount) : null,
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    status: computedStatus,
    documentUrl: row.document_url ? String(row.document_url) : null,
    notes: row.notes ? String(row.notes) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
