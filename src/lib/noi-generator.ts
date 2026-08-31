export type NoiInput = {
  contractorName: string;
  contractorContact?: string;
  propertyOwner: string;
  propertyAddress: string;
  jobRef: string;
  invoiceRef?: string;
  amountDue: number;
  daysOverdue: number;
  curePeriodDays?: number;
  serviceDescription?: string;
};

export type NoiDocumentData = {
  documentTitle: string;
  noticeDate: string;
  cureDeadlineDate: string;
  claimant: string;
  claimantContact: string;
  propertyOwner: string;
  propertyAddress: string;
  jobRef: string;
  invoiceRef: string;
  amountFormatted: string;
  curePeriodDays: number;
  legalAdvisementText: string;
  serviceDescription: string;
};

export function calculateCureDeadline(startDate: Date = new Date(), days = 10): Date {
  const deadline = new Date(startDate.getTime());
  deadline.setDate(deadline.getDate() + days);
  return deadline;
}

export function generateNoiDocumentData(input: NoiInput): NoiDocumentData {
  const now = new Date();
  const cureDays = input.curePeriodDays ?? 10;
  const deadline = calculateCureDeadline(now, cureDays);

  const amountFormatted = `$${input.amountDue.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  const legalAdvisementText = `PLEASE TAKE NOTICE that the Claimant named below furnished labor, materials, services, and/or equipment for improvements upon the subject real property described herein.

As of the date of this Notice, there remains an unpaid balance of ${amountFormatted} due and owing to Claimant for said labor and materials.

DEMAND IS HEREBY MADE for payment in full within ${cureDays} calendar days from the date of this Notice (on or before ${deadline.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}).

IF PAYMENT IS NOT RECEIVED within said ${cureDays} calendar days, Claimant will immediately exercise all rights available under statutory law, including but not limited to recording and filing a verified Mechanic’s Lien against the real property, initiating legal foreclosure proceedings, and seeking recovery of attorney fees, interest, and statutory court costs.`;

  return {
    documentTitle: 'STATUTORY NOTICE OF INTENT TO FILE MECHANIC’S LIEN',
    noticeDate: now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    cureDeadlineDate: deadline.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    claimant: input.contractorName,
    claimantContact: input.contractorContact || 'Contractor on file',
    propertyOwner: input.propertyOwner,
    propertyAddress: input.propertyAddress,
    jobRef: input.jobRef,
    invoiceRef: input.invoiceRef || 'N/A',
    amountFormatted,
    curePeriodDays: cureDays,
    legalAdvisementText,
    serviceDescription: input.serviceDescription || 'Contracted Trade Construction Services and Materials',
  };
}
