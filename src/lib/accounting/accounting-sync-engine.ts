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

export type JournalEntryLine = {
  entryNumber: string;
  date: string;
  accountNumber: string;
  accountName: string;
  debit: number;
  credit: number;
  description: string;
  clientName: string;
  ref: string;
};

/**
 * Generates double-entry general ledger journal lines for settled transactions.
 * Balances: Gross Revenue (Credit) = Net Cash (Debit) + Processing Fees (Debit)
 */
export function generateGeneralLedgerJournalEntries(
  transactions: Array<{
    id: string;
    clientName: string;
    gross: number;
    fee: number;
    net: number;
    paidAt?: string | null;
    jobRef?: string;
    paymentMethod?: string;
  }>,
): JournalEntryLine[] {
  const entries: JournalEntryLine[] = [];

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    const entryNum = `JE-${String(i + 1).padStart(4, '0')}`;
    const dateStr = tx.paidAt ? tx.paidAt.slice(0, 10) : new Date().toISOString().slice(0, 10);
    const ref = tx.jobRef || tx.id.slice(0, 8);

    const grossCents = Math.round(tx.gross * 100);
    const feeCents = Math.round(tx.fee * 100);
    const netCents = Math.max(0, grossCents - feeCents);

    // 1. Debit Cash / Undeposited Funds for Net Amount
    if (netCents > 0) {
      entries.push({
        entryNumber: entryNum,
        date: dateStr,
        accountNumber: '1000',
        accountName: 'Undeposited Funds / Cash Clearing',
        debit: netCents / 100,
        credit: 0,
        description: `Net settlement for ${tx.clientName} (${tx.paymentMethod || 'Payment'})`,
        clientName: tx.clientName,
        ref,
      });
    }

    // 2. Debit Processing Fees for Merchant Fee
    if (feeCents > 0) {
      entries.push({
        entryNumber: entryNum,
        date: dateStr,
        accountNumber: '6100',
        accountName: 'Merchant Processing Fees (Stripe/ACH)',
        debit: feeCents / 100,
        credit: 0,
        description: `Processing fee on ${tx.clientName} transaction`,
        clientName: tx.clientName,
        ref,
      });
    }

    // 3. Credit Revenue / Sales for Gross Amount
    if (grossCents > 0) {
      entries.push({
        entryNumber: entryNum,
        date: dateStr,
        accountNumber: '4000',
        accountName: 'Trade Contracting Revenue',
        debit: 0,
        credit: grossCents / 100,
        description: `Gross revenue earned from ${tx.clientName}`,
        clientName: tx.clientName,
        ref,
      });
    }
  }

  return entries;
}

/**
 * Formats journal entry lines into QuickBooks Online (QBO) and Xero compatible CSV.
 */
export function formatJournalEntriesCsv(entries: JournalEntryLine[], format: 'qbo' | 'xero' = 'qbo'): string {
  if (format === 'xero') {
    const headers = ['*JournalNumber', '*Date', '*AccountCode', '*Description', '*Debit', '*Credit', 'Reference'];
    const rows = [headers.join(',')];
    for (const e of entries) {
      rows.push([
        `"${e.entryNumber}"`,
        `"${e.date}"`,
        `"${e.accountNumber}"`,
        `"${e.description.replace(/"/g, '""')}"`,
        e.debit > 0 ? e.debit.toFixed(2) : '',
        e.credit > 0 ? e.credit.toFixed(2) : '',
        `"${e.clientName} - ${e.ref}"`,
      ].join(','));
    }
    return rows.join('\n');
  }

  // QuickBooks Online Format
  const headers = ['JournalNo', 'Date', 'AccountNo', 'AccountName', 'Debit', 'Credit', 'Description', 'Customer', 'JobRef'];
  const rows = [headers.join(',')];
  for (const e of entries) {
    rows.push([
      `"${e.entryNumber}"`,
      `"${e.date}"`,
      `"${e.accountNumber}"`,
      `"${e.accountName}"`,
      e.debit > 0 ? e.debit.toFixed(2) : '',
      e.credit > 0 ? e.credit.toFixed(2) : '',
      `"${e.description.replace(/"/g, '""')}"`,
      `"${e.clientName.replace(/"/g, '""')}"`,
      `"${e.ref}"`,
    ].join(','));
  }
  return rows.join('\n');
}

