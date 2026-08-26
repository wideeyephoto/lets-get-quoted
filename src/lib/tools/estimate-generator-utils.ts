export type LineItem = {
  id: string;
  description: string;
  type: 'Labor' | 'Material' | 'Equipment' | 'Permit' | string;
  quantity: number;
  unitPrice: number;
};

export type EstimateData = {
  contractorName: string;
  contractorPhone: string;
  contractorEmail: string;
  contractorLicense: string;
  clientName: string;
  clientAddress: string;
  estimateNumber: string;
  estimateDate: string;
  selectedTrade: 'roofing' | 'electrical' | 'mechanical' | 'plumbing' | 'heat_pump' | 'solar_pv' | 'ev_charger';
  roofPitch: '4/12' | '6/12' | '8/12' | '10/12';
  items: LineItem[];
  taxRate: number;
  depositPct: number;
  terms: string;
  isSample: boolean;
};

export type EstimateTotals = {
  subtotal: number;
  taxAmount: number;
  grandTotal: number;
  depositDue: number;
};

export const LOCAL_STORAGE_DRAFT_KEY = 'lgq_estimate_generator_draft_v1';

export function formatCurrency(num: number): string {
  const safeNum = Number.isFinite(num) ? num : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(safeNum);
}

export function clampPercentage(val: number | string | undefined | null, fallback = 0): number {
  const num = typeof val === 'number' ? val : parseFloat(String(val || ''));
  if (!Number.isFinite(num) || isNaN(num)) return fallback;
  return Math.min(100, Math.max(0, Math.round(num * 100) / 100));
}

export function clampQuantity(val: number | string | undefined | null, fallback = 1): number {
  const num = typeof val === 'number' ? val : parseFloat(String(val || ''));
  if (!Number.isFinite(num) || isNaN(num) || num <= 0) return fallback;
  return Math.max(0.01, Math.round(num * 100) / 100);
}

export function clampUnitPrice(val: number | string | undefined | null, fallback = 0): number {
  const num = typeof val === 'number' ? val : parseFloat(String(val || ''));
  if (!Number.isFinite(num) || isNaN(num) || num < 0) return fallback;
  return Math.max(0, Math.round(num * 100) / 100);
}

export function calculateEstimateTotals(
  items: LineItem[],
  taxRate: number,
  depositPct: number
): EstimateTotals {
  const safeTaxRate = clampPercentage(taxRate, 0);
  const safeDepositPct = clampPercentage(depositPct, 0);

  const subtotal = (items || []).reduce((sum, item) => {
    const qty = clampQuantity(item.quantity, 0);
    const price = clampUnitPrice(item.unitPrice, 0);
    return sum + qty * price;
  }, 0);

  const taxAmount = (subtotal * safeTaxRate) / 100;
  const grandTotal = subtotal + taxAmount;
  const depositDue = (grandTotal * safeDepositPct) / 100;

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    taxAmount: Math.round(taxAmount * 100) / 100,
    grandTotal: Math.round(grandTotal * 100) / 100,
    depositDue: Math.round(depositDue * 100) / 100,
  };
}

export function getTodaysDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function generateEstimateNumber(dateStr?: string): string {
  const year = dateStr ? dateStr.slice(0, 4) : String(new Date().getFullYear());
  const randSeq = Math.floor(100 + Math.random() * 900);
  return `EST-${year}-${randSeq}`;
}

export function getInitialBlankEstimate(): EstimateData {
  return {
    contractorName: '',
    contractorPhone: '',
    contractorEmail: '',
    contractorLicense: '',
    clientName: '',
    clientAddress: '',
    estimateNumber: 'EST-2026-001',
    estimateDate: getTodaysDateString(),
    selectedTrade: 'roofing',
    roofPitch: '6/12',
    items: [
      {
        id: '1',
        description: 'Labor & Initial Scope of Work',
        type: 'Labor',
        quantity: 1,
        unitPrice: 150,
      },
    ],
    taxRate: 0,
    depositPct: 30,
    terms:
      'Estimate valid for 30 days. Deposit required upon authorization to schedule crew and order materials. Workmanship backed by standard warranty.',
    isSample: false,
  };
}

export function getInitialExampleEstimate(): EstimateData {
  return {
    contractorName: 'Apex Trade Solutions',
    contractorPhone: '(555) 382-9011',
    contractorEmail: 'service@apextrades.com',
    contractorLicense: 'LIC #948201-A',
    clientName: 'Sarah Jenkins',
    clientAddress: '211 S Williams St, Royal Oak, MI',
    estimateNumber: 'EST-2026-104',
    estimateDate: getTodaysDateString(),
    selectedTrade: 'roofing',
    roofPitch: '6/12',
    items: [
      {
        id: '1',
        description: 'Initial Diagnostic & Site Inspection',
        type: 'Labor',
        quantity: 1,
        unitPrice: 125,
      },
      {
        id: '2',
        description: 'Parts & Replacement Materials (Heavy-Duty Spec)',
        type: 'Material',
        quantity: 1,
        unitPrice: 280,
      },
      {
        id: '3',
        description: 'System Installation, Calibration & Safety Test',
        type: 'Labor',
        quantity: 3,
        unitPrice: 95,
      },
    ],
    taxRate: 8.25,
    depositPct: 30,
    terms:
      'Estimate valid for 30 days. 30% deposit required upon authorization to order materials. Workmanship backed by a 1-year guarantee.',
    isSample: true,
  };
}

export function formatEstimateSummaryText(
  estimate: EstimateData,
  totals: EstimateTotals
): string {
  const contractorHeader = [
    estimate.contractorName || 'Contractor Estimate',
    estimate.contractorPhone ? `Tel: ${estimate.contractorPhone}` : null,
    estimate.contractorEmail ? `Email: ${estimate.contractorEmail}` : null,
    estimate.contractorLicense ? `License: ${estimate.contractorLicense}` : null,
  ]
    .filter(Boolean)
    .join(' | ');

  const clientHeader = [
    estimate.clientName ? `For: ${estimate.clientName}` : 'For: Valued Client',
    estimate.clientAddress ? `Location: ${estimate.clientAddress}` : null,
  ]
    .filter(Boolean)
    .join(' - ');

  const itemLines = (estimate.items || []).map((item) => {
    const qty = clampQuantity(item.quantity, 1);
    const price = clampUnitPrice(item.unitPrice, 0);
    const itemTotal = formatCurrency(qty * price);
    return `• ${item.description || 'Line Item'} (${qty}x @ ${formatCurrency(price)}) = ${itemTotal}`;
  });

  return [
    `ESTIMATE #${estimate.estimateNumber || 'EST-001'}`,
    `Date: ${estimate.estimateDate || getTodaysDateString()}`,
    `From: ${contractorHeader}`,
    clientHeader,
    `-----------------------------------------`,
    `SCOPE OF WORK:`,
    ...itemLines,
    `-----------------------------------------`,
    `Subtotal: ${formatCurrency(totals.subtotal)}`,
    estimate.taxRate > 0 ? `Tax (${estimate.taxRate}%): ${formatCurrency(totals.taxAmount)}` : null,
    `TOTAL AMOUNT: ${formatCurrency(totals.grandTotal)}`,
    estimate.depositPct > 0
      ? `Deposit Required (${estimate.depositPct}%): ${formatCurrency(totals.depositDue)}`
      : null,
    estimate.terms ? `\nTerms & Notes:\n${estimate.terms}` : null,
  ]
    .filter((line) => line !== null)
    .join('\n');
}

export function loadEstimateDraft(): EstimateData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.items)) {
      return parsed as EstimateData;
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

export function saveEstimateDraft(data: EstimateData): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_STORAGE_DRAFT_KEY, JSON.stringify(data));
  } catch {
    // storage quota or disabled localStorage
  }
}

export function clearEstimateDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LOCAL_STORAGE_DRAFT_KEY);
  } catch {
    // ignore
  }
}
