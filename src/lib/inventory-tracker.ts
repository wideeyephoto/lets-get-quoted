import { formatUsdExact } from '@/lib/money-format';

export type ToolAssetStatus = 'available' | 'checked_out' | 'in_maintenance' | 'lost_damaged';
export type VehicleStatus = 'active' | 'in_shop' | 'retired';

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
  status: ToolAssetStatus;
  assignedCrewId?: string | null;
  assignedCrewName?: string | null;
  assignedJobId?: string | null;
  assignedJobLabel?: string | null;
  checkedOutAt?: string | null;
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
