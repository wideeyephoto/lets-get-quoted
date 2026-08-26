import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeAddress } from '../location-context/normalize-address';
import { resolveJurisdiction } from '../location-context/jurisdiction-resolver';
import { getApplicableCodes, getLocalAmendments } from './code-catalog';
import { classifyWorkScope, evaluatePermitRequirement } from './requirement-engine';
import { getOrCreatePermitCase, listPermitDocuments } from './permit-workflow';
import { listJobInspections } from './inspection-service';
import type { JurisdictionDiscipline } from '../location-context/types';
import type {
  JobPermitCase,
  JobPermitDocument,
  JobPermitInspection,
  PermitPortalAction,
  PermitWorkspaceDto,
  PermitWorkContext,
} from './types';

/**
 * Main permit intelligence service that compiles full permit dossier for a job or address.
 */
export async function getPermitIntelligence(params: {
  address?: string | null;
  rawScope?: string | null;
  discipline?: JurisdictionDiscipline;
  workContext?: Partial<PermitWorkContext>;
  supabase?: SupabaseClient;
  accountId?: string;
  jobId?: string;
  permitCase?: JobPermitCase | null;
  documents?: JobPermitDocument[];
  inspections?: JobPermitInspection[];
}): Promise<PermitWorkspaceDto> {
  const parsedAddress = normalizeAddress(params.address);

  const work = params.workContext?.trade
    ? {
        trade: params.workContext.trade,
        discipline: params.workContext.discipline || params.discipline || 'building',
        scope: params.workContext.scope || 'replacement',
        occupancy: params.workContext.occupancy || 'one_family_residential',
        structure: params.workContext.structure || 'existing',
        roofSquares: params.workContext.roofSquares || 22,
        estimatedCost: params.workContext.estimatedCost,
        freeTextDescription: params.rawScope || undefined,
      }
    : classifyWorkScope(params.rawScope);

  const effectiveDiscipline: JurisdictionDiscipline =
    params.discipline || work.discipline || 'building';

  const jurisdiction = resolveJurisdiction(parsedAddress, effectiveDiscipline);
  const requirement = evaluatePermitRequirement(jurisdiction.authorityId, work);
  const codes = getApplicableCodes(jurisdiction.authorityId, effectiveDiscipline);
  const localAmendments = getLocalAmendments(jurisdiction.authorityId);

  // Configure authority contact and portal action
  let portalAction: PermitPortalAction | undefined;
  let contactPhone = '248-246-3210';
  let officeHours = 'Monday – Friday, 8:00 AM – 4:30 PM';
  let inspectorHours = '8:00 AM – 9:00 AM & 3:30 PM – 4:30 PM';
  let department = 'Building Inspection Division';

  if (jurisdiction.authorityId === 'mi-royal-oak') {
    portalAction = {
      label: 'Open City of Royal Oak BS&A Portal (AccessMyGov)',
      url: 'https://www.accessmygov.com/?uid=1349',
      providerType: 'bsa_accessmygov',
      requiresContractorPin: true,
      pinInstructions: 'A City-issued Contractor PIN is required to link an existing registration on AccessMyGov.',
    };
    contactPhone = '248-246-3210';
    officeHours = 'Monday – Friday, 8:00 AM – 4:30 PM';
    department = 'Building Inspection Division';
  } else if (jurisdiction.authorityId === 'mi-detroit') {
    portalAction = {
      label: 'Open Detroit BSEED Permitting Portal',
      url: 'https://detroitmi.gov/departments/buildings-safety-engineering-and-environmental-department',
      providerType: 'municipality_native',
    };
    contactPhone = '313-224-2733';
    department = 'Buildings, Safety Engineering, and Environmental Dept (BSEED)';
  } else if (jurisdiction.authorityId === 'mi-grand-rapids') {
    portalAction = {
      label: 'Open Grand Rapids Citizen Access Portal',
      url: 'https://www.citizenaccess.grandrapidsmi.gov',
      providerType: 'accela',
    };
    contactPhone = '616-456-4100';
    department = 'Development Center';
  } else if (jurisdiction.authorityId === 'mi-ann-arbor') {
    portalAction = {
      label: 'Open Ann Arbor STREAM Permitting Portal',
      url: 'https://stream.a2gov.org',
      providerType: 'opengov',
    };
    contactPhone = '734-794-6263';
    department = 'Planning & Development Services';
  } else {
    portalAction = jurisdiction.sourceUrl
      ? {
          label: `Open ${jurisdiction.authorityName} Website`,
          url: jurisdiction.sourceUrl,
          providerType: 'generic',
        }
      : undefined;
    contactPhone = 'Contact local authority';
    department = 'Building & Code Enforcement Department';
  }

  const headline =
    requirement.decision === 'required'
      ? `Permit Required · ${jurisdiction.authorityName}`
      : requirement.decision === 'not_required'
      ? `Permit Not Required · ${jurisdiction.authorityName}`
      : `Verify Requirement with ${jurisdiction.authorityName}`;

  const description =
    requirement.reasons[0] ||
    'Review municipal building code requirements before initiating construction.';

  let permitCase: JobPermitCase | null = params.permitCase ?? null;
  let documents: JobPermitDocument[] = params.documents ?? [];
  let inspections: JobPermitInspection[] = params.inspections ?? [];

  if (params.supabase && params.accountId && params.jobId && !permitCase) {
    try {
      permitCase = await getOrCreatePermitCase(params.supabase, params.accountId, params.jobId, {
        authorityId: jurisdiction.authorityId,
        requirementVerdict: requirement.decision,
        estimatedFee: requirement.estimatedGovernmentFee?.estimatedTotal,
      });
      documents = await listPermitDocuments(params.supabase, params.accountId, params.jobId);
      inspections = await listJobInspections(params.supabase, params.accountId, params.jobId);
    } catch (caseErr) {
      console.warn('Failed to load permit case, documents, or inspections:', caseErr);
    }
  }

  return {
    summary: {
      verdict: requirement.decision,
      headline,
      description,
      confidence: requirement.confidence,
    },
    authority: {
      id: jurisdiction.authorityId,
      name: jurisdiction.authorityName,
      agencyName: jurisdiction.agencyName,
      department,
      discipline: jurisdiction.discipline,
      contact: {
        phone: contactPhone,
        officeHours,
        inspectorHours,
      },
      portalAction,
    },
    location: {
      address: parsedAddress,
      jurisdiction,
    },
    work,
    requirement,
    codes,
    localAmendments,
    freshness: {
      lastCheckedAt: new Date().toISOString(),
      sourceName: jurisdiction.isAuthoritative
        ? `${jurisdiction.authorityName} Official Register`
        : 'Michigan Bureau of Construction Codes (LARA)',
      sourceUrl: jurisdiction.sourceUrl,
      effectiveDate: '2026-08-26',
      confidence: requirement.confidence,
    },
    permitCase,
    documents,
    inspections,
    availableActions: {
      canOpenPortal: Boolean(portalAction),
      canViewHistory: true,
      canDraftApplication: true,
      canSubmitOnline: false, // Phase 5 submission pilot
    },
  };
}
