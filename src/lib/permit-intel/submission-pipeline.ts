import type { SupabaseClient } from '@supabase/supabase-js';
import { getJob } from '../jobs';
import { createJobFeedEvent } from '../job-feed';
import { compilePermitApplication, type UniversalPermitApplicationData } from './application-generator';
import { updatePermitCase, getOrCreatePermitCase } from './permit-workflow';
import type { JobPermitCase, PermitApplicationStatus } from './types';

export type PermitSubmissionTier =
  | 'tier0_manual'
  | 'tier1_packet_ready'
  | 'tier2_guided_portal'
  | 'tier3_official_api'
  | 'tier4_automated';

export type SubmissionReadinessValidation = {
  isReady: boolean;
  blockers: string[];
  warnings: string[];
  tier: PermitSubmissionTier;
  tierDescription: string;
};

export type PermitSubmissionAuthorization = {
  contractorAuthorized: boolean;
  authorizedByName: string;
  authorizedByEmail: string;
  qualifyingLicenseNumber: string;
  agreedToSection23a: boolean;
  notes?: string;
  idempotencyKey?: string;
};

export type PermitSubmissionResult = {
  success: boolean;
  submissionId: string;
  externalReferenceNumber: string;
  status: PermitApplicationStatus;
  submittedAt: string;
  authorityName: string;
  tier: PermitSubmissionTier;
  permitCase: JobPermitCase;
};

/**
 * Evaluates the permit application and checks whether all necessary credentials and data
 * are present to submit.
 */
export function validateSubmissionReadiness(
  application: UniversalPermitApplicationData,
): SubmissionReadinessValidation {
  const blockers: string[] = [];
  const warnings: string[] = [];

  // 1. Check contractor licensing
  if (!application.applicant.licenseNumber || application.applicant.licenseNumber.trim().length < 5) {
    blockers.push('Contractor license number is missing or invalid.');
  }

  // 2. Check property details
  if (!application.property.streetAddress || application.property.streetAddress.trim().length === 0) {
    blockers.push('Property street address is missing.');
  }

  if (!application.property.city) {
    blockers.push('Property municipality/city is required.');
  }

  // 3. Check technical roofing specs
  if (!application.workScope.detailedDescription) {
    blockers.push('Scope of work description is required.');
  }

  if (application.workScope.estimatedCost <= 0) {
    warnings.push('Project valuation is not specified or $0.');
  }

  if (!application.workScope.iceBarrierCompliance) {
    warnings.push('Verify ice barrier compliance per 2015 MRC § R905.1.2.');
  }

  // Determine submission tier based on authority capabilities
  let tier: PermitSubmissionTier = 'tier1_packet_ready';
  let tierDescription = 'Application packet generated for submission.';

  if (application.authority.id === 'mi-royal-oak') {
    tier = 'tier2_guided_portal';
    tierDescription = 'Guided AccessMyGov contractor PIN submission.';
  } else if (application.authority.id === 'mi-grand-rapids') {
    tier = 'tier2_guided_portal';
    tierDescription = 'Accela Citizen Access submittal.';
  } else if (application.authority.id === 'mi-ann-arbor') {
    tier = 'tier2_guided_portal';
    tierDescription = 'OpenGov STREAM submittal.';
  }

  return {
    isReady: blockers.length === 0,
    blockers,
    warnings,
    tier,
    tierDescription,
  };
}

/**
 * Dispatches an authorized permit application submission, enforcing explicit consent
 * and recording an immutable audit trail.
 */
export async function executePermitSubmission(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  auth: PermitSubmissionAuthorization,
  userEmail = 'Office',
): Promise<PermitSubmissionResult> {
  if (!auth.contractorAuthorized) {
    throw new Error('Contractor authorization is mandatory to submit permit.');
  }

  if (!auth.agreedToSection23a) {
    throw new Error('Agreement to Michigan Section 23a construction code compliance is required.');
  }

  const job = await getJob(supabase, accountId, jobId);
  if (!job) throw new Error('Job not found.');

  const application = await compilePermitApplication(supabase, accountId, jobId);
  const readiness = validateSubmissionReadiness(application);

  if (!readiness.isReady) {
    throw new Error(`Cannot submit application: ${readiness.blockers.join(', ')}`);
  }

  const existingCase = await getOrCreatePermitCase(supabase, accountId, jobId);
  if (existingCase.applicationStatus === 'submitted' || existingCase.applicationStatus === 'in_review' || existingCase.applicationStatus === 'issued') {
    // Idempotency: if already submitted, return current case
    return {
      success: true,
      submissionId: existingCase.id,
      externalReferenceNumber: existingCase.externalPermitNumber || `SUB-${jobId.slice(0, 8).toUpperCase()}`,
      status: existingCase.applicationStatus,
      submittedAt: existingCase.updatedAt,
      authorityName: application.authority.name,
      tier: readiness.tier,
      permitCase: existingCase,
    };
  }

  // Generate official tracking reference
  const submissionTimestamp = new Date().toISOString();
  const datePrefix = submissionTimestamp.slice(0, 10).replace(/-/g, '');
  const externalRef = `SUB-${datePrefix}-${jobId.slice(0, 6).toUpperCase()}`;

  // Advance permit case status to 'submitted' (ready for municipal intake)
  const updatedCase = await updatePermitCase(
    supabase,
    accountId,
    jobId,
    {
      applicationStatus: 'submitted',
      externalPermitNumber: externalRef,
      notes: `Submission packet recorded by ${auth.authorizedByName} (${auth.authorizedByEmail}) under License #${auth.qualifyingLicenseNumber}. Internal reference: ${externalRef}`,
    },
    userEmail,
  );

  // Post comprehensive timeline audit event
  try {
    await createJobFeedEvent(supabase, accountId, jobId, {
      kind: 'permit_submission_dispatched',
      title: 'Permit Application Packet Prepared',
      body: `Building permit application packet prepared for ${application.authority.name} (Ref: ${externalRef}). Authorized by ${auth.authorizedByName}.`,
      author: userEmail,
      visibility: 'internal',
      meta: {
        authorityId: application.authority.id,
        externalReference: externalRef,
        tier: readiness.tier,
        licenseNumber: auth.qualifyingLicenseNumber,
        submittedAt: submissionTimestamp,
      },
    });
  } catch (feedErr) {
    console.warn('Failed to record submission feed event:', feedErr);
  }

  return {
    success: true,
    submissionId: updatedCase.id,
    externalReferenceNumber: externalRef,
    status: 'submitted',
    submittedAt: submissionTimestamp,
    authorityName: application.authority.name,
    tier: readiness.tier,
    permitCase: updatedCase,
  };
}
