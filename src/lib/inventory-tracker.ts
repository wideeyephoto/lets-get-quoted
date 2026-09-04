import { formatUsdExact } from '@/lib/money-format';

export type ToolAssetStatus = 'available' | 'checked_out' | 'in_maintenance' | 'lost_damaged';
export type VehicleStatus = 'active' | 'in_shop' | 'retired';
export type InventoryLocationType = 'warehouse' | 'vehicle' | 'job_site' | 'cage';

export type DepreciationSchedule =
  | 'section_179'
  | 'de_minimis'
  | 'macrs_5'
  | 'macrs_7'
  | 'straight_line_3'
  | 'straight_line_5'
  | 'none';

export type InventoryLocation = {
  id: string;
  name: string;
  type: InventoryLocationType;
  code?: string | null;
  address?: string | null;
  isActive: boolean;
};

export type ToolAsset = {
  id: string;
  name: string;
  category: string;
  brand: string;
  modelNumber?: string | null;
  serialNumber?: string | null;
  assetTag: string;
  purchasePrice?: number | null;
  purchaseDate?: string | null;
  depreciationSchedule?: DepreciationSchedule | null;
  status: ToolAssetStatus;
  locationId?: string | null;
  locationName?: string | null;
  assignedCrewId?: string | null;
  assignedCrewName?: string | null;
  assignedJobId?: string | null;
  assignedJobLabel?: string | null;
  checkedOutAt?: string | null;
  imageUrl?: string | null;
  notes?: string | null;
};

export type FleetVehicle = {
  id: string;
  name: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string;
  vin?: string | null;
  currentMileage: number;
  purchasePrice?: number | null;
  purchaseDate?: string | null;
  depreciationSchedule?: DepreciationSchedule | null;
  primaryDriverId?: string | null;
  primaryDriverName?: string | null;
  status: VehicleStatus;
  lastServiceDate?: string | null;
  lastServiceMileage?: number | null;
  nextServiceDueMileage?: number | null;
  inspectionExpiresAt?: string | null;
  insuranceExpiresAt?: string | null;
  notes?: string | null;
};

export type VanStockItem = {
  id: string;
  name: string;
  sku: string;
  category: string;
  quantityOnHand: number;
  minThreshold: number;
  unit: string;
  unitCost: number;
  preferredSupplier: string;
  reorderQty: number;
  location: string;
  locationId?: string | null;
  notes?: string | null;
};

export type StockTransfer = {
  id: string;
  itemId: string;
  itemName: string;
  fromLocation: string;
  toLocation: string;
  quantity: number;
  performedBy?: string | null;
  notes?: string | null;
  createdAt: string;
};

export type InventoryPayload = {
  locations: InventoryLocation[];
  tools: ToolAsset[];
  vehicles: FleetVehicle[];
  stock: VanStockItem[];
  transfers: StockTransfer[];
  maintenance: MaintenanceRecord[];
};

export type MaintenanceRecord = {
  id: string;
  assetType: 'tool' | 'vehicle';
  assetId: string;
  assetName: string;
  serviceType: string;
  cost: number;
  performedBy: string;
  performedAt: string;
  nextDueAt?: string | null;
  mileageAtService?: number | null;
  notes?: string | null;
};

export type VehicleMaintenanceAudit = {
  isServiceOverdue: boolean;
  isServiceDueSoon: boolean;
  isInspectionExpired: boolean;
  isInsuranceExpired: boolean;
  milesUntilService: number | null;
  statusTone: 'success' | 'warn' | 'danger';
  summaryAlert: string | null;
};

export type LowStockAuditResult = {
  totalItems: number;
  lowStockCount: number;
  lowStockItems: VanStockItem[];
  estimatedRestockCost: number;
  formattedRestockCost: string;
};

/**
 * Checks out a tool to a crew member and optional job site.
 */
export function checkOutTool(
  tool: ToolAsset,
  params: {
    crewId: string;
    crewName: string;
    jobId?: string | null;
    jobLabel?: string | null;
    notes?: string | null;
    checkedOutAt?: string;
  }
): ToolAsset {
  return {
    ...tool,
    status: 'checked_out',
    assignedCrewId: params.crewId,
    assignedCrewName: params.crewName,
    assignedJobId: params.jobId ?? null,
    assignedJobLabel: params.jobLabel ?? null,
    checkedOutAt: params.checkedOutAt || new Date().toISOString(),
    notes: params.notes !== undefined ? params.notes : tool.notes,
  };
}

/**
 * Returns a tool to the available pool.
 */
export function checkInTool(
  tool: ToolAsset,
  params?: {
    condition?: 'available' | 'in_maintenance' | 'lost_damaged';
    notes?: string | null;
  }
): ToolAsset {
  return {
    ...tool,
    status: params?.condition || 'available',
    assignedCrewId: null,
    assignedCrewName: null,
    assignedJobId: null,
    assignedJobLabel: null,
    checkedOutAt: null,
    notes: params?.notes !== undefined ? params?.notes : tool.notes,
  };
}

/**
 * Audits a vehicle's maintenance status against current mileage and inspection dates.
 */
export function auditVehicleMaintenance(
  vehicle: FleetVehicle,
  today: string = new Date().toISOString().split('T')[0]
): VehicleMaintenanceAudit {
  let milesUntilService: number | null = null;
  let isServiceOverdue = false;
  let isServiceDueSoon = false;

  if (vehicle.nextServiceDueMileage && vehicle.currentMileage) {
    milesUntilService = vehicle.nextServiceDueMileage - vehicle.currentMileage;
    if (milesUntilService <= 0) {
      isServiceOverdue = true;
    } else if (milesUntilService <= 500) {
      isServiceDueSoon = true;
    }
  }

  const isInspectionExpired = Boolean(
    vehicle.inspectionExpiresAt && vehicle.inspectionExpiresAt < today
  );
  const isInsuranceExpired = Boolean(
    vehicle.insuranceExpiresAt && vehicle.insuranceExpiresAt < today
  );

  let statusTone: 'success' | 'warn' | 'danger' = 'success';
  let summaryAlert: string | null = null;

  if (isInspectionExpired) {
    statusTone = 'danger';
    summaryAlert = `State inspection expired on ${vehicle.inspectionExpiresAt}`;
  } else if (isInsuranceExpired) {
    statusTone = 'danger';
    summaryAlert = `Vehicle insurance expired on ${vehicle.insuranceExpiresAt}`;
  } else if (isServiceOverdue) {
    statusTone = 'danger';
    summaryAlert = `Routine service overdue by ${Math.abs(milesUntilService!)} miles`;
  } else if (isServiceDueSoon) {
    statusTone = 'warn';
    summaryAlert = `Service due in ${milesUntilService} miles`;
  }

  return {
    isServiceOverdue,
    isServiceDueSoon,
    isInspectionExpired,
    isInsuranceExpired,
    milesUntilService,
    statusTone,
    summaryAlert,
  };
}

/**
 * Scans stock items and compiles purchase order replenishment requirements.
 */
export function auditLowStockItems(items: VanStockItem[]): LowStockAuditResult {
  const lowStockItems = items.filter(
    (item) => item.quantityOnHand <= item.minThreshold
  );

  const estimatedRestockCost = lowStockItems.reduce((sum, item) => {
    const needed = Math.max(item.reorderQty, item.minThreshold - item.quantityOnHand);
    return sum + needed * item.unitCost;
  }, 0);

  return {
    totalItems: items.length,
    lowStockCount: lowStockItems.length,
    lowStockItems,
    estimatedRestockCost,
    formattedRestockCost: formatUsdExact(estimatedRestockCost),
  };
}

/**
 * Maps tool status into user-facing labels and tones.
 */
export function describeToolStatus(status: ToolAssetStatus): {
  label: string;
  tone: 'success' | 'warn' | 'neutral' | 'danger';
} {
  switch (status) {
    case 'available':
      return { label: 'Available in Shop', tone: 'success' };
    case 'checked_out':
      return { label: 'Checked Out', tone: 'warn' };
    case 'in_maintenance':
      return { label: 'In Maintenance / Repair', tone: 'danger' };
    case 'lost_damaged':
      return { label: 'Lost / Damaged', tone: 'danger' };
  }
}

/**
 * Maps vehicle operational status into labels and tones.
 */
export function describeVehicleStatus(status: VehicleStatus): {
  label: string;
  tone: 'success' | 'warn' | 'neutral';
} {
  switch (status) {
    case 'active':
      return { label: 'On the Road', tone: 'success' };
    case 'in_shop':
      return { label: 'In Shop / Service', tone: 'warn' };
    case 'retired':
      return { label: 'Retired', tone: 'neutral' };
  }
}

// ── Tax Guidance & Depreciation Engine ───────────────────────────────────────

export type TaxScheduleInfo = {
  schedule: DepreciationSchedule;
  title: string;
  badge: string;
  shortTip: string;
  fullTip: string;
  bestFor: string;
};

export const TAX_GUIDANCE_SCHEDULES: Record<DepreciationSchedule, TaxScheduleInfo> = {
  section_179: {
    schedule: 'section_179',
    title: 'IRS Section 179 (100% Year 1 Expense)',
    badge: 'Sec 179',
    shortTip: 'Immediate 100% tax write-off in year placed in service.',
    fullTip:
      'IRS Section 179 permits businesses to deduct up to 100% of the cost of qualifying tools, equipment, and commercial vehicles (>6,000 lbs GVWR) up to $1,220,000 in Year 1 instead of capitalizing over multi-year schedules.',
    bestFor: 'Major tools & commercial work vans/trucks placed in service this tax year.',
  },
  de_minimis: {
    schedule: 'de_minimis',
    title: 'De Minimis Safe Harbor (Expense Immediately)',
    badge: 'De Minimis',
    shortTip: 'Immediate write-off for items under $2,500 without capitalizing.',
    fullTip:
      'IRS Tangible Property Regulations allow trade businesses to expense tangible property costing under $2,500 per item or invoice immediately in the year purchased, bypassing depreciation schedules altogether.',
    bestFor: 'Hand tools, meters, manifold gauges, and accessories under $2,500.',
  },
  macrs_5: {
    schedule: 'macrs_5',
    title: 'MACRS 5-Year (Standard Declining Balance)',
    badge: 'MACRS 5-Yr',
    shortTip: 'IRS standard 5-year recovery for fleet vehicles & diagnostics.',
    fullTip:
      'IRS standard MACRS 5-year class (200% declining balance switching to straight line with half-year convention: 20%, 32%, 19.2%, 11.52%, 11.52%, 5.76%). The primary recovery class for service trucks, cargo vans under 14k lbs, and computers.',
    bestFor: 'Commercial fleet vehicles, service vans, diagnostic test gear.',
  },
  macrs_7: {
    schedule: 'macrs_7',
    title: 'MACRS 7-Year (General Equipment & Machinery)',
    badge: 'MACRS 7-Yr',
    shortTip: 'IRS standard 7-year cost recovery for shop equipment & machinery.',
    fullTip:
      'IRS standard MACRS 7-year class (14.29%, 24.49%, 17.49%, 12.49%, 8.93%, 8.92%, 8.93%, 4.46%). Standard class for equipment, machinery, and shop fixtures not explicitly categorized as 5-year property.',
    bestFor: 'Heavy shop equipment, trailer jetters, hydraulic pipe benders.',
  },
  straight_line_3: {
    schedule: 'straight_line_3',
    title: 'Straight-Line 3-Year (High-Wear Tools)',
    badge: 'SL 3-Yr',
    shortTip: '33.3% even depreciation per year over 36 months.',
    fullTip:
      'Spreads depreciation evenly over 36 months (33.3% per year). Ideal for rugged field tools subjected to heavy wear, sewer snakes, and battery tool sets with relatively short useful lifespans.',
    bestFor: 'Cordless power tools, portable drain snakes, sewer cameras.',
  },
  straight_line_5: {
    schedule: 'straight_line_5',
    title: 'Straight-Line 5-Year (Uniform Accounting)',
    badge: 'SL 5-Yr',
    shortTip: '20% even depreciation per year over 60 months.',
    fullTip:
      'Uniform 20% annual depreciation over 60 months. Conservative accounting method providing predictable balance sheet net book values and audit-ready depreciation tables.',
    bestFor: 'Tool trailers, workshop machinery, and general capital equipment.',
  },
  none: {
    schedule: 'none',
    title: 'No Depreciation (Hold at Cost Basis)',
    badge: 'Held at Cost',
    shortTip: 'Asset retains full acquisition cost basis without depreciation.',
    fullTip:
      'Asset is carried on the books at historic purchase price and is not depreciated.',
    bestFor: 'Customer-owned assets, loaner equipment, or non-depreciable items.',
  },
};

export const COMMERCIAL_VEHICLE_TAX_TIP =
  'Commercial Vehicle GVWR Advantage: Work trucks and cargo vans with a Gross Vehicle Weight Rating (GVWR) over 6,000 lbs (such as Ford F-250, Transit 250/350, Chevy 2500, Ram 2500) are exempt from passenger automobile Section 280F luxury depreciation caps, qualifying for full Section 179 immediate expensing.';

export type AssetDepreciationResult = {
  originalCost: number;
  currentBookValue: number;
  accumulatedDepreciation: number;
  percentDepreciated: number;
  statusText: string;
  scheduleBadge: string;
  scheduleTitle: string;
};

/**
 * Calculates current tax book value and accumulated depreciation for an asset.
 */
export function calculateAssetDepreciation(
  purchasePrice?: number | null,
  purchaseDate?: string | null,
  schedule?: DepreciationSchedule | null,
  asOfDate: Date = new Date()
): AssetDepreciationResult {
  const cost = Math.max(0, Number(purchasePrice) || 0);
  const selectedSchedule = schedule || (cost > 0 && cost < 2500 ? 'de_minimis' : cost > 0 ? 'macrs_5' : 'none');
  const info = TAX_GUIDANCE_SCHEDULES[selectedSchedule] || TAX_GUIDANCE_SCHEDULES.none;

  if (cost === 0) {
    return {
      originalCost: 0,
      currentBookValue: 0,
      accumulatedDepreciation: 0,
      percentDepreciated: 0,
      statusText: 'No cost basis entered',
      scheduleBadge: info.badge,
      scheduleTitle: info.title,
    };
  }

  if (selectedSchedule === 'none') {
    return {
      originalCost: cost,
      currentBookValue: cost,
      accumulatedDepreciation: 0,
      percentDepreciated: 0,
      statusText: 'Held at cost ($' + cost.toLocaleString() + ')',
      scheduleBadge: info.badge,
      scheduleTitle: info.title,
    };
  }

  // Parse purchase date or default to current date
  const pDate = purchaseDate ? new Date(purchaseDate) : new Date();
  const validDate = isNaN(pDate.getTime()) ? new Date() : pDate;

  // Calculate approximate months elapsed
  const monthsElapsed = Math.max(
    0,
    (asOfDate.getFullYear() - validDate.getFullYear()) * 12 +
      (asOfDate.getMonth() - validDate.getMonth())
  );

  if (selectedSchedule === 'section_179' || selectedSchedule === 'de_minimis') {
    return {
      originalCost: cost,
      currentBookValue: 0,
      accumulatedDepreciation: cost,
      percentDepreciated: 100,
      statusText: selectedSchedule === 'section_179' ? '100% Expensed (Sec 179)' : '100% Written Off (Safe Harbor)',
      scheduleBadge: info.badge,
      scheduleTitle: info.title,
    };
  }

  if (selectedSchedule === 'straight_line_3') {
    const fraction = Math.min(1, monthsElapsed / 36);
    const accum = Math.round(cost * fraction);
    const book = Math.max(0, cost - accum);
    const pct = Math.round(fraction * 100);
    const yearNum = Math.min(3, Math.floor(monthsElapsed / 12) + 1);
    return {
      originalCost: cost,
      currentBookValue: book,
      accumulatedDepreciation: accum,
      percentDepreciated: pct,
      statusText: pct >= 100 ? 'Fully Depreciated (3 Yrs)' : `${pct}% Depreciated (Yr ${yearNum} of 3)`,
      scheduleBadge: info.badge,
      scheduleTitle: info.title,
    };
  }

  if (selectedSchedule === 'straight_line_5') {
    const fraction = Math.min(1, monthsElapsed / 60);
    const accum = Math.round(cost * fraction);
    const book = Math.max(0, cost - accum);
    const pct = Math.round(fraction * 100);
    const yearNum = Math.min(5, Math.floor(monthsElapsed / 12) + 1);
    return {
      originalCost: cost,
      currentBookValue: book,
      accumulatedDepreciation: accum,
      percentDepreciated: pct,
      statusText: pct >= 100 ? 'Fully Depreciated (5 Yrs)' : `${pct}% Depreciated (Yr ${yearNum} of 5)`,
      scheduleBadge: info.badge,
      scheduleTitle: info.title,
    };
  }

  if (selectedSchedule === 'macrs_5') {
    // Half-year convention rates: Yr 1: 20%, Yr 2: 32%, Yr 3: 19.2%, Yr 4: 11.52%, Yr 5: 11.52%, Yr 6: 5.76%
    const rates = [0.20, 0.32, 0.192, 0.1152, 0.1152, 0.0576];
    const yearsElapsed = Math.max(0, asOfDate.getFullYear() - validDate.getFullYear());
    const sumRate = rates.slice(0, Math.min(rates.length, yearsElapsed + 1)).reduce((a, b) => a + b, 0);
    const fraction = Math.min(1, sumRate);
    const accum = Math.round(cost * fraction);
    const book = Math.max(0, cost - accum);
    const pct = Math.round(fraction * 100);
    return {
      originalCost: cost,
      currentBookValue: book,
      accumulatedDepreciation: accum,
      percentDepreciated: pct,
      statusText: pct >= 100 ? 'Fully Depreciated (MACRS 5)' : `${pct}% Depreciated (Yr ${Math.min(6, yearsElapsed + 1)}/5)`,
      scheduleBadge: info.badge,
      scheduleTitle: info.title,
    };
  }

  if (selectedSchedule === 'macrs_7') {
    // 7-year rates: Yr 1: 14.29%, Yr 2: 24.49%, Yr 3: 17.49%, Yr 4: 12.49%, Yr 5: 8.93%, Yr 6: 8.92%, Yr 7: 8.93%, Yr 8: 4.46%
    const rates = [0.1429, 0.2449, 0.1749, 0.1249, 0.0893, 0.0892, 0.0893, 0.0446];
    const yearsElapsed = Math.max(0, asOfDate.getFullYear() - validDate.getFullYear());
    const sumRate = rates.slice(0, Math.min(rates.length, yearsElapsed + 1)).reduce((a, b) => a + b, 0);
    const fraction = Math.min(1, sumRate);
    const accum = Math.round(cost * fraction);
    const book = Math.max(0, cost - accum);
    const pct = Math.round(fraction * 100);
    return {
      originalCost: cost,
      currentBookValue: book,
      accumulatedDepreciation: accum,
      percentDepreciated: pct,
      statusText: pct >= 100 ? 'Fully Depreciated (MACRS 7)' : `${pct}% Depreciated (Yr ${Math.min(8, yearsElapsed + 1)}/7)`,
      scheduleBadge: info.badge,
      scheduleTitle: info.title,
    };
  }

  return {
    originalCost: cost,
    currentBookValue: cost,
    accumulatedDepreciation: 0,
    percentDepreciated: 0,
    statusText: 'Active',
    scheduleBadge: info.badge,
    scheduleTitle: info.title,
  };
}
