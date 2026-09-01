export interface CoiCoverageLimits {
  generalLiabilityEachOccurrenceDollars: number;
  generalAggregateDollars: number;
  productsCompletedOpsAggregateDollars: number;
  automobileLiabilityCombinedSingleLimitDollars: number;
  workersCompensationEachAccidentDollars: number;
  umbrellaExcessLiabilityDollars: number;
}

export interface ParsedCertificateOfInsurance {
  certificateId: string;
  subcontractorAccountId: string;
  producerAgencyName: string;
  insuredEntityName: string;
  insuranceCarrierName: string;
  policyNumber: string;
  policyEffectiveDate: string;
  policyExpirationDate: string;
  coverageLimits: CoiCoverageLimits;
  isAdditionalInsuredIncluded: boolean;
  isWaiverOfSubrogationIncluded: boolean;
  certificateHolderName: string;
  verificationStatus: 'verified_active' | 'expiring_soon' | 'expired' | 'insufficient_limits' | 'unverified';
  daysUntilExpiration: number;
  deficiencies: string[];
  isDispatchAllowed: boolean;
}

/**
 * Standard minimum trade contractor coverage requirements
 */
export const STANDARD_MINIMUM_COI_LIMITS: CoiCoverageLimits = {
  generalLiabilityEachOccurrenceDollars: 1000000, // $1,000,000
  generalAggregateDollars: 2000000,             // $2,000,000
  productsCompletedOpsAggregateDollars: 2000000, // $2,000,000
  automobileLiabilityCombinedSingleLimitDollars: 1000000, // $1,000,000
  workersCompensationEachAccidentDollars: 500000, // $500,000
  umbrellaExcessLiabilityDollars: 0,             // Optional
};

/**
 * Parses and evaluates an ACORD 25 Certificate of Liability Insurance
 */
export function evaluateSubcontractorCoi(params: {
  subcontractorAccountId: string;
  producerAgencyName: string;
  insuredEntityName: string;
  insuranceCarrierName: string;
  policyNumber: string;
  policyEffectiveDate: string;
  policyExpirationDate: string;
  coverageLimits: CoiCoverageLimits;
  isAdditionalInsuredIncluded: boolean;
  certificateHolderName: string;
  now?: Date;
}): ParsedCertificateOfInsurance {
  const {
    subcontractorAccountId,
    producerAgencyName,
    insuredEntityName,
    insuranceCarrierName,
    policyNumber,
    policyEffectiveDate,
    policyExpirationDate,
    coverageLimits,
    isAdditionalInsuredIncluded,
    certificateHolderName,
  } = params;

  const now = params.now || new Date();
  const expMs = new Date(policyExpirationDate).getTime();
  const daysUntilExpiration = Math.floor((expMs - now.getTime()) / (24 * 60 * 60 * 1000));

  const deficiencies: string[] = [];

  // Check limits
  if (coverageLimits.generalLiabilityEachOccurrenceDollars < STANDARD_MINIMUM_COI_LIMITS.generalLiabilityEachOccurrenceDollars) {
    deficiencies.push(`Each Occurrence limit ($${coverageLimits.generalLiabilityEachOccurrenceDollars.toLocaleString()}) below required $1,000,000.`);
  }
  if (coverageLimits.generalAggregateDollars < STANDARD_MINIMUM_COI_LIMITS.generalAggregateDollars) {
    deficiencies.push(`General Aggregate limit ($${coverageLimits.generalAggregateDollars.toLocaleString()}) below required $2,000,000.`);
  }
  if (!isAdditionalInsuredIncluded) {
    deficiencies.push('Let\'s Get Quoted / Prime Contractor not listed as Additional Insured on policy endorsement.');
  }

  let verificationStatus: ParsedCertificateOfInsurance['verificationStatus'] = 'verified_active';

  if (daysUntilExpiration < 0) {
    verificationStatus = 'expired';
    deficiencies.push(`Insurance policy expired ${Math.abs(daysUntilExpiration)} days ago on ${policyExpirationDate}.`);
  } else if (deficiencies.length > 0) {
    verificationStatus = 'insufficient_limits';
  } else if (daysUntilExpiration <= 30) {
    verificationStatus = 'expiring_soon';
  }

  const isDispatchAllowed = verificationStatus === 'verified_active' || verificationStatus === 'expiring_soon';

  return {
    certificateId: `coi_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    subcontractorAccountId,
    producerAgencyName,
    insuredEntityName,
    insuranceCarrierName,
    policyNumber,
    policyEffectiveDate,
    policyExpirationDate,
    coverageLimits,
    isAdditionalInsuredIncluded,
    isWaiverOfSubrogationIncluded: true,
    certificateHolderName,
    verificationStatus,
    daysUntilExpiration,
    deficiencies,
    isDispatchAllowed,
  };
}
