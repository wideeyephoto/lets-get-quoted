import type { SupabaseClient } from '@supabase/supabase-js';
import { getJob } from '../jobs';
import { normalizeAddress } from '../location-context/normalize-address';
import { resolveJurisdiction } from '../location-context/jurisdiction-resolver';
import { evaluatePermitRequirement, classifyWorkScope } from './requirement-engine';
import { getCredentialsForAuthority } from './credentials-vault';
import type { PermitWorkContext, AttestedField, PermitReadiness } from './types';
import { safeSignaturePath } from '../signature';

export type { AttestedField, PermitReadiness };

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
    contactName: AttestedField<string>;
    licenseNumber: AttestedField<string>;
    licenseExpiration: AttestedField<string>;
    licenseType: AttestedField<string>;
    insuranceCarrier: AttestedField<string>;
    insurancePolicyNumber: AttestedField<string>;
    workersCompCarrier: AttestedField<string>;
    workersCompPolicy: AttestedField<string>;
    mescEmployerNumber: AttestedField<string>;
    fein: AttestedField<string>;
    phone: string;
    email: string;
    address: string;
  };
  property: {
    ownerName: AttestedField<string>;
    ownerPhone?: string;
    ownerEmail?: string;
    streetAddress: string;
    city: string;
    state: string;
    zip: string;
    parcelNumber: AttestedField<string>;
    occupancyType: string; // e.g. "One-Family Residential (R-3)"
    constructionType: string; // e.g. "Type V-B (Wood Frame)"
  };
  workScope: {
    trade: string;
    projectTitle: string;
    detailedDescription: string;
    estimatedCost?: number;
    roofSquares?: number;
    layersToTearOff?: number;
    newRoofCovering?: string;
    underlayment?: string;
    iceBarrierCompliance?: boolean;
    iceBarrierDescription?: string;
    dripEdgeCompliance?: boolean;
    atticVentilationType?: string;
    flashingDetails?: string;
    specRows?: Array<{ label: string; value: string }>;
  };
  certification: {
    applicantSignatureText: string;
    applicantSignaturePath?: string | null;
    signatureMethod?: 'drawn' | 'typed';
    signatureDate: string;
    section23aNotice: string;
    section23aNoticeTitle?: string;
  };
  readiness: PermitReadiness;
};

export function makeAttestedField<T = string>(
  value: T | null | undefined,
  sourceId: string | null | undefined,
  label: string,
  missingList?: string[],
): AttestedField<T> {
  if (value !== null && value !== undefined && String(value).trim().length > 0) {
    return { status: 'provided', value, sourceId: sourceId || 'provided' };
  }
  if (missingList) {
    missingList.push(label);
  }
  return { status: 'missing', label };
}

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

  // Fetch account, site branding, and contractor compliance profile
  const [accountRes, siteRes, complianceRes] = await Promise.all([
    supabase
      .from('accounts')
      .select('business_name, mailing_address, insurance_carrier, insurance_policy_number, insurance_coverage_amount, insurance_expires_on')
      .eq('id', accountId)
      .maybeSingle(),
    supabase
      .from('sites')
      .select('company_name, phone, license, service_area')
      .eq('account_id', accountId)
      .maybeSingle(),
    Promise.resolve().then(async () => {
      try {
        const query = supabase.from('contractor_compliance_profile');
        if (typeof query?.select === 'function') {
          return await query
            .select('fein, state_employer_number, license_type')
            .eq('account_id', accountId)
            .maybeSingle();
        }
      } catch {}
      return { data: null };
    }),
  ]);

  const account = accountRes.data;
  const site = siteRes.data;
  const compliance = complianceRes?.data;

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

  const missingFields: string[] = [];

  const companyName = site?.company_name || account?.business_name || 'Licensed Builder';
  const phone = site?.phone || '';
  const contractorAddress = account?.mailing_address || (parsedAddress.city ? `${parsedAddress.city}, ${parsedAddress.state || 'MI'}` : '');
  const email = (account as any)?.email || '';

  // Tier A: Attested Facts (Never defaulted)
  const licenseVal = vaultCreds.stateLicense?.licenseNumber || site?.license || null;
  const licenseSourceId = vaultCreds.stateLicense?.id || (site?.license ? 'sites.license' : null);
  const licenseNumber = makeAttestedField(
    licenseVal,
    licenseSourceId,
    'State Builder License #',
    missingFields,
  );

  const licenseExpiration = makeAttestedField(
    vaultCreds.stateLicense?.expiresAt,
    vaultCreds.stateLicense?.id,
    'License Expiration Date',
    missingFields,
  );

  const licenseTypeVal =
    compliance?.license_type ||
    (vaultCreds.stateLicense?.tradeDiscipline && vaultCreds.stateLicense.tradeDiscipline !== 'general'
      ? `${vaultCreds.stateLicense.issuingAuthority || 'State'} ${vaultCreds.stateLicense.tradeDiscipline} License`
      : vaultCreds.stateLicense?.issuingAuthority
        ? `${vaultCreds.stateLicense.issuingAuthority} License`
        : null);

  const licenseType = makeAttestedField(
    licenseTypeVal,
    compliance?.license_type ? 'contractor_compliance_profile' : vaultCreds.stateLicense?.id,
    'License Type',
    missingFields,
  );

  const contactName = makeAttestedField(
    vaultCreds.stateLicense?.holderName,
    vaultCreds.stateLicense?.id,
    'Qualifying Licensee / Contact Name',
    missingFields,
  );

  const liabilityCarrierVal = vaultCreds.liabilityInsurance?.insuranceCarrier || (account as any)?.insurance_carrier || null;
  const liabilityCarrierSourceId = vaultCreds.liabilityInsurance?.id || ((account as any)?.insurance_carrier ? 'accounts.insurance_carrier' : null);
  const insuranceCarrier = makeAttestedField(
    liabilityCarrierVal,
    liabilityCarrierSourceId,
    'General Liability Insurance Carrier',
    missingFields,
  );

  const liabilityPolicyVal = vaultCreds.liabilityInsurance?.policyNumber || (account as any)?.insurance_policy_number || null;
  const liabilityPolicySourceId = vaultCreds.liabilityInsurance?.id || ((account as any)?.insurance_policy_number ? 'accounts.insurance_policy_number' : null);
  const insurancePolicyNumber = makeAttestedField(
    liabilityPolicyVal,
    liabilityPolicySourceId,
    'General Liability Policy Number',
    missingFields,
  );

  const workersCompCarrier = makeAttestedField(
    vaultCreds.workersComp?.insuranceCarrier,
    vaultCreds.workersComp?.id,
    "Workers' Compensation Carrier",
    missingFields,
  );

  const workersCompPolicy = makeAttestedField(
    vaultCreds.workersComp?.policyNumber,
    vaultCreds.workersComp?.id,
    "Workers' Compensation Policy Number",
    missingFields,
  );

  const mescEmployerNumber = makeAttestedField(
    compliance?.state_employer_number,
    compliance?.state_employer_number ? 'contractor_compliance_profile' : null,
    'State Employer / MESC #',
    missingFields,
  );

  const fein = makeAttestedField(
    compliance?.fein,
    compliance?.fein ? 'contractor_compliance_profile' : null,
    'Federal Employer ID (FEIN)',
    missingFields,
  );

  const parcelNumber = makeAttestedField(
    (job as any).parcel_number,
    (job as any).parcel_number ? 'jobs.parcel_number' : null,
    'Permanent Parcel ID',
    missingFields,
  );

  const ownerName = makeAttestedField(
    job.client_name,
    job.client_name ? 'jobs.client_name' : null,
    'Property Owner Name',
    missingFields,
  );

  // Valuation calculation: coerce defensively, omit when unquoted
  const numericQuote = job.quoted_amount != null ? Number(job.quoted_amount) : NaN;
  const estimatedCost = !isNaN(numericQuote) && numericQuote > 0 ? numericQuote : undefined;

  const streetAddress =
    parsedAddress.streetNumber && parsedAddress.streetName
      ? `${parsedAddress.streetNumber} ${parsedAddress.streetName}${parsedAddress.unitOrApt ? ` ${parsedAddress.unitOrApt}` : ''}`
      : parsedAddress.formattedAddress || job.address || 'Property Address';

  const readiness: PermitReadiness = {
    complete: missingFields.length === 0,
    missing: missingFields,
  };

  return {
    authority: {
      id: jurisdiction.authorityId,
      name: jurisdiction.authorityName,
      agencyName: jurisdiction.agencyName,
      department: jurisdiction.agencyName || 'Building Inspection Division',
      contactPhone: undefined,
    },
    applicant: {
      type: 'contractor',
      companyName,
      contactName,
      licenseNumber,
      licenseExpiration,
      licenseType,
      insuranceCarrier,
      insurancePolicyNumber,
      workersCompCarrier,
      workersCompPolicy,
      mescEmployerNumber,
      fein,
      phone,
      email,
      address: contractorAddress,
    },
    property: {
      ownerName,
      ownerPhone: job.client_phone || undefined,
      ownerEmail: job.client_email || undefined,
      streetAddress,
      city: parsedAddress.city || '',
      state: parsedAddress.state || '',
      zip: parsedAddress.postalCode || '',
      parcelNumber,
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
      roofSquares: work.roofSquares,
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
    readiness,
  };
}

function renderAttestedValue(
  field: AttestedField<string>,
  missingLabel = 'Missing — complete in Credentials Vault',
  isStrong = false,
): string {
  if (field.status === 'provided') {
    return isStrong ? `<strong>${field.value}</strong>` : field.value;
  }
  return `<span class="blank-line"></span><span class="missing-chip">${missingLabel}</span>`;
}

function renderInsurance(
  carrier: AttestedField<string>,
  policy: AttestedField<string>,
): string {
  if (carrier.status === 'provided' && policy.status === 'provided') {
    return `${carrier.value} (${policy.value})`;
  }
  if (carrier.status === 'provided') {
    return `${carrier.value} (<span class="blank-line" style="min-width: 60px;"></span><span class="missing-chip">Policy missing</span>)`;
  }
  return `<span class="blank-line"></span><span class="missing-chip">Missing — complete in Credentials Vault</span>`;
}

/**
 * Generates clean, printable HTML for the Building Permit Application packet.
 */
export function generatePermitApplicationHtml(
  data: UniversalPermitApplicationData,
): string {
  const isDraft = !data.readiness?.complete;

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

    .blank-line {
      display: inline-block;
      min-width: 140px;
      border-bottom: 1px solid #000;
      height: 14px;
      vertical-align: bottom;
    }
    .missing-chip {
      display: inline-block;
      font-size: 7.5pt;
      color: #b91c1c;
      background: #fee2e2;
      border: 1px solid #fca5a5;
      border-radius: 3px;
      padding: 1px 5px;
      margin-left: 6px;
      text-transform: none;
      font-weight: normal;
      vertical-align: middle;
    }
    .draft-watermark {
      position: fixed;
      top: 40%;
      left: 5%;
      width: 90%;
      text-align: center;
      transform: rotate(-30deg);
      font-size: 44pt;
      font-weight: 900;
      color: rgba(220, 38, 38, 0.18);
      text-transform: uppercase;
      letter-spacing: 4px;
      pointer-events: none;
      z-index: 9999;
      user-select: none;
    }
    @media print {
      .missing-chip { display: none !important; }
      .draft-watermark {
        color: rgba(180, 0, 0, 0.22) !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }

    .specs-table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 9pt; }
    .specs-table td { padding: 3px 4px; border: 1px solid #cbd5e1; }
    .specs-table td.label { font-weight: bold; background: #f8fafc; width: 35%; }

    .notice { font-size: 7.5pt; color: #334155; line-height: 1.25; margin-top: 6px; text-align: justify; }
    .signature-row { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 16px; }
    .sig-box { width: 45%; text-align: center; font-size: 8.5pt; }
    .sig-mark-slot { height: 44px; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 2px; }
    .sig-mark-slot.date-slot { align-items: center; }
    .sig-line-label { border-top: 1px solid #000; padding-top: 4px; }
    .sig-svg { width: 160px; height: 42px; stroke: #0f172a; fill: none; stroke-width: 3.5; stroke-linecap: round; stroke-linejoin: round; }
  </style>
</head>
<body>
  ${isDraft ? '<div class="draft-watermark">DRAFT — NOT FOR SUBMISSION</div>' : ''}
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
          <div class="field-value">${data.property.city}${data.property.city && data.property.state ? ', ' : ''}${data.property.state} ${data.property.zip}</div>
        </div>
        <div class="field">
          <div class="field-label">Permanent Parcel ID</div>
          <div class="field-value">${renderAttestedValue(data.property.parcelNumber, 'Missing — enter Parcel ID')}</div>
        </div>
      </div>
      <div class="grid-3">
        <div class="field">
          <div class="field-label">Property Owner</div>
          <div class="field-value">${renderAttestedValue(data.property.ownerName, 'Missing — enter Owner Name')}</div>
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
          <div class="field-value">${renderAttestedValue(data.applicant.contactName)}</div>
        </div>
      </div>
      <div class="grid-3">
        <div class="field">
          <div class="field-label">State Builder License #</div>
          <div class="field-value">${renderAttestedValue(data.applicant.licenseNumber, 'Missing — complete in Credentials Vault', true)}</div>
        </div>
        <div class="field">
          <div class="field-label">License Type</div>
          <div class="field-value">${renderAttestedValue(data.applicant.licenseType)}</div>
        </div>
        <div class="field">
          <div class="field-label">Expiration Date</div>
          <div class="field-value">${renderAttestedValue(data.applicant.licenseExpiration)}</div>
        </div>
      </div>
      <div class="grid-3">
        <div class="field">
          <div class="field-label">General Liability Carrier &amp; Policy</div>
          <div class="field-value">${renderInsurance(data.applicant.insuranceCarrier, data.applicant.insurancePolicyNumber)}</div>
        </div>
        <div class="field">
          <div class="field-label">Workers' Comp Carrier &amp; Policy</div>
          <div class="field-value">${renderInsurance(data.applicant.workersCompCarrier, data.applicant.workersCompPolicy)}</div>
        </div>
        <div class="field">
          <div class="field-label">Contractor Phone / Email</div>
          <div class="field-value">${data.applicant.phone ? `${data.applicant.phone}${data.applicant.email ? ` · ${data.applicant.email}` : ''}` : (data.applicant.email || 'On file')}</div>
        </div>
      </div>
      <div class="grid-2">
        <div class="field">
          <div class="field-label">Federal Employer ID (FEIN)</div>
          <div class="field-value">${renderAttestedValue(data.applicant.fein)}</div>
        </div>
        <div class="field">
          <div class="field-label">State Employer # / MESC</div>
          <div class="field-value">${renderAttestedValue(data.applicant.mescEmployerNumber)}</div>
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
          <td>${data.workScope.trade}${data.workScope.roofSquares ? ` (${data.workScope.roofSquares} Squares)` : ''}</td>
          <td class="label">Estimated Project Value:</td>
          <td><strong>${data.workScope.estimatedCost != null ? `$${data.workScope.estimatedCost.toLocaleString()}` : '<span class="blank-line" style="min-width: 80px;"></span>'}</strong></td>
        </tr>
        <tr>
          <td class="label">Tear-Off / Deck Condition:</td>
          <td>Tear off ${data.workScope.layersToTearOff || 1} layer down to approved wood deck</td>
          <td class="label">New Covering Material:</td>
          <td>${data.workScope.newRoofCovering || ''}</td>
        </tr>
        <tr>
          <td class="label">Underlayment:</td>
          <td>${data.workScope.underlayment || ''}</td>
          <td class="label">Ice Barrier Protection:</td>
          <td>${data.workScope.iceBarrierDescription || ''}</td>
        </tr>
        <tr>
          <td class="label">Drip Edge &amp; Flashing:</td>
          <td>Corrosion-resistant drip edge on eaves/rakes; step/counter flashing (2015 MRC § R905.2.8.5)</td>
          <td class="label">Attic Ventilation:</td>
          <td>${data.workScope.atticVentilationType || ''}</td>
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
          <div class="sig-mark-slot">
            ${
              safeSignaturePath(data.certification.applicantSignaturePath)
                ? `<svg viewBox="0 0 600 200" class="sig-svg" role="img" aria-label="Contractor Signature"><path d="${safeSignaturePath(data.certification.applicantSignaturePath)}" /></svg>`
                : `<strong>${data.applicant.companyName}</strong>`
            }
          </div>
          <div class="sig-line-label">Signature of Contractor / Authorized Agent</div>
        </div>
        <div class="sig-box">
          <div class="sig-mark-slot date-slot">
            <strong>Date: ${data.certification.signatureDate}</strong>
          </div>
          <div class="sig-line-label">Application Date</div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}
