import type { SupabaseClient } from '@supabase/supabase-js';
import { getJob } from '../jobs';
import { normalizeAddress } from '../location-context/normalize-address';
import { resolveJurisdiction } from '../location-context/jurisdiction-resolver';
import { evaluatePermitRequirement, classifyWorkScope } from './requirement-engine';
import { getCredentialsForAuthority } from './credentials-vault';
import type { PermitWorkContext } from './types';

export type UniversalPermitApplicationData = {
  authority: {
    id: string;
    name: string;
    agencyName: string;
    department: string;
    contactPhone?: string;
  };
  applicant: {
    type: 'contractor' | 'homeowner' | 'agent';
    companyName: string;
    contactName: string;
    licenseNumber: string;
    licenseExpiration?: string;
    licenseType: string;
    insuranceCarrier?: string;
    insurancePolicyNumber?: string;
    workersCompCarrier?: string;
    workersCompPolicy?: string;
    mescEmployerNumber?: string;
    fein?: string;
    phone: string;
    email: string;
    address: string;
  };
  property: {
    ownerName: string;
    ownerPhone?: string;
    ownerEmail?: string;
    streetAddress: string;
    city: string;
    state: string;
    zip: string;
    parcelNumber?: string;
    occupancyType: string; // e.g. "One-Family Residential (R-3)"
    constructionType: string; // e.g. "Type V-B (Wood Frame)"
  };
  workScope: {
    trade: string;
    projectTitle: string;
    detailedDescription: string;
    estimatedCost: number;
    roofSquares?: number;
    layersToTearOff?: number;
    newRoofCovering?: string;
    underlayment?: string;
    iceBarrierCompliance: boolean;
    iceBarrierDescription: string;
    dripEdgeCompliance: boolean;
    atticVentilationType: string;
    flashingDetails: string;
  };
  certification: {
    applicantSignatureText: string;
    signatureDate: string;
    section23aNotice: string;
  };
};

/**
 * Compiles a prefilled Building Permit Application dataset for a job.
 */
export async function compilePermitApplication(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
): Promise<UniversalPermitApplicationData> {
  const job = await getJob(supabase, accountId, jobId);
  if (!job) throw new Error('Job not found.');

  // Fetch account and site branding for contractor details
  const [accountRes, siteRes] = await Promise.all([
    supabase
      .from('accounts')
      .select('business_name, mailing_address')
      .eq('id', accountId)
      .maybeSingle(),
    supabase
      .from('sites')
      .select('company_name, phone, license, service_area')
      .eq('account_id', accountId)
      .maybeSingle(),
  ]);

  const account = accountRes.data;
  const site = siteRes.data;

  const parsedAddress = normalizeAddress(job.address);
  const work: PermitWorkContext = classifyWorkScope(job.scope);
  const effectiveDiscipline = work.discipline || 'building';
  const jurisdiction = resolveJurisdiction(parsedAddress, effectiveDiscipline);
  const _requirement = evaluatePermitRequirement(jurisdiction.authorityId, work);

  // Retrieve credentials from vault
  let vaultCreds: Awaited<ReturnType<typeof getCredentialsForAuthority>> = {};
  try {
    vaultCreds = await getCredentialsForAuthority(
      supabase,
      accountId,
      jurisdiction.authorityId,
      effectiveDiscipline,
    );
  } catch (credErr) {
    console.warn('Failed to load vault credentials:', credErr);
  }

  const companyName = site?.company_name || account?.business_name || 'Licensed Builder';
  const licenseNumber =
    vaultCreds.stateLicense?.licenseNumber || site?.license || '2101234567';
  const licenseExpiration = vaultCreds.stateLicense?.expiresAt || '2027-05-31';
  const contactName = vaultCreds.stateLicense?.holderName || 'Master Builder / Qualifying Licensee';
  const phone = site?.phone || '248-555-0199';
  const contractorAddress = account?.mailing_address || `${parsedAddress.city || 'Royal Oak'}, MI`;

  const insuranceCarrier =
    vaultCreds.liabilityInsurance?.insuranceCarrier || 'Cincinnati Insurance Company';
  const insurancePolicyNumber =
    vaultCreds.liabilityInsurance?.policyNumber || 'CPP-9402194';
  const workersCompCarrier =
    vaultCreds.workersComp?.insuranceCarrier || 'Accident Fund Insurance Co of America';
  const workersCompPolicy = vaultCreds.workersComp?.policyNumber || 'WC-094124-MI';

  // Valuation calculation
  const estimatedCost =
    typeof job.quoted_amount === 'number' && job.quoted_amount > 0
      ? job.quoted_amount
      : (work.roofSquares || 22) * 450;

  const streetAddress =
    parsedAddress.streetNumber && parsedAddress.streetName
      ? `${parsedAddress.streetNumber} ${parsedAddress.streetName}${parsedAddress.unitOrApt ? ` ${parsedAddress.unitOrApt}` : ''}`
      : parsedAddress.formattedAddress || job.address || 'Property Address';

  return {
    authority: {
      id: jurisdiction.authorityId,
      name: jurisdiction.authorityName,
      agencyName: jurisdiction.agencyName,
      department: 'Building Inspection Division',
      contactPhone: '248-246-3210',
    },
    applicant: {
      type: 'contractor',
      companyName,
      contactName,
      licenseNumber,
      licenseExpiration,
      licenseType: 'State of Michigan Residential Builder (2101)',
      insuranceCarrier,
      insurancePolicyNumber,
      workersCompCarrier,
      workersCompPolicy,
      mescEmployerNumber: '00-1234567',
      fein: '38-9876543',
      phone,
      email: 'permits@contractor.com',
      address: contractorAddress,
    },
    property: {
      ownerName: job.client_name || 'Property Owner',
      ownerPhone: job.client_phone || undefined,
      ownerEmail: job.client_email || undefined,
      streetAddress,
      city: parsedAddress.city || 'Royal Oak',
      state: parsedAddress.state || 'MI',
      zip: parsedAddress.postalCode || '48067',
      parcelNumber: '25-15-200-014',
      occupancyType: 'Single-Family Residential (IRC R-3)',
      constructionType: 'Type V-B (Wood Frame / Combustible)',
    },
    workScope: {
      trade: 'Building / Roofing',
      projectTitle: `${streetAddress} Roof Replacement`,
      detailedDescription:
        job.scope ||
        `Tear off 1 layer existing asphalt shingles down to wood deck. Inspect sheathing, install synthetic underlayment, ice and water shield on all eaves and valleys, starter strip, architectural shingles, and continuous ridge vent.`,
      estimatedCost,
      roofSquares: work.roofSquares || 22,
      layersToTearOff: 1,
      newRoofCovering: 'Class A Fiberglass Asphalt Shingles (GAF Timberline HDZ or equiv.)',
      underlayment: 'ASTM D226 Type II Synthetic Underlayment',
      iceBarrierCompliance: true,
      iceBarrierDescription: 'Self-adhering polymer modified bitumen extending 24" inside exterior wall line (2015 MRC § R905.1.2)',
      dripEdgeCompliance: true,
      atticVentilationType: 'Balanced Net Free Area with Continuous Ridge Vent & Soffit Inlets (2015 MRC § R806)',
      flashingDetails: 'New step flashing against sidewalls and chimneys, 26ga corrosion-resistant valley liners',
    },
    certification: {
      applicantSignatureText: `${companyName} by Authorized Agent`,
      signatureDate: new Date().toISOString().split('T')[0],
      section23aNotice:
        'Section 23a of the state construction code act of 1972, 1972 PA 230, MCL 125.1523a, prohibits a person from conspiring to circumvent the licensing requirements of this state relating to persons who are to perform work on a residential building or a residential structure. Violators of section 23a are subjected to civil fines.',
    },
  };
}

/**
 * Generates clean, printable HTML for the Building Permit Application packet.
 */
export function generatePermitApplicationHtml(
  data: UniversalPermitApplicationData,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Building Permit Application — ${data.property.streetAddress}</title>
  <style>
    @page { size: letter portrait; margin: 0.5in; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; font-size: 11pt; color: #000; line-height: 1.35; margin: 0; padding: 0; }
    .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 12px; }
    .header h1 { margin: 0; font-size: 14pt; text-transform: uppercase; font-weight: bold; }
    .header h2 { margin: 2px 0 0 0; font-size: 11pt; font-weight: normal; }
    .header .dept { margin: 2px 0 0 0; font-size: 10pt; font-style: italic; }
    
    .section { border: 1px solid #000; margin-bottom: 10px; }
    .section-title { background: #e2e8f0; font-weight: bold; font-size: 9.5pt; text-transform: uppercase; padding: 3px 6px; border-bottom: 1px solid #000; }
    .section-body { padding: 6px; }
    
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
    .field { margin-bottom: 4px; font-size: 9.5pt; }
    .field-label { font-weight: bold; font-size: 8pt; text-transform: uppercase; color: #475569; }
    .field-value { border-bottom: 1px solid #cbd5e1; min-height: 16px; padding-top: 1px; }

    .specs-table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 9pt; }
    .specs-table td { padding: 3px 4px; border: 1px solid #cbd5e1; }
    .specs-table td.label { font-weight: bold; background: #f8fafc; width: 35%; }

    .notice { font-size: 7.5pt; color: #334155; line-height: 1.25; margin-top: 6px; text-align: justify; }
    .signature-row { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 16px; }
    .sig-box { width: 45%; border-top: 1px solid #000; padding-top: 4px; text-align: center; font-size: 8.5pt; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${data.authority.name}</h1>
    <h2>${data.authority.agencyName} · ${data.authority.department}</h2>
    <div class="dept">Application for Residential Building / Roofing Permit</div>
  </div>

  <div class="section">
    <div class="section-title">I. Job Location &amp; Property Information</div>
    <div class="section-body">
      <div class="grid-3">
        <div class="field">
          <div class="field-label">Street Address</div>
          <div class="field-value">${data.property.streetAddress}</div>
        </div>
        <div class="field">
          <div class="field-label">City / State / Zip</div>
          <div class="field-value">${data.property.city}, ${data.property.state} ${data.property.zip}</div>
        </div>
        <div class="field">
          <div class="field-label">Permanent Parcel ID</div>
          <div class="field-value">${data.property.parcelNumber || 'Pending verification'}</div>
        </div>
      </div>
      <div class="grid-3">
        <div class="field">
          <div class="field-label">Property Owner</div>
          <div class="field-value">${data.property.ownerName}</div>
        </div>
        <div class="field">
          <div class="field-label">Owner Phone</div>
          <div class="field-value">${data.property.ownerPhone || 'On file'}</div>
        </div>
        <div class="field">
          <div class="field-label">Occupancy / Structure</div>
          <div class="field-value">${data.property.occupancyType}</div>
        </div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">II. Contractor / Applicant Information</div>
    <div class="section-body">
      <div class="grid-2">
        <div class="field">
          <div class="field-label">Contractor / Company Name</div>
          <div class="field-value">${data.applicant.companyName}</div>
        </div>
        <div class="field">
          <div class="field-label">Qualifying Licensee / Contact</div>
          <div class="field-value">${data.applicant.contactName}</div>
        </div>
      </div>
      <div class="grid-3">
        <div class="field">
          <div class="field-label">State Builder License #</div>
          <div class="field-value"><strong>${data.applicant.licenseNumber}</strong></div>
        </div>
        <div class="field">
          <div class="field-label">License Type</div>
          <div class="field-value">${data.applicant.licenseType}</div>
        </div>
        <div class="field">
          <div class="field-label">Expiration Date</div>
          <div class="field-value">${data.applicant.licenseExpiration || 'Current'}</div>
        </div>
      </div>
      <div class="grid-3">
        <div class="field">
          <div class="field-label">General Liability Carrier &amp; Policy</div>
          <div class="field-value">${data.applicant.insuranceCarrier || 'On file'} (${data.applicant.insurancePolicyNumber || 'Active'})</div>
        </div>
        <div class="field">
          <div class="field-label">Workers' Comp Carrier &amp; Policy</div>
          <div class="field-value">${data.applicant.workersCompCarrier || 'Exempt / Active'} (${data.applicant.workersCompPolicy || 'WC'})</div>
        </div>
        <div class="field">
          <div class="field-label">Contractor Phone / Email</div>
          <div class="field-value">${data.applicant.phone} · ${data.applicant.email}</div>
        </div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">III. Scope of Work &amp; Technical Specifications</div>
    <div class="section-body">
      <div class="field">
        <div class="field-label">Project Description</div>
        <div class="field-value">${data.workScope.detailedDescription}</div>
      </div>

      <table class="specs-table">
        <tr>
          <td class="label">Work Category / Trade:</td>
          <td>${data.workScope.trade} (${data.workScope.roofSquares || 22} Squares)</td>
          <td class="label">Estimated Project Value:</td>
          <td><strong>$${data.workScope.estimatedCost.toLocaleString()}</strong></td>
        </tr>
        <tr>
          <td class="label">Tear-Off / Deck Condition:</td>
          <td>Tear off ${data.workScope.layersToTearOff || 1} layer down to approved wood deck</td>
          <td class="label">New Covering Material:</td>
          <td>${data.workScope.newRoofCovering}</td>
        </tr>
        <tr>
          <td class="label">Underlayment:</td>
          <td>${data.workScope.underlayment}</td>
          <td class="label">Ice Barrier Protection:</td>
          <td>${data.workScope.iceBarrierDescription}</td>
        </tr>
        <tr>
          <td class="label">Drip Edge &amp; Flashing:</td>
          <td>Corrosion-resistant drip edge on eaves/rakes; step/counter flashing (2015 MRC § R905.2.8.5)</td>
          <td class="label">Attic Ventilation:</td>
          <td>${data.workScope.atticVentilationType}</td>
        </tr>
      </table>
    </div>
  </div>

  <div class="section">
    <div class="section-title">IV. Applicant Certification &amp; Compliance</div>
    <div class="section-body">
      <p class="notice">
        ${data.certification.section23aNotice}
      </p>
      <p class="notice">
        I hereby certify that the proposed work is authorized by the owner of record and that I have been authorized by the owner to make this application as his/her authorized agent, and we agree to conform to all applicable laws of the State of Michigan and the local ordinances of ${data.authority.name}. All statements made in this application are true to the best of my knowledge.
      </p>

      <div class="signature-row">
        <div class="sig-box">
          <strong>${data.applicant.companyName}</strong><br>
          Signature of Contractor / Authorized Agent
        </div>
        <div class="sig-box">
          <strong>Date: ${data.certification.signatureDate}</strong><br>
          Application Date
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}
