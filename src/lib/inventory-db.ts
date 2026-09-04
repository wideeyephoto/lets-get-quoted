import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ToolAsset,
  FleetVehicle,
  VanStockItem,
  MaintenanceRecord,
  InventoryLocation,
  StockTransfer,
  InventoryPayload,
  DepreciationSchedule,
} from '@/lib/inventory-tracker';
import {
  DEFAULT_TOOLS,
  DEFAULT_VEHICLES,
  DEFAULT_VAN_STOCK,
  DEFAULT_MAINTENANCE,
} from '@/lib/inventory-data';

/**
 * Resiliently encodes tax depreciation metadata into the notes field so the feature
 * works seamlessly across both mock environments and databases without schema mismatch.
 */
function encodeTaxMeta(
  notes: string | null | undefined,
  meta: {
    depreciationSchedule?: DepreciationSchedule | null;
    purchasePrice?: number | null;
    purchaseDate?: string | null;
    imageUrl?: string | null;
  }
): string | null {
  const cleanNotes = (notes || '').replace(/<!--TAX_META:.*?-->/g, '').trim();
  const hasMeta = Boolean(
    meta.depreciationSchedule ||
      (meta.purchasePrice !== undefined && meta.purchasePrice !== null) ||
      meta.purchaseDate ||
      meta.imageUrl
  );
  if (!hasMeta) return cleanNotes || null;
  const metaStr = `<!--TAX_META:${JSON.stringify(meta)}-->`;
  return cleanNotes ? `${cleanNotes}\n${metaStr}` : metaStr;
}

function decodeTaxMeta(notes: string | null | undefined): {
  cleanNotes: string | null;
  meta: {
    depreciationSchedule?: DepreciationSchedule | null;
    purchasePrice?: number | null;
    purchaseDate?: string | null;
    imageUrl?: string | null;
  };
} {
  if (!notes) return { cleanNotes: null, meta: {} };
  const match = notes.match(/<!--TAX_META:(.*?)-->/);
  if (!match) return { cleanNotes: notes, meta: {} };
  try {
    const meta = JSON.parse(match[1]);
    const cleanNotes = notes.replace(/<!--TAX_META:.*?-->/g, '').trim() || null;
    return { cleanNotes, meta };
  } catch {
    return { cleanNotes: notes, meta: {} };
  }
}

export const DEFAULT_LOCATIONS: InventoryLocation[] = [
  {
    id: 'loc-1',
    name: 'Main Shop & Warehouse',
    type: 'warehouse',
    code: 'SHOP-01',
    address: 'Central Shop Bay',
    isActive: true,
  },
  {
    id: 'loc-2',
    name: 'Van #1 (Lead Tech)',
    type: 'vehicle',
    code: 'VAN-01',
    address: 'Mobile Fleet Unit',
    isActive: true,
  },
  {
    id: 'loc-3',
    name: 'Van #2 (Install Crew)',
    type: 'vehicle',
    code: 'VAN-02',
    address: 'Mobile Fleet Unit',
    isActive: true,
  },
  {
    id: 'loc-4',
    name: 'Secured Storage Cage #1',
    type: 'cage',
    code: 'CAGE-01',
    address: 'Shop Bay 2 Cage',
    isActive: true,
  },
];

/**
 * Loads all inventory entities for an account. If no inventory records exist yet,
 * it safely seeds initial multi-location starter records so the user has an immediate,
 * persistent workspace.
 */
export async function loadInventoryData(
  supabase: SupabaseClient,
  accountId: string,
): Promise<InventoryPayload> {
  const [
    locRes,
    toolsRes,
    vehRes,
    stockRes,
    transferRes,
    maintRes,
  ] = await Promise.all([
    supabase.from('inventory_locations').select('*').eq('account_id', accountId).order('created_at', { ascending: true }),
    supabase.from('inventory_tools').select('*').eq('account_id', accountId).order('created_at', { ascending: true }),
    supabase.from('inventory_vehicles').select('*').eq('account_id', accountId).order('created_at', { ascending: true }),
    supabase.from('inventory_stock_items').select('*').eq('account_id', accountId).order('created_at', { ascending: true }),
    supabase.from('inventory_stock_transfers').select('*').eq('account_id', accountId).order('created_at', { ascending: false }).limit(50),
    supabase.from('inventory_maintenance_records').select('*').eq('account_id', accountId).order('performed_at', { ascending: false }),
  ]);

  const rawLocations = locRes.data ?? [];
  const rawTools = toolsRes.data ?? [];
  const rawVehicles = vehRes.data ?? [];
  const rawStock = stockRes.data ?? [];
  const rawTransfers = transferRes.data ?? [];
  const rawMaintenance = maintRes.data ?? [];

  // Check if we need to seed starter inventory data
  const isEmpty =
    rawLocations.length === 0 &&
    rawTools.length === 0 &&
    rawVehicles.length === 0 &&
    rawStock.length === 0;

  if (isEmpty) {
    return await seedInitialInventory(supabase, accountId);
  }

  return {
    locations: rawLocations.map(mapLocationRow),
    tools: rawTools.map(mapToolRow),
    vehicles: rawVehicles.map(mapVehicleRow),
    stock: rawStock.map(mapStockRow),
    transfers: rawTransfers.map(mapTransferRow),
    maintenance: rawMaintenance.map(mapMaintenanceRow),
  };
}

/**
 * Seeds default multi-location inventory records for an account.
 */
export async function seedInitialInventory(
  supabase: SupabaseClient,
  accountId: string,
): Promise<InventoryPayload> {
  const locationInserts = DEFAULT_LOCATIONS.map((loc) => ({
    account_id: accountId,
    name: loc.name,
    type: loc.type,
    code: loc.code,
    address: loc.address,
    is_active: loc.isActive,
  }));

  const { data: insertedLocations } = await supabase
    .from('inventory_locations')
    .insert(locationInserts)
    .select();

  const toolInserts = DEFAULT_TOOLS.map((t) => ({
    account_id: accountId,
    name: t.name,
    category: t.category,
    brand: t.brand,
    model_number: t.modelNumber ?? null,
    serial_number: t.serialNumber ?? null,
    asset_tag: t.assetTag,
    purchase_price: t.purchasePrice ?? null,
    purchase_date: t.purchaseDate ?? null,
    status: t.status,
    location_name: t.status === 'available' ? 'Main Shop & Warehouse' : 'Van #1 (Lead Tech)',
    assigned_crew_name: t.assignedCrewName ?? null,
    assigned_job_label: t.assignedJobLabel ?? null,
    checked_out_at: t.checkedOutAt ?? null,
    notes: encodeTaxMeta(t.notes, {
      depreciationSchedule: t.depreciationSchedule,
      purchasePrice: t.purchasePrice,
      purchaseDate: t.purchaseDate,
      imageUrl: t.imageUrl,
    }),
  }));

  const { data: insertedTools } = await supabase
    .from('inventory_tools')
    .insert(toolInserts)
    .select();

  const vehicleInserts = DEFAULT_VEHICLES.map((v) => ({
    account_id: accountId,
    name: v.name,
    make: v.make,
    model: v.model,
    year: v.year,
    license_plate: v.licensePlate,
    vin: v.vin ?? null,
    current_mileage: v.currentMileage,
    primary_driver_name: v.primaryDriverName ?? null,
    status: v.status,
    last_service_date: v.lastServiceDate ?? null,
    last_service_mileage: v.lastServiceMileage ?? null,
    next_service_due_mileage: v.nextServiceDueMileage ?? null,
    inspection_expires_at: v.inspectionExpiresAt ?? null,
    insurance_expires_at: v.insuranceExpiresAt ?? null,
    notes: encodeTaxMeta(v.notes, {
      depreciationSchedule: v.depreciationSchedule,
      purchasePrice: v.purchasePrice,
      purchaseDate: v.purchaseDate,
    }),
  }));

  const { data: insertedVehicles } = await supabase
    .from('inventory_vehicles')
    .insert(vehicleInserts)
    .select();

  const stockInserts = DEFAULT_VAN_STOCK.map((s) => ({
    account_id: accountId,
    name: s.name,
    sku: s.sku,
    category: s.category,
    quantity_on_hand: s.quantityOnHand,
    min_threshold: s.minThreshold,
    unit: s.unit,
    unit_cost: s.unitCost,
    preferred_supplier: s.preferredSupplier,
    reorder_qty: s.reorderQty,
    location_name: s.location,
  }));

  const { data: insertedStock } = await supabase
    .from('inventory_stock_items')
    .insert(stockInserts)
    .select();

  const maintInserts = DEFAULT_MAINTENANCE.map((m) => ({
    account_id: accountId,
    asset_type: m.assetType,
    asset_id: m.assetId,
    asset_name: m.assetName,
    service_type: m.serviceType,
    cost: m.cost,
    performed_by: m.performedBy,
    performed_at: m.performedAt,
    next_due_at: m.nextDueAt ?? null,
    mileage_at_service: m.mileageAtService ?? null,
    notes: m.notes ?? null,
  }));

  const { data: insertedMaintenance } = await supabase
    .from('inventory_maintenance_records')
    .insert(maintInserts)
    .select();

  return {
    locations: (insertedLocations ?? []).map(mapLocationRow),
    tools: (insertedTools ?? []).map(mapToolRow),
    vehicles: (insertedVehicles ?? []).map(mapVehicleRow),
    stock: (insertedStock ?? []).map(mapStockRow),
    transfers: [],
    maintenance: (insertedMaintenance ?? []).map(mapMaintenanceRow),
  };
}

/**
 * Save (create or update) a tool asset.
 */
export async function saveTool(
  supabase: SupabaseClient,
  accountId: string,
  tool: Partial<ToolAsset> & { name: string; brand: string; category: string; assetTag: string },
): Promise<ToolAsset> {
  const payload = {
    account_id: accountId,
    name: tool.name.trim(),
    brand: tool.brand.trim(),
    category: tool.category.trim(),
    asset_tag: tool.assetTag.trim(),
    model_number: tool.modelNumber?.trim() || null,
    serial_number: tool.serialNumber?.trim() || null,
    purchase_price: tool.purchasePrice !== undefined && tool.purchasePrice !== null ? Number(tool.purchasePrice) : null,
    purchase_date: tool.purchaseDate || null,
    status: tool.status || 'available',
    location_id: tool.locationId || null,
    location_name: tool.locationName || null,
    assigned_crew_id: tool.assignedCrewId || null,
    assigned_crew_name: tool.assignedCrewName || null,
    assigned_job_id: tool.assignedJobId || null,
    assigned_job_label: tool.assignedJobLabel || null,
    checked_out_at: tool.checkedOutAt || null,
    notes: encodeTaxMeta(tool.notes, {
      depreciationSchedule: tool.depreciationSchedule,
      purchasePrice: tool.purchasePrice,
      purchaseDate: tool.purchaseDate,
      imageUrl: tool.imageUrl,
    }),
    updated_at: new Date().toISOString(),
  };

  if (tool.id && !tool.id.startsWith('temp-') && !tool.id.startsWith('tool-')) {
    const { data, error } = await supabase
      .from('inventory_tools')
      .update(payload)
      .eq('id', tool.id)
      .eq('account_id', accountId)
      .select()
      .single();
    if (error) throw error;
    return mapToolRow(data);
  } else {
    const { data, error } = await supabase
      .from('inventory_tools')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return mapToolRow(data);
  }
}

/**
 * Delete a tool asset.
 */
export async function deleteTool(
  supabase: SupabaseClient,
  accountId: string,
  toolId: string,
): Promise<void> {
  const { error } = await supabase
    .from('inventory_tools')
    .delete()
    .eq('id', toolId)
    .eq('account_id', accountId);
  if (error) throw error;
}

/**
 * Save (create or update) a fleet vehicle.
 */
export async function saveVehicle(
  supabase: SupabaseClient,
  accountId: string,
  vehicle: Partial<FleetVehicle> & { name: string; make: string; model: string; year: number; licensePlate: string },
): Promise<FleetVehicle> {
  const payload = {
    account_id: accountId,
    name: vehicle.name.trim(),
    make: vehicle.make.trim(),
    model: vehicle.model.trim(),
    year: Number(vehicle.year),
    license_plate: vehicle.licensePlate.trim().toUpperCase(),
    vin: vehicle.vin?.trim() || null,
    current_mileage: Number(vehicle.currentMileage) || 0,
    primary_driver_id: vehicle.primaryDriverId || null,
    primary_driver_name: vehicle.primaryDriverName?.trim() || null,
    status: vehicle.status || 'active',
    last_service_date: vehicle.lastServiceDate || null,
    last_service_mileage: vehicle.lastServiceMileage ? Number(vehicle.lastServiceMileage) : null,
    next_service_due_mileage: vehicle.nextServiceDueMileage ? Number(vehicle.nextServiceDueMileage) : null,
    inspection_expires_at: vehicle.inspectionExpiresAt || null,
    insurance_expires_at: vehicle.insuranceExpiresAt || null,
    notes: encodeTaxMeta(vehicle.notes, {
      depreciationSchedule: vehicle.depreciationSchedule,
      purchasePrice: vehicle.purchasePrice,
      purchaseDate: vehicle.purchaseDate,
    }),
    updated_at: new Date().toISOString(),
  };

  if (vehicle.id && !vehicle.id.startsWith('temp-') && !vehicle.id.startsWith('veh-')) {
    const { data, error } = await supabase
      .from('inventory_vehicles')
      .update(payload)
      .eq('id', vehicle.id)
      .eq('account_id', accountId)
      .select()
      .single();
    if (error) throw error;
    return mapVehicleRow(data);
  } else {
    const { data, error } = await supabase
      .from('inventory_vehicles')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return mapVehicleRow(data);
  }
}

/**
 * Delete a fleet vehicle.
 */
export async function deleteVehicle(
  supabase: SupabaseClient,
  accountId: string,
  vehicleId: string,
): Promise<void> {
  const { error } = await supabase
    .from('inventory_vehicles')
    .delete()
    .eq('id', vehicleId)
    .eq('account_id', accountId);
  if (error) throw error;
}

/**
 * Save (create or update) a stock item.
 */
export async function saveStockItem(
  supabase: SupabaseClient,
  accountId: string,
  stock: Partial<VanStockItem> & { name: string; sku: string; category: string; location: string },
): Promise<VanStockItem> {
  const payload = {
    account_id: accountId,
    name: stock.name.trim(),
    sku: stock.sku.trim().toUpperCase(),
    category: stock.category.trim(),
    location_name: stock.location.trim(),
    location_id: stock.locationId || null,
    quantity_on_hand: Number(stock.quantityOnHand) || 0,
    min_threshold: Number(stock.minThreshold) || 0,
    unit: stock.unit?.trim() || 'ea',
    unit_cost: Number(stock.unitCost) || 0,
    preferred_supplier: stock.preferredSupplier?.trim() || '',
    reorder_qty: Number(stock.reorderQty) || 0,
    notes: stock.notes?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  if (stock.id && !stock.id.startsWith('temp-') && !stock.id.startsWith('stock-')) {
    const { data, error } = await supabase
      .from('inventory_stock_items')
      .update(payload)
      .eq('id', stock.id)
      .eq('account_id', accountId)
      .select()
      .single();
    if (error) throw error;
    return mapStockRow(data);
  } else {
    const { data, error } = await supabase
      .from('inventory_stock_items')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return mapStockRow(data);
  }
}

/**
 * Delete a stock item.
 */
export async function deleteStockItem(
  supabase: SupabaseClient,
  accountId: string,
  stockId: string,
): Promise<void> {
  const { error } = await supabase
    .from('inventory_stock_items')
    .delete()
    .eq('id', stockId)
    .eq('account_id', accountId);
  if (error) throw error;
}

/**
 * Adjusts quantity for a stock item.
 */
export async function adjustStockQuantity(
  supabase: SupabaseClient,
  accountId: string,
  stockId: string,
  delta: number,
  _reason?: string,
): Promise<VanStockItem> {
  const { data: item, error: fetchErr } = await supabase
    .from('inventory_stock_items')
    .select('*')
    .eq('id', stockId)
    .eq('account_id', accountId)
    .single();
  if (fetchErr || !item) throw new Error('Stock item not found');

  const newQty = Math.max(0, Number(item.quantity_on_hand) + delta);
  const { data: updated, error: updateErr } = await supabase
    .from('inventory_stock_items')
    .update({ quantity_on_hand: newQty, updated_at: new Date().toISOString() })
    .eq('id', stockId)
    .eq('account_id', accountId)
    .select()
    .single();
  if (updateErr) throw updateErr;
  return mapStockRow(updated);
}

/**
 * Transfers stock between locations. Deducts from source and either adds to
 * destination item with matching SKU & location, or logs the movement.
 */
export async function transferStock(
  supabase: SupabaseClient,
  accountId: string,
  input: {
    stockId: string;
    fromLocation: string;
    toLocation: string;
    quantity: number;
    performedBy?: string;
    notes?: string;
  },
): Promise<{ transfer: StockTransfer; sourceStock: VanStockItem }> {
  const { data: item, error: fetchErr } = await supabase
    .from('inventory_stock_items')
    .select('*')
    .eq('id', input.stockId)
    .eq('account_id', accountId)
    .single();
  if (fetchErr || !item) throw new Error('Source stock item not found');

  if (Number(item.quantity_on_hand) < input.quantity) {
    throw new Error(`Insufficient stock available for transfer. On hand: ${item.quantity_on_hand}, Requested: ${input.quantity}`);
  }

  // Deduct from source
  const newQty = Math.max(0, Number(item.quantity_on_hand) - input.quantity);
  const { data: updatedSource, error: updateErr } = await supabase
    .from('inventory_stock_items')
    .update({ quantity_on_hand: newQty, updated_at: new Date().toISOString() })
    .eq('id', input.stockId)
    .eq('account_id', accountId)
    .select()
    .single();
  if (updateErr) throw updateErr;

  // Check if destination location already has an item with this SKU
  const { data: destItem } = await supabase
    .from('inventory_stock_items')
    .select('*')
    .eq('account_id', accountId)
    .eq('sku', item.sku)
    .eq('location_name', input.toLocation)
    .maybeSingle();

  if (destItem) {
    await supabase
      .from('inventory_stock_items')
      .update({
        quantity_on_hand: Number(destItem.quantity_on_hand) + input.quantity,
        updated_at: new Date().toISOString(),
      })
      .eq('id', destItem.id)
      .eq('account_id', accountId);
  } else {
    // Create stock item entry at new location
    await supabase
      .from('inventory_stock_items')
      .insert({
        account_id: accountId,
        name: item.name,
        sku: item.sku,
        category: item.category,
        location_name: input.toLocation,
        quantity_on_hand: input.quantity,
        min_threshold: item.min_threshold,
        unit: item.unit,
        unit_cost: item.unit_cost,
        preferred_supplier: item.preferred_supplier,
        reorder_qty: item.reorder_qty,
        notes: `Transferred from ${input.fromLocation}`,
      });
  }

  // Record transfer log
  const { data: transferRecord, error: transferErr } = await supabase
    .from('inventory_stock_transfers')
    .insert({
      account_id: accountId,
      item_id: input.stockId,
      item_name: item.name,
      from_location: input.fromLocation,
      to_location: input.toLocation,
      quantity: input.quantity,
      performed_by: input.performedBy || null,
      notes: input.notes || null,
    })
    .select()
    .single();
  if (transferErr) throw transferErr;

  return {
    transfer: mapTransferRow(transferRecord),
    sourceStock: mapStockRow(updatedSource),
  };
}

/**
 * Save maintenance record.
 */
export async function saveMaintenanceRecord(
  supabase: SupabaseClient,
  accountId: string,
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
  const payload = {
    account_id: accountId,
    asset_type: record.assetType,
    asset_id: record.assetId,
    asset_name: record.assetName.trim(),
    service_type: record.serviceType.trim(),
    cost: Number(record.cost) || 0,
    performed_by: record.performedBy.trim(),
    performed_at: record.performedAt,
    next_due_at: record.nextDueAt || null,
    mileage_at_service: record.mileageAtService ? Number(record.mileageAtService) : null,
    notes: record.notes?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('inventory_maintenance_records')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;

  // If this was a vehicle service, update vehicle's last_service_date and last_service_mileage
  if (record.assetType === 'vehicle') {
    await supabase
      .from('inventory_vehicles')
      .update({
        last_service_date: record.performedAt,
        last_service_mileage: record.mileageAtService ? Number(record.mileageAtService) : undefined,
      })
      .eq('id', record.assetId)
      .eq('account_id', accountId);
  }

  return mapMaintenanceRow(data);
}

/**
 * Save inventory location.
 */
export async function saveLocation(
  supabase: SupabaseClient,
  accountId: string,
  loc: Partial<InventoryLocation> & { name: string; type: InventoryLocation['type'] },
): Promise<InventoryLocation> {
  const payload = {
    account_id: accountId,
    name: loc.name.trim(),
    type: loc.type,
    code: loc.code?.trim() || null,
    address: loc.address?.trim() || null,
    is_active: loc.isActive !== undefined ? loc.isActive : true,
    updated_at: new Date().toISOString(),
  };

  if (loc.id && !loc.id.startsWith('temp-') && !loc.id.startsWith('loc-')) {
    const { data, error } = await supabase
      .from('inventory_locations')
      .update(payload)
      .eq('id', loc.id)
      .eq('account_id', accountId)
      .select()
      .single();
    if (error) throw error;
    return mapLocationRow(data);
  } else {
    const { data, error } = await supabase
      .from('inventory_locations')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return mapLocationRow(data);
  }
}

/**
 * Delete inventory location.
 */
export async function deleteLocation(
  supabase: SupabaseClient,
  accountId: string,
  locationId: string,
): Promise<void> {
  const { error } = await supabase
    .from('inventory_locations')
    .delete()
    .eq('id', locationId)
    .eq('account_id', accountId);
  if (error) throw error;
}

// ── Row Mappers ─────────────────────────────────────────────────────────────

function mapLocationRow(row: Record<string, unknown>): InventoryLocation {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    type: (row.type as InventoryLocation['type']) ?? 'warehouse',
    code: row.code ? String(row.code) : null,
    address: row.address ? String(row.address) : null,
    isActive: Boolean(row.is_active ?? true),
  };
}

function mapToolRow(row: Record<string, unknown>): ToolAsset {
  const rawNotes = row.notes ? String(row.notes) : null;
  const { cleanNotes, meta } = decodeTaxMeta(rawNotes);
  const tag = String(row.asset_tag ?? '');
  const sn = row.serial_number ? String(row.serial_number) : null;
  const nm = String(row.name ?? '');
  const fallback = DEFAULT_TOOLS.find(
    (dt) => (tag && dt.assetTag === tag) || (sn && dt.serialNumber === sn) || (nm && dt.name === nm)
  );

  const purchasePrice =
    row.purchase_price !== null && row.purchase_price !== undefined
      ? Number(row.purchase_price)
      : (meta.purchasePrice ?? fallback?.purchasePrice ?? null);

  const purchaseDate =
    row.purchase_date ? String(row.purchase_date) : (meta.purchaseDate ?? fallback?.purchaseDate ?? null);

  const depreciationSchedule =
    (row.depreciation_schedule as DepreciationSchedule) ||
    meta.depreciationSchedule ||
    fallback?.depreciationSchedule ||
    (purchasePrice ? (purchasePrice < 2500 ? 'de_minimis' : 'section_179') : null);

  const imageUrl =
    (row.image_url ? String(row.image_url) : null) ||
    meta.imageUrl ||
    fallback?.imageUrl ||
    null;

  return {
    id: String(row.id),
    name: nm,
    category: String(row.category ?? ''),
    brand: String(row.brand ?? ''),
    modelNumber: row.model_number ? String(row.model_number) : null,
    serialNumber: sn,
    assetTag: tag,
    purchasePrice,
    purchaseDate,
    depreciationSchedule,
    imageUrl,
    status: (row.status as ToolAsset['status']) ?? 'available',
    locationId: row.location_id ? String(row.location_id) : null,
    locationName: row.location_name ? String(row.location_name) : null,
    assignedCrewId: row.assigned_crew_id ? String(row.assigned_crew_id) : null,
    assignedCrewName: row.assigned_crew_name ? String(row.assigned_crew_name) : null,
    assignedJobId: row.assigned_job_id ? String(row.assigned_job_id) : null,
    assignedJobLabel: row.assigned_job_label ? String(row.assigned_job_label) : null,
    checkedOutAt: row.checked_out_at ? String(row.checked_out_at) : null,
    notes: cleanNotes,
  };
}

function mapVehicleRow(row: Record<string, unknown>): FleetVehicle {
  const rawNotes = row.notes ? String(row.notes) : null;
  const { cleanNotes, meta } = decodeTaxMeta(rawNotes);
  const plate = String(row.license_plate ?? '');
  const vin = row.vin ? String(row.vin) : null;
  const nm = String(row.name ?? '');
  const fallback = DEFAULT_VEHICLES.find(
    (dv) => (plate && dv.licensePlate === plate) || (vin && dv.vin === vin) || (nm && dv.name === nm)
  );

  const purchasePrice =
    row.purchase_price !== null && row.purchase_price !== undefined
      ? Number(row.purchase_price)
      : (meta.purchasePrice ?? fallback?.purchasePrice ?? null);

  const purchaseDate =
    row.purchase_date ? String(row.purchase_date) : (meta.purchaseDate ?? fallback?.purchaseDate ?? null);

  const depreciationSchedule =
    (row.depreciation_schedule as DepreciationSchedule) ||
    meta.depreciationSchedule ||
    fallback?.depreciationSchedule ||
    (purchasePrice ? 'section_179' : null);

  return {
    id: String(row.id),
    name: nm,
    make: String(row.make ?? ''),
    model: String(row.model ?? ''),
    year: Number(row.year ?? new Date().getFullYear()),
    licensePlate: plate,
    vin,
    currentMileage: Number(row.current_mileage ?? 0),
    purchasePrice,
    purchaseDate,
    depreciationSchedule,
    primaryDriverId: row.primary_driver_id ? String(row.primary_driver_id) : null,
    primaryDriverName: row.primary_driver_name ? String(row.primary_driver_name) : null,
    status: (row.status as FleetVehicle['status']) ?? 'active',
    lastServiceDate: row.last_service_date ? String(row.last_service_date) : null,
    lastServiceMileage:
      row.last_service_mileage !== null && row.last_service_mileage !== undefined
        ? Number(row.last_service_mileage)
        : null,
    nextServiceDueMileage:
      row.next_service_due_mileage !== null && row.next_service_due_mileage !== undefined
        ? Number(row.next_service_due_mileage)
        : null,
    inspectionExpiresAt: row.inspection_expires_at ? String(row.inspection_expires_at) : null,
    insuranceExpiresAt: row.insurance_expires_at ? String(row.insurance_expires_at) : null,
    notes: cleanNotes,
  };
}

function mapStockRow(row: Record<string, unknown>): VanStockItem {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    sku: String(row.sku ?? ''),
    category: String(row.category ?? ''),
    quantityOnHand: Number(row.quantity_on_hand ?? 0),
    minThreshold: Number(row.min_threshold ?? 0),
    unit: String(row.unit ?? 'ea'),
    unitCost: Number(row.unit_cost ?? 0),
    preferredSupplier: String(row.preferred_supplier ?? ''),
    reorderQty: Number(row.reorder_qty ?? 0),
    location: String(row.location_name ?? 'Main Shop'),
    locationId: row.location_id ? String(row.location_id) : null,
    notes: row.notes ? String(row.notes) : null,
  };
}

function mapTransferRow(row: Record<string, unknown>): StockTransfer {
  return {
    id: String(row.id),
    itemId: String(row.item_id),
    itemName: String(row.item_name ?? ''),
    fromLocation: String(row.from_location ?? ''),
    toLocation: String(row.to_location ?? ''),
    quantity: Number(row.quantity ?? 0),
    performedBy: row.performed_by ? String(row.performed_by) : null,
    notes: row.notes ? String(row.notes) : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function mapMaintenanceRow(row: Record<string, unknown>): MaintenanceRecord {
  return {
    id: String(row.id),
    assetType: (row.asset_type as MaintenanceRecord['assetType']) ?? 'tool',
    assetId: String(row.asset_id ?? ''),
    assetName: String(row.asset_name ?? ''),
    serviceType: String(row.service_type ?? ''),
    cost: Number(row.cost ?? 0),
    performedBy: String(row.performed_by ?? ''),
    performedAt: String(row.performed_at ?? ''),
    nextDueAt: row.next_due_at ? String(row.next_due_at) : null,
    mileageAtService: row.mileage_at_service !== null && row.mileage_at_service !== undefined ? Number(row.mileage_at_service) : null,
    notes: row.notes ? String(row.notes) : null,
  };
}
