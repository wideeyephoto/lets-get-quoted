export type AccountingPlatform = 'quickbooks_online' | 'xero';

export type AccountingCustomer = {
  externalId?: string;
  displayName: string;
  givenName?: string;
  familyName?: string;
  email?: string;
  phone?: string;
  billingAddress?: {
    line1: string;
    city?: string;
    state?: string;
    postalCode?: string;
  };
};

export type AccountingLineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  accountRef?: string; // e.g. "Services:Roofing Revenue"
  taxable?: boolean;
};

export type AccountingInvoice = {
  externalId?: string;
  invoiceNumber: string;
  customer: AccountingCustomer;
  issueDate: string;
  dueDate: string;
  lineItems: AccountingLineItem[];
  subtotal: number;
  taxTotal: number;
  total: number;
  balanceRemaining: number;
  status: 'draft' | 'sent' | 'paid' | 'void';
};

export type AccountingVendorBill = {
  externalId?: string;
  billNumber: string;
  vendorName: string; // e.g. "ABC Supply Co." or "City of Royal Oak"
  billCategory: 'materials' | 'permit_fee' | 'subcontractor' | 'equipment';
  issueDate: string;
  dueDate: string;
  amount: number;
  jobRef: string;
  description: string;
  status: 'pending' | 'paid';
};

export type JobFinancialLedger = {
  jobId: string;
  jobRef: string;
  customerName: string;
  revenue: {
    quotedTotal: number;
    collectedTotal: number;
    invoices: AccountingInvoice[];
  };
  expenses: {
    materialCostTotal: number;
    permitFeesTotal: number;
    subcontractorCostTotal: number;
    bills: AccountingVendorBill[];
    totalExpenses: number;
  };
  profitability: {
    grossProfit: number;
    grossMarginPercent: number;
    isProfitable: boolean;
  };
  syncedAt: string;
  platform: AccountingPlatform;
};

/**
 * Maps a job and itemized line items into standard accounting format.
 */
export function mapJobToAccountingInvoice(input: {
  jobId: string;
  jobRef: string;
  clientName: string;
  clientEmail?: string | null;
  clientPhone?: string | null;
  address?: string | null;
  lineItems?: Array<{ description: string; quantity?: number; unitPrice?: number; total?: number }>;
  quotedAmount: number;
  status?: string;
}): AccountingInvoice {
  const customer: AccountingCustomer = {
    displayName: input.clientName,
    email: input.clientEmail || undefined,
    phone: input.clientPhone || undefined,
    billingAddress: input.address ? { line1: input.address } : undefined,
  };

  const lineItems: AccountingLineItem[] = [];
  if (input.lineItems && input.lineItems.length > 0) {
    for (const item of input.lineItems) {
      const qty = item.quantity || 1;
      const unit = item.unitPrice || item.total || 0;
      lineItems.push({
        description: item.description,
        quantity: qty,
        unitPrice: unit,
        amount: item.total || qty * unit,
        taxable: false,
      });
    }
  } else {
    lineItems.push({
      description: 'Contracted Trade Services per Proposal',
      quantity: 1,
      unitPrice: input.quotedAmount,
      amount: input.quotedAmount,
      taxable: false,
    });
  }

  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const taxTotal = 0;
  const total = subtotal + taxTotal;

  return {
    invoiceNumber: `INV-${input.jobRef.replace(/^JOB-?/i, '')}`,
    customer,
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 10),
    lineItems,
    subtotal,
    taxTotal,
    total,
    balanceRemaining: input.status === 'complete' ? 0 : total,
    status: input.status === 'complete' ? 'paid' : 'sent',
  };
}

/**
 * Maps a government permit fee expense into a vendor bill.
 */
export function mapPermitFeeToVendorBill(input: {
  jobRef: string;
  authorityName: string;
  feeAmount: number;
  permitNumber?: string | null;
  paidDate?: string;
}): AccountingVendorBill {
  const dateStr = input.paidDate || new Date().toISOString().slice(0, 10);
  return {
    billNumber: `PERMIT-${input.permitNumber || input.jobRef}`,
    vendorName: input.authorityName || 'Municipal Building Department',
    billCategory: 'permit_fee',
    issueDate: dateStr,
    dueDate: dateStr,
    amount: input.feeAmount,
    jobRef: input.jobRef,
    description: `Municipal Building Permit & Inspection Fees (${input.authorityName})`,
    status: 'paid',
  };
}

/**
 * Maps a distributor materials purchase order into a vendor bill.
 */
export function mapPurchaseOrderToVendorBill(input: {
  poNumber: string;
  jobRef: string;
  distributorName: string;
  wholesaleAmount: number;
  orderDate?: string;
}): AccountingVendorBill {
  const dateStr = input.orderDate || new Date().toISOString().slice(0, 10);
  return {
    billNumber: input.poNumber,
    vendorName: input.distributorName,
    billCategory: 'materials',
    issueDate: dateStr,
    dueDate: new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 10),
    amount: input.wholesaleAmount,
    jobRef: input.jobRef,
    description: `Wholesale Jobsite Materials Order (${input.distributorName})`,
    status: 'pending',
  };
}

/**
 * Calculates a complete job profitability and financial ledger.
 */
export function calculateJobFinancialLedger(input: {
  jobId: string;
  jobRef: string;
  customerName: string;
  invoice: AccountingInvoice;
  bills: AccountingVendorBill[];
  platform?: AccountingPlatform;
}): JobFinancialLedger {
  const revenueTotal = input.invoice.total;
  const collectedTotal = input.invoice.status === 'paid' ? revenueTotal : 0;

  let materialCostTotal = 0;
  let permitFeesTotal = 0;
  let subcontractorCostTotal = 0;

  for (const bill of input.bills) {
    if (bill.billCategory === 'materials') {
      materialCostTotal += bill.amount;
    } else if (bill.billCategory === 'permit_fee') {
      permitFeesTotal += bill.amount;
    } else if (bill.billCategory === 'subcontractor') {
      subcontractorCostTotal += bill.amount;
    }
  }

  const totalExpenses = Math.round((materialCostTotal + permitFeesTotal + subcontractorCostTotal) * 100) / 100;
  const grossProfit = Math.round((revenueTotal - totalExpenses) * 100) / 100;
  const grossMarginPercent = revenueTotal > 0 ? Math.round((grossProfit / revenueTotal) * 1000) / 10 : 0;

  return {
    jobId: input.jobId,
    jobRef: input.jobRef,
    customerName: input.customerName,
    revenue: {
      quotedTotal: revenueTotal,
      collectedTotal,
      invoices: [input.invoice],
    },
    expenses: {
      materialCostTotal,
      permitFeesTotal,
      subcontractorCostTotal,
      bills: input.bills,
      totalExpenses,
    },
    profitability: {
      grossProfit,
      grossMarginPercent,
      isProfitable: grossProfit > 0,
    },
    syncedAt: new Date().toISOString(),
    platform: input.platform || 'quickbooks_online',
  };
}
