'use server';

import { requireOfficeContext } from '@/lib/auth';
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
} from '@/lib/inventory-db';

export async function fetchInventoryDataAction(): Promise<InventoryPayload> {
  const { supabase, accountId } = await requireOfficeContext('jobs.read');
  return loadInventoryData(supabase, accountId);
}

export async function saveToolAction(
  tool: Partial<ToolAsset> & { name: string; brand: string; category: string; assetTag: string },
): Promise<ToolAsset> {
  const { supabase, accountId } = await requireOfficeContext('jobs.write');
  return saveTool(supabase, accountId, tool);
}

export async function deleteToolAction(toolId: string): Promise<void> {
  const { supabase, accountId } = await requireOfficeContext('jobs.write');
  return deleteTool(supabase, accountId, toolId);
}

export async function checkOutToolAction(params: {
  toolId: string;
  crewId?: string;
  crewName: string;
  jobId?: string;
  jobLabel?: string;
  notes?: string;
}): Promise<ToolAsset> {
  const { supabase, accountId } = await requireOfficeContext('jobs.write');
  return saveTool(supabase, accountId, {
    id: params.toolId,
    status: 'checked_out',
    name: '',
    brand: '',
    category: '',
    assetTag: '',
    assignedCrewId: params.crewId ?? null,
    assignedCrewName: params.crewName,
    assignedJobId: params.jobId ?? null,
    assignedJobLabel: params.jobLabel ?? null,
    checkedOutAt: new Date().toISOString(),
    notes: params.notes ?? null,
  });
}

export async function checkInToolAction(params: {
  toolId: string;
  condition?: ToolAssetStatus;
  notes?: string;
}): Promise<ToolAsset> {
  const { supabase, accountId } = await requireOfficeContext('jobs.write');
  return saveTool(supabase, accountId, {
    id: params.toolId,
    status: params.condition || 'available',
    name: '',
    brand: '',
    category: '',
    assetTag: '',
    assignedCrewId: null,
    assignedCrewName: null,
    assignedJobId: null,
    assignedJobLabel: null,
    checkedOutAt: null,
    notes: params.notes ?? null,
  });
}

export async function saveVehicleAction(
  vehicle: Partial<FleetVehicle> & { name: string; make: string; model: string; year: number; licensePlate: string },
): Promise<FleetVehicle> {
  const { supabase, accountId } = await requireOfficeContext('jobs.write');
  return saveVehicle(supabase, accountId, vehicle);
}

export async function deleteVehicleAction(vehicleId: string): Promise<void> {
  const { supabase, accountId } = await requireOfficeContext('jobs.write');
  return deleteVehicle(supabase, accountId, vehicleId);
}

export async function updateVehicleMileageAction(params: {
  vehicleId: string;
  currentMileage: number;
}): Promise<FleetVehicle> {
  const { supabase, accountId } = await requireOfficeContext('jobs.write');
  return saveVehicle(supabase, accountId, {
    id: params.vehicleId,
    name: '',
    make: '',
    model: '',
    year: 0,
    licensePlate: '',
    currentMileage: params.currentMileage,
  });
}

export async function saveStockItemAction(
  stock: Partial<VanStockItem> & { name: string; sku: string; category: string; location: string },
): Promise<VanStockItem> {
  const { supabase, accountId } = await requireOfficeContext('jobs.write');
  return saveStockItem(supabase, accountId, stock);
}

export async function deleteStockItemAction(stockId: string): Promise<void> {
  const { supabase, accountId } = await requireOfficeContext('jobs.write');
  return deleteStockItem(supabase, accountId, stockId);
}

export async function adjustStockQuantityAction(params: {
  stockId: string;
  delta: number;
  reason?: string;
}): Promise<VanStockItem> {
  const { supabase, accountId } = await requireOfficeContext('jobs.write');
  return adjustStockQuantity(supabase, accountId, params.stockId, params.delta, params.reason);
}

export async function transferStockAction(input: {
  stockId: string;
  fromLocation: string;
  toLocation: string;
  quantity: number;
  notes?: string;
}): Promise<{ transfer: StockTransfer; sourceStock: VanStockItem }> {
  const { supabase, accountId } = await requireOfficeContext('jobs.write');
  return transferStock(supabase, accountId, input);
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
  const { supabase, accountId } = await requireOfficeContext('jobs.write');
  return saveMaintenanceRecord(supabase, accountId, record);
}

export async function saveLocationAction(
  location: Partial<InventoryLocation> & { name: string; type: InventoryLocation['type'] },
): Promise<InventoryLocation> {
  const { supabase, accountId } = await requireOfficeContext('jobs.write');
  return saveLocation(supabase, accountId, location);
}

export async function deleteLocationAction(locationId: string): Promise<void> {
  const { supabase, accountId } = await requireOfficeContext('jobs.write');
  return deleteLocation(supabase, accountId, locationId);
}

export async function autofillToolFromStoreAction(url: string) {
  const { parseStoreProductUrl } = await import('@/lib/store-autofill');
  return parseStoreProductUrl(url);
}

export async function searchStoreCatalogAction(query: string) {
  const { searchStoreCatalog } = await import('@/lib/store-autofill');
  return searchStoreCatalog(query);
}

