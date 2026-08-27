export type LineItem = {
  id: string;
  description: string;
  type: 'Labor' | 'Material' | 'Equipment' | 'Permit' | 'Discount' | string;
  quantity: number;
  unitPrice: number;
  isOptional?: boolean;
  isDiscount?: boolean;
  selected?: boolean;
};

export type EstimateTier = {
  id: 'good' | 'better' | 'best';
  name: string;
  badge?: string;
  description: string;
  isRecommended?: boolean;
  items: LineItem[];
  taxRate: number;
  depositPct: number;
  discountAmount?: number;
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
  mode: 'single' | 'multi_tier';
  activeTierId: 'good' | 'better' | 'best';
  tiers: EstimateTier[];
  items: LineItem[];
  taxRate: number;
  depositPct: number;
  discountAmount: number;
  milestonesEnabled: boolean;
  milestones: Array<{ name: string; pct: number }>;
  terms: string;
  isSample: boolean;
};

export type EstimateTotals = {
  subtotal: number;
  discountTotal: number;
  taxAmount: number;
  grandTotal: number;
  depositDue: number;
  milestones?: Array<{
    name: string;
    percentage: number;
    amount: number;
  }>;
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
  depositPct: number,
  discountAmount = 0,
  milestones?: Array<{ name: string; pct: number }>
): EstimateTotals {
  const safeTaxRate = clampPercentage(taxRate, 0);
  const safeDepositPct = clampPercentage(depositPct, 0);

  let rawSubtotal = 0;
  let itemDiscountTotal = 0;

  for (const item of items || []) {
    if (item.isOptional && item.selected === false) continue;

    const qty = clampQuantity(item.quantity, 0);
    const price = clampUnitPrice(item.unitPrice, 0);
    const lineTotal = qty * price;

    if (item.isDiscount || item.type === 'Discount') {
      itemDiscountTotal += lineTotal;
    } else {
      rawSubtotal += lineTotal;
    }
  }

  const overallDiscount = itemDiscountTotal + Math.max(0, discountAmount || 0);
  const netSubtotal = Math.max(0, rawSubtotal - overallDiscount);
  const taxAmount = (netSubtotal * safeTaxRate) / 100;
  const grandTotal = Math.max(0, netSubtotal + taxAmount);
  const depositDue = (grandTotal * safeDepositPct) / 100;

  const milestoneBreakdown = (milestones && milestones.length > 0)
    ? milestones.map((m) => ({
        name: m.name,
        percentage: m.pct,
        amount: Math.round(((grandTotal * m.pct) / 100) * 100) / 100,
      }))
    : undefined;

  return {
    subtotal: Math.round(netSubtotal * 100) / 100,
    discountTotal: Math.round(overallDiscount * 100) / 100,
    taxAmount: Math.round(taxAmount * 100) / 100,
    grandTotal: Math.round(grandTotal * 100) / 100,
    depositDue: Math.round(depositDue * 100) / 100,
    milestones: milestoneBreakdown,
  };
}

export function getTodaysDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDisplayDate(dateStr?: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  }
  return dateStr;
}

export function generateEstimateNumber(dateStr?: string): string {
  const year = dateStr ? dateStr.slice(0, 4) : String(new Date().getFullYear());
  const randSeq = Math.floor(100 + Math.random() * 900);
  return `EST-${year}-${randSeq}`;
}

export const DEFAULT_MILESTONES = [
  { name: 'Initial Deposit (Upon Authorization)', pct: 30 },
  { name: 'Progress Milestone (Rough-in / Material Delivery)', pct: 40 },
  { name: 'Final Payment (Upon Completion & Inspection)', pct: 30 },
];

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
    mode: 'single',
    activeTierId: 'better',
    tiers: [
      {
        id: 'good',
        name: 'Standard Package',
        badge: 'Essential',
        description: 'Basic system repair and standard component replacement.',
        isRecommended: false,
        items: [
          { id: 'g1', description: 'Standard Diagnostic & Repair Labor', type: 'Labor', quantity: 1, unitPrice: 150 },
          { id: 'g2', description: 'Standard Grade OEM Replacement Parts', type: 'Material', quantity: 1, unitPrice: 200 },
        ],
        taxRate: 0,
        depositPct: 30,
      },
      {
        id: 'better',
        name: 'Preferred Package',
        badge: 'Recommended',
        description: 'Enhanced components with extended 2-year warranty and efficiency tuning.',
        isRecommended: true,
        items: [
          { id: 'b1', description: 'Comprehensive Repair & Optimization Labor', type: 'Labor', quantity: 2, unitPrice: 150 },
          { id: 'b2', description: 'Heavy-Duty Commercial Grade Components', type: 'Material', quantity: 1, unitPrice: 380 },
          { id: 'b3', description: 'System Calibration & Surge Protection', type: 'Equipment', quantity: 1, unitPrice: 180 },
        ],
        taxRate: 0,
        depositPct: 30,
      },
      {
        id: 'best',
        name: 'Ultimate Package',
        badge: 'Best Value',
        description: 'Premium heavy-duty rebuild, 5-year guarantee, and annual tune-up pass.',
        isRecommended: false,
        items: [
          { id: 'best1', description: 'Master Technician Full Rebuild & Installation', type: 'Labor', quantity: 3, unitPrice: 150 },
          { id: 'best2', description: 'Premium High-Efficiency Ultra Component Spec', type: 'Material', quantity: 1, unitPrice: 580 },
          { id: 'best3', description: 'Whole-System Surge Protector & Monitoring Unit', type: 'Equipment', quantity: 1, unitPrice: 250 },
          { id: 'best4', description: '2-Year VIP Priority Maintenance Pass', type: 'Labor', quantity: 1, unitPrice: 199 },
        ],
        taxRate: 0,
        depositPct: 30,
      },
    ],
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
    discountAmount: 0,
    milestonesEnabled: false,
    milestones: DEFAULT_MILESTONES,
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
    mode: 'single',
    activeTierId: 'better',
    tiers: [
      {
        id: 'good',
        name: 'Standard Package',
        badge: 'Economy',
        description: 'Targeted spot repair and standard flashing replacement.',
        isRecommended: false,
        items: [
          { id: 'g1', description: 'Spot Roof Leak Inspection & Repair', type: 'Labor', quantity: 1, unitPrice: 250 },
          { id: 'g2', description: 'Architectural Shingle Bundle & Underlayment', type: 'Material', quantity: 2, unitPrice: 65 },
        ],
        taxRate: 6.0,
        depositPct: 30,
      },
      {
        id: 'better',
        name: 'Preferred Package',
        badge: 'Most Popular',
        description: 'Full valley rebuild, synthetic underlayment, and ice & water shield.',
        isRecommended: true,
        items: [
          { id: 'b1', description: 'Roof Valley Tear-off, Flashing & Rebuild', type: 'Labor', quantity: 1, unitPrice: 650 },
          { id: 'b2', description: 'Synthetic Underlayment & Ice/Water Barrier', type: 'Material', quantity: 1, unitPrice: 280 },
          { id: 'b3', description: 'High-Wind Ridge Vent Installation', type: 'Labor', quantity: 1, unitPrice: 190 },
        ],
        taxRate: 6.0,
        depositPct: 30,
      },
      {
        id: 'best',
        name: 'Ultimate Protection',
        badge: 'Best Lifetime Value',
        description: 'Complete roof restoration with Class 4 impact shingles and 10-year warranty.',
        isRecommended: false,
        items: [
          { id: 'best1', description: 'Full Roof Section Replacement & Decking Repair', type: 'Labor', quantity: 1, unitPrice: 1200 },
          { id: 'best2', description: 'Class 4 Impact Resistant Shingle System', type: 'Material', quantity: 1, unitPrice: 750 },
          { id: 'best3', description: 'Continuous Ridge Ventilation & Drip Edge', type: 'Equipment', quantity: 1, unitPrice: 320 },
          { id: 'best4', description: '10-Year Transferable Workmanship Guarantee', type: 'Labor', quantity: 1, unitPrice: 250 },
        ],
        taxRate: 6.0,
        depositPct: 30,
      },
    ],
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
    discountAmount: 0,
    milestonesEnabled: false,
    milestones: DEFAULT_MILESTONES,
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

  if (estimate.mode === 'multi_tier' && estimate.tiers && estimate.tiers.length > 0) {
    const tierSummaries = estimate.tiers.map((t) => {
      const tTotals = calculateEstimateTotals(t.items, t.taxRate, t.depositPct, t.discountAmount);
      const items = t.items.map((i) => `    - ${i.description} (${i.quantity}x @ ${formatCurrency(i.unitPrice)}) = ${formatCurrency(i.quantity * i.unitPrice)}`).join('\n');
      return `[TIER: ${t.name.toUpperCase()}${t.isRecommended ? ' ★ RECOMMENDED' : ''}]\n  ${t.description}\n  Included Scope:\n${items}\n  Tier Total: ${formatCurrency(tTotals.grandTotal)} (Deposit: ${formatCurrency(tTotals.depositDue)})`;
    }).join('\n\n');

    return [
      `3-TIER ESTIMATE PROPOSAL #${estimate.estimateNumber || 'EST-001'}`,
      `Date: ${estimate.estimateDate || getTodaysDateString()}`,
      `From: ${contractorHeader}`,
      clientHeader,
      `=========================================`,
      `PACKAGE COMPARISON:`,
      tierSummaries,
      `=========================================`,
      estimate.terms ? `\nTerms & Conditions:\n${estimate.terms}` : null,
    ]
      .filter((line) => line !== null)
      .join('\n');
  }

  const itemLines = (estimate.items || []).map((item) => {
    const qty = clampQuantity(item.quantity, 1);
    const price = clampUnitPrice(item.unitPrice, 0);
    const itemTotal = formatCurrency(qty * price);
    const optTag = item.isOptional ? ' [OPTIONAL]' : '';
    const discTag = (item.isDiscount || item.type === 'Discount') ? ' [DISCOUNT -]' : '';
    return `• ${item.description || 'Line Item'}${optTag}${discTag} (${qty}x @ ${formatCurrency(price)}) = ${itemTotal}`;
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
    totals.discountTotal > 0 ? `Total Discounts: -${formatCurrency(totals.discountTotal)}` : null,
    estimate.taxRate > 0 ? `Tax (${estimate.taxRate}%): ${formatCurrency(totals.taxAmount)}` : null,
    `TOTAL AMOUNT: ${formatCurrency(totals.grandTotal)}`,
    estimate.depositPct > 0
      ? `Deposit Required (${estimate.depositPct}%): ${formatCurrency(totals.depositDue)}`
      : null,
    totals.milestones && totals.milestones.length > 0
      ? `\nPayment Milestones:\n` + totals.milestones.map((m) => `  - ${m.name} (${m.percentage}%): ${formatCurrency(m.amount)}`).join('\n')
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
    if (parsed && typeof parsed === 'object') {
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
