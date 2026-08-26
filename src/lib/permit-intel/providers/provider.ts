import type {
  JurisdictionDiscipline,
  JurisdictionMatch,
  ParsedAddress,
} from '../../location-context/types';
import type { CodeAdoption, CodeReference } from '../types';

export type ExternalPermitStatus =
  | 'applied'
  | 'in_review'
  | 'issued'
  | 'active'
  | 'inspection_phase'
  | 'finaled'
  | 'closed'
  | 'expired'
  | 'void'
  | 'unknown';

export type ExternalPermitRecord = {
  permitNumber: string;
  permitType: string;
  description?: string;
  status: ExternalPermitStatus;
  rawStatus?: string;
  issueDate?: string;
  appliedDate?: string;
  completedDate?: string;
  valuation?: number;
  contractorName?: string;
  applicantName?: string;
  address?: string;
  parcelId?: string;
  sourceUrl?: string;
  provider: string;
  confidence: 'verified' | 'high' | 'medium' | 'low';
};

export type ProviderResultMeta = {
  providerName: string;
  sourceUrl?: string;
  retrievedAt: string;
  effectiveDate?: string;
  confidence: 'verified' | 'high' | 'medium' | 'low';
  isAuthoritative: boolean;
};

export interface JurisdictionProvider {
  resolve(
    location: ParsedAddress,
    discipline: JurisdictionDiscipline,
  ): Promise<JurisdictionMatch>;
}

export interface CodeProvider {
  getAdoptions(authorityId: string, projectDate?: string): Promise<CodeAdoption[]>;
  getAmendments(authorityId: string): Promise<CodeReference[]>;
}

export interface PermitHistoryProvider {
  readonly providerId: string;
  readonly providerName: string;

  supports(authorityId: string, location: ParsedAddress): boolean;

  searchHistory(
    location: ParsedAddress,
    authorityId: string,
  ): Promise<{
    records: ExternalPermitRecord[];
    meta: ProviderResultMeta;
    portalSearchUrl?: string;
  }>;
}

export interface PermitSubmissionProvider {
  readonly providerId: string;
  validateDraft(draftPayload: Record<string, unknown>): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }>;
  submit(authorizedPayload: Record<string, unknown>): Promise<{
    externalId: string;
    submittedAt: string;
    status: ExternalPermitStatus;
    idempotencyKey: string;
  }>;
  getStatus(externalId: string): Promise<{
    status: ExternalPermitStatus;
    rawStatus: string;
    updatedAt: string;
  }>;
}
