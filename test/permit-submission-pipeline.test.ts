import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateSubmissionReadiness,
  executePermitSubmission,
} from '../src/lib/permit-intel/submission-pipeline';
import type { UniversalPermitApplicationData } from '../src/lib/permit-intel/application-generator';

vi.mock('@/lib/jobs', () => ({
  getJob: vi.fn().mockResolvedValue({
    id: 'job-1',
    account_id: 'acc-1',
    address: '211 S Williams St, Royal Oak, MI',
  }),
}));

vi.mock('@/lib/job-feed', () => ({
  createJobFeedEvent: vi.fn().mockResolvedValue({ id: 'feed-1' }),
}));

vi.mock('../src/lib/permit-intel/application-generator', () => ({
  compilePermitApplication: vi.fn().mockResolvedValue({
    authority: { id: 'mi-royal-oak', name: 'City of Royal Oak' },
    applicant: {
      companyName: 'Royal Roofing LLC',
      licenseNumber: '2101234567',
    },
    property: {
      streetAddress: '211 S Williams St',
      city: 'Royal Oak',
      state: 'MI',
    },
    workScope: {
      detailedDescription: 'Tear off and replace roof shingles',
      estimatedCost: 8500,
      iceBarrierCompliance: true,
    },
  }),
}));

vi.mock('../src/lib/permit-intel/permit-workflow', () => {
  let inMemoryCase: any = {
    id: 'case-1',
    account_id: 'acc-1',
    job_id: 'job-1',
    application_status: 'draft',
    external_permit_number: null,
  };

  return {
    getOrCreatePermitCase: vi.fn().mockImplementation(async () => inMemoryCase),
    updatePermitCase: vi.fn().mockImplementation(async (_supabase, _acc, _job, updates) => {
      inMemoryCase = {
        ...inMemoryCase,
        application_status: updates.applicationStatus || inMemoryCase.application_status,
        external_permit_number: updates.externalPermitNumber || inMemoryCase.external_permit_number,
      };
      return inMemoryCase;
    }),
    __resetCase: () => {
      inMemoryCase = {
        id: 'case-1',
        account_id: 'acc-1',
        job_id: 'job-1',
        application_status: 'draft',
        external_permit_number: null,
      };
    },
  };
});

import { createJobFeedEvent } from '@/lib/job-feed';
import * as permitWorkflowModule from '../src/lib/permit-intel/permit-workflow';

describe('Permit Submission Pipeline & Authorization Controls', () => {
  const mockAccountId = 'acc-1';
  const mockJobId = 'job-1';
  const mockSupabase = {} as any;

  beforeEach(() => {
    vi.clearAllMocks();
    (permitWorkflowModule as any).__resetCase();
  });

  it('validates submission readiness and blocks when contractor license is missing', () => {
    const invalidApp: UniversalPermitApplicationData = {
      authority: { id: 'mi-royal-oak', name: 'City of Royal Oak', agencyName: 'BCC', department: 'Building' },
      applicant: {
        type: 'contractor',
        companyName: 'Test Roofing',
        contactName: 'John Doe',
        licenseNumber: '', // Missing
        licenseType: 'Builder',
        phone: '248-555-1234',
        email: 'test@example.com',
        address: 'Royal Oak, MI',
      },
      property: {
        ownerName: 'Jane Smith',
        streetAddress: '211 S Williams St',
        city: 'Royal Oak',
        state: 'MI',
        zip: '48067',
        occupancyType: 'R-3',
        constructionType: 'V-B',
      },
      workScope: {
        trade: 'Roofing',
        projectTitle: 'Roof',
        detailedDescription: 'Tear off & Replace',
        estimatedCost: 7500,
        iceBarrierCompliance: true,
        iceBarrierDescription: '24 inches past wall',
        dripEdgeCompliance: true,
        atticVentilationType: 'Ridge vent',
        flashingDetails: 'Step flashing',
      },
      certification: {
        applicantSignatureText: 'Agent',
        signatureDate: '2026-08-26',
        section23aNotice: 'Notice',
      },
    };

    const readiness = validateSubmissionReadiness(invalidApp);
    expect(readiness.isReady).toBe(false);
    expect(readiness.blockers).toContain('Contractor license number is missing or invalid.');
  });

  it('rejects submission execution without explicit contractor authorization', async () => {
    await expect(
      executePermitSubmission(mockSupabase, mockAccountId, mockJobId, {
        contractorAuthorized: false,
        authorizedByName: 'John Doe',
        authorizedByEmail: 'john@example.com',
        qualifyingLicenseNumber: '2101234567',
        agreedToSection23a: true,
      }),
    ).rejects.toThrow('Contractor authorization is mandatory to submit permit.');
  });

  it('rejects submission execution without Section 23a legal agreement', async () => {
    await expect(
      executePermitSubmission(mockSupabase, mockAccountId, mockJobId, {
        contractorAuthorized: true,
        authorizedByName: 'John Doe',
        authorizedByEmail: 'john@example.com',
        qualifyingLicenseNumber: '2101234567',
        agreedToSection23a: false,
      }),
    ).rejects.toThrow('Section 23a');
  });

  it('dispatches authorized submission, advances status to submitted, and creates feed audit event', async () => {
    const result = await executePermitSubmission(
      mockSupabase,
      mockAccountId,
      mockJobId,
      {
        contractorAuthorized: true,
        authorizedByName: 'Master Builder',
        authorizedByEmail: 'master@royalroofing.com',
        qualifyingLicenseNumber: '2101234567',
        agreedToSection23a: true,
      },
      'master@royalroofing.com',
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe('submitted');
    expect(result.externalReferenceNumber).toMatch(/^SUB-\d{8}-/);
    expect(createJobFeedEvent).toHaveBeenCalledWith(
      mockSupabase,
      mockAccountId,
      mockJobId,
      expect.objectContaining({
        kind: 'permit_submission_dispatched',
        title: 'Permit Application Submitted',
      }),
    );
  });
});
