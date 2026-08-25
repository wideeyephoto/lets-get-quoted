import { formatUsdExact } from '@/lib/money-format';

export type LienWaiverType =
  | 'conditional_progress'
  | 'unconditional_progress'
  | 'conditional_final'
  | 'unconditional_final';

export type LienWaiverDocument = {
  id: string;
  type: LienWaiverType;
  title: string;
  claimantName: string;
  customerName: string;
  jobRef: string;
  jobTitle?: string | null;
  propertyAddress: string;
  paymentAmount: number;
  formattedAmount: string;
  throughDate: string;
  exceptions: string[];
  isConditional: boolean;
  isFinal: boolean;
  legalBody: string;
  createdAt: string;
};

export const LIEN_WAIVER_TITLES: Record<LienWaiverType, string> = {
  conditional_progress: 'CONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT',
  unconditional_progress: 'UNCONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT',
  conditional_final: 'CONDITIONAL WAIVER AND RELEASE ON FINAL PAYMENT',
  unconditional_final: 'UNCONDITIONAL WAIVER AND RELEASE ON FINAL PAYMENT',
};

/**
 * Builds the statutory legal release language for the requested waiver type.
 */
export function buildLienWaiverLegalText(params: {
  type: LienWaiverType;
  claimantName: string;
  customerName: string;
  propertyAddress: string;
  paymentAmount: number;
  throughDate: string;
  exceptions?: string[];
}): string {
  const amountStr = formatUsdExact(params.paymentAmount);
  const exceptionsText = params.exceptions && params.exceptions.length > 0
    ? params.exceptions.join('; ')
    : 'None';

  switch (params.type) {
    case 'conditional_progress':
      return [
        LIEN_WAIVER_TITLES.conditional_progress,
        `NOTICE: THIS DOCUMENT WAIVES THE CLAIMANT'S LIEN, STOP PAYMENT NOTICE, AND PAYMENT BOND RIGHTS EFFECTIVE ON RECEIPT OF PAYMENT. A PERSON SHOULD NOT RELY ON THIS DOCUMENT UNLESS SATISFIED THAT THE CLAIMANT HAS RECEIVED PAYMENT.`,
        `Identifying Information:`,
        `Name of Claimant: ${params.claimantName}`,
        `Name of Customer: ${params.customerName}`,
        `Job Location: ${params.propertyAddress}`,
        `Conditional Waiver and Release:`,
        `Upon receipt by the undersigned of a check from ${params.customerName} in the sum of ${amountStr} payable to ${params.claimantName} and when the check has been properly endorsed and has been paid by the bank on which it is drawn, this document becomes effective to release any mechanic's lien, stop payment notice, or bond right the undersigned has on the job located at ${params.propertyAddress} to the following extent.`,
        `This release covers a progress payment for all labor, services, equipment, or materials furnished to the jobsite through ${params.throughDate} only and does not cover any retention withheld, extras, or items furnished after that date.`,
        `Exceptions: ${exceptionsText}.`,
      ].join('\n\n');

    case 'unconditional_progress':
      return [
        LIEN_WAIVER_TITLES.unconditional_progress,
        `NOTICE TO APPLICANT: THIS DOCUMENT WAIVES AND RELEASES LIEN, STOP PAYMENT NOTICE, AND PAYMENT BOND RIGHTS UNCONDITIONALLY AND STATES THAT YOU HAVE BEEN PAID FOR GIVING UP THOSE RIGHTS. THIS DOCUMENT IS ENFORCEABLE AGAINST YOU IF YOU SIGN IT, EVEN IF YOU HAVE NOT BEEN PAID.`,
        `Identifying Information:`,
        `Name of Claimant: ${params.claimantName}`,
        `Name of Customer: ${params.customerName}`,
        `Job Location: ${params.propertyAddress}`,
        `Unconditional Waiver and Release:`,
        `The undersigned has been paid and has received a progress payment in the sum of ${amountStr} for all labor, services, equipment, or materials furnished to the property or to ${params.customerName} at ${params.propertyAddress} through ${params.throughDate}.`,
        `The undersigned does hereby release and waive any mechanic's lien, stop notice, or bond right that the undersigned has on the above-referenced property to the extent of the payment amount specified through the date indicated.`,
        `Exceptions: ${exceptionsText}.`,
      ].join('\n\n');

    case 'conditional_final':
      return [
        LIEN_WAIVER_TITLES.conditional_final,
        `NOTICE: THIS DOCUMENT WAIVES THE CLAIMANT'S LIEN, STOP PAYMENT NOTICE, AND PAYMENT BOND RIGHTS EFFECTIVE ON RECEIPT OF PAYMENT. A PERSON SHOULD NOT RELY ON THIS DOCUMENT UNLESS SATISFIED THAT THE CLAIMANT HAS RECEIVED PAYMENT.`,
        `Identifying Information:`,
        `Name of Claimant: ${params.claimantName}`,
        `Name of Customer: ${params.customerName}`,
        `Job Location: ${params.propertyAddress}`,
        `Conditional Final Waiver and Release:`,
        `Upon receipt by the undersigned of a check from ${params.customerName} in the sum of ${amountStr} payable to ${params.claimantName} and when the check has been properly endorsed and has been paid by the bank on which it is drawn, this document becomes effective to release any mechanic's lien, stop payment notice, or bond right the undersigned has on the job located at ${params.propertyAddress}.`,
        `This release covers the final payment to the undersigned for all labor, services, equipment, or materials furnished to the jobsite.`,
        `Exceptions: ${exceptionsText}.`,
      ].join('\n\n');

    case 'unconditional_final':
      return [
        LIEN_WAIVER_TITLES.unconditional_final,
        `NOTICE TO APPLICANT: THIS DOCUMENT WAIVES AND RELEASES LIEN, STOP PAYMENT NOTICE, AND PAYMENT BOND RIGHTS UNCONDITIONALLY AND STATES THAT YOU HAVE BEEN PAID FOR GIVING UP THOSE RIGHTS. THIS DOCUMENT IS ENFORCEABLE AGAINST YOU IF YOU SIGN IT, EVEN IF YOU HAVE NOT BEEN PAID.`,
        `Identifying Information:`,
        `Name of Claimant: ${params.claimantName}`,
        `Name of Customer: ${params.customerName}`,
        `Job Location: ${params.propertyAddress}`,
        `Unconditional Final Waiver and Release:`,
        `The undersigned has been paid in full in the sum of ${amountStr} for all labor, services, equipment, or materials furnished to the property or to ${params.customerName} at the jobsite located at ${params.propertyAddress}.`,
        `The undersigned does hereby release and waive any and all mechanic's lien rights, stop payment notices, or claims under any payment bond regarding the above-referenced project. The property is fully released from all lien claims by the claimant.`,
        `Exceptions: ${exceptionsText}.`,
      ].join('\n\n');
  }
}

/**
 * Creates a complete Lien Waiver Document structure.
 */
export function generateLienWaiverDocument(params: {
  id?: string;
  type: LienWaiverType;
  claimantName: string;
  customerName: string;
  jobRef: string;
  jobTitle?: string | null;
  propertyAddress: string;
  paymentAmount: number;
  throughDate?: string;
  exceptions?: string[];
}): LienWaiverDocument {
  const throughDate = params.throughDate || new Date().toISOString().split('T')[0];
  const exceptions = params.exceptions || [];
  const isConditional = params.type.startsWith('conditional');
  const isFinal = params.type.endsWith('final');
  const title = LIEN_WAIVER_TITLES[params.type];

  const legalBody = buildLienWaiverLegalText({
    type: params.type,
    claimantName: params.claimantName,
    customerName: params.customerName,
    propertyAddress: params.propertyAddress,
    paymentAmount: params.paymentAmount,
    throughDate,
    exceptions,
  });

  return {
    id: params.id || `LW-${params.jobRef}-${Date.now().toString(36).toUpperCase()}`,
    type: params.type,
    title,
    claimantName: params.claimantName,
    customerName: params.customerName,
    jobRef: params.jobRef,
    jobTitle: params.jobTitle,
    propertyAddress: params.propertyAddress,
    paymentAmount: params.paymentAmount,
    formattedAmount: formatUsdExact(params.paymentAmount),
    throughDate,
    exceptions,
    isConditional,
    isFinal,
    legalBody,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Derives the appropriate lien waiver type given the milestone kind and payment status.
 */
export function selectLienWaiverType(
  isFinalMilestone: boolean,
  isPaid: boolean,
): LienWaiverType {
  if (isFinalMilestone) {
    return isPaid ? 'unconditional_final' : 'conditional_final';
  }
  return isPaid ? 'unconditional_progress' : 'conditional_progress';
}
