'use client';

import { useState, useTransition } from 'react';
import {
  type ToolAsset,
  type FleetVehicle,
  type VanStockItem,
  type MaintenanceRecord,
  type InventoryLocation,
  type StockTransfer,
  type InventoryPayload,
  type ToolAssetStatus,
  type VehicleStatus,
  type InventoryLocationType,
  auditVehicleMaintenance,
  auditLowStockItems,
  describeToolStatus,
  describeVehicleStatus,
} from '@/lib/inventory-tracker';
import { formatUsdExact } from '@/lib/money-format';
import {
  saveToolAction,
  deleteToolAction,
  checkOutToolAction,
  checkInToolAction,
  saveVehicleAction,
  deleteVehicleAction,
  updateVehicleMileageAction,
  saveStockItemAction,
  deleteStockItemAction,
  adjustStockQuantityAction,
  transferStockAction,
  saveMaintenanceRecordAction,
  saveLocationAction,
  deleteLocationAction,
} from './actions';

interface InventoryClientProps {
  businessName: string;
  initialPayload?: InventoryPayload;
  crewMembers?: Array<{ id: string; name: string; role?: string }>;
  activeJobs?: Array<{ id: string; label: string; status?: string }>;
}

export default function InventoryClient({
  businessName,
  initialPayload,
  crewMembers = [],
  activeJobs = [],
}: InventoryClientProps) {
  const [activeTab, setActiveTab] = useState<'tools' | 'fleet' | 'stock' | 'maintenance' | 'locations'>('tools');
  const [isPending, startTransition] = useTransition();
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Live persistent state initialized from server
  const [locations, setLocations] = useState<InventoryLocation[]>(initialPayload?.locations ?? []);
  const [tools, setTools] = useState<ToolAsset[]>(initialPayload?.tools ?? []);
  const [vehicles, setVehicles] = useState<FleetVehicle[]>(initialPayload?.vehicles ?? []);
  const [stock, setStock] = useState<VanStockItem[]>(initialPayload?.stock ?? []);
  const [transfers, setTransfers] = useState<StockTransfer[]>(initialPayload?.transfers ?? []);
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>(initialPayload?.maintenance ?? []);

  // Filter & Search states
  const [toolFilter, setToolFilter] = useState<'all' | ToolAssetStatus>('all');
  const [toolSearch, setToolSearch] = useState('');
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [stockLocationFilter, setStockLocationFilter] = useState<string>('all');
  const [stockSearch, setStockSearch] = useState('');

  // Modals state
  const [checkoutTool, setCheckoutTool] = useState<ToolAsset | null>(null);
  const [selectedCrewName, setSelectedCrewName] = useState(crewMembers[0]?.name || 'Carlos Ramirez');
  const [selectedJobLabel, setSelectedJobLabel] = useState(activeJobs[0]?.label || 'Shop Pool / Maintenance');
  const [checkoutNotes, setCheckoutNotes] = useState('');

  const [checkinTool, setCheckinTool] = useState<ToolAsset | null>(null);
  const [checkinCondition, setCheckinCondition] = useState<ToolAssetStatus>('available');
  const [checkinNotes, setCheckinNotes] = useState('');

  const [toolModal, setToolModal] = useState<{ open: boolean; tool: Partial<ToolAsset> | null }>({ open: false, tool: null });
  const [vehicleModal, setVehicleModal] = useState<{ open: boolean; vehicle: Partial<FleetVehicle> | null }>({ open: false, vehicle: null });
  const [mileageModal, setMileageModal] = useState<{ open: boolean; vehicle: FleetVehicle | null; mileage: number }>({ open: false, vehicle: null, mileage: 0 });
  const [stockModal, setStockModal] = useState<{ open: boolean; item: Partial<VanStockItem> | null }>({ open: false, item: null });
  const [transferModal, setTransferModal] = useState<{ open: boolean; item: VanStockItem | null; toLocation: string; qty: number; notes: string }>({
    open: false,
    item: null,
    toLocation: '',
    qty: 1,
    notes: '',
  });
  const [maintenanceModal, setMaintenanceModal] = useState<{
    open: boolean;
    record: Partial<MaintenanceRecord> & { assetType: 'tool' | 'vehicle'; assetId: string; assetName: string };
  }>({
    open: false,
    record: { assetType: 'tool', assetId: '', assetName: '', serviceType: '', cost: 0, performedBy: '', performedAt: new Date().toISOString().split('T')[0] },
  });
  const [locationModal, setLocationModal] = useState<{ open: boolean; location: Partial<InventoryLocation> | null }>({ open: false, location: null });
  const [showPoModal, setShowPoModal] = useState(false);

  function showToast(text: string, type: 'success' | 'error' = 'success') {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  }

  // Audits & KPIs
  const lowStockResult = auditLowStockItems(stock);
  const maintenanceDueCount = vehicles.filter((v) => {
    const audit = auditVehicleMaintenance(v);
    return audit.isServiceOverdue || audit.isInspectionExpired || audit.isInsuranceExpired;
  }).length;
  const totalToolValue = tools.reduce((sum, t) => sum + (t.purchasePrice || 0), 0);
  const totalStockValue = stock.reduce((sum, s) => sum + s.quantityOnHand * s.unitCost, 0);

  // Distinct locations for filters & dropdowns
  const availableLocationNames = Array.from(
    new Set([
      'Main Shop & Warehouse',
      ...locations.map((l) => l.name),
      ...stock.map((s) => s.location),
    ].filter(Boolean))
  );

  // ── Handlers: Tools ────────────────────────────────────────────────────────

  function handleOpenCheckout(tool: ToolAsset) {
    setCheckoutTool(tool);
    setSelectedCrewName(tool.assignedCrewName || crewMembers[0]?.name || 'Carlos Ramirez');
    setSelectedJobLabel(tool.assignedJobLabel || activeJobs[0]?.label || 'Active Work Order');
    setCheckoutNotes(tool.notes || '');
  }

  function handleConfirmCheckout() {
    if (!checkoutTool) return;
    const toolId = checkoutTool.id;
    const crewName = selectedCrewName;
    const jobLabel = selectedJobLabel;
    const notes = checkoutNotes;

    // Optimistic
    setTools((prev) =>
      prev.map((t) =>
        t.id === toolId
          ? {
              ...t,
              status: 'checked_out',
              assignedCrewName: crewName,
              assignedJobLabel: jobLabel,
              checkedOutAt: new Date().toISOString(),
              notes,
            }
          : t
      )
    );
    setCheckoutTool(null);

    startTransition(async () => {
      try {
        const updated = await checkOutToolAction({ toolId, crewName, jobLabel, notes });
        setTools((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        showToast(`Checked out ${checkoutTool.name} to ${crewName}`);
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : 'Failed to check out tool', 'error');
      }
    });
  }

  function handleOpenCheckin(tool: ToolAsset) {
    setCheckinTool(tool);
    setCheckinCondition('available');
    setCheckinNotes('');
  }

  function handleConfirmCheckin() {
    if (!checkinTool) return;
    const toolId = checkinTool.id;
    const condition = checkinCondition;
    const notes = checkinNotes;

    // Optimistic
    setTools((prev) =>
      prev.map((t) =>
        t.id === toolId
          ? {
              ...t,
              status: condition,
              assignedCrewId: null,
              assignedCrewName: null,
              assignedJobId: null,
              assignedJobLabel: null,
              checkedOutAt: null,
              notes: notes || t.notes,
            }
          : t
      )
    );
    setCheckinTool(null);

    startTransition(async () => {
      try {
        const updated = await checkInToolAction({ toolId, condition, notes });
        setTools((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        showToast(`Returned ${checkinTool.name} to shop pool`);
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : 'Failed to return tool', 'error');
      }
    });
  }

  function handleSaveTool(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const id = toolModal.tool?.id;
    const toolData = {
      id,
      name: fd.get('name') as string,
      brand: fd.get('brand') as string,
      category: fd.get('category') as string,
      assetTag: fd.get('assetTag') as string,
      modelNumber: (fd.get('modelNumber') as string) || null,
      serialNumber: (fd.get('serialNumber') as string) || null,
      purchasePrice: fd.get('purchasePrice') ? Number(fd.get('purchasePrice')) : null,
      purchaseDate: (fd.get('purchaseDate') as string) || null,
      status: (fd.get('status') as ToolAssetStatus) || 'available',
      locationName: (fd.get('locationName') as string) || 'Main Shop & Warehouse',
      notes: (fd.get('notes') as string) || null,
    };

    setToolModal({ open: false, tool: null });

    startTransition(async () => {
      try {
        const saved = await saveToolAction(toolData);
        setTools((prev) => {
          const exists = prev.some((t) => t.id === saved.id);
          return exists ? prev.map((t) => (t.id === saved.id ? saved : t)) : [saved, ...prev];
        });
        showToast(`Saved tool ${saved.name}`);
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : 'Failed to save tool', 'error');
      }
    });
  }

  function handleDeleteTool(tool: ToolAsset) {
    if (!confirm(`Delete ${tool.name} (${tool.assetTag})?`)) return;
    setTools((prev) => prev.filter((t) => t.id !== tool.id));

    startTransition(async () => {
      try {
        await deleteToolAction(tool.id);
        showToast(`Deleted tool ${tool.name}`);
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : 'Failed to delete tool', 'error');
      }
    });
  }

  // ── Handlers: Vehicles ─────────────────────────────────────────────────────

  function handleConfirmMileage() {
    if (!mileageModal.vehicle) return;
    const vehicleId = mileageModal.vehicle.id;
    const currentMileage = Number(mileageModal.mileage);

    setVehicles((prev) =>
      prev.map((v) => (v.id === vehicleId ? { ...v, currentMileage } : v))
    );
    setMileageModal({ open: false, vehicle: null, mileage: 0 });

    startTransition(async () => {
      try {
        const updated = await updateVehicleMileageAction({ vehicleId, currentMileage });
        setVehicles((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
        showToast(`Updated odometer for ${updated.name} to ${currentMileage.toLocaleString()} mi`);
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : 'Failed to update mileage', 'error');
      }
    });
  }

  function handleSaveVehicle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const id = vehicleModal.vehicle?.id;
    const vehicleData = {
      id,
      name: fd.get('name') as string,
      make: fd.get('make') as string,
      model: fd.get('model') as string,
      year: Number(fd.get('year')) || new Date().getFullYear(),
      licensePlate: fd.get('licensePlate') as string,
      vin: (fd.get('vin') as string) || null,
      currentMileage: Number(fd.get('currentMileage')) || 0,
      primaryDriverName: (fd.get('primaryDriverName') as string) || null,
      status: (fd.get('status') as VehicleStatus) || 'active',
      nextServiceDueMileage: fd.get('nextServiceDueMileage') ? Number(fd.get('nextServiceDueMileage')) : null,
      inspectionExpiresAt: (fd.get('inspectionExpiresAt') as string) || null,
      insuranceExpiresAt: (fd.get('insuranceExpiresAt') as string) || null,
      notes: (fd.get('notes') as string) || null,
    };

    setVehicleModal({ open: false, vehicle: null });

    startTransition(async () => {
      try {
        const saved = await saveVehicleAction(vehicleData);
        setVehicles((prev) => {
          const exists = prev.some((v) => v.id === saved.id);
          return exists ? prev.map((v) => (v.id === saved.id ? saved : v)) : [saved, ...prev];
        });
        showToast(`Saved vehicle ${saved.name}`);
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : 'Failed to save vehicle', 'error');
      }
    });
  }

  function handleDeleteVehicle(vehicle: FleetVehicle) {
    if (!confirm(`Delete vehicle ${vehicle.name} (${vehicle.licensePlate})?`)) return;
    setVehicles((prev) => prev.filter((v) => v.id !== vehicle.id));

    startTransition(async () => {
      try {
        await deleteVehicleAction(vehicle.id);
        showToast(`Deleted vehicle ${vehicle.name}`);
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : 'Failed to delete vehicle', 'error');
      }
    });
  }

  // ── Handlers: Stock & Multi-Location Transfers ─────────────────────────────

  function handleAdjustStock(item: VanStockItem, delta: number) {
    const newQty = Math.max(0, item.quantityOnHand + delta);
    setStock((prev) => prev.map((s) => (s.id === item.id ? { ...s, quantityOnHand: newQty } : s)));

    startTransition(async () => {
      try {
        const updated = await adjustStockQuantityAction({ stockId: item.id, delta });
        setStock((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : 'Failed to update stock quantity', 'error');
      }
    });
  }

  function handleOpenTransfer(item: VanStockItem) {
    const otherLocations = availableLocationNames.filter((l) => l !== item.location);
    setTransferModal({
      open: true,
      item,
      toLocation: otherLocations[0] || 'Van #1 (Lead Tech)',
      qty: 1,
      notes: '',
    });
  }

  function handleConfirmTransfer() {
    if (!transferModal.item) return;
    const item = transferModal.item;
    const quantity = Number(transferModal.qty);
    const toLocation = transferModal.toLocation;
    const notes = transferModal.notes;

    if (quantity <= 0 || quantity > item.quantityOnHand) {
      alert(`Please choose a transfer quantity between 1 and ${item.quantityOnHand}`);
      return;
    }

    setTransferModal({ open: false, item: null, toLocation: '', qty: 1, notes: '' });

    startTransition(async () => {
      try {
        const res = await transferStockAction({
          stockId: item.id,
          fromLocation: item.location,
          toLocation,
          quantity,
          notes,
        });

        // Update source and transfers
        setTransfers((prev) => [res.transfer, ...prev]);
        setStock((prev) => {
          const updatedSource = prev.map((s) => (s.id === res.sourceStock.id ? res.sourceStock : s));
          const destIdx = updatedSource.findIndex((s) => s.sku === item.sku && s.location === toLocation);
          if (destIdx >= 0) {
            updatedSource[destIdx] = {
              ...updatedSource[destIdx],
              quantityOnHand: updatedSource[destIdx].quantityOnHand + quantity,
            };
            return [...updatedSource];
          } else {
            const newItem: VanStockItem = {
              ...item,
              id: `stock-${Date.now()}`,
              location: toLocation,
              quantityOnHand: quantity,
            };
            return [...updatedSource, newItem];
          }
        });

        showToast(`Transferred ${quantity} ${item.unit} of ${item.name} to ${toLocation}`);
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : 'Transfer failed', 'error');
      }
    });
  }

  function handleSaveStockItem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const id = stockModal.item?.id;
    const stockData = {
      id,
      name: fd.get('name') as string,
      sku: fd.get('sku') as string,
      category: fd.get('category') as string,
      location: (fd.get('location') as string) || 'Main Shop & Warehouse',
      quantityOnHand: Number(fd.get('quantityOnHand')) || 0,
      minThreshold: Number(fd.get('minThreshold')) || 0,
      unit: (fd.get('unit') as string) || 'ea',
      unitCost: Number(fd.get('unitCost')) || 0,
      preferredSupplier: (fd.get('preferredSupplier') as string) || '',
      reorderQty: Number(fd.get('reorderQty')) || 0,
      notes: (fd.get('notes') as string) || null,
    };

    setStockModal({ open: false, item: null });

    startTransition(async () => {
      try {
        const saved = await saveStockItemAction(stockData);
        setStock((prev) => {
          const exists = prev.some((s) => s.id === saved.id);
          return exists ? prev.map((s) => (s.id === saved.id ? saved : s)) : [saved, ...prev];
        });
        showToast(`Saved stock item ${saved.name}`);
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : 'Failed to save stock item', 'error');
      }
    });
  }

  function handleDeleteStock(item: VanStockItem) {
    if (!confirm(`Delete ${item.name} (${item.sku}) at ${item.location}?`)) return;
    setStock((prev) => prev.filter((s) => s.id !== item.id));

    startTransition(async () => {
      try {
        await deleteStockItemAction(item.id);
        showToast(`Deleted stock item ${item.name}`);
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : 'Failed to delete stock item', 'error');
      }
    });
  }

  // ── Handlers: Maintenance Log ──────────────────────────────────────────────

  function handleSaveMaintenance(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const maintData = {
      assetType: fd.get('assetType') as 'tool' | 'vehicle',
      assetId: fd.get('assetId') as string,
      assetName: fd.get('assetName') as string,
      serviceType: fd.get('serviceType') as string,
      cost: Number(fd.get('cost')) || 0,
      performedBy: fd.get('performedBy') as string,
      performedAt: (fd.get('performedAt') as string) || new Date().toISOString().split('T')[0],
      nextDueAt: (fd.get('nextDueAt') as string) || null,
      mileageAtService: fd.get('mileageAtService') ? Number(fd.get('mileageAtService')) : null,
      notes: (fd.get('notes') as string) || null,
    };

    setMaintenanceModal({
      open: false,
      record: { assetType: 'tool', assetId: '', assetName: '', serviceType: '', cost: 0, performedBy: '', performedAt: '' },
    });

    startTransition(async () => {
      try {
        const saved = await saveMaintenanceRecordAction(maintData);
        setMaintenance((prev) => [saved, ...prev]);

        // If vehicle, update mileage if provided
        if (saved.assetType === 'vehicle' && saved.mileageAtService) {
          setVehicles((prev) =>
            prev.map((v) =>
              v.id === saved.assetId
                ? {
                    ...v,
                    lastServiceDate: saved.performedAt,
                    lastServiceMileage: saved.mileageAtService ?? v.lastServiceMileage,
                  }
                : v
            )
          );
        }

        showToast(`Logged maintenance record for ${saved.assetName}`);
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : 'Failed to save maintenance record', 'error');
      }
    });
  }

  // ── Handlers: Locations ────────────────────────────────────────────────────

  function handleSaveLocation(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const id = locationModal.location?.id;
    const locData = {
      id,
      name: fd.get('name') as string,
      type: (fd.get('type') as InventoryLocationType) || 'warehouse',
      code: (fd.get('code') as string) || null,
      address: (fd.get('address') as string) || null,
      isActive: true,
    };

    setLocationModal({ open: false, location: null });

    startTransition(async () => {
      try {
        const saved = await saveLocationAction(locData);
        setLocations((prev) => {
          const exists = prev.some((l) => l.id === saved.id);
          return exists ? prev.map((l) => (l.id === saved.id ? saved : l)) : [...prev, saved];
        });
        showToast(`Saved location ${saved.name}`);
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : 'Failed to save location', 'error');
      }
    });
  }

  function handleDeleteLocation(loc: InventoryLocation) {
    if (!confirm(`Delete location "${loc.name}"?`)) return;
    setLocations((prev) => prev.filter((l) => l.id !== loc.id));

    startTransition(async () => {
      try {
        await deleteLocationAction(loc.id);
        showToast(`Deleted location ${loc.name}`);
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : 'Failed to delete location', 'error');
      }
    });
  }

  // Filtered views
  const filteredTools = tools.filter((tool) => {
    if (toolFilter !== 'all' && tool.status !== toolFilter) return false;
    if (toolSearch.trim()) {
      const q = toolSearch.toLowerCase();
      const match =
        tool.name.toLowerCase().includes(q) ||
        tool.brand.toLowerCase().includes(q) ||
        tool.assetTag.toLowerCase().includes(q) ||
        (tool.modelNumber && tool.modelNumber.toLowerCase().includes(q)) ||
        (tool.serialNumber && tool.serialNumber.toLowerCase().includes(q)) ||
        (tool.assignedCrewName && tool.assignedCrewName.toLowerCase().includes(q)) ||
        (tool.assignedJobLabel && tool.assignedJobLabel.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  const filteredVehicles = vehicles.filter((v) => {
    if (vehicleSearch.trim()) {
      const q = vehicleSearch.toLowerCase();
      const match =
        v.name.toLowerCase().includes(q) ||
        v.licensePlate.toLowerCase().includes(q) ||
        v.make.toLowerCase().includes(q) ||
        v.model.toLowerCase().includes(q) ||
        (v.primaryDriverName && v.primaryDriverName.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  const filteredStock = stock.filter((item) => {
    if (stockLocationFilter !== 'all' && item.location !== stockLocationFilter) return false;
    if (stockSearch.trim()) {
      const q = stockSearch.toLowerCase();
      const match =
        item.name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.preferredSupplier.toLowerCase().includes(q) ||
        item.location.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all ${
            toastMessage.type === 'success'
              ? 'bg-emerald-900 text-emerald-50 border-emerald-700'
              : 'bg-rose-900 text-rose-50 border-rose-700'
          }`}
        >
          {toastMessage.type === 'success' ? '✓ ' : '⚠️ '}
          {toastMessage.text}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-stone-200 dark:border-stone-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300 border border-orange-200 dark:border-orange-900">
              🛠️ Fleet &amp; Asset Custody
            </span>
            <span className="text-xs text-stone-500 dark:text-stone-400">{businessName}</span>
            {isPending && (
              <span className="text-xs text-orange-600 dark:text-orange-400 font-mono animate-pulse">
                Saving changes...
              </span>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 dark:text-stone-100 tracking-tight">
            Multi-Location Inventory &amp; Fleet Management
          </h1>
          <p className="text-sm text-stone-600 dark:text-stone-400 mt-1">
            Track serial tool custody, fleet vehicle PM schedules, and van stock replenishment across all depots.
          </p>
        </div>

        {/* Quick KPI Badges */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setActiveTab('stock');
              setShowPoModal(true);
            }}
            className="bg-stone-100 dark:bg-stone-800/80 hover:bg-stone-200 dark:hover:bg-stone-700/80 transition-colors px-3.5 py-2 rounded-xl border border-stone-200 dark:border-stone-700 text-center cursor-pointer"
          >
            <div className="text-xs font-medium text-stone-500 dark:text-stone-400">Low Stock</div>
            <div
              className={`text-lg font-bold ${
                lowStockResult.lowStockCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {lowStockResult.lowStockCount} {lowStockResult.lowStockCount === 1 ? 'item' : 'items'}
            </div>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('fleet')}
            className="bg-stone-100 dark:bg-stone-800/80 hover:bg-stone-200 dark:hover:bg-stone-700/80 transition-colors px-3.5 py-2 rounded-xl border border-stone-200 dark:border-stone-700 text-center cursor-pointer"
          >
            <div className="text-xs font-medium text-stone-500 dark:text-stone-400">Service Due</div>
            <div
              className={`text-lg font-bold ${
                maintenanceDueCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {maintenanceDueCount} {maintenanceDueCount === 1 ? 'vehicle' : 'vehicles'}
            </div>
          </button>
          <div className="bg-stone-100 dark:bg-stone-800/80 px-3.5 py-2 rounded-xl border border-stone-200 dark:border-stone-700 text-center">
            <div className="text-xs font-medium text-stone-500 dark:text-stone-400">Tool Value</div>
            <div className="text-lg font-bold text-stone-800 dark:text-stone-200 font-mono">
              {formatUsdExact(totalToolValue)}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-stone-200 dark:border-stone-800 overflow-x-auto" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'tools'}
          onClick={() => setActiveTab('tools')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'tools'
              ? 'border-orange-600 text-orange-600 dark:border-orange-400 dark:text-orange-400'
              : 'border-transparent text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
          }`}
        >
          🔧 Tools &amp; Equipment ({tools.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'fleet'}
          onClick={() => setActiveTab('fleet')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'fleet'
              ? 'border-orange-600 text-orange-600 dark:border-orange-400 dark:text-orange-400'
              : 'border-transparent text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
          }`}
        >
          🚚 Fleet Vehicles ({vehicles.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'stock'}
          onClick={() => setActiveTab('stock')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'stock'
              ? 'border-orange-600 text-orange-600 dark:border-orange-400 dark:text-orange-400'
              : 'border-transparent text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
          }`}
        >
          📦 Multi-Location Stock ({stock.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'maintenance'}
          onClick={() => setActiveTab('maintenance')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'maintenance'
              ? 'border-orange-600 text-orange-600 dark:border-orange-400 dark:text-orange-400'
              : 'border-transparent text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
          }`}
        >
          📋 Maintenance Log ({maintenance.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'locations'}
          onClick={() => setActiveTab('locations')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'locations'
              ? 'border-orange-600 text-orange-600 dark:border-orange-400 dark:text-orange-400'
              : 'border-transparent text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
          }`}
        >
          📍 Locations &amp; Depots ({locations.length})
        </button>
      </div>

      {/* TAB 1: TOOLS & EQUIPMENT */}
      {activeTab === 'tools' && (
        <div className="space-y-4">
          {/* Controls */}
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
            <div className="flex gap-2 flex-wrap">
              {(['all', 'available', 'checked_out', 'in_maintenance'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setToolFilter(status)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    toolFilter === status
                      ? 'bg-orange-50 border-orange-300 text-orange-800 dark:bg-orange-950/50 dark:border-orange-800 dark:text-orange-300'
                      : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800'
                  }`}
                >
                  {status === 'all'
                    ? 'All Tools'
                    : status === 'available'
                    ? 'Available in Shop'
                    : status === 'checked_out'
                    ? 'Checked Out'
                    : 'In Maintenance'}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search tools by name, tag, serial..."
                value={toolSearch}
                onChange={(e) => setToolSearch(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <button
                type="button"
                onClick={() => setToolModal({ open: true, tool: null })}
                className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-bold whitespace-nowrap shadow-sm"
              >
                + Add Tool
              </button>
            </div>
          </div>

          {/* Tools Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredTools.map((tool) => {
              const desc = describeToolStatus(tool.status);
              const isCheckedOut = tool.status === 'checked_out';

              return (
                <div
                  key={tool.id}
                  className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 shadow-sm space-y-3 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-orange-600 dark:text-orange-400">
                            {tool.assetTag}
                          </span>
                          {tool.serialNumber && (
                            <span className="text-xs font-mono text-stone-400 dark:text-stone-500">
                              SN: {tool.serialNumber}
                            </span>
                          )}
                        </div>
                        <h3 className="text-base font-bold text-stone-900 dark:text-stone-100 mt-0.5">
                          {tool.name}
                        </h3>
                        <p className="text-xs text-stone-500 dark:text-stone-400">
                          {tool.brand} {tool.modelNumber ? `· Mod: ${tool.modelNumber}` : ''} · {tool.category}
                        </p>
                      </div>
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                          tool.status === 'available'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                            : tool.status === 'checked_out'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                        }`}
                      >
                        {desc.label}
                      </span>
                    </div>

                    {isCheckedOut && (
                      <div className="bg-stone-50 dark:bg-stone-800/50 p-3 rounded-xl border border-stone-100 dark:border-stone-800 text-xs space-y-1 mt-3">
                        <div className="flex justify-between">
                          <span className="text-stone-500 dark:text-stone-400">Assigned Tech:</span>
                          <strong className="text-stone-800 dark:text-stone-200">{tool.assignedCrewName || 'Assigned'}</strong>
                        </div>
                        {tool.assignedJobLabel && (
                          <div className="flex justify-between">
                            <span className="text-stone-500 dark:text-stone-400">Job Site:</span>
                            <span className="text-stone-700 dark:text-stone-300 font-medium">{tool.assignedJobLabel}</span>
                          </div>
                        )}
                        {tool.checkedOutAt && (
                          <div className="flex justify-between text-stone-400 text-[11px]">
                            <span>Checked Out:</span>
                            <span>{new Date(tool.checkedOutAt).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {tool.notes && (
                      <p className="text-xs italic text-stone-600 dark:text-stone-400 mt-2">
                        &ldquo;{tool.notes}&rdquo;
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-stone-100 dark:border-stone-800 gap-2">
                    <div className="text-xs text-stone-500 dark:text-stone-400">
                      Value: <strong className="text-stone-800 dark:text-stone-200 font-mono">{tool.purchasePrice ? formatUsdExact(tool.purchasePrice) : 'N/A'}</strong>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setToolModal({ open: true, tool })}
                        className="p-1.5 text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 rounded text-xs"
                        title="Edit tool"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteTool(tool)}
                        className="p-1.5 text-rose-500 hover:text-rose-700 rounded text-xs"
                        title="Delete tool"
                      >
                        🗑️
                      </button>

                      {tool.status === 'available' ? (
                        <button
                          type="button"
                          onClick={() => handleOpenCheckout(tool)}
                          className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all"
                        >
                          Check Out →
                        </button>
                      ) : tool.status === 'checked_out' ? (
                        <button
                          type="button"
                          onClick={() => handleOpenCheckin(tool)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all"
                        >
                          Return Tool ✓
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenCheckin(tool)}
                          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all"
                        >
                          Release from Repair
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: FLEET VEHICLES */}
      {activeTab === 'fleet' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
            <input
              type="text"
              placeholder="Search fleet by name, plate, driver..."
              value={vehicleSearch}
              onChange={(e) => setVehicleSearch(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 w-full sm:w-72 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <button
              type="button"
              onClick={() => setVehicleModal({ open: true, vehicle: null })}
              className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-bold whitespace-nowrap shadow-sm"
            >
              + Add Vehicle
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {filteredVehicles.map((v) => {
              const statusDesc = describeVehicleStatus(v.status);
              const audit = auditVehicleMaintenance(v);

              return (
                <div
                  key={v.id}
                  className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 shadow-sm space-y-3 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-xs font-mono font-bold text-orange-600 dark:text-orange-400">
                          {v.licensePlate}
                        </span>
                        <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
                          {v.name}
                        </h3>
                        <p className="text-xs text-stone-500 dark:text-stone-400">
                          {v.year} {v.make} {v.model}
                        </p>
                      </div>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                          v.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                        }`}
                      >
                        {statusDesc.label}
                      </span>
                    </div>

                    {/* Alerts */}
                    {audit.summaryAlert && (
                      <div
                        className={`mt-2 p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 ${
                          audit.statusTone === 'danger'
                            ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300'
                            : 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300'
                        }`}
                      >
                        <span>⚠️</span>
                        <span>{audit.summaryAlert}</span>
                      </div>
                    )}

                    <div className="bg-stone-50 dark:bg-stone-800/50 p-3 rounded-xl border border-stone-100 dark:border-stone-800 text-xs space-y-1.5 mt-3">
                      <div className="flex justify-between">
                        <span className="text-stone-500 dark:text-stone-400">Primary Driver:</span>
                        <strong className="text-stone-800 dark:text-stone-200">
                          {v.primaryDriverName ?? 'Unassigned'}
                        </strong>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-stone-500 dark:text-stone-400">Odometer:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-stone-800 dark:text-stone-200 font-mono font-bold">
                            {v.currentMileage.toLocaleString()} mi
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setMileageModal({ open: true, vehicle: v, mileage: v.currentMileage })
                            }
                            className="text-[11px] text-orange-600 dark:text-orange-400 hover:underline font-semibold"
                          >
                            Update
                          </button>
                        </div>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-stone-500 dark:text-stone-400">PM Next Service:</span>
                        <span
                          className={`font-mono font-bold ${
                            audit.isServiceOverdue
                              ? 'text-rose-600 dark:text-rose-400'
                              : audit.isServiceDueSoon
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-stone-700 dark:text-stone-300'
                          }`}
                        >
                          {v.nextServiceDueMileage?.toLocaleString()} mi
                        </span>
                      </div>
                      {v.inspectionExpiresAt && (
                        <div className="flex justify-between text-stone-500 dark:text-stone-400 text-[11px]">
                          <span>State Inspection:</span>
                          <span className={audit.isInspectionExpired ? 'text-rose-600 font-bold' : ''}>
                            {v.inspectionExpiresAt}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-stone-100 dark:border-stone-800">
                    <button
                      type="button"
                      onClick={() =>
                        setMaintenanceModal({
                          open: true,
                          record: {
                            assetType: 'vehicle',
                            assetId: v.id,
                            assetName: `${v.name} (${v.make} ${v.model})`,
                            serviceType: 'Routine Oil & Inspection',
                            cost: 150,
                            performedBy: 'Fleet Tech',
                            performedAt: new Date().toISOString().split('T')[0],
                            mileageAtService: v.currentMileage,
                          },
                        })
                      }
                      className="px-2.5 py-1 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 rounded-lg text-xs font-semibold"
                    >
                      + Log PM Service
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setVehicleModal({ open: true, vehicle: v })}
                        className="p-1.5 text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 rounded text-xs"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteVehicle(v)}
                        className="p-1.5 text-rose-500 hover:text-rose-700 rounded text-xs"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: MULTI-LOCATION VAN STOCK */}
      {activeTab === 'stock' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
            {/* Location selector tabs */}
            <div className="flex gap-2 flex-wrap items-center">
              <span className="text-xs font-semibold text-stone-500 dark:text-stone-400">Location:</span>
              <button
                type="button"
                onClick={() => setStockLocationFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  stockLocationFilter === 'all'
                    ? 'bg-orange-50 border-orange-300 text-orange-800 dark:bg-orange-950/50 dark:border-orange-800 dark:text-orange-300'
                    : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800'
                }`}
              >
                All ({stock.length})
              </button>
              {availableLocationNames.map((loc) => {
                const count = stock.filter((s) => s.location === loc).length;
                return (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => setStockLocationFilter(loc)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      stockLocationFilter === loc
                        ? 'bg-orange-50 border-orange-300 text-orange-800 dark:bg-orange-950/50 dark:border-orange-800 dark:text-orange-300'
                        : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800'
                    }`}
                  >
                    {loc} ({count})
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search stock by SKU, name, supplier..."
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 w-full sm:w-60 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <button
                type="button"
                onClick={() => setShowPoModal(true)}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold whitespace-nowrap shadow-sm"
              >
                🛒 Restock PO Sheet
              </button>
              <button
                type="button"
                onClick={() => setStockModal({ open: true, item: null })}
                className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-bold whitespace-nowrap shadow-sm"
              >
                + Add Item
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-stone-800 dark:text-stone-200">
                <thead className="bg-stone-50 dark:bg-stone-800/60 text-xs uppercase tracking-wider text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-800">
                  <tr>
                    <th className="py-3 px-4">Item &amp; SKU</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Location</th>
                    <th className="py-3 px-4 text-center">On Hand / Min</th>
                    <th className="py-3 px-4 text-right">Unit Cost</th>
                    <th className="py-3 px-4">Preferred Supplier</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800 font-medium">
                  {filteredStock.map((item) => {
                    const isLow = item.quantityOnHand <= item.minThreshold;
                    return (
                      <tr key={item.id} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/30 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-stone-900 dark:text-stone-100">{item.name}</div>
                          <div className="text-xs font-mono text-stone-500 dark:text-stone-400">{item.sku}</div>
                        </td>
                        <td className="py-3 px-4 text-xs text-stone-600 dark:text-stone-400">{item.category}</td>
                        <td className="py-3 px-4 text-xs font-semibold text-stone-700 dark:text-stone-300">
                          <span className="px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700">
                            {item.location}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-mono">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleAdjustStock(item, -1)}
                              className="w-6 h-6 rounded bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 font-bold text-xs"
                            >
                              -
                            </button>
                            <span className={isLow ? 'text-amber-600 dark:text-amber-400 font-bold' : ''}>
                              {item.quantityOnHand} {item.unit}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleAdjustStock(item, 1)}
                              className="w-6 h-6 rounded bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 font-bold text-xs"
                            >
                              +
                            </button>
                          </div>
                          <span className="text-stone-400 text-[11px]">Min: {item.minThreshold}</span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono">{formatUsdExact(item.unitCost)}</td>
                        <td className="py-3 px-4 text-xs text-stone-600 dark:text-stone-400">
                          {item.preferredSupplier || '—'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                              isLow
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                            }`}
                          >
                            {isLow ? `Reorder +${item.reorderQty}` : 'Adequate'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenTransfer(item)}
                              className="px-2 py-1 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 rounded text-xs font-medium"
                              title="Transfer stock to another location"
                            >
                              ⇄ Transfer
                            </button>
                            <button
                              type="button"
                              onClick={() => setStockModal({ open: true, item })}
                              className="p-1 text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 rounded text-xs"
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteStock(item)}
                              className="p-1 text-rose-500 hover:text-rose-700 rounded text-xs"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Transfers Log */}
          {transfers.length > 0 && (
            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                Recent Inter-Location Transfers
              </h3>
              <div className="divide-y divide-stone-100 dark:divide-stone-800 text-xs">
                {transfers.slice(0, 5).map((tr) => (
                  <div key={tr.id} className="py-2 flex items-center justify-between">
                    <div>
                      <strong className="text-stone-800 dark:text-stone-200">{tr.quantity} × {tr.itemName}</strong>
                      <span className="text-stone-500 dark:text-stone-400"> from {tr.fromLocation} → {tr.toLocation}</span>
                      {tr.notes && <span className="italic text-stone-400"> ({tr.notes})</span>}
                    </div>
                    <span className="text-stone-400 font-mono">
                      {new Date(tr.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: MAINTENANCE LOG */}
      {activeTab === 'maintenance' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
                Equipment Maintenance &amp; Calibration Records
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Audit history of oil changes, factory recalibrations, and safety inspections.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setMaintenanceModal({
                  open: true,
                  record: {
                    assetType: 'tool',
                    assetId: tools[0]?.id || 'custom',
                    assetName: tools[0]?.name || 'Tool Asset',
                    serviceType: 'Annual Recalibration',
                    cost: 150,
                    performedBy: 'Factory Service',
                    performedAt: new Date().toISOString().split('T')[0],
                  },
                })
              }
              className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-bold shadow-sm"
            >
              + Log Service Record
            </button>
          </div>

          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-left text-sm text-stone-800 dark:text-stone-200">
              <thead className="bg-stone-50 dark:bg-stone-800/60 text-xs uppercase tracking-wider text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-800">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Asset &amp; Type</th>
                  <th className="py-3 px-4">Service Description</th>
                  <th className="py-3 px-4">Performed By</th>
                  <th className="py-3 px-4 text-right">Cost</th>
                  <th className="py-3 px-4">Next Due</th>
                  <th className="py-3 px-4">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800 font-medium text-xs">
                {maintenance.map((m) => (
                  <tr key={m.id} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/30">
                    <td className="py-3 px-4 font-mono">{m.performedAt}</td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-stone-900 dark:text-stone-100">{m.assetName}</div>
                      <span className="text-[11px] uppercase tracking-wider text-stone-500 font-mono">
                        {m.assetType}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-stone-800 dark:text-stone-200">
                      {m.serviceType}
                      {m.mileageAtService && (
                        <div className="text-[11px] text-stone-400 font-mono">
                          At {m.mileageAtService.toLocaleString()} mi
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-stone-600 dark:text-stone-400">{m.performedBy}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold">{formatUsdExact(m.cost)}</td>
                    <td className="py-3 px-4 font-mono text-stone-500">{m.nextDueAt || '—'}</td>
                    <td className="py-3 px-4 italic text-stone-500 max-w-xs truncate">{m.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: LOCATIONS & DEPOTS */}
      {activeTab === 'locations' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
                Multi-Location Depots, Warehouses &amp; Fleet Vehicles
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Configure physical stock locations and vehicles for granular supply chain tracking.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setLocationModal({ open: true, location: null })}
              className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-bold shadow-sm"
            >
              + Add Location
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {locations.map((loc) => {
              const stockCount = stock.filter((s) => s.location === loc.name).length;
              return (
                <div
                  key={loc.id}
                  className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 shadow-sm space-y-3 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-orange-600 dark:text-orange-400">
                        {loc.code || 'LOC'}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 uppercase font-mono text-[10px]">
                        {loc.type}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-stone-900 dark:text-stone-100 mt-1">
                      {loc.name}
                    </h3>
                    <p className="text-xs text-stone-500 dark:text-stone-400">{loc.address || 'Standard Depot'}</p>
                    <div className="mt-3 text-xs text-stone-600 dark:text-stone-300 font-medium">
                      Stock items stocked: <strong className="font-mono">{stockCount}</strong>
                    </div>
                  </div>

                  <div className="flex justify-end gap-1 pt-2 border-t border-stone-100 dark:border-stone-800">
                    <button
                      type="button"
                      onClick={() => setLocationModal({ open: true, location: loc })}
                      className="p-1.5 text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 rounded text-xs"
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteLocation(loc)}
                      className="p-1.5 text-rose-500 hover:text-rose-700 rounded text-xs"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── MODALS ──────────────────────────────────────────────────────────── */}

      {/* Check Out Tool Modal */}
      {checkoutTool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
              Check Out: {checkoutTool.name}
            </h3>
            <p className="text-xs text-stone-500">Asset Tag: {checkoutTool.assetTag}</p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-stone-700 dark:text-stone-300 block mb-1">
                  Assign to Crew Member / Technician:
                </label>
                <select
                  value={selectedCrewName}
                  onChange={(e) => setSelectedCrewName(e.target.value)}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                >
                  {crewMembers.length > 0 ? (
                    crewMembers.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name} {c.role ? `(${c.role})` : ''}
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="Carlos Ramirez (Van #1)">Carlos Ramirez (Van #1)</option>
                      <option value="Jake Martinez (Van #2)">Jake Martinez (Van #2)</option>
                      <option value="Tyler Vance (Truck #3)">Tyler Vance (Truck #3)</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="font-semibold text-stone-700 dark:text-stone-300 block mb-1">
                  Destination Job Site / Location:
                </label>
                <input
                  type="text"
                  value={selectedJobLabel}
                  onChange={(e) => setSelectedJobLabel(e.target.value)}
                  placeholder="e.g. 142 Ridgewood Rd - Water Heater"
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>

              <div>
                <label className="font-semibold text-stone-700 dark:text-stone-300 block mb-1">Notes / Accessories:</label>
                <textarea
                  rows={2}
                  value={checkoutNotes}
                  onChange={(e) => setCheckoutNotes(e.target.value)}
                  placeholder="e.g. Includes 1-inch and 2-inch jaws in hard case"
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-stone-100 dark:border-stone-800">
              <button
                type="button"
                onClick={() => setCheckoutTool(null)}
                className="px-4 py-2 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmCheckout}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-bold"
              >
                Confirm Check Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Check In Tool Modal */}
      {checkinTool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
              Return Tool: {checkinTool.name}
            </h3>
            <p className="text-xs text-stone-500">Asset Tag: {checkinTool.assetTag}</p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-stone-700 dark:text-stone-300 block mb-1">Return Condition:</label>
                <select
                  value={checkinCondition}
                  onChange={(e) => setCheckinCondition(e.target.value as ToolAssetStatus)}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                >
                  <option value="available">Available in Shop Pool (Good Working Condition)</option>
                  <option value="in_maintenance">Needs Service / Maintenance / Calibration</option>
                  <option value="lost_damaged">Reported Lost or Damaged</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-stone-700 dark:text-stone-300 block mb-1">Return Notes:</label>
                <textarea
                  rows={2}
                  value={checkinNotes}
                  onChange={(e) => setCheckinNotes(e.target.value)}
                  placeholder="e.g. Returned clean, battery charged"
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-stone-100 dark:border-stone-800">
              <button
                type="button"
                onClick={() => setCheckinTool(null)}
                className="px-4 py-2 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmCheckin}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold"
              >
                Confirm Return
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Tool Modal */}
      {toolModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleSaveTool}
            className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4"
          >
            <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
              {toolModal.tool ? 'Edit Tool Asset' : 'Add New Tool Asset'}
            </h3>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="col-span-2">
                <label className="font-semibold block mb-1">Tool Name *</label>
                <input
                  type="text"
                  name="name"
                  required
                  defaultValue={toolModal.tool?.name || ''}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Brand *</label>
                <input
                  type="text"
                  name="brand"
                  required
                  defaultValue={toolModal.tool?.brand || ''}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Category *</label>
                <input
                  type="text"
                  name="category"
                  required
                  defaultValue={toolModal.tool?.category || 'General Tools'}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Asset Tag *</label>
                <input
                  type="text"
                  name="assetTag"
                  required
                  defaultValue={toolModal.tool?.assetTag || `TAG-${Date.now().toString().slice(-4)}`}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Serial Number</label>
                <input
                  type="text"
                  name="serialNumber"
                  defaultValue={toolModal.tool?.serialNumber || ''}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Model Number</label>
                <input
                  type="text"
                  name="modelNumber"
                  defaultValue={toolModal.tool?.modelNumber || ''}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Purchase Price ($)</label>
                <input
                  type="number"
                  step="0.01"
                  name="purchasePrice"
                  defaultValue={toolModal.tool?.purchasePrice ?? ''}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
              <div className="col-span-2">
                <label className="font-semibold block mb-1">Notes</label>
                <textarea
                  name="notes"
                  rows={2}
                  defaultValue={toolModal.tool?.notes || ''}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-stone-100 dark:border-stone-800">
              <button
                type="button"
                onClick={() => setToolModal({ open: false, tool: null })}
                className="px-4 py-2 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-bold"
              >
                Save Tool
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Update Mileage Modal */}
      {mileageModal.open && mileageModal.vehicle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
              Update Odometer: {mileageModal.vehicle.name}
            </h3>
            <p className="text-xs text-stone-500">
              Previous Mileage: {mileageModal.vehicle.currentMileage.toLocaleString()} mi
            </p>

            <div>
              <label className="text-xs font-semibold text-stone-700 dark:text-stone-300 block mb-1">
                New Odometer Reading (Miles):
              </label>
              <input
                type="number"
                value={mileageModal.mileage}
                onChange={(e) => setMileageModal((prev) => ({ ...prev, mileage: Number(e.target.value) }))}
                className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 font-mono text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-stone-100 dark:border-stone-800">
              <button
                type="button"
                onClick={() => setMileageModal({ open: false, vehicle: null, mileage: 0 })}
                className="px-4 py-2 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmMileage}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-bold"
              >
                Update Mileage
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Vehicle Modal */}
      {vehicleModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleSaveVehicle}
            className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4"
          >
            <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
              {vehicleModal.vehicle ? 'Edit Fleet Vehicle' : 'Add New Fleet Vehicle'}
            </h3>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="col-span-2">
                <label className="font-semibold block mb-1">Vehicle Name / Label *</label>
                <input
                  type="text"
                  name="name"
                  required
                  defaultValue={vehicleModal.vehicle?.name || 'Van #3 (Service)'}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Make *</label>
                <input
                  type="text"
                  name="make"
                  required
                  defaultValue={vehicleModal.vehicle?.make || 'Ford'}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Model *</label>
                <input
                  type="text"
                  name="model"
                  required
                  defaultValue={vehicleModal.vehicle?.model || 'Transit 250'}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Year *</label>
                <input
                  type="number"
                  name="year"
                  required
                  defaultValue={vehicleModal.vehicle?.year || new Date().getFullYear()}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">License Plate *</label>
                <input
                  type="text"
                  name="licensePlate"
                  required
                  defaultValue={vehicleModal.vehicle?.licensePlate || ''}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Current Mileage</label>
                <input
                  type="number"
                  name="currentMileage"
                  defaultValue={vehicleModal.vehicle?.currentMileage || 0}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Next PM Due Mileage</label>
                <input
                  type="number"
                  name="nextServiceDueMileage"
                  defaultValue={vehicleModal.vehicle?.nextServiceDueMileage || 30000}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Primary Driver Name</label>
                <input
                  type="text"
                  name="primaryDriverName"
                  defaultValue={vehicleModal.vehicle?.primaryDriverName || ''}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">State Inspection Expiry</label>
                <input
                  type="date"
                  name="inspectionExpiresAt"
                  defaultValue={vehicleModal.vehicle?.inspectionExpiresAt || ''}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-stone-100 dark:border-stone-800">
              <button
                type="button"
                onClick={() => setVehicleModal({ open: false, vehicle: null })}
                className="px-4 py-2 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-bold"
              >
                Save Vehicle
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add / Edit Stock Item Modal */}
      {stockModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleSaveStockItem}
            className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4"
          >
            <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
              {stockModal.item ? 'Edit Stock Item' : 'Add New Van Stock Item'}
            </h3>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="col-span-2">
                <label className="font-semibold block mb-1">Item Name *</label>
                <input
                  type="text"
                  name="name"
                  required
                  defaultValue={stockModal.item?.name || ''}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">SKU *</label>
                <input
                  type="text"
                  name="sku"
                  required
                  defaultValue={stockModal.item?.sku || ''}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Category *</label>
                <input
                  type="text"
                  name="category"
                  required
                  defaultValue={stockModal.item?.category || 'Fittings'}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Location *</label>
                <select
                  name="location"
                  defaultValue={stockModal.item?.location || availableLocationNames[0] || 'Main Shop & Warehouse'}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                >
                  {availableLocationNames.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-semibold block mb-1">Unit of Measure</label>
                <input
                  type="text"
                  name="unit"
                  defaultValue={stockModal.item?.unit || 'ea'}
                  placeholder="ea, pcs, box, ft, cyl"
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Quantity On Hand</label>
                <input
                  type="number"
                  name="quantityOnHand"
                  defaultValue={stockModal.item?.quantityOnHand ?? 10}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Minimum Threshold</label>
                <input
                  type="number"
                  name="minThreshold"
                  defaultValue={stockModal.item?.minThreshold ?? 5}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Unit Cost ($)</label>
                <input
                  type="number"
                  step="0.01"
                  name="unitCost"
                  defaultValue={stockModal.item?.unitCost ?? 0}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Reorder Quantity</label>
                <input
                  type="number"
                  name="reorderQty"
                  defaultValue={stockModal.item?.reorderQty ?? 20}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
              <div className="col-span-2">
                <label className="font-semibold block mb-1">Preferred Supplier</label>
                <input
                  type="text"
                  name="preferredSupplier"
                  defaultValue={stockModal.item?.preferredSupplier || 'Ferguson Plumbing'}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-stone-100 dark:border-stone-800">
              <button
                type="button"
                onClick={() => setStockModal({ open: false, item: null })}
                className="px-4 py-2 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-bold"
              >
                Save Item
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Stock Transfer Modal */}
      {transferModal.open && transferModal.item && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
              Transfer Stock Between Locations
            </h3>
            <div className="p-3 bg-stone-50 dark:bg-stone-800 rounded-xl text-xs space-y-1">
              <div>
                <strong>{transferModal.item.name}</strong> ({transferModal.item.sku})
              </div>
              <div className="text-stone-500">
                Source: <strong>{transferModal.item.location}</strong> · Available:{' '}
                <strong>{transferModal.item.quantityOnHand} {transferModal.item.unit}</strong>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-stone-700 dark:text-stone-300 block mb-1">
                  Destination Location:
                </label>
                <select
                  value={transferModal.toLocation}
                  onChange={(e) => setTransferModal((prev) => ({ ...prev, toLocation: e.target.value }))}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                >
                  {availableLocationNames
                    .filter((l) => l !== transferModal.item?.location)
                    .map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-stone-700 dark:text-stone-300 block mb-1">
                  Quantity to Transfer ({transferModal.item.unit}):
                </label>
                <input
                  type="number"
                  min="1"
                  max={transferModal.item.quantityOnHand}
                  value={transferModal.qty}
                  onChange={(e) => setTransferModal((prev) => ({ ...prev, qty: Number(e.target.value) }))}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 font-mono"
                />
              </div>

              <div>
                <label className="font-semibold text-stone-700 dark:text-stone-300 block mb-1">Transfer Notes:</label>
                <input
                  type="text"
                  value={transferModal.notes}
                  onChange={(e) => setTransferModal((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="e.g. Restocked Van #1 morning loadout"
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-stone-100 dark:border-stone-800">
              <button
                type="button"
                onClick={() => setTransferModal({ open: false, item: null, toLocation: '', qty: 1, notes: '' })}
                className="px-4 py-2 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmTransfer}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-bold"
              >
                Transfer Stock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log Maintenance Modal */}
      {maintenanceModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleSaveMaintenance}
            className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4"
          >
            <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
              Log Maintenance / Service Record
            </h3>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">Asset Type *</label>
                <select
                  name="assetType"
                  defaultValue={maintenanceModal.record.assetType}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                >
                  <option value="tool">Tool / Equipment</option>
                  <option value="vehicle">Fleet Vehicle</option>
                </select>
              </div>
              <div>
                <label className="font-semibold block mb-1">Asset Name *</label>
                <input
                  type="text"
                  name="assetName"
                  required
                  defaultValue={maintenanceModal.record.assetName || ''}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
                <input type="hidden" name="assetId" value={maintenanceModal.record.assetId || 'custom-asset'} />
              </div>
              <div className="col-span-2">
                <label className="font-semibold block mb-1">Service Performed *</label>
                <input
                  type="text"
                  name="serviceType"
                  required
                  defaultValue={maintenanceModal.record.serviceType || 'Oil Change & Filter'}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Total Cost ($) *</label>
                <input
                  type="number"
                  step="0.01"
                  name="cost"
                  required
                  defaultValue={maintenanceModal.record.cost || 0}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 font-mono"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Performed By *</label>
                <input
                  type="text"
                  name="performedBy"
                  required
                  defaultValue={maintenanceModal.record.performedBy || 'Internal Fleet Tech'}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Service Date *</label>
                <input
                  type="date"
                  name="performedAt"
                  required
                  defaultValue={maintenanceModal.record.performedAt || new Date().toISOString().split('T')[0]}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Odometer at Service (if vehicle)</label>
                <input
                  type="number"
                  name="mileageAtService"
                  defaultValue={maintenanceModal.record.mileageAtService || ''}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 font-mono"
                />
              </div>
              <div className="col-span-2">
                <label className="font-semibold block mb-1">Notes / Warranty Ref</label>
                <textarea
                  name="notes"
                  rows={2}
                  defaultValue={maintenanceModal.record.notes || ''}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-stone-100 dark:border-stone-800">
              <button
                type="button"
                onClick={() =>
                  setMaintenanceModal({
                    open: false,
                    record: { assetType: 'tool', assetId: '', assetName: '', serviceType: '', cost: 0, performedBy: '', performedAt: '' },
                  })
                }
                className="px-4 py-2 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-bold"
              >
                Save Record
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add / Edit Location Modal */}
      {locationModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleSaveLocation}
            className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4"
          >
            <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
              {locationModal.location ? 'Edit Location' : 'Add New Inventory Location'}
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">Location Name *</label>
                <input
                  type="text"
                  name="name"
                  required
                  defaultValue={locationModal.location?.name || ''}
                  placeholder="e.g. Job Trailer #1 (North Site)"
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Location Type *</label>
                <select
                  name="type"
                  defaultValue={locationModal.location?.type || 'warehouse'}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                >
                  <option value="warehouse">Warehouse / Central Facility</option>
                  <option value="vehicle">Fleet Vehicle / Service Van</option>
                  <option value="cage">Secured Cage / Tool Crib</option>
                  <option value="job_site">Job Site Trailer / Storage</option>
                </select>
              </div>
              <div>
                <label className="font-semibold block mb-1">Code / Prefix</label>
                <input
                  type="text"
                  name="code"
                  defaultValue={locationModal.location?.code || ''}
                  placeholder="e.g. TR-01"
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 font-mono"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Physical Address / Notes</label>
                <input
                  type="text"
                  name="address"
                  defaultValue={locationModal.location?.address || ''}
                  placeholder="e.g. 100 Main St Shop Bay"
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-stone-100 dark:border-stone-800">
              <button
                type="button"
                onClick={() => setLocationModal({ open: false, location: null })}
                className="px-4 py-2 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-bold"
              >
                Save Location
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Purchase Order Restock Modal */}
      {showPoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-6 max-w-2xl w-full shadow-2xl space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                  🛒 Multi-Location Replenishment Purchase Order
                </h3>
                <p className="text-xs text-stone-500">
                  Automated restock calculation for items below minimum threshold.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPoModal(false)}
                className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {lowStockResult.lowStockCount === 0 ? (
              <div className="py-8 text-center text-xs text-stone-500">
                ✓ All stock items across all vans and depots are currently above minimum threshold.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-stone-50 dark:bg-stone-800/60 rounded-xl p-3 border border-stone-200 dark:border-stone-700 flex justify-between items-center text-xs">
                  <div>
                    <span className="font-semibold text-stone-700 dark:text-stone-300">Items Needing Restock: </span>
                    <strong className="text-amber-600 dark:text-amber-400 font-mono">
                      {lowStockResult.lowStockCount} items
                    </strong>
                  </div>
                  <div>
                    <span className="font-semibold text-stone-700 dark:text-stone-300">Estimated Total Cost: </span>
                    <strong className="text-emerald-600 dark:text-emerald-400 font-mono text-sm">
                      {lowStockResult.formattedRestockCost}
                    </strong>
                  </div>
                </div>

                <div className="max-h-80 overflow-y-auto border border-stone-200 dark:border-stone-800 rounded-xl">
                  <table className="w-full text-left text-xs text-stone-800 dark:text-stone-200">
                    <thead className="bg-stone-50 dark:bg-stone-800/80 sticky top-0 uppercase tracking-wider text-stone-500 text-[11px] border-b border-stone-200 dark:border-stone-800">
                      <tr>
                        <th className="py-2.5 px-3">Item &amp; Location</th>
                        <th className="py-2.5 px-3">Supplier</th>
                        <th className="py-2.5 px-3 text-center">On Hand / Min</th>
                        <th className="py-2.5 px-3 text-center">Order Qty</th>
                        <th className="py-2.5 px-3 text-right">Est. Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                      {lowStockResult.lowStockItems.map((item) => {
                        const needed = Math.max(item.reorderQty, item.minThreshold - item.quantityOnHand);
                        const cost = needed * item.unitCost;
                        return (
                          <tr key={item.id} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/40">
                            <td className="py-2.5 px-3">
                              <div className="font-bold">{item.name}</div>
                              <div className="text-[11px] font-mono text-stone-400">
                                {item.sku} · {item.location}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-stone-600 dark:text-stone-400">
                              {item.preferredSupplier || 'Generic Supplier'}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono">
                              <span className="text-amber-600 font-bold">{item.quantityOnHand}</span> / {item.minThreshold}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono font-bold text-orange-600 dark:text-orange-400">
                              +{needed} {item.unit}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold">
                              {formatUsdExact(cost)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center pt-3 border-t border-stone-100 dark:border-stone-800">
              <span className="text-xs text-stone-400">Export as PDF / Supplier CSV via Reports ledger.</span>
              <button
                type="button"
                onClick={() => setShowPoModal(false)}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-bold"
              >
                Close PO Sheet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
