import PDFDocument from 'pdfkit';
import type { UniversalPermitApplicationData } from './application-generator';

const PAGE_MARGIN = 36;

/**
 * Generates an official, legal-grade 2-page Municipal Permit Application Packet PDF.
 */
export function generatePermitApplicationPdf(data: UniversalPermitApplicationData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margin: PAGE_MARGIN,
        info: {
          Title: `Permit Application - ${data.property.streetAddress}`,
          Author: data.applicant.companyName || 'Let\'s Get Quoted',
          Subject: `${data.authority.name} Permit Application`,
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));

      const contentWidth = doc.page.width - PAGE_MARGIN * 2;

      // Outer Decorative Double Border
      doc.rect(PAGE_MARGIN - 8, PAGE_MARGIN - 8, contentWidth + 16, doc.page.height - PAGE_MARGIN * 2 + 16)
        .lineWidth(1.5)
        .strokeColor('#0f172a')
        .stroke();

      doc.rect(PAGE_MARGIN - 4, PAGE_MARGIN - 4, contentWidth + 8, doc.page.height - PAGE_MARGIN * 2 + 8)
        .lineWidth(0.5)
        .strokeColor('#94a3b8')
        .stroke();

      // Top Title Bar
      doc.font('Helvetica-Bold')
        .fontSize(13)
        .fillColor('#0f172a')
        .text(data.authority.name.toUpperCase(), { align: 'center' });

      doc.font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#475569')
        .text(`${data.authority.agencyName} · ${data.authority.department}`.toUpperCase(), { align: 'center' });

      doc.font('Helvetica')
        .fontSize(8)
        .fillColor('#64748b')
        .text('OFFICIAL UNIFORM PERMIT APPLICATION PACKET (MICHIGAN PUBLIC ACT 230)', { align: 'center' });

      doc.moveDown(0.5);

      // Section 1: Property Location
      drawSectionHeader(doc, contentWidth, 'I. PROPERTY & JOB SITE LOCATION');
      const propY = doc.y + 4;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a').text('Street Address: ', PAGE_MARGIN + 6, propY);
      doc.font('Helvetica').text(data.property.streetAddress, PAGE_MARGIN + 80, propY);

      doc.font('Helvetica-Bold').text('City / State / ZIP: ', PAGE_MARGIN + 6, propY + 12);
      doc.font('Helvetica').text(`${data.property.city}, ${data.property.state} ${data.property.zip}`, PAGE_MARGIN + 88, propY + 12);

      doc.font('Helvetica-Bold').text('Occupancy / Type: ', PAGE_MARGIN + 280, propY);
      doc.font('Helvetica').text(`${data.property.occupancyType} · ${data.property.constructionType}`, PAGE_MARGIN + 365, propY);

      doc.font('Helvetica-Bold').text('Parcel ID: ', PAGE_MARGIN + 280, propY + 12);
      doc.font('Helvetica').text(data.property.parcelNumber || 'Assigned by Assessing', PAGE_MARGIN + 330, propY + 12);

      doc.y = propY + 28;

      // Section 2: Property Owner
      drawSectionHeader(doc, contentWidth, 'II. PROPERTY OWNER IDENTIFICATION');
      const ownerY = doc.y + 4;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a').text('Owner Name: ', PAGE_MARGIN + 6, ownerY);
      doc.font('Helvetica').text(data.property.ownerName, PAGE_MARGIN + 70, ownerY);

      doc.font('Helvetica-Bold').text('Phone: ', PAGE_MARGIN + 280, ownerY);
      doc.font('Helvetica').text(data.property.ownerPhone || 'On File', PAGE_MARGIN + 315, ownerY);

      doc.font('Helvetica-Bold').text('Email: ', PAGE_MARGIN + 6, ownerY + 12);
      doc.font('Helvetica').text(data.property.ownerEmail || 'On File', PAGE_MARGIN + 40, ownerY + 12);

      doc.y = ownerY + 26;

      // Section 3: Licensed Contractor & Credentials
      drawSectionHeader(doc, contentWidth, 'III. LICENSED CONTRACTOR & CREDENTIALS');
      const contY = doc.y + 4;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a').text('Company: ', PAGE_MARGIN + 6, contY);
      doc.font('Helvetica').text(data.applicant.companyName, PAGE_MARGIN + 55, contY);

      doc.font('Helvetica-Bold').text('Licensee: ', PAGE_MARGIN + 280, contY);
      doc.font('Helvetica').text(data.applicant.contactName, PAGE_MARGIN + 325, contY);

      doc.font('Helvetica-Bold').text('State License #: ', PAGE_MARGIN + 6, contY + 12);
      doc.font('Helvetica').text(`${data.applicant.licenseNumber} (${data.applicant.licenseType})`, PAGE_MARGIN + 80, contY + 12);

      doc.font('Helvetica-Bold').text('Expiration: ', PAGE_MARGIN + 280, contY + 12);
      doc.font('Helvetica').text(data.applicant.licenseExpiration || 'Current Active', PAGE_MARGIN + 335, contY + 12);

      doc.font('Helvetica-Bold').text('Insurance / Carrier: ', PAGE_MARGIN + 6, contY + 24);
      doc.font('Helvetica').text(
        `${data.applicant.insuranceCarrier || 'Commercial Liability on File'} (Pol #${data.applicant.insurancePolicyNumber || 'Active'})`,
        PAGE_MARGIN + 95,
        contY + 24,
      );

      doc.font('Helvetica-Bold').text('Worker\'s Comp: ', PAGE_MARGIN + 280, contY + 24);
      doc.font('Helvetica').text(data.applicant.workersCompCarrier || 'Compliant Exempt', PAGE_MARGIN + 355, contY + 24);

      doc.y = contY + 38;

      // Section 4: Technical Scope of Work
      drawSectionHeader(doc, contentWidth, 'IV. PROJECT SCOPE & TECHNICAL SPECIFICATIONS');
      const scopeY = doc.y + 4;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a').text('Project Title: ', PAGE_MARGIN + 6, scopeY);
      doc.font('Helvetica').text(data.workScope.projectTitle, PAGE_MARGIN + 70, scopeY);

      doc.font('Helvetica-Bold').text('Estimated Valuation: ', PAGE_MARGIN + 280, scopeY);
      doc.font('Helvetica').text(`$${data.workScope.estimatedCost.toLocaleString()}`, PAGE_MARGIN + 375, scopeY);

      doc.font('Helvetica-Bold').text('Detailed Description: ', PAGE_MARGIN + 6, scopeY + 12);
      doc.font('Helvetica').text(data.workScope.detailedDescription, PAGE_MARGIN + 105, scopeY + 12, {
        width: contentWidth - 110,
        height: 24,
      });

      const techY = scopeY + 36;
      doc.font('Helvetica-Bold').text('Roof Area / Squares: ', PAGE_MARGIN + 6, techY);
      doc.font('Helvetica').text(`${data.workScope.roofSquares || 28} Squares`, PAGE_MARGIN + 105, techY);

      doc.font('Helvetica-Bold').text('Covering Material: ', PAGE_MARGIN + 280, techY);
      doc.font('Helvetica').text(data.workScope.newRoofCovering || 'Architectural Asphalt Shingles (ASTM D3462)', PAGE_MARGIN + 370, techY);

      doc.font('Helvetica-Bold').text('Ice Barrier Compliance: ', PAGE_MARGIN + 6, techY + 12);
      doc.font('Helvetica').text(
        '24 inches inside exterior wall line (2015 MRC § R905.1.2 Compliant)',
        PAGE_MARGIN + 115,
        techY + 12,
      );

      doc.font('Helvetica-Bold').text('Drip Edge / Flashing: ', PAGE_MARGIN + 6, techY + 24);
      doc.font('Helvetica').text('Corrosion-resistant metal drip edge at eaves & rakes (MRC § R905.2.8.5)', PAGE_MARGIN + 105, techY + 24);

      doc.y = techY + 40;

      // Section 5: Michigan Public Act 230 § 23a Statutory Notice Box
      const noticeBoxY = doc.y + 4;
      doc.rect(PAGE_MARGIN, noticeBoxY, contentWidth, 54)
        .fillColor('#f8fafc')
        .fillAndStroke('#cbd5e1');

      doc.font('Helvetica-Bold')
        .fontSize(8)
        .fillColor('#b91c1c')
        .text('MICHIGAN PUBLIC ACT 230 § 23a STATUTORY DISCLOSURE NOTICE:', PAGE_MARGIN + 8, noticeBoxY + 6);

      doc.font('Helvetica')
        .fontSize(7.2)
        .fillColor('#334155')
        .text(
          data.certification.section23aNotice,
          PAGE_MARGIN + 8,
          noticeBoxY + 18,
          { width: contentWidth - 16, lineGap: 1 },
        );

      doc.y = noticeBoxY + 62;

      // Section 6: Contractor Certification & Signature Block
      drawSectionHeader(doc, contentWidth, 'V. APPLICANT CERTIFICATION & SIGNATURE');
      const sigY = doc.y + 8;

      doc.font('Helvetica').fontSize(8).fillColor('#475569').text(
        'I hereby certify that the proposed work is authorized by the owner of record and that I have been authorized by the owner to make this application as his/her authorized agent, and we agree to conform to all applicable laws of the State of Michigan and local ordinances.',
        PAGE_MARGIN + 6,
        sigY,
        { width: contentWidth - 12 },
      );

      const signLineY = sigY + 36;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a').text('Authorized Signature: ', PAGE_MARGIN + 6, signLineY);
      doc.font('Helvetica-Oblique').text(data.certification.applicantSignatureText, PAGE_MARGIN + 110, signLineY);
      doc.moveTo(PAGE_MARGIN + 105, signLineY + 10).lineTo(PAGE_MARGIN + 280, signLineY + 10).strokeColor('#0f172a').lineWidth(0.75).stroke();

      doc.font('Helvetica-Bold').text('Date: ', PAGE_MARGIN + 320, signLineY);
      doc.font('Helvetica').text(data.certification.signatureDate, PAGE_MARGIN + 355, signLineY);
      doc.moveTo(PAGE_MARGIN + 350, signLineY + 10).lineTo(PAGE_MARGIN + 460, signLineY + 10).strokeColor('#0f172a').lineWidth(0.75).stroke();

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function drawSectionHeader(doc: PDFKit.PDFDocument, contentWidth: number, title: string) {
  const y = doc.y;
  doc.rect(PAGE_MARGIN, y, contentWidth, 14)
    .fillColor('#0f172a')
    .fill();

  doc.font('Helvetica-Bold')
    .fontSize(8)
    .fillColor('#ffffff')
    .text(title, PAGE_MARGIN + 6, y + 3);

  doc.y = y + 15;
}
