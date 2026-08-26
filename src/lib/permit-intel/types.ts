import type {
  JurisdictionDiscipline,
  JurisdictionMatch,
  ParsedAddress,
} from '../location-context/types';

export type PermitRequirementVerdict = 'required' | 'not_required' | 'verify';

export type PermitConfidence = 'verified' | 'high' | 'medium' | 'low';

export type PermitWorkScope =
  | 'replacement' // Complete tear-off and re-roof
  | 'overlay' // Second layer / re-cover
  | 'repair' // Minor spot repair (< 1 square or minor patch)
  | 'new_construction'
  | 'alteration'
  | 'general';

export type PermitWorkContext = {
  trade: 'roofing' | 'siding' | 'gutters' | 'solar' | 'electrical' | 'mechanical' | 'plumbing' | 'general';
  discipline?: JurisdictionDiscipline;
  scope: PermitWorkScope;
  occupancy?: 'one_family_residential' | 'two_family_residential' | 'multi_family' | 'commercial';
  structure?: 'existing' | 'new';
  roofSquares?: number;
  estimatedCost?: number;
  projectDate?: string;
  freeTextDescription?: string;
};

export type CodeReference = {
  codeFamily: string; // e.g. "MRC" (Michigan Residential Code), "IRC", "IBC", "NEC"
  editionYear: string; // e.g. "2015", "2021"
  section: string; // e.g. "R908.3", "R905"
  title: string;
  plainEnglishSummary: string;
  amendmentType?: 'state_amendment' | 'local_ordinance' | 'standard_model';
  citationUrl?: string;
};

export type CodeAdoption = {
  codeFamily: string;
  editionYear: string;
  effectiveDate: string;
  governingBody: string;
  isCurrent: boolean;
  references: CodeReference[];
};

export type RequirementRuleResult = {
  decision: PermitRequirementVerdict;
  permitTypes: string[];
  requiredDocuments: string[];
  requiredInspections: string[];
  estimatedGovernmentFee?: {
    baseFee: number;
    unitRate?: number;
    estimatedTotal: number;
    notes?: string;
  } | null;
  reasons: string[];
  citations: CodeReference[];
  confidence: PermitConfidence;
  disclaimer: string;
};

export type PermitAuthorityContact = {
  phone?: string;
  email?: string;
  address?: string;
  officeHours?: string;
  inspectorHours?: string;
};

export type PermitPortalAction = {
  label: string;
  url: string;
  providerType: 'bsa_accessmygov' | 'accela' | 'opengov' | 'municipality_native' | 'generic';
  requiresContractorPin?: boolean;
  pinInstructions?: string;
};

export type FreshnessMetadata = {
  lastCheckedAt: string;
  sourceName: string;
  sourceUrl?: string;
  effectiveDate?: string;
  confidence: PermitConfidence;
};

export type PermitApplicationStatus =
  | 'not_started'
  | 'draft'
  | 'ready_for_review'
  | 'authorized'
  | 'submitting'
  | 'submitted'
  | 'in_review'
  | 'corrections_required'
  | 'approved'
  | 'issued'
  | 'rejected'
  | 'withdrawn'
  | 'inspection_scheduled'
  | 'inspection_passed'
  | 'inspection_failed'
  | 'closed';

export type JobPermitCase = {
  id: string;
  accountId: string;
  jobId: string;
  authorityId?: string | null;
  requirementVerdict: PermitRequirementVerdict;
  applicationStatus: PermitApplicationStatus;
  externalPermitNumber?: string | null;
  estimatedFee?: number | null;
  actualFee?: number | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JobPermitDocument = {
  id: string;
  accountId: string;
  jobId: string;
  permitCaseId?: string | null;
  documentType: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  storagePath: string;
  downloadUrl?: string;
  createdAt: string;
};

export type PermitInspectionStatus =
  | 'required'
  | 'requested'
  | 'scheduled'
  | 'passed'
  | 'failed'
  | 'cancelled'
  | 'waived';

export type JobPermitInspection = {
  id: string;
  accountId: string;
  jobId: string;
  permitCaseId?: string | null;
  inspectionType: string;
  title: string;
  status: PermitInspectionStatus;
  requestedDate?: string | null;
  scheduledDate?: string | null;
  completedDate?: string | null;
  inspectorName?: string | null;
  inspectorPhone?: string | null;
  notes?: string | null;
  failureReasons?: string[] | null;
  reinspectionFee?: number | null;
  createdAt: string;
  updatedAt: string;
};

export type PermitWorkspaceDto = {
  summary: {
    verdict: PermitRequirementVerdict;
    headline: string;
    description: string;
    confidence: PermitConfidence;
  };
  authority: {
    id: string;
    name: string;
    agencyName: string;
    department: string;
    discipline: JurisdictionDiscipline;
    contact: PermitAuthorityContact;
    portalAction?: PermitPortalAction;
  };
  location: {
    address: ParsedAddress;
    jurisdiction: JurisdictionMatch;
  };
  work: PermitWorkContext;
  requirement: RequirementRuleResult;
  codes: CodeAdoption[];
  localAmendments: CodeReference[];
  freshness: FreshnessMetadata;
  permitCase?: JobPermitCase | null;
  documents?: JobPermitDocument[];
  inspections?: JobPermitInspection[];
  availableActions: {
    canOpenPortal: boolean;
    canViewHistory: boolean;
    canDraftApplication: boolean;
    canSubmitOnline: boolean;
  };
};
