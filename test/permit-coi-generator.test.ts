import { describe, it, expect } from 'vitest';
import { generateMunicipalCoi, generateCoiHtml } from '../src/lib/permit-intel/coi-generator';

describe('Municipality-Specific Certificate of Insurance (COI) Generator', () => {
  it('generates ACORD 25 compliant COI naming the municipality as certificate holder & additional insured', () => {
    const cert = generateMunicipalCoi({
      contractor: {
        companyName: 'Apex Roofing & Solar LLC',
        address: '500 Woodward Ave, Detroit, MI 48226',
        licenseNumber: 'MI-210199482',
        generalLiabilityCarrier: 'Travelers Property Casualty',
        generalLiabilityPolicyNumber: 'TRV-8849201',
        workersCompCarrier: 'Accident Fund',
        workersCompPolicyNumber: 'WC-9940122',
      },
      municipality: {
        authorityName: 'City of Royal Oak',
        agencyName: 'City of Royal Oak Building Inspection Division',
        address: '211 S Williams St',
        city: 'Royal Oak',
        state: 'MI',
        zip: '48067',
      },
      projectAddress: '1500 N Main St, Royal Oak, MI 48067',
    });

    expect(cert.certificateId).toMatch(/^COI-MI-\d+$/);
    expect(cert.insured.companyName).toBe('Apex Roofing & Solar LLC');
    expect(cert.certificateHolder.name).toBe('City of Royal Oak Building Inspection Division');
    expect(cert.certificateHolder.city).toBe('Royal Oak');
    expect(cert.certificateHolder.additionalInsuredNamed).toBe(true);

    // Coverage limits validation
    expect(cert.coverages.generalLiability.eachOccurrence).toBe(1000000);
    expect(cert.coverages.generalLiability.generalAggregate).toBe(2000000);
    expect(cert.coverages.generalLiability.additionalInsured).toBe(true);
    expect(cert.coverages.workersComp.statutoryLimits).toBe(true);
    expect(cert.descriptionOfOperations).toContain('1500 N Main St');
    expect(cert.descriptionOfOperations).toContain('Additional Insured');
    expect(cert.cancellationNoticeDays).toBe(30);
  });

  it('generates printable ACORD 25 Certificate HTML markup', () => {
    const cert = generateMunicipalCoi({
      contractor: {
        companyName: 'Metro Electric',
      },
      municipality: {
        authorityName: 'City of Los Angeles',
        city: 'Los Angeles',
        state: 'CA',
      },
    });

    const html = generateCoiHtml(cert);
    expect(html).toContain('ACORD 25 Certificate of Liability Insurance');
    expect(html).toContain('Metro Electric');
    expect(html).toContain('City of Los Angeles');
    expect(html).toContain('$1,000,000');
    expect(html).toContain('30 DAYS NOTICE');
  });
});
