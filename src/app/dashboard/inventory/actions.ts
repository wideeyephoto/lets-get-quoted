'use server';

import { requireOfficeContextAny } from '@/lib/auth';
import type {
  ToolAsset,
  FleetVehicle,
  VanStockItem,
  MaintenanceRecord,
  InventoryLocation,
  StockTransfer,
  InventoryPayload,
  ToolAssetStatus,
} from '@/lib/inventory-tracker';
import {
  loadInventoryData,
  saveTool,
  deleteTool,
  saveVehicle,
  deleteVehicle,
  saveStockItem,
  deleteStockItem,
  adjustStockQuantity,
  transferStock,
  saveMaintenanceRecord,
  saveLocation,
  deleteLocation,
  checkOutToolDb,
  checkInToolDb,
  updateVehicleMileage,
  seedInitialInventory,
  applyVanKitTemplate,
} from '@/lib/inventory-db';
import { uploadToolPhoto } from '@/lib/tool-photo-storage';

// ── In-Memory Rate Limiting ─────────────────────────────────────────────────
const searchRateLimits = new Map<string, number[]>();

export function checkSearchRateLimit(identifier: string, maxReqs = 30, windowMs = 60000): void {
  const now = Date.now();
  const timestamps = searchRateLimits.get(identifier) || [];
  const valid = timestamps.filter(t => now - t < windowMs);
  if (valid.length >= maxReqs) {
    throw new Error('Search catalog rate limit exceeded. Please wait a moment before searching again.');
  }
  valid.push(now);
  searchRateLimits.set(identifier, valid);

  if (searchRateLimits.size > 1000) {
    for (const [k, v] of searchRateLimits.entries()) {
      if (v.every(t => now - t >= windowMs)) {
        searchRateLimits.delete(k);
      }
    }
  }
}

// ── Validation Helpers ──────────────────────────────────────────────────────
function sanitizeString(val: unknown, maxLen = 255): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

function sanitizeNumber(val: unknown, min = 0, fallback = 0): number {
  const n = Number(val);
  if (isNaN(n)) return fallback;
  return Math.max(min, n);
}

// ── Server Actions ──────────────────────────────────────────────────────────

export async function fetchInventoryDataAction(): Promise<InventoryPayload> {
  const { supabase, accountId } = await requireOfficeContextAny('inventory.read', 'jobs.read');
  return loadInventoryData(supabase, accountId);
}

export async function seedStarterInventoryAction(): Promise<InventoryPayload> {
  const { supabase, accountId } = await requireOfficeContextAny('inventory.write', 'jobs.write');
  return seedInitialInventory(supabase, accountId);
}

export async function saveToolAction(
  tool: Partial<ToolAsset> & { name?: string; brand?: string; category?: string; assetTag?: string },
): Promise<ToolAsset> {
  const { supabase, accountId } = await requireOfficeContextAny('inventory.write', 'jobs.write');
  const sanitized = {
    ...tool,
    name: sanitizeString(tool.name, 150),
    brand: sanitizeString(tool.brand, 100),
    category: sanitizeString(tool.category, 100),
    assetTag: sanitizeString(tool.assetTag, 50),
    serialNumber: tool.serialNumber ? sanitizeString(tool.serialNumber, 100) : null,
    modelNumber: tool.modelNumber ? sanitizeString(tool.modelNumber, 100) : null,
    purchasePrice: tool.purchasePrice !== undefined && tool.purchasePrice !== null ? sanitizeNumber(tool.purchasePrice, 0) : null,
    purchaseDate: tool.purchaseDate ? sanitizeString(tool.purchaseDate, 20) : null,
    imageUrl: tool.imageUrl ? sanitizeString(tool.imageUrl, 1000) : null,
    notes: tool.notes ? sanitizeString(tool.notes, 2000) : null,
    expectedReturnDate: tool.expectedReturnDate ? sanitizeString(tool.expectedReturnDate, 20) : null,
  };
  return saveTool(supabase, accountId, sanitized);
}

export async function deleteToolAction(toolId: string): Promise<void> {
  const { supabase, accountId } = await requireOfficeContextAny('inventory.write', 'jobs.write');
  if (!toolId) throw new Error('Tool ID is required');
  return deleteTool(supabase, accountId, sanitizeString(toolId, 100));
}

export async function checkOutToolAction(params: {
  toolId: string;
  crewId?: string | null;
  crewName: string;
  jobId?: string | null;
  jobLabel?: string | null;
  notes?: string | null;
  expectedReturnDate?: string | null;
}): Promise<ToolAsset> {
  const { supabase, accountId, userEmail } = await requireOfficeContextAny('inventory.custody', 'inventory.write', 'jobs.write');
  if (!params.toolId) throw new Error('Tool ID is required');
  if (!params.crewName?.trim()) throw new Error('Crew assignment is required');

  return checkOutToolDb(supabase, accountId, {
    toolId: sanitizeString(params.toolId, 100),
    crewId: params.crewId ? sanitizeString(params.crewId, 100) : null,
    crewName: sanitizeString(params.crewName, 100),
    jobId: params.jobId ? sanitizeString(params.jobId, 100) : null,
    jobLabel: params.jobLabel ? sanitizeString(params.jobLabel, 150) : null,
    notes: params.notes ? sanitizeString(params.notes, 1000) : null,
    expectedReturnDate: params.expectedReturnDate ? sanitizeString(params.expectedReturnDate, 20) : null,
    performedBy: userEmail || 'Office Staff',
  });
}

export async function bulkCheckOutToolsAction(params: {
  toolIds: string[];
  crewId?: string | null;
  crewName: string;
  jobId?: string | null;
  jobLabel?: string | null;
  notes?: string | null;
  expectedReturnDate?: string | null;
}): Promise<ToolAsset[]> {
  const { supabase, accountId, userEmail } = await requireOfficeContextAny('inventory.custody', 'inventory.write', 'jobs.write');
  if (!params.toolIds || params.toolIds.length === 0) throw new Error('No tools selected');
  if (!params.crewName?.trim()) throw new Error('Crew assignment is required');

  const results: ToolAsset[] = [];
  for (const toolId of params.toolIds) {
    const checked = await checkOutToolDb(supabase, accountId, {
      toolId: sanitizeString(toolId, 100),
      crewId: params.crewId ? sanitizeString(params.crewId, 100) : null,
      crewName: sanitizeString(params.crewName, 100),
      jobId: params.jobId ? sanitizeString(params.jobId, 100) : null,
      jobLabel: params.jobLabel ? sanitizeString(params.jobLabel, 150) : null,
      notes: params.notes ? sanitizeString(params.notes, 1000) : null,
      expectedReturnDate: params.expectedReturnDate ? sanitizeString(params.expectedReturnDate, 20) : null,
      performedBy: userEmail || 'Office Staff',
    });
    results.push(checked);
  }
  return results;
}

export async function checkInToolAction(params: {
  toolId: string;
  condition?: ToolAssetStatus;
  notes?: string | null;
}): Promise<ToolAsset> {
  const { supabase, accountId, userEmail } = await requireOfficeContextAny('inventory.custody', 'inventory.write', 'jobs.write');
  if (!params.toolId) throw new Error('Tool ID is required');

  return checkInToolDb(supabase, accountId, {
    toolId: sanitizeString(params.toolId, 100),
    condition: params.condition,
    notes: params.notes ? sanitizeString(params.notes, 1000) : null,
    performedBy: userEmail || 'Office Staff',
  });
}

export async function saveVehicleAction(
  vehicle: Partial<FleetVehicle> & { name?: string; make?: string; model?: string; year?: number; licensePlate?: string },
): Promise<FleetVehicle> {
  const { supabase, accountId } = await requireOfficeContextAny('inventory.write', 'jobs.write');
  const sanitized = {
    ...vehicle,
    name: sanitizeString(vehicle.name, 150),
    make: sanitizeString(vehicle.make, 100),
    model: sanitizeString(vehicle.model, 100),
    year: vehicle.year ? sanitizeNumber(vehicle.year, 1900, new Date().getFullYear()) : undefined,
    licensePlate: sanitizeString(vehicle.licensePlate, 20).toUpperCase(),
    vin: vehicle.vin ? sanitizeString(vehicle.vin, 50).toUpperCase() : null,
    currentMileage: vehicle.currentMileage !== undefined ? sanitizeNumber(vehicle.currentMileage, 0) : undefined,
    purchasePrice: vehicle.purchasePrice !== undefined && vehicle.purchasePrice !== null ? sanitizeNumber(vehicle.purchasePrice, 0) : null,
    purchaseDate: vehicle.purchaseDate ? sanitizeString(vehicle.purchaseDate, 20) : null,
    primaryDriverId: vehicle.primaryDriverId ? sanitizeString(vehicle.primaryDriverId, 100) : null,
    primaryDriverName: vehicle.primaryDriverName ? sanitizeString(vehicle.primaryDriverName, 100) : null,
    notes: vehicle.notes ? sanitizeString(vehicle.notes, 2000) : null,
    inspectionExpiresAt: vehicle.inspectionExpiresAt ? sanitizeString(vehicle.inspectionExpiresAt, 20) : null,
    insuranceExpiresAt: vehicle.insuranceExpiresAt ? sanitizeString(vehicle.insuranceExpiresAt, 20) : null,
  };
  return saveVehicle(supabase, accountId, sanitized);
}

export async function deleteVehicleAction(vehicleId: string): Promise<void> {
  const { supabase, accountId } = await requireOfficeContextAny('inventory.write', 'jobs.write');
  if (!vehicleId) throw new Error('Vehicle ID is required');
  return deleteVehicle(supabase, accountId, sanitizeString(vehicleId, 100));
}

export async function updateVehicleMileageAction(params: {
  vehicleId: string;
  currentMileage: number;
}): Promise<FleetVehicle> {
  const { supabase, accountId } = await requireOfficeContextAny('inventory.custody', 'inventory.write', 'jobs.write');
  if (!params.vehicleId) throw new Error('Vehicle ID is required');
  return updateVehicleMileage(
    supabase,
    accountId,
    sanitizeString(params.vehicleId, 100),
    sanitizeNumber(params.currentMileage, 0),
  );
}

export async function saveStockItemAction(
  stock: Partial<VanStockItem> & { name: string; sku: string; category: string; location: string },
): Promise<VanStockItem> {
  const { supabase, accountId } = await requireOfficeContextAny('inventory.write', 'jobs.write');
  const sanitized = {
    ...stock,
    name: sanitizeString(stock.name, 150),
    sku: sanitizeString(stock.sku, 50).toUpperCase(),
    category: sanitizeString(stock.category, 100),
    location: sanitizeString(stock.location, 100),
    locationId: stock.locationId ? sanitizeString(stock.locationId, 100) : null,
    quantityOnHand: sanitizeNumber(stock.quantityOnHand, 0),
    minThreshold: sanitizeNumber(stock.minThreshold, 0),
    reorderQty: sanitizeNumber(stock.reorderQty, 0),
    unitCost: sanitizeNumber(stock.unitCost, 0),
    unit: sanitizeString(stock.unit || 'ea', 20),
    preferredSupplier: sanitizeString(stock.preferredSupplier || '', 100),
    notes: stock.notes ? sanitizeString(stock.notes, 1000) : null,
  };
  return saveStockItem(supabase, accountId, sanitized);
}

export async function deleteStockItemAction(stockId: string): Promise<void> {
  const { supabase, accountId } = await requireOfficeContextAny('inventory.write', 'jobs.write');
  if (!stockId) throw new Error('Stock ID is required');
  return deleteStockItem(supabase, accountId, sanitizeString(stockId, 100));
}

export async function adjustStockQuantityAction(params: {
  stockId: string;
  delta: number;
  reason?: string;
}): Promise<VanStockItem> {
  const { supabase, accountId } = await requireOfficeContextAny('inventory.custody', 'inventory.write', 'jobs.write');
  if (!params.stockId) throw new Error('Stock ID is required');
  const delta = Number(params.delta) || 0;
  return adjustStockQuantity(
    supabase,
    accountId,
    sanitizeString(params.stockId, 100),
    delta,
    params.reason ? sanitizeString(params.reason, 255) : undefined,
  );
}

export async function transferStockAction(input: {
  stockId: string;
  fromLocation: string;
  toLocation: string;
  quantity: number;
  notes?: string;
}): Promise<{ transfer: StockTransfer; sourceStock: VanStockItem; destinationStock?: VanStockItem }> {
  const { supabase, accountId, userEmail } = await requireOfficeContextAny('inventory.custody', 'inventory.write', 'jobs.write');
  if (!input.stockId) throw new Error('Stock ID is required');
  const qty = sanitizeNumber(input.quantity, 1, 1);

  return transferStock(supabase, accountId, {
    stockId: sanitizeString(input.stockId, 100),
    fromLocation: sanitizeString(input.fromLocation, 100),
    toLocation: sanitizeString(input.toLocation, 100),
    quantity: qty,
    performedBy: userEmail || 'Office Staff',
    notes: input.notes ? sanitizeString(input.notes, 500) : undefined,
  });
}

export async function applyVanKitTemplateAction(params: {
  templateId: string;
  targetLocation: string;
}): Promise<VanStockItem[]> {
  const { supabase, accountId } = await requireOfficeContextAny('inventory.write', 'jobs.write');
  if (!params.templateId) throw new Error('Template ID is required');
  if (!params.targetLocation?.trim()) throw new Error('Target location is required');

  return applyVanKitTemplate(
    supabase,
    accountId,
    sanitizeString(params.templateId, 100),
    sanitizeString(params.targetLocation, 100),
  );
}

export async function saveMaintenanceRecordAction(
  record: Partial<MaintenanceRecord> & {
    assetType: 'tool' | 'vehicle';
    assetId: string;
    assetName: string;
    serviceType: string;
    cost: number;
    performedBy: string;
    performedAt: string;
  },
): Promise<MaintenanceRecord> {
  const { supabase, accountId } = await requireOfficeContextAny('inventory.custody', 'inventory.write', 'jobs.write');
  const sanitized = {
    ...record,
    assetType: record.assetType === 'vehicle' ? ('vehicle' as const) : ('tool' as const),
    assetId: sanitizeString(record.assetId, 100),
    assetName: sanitizeString(record.assetName, 150),
    serviceType: sanitizeString(record.serviceType, 100),
    cost: sanitizeNumber(record.cost, 0),
    performedBy: sanitizeString(record.performedBy, 100),
    performedAt: sanitizeString(record.performedAt, 50),
    mileageAtService: record.mileageAtService !== undefined && record.mileageAtService !== null ? sanitizeNumber(record.mileageAtService, 0) : null,
    nextDueAt: record.nextDueAt ? sanitizeString(record.nextDueAt, 50) : null,
    notes: record.notes ? sanitizeString(record.notes, 1000) : null,
  };
  return saveMaintenanceRecord(supabase, accountId, sanitized);
}

export async function saveLocationAction(
  location: Partial<InventoryLocation> & { name: string; type: InventoryLocation['type'] },
): Promise<InventoryLocation> {
  const { supabase, accountId } = await requireOfficeContextAny('inventory.write', 'jobs.write');
  const sanitized = {
    ...location,
    name: sanitizeString(location.name, 150),
    type: location.type,
    code: location.code ? sanitizeString(location.code, 50) : null,
    address: location.address ? sanitizeString(location.address, 255) : null,
    isActive: location.isActive !== undefined ? Boolean(location.isActive) : true,
  };
  return saveLocation(supabase, accountId, sanitized);
}

export async function deleteLocationAction(locationId: string): Promise<void> {
  const { supabase, accountId } = await requireOfficeContextAny('inventory.write', 'jobs.write');
  if (!locationId) throw new Error('Location ID is required');
  return deleteLocation(supabase, accountId, sanitizeString(locationId, 100));
}

export async function uploadToolPhotoAction(formData: FormData): Promise<{ url: string }> {
  const { accountId } = await requireOfficeContextAny('inventory.write', 'jobs.write');
  const file = formData.get('photo');
  const toolId = sanitizeString(formData.get('toolId') || 'new', 100);
  if (!file || !(file instanceof File)) {
    throw new Error('No valid photo file was provided.');
  }
  const url = await uploadToolPhoto(accountId, toolId, file);
  return { url };
}

export async function autofillToolFromStoreAction(url: string) {
  await requireOfficeContextAny('inventory.read', 'jobs.read');
  const { parseStoreProductUrl } = await import('@/lib/store-autofill');
  return parseStoreProductUrl(sanitizeString(url, 1000));
}

export async function searchStoreCatalogAction(query: string) {
  const { accountId } = await requireOfficeContextAny('inventory.read', 'jobs.read');
  checkSearchRateLimit(accountId, 30, 60000);
  const { searchStoreCatalog } = await import('@/lib/store-autofill');
  return searchStoreCatalog(sanitizeString(query, 100));
}

