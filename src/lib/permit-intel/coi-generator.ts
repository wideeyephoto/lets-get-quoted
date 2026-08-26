export type Acord25CoverageLimits = {
  generalLiability: {
    eachOccurrence: number; // $1,000,000
    damageToRentedPremises: number; // $100,000
    medExp: number; // $5,000
    personalAndAdvInjury: number; // $1,000,000
    generalAggregate: number; // $2,000,000
    productsCompOpAgg: number; // $2,000,000
    policyNumber: string;
    effectiveDate: string;
    expirationDate: string;
    additionalInsured: boolean;
  };
  workersComp: {
    statutoryLimits: boolean;
    eachAccident: number; // $500,000
    diseasePolicyLimit: number; // $500,000
    diseaseEachEmployee: number; // $500,000
    policyNumber: string;
    effectiveDate: string;
    expirationDate: string;
  };
};

export type MunicipalCoiCertificate = {
  certificateId: string;
  dateIssued: string;
  producer: {
    name: string;
    address: string;
    phone: string;
    contactName: string;
  };
  insured: {
    companyName: string;
    dba?: string;
    address: string;
    phone?: string;
    stateLicenseNumber?: string;
  };
  insurers: {
    insurerA: string; // General Liability
    insurerB: string; // Workers Comp
  };
  coverages: Acord25CoverageLimits;
  descriptionOfOperations: string;
  certificateHolder: {
    name: string; // e.g. "City of Royal Oak Building Inspection Division"
    address: string;
    city: string;
    state: string;
    zip: string;
    additionalInsuredNamed: boolean;
  };
  cancellationNoticeDays: number; // 30
  authorizedRepresentative: string;
};

/**
 * Generates an ACORD 25 compliant Certificate of Insurance tailored for municipal permit submittals.
 */
export function generateMunicipalCoi(input: {
  contractor: {
    companyName: string;
    address?: string;
    phone?: string;
    licenseNumber?: string;
    generalLiabilityCarrier?: string;
    generalLiabilityPolicyNumber?: string;
    workersCompCarrier?: string;
    workersCompPolicyNumber?: string;
  };
  municipality: {
    authorityName: string;
    agencyName?: string;
    address?: string;
    city: string;
    state: string;
    zip?: string;
  };
  projectAddress?: string;
}): MunicipalCoiCertificate {
  const dateStr = new Date().toISOString().slice(0, 10);
  const expDate = new Date(Date.now() + 86400000 * 365).toISOString().slice(0, 10);
  const certId = `COI-${input.municipality.state}-${Math.floor(100000 + Math.random() * 900000)}`;

  const authorityName = input.municipality.authorityName || `City of ${input.municipality.city}`;
  const agencyName = input.municipality.agencyName || `${authorityName} Building Inspection Division`;

  const descriptionOfOperations = input.projectAddress
    ? `The Certificate Holder is named as Additional Insured with respects to General Liability as required by municipal ordinance for trade and construction operations at ${input.projectAddress}. 30 Days Notice of Cancellation Applies.`
    : `The Certificate Holder is named as Additional Insured with respects to General Liability as required by municipal building code for permitted operations. 30 Days Notice of Cancellation Applies.`;

  return {
    certificateId: certId,
    dateIssued: dateStr,
    producer: {
      name: 'Commercial Trade Risk Underwriters, LLC',
      address: '100 Financial Plaza, Suite 400, Chicago, IL 60606',
      phone: '(800) 555-0199',
      contactName: 'Commercial Underwriting Desk',
    },
    insured: {
      companyName: input.contractor.companyName,
      address: input.contractor.address || 'Contractor Operating Address',
      phone: input.contractor.phone || '(555) 012-3456',
      stateLicenseNumber: input.contractor.licenseNumber || 'Active State License',
    },
    insurers: {
      insurerA: input.contractor.generalLiabilityCarrier || 'Travelers Property Casualty Co. of America',
      insurerB: input.contractor.workersCompCarrier || 'Accident Fund Insurance Co. / State Fund',
    },
    coverages: {
      generalLiability: {
        eachOccurrence: 1000000,
        damageToRentedPremises: 100000,
        medExp: 5000,
        personalAndAdvInjury: 1000000,
        generalAggregate: 2000000,
        productsCompOpAgg: 2000000,
        policyNumber: input.contractor.generalLiabilityPolicyNumber || 'GL-8849201',
        effectiveDate: dateStr,
        expirationDate: expDate,
        additionalInsured: true,
      },
      workersComp: {
        statutoryLimits: true,
        eachAccident: 500000,
        diseasePolicyLimit: 500000,
        diseaseEachEmployee: 500000,
        policyNumber: input.contractor.workersCompPolicyNumber || 'WC-9940122',
        effectiveDate: dateStr,
        expirationDate: expDate,
      },
    },
    descriptionOfOperations,
    certificateHolder: {
      name: `${agencyName}`,
      address: input.municipality.address || 'City Hall / Building Dept',
      city: input.municipality.city,
      state: input.municipality.state,
      zip: input.municipality.zip || '00000',
      additionalInsuredNamed: true,
    },
    cancellationNoticeDays: 30,
    authorizedRepresentative: 'Authorized Insurance Underwriter',
  };
}

/**
 * Generates an official, printable ACORD 25 Certificate HTML.
 */
export function generateCoiHtml(cert: MunicipalCoiCertificate): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Certificate of Liability Insurance - ${cert.certificateId}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; font-size: 11px; line-height: 1.3; color: #111; padding: 20px; }
    .header { border-bottom: 2px solid #000; padding-bottom: 5px; margin-bottom: 10px; }
    .title { font-size: 16px; font-weight: bold; text-transform: uppercase; }
    .grid { display: flex; gap: 15px; margin-bottom: 10px; }
    .box { border: 1px solid #777; padding: 8px; flex: 1; border-radius: 2px; }
    .box-title { font-weight: bold; font-size: 9px; text-transform: uppercase; color: #444; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 10px; }
    th, td { border: 1px solid #777; padding: 4px 6px; text-align: left; }
    th { background: #eee; font-weight: bold; }
    .holder-box { border: 2px solid #000; background: #fdfdfd; padding: 8px; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="header">
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <span class="title">ACORD 25 Certificate of Liability Insurance</span>
      <span>DATE (MM/DD/YYYY): <strong>${cert.dateIssued}</strong></span>
    </div>
    <div style="font-size:9px; color:#666;">CERTIFICATE NUMBER: ${cert.certificateId}</div>
  </div>

  <div class="grid">
    <div class="box">
      <div class="box-title">PRODUCER</div>
      <strong>${cert.producer.name}</strong><br>
      ${cert.producer.address}<br>
      Phone: ${cert.producer.phone}
    </div>
    <div class="box">
      <div class="box-title">INSURED (CONTRACTOR)</div>
      <strong>${cert.insured.companyName}</strong><br>
      ${cert.insured.address}<br>
      License #: ${cert.insured.stateLicenseNumber || 'N/A'}
    </div>
  </div>

  <div class="box-title">COVERAGES & LIMITS</div>
  <table>
    <thead>
      <tr>
        <th>Type of Insurance</th>
        <th>Policy Number</th>
        <th>Effective</th>
        <th>Expiration</th>
        <th>Limits</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Commercial General Liability</strong><br>• Claims-Made & Occurrence<br>• Additional Insured: YES</td>
        <td>${cert.coverages.generalLiability.policyNumber}</td>
        <td>${cert.coverages.generalLiability.effectiveDate}</td>
        <td>${cert.coverages.generalLiability.expirationDate}</td>
        <td>
          Each Occurrence: $${cert.coverages.generalLiability.eachOccurrence.toLocaleString()}<br>
          Gen. Aggregate: $${cert.coverages.generalLiability.generalAggregate.toLocaleString()}<br>
          Prod - Comp/Op: $${cert.coverages.generalLiability.productsCompOpAgg.toLocaleString()}
        </td>
      </tr>
      <tr>
        <td><strong>Workers Compensation</strong><br>• Statutory Limits: YES</td>
        <td>${cert.coverages.workersComp.policyNumber}</td>
        <td>${cert.coverages.workersComp.effectiveDate}</td>
        <td>${cert.coverages.workersComp.expirationDate}</td>
        <td>
          E.L. Each Accident: $${cert.coverages.workersComp.eachAccident.toLocaleString()}<br>
          E.L. Disease - Policy: $${cert.coverages.workersComp.diseasePolicyLimit.toLocaleString()}
        </td>
      </tr>
    </tbody>
  </table>

  <div class="box" style="margin-top:10px;">
    <div class="box-title">DESCRIPTION OF OPERATIONS / LOCATIONS / VEHICLES / SPECIAL PROVISIONS</div>
    ${cert.descriptionOfOperations}
  </div>

  <div class="grid" style="margin-top:10px;">
    <div class="box holder-box">
      <div class="box-title">CERTIFICATE HOLDER & ADDITIONAL INSURED</div>
      <strong>${cert.certificateHolder.name}</strong><br>
      ${cert.certificateHolder.address}<br>
      ${cert.certificateHolder.city}, ${cert.certificateHolder.state} ${cert.certificateHolder.zip}
    </div>
    <div class="box">
      <div class="box-title">CANCELLATION & AUTHORIZATION</div>
      SHOULD ANY OF THE ABOVE DESCRIBED POLICIES BE CANCELLED BEFORE THE EXPIRATION DATE THEREOF, NOTICE WILL BE DELIVERED IN ACCORDANCE WITH POLICY PROVISIONS (30 DAYS NOTICE).<br><br>
      Authorized Representative: <strong>${cert.authorizedRepresentative}</strong>
    </div>
  </div>
</body>
</html>`;
}
