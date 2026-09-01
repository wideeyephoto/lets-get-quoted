export interface Tax1099AccountStatus {
  accountId: string;
  businessName: string;
  grossPaymentsCollectedDollars: number;
  thresholdDollars: number;
  exceeds1099Threshold: boolean;
  hasEncryptedTaxId: boolean;
  taxVaultStatus: 'verified_encrypted' | 'pending_w9' | 'exempt';
  actionRequired: string | null;
}

/**
 * Tracks contractor gross processing volume towards IRS $600 1099-NEC/1099-K reporting thresholds
 */
export function evaluate1099TaxCompliance(params: {
  accountId: string;
  businessName: string;
  grossPaymentsCollectedDollars: number;
  hasEncryptedTaxId: boolean;
}): Tax1099AccountStatus {
  const { accountId, businessName, grossPaymentsCollectedDollars, hasEncryptedTaxId } = params;
  const thresholdDollars = 600;
  const exceeds1099Threshold = grossPaymentsCollectedDollars >= thresholdDollars;

  let taxVaultStatus: Tax1099AccountStatus['taxVaultStatus'] = 'pending_w9';
  let actionRequired: string | null = null;

  if (hasEncryptedTaxId) {
    taxVaultStatus = 'verified_encrypted';
  } else if (exceeds1099Threshold) {
    taxVaultStatus = 'pending_w9';
    actionRequired = 'Request W-9 submission and encrypt TIN in tax vault before year-end.';
  } else {
    taxVaultStatus = 'exempt';
  }

  return {
    accountId,
    businessName,
    grossPaymentsCollectedDollars,
    thresholdDollars,
    exceeds1099Threshold,
    hasEncryptedTaxId,
    taxVaultStatus,
    actionRequired,
  };
}
