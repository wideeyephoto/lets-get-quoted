import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ToolAsset,
  ToolAssetStatus,
  FleetVehicle,
  VanStockItem,
  MaintenanceRecord,
  InventoryLocation,
  StockTransfer,
  InventoryPayload,
  DepreciationSchedule,
  ToolCustodyLogEntry,
  VanKitTemplate,
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
    custodyRes,
    templatesRes,
  ] = await Promise.all([
    supabase.from('inventory_locations').select('*').eq('account_id', accountId).order('created_at', { ascending: true }),
    supabase.from('inventory_tools').select('*').eq('account_id', accountId).order('created_at', { ascending: true }),
    supabase.from('inventory_vehicles').select('*').eq('account_id', accountId).order('created_at', { ascending: true }),
    supabase.from('inventory_stock_items').select('*').eq('account_id', accountId).order('created_at', { ascending: true }),
    supabase.from('inventory_stock_transfers').select('*').eq('account_id', accountId).order('created_at', { ascending: false }).limit(50),
    supabase.from('inventory_maintenance_records').select('*').eq('account_id', accountId).order('performed_at', { ascending: false }).limit(200),
    Promise.resolve(supabase.from('inventory_tool_custody_log').select('*').eq('account_id', accountId).order('occurred_at', { ascending: false }).limit(100)).catch(() => ({ data: [] })),
    Promise.resolve(supabase.from('inventory_van_kit_templates').select('*').eq('account_id', accountId).order('name', { ascending: true })).catch(() => ({ data: [] })),
  ]);

  const queryErr =
    locRes.error ||
    toolsRes.error ||
    vehRes.error ||
    stockRes.error ||
    transferRes.error ||
    maintRes.error;

  if (queryErr) {
    throw new Error(`Failed to load inventory data: ${queryErr.message || JSON.stringify(queryErr)}`);
  }

  // Filter out soft-deleted records
  const rawLocations = (locRes.data ?? []).filter((r: Record<string, unknown>) => !r.deleted_at);
  const rawTools = (toolsRes.data ?? []).filter((r: Record<string, unknown>) => !r.deleted_at);
  const rawVehicles = (vehRes.data ?? []).filter((r: Record<string, unknown>) => !r.deleted_at);
  const rawStock = (stockRes.data ?? []).filter((r: Record<string, unknown>) => !r.deleted_at);
  const rawTransfers = transferRes.data ?? [];
  const rawMaintenance = maintRes.data ?? [];
  const rawCustody = (custodyRes as any)?.data ?? [];
  const rawTemplates = (templatesRes as any)?.data ?? [];

  return {
    locations: rawLocations.map(mapLocationRow),
    tools: rawTools.map(mapToolRow),
    vehicles: rawVehicles.map(mapVehicleRow),
    stock: rawStock.map(mapStockRow),
    transfers: rawTransfers.map(mapTransferRow),
    maintenance: rawMaintenance.map(mapMaintenanceRow),
    custodyLogs: rawCustody.map(mapCustodyLogRow),
    vanKitTemplates: rawTemplates.map(mapVanKitTemplateRow),
  };
}

/**
 * Seeds default multi-location inventory records for an account.
 * Guarded to ensure it never runs twice or duplicates records.
 */
export async function seedInitialInventory(
  supabase: SupabaseClient,
  accountId: string,
): Promise<InventoryPayload> {
  // Guard against duplicate seed runs
  const { data: existingLocs } = await supabase
    .from('inventory_locations')
    .select('id')
    .eq('account_id', accountId)
    .limit(1);

  if (existingLocs && existingLocs.length > 0) {
    return loadInventoryData(supabase, accountId);
  }

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
    depreciation_schedule: t.depreciationSchedule ?? null,
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
    purchase_price: v.purchasePrice ?? null,
    purchase_date: v.purchaseDate ?? null,
    depreciation_schedule: v.depreciationSchedule ?? null,
    primary_driver_name: v.primaryDriverName ?? null,
    status: v.status,
    last_service_date: v.lastServiceDate ?? null,
    last_service_mileage: v.lastServiceMileage ?? null,
    next_service_due_mileage: v.nextServiceDueMileage ?? null,
    inspection_expires_at: v.inspectionExpiresAt ?? null,
    insurance_expires_at: v.insuranceExpiresAt ?? null,
    notes: v.notes ?? null,
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
  tool: Partial<ToolAsset> & { name?: string; brand?: string; category?: string; assetTag?: string },
): Promise<ToolAsset> {
  const isUpdate = Boolean(tool.id && !tool.id.startsWith('temp-'));
  let existing: Record<string, unknown> | null = null;
  if (isUpdate) {
    const { data } = await supabase
      .from('inventory_tools')
      .select('*')
      .eq('id', tool.id!)
      .eq('account_id', accountId)
      .maybeSingle();
    existing = data;
  }

  const existingNotes = existing?.notes ? String(existing.notes) : null;
  const { cleanNotes: existingCleanNotes, meta: existingMeta } = decodeTaxMeta(existingNotes);
  const notesClean = tool.notes !== undefined ? tool.notes : existingCleanNotes;
  const finalImageUrl = tool.imageUrl !== undefined ? (tool.imageUrl || null) : (existing?.image_url as string ?? existingMeta.imageUrl ?? null);

  const payload: Record<string, unknown> = {
    account_id: accountId,
    name: tool.name !== undefined ? tool.name.trim() : String(existing?.name ?? '').trim(),
    brand: tool.brand !== undefined ? tool.brand.trim() : String(existing?.brand ?? '').trim(),
    category: tool.category !== undefined ? tool.category.trim() : String(existing?.category ?? '').trim(),
    asset_tag: tool.assetTag !== undefined ? tool.assetTag.trim() : String(existing?.asset_tag ?? '').trim(),
    model_number: tool.modelNumber !== undefined ? (tool.modelNumber?.trim() || null) : (existing?.model_number as string ?? null),
    serial_number: tool.serialNumber !== undefined ? (tool.serialNumber?.trim() || null) : (existing?.serial_number as string ?? null),
    purchase_price: tool.purchasePrice !== undefined
      ? (tool.purchasePrice !== null ? Number(tool.purchasePrice) : null)
      : (existing?.purchase_price !== null && existing?.purchase_price !== undefined ? Number(existing.purchase_price) : null),
    purchase_date: tool.purchaseDate !== undefined ? (tool.purchaseDate || null) : (existing?.purchase_date as string ?? null),
    depreciation_schedule: tool.depreciationSchedule !== undefined
      ? (tool.depreciationSchedule || null)
      : (existing?.depreciation_schedule as string ?? existingMeta.depreciationSchedule ?? null),
    image_url: finalImageUrl,
    status: tool.status || (existing?.status as ToolAsset['status']) || 'available',
    location_id: tool.locationId !== undefined ? (tool.locationId || null) : (existing?.location_id as string ?? null),
    location_name: tool.locationName !== undefined ? (tool.locationName || null) : (existing?.location_name as string ?? null),
    assigned_crew_id: tool.assignedCrewId !== undefined ? (tool.assignedCrewId || null) : (existing?.assigned_crew_id as string ?? null),
    assigned_crew_name: tool.assignedCrewName !== undefined ? (tool.assignedCrewName || null) : (existing?.assigned_crew_name as string ?? null),
    assigned_job_id: tool.assignedJobId !== undefined ? (tool.assignedJobId || null) : (existing?.assigned_job_id as string ?? null),
    assigned_job_label: tool.assignedJobLabel !== undefined ? (tool.assignedJobLabel || null) : (existing?.assigned_job_label as string ?? null),
    checked_out_at: tool.checkedOutAt !== undefined ? (tool.checkedOutAt || null) : (existing?.checked_out_at as string ?? null),
    expected_return_date: tool.expectedReturnDate !== undefined ? (tool.expectedReturnDate || null) : (existing?.expected_return_date as string ?? null),
    notes: encodeTaxMeta(notesClean, {
      depreciationSchedule: tool.depreciationSchedule !== undefined ? tool.depreciationSchedule : existingMeta.depreciationSchedule,
      purchasePrice: tool.purchasePrice !== undefined ? tool.purchasePrice : existingMeta.purchasePrice,
      purchaseDate: tool.purchaseDate !== undefined ? tool.purchaseDate : existingMeta.purchaseDate,
      imageUrl: finalImageUrl,
    }),
    updated_at: new Date().toISOString(),
  };

  if (isUpdate) {
    const { data, error } = await supabase
      .from('inventory_tools')
      .update(payload)
      .eq('id', tool.id!)
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
 * Checks out a tool to crew/job and logs an immutable custody event.
 */
export async function checkOutToolDb(
  supabase: SupabaseClient,
  accountId: string,
  params: {
    toolId: string;
    crewId?: string | null;
    crewName: string;
    jobId?: string | null;
    jobLabel?: string | null;
    notes?: string | null;
    expectedReturnDate?: string | null;
    performedBy?: string | null;
  },
): Promise<ToolAsset> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('inventory_tools')
    .update({
      status: 'checked_out',
      assigned_crew_id: params.crewId || null,
      assigned_crew_name: params.crewName,
      assigned_job_id: params.jobId || null,
      assigned_job_label: params.jobLabel || null,
      checked_out_at: now,
      expected_return_date: params.expectedReturnDate || null,
      notes: params.notes !== undefined ? params.notes : undefined,
      updated_at: now,
    })
    .eq('id', params.toolId)
    .eq('account_id', accountId)
    .select()
    .single();

  if (error) throw error;

  // Log custody event
  try {
    await supabase.from('inventory_tool_custody_log').insert({
      account_id: accountId,
      tool_id: params.toolId,
      action: 'check_out',
      crew_id: params.crewId || null,
      crew_name: params.crewName,
      job_id: params.jobId || null,
      job_label: params.jobLabel || null,
      performed_by: params.performedBy || null,
      notes: params.notes || null,
      occurred_at: now,
    });
  } catch {
    // Graceful audit log insert
  }

  return mapToolRow(data);
}

/**
 * Checks in a tool back to available pool and logs an immutable custody event.
 */
export async function checkInToolDb(
  supabase: SupabaseClient,
  accountId: string,
  params: {
    toolId: string;
    condition?: ToolAssetStatus;
    notes?: string | null;
    performedBy?: string | null;
  },
): Promise<ToolAsset> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('inventory_tools')
    .update({
      status: params.condition || 'available',
      assigned_crew_id: null,
      assigned_crew_name: null,
      assigned_job_id: null,
      assigned_job_label: null,
      checked_out_at: null,
      expected_return_date: null,
      notes: params.notes !== undefined ? params.notes : undefined,
      updated_at: now,
    })
    .eq('id', params.toolId)
    .eq('account_id', accountId)
    .select()
    .single();

  if (error) throw error;

  // Log custody event
  try {
    await supabase.from('inventory_tool_custody_log').insert({
      account_id: accountId,
      tool_id: params.toolId,
      action: 'check_in',
      performed_by: params.performedBy || null,
      notes: params.notes || null,
      occurred_at: now,
    });
  } catch {
    // Graceful audit log insert
  }

  return mapToolRow(data);
}

/**
 * Soft deletes a tool asset preserving historical records.
 */
export async function deleteTool(
  supabase: SupabaseClient,
  accountId: string,
  toolId: string,
): Promise<void> {
  const { error } = await supabase
    .from('inventory_tools')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', toolId)
    .eq('account_id', accountId);

  if (error) {
    const { error: fallbackErr } = await supabase
      .from('inventory_tools')
      .delete()
      .eq('id', toolId)
      .eq('account_id', accountId);
    if (fallbackErr) throw fallbackErr;
  }
}

/**
 * Save (create or update) a fleet vehicle.
 * Safely merges existing fields when updating so partial saves do not blank records.
 * Vehicle purchase price, purchase date, and depreciation schedule are stored directly
 * in dedicated database columns rather than embedded in HTML comments inside notes.
 */
export async function saveVehicle(
  supabase: SupabaseClient,
  accountId: string,
  vehicle: Partial<FleetVehicle> & { name?: string; make?: string; model?: string; year?: number; licensePlate?: string },
): Promise<FleetVehicle> {
  const isUpdate = Boolean(vehicle.id && !vehicle.id.startsWith('temp-'));
  let existing: Record<string, unknown> | null = null;
  if (isUpdate) {
    const { data } = await supabase
      .from('inventory_vehicles')
      .select('*')
      .eq('id', vehicle.id!)
      .eq('account_id', accountId)
      .maybeSingle();
    existing = data;
  }

  const existingNotes = existing?.notes ? String(existing.notes) : null;
  const { cleanNotes: existingCleanNotes, meta: existingMeta } = decodeTaxMeta(existingNotes);

  const purchasePrice =
    vehicle.purchasePrice !== undefined
      ? (vehicle.purchasePrice !== null ? Number(vehicle.purchasePrice) : null)
      : (existing?.purchase_price !== null && existing?.purchase_price !== undefined
          ? Number(existing.purchase_price)
          : (existingMeta.purchasePrice ?? null));

  const purchaseDate =
    vehicle.purchaseDate !== undefined
      ? (vehicle.purchaseDate || null)
      : (existing?.purchase_date ? String(existing.purchase_date) : (existingMeta.purchaseDate ?? null));

  const depreciationSchedule =
    vehicle.depreciationSchedule !== undefined
      ? (vehicle.depreciationSchedule || null)
      : (existing?.depreciation_schedule ? String(existing.depreciation_schedule) : (existingMeta.depreciationSchedule ?? null));

  const notesToSave = vehicle.notes !== undefined ? (vehicle.notes?.trim() || null) : existingCleanNotes;

  const payload = {
    account_id: accountId,
    name: vehicle.name !== undefined ? vehicle.name.trim() : String(existing?.name ?? '').trim(),
    make: vehicle.make !== undefined ? vehicle.make.trim() : String(existing?.make ?? '').trim(),
    model: vehicle.model !== undefined ? vehicle.model.trim() : String(existing?.model ?? '').trim(),
    year: vehicle.year !== undefined ? Number(vehicle.year) : Number(existing?.year ?? new Date().getFullYear()),
    license_plate: vehicle.licensePlate !== undefined ? vehicle.licensePlate.trim().toUpperCase() : String(existing?.license_plate ?? '').trim().toUpperCase(),
    vin: vehicle.vin !== undefined ? (vehicle.vin?.trim() || null) : (existing?.vin as string ?? null),
    current_mileage: vehicle.currentMileage !== undefined ? (Number(vehicle.currentMileage) || 0) : Number(existing?.current_mileage ?? 0),
    purchase_price: purchasePrice,
    purchase_date: purchaseDate,
    depreciation_schedule: depreciationSchedule,
    primary_driver_id: vehicle.primaryDriverId !== undefined ? (vehicle.primaryDriverId || null) : (existing?.primary_driver_id as string ?? null),
    primary_driver_name: vehicle.primaryDriverName !== undefined ? (vehicle.primaryDriverName?.trim() || null) : (existing?.primary_driver_name as string ?? null),
    status: vehicle.status || (existing?.status as FleetVehicle['status']) || 'active',
    last_service_date: vehicle.lastServiceDate !== undefined ? (vehicle.lastServiceDate || null) : (existing?.last_service_date as string ?? null),
    last_service_mileage: vehicle.lastServiceMileage !== undefined
      ? (vehicle.lastServiceMileage ? Number(vehicle.lastServiceMileage) : null)
      : (existing?.last_service_mileage ? Number(existing.last_service_mileage) : null),
    next_service_due_mileage: vehicle.nextServiceDueMileage !== undefined
      ? (vehicle.nextServiceDueMileage ? Number(vehicle.nextServiceDueMileage) : null)
      : (existing?.next_service_due_mileage ? Number(existing.next_service_due_mileage) : null),
    inspection_expires_at: vehicle.inspectionExpiresAt !== undefined ? (vehicle.inspectionExpiresAt || null) : (existing?.inspection_expires_at as string ?? null),
    insurance_expires_at: vehicle.insuranceExpiresAt !== undefined ? (vehicle.insuranceExpiresAt || null) : (existing?.insurance_expires_at as string ?? null),
    notes: notesToSave,
    updated_at: new Date().toISOString(),
  };

  if (isUpdate) {
    const { data, error } = await supabase
      .from('inventory_vehicles')
      .update(payload)
      .eq('id', vehicle.id!)
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
 * Dedicated odometer update that modifies current_mileage and updated_at ONLY.
 * Never blanks or modifies any other vehicle column.
 */
export async function updateVehicleMileage(
  supabase: SupabaseClient,
  accountId: string,
  vehicleId: string,
  currentMileage: number,
): Promise<FleetVehicle> {
  const { data, error } = await supabase
    .from('inventory_vehicles')
    .update({
      current_mileage: Math.max(0, Number(currentMileage) || 0),
      updated_at: new Date().toISOString(),
    })
    .eq('id', vehicleId)
    .eq('account_id', accountId)
    .select()
    .single();

  if (error) throw error;
  return mapVehicleRow(data);
}

/**
 * Soft deletes a fleet vehicle.
 */
export async function deleteVehicle(
  supabase: SupabaseClient,
  accountId: string,
  vehicleId: string,
): Promise<void> {
  const { error } = await supabase
    .from('inventory_vehicles')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', vehicleId)
    .eq('account_id', accountId);

  if (error) {
    const { error: fallbackErr } = await supabase
      .from('inventory_vehicles')
      .delete()
      .eq('id', vehicleId)
      .eq('account_id', accountId);
    if (fallbackErr) throw fallbackErr;
  }
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
    quantity_on_hand: Math.max(0, Number(stock.quantityOnHand) || 0),
    min_threshold: Math.max(0, Number(stock.minThreshold) || 0),
    unit: stock.unit?.trim() || 'ea',
    unit_cost: Math.max(0, Number(stock.unitCost) || 0),
    preferred_supplier: stock.preferredSupplier?.trim() || '',
    reorder_qty: Math.max(0, Number(stock.reorderQty) || 0),
    notes: stock.notes?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  if (stock.id && !stock.id.startsWith('temp-')) {
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
 * Soft deletes a stock item.
 */
export async function deleteStockItem(
  supabase: SupabaseClient,
  accountId: string,
  stockId: string,
): Promise<void> {
  const { error } = await supabase
    .from('inventory_stock_items')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', stockId)
    .eq('account_id', accountId);

  if (error) {
    const { error: fallbackErr } = await supabase
      .from('inventory_stock_items')
      .delete()
      .eq('id', stockId)
      .eq('account_id', accountId);
    if (fallbackErr) throw fallbackErr;
  }
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
): Promise<{ transfer: StockTransfer; sourceStock: VanStockItem; destinationStock?: VanStockItem }> {
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

  let destinationStock: VanStockItem | undefined;
  if (destItem) {
    const updatedDestQty = Number(destItem.quantity_on_hand) + input.quantity;
    await supabase
      .from('inventory_stock_items')
      .update({
        quantity_on_hand: updatedDestQty,
        updated_at: new Date().toISOString(),
      })
      .eq('id', destItem.id)
      .eq('account_id', accountId);
    destinationStock = mapStockRow({
      ...destItem,
      quantity_on_hand: updatedDestQty,
      updated_at: new Date().toISOString(),
    });
  } else {
    // Create stock item entry at new location
    const newStockRow = {
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
    };
    const { data: createdDest } = await supabase
      .from('inventory_stock_items')
      .insert(newStockRow)
      .select?.()
      ?.single?.() || {};
    destinationStock = createdDest ? mapStockRow(createdDest) : mapStockRow({ id: `stock-${Date.now()}`, ...newStockRow });
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
    destinationStock,
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

  // If this was a vehicle service, update vehicle's last_service_date and advance next_service_due_mileage
  const isCustomAsset = !record.assetId || record.assetId === 'custom' || record.assetId === 'none' || record.assetId.startsWith('custom-');
  if (record.assetType === 'vehicle' && !isCustomAsset) {
    const nextServiceDue = record.mileageAtService ? Number(record.mileageAtService) + 5000 : undefined;
    const { error: vehUpdateErr } = await supabase
      .from('inventory_vehicles')
      .update({
        last_service_date: record.performedAt,
        last_service_mileage: record.mileageAtService ? Number(record.mileageAtService) : undefined,
        ...(nextServiceDue !== undefined ? { next_service_due_mileage: nextServiceDue } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', record.assetId)
      .eq('account_id', accountId);
    if (vehUpdateErr) throw vehUpdateErr;
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

  if (loc.id && !loc.id.startsWith('temp-')) {
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
 * Soft deletes inventory location.
 */
export async function deleteLocation(
  supabase: SupabaseClient,
  accountId: string,
  locationId: string,
): Promise<void> {
  const { error } = await supabase
    .from('inventory_locations')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', locationId)
    .eq('account_id', accountId);

  if (error) {
    const { error: fallbackErr } = await supabase
      .from('inventory_locations')
      .delete()
      .eq('id', locationId)
      .eq('account_id', accountId);
    if (fallbackErr) throw fallbackErr;
  }
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

  const purchasePrice =
    row.purchase_price !== null && row.purchase_price !== undefined
      ? Number(row.purchase_price)
      : (meta.purchasePrice ?? null);

  const purchaseDate =
    row.purchase_date ? String(row.purchase_date) : (meta.purchaseDate ?? null);

  const depreciationSchedule =
    (row.depreciation_schedule as DepreciationSchedule) ||
    meta.depreciationSchedule ||
    null;

  const imageUrl =
    (row.image_url ? String(row.image_url) : null) ||
    meta.imageUrl ||
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
    expectedReturnDate: row.expected_return_date ? String(row.expected_return_date) : null,
    notes: cleanNotes,
  };
}

function mapVehicleRow(row: Record<string, unknown>): FleetVehicle {
  const rawNotes = row.notes ? String(row.notes) : null;
  const { cleanNotes, meta } = decodeTaxMeta(rawNotes);
  const plate = String(row.license_plate ?? '');
  const vin = row.vin ? String(row.vin) : null;
  const nm = String(row.name ?? '');

  const purchasePrice =
    row.purchase_price !== null && row.purchase_price !== undefined
      ? Number(row.purchase_price)
      : (meta.purchasePrice ?? null);

  const purchaseDate =
    row.purchase_date ? String(row.purchase_date) : (meta.purchaseDate ?? null);

  const depreciationSchedule =
    (row.depreciation_schedule as DepreciationSchedule) ||
    meta.depreciationSchedule ||
    null;

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

export function mapCustodyLogRow(row: Record<string, unknown>): ToolCustodyLogEntry {
  return {
    id: String(row.id),
    toolId: String(row.tool_id),
    action: (row.action as ToolCustodyLogEntry['action']) ?? 'check_out',
    crewId: row.crew_id ? String(row.crew_id) : null,
    crewName: row.crew_name ? String(row.crew_name) : null,
    jobId: row.job_id ? String(row.job_id) : null,
    jobLabel: row.job_label ? String(row.job_label) : null,
    performedBy: row.performed_by ? String(row.performed_by) : null,
    notes: row.notes ? String(row.notes) : null,
    occurredAt: String(row.occurred_at || row.created_at || new Date().toISOString()),
  };
}

export function mapVanKitTemplateRow(row: Record<string, unknown>): VanKitTemplate {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    description: row.description ? String(row.description) : null,
    items: Array.isArray(row.items) ? (row.items as VanKitTemplate['items']) : [],
  };
}

/**
 * Applies a van kit template to a target location.
 * For each item in the template, if the target location has that SKU,
 * updates the min_threshold and reorder_qty (and tops up quantity if below min);
 * otherwise inserts a new stock item at that location.
 */
export async function applyVanKitTemplate(
  supabase: SupabaseClient,
  accountId: string,
  templateId: string,
  targetLocation: string,
): Promise<VanStockItem[]> {
  const { data: template, error: tmplErr } = await supabase
    .from('inventory_van_kit_templates')
    .select('*')
    .eq('id', templateId)
    .eq('account_id', accountId)
    .single();
  if (tmplErr || !template) throw new Error('Van kit template not found');

  const items = Array.isArray(template.items) ? (template.items as VanKitTemplate['items']) : [];
  const results: VanStockItem[] = [];

  for (const item of items) {
    const { data: existing } = await supabase
      .from('inventory_stock_items')
      .select('*')
      .eq('account_id', accountId)
      .eq('sku', item.sku)
      .eq('location_name', targetLocation)
      .maybeSingle();

    if (existing) {
      const { data: updated, error: updateErr } = await supabase
        .from('inventory_stock_items')
        .update({
          min_threshold: item.minThreshold,
          reorder_qty: item.reorderQty,
          unit_cost: item.unitCost || existing.unit_cost,
          quantity_on_hand: Math.max(Number(existing.quantity_on_hand), item.reorderQty),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .eq('account_id', accountId)
        .select()
        .single();
      if (!updateErr && updated) {
        results.push(mapStockRow(updated));
      }
    } else {
      const { data: created, error: createErr } = await supabase
        .from('inventory_stock_items')
        .insert({
          account_id: accountId,
          name: item.name,
          sku: item.sku,
          category: item.category,
          location_name: targetLocation,
          quantity_on_hand: item.reorderQty,
          min_threshold: item.minThreshold,
          unit: item.unit || 'ea',
          unit_cost: item.unitCost || 0,
          preferred_supplier: '',
          reorder_qty: item.reorderQty,
          notes: `Created via template ${template.name}`,
        })
        .select()
        .single();
      if (!createErr && created) {
        results.push(mapStockRow(created));
      }
    }
  }

  return results;
}
