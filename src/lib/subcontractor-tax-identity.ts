import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  encryptTin,
  decryptTin,
  formatTinMasked,
  type TinType,
} from '@/lib/tax-vault-crypto';

export const TAX_CLASSIFICATIONS = [
  'individual_sole_proprietor',
  'c_corporation',
  's_corporation',
  'partnership',
  'trust_estate',
  'llc_c',
  'llc_s',
  'llc_p',
  'other',
] as const;

export type SubcontractorTaxClassification = (typeof TAX_CLASSIFICATIONS)[number];

export const TAX_CLASSIFICATION_LABELS: Record<SubcontractorTaxClassification, string> = {
  individual_sole_proprietor: 'Individual / Sole Proprietor / Single-member LLC',
  c_corporation: 'C Corporation',
  s_corporation: 'S Corporation',
  partnership: 'Partnership',
  trust_estate: 'Trust / Estate',
  llc_c: 'LLC - C Corporation tax classification',
  llc_s: 'LLC - S Corporation tax classification',
  llc_p: 'LLC - Partnership tax classification',
  other: 'Other Entity Classification',
};

export type SubcontractorTaxIdentityMasked = Readonly<{
  id: string;
  accountId: string;
  crewId: string;
  legalName: string;
  businessName: string | null;
  taxClassification: SubcontractorTaxClassification;
  tinType: TinType;
  tinLastFour: string;
  tinMasked: string;
  taxAddressLine1: string;
  taxAddressLine2: string | null;
  taxCity: string;
  taxRegion: string;
  taxPostalCode: string;
  exemptPayeeCode: string | null;
  fatcaCode: string | null;
  backupWithholdingRequired: boolean;
  w9DocumentPath: string | null;
  w9SignedAt: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type SaveSubcontractorTaxIdentityInput = Readonly<{
  accountId: string;
  crewId: string;
  legalName: string;
  businessName?: string | null;
  taxClassification: SubcontractorTaxClassification;
  rawTin: string;
  tinType?: TinType;
  taxAddressLine1: string;
  taxAddressLine2?: string | null;
  taxCity: string;
  taxRegion: string;
  taxPostalCode: string;
  exemptPayeeCode?: string | null;
  fatcaCode?: string | null;
  backupWithholdingRequired?: boolean;
  w9DocumentPath?: string | null;
  w9SignedAt?: string | null;
}>;

function normalizeRow(row: Record<string, unknown>): SubcontractorTaxIdentityMasked {
  const tinType = (row.tin_type as TinType) || 'ein';
  const tinLastFour = String(row.tin_last_four || '0000');

  return {
    id: String(row.id),
    accountId: String(row.account_id),
    crewId: String(row.crew_id),
    legalName: String(row.legal_name),
    businessName: row.business_name ? String(row.business_name) : null,
    taxClassification: row.tax_classification as SubcontractorTaxClassification,
    tinType,
    tinLastFour,
    tinMasked: formatTinMasked(tinLastFour, tinType),
    taxAddressLine1: String(row.tax_address_line1),
    taxAddressLine2: row.tax_address_line2 ? String(row.tax_address_line2) : null,
    taxCity: String(row.tax_city),
    taxRegion: String(row.tax_region),
    taxPostalCode: String(row.tax_postal_code),
    exemptPayeeCode: row.exempt_payee_code ? String(row.exempt_payee_code) : null,
    fatcaCode: row.fatca_code ? String(row.fatca_code) : null,
    backupWithholdingRequired: Boolean(row.backup_withholding_required),
    w9DocumentPath: row.w9_document_path ? String(row.w9_document_path) : null,
    w9SignedAt: row.w9_signed_at ? String(row.w9_signed_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/**
 * Loads a masked subcontractor tax identity from the private tax vault.
 * Service role client is required.
 */
export async function loadSubcontractorTaxIdentity(
  admin: SupabaseClient,
  accountId: string,
  crewId: string,
): Promise<SubcontractorTaxIdentityMasked | null> {
  const { data, error } = await admin
    .schema('tax_vault')
    .from('subcontractor_tax_identities')
    .select('id, account_id, crew_id, legal_name, business_name, tax_classification, tin_type, tin_last_four, tax_address_line1, tax_address_line2, tax_city, tax_region, tax_postal_code, exempt_payee_code, fatca_code, backup_withholding_required, w9_document_path, w9_signed_at, created_at, updated_at')
    .eq('account_id', accountId)
    .eq('crew_id', crewId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load subcontractor tax identity: ${error.message}`);
  }

  return data ? normalizeRow(data as Record<string, unknown>) : null;
}

/**
 * Saves a subcontractor tax identity with envelope encryption.
 */
export async function saveSubcontractorTaxIdentity(
  admin: SupabaseClient,
  input: SaveSubcontractorTaxIdentityInput,
): Promise<SubcontractorTaxIdentityMasked> {
  const encrypted = encryptTin(input.rawTin, input.tinType);

  const payload = {
    account_id: input.accountId,
    crew_id: input.crewId,
    legal_name: input.legalName.trim(),
    business_name: input.businessName ? input.businessName.trim() : null,
    tax_classification: input.taxClassification,
    tin_type: encrypted.tinType,
    tin_last_four: encrypted.lastFour,
    encrypted_tin: encrypted.ciphertext,
    tin_iv: encrypted.iv,
    tin_auth_tag: encrypted.authTag,
    tax_address_line1: input.taxAddressLine1.trim(),
    tax_address_line2: input.taxAddressLine2 ? input.taxAddressLine2.trim() : null,
    tax_city: input.taxCity.trim(),
    tax_region: input.taxRegion.trim().toUpperCase(),
    tax_postal_code: input.taxPostalCode.trim(),
    exempt_payee_code: input.exemptPayeeCode ? input.exemptPayeeCode.trim() : null,
    fatca_code: input.fatcaCode ? input.fatcaCode.trim() : null,
    backup_withholding_required: Boolean(input.backupWithholdingRequired),
    w9_document_path: input.w9DocumentPath ? input.w9DocumentPath.trim() : null,
    w9_signed_at: input.w9SignedAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await admin
    .schema('tax_vault')
    .from('subcontractor_tax_identities')
    .upsert(payload, { onConflict: 'account_id, crew_id' })
    .select('id, account_id, crew_id, legal_name, business_name, tax_classification, tin_type, tin_last_four, tax_address_line1, tax_address_line2, tax_city, tax_region, tax_postal_code, exempt_payee_code, fatca_code, backup_withholding_required, w9_document_path, w9_signed_at, created_at, updated_at')
    .single();

  if (error || !data) {
    throw new Error(`Unable to save subcontractor tax identity: ${error?.message || 'unknown error'}`);
  }

  // Synchronize W-9 status on the public crew roster
  await admin
    .from('crew')
    .update({ w9_status: 'on_file' })
    .eq('account_id', input.accountId)
    .eq('id', input.crewId);

  return normalizeRow(data as Record<string, unknown>);
}

/**
 * Decrypts a subcontractor's full TIN on demand for official filing generation.
 */
export async function decryptSubcontractorTin(
  admin: SupabaseClient,
  accountId: string,
  crewId: string,
): Promise<string> {
  const { data, error } = await admin
    .schema('tax_vault')
    .from('subcontractor_tax_identities')
    .select('encrypted_tin, tin_iv, tin_auth_tag')
    .eq('account_id', accountId)
    .eq('crew_id', crewId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(`Tax identity not found for decryption: ${error?.message || 'missing record'}`);
  }

  const row = data as Record<string, unknown>;
  return decryptTin({
    ciphertext: String(row.encrypted_tin),
    iv: String(row.tin_iv),
    authTag: String(row.tin_auth_tag),
  });
}
