import type { SupabaseClient } from '@supabase/supabase-js';
import { getJob } from '../jobs';
import { normalizeAddress } from '../location-context/normalize-address';
import { resolveJurisdiction } from '../location-context/jurisdiction-resolver';
import { evaluatePermitRequirement, classifyWorkScope } from './requirement-engine';
import { listJobInspections } from './inspection-service';
import type { JobPermitInspection } from './types';

export type CustomerPermitStage =
  | 'not_required'
  | 'drafting'
  | 'submitted'
  | 'under_review'
  | 'issued'
  | 'inspections'
  | 'completed';

export type CustomerPermitMilestone = {
  id: string;
  title: string;
  status: 'completed' | 'current' | 'pending';
  date?: string;
  notes?: string;
};

export type CustomerPermitSummaryDto = {
  statusBadge: string;
  stage: CustomerPermitStage;
  stageIndex: number;
  totalStages: number;
  authorityName: string;
  agencyName: string;
  permitNumber: string | null;
  verificationUrl: string | null;
  milestones: CustomerPermitMilestone[];
  headline: string;
  description: string;
  isCompliant: boolean;
  lastUpdated: string;
};

/**
 * Compiles a sanitized, homeowner-safe permit status summary for customer portals,
 * quotes, and job tracking views.
 *
 * Strict Privacy Rule: Never exposes internal contractor PINs, internal cost margins,
 * private checklists, or raw municipal API credentials.
 */
export async function getCustomerPermitSummary(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
): Promise<CustomerPermitSummaryDto> {
  const job = await getJob(supabase, accountId, jobId);
  if (!job) {
    throw new Error('Job not found.');
  }

  const parsedAddress = normalizeAddress(job.address);
  const work = classifyWorkScope(job.scope);
  const effectiveDiscipline = work.discipline || 'building';
  const jurisdiction = resolveJurisdiction(parsedAddress, effectiveDiscipline);
  const requirement = evaluatePermitRequirement(jurisdiction.authorityId, work);

  // Fetch permit case record
  const { data: permitCase } = await supabase
    .from('job_permit_cases')
    .select('application_status, external_permit_number, submission_tier, updated_at')
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .maybeSingle();

  // Fetch inspections
  let inspections: JobPermitInspection[] = [];
  try {
    inspections = await listJobInspections(supabase, accountId, jobId);
  } catch (err) {
    console.warn('Failed to load inspections for customer summary:', err);
  }

  const appStatus = permitCase?.application_status || 'not_started';
  const permitNumber = permitCase?.external_permit_number || null;

  // Resolve verification link
  let verificationUrl: string | null = null;
  if (jurisdiction.authorityId === 'mi-royal-oak') {
    verificationUrl = 'https://www.accessmygov.com/?uid=1349';
  } else if (jurisdiction.authorityId === 'mi-detroit') {
    verificationUrl = 'https://detroitmi.gov/departments/buildings-safety-engineering-and-environmental-department';
  } else if (jurisdiction.authorityId === 'mi-grand-rapids') {
    verificationUrl = 'https://aca-prod.accela.com/GRANDRAPIDS/Default.aspx';
  } else if (jurisdiction.authorityId === 'mi-ann-arbor') {
    verificationUrl = 'https://annarbormi.portal.opengov.com';
  } else {
    verificationUrl = 'https://www.michigan.gov/lara/bureau-list/bcc';
  }

  if (requirement.decision === 'not_required' && appStatus === 'not_started') {
    return {
      statusBadge: 'Permit Not Required',
      stage: 'not_required',
      stageIndex: 1,
      totalStages: 1,
      authorityName: jurisdiction.authorityName,
      agencyName: jurisdiction.agencyName,
      permitNumber: null,
      verificationUrl: null,
      milestones: [
        {
          id: 'm1',
          title: 'Permit Exemption Verified',
          status: 'completed',
          date: new Date().toISOString().split('T')[0],
          notes: 'Standard maintenance or minor repair exempt under Michigan Residential Code.',
        },
      ],
      headline: 'Work is Municipal Code Exempt',
      description: `Per ${jurisdiction.authorityName} guidelines, this scope of work does not require a municipal trade permit.`,
      isCompliant: true,
      lastUpdated: new Date().toISOString(),
    };
  }

  // Determine stage and index
  let stage: CustomerPermitStage = 'drafting';
  let stageIndex = 1;
  let statusBadge = 'Permit Application in Progress';
  let headline = 'Permit Application Being Prepared';
  let description = `Our team is assembling the required technical drawings and documentation for ${jurisdiction.authorityName}.`;

  if (appStatus === 'submitted') {
    stage = 'submitted';
    stageIndex = 2;
    statusBadge = 'Application Submitted';
    headline = 'Submitted to Municipality';
    description = `Application has been transmitted to ${jurisdiction.agencyName}.`;
  } else if (appStatus === 'in_review') {
    stage = 'under_review';
    stageIndex = 2;
    statusBadge = 'Under Plan Review';
    headline = 'Municipal Plan Review';
    description = `${jurisdiction.authorityName} building officials are reviewing the project plan.`;
  } else if (appStatus === 'issued') {
    stage = 'issued';
    stageIndex = 3;
    statusBadge = 'Permit Issued';
    headline = 'Permit Officially Issued';
    description = `Municipal permit #${permitNumber || 'Active'} is active. Construction is fully authorized.`;
  } else if (appStatus === 'inspection_scheduled') {
    stage = 'inspections';
    stageIndex = 4;
    statusBadge = 'Inspections in Progress';
    headline = 'Municipal Inspections Active';
    description = `Work is progressing through official city inspections.`;
  } else if (appStatus === 'closed') {
    stage = 'completed';
    stageIndex = 5;
    statusBadge = 'Final Inspection Passed & Closed';
    headline = '100% Code Compliant & Closed';
    description = `All required municipal inspections have been completed and passed.`;
  }

  // Generate milestone timeline
  const milestones: CustomerPermitMilestone[] = [
    {
      id: 'm1',
      title: 'Jurisdiction & Code Verification',
      status: 'completed',
      date: job.address ? 'Verified' : undefined,
    },
    {
      id: 'm2',
      title: 'Permit Application Submission',
      status: ['submitted', 'in_review', 'issued', 'inspection_scheduled', 'closed'].includes(appStatus)
        ? 'completed'
        : stage === 'drafting'
        ? 'current'
        : 'pending',
    },
    {
      id: 'm3',
      title: 'Official Municipal Permit Issuance',
      status: ['issued', 'inspection_scheduled', 'closed'].includes(appStatus)
        ? 'completed'
        : appStatus === 'in_review' || appStatus === 'submitted'
        ? 'current'
        : 'pending',
      notes: permitNumber ? `Permit #${permitNumber}` : undefined,
    },
  ];

  if (inspections.length > 0) {
    for (const insp of inspections) {
      milestones.push({
        id: insp.id,
        title: `${insp.inspectionType} Inspection`,
        status: insp.status === 'passed' ? 'completed' : insp.status === 'scheduled' ? 'current' : 'pending',
        date: insp.scheduledDate || undefined,
        notes: insp.status === 'passed' ? 'Passed with City Inspector' : undefined,
      });
    }
  } else {
    milestones.push({
      id: 'm4',
      title: 'Final Municipal Inspection',
      status: appStatus === 'closed' ? 'completed' : appStatus === 'inspection_scheduled' ? 'current' : 'pending',
    });
  }

  return {
    statusBadge,
    stage,
    stageIndex,
    totalStages: 5,
    authorityName: jurisdiction.authorityName,
    agencyName: jurisdiction.agencyName,
    permitNumber,
    verificationUrl,
    milestones,
    headline,
    description,
    isCompliant: true,
    lastUpdated: permitCase?.updated_at || new Date().toISOString(),
  };
}
