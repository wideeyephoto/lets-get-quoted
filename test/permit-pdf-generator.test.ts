import { describe, it, expect } from 'vitest';
import { generatePermitApplicationPdf } from '../src/lib/permit-intel/permit-pdf-generator';
import type { UniversalPermitApplicationData } from '../src/lib/permit-intel/application-generator';

describe('Permit PDF Generator Engine', () => {
  const sampleData: UniversalPermitApplicationData = {
    authority: {
      id: 'mi-royal-oak',
      name: 'City of Royal Oak',
      agencyName: 'Building Division',
      department: 'Community Development',
      contactPhone: '(248) 246-3200',
    },
    applicant: {
      type: 'contractor',
      companyName: 'Apex Roofing LLC',
      contactName: 'John Contractor',
      licenseNumber: '2101999888',
      licenseType: 'Residential Builder',
      licenseExpiration: '2027-05-31',
      insuranceCarrier: 'Auto-Owners Insurance',
      insurancePolicyNumber: 'AO-9948271',
      workersCompCarrier: 'State Accident Fund',
      phone: '(248) 555-0199',
      email: 'john@apexroofing.com',
      address: '100 Main St, Royal Oak, MI',
    },
    property: {
      ownerName: 'Jane Homeowner',
      ownerPhone: '(248) 555-0122',
      ownerEmail: 'jane@example.com',
      streetAddress: '211 S Williams St',
      city: 'Royal Oak',
      state: 'MI',
      zip: '48067',
      parcelNumber: '72-25-16-100-001',
      occupancyType: 'One-Family Residential (R-3)',
      constructionType: 'Type V-B (Wood Frame)',
    },
    workScope: {
      trade: 'Building (Roofing)',
      projectTitle: 'Residential Roof Tear-Off & Replacement',
      detailedDescription: 'Tear off existing asphalt shingles down to wood deck, install synthetic underlayment, ice barrier, and 30-year architectural shingles.',
      estimatedCost: 12500,
      roofSquares: 26,
      layersToTearOff: 1,
      newRoofCovering: 'GAF Timberline HDZ Architectural Shingles',
      underlayment: 'Synthetic Underlayment (ASTM D226)',
      iceBarrierCompliance: true,
      iceBarrierDescription: 'Self-adhering polymer modified bitumen extending 24 inches inside exterior wall line',
      dripEdgeCompliance: true,
      atticVentilationType: 'Ridge Vent and Soffit Vents',
      flashingDetails: 'Step flashing at sidewalls, pre-formed chimney flashing',
    },
    certification: {
      applicantSignatureText: 'John Contractor',
      signatureDate: '2026-08-26',
      section23aNotice: 'Section 23a of the state construction code act of 1972, 1972 PA 230, MCL 125.1523a, prohibits a person from conspiring to circumvent the licensing requirements of this state relating to persons who are to perform work on a residential building or a residential structure.',
    },
  };

  it('generates a valid PDF buffer starting with %PDF-', async () => {
    const pdfBuffer = await generatePermitApplicationPdf(sampleData);
    expect(pdfBuffer).toBeDefined();
    expect(pdfBuffer.length).toBeGreaterThan(1000);

    // Verify PDF header magic bytes
    const header = pdfBuffer.subarray(0, 5).toString('ascii');
    expect(header).toBe('%PDF-');
  });
});
