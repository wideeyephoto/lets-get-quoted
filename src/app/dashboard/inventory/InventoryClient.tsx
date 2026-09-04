'use client';

import { useState, useTransition } from 'react';
import {
  Wrench,
  Truck,
  Boxes,
  ClipboardList,
  MapPin,
  Pencil,
  Trash2,
  Plus,
  Search,
  ArrowRight,
  ArrowLeftRight,
  Check,
  AlertTriangle,
  Gauge,
  FileText,
  X,
  ShieldCheck,
  Calendar,
  DollarSign,
  User,
  ExternalLink,
  ChevronDown,
  Tag,
  Activity,
  AlertCircle,
  Copy,
  Printer,
  SlidersHorizontal,
  HelpCircle,
  LayoutGrid,
  Grid,
  List,
  Camera,
  Image as ImageIcon,
  Sparkles,
  ShoppingBag,
  Zap,
  Loader2,
} from 'lucide-react';
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
  type DepreciationSchedule,
  TAX_GUIDANCE_SCHEDULES,
  COMMERCIAL_VEHICLE_TAX_TIP,
  calculateAssetDepreciation,
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
  autofillToolFromStoreAction,
  searchStoreCatalogAction,
} from './actions';
import { getTodayDateString, type StoreAutofillResult } from '@/lib/store-autofill';
import styles from './inventory.module.css';

interface InventoryClientProps {
  businessName: string;
  initialPayload?: InventoryPayload;
  crewMembers?: Array<{ id: string; name: string; role?: string }>;
  activeJobs?: Array<{ id: string; label: string; status?: string }>;
}

// ── Interactive Tax Guidance [?] Bubble Component ─────────────────────────────

function TaxHelpBubble({
  schedule,
  isVehicle = false,
}: {
  schedule?: DepreciationSchedule | null;
  isVehicle?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        aria-label="Tax guidance tip"
        title="View IRS tax guidance & depreciation rules"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className={styles.taxHelpBubble}
      >
        ?
      </button>

      {open && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 999 }}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
          />
          <div
            className={styles.taxHelpPopover}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.taxPopoverTitle}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <HelpCircle size={14} style={{ color: '#ff7a21' }} />
                <span>IRS Tax Depreciation Guide</span>
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className={styles.btnGhostIcon}
                style={{ width: '22px', height: '22px' }}
              >
                <X size={12} />
              </button>
            </div>

            {schedule && TAX_GUIDANCE_SCHEDULES[schedule] ? (
              <div>
                <div style={{ marginBottom: '0.45rem' }}>
                  <strong style={{ color: '#ffb580', fontSize: '0.82rem' }}>
                    {TAX_GUIDANCE_SCHEDULES[schedule].title}
                  </strong>
                </div>
                <p className={styles.taxPopoverText}>
                  {TAX_GUIDANCE_SCHEDULES[schedule].fullTip}
                </p>
                <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginBottom: '0.45rem' }}>
                  <strong style={{ color: '#cbd5e1' }}>Best for:</strong> {TAX_GUIDANCE_SCHEDULES[schedule].bestFor}
                </div>
              </div>
            ) : (
              <div>
                <p className={styles.taxPopoverText}>
                  Trade businesses can leverage accelerated tax write-offs for field equipment & fleet assets:
                </p>
                <div className={styles.taxPopoverList}>
                  <div className={styles.taxPopoverItem}>
                    <strong>Sec 179:</strong> 100% write-off in Year 1 up to $1.22M for qualifying tools & heavy work trucks (&gt;6k lbs GVWR).
                  </div>
                  <div className={styles.taxPopoverItem}>
                    <strong>De Minimis Safe Harbor:</strong> Immediate expense write-off for individual items & invoices under $2,500.
                  </div>
                  <div className={styles.taxPopoverItem}>
                    <strong>MACRS 5-Year:</strong> Standard 5-yr declining balance recovery for cargo vans, pickup trucks, and diagnostic computers.
                  </div>
                  <div className={styles.taxPopoverItem}>
                    <strong>Straight-Line 3-Year:</strong> Uniform 33.3%/yr write-down for high-wear cordless power tools and sewer jetters.
                  </div>
                </div>
              </div>
            )}

            {isVehicle && (
              <div
                style={{
                  background: 'rgba(56, 189, 248, 0.1)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  borderRadius: '6px',
                  padding: '0.4rem 0.55rem',
                  fontSize: '0.74rem',
                  color: '#bae6fd',
                  marginBottom: '0.45rem',
                }}
              >
                <strong>Truck Weight Rule:</strong> Work vehicles over 6,000 lbs GVWR are exempt from luxury passenger auto limits (Sec 280F) and qualify for full Section 179.
              </div>
            )}

            <p className={styles.taxPopoverDisclaimer}>
              * Tax guidelines for informational planning only. Consult your CPA or tax advisor for deduction elections.
            </p>
          </div>
        </>
      )}
    </span>
  );
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

  // Tool cards view mode: Large Tiles, Medium Tiles, List view
  const [toolViewMode, setToolViewMode] = useState<'large' | 'medium' | 'list'>('medium');

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

  // Modal active schedule states for live tax advice
  const [toolModalSchedule, setToolModalSchedule] = useState<DepreciationSchedule>('section_179');
  const [vehicleModalSchedule, setVehicleModalSchedule] = useState<DepreciationSchedule>('section_179');
  const [toolModalImageUrl, setToolModalImageUrl] = useState<string>('');
  const [toolModalFormKey, setToolModalFormKey] = useState(0);
  const [storeAutofillUrl, setStoreAutofillUrl] = useState('');
  const [storeAutofillLoading, setStoreAutofillLoading] = useState(false);
  const [storeAutofillSuccess, setStoreAutofillSuccess] = useState<string | null>(null);
  const [storeSearchResults, setStoreSearchResults] = useState<StoreAutofillResult[]>([]);
  const [showStoreDropdown, setShowStoreDropdown] = useState(false);

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
  const totalVehicleValue = vehicles.reduce((sum, v) => sum + (v.purchasePrice || 0), 0);
  const totalEquipmentValue = totalToolValue + totalVehicleValue;
  const totalDepreciatedToolValue = tools.reduce(
    (sum, t) =>
      sum +
      calculateAssetDepreciation(t.purchasePrice, t.purchaseDate, t.depreciationSchedule)
        .currentBookValue,
    0
  );
  const totalDepreciatedVehicleValue = vehicles.reduce(
    (sum, v) =>
      sum +
      calculateAssetDepreciation(v.purchasePrice, v.purchaseDate, v.depreciationSchedule)
        .currentBookValue,
    0
  );
  const totalDepreciatedBookValue = totalDepreciatedToolValue + totalDepreciatedVehicleValue;

  const totalStockValue = stock.reduce((sum, s) => sum + s.quantityOnHand * s.unitCost, 0);
  const checkedOutToolsCount = tools.filter((t) => t.status === 'checked_out').length;

  // Distinct locations for filters & dropdowns
  const availableLocationNames = Array.from(
    new Set([
      'Main Shop & Warehouse',
      ...locations.map((l) => l.name),
      ...stock.map((s) => s.location),
    ].filter(Boolean))
  );

  function openToolModal(tool: Partial<ToolAsset> | null = null) {
    setToolModal({ open: true, tool });
    const defaultSchedule =
      tool?.depreciationSchedule ||
      (tool?.purchasePrice && tool.purchasePrice < 2500 ? 'de_minimis' : 'section_179');
    setToolModalSchedule(defaultSchedule);
    setToolModalImageUrl(tool?.imageUrl || '');
    setStoreAutofillUrl('');
    setStoreAutofillSuccess(null);
    setStoreAutofillLoading(false);
    setStoreSearchResults([]);
    setShowStoreDropdown(false);
    setToolModalFormKey((k) => k + 1);
  }

  function applyStoreProduct(res: StoreAutofillResult) {
    setToolModal((prev) => ({
      ...prev,
      tool: {
        ...prev.tool,
        name: res.name,
        brand: res.brand,
        category: res.category,
        modelNumber: res.modelNumber,
        assetTag: prev.tool?.assetTag || res.assetTagSuggestion,
        serialNumber: res.sku || prev.tool?.serialNumber || null,
        purchasePrice: res.purchasePrice,
        purchaseDate: res.purchaseDate,
        depreciationSchedule: res.depreciationSchedule,
        imageUrl: res.imageUrl,
        notes: res.notes,
      },
    }));
    setToolModalImageUrl(res.imageUrl || '');
    setToolModalSchedule(res.depreciationSchedule);
    setStoreAutofillUrl(res.name);
    setShowStoreDropdown(false);
    setToolModalFormKey((k) => k + 1);
    setStoreAutofillSuccess(
      `Autofilled from ${res.retailer}: ${res.name} (${res.sku ? `${res.retailer === 'Home Depot' ? 'Internet #' : 'Item #'}${res.sku}` : 'Catalog'})`
    );
    showToast(`Loaded ${res.brand} ${res.name} from ${res.retailer}`);
  }

  async function handleStoreInputChange(val: string) {
    setStoreAutofillUrl(val);
    const trimmed = val.trim();
    if (!trimmed) {
      setStoreSearchResults([]);
      setShowStoreDropdown(false);
      return;
    }
    try {
      const results = await searchStoreCatalogAction(trimmed);
      setStoreSearchResults(results);
      setShowStoreDropdown(true);
    } catch {
      // ignore
    }
  }

  async function handleAutofillStore(urlToUse?: string) {
    const raw = (urlToUse || storeAutofillUrl).trim();
    if (!raw) {
      showToast('Please enter a tool keyword or paste a Home Depot / Lowe’s link', 'error');
      return;
    }
    setShowStoreDropdown(false);
    setStoreAutofillLoading(true);
    setStoreAutofillSuccess(null);
    try {
      const res = await autofillToolFromStoreAction(raw);
      if (res && res.success) {
        applyStoreProduct(res);
      } else {
        showToast('Could not find matching store product or catalog item', 'error');
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to autofill tool', 'error');
    } finally {
      setStoreAutofillLoading(false);
    }
  }

  function openVehicleModal(vehicle: Partial<FleetVehicle> | null = null) {
    setVehicleModal({ open: true, vehicle });
    setVehicleModalSchedule(vehicle?.depreciationSchedule || 'section_179');
  }

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
      imageUrl: (toolModalImageUrl || (fd.get('imageUrl') as string))?.trim() || null,
      modelNumber: (fd.get('modelNumber') as string) || null,
      serialNumber: (fd.get('serialNumber') as string) || null,
      purchasePrice: fd.get('purchasePrice') ? Number(fd.get('purchasePrice')) : null,
      purchaseDate: (fd.get('purchaseDate') as string)?.trim() || getTodayDateString(),
      depreciationSchedule: (fd.get('depreciationSchedule') as DepreciationSchedule) || null,
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
      purchasePrice: fd.get('purchasePrice') ? Number(fd.get('purchasePrice')) : null,
      purchaseDate: (fd.get('purchaseDate') as string)?.trim() || getTodayDateString(),
      depreciationSchedule: (fd.get('depreciationSchedule') as DepreciationSchedule) || null,
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
          return exists ? prev.map((t) => (t.id === saved.id ? saved : t)) : [saved, ...prev];
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
    <div className={styles.pageContainer}>
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`${styles.toast} ${toastMessage.type === 'success' ? styles.toastSuccess : styles.toastError}`}>
          {toastMessage.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Hero Header */}
      <section className={styles.hero}>
        <div className={styles.heroTop}>
          <div className={styles.heroCopy}>
            <div className={styles.titleRow}>
              <h1 className={styles.title}>Inventory &amp; Fleet</h1>
              <span className={styles.businessBadge}>
                <Wrench size={13} />
                <span>{businessName}</span>
              </span>
              {isPending && (
                <span className={styles.savingIndicator}>
                  <Activity size={12} /> Syncing...
                </span>
              )}
            </div>
            <p className={styles.subtitle}>
              Serialized tool custody, vehicle PM schedules, and van stock replenishment.
            </p>
          </div>

          {/* Quick Header Actions based on active tab */}
          <div className={styles.heroActions}>
            {activeTab === 'tools' && (
              <button
                type="button"
                onClick={() => openToolModal(null)}
                className={styles.btnPrimary}
              >
                <Plus size={16} /> Add Tool Asset
              </button>
            )}
            {activeTab === 'fleet' && (
              <button
                type="button"
                onClick={() => openVehicleModal(null)}
                className={styles.btnPrimary}
              >
                <Plus size={16} /> Add Fleet Vehicle
              </button>
            )}
            {activeTab === 'stock' && (
              <>
                <button
                  type="button"
                  onClick={() => setShowPoModal(true)}
                  className={styles.btnSecondary}
                >
                  <FileText size={16} /> Restock PO Sheet
                </button>
                <button
                  type="button"
                  onClick={() => setStockModal({ open: true, item: null })}
                  className={styles.btnPrimary}
                >
                  <Plus size={16} /> Add Stock Item
                </button>
              </>
            )}
            {activeTab === 'maintenance' && (
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
                className={styles.btnPrimary}
              >
                <Plus size={16} /> Log Service Record
              </button>
            )}
            {activeTab === 'locations' && (
              <button
                type="button"
                onClick={() => setLocationModal({ open: true, location: null })}
                className={styles.btnPrimary}
              >
                <Plus size={16} /> Add Location
              </button>
            )}
          </div>
        </div>
      </section>

      {/* KPI Metrics Strip */}
      <div className={styles.kpiGrid}>
        <div
          className={styles.kpiCard}
          onClick={() => {
            setActiveTab('tools');
            setToolFilter('all');
          }}
          title="View all equipment & asset tax basis"
        >
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>Fleet Asset Basis</span>
            <div className={styles.kpiIconWrap}>
              <Wrench size={16} />
            </div>
          </div>
          <div className={styles.kpiValue}>{formatUsdExact(totalEquipmentValue)}</div>
          <div className={`${styles.kpiNote} ${styles.kpiNoteGood}`}>
            <DollarSign size={13} /> Book Basis: {formatUsdExact(totalDepreciatedBookValue)}
          </div>
        </div>

        <div
          className={styles.kpiCard}
          onClick={() => {
            setActiveTab('stock');
            setShowPoModal(true);
          }}
          title="Open Restock PO Sheet"
        >
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>Low Stock Alert</span>
            <div className={styles.kpiIconWrap} style={{ color: lowStockResult.lowStockCount > 0 ? '#fbbf24' : '#34d399' }}>
              <Boxes size={16} />
            </div>
          </div>
          <div
            className={styles.kpiValue}
            style={{ color: lowStockResult.lowStockCount > 0 ? '#fbbf24' : '#34d399' }}
          >
            {lowStockResult.lowStockCount} {lowStockResult.lowStockCount === 1 ? 'item' : 'items'}
          </div>
          <div className={`${styles.kpiNote} ${lowStockResult.lowStockCount > 0 ? styles.kpiNoteWarn : styles.kpiNoteGood}`}>
            {lowStockResult.lowStockCount > 0 ? (
              <>
                <AlertTriangle size={13} /> Below replenishment min
              </>
            ) : (
              <>
                <Check size={13} /> All depot levels optimal
              </>
            )}
          </div>
        </div>

        <div
          className={styles.kpiCard}
          onClick={() => setActiveTab('fleet')}
          title="Review fleet maintenance schedules"
        >
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>Vehicle Service Due</span>
            <div className={styles.kpiIconWrap} style={{ color: maintenanceDueCount > 0 ? '#fbbf24' : '#34d399' }}>
              <Truck size={16} />
            </div>
          </div>
          <div
            className={styles.kpiValue}
            style={{ color: maintenanceDueCount > 0 ? '#fbbf24' : '#34d399' }}
          >
            {maintenanceDueCount} {maintenanceDueCount === 1 ? 'vehicle' : 'vehicles'}
          </div>
          <div className={`${styles.kpiNote} ${maintenanceDueCount > 0 ? styles.kpiNoteWarn : styles.kpiNoteGood}`}>
            {maintenanceDueCount > 0 ? (
              <>
                <AlertCircle size={13} /> PM service / inspection due
              </>
            ) : (
              <>
                <ShieldCheck size={13} /> Fleet compliant &amp; healthy
              </>
            )}
          </div>
        </div>

        <div
          className={styles.kpiCard}
          onClick={() => {
            setActiveTab('tools');
            setToolFilter('checked_out');
          }}
          title="Filter tools currently checked out"
        >
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>Field Custody</span>
            <div className={styles.kpiIconWrap} style={{ color: '#38bdf8' }}>
              <User size={16} />
            </div>
          </div>
          <div className={styles.kpiValue} style={{ color: '#38bdf8' }}>
            {checkedOutToolsCount} {checkedOutToolsCount === 1 ? 'tool' : 'tools'}
          </div>
          <div className={`${styles.kpiNote} ${styles.kpiNoteNeutral}`}>
            <Activity size={13} /> Active on technician vans &amp; jobs
          </div>
        </div>
      </div>

      {/* Segmented Navigation Tabs */}
      <div className={styles.tabNavWrapper}>
        <nav className={styles.tabNav} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'tools'}
            onClick={() => setActiveTab('tools')}
            className={`${styles.tabButton} ${activeTab === 'tools' ? styles.tabButtonActive : ''}`}
          >
            <Wrench size={18} />
            <span>Tools &amp; Equipment</span>
            <span className={`${styles.tabBadge} ${activeTab === 'tools' ? styles.tabBadgeActive : ''}`}>
              {tools.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'fleet'}
            onClick={() => setActiveTab('fleet')}
            className={`${styles.tabButton} ${activeTab === 'fleet' ? styles.tabButtonActive : ''}`}
          >
            <Truck size={18} />
            <span>Fleet Vehicles</span>
            <span className={`${styles.tabBadge} ${activeTab === 'fleet' ? styles.tabBadgeActive : ''}`}>
              {vehicles.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'stock'}
            onClick={() => setActiveTab('stock')}
            className={`${styles.tabButton} ${activeTab === 'stock' ? styles.tabButtonActive : ''}`}
          >
            <Boxes size={18} />
            <span>Van Stock &amp; Parts</span>
            <span className={`${styles.tabBadge} ${activeTab === 'stock' ? styles.tabBadgeActive : ''}`}>
              {stock.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'maintenance'}
            onClick={() => setActiveTab('maintenance')}
            className={`${styles.tabButton} ${activeTab === 'maintenance' ? styles.tabButtonActive : ''}`}
          >
            <ClipboardList size={18} />
            <span>Maintenance Log</span>
            <span className={`${styles.tabBadge} ${activeTab === 'maintenance' ? styles.tabBadgeActive : ''}`}>
              {maintenance.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'locations'}
            onClick={() => setActiveTab('locations')}
            className={`${styles.tabButton} ${activeTab === 'locations' ? styles.tabButtonActive : ''}`}
          >
            <MapPin size={18} />
            <span>Depots &amp; Vans</span>
            <span className={`${styles.tabBadge} ${activeTab === 'locations' ? styles.tabBadgeActive : ''}`}>
              {locations.length}
            </span>
          </button>
        </nav>
      </div>

      {/* ── TAB 1: TOOLS & EQUIPMENT ───────────────────────────────────────── */}
      {activeTab === 'tools' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Controls Bar */}
          <div className={styles.controlsBar}>
            <div className={styles.filterPills}>
              {(['all', 'available', 'checked_out', 'in_maintenance'] as const).map((status) => {
                const count =
                  status === 'all'
                    ? tools.length
                    : tools.filter((t) => t.status === status).length;
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setToolFilter(status)}
                    className={`${styles.filterPill} ${toolFilter === status ? styles.filterPillActive : ''}`}
                  >
                    <span>
                      {status === 'all'
                        ? 'All Tools'
                        : status === 'available'
                        ? 'Available in Shop'
                        : status === 'checked_out'
                        ? 'Checked Out'
                        : 'In Maintenance'}
                    </span>
                    <span style={{ opacity: 0.9, fontSize: '0.85rem', fontFamily: 'monospace', fontWeight: 700 }}>
                      ({count})
                    </span>
                  </button>
                );
              })}
            </div>

            <div className={styles.searchAndActions}>
              {/* View Mode Segmented Switcher */}
              <div className={styles.viewToggleGroup} role="group" aria-label="Tool view mode">
                <button
                  type="button"
                  onClick={() => setToolViewMode('large')}
                  className={`${styles.viewToggleButton} ${toolViewMode === 'large' ? styles.viewToggleButtonActive : ''}`}
                  title="Large Tiles View"
                >
                  <LayoutGrid size={15} />
                  <span>Large</span>
                </button>
                <button
                  type="button"
                  onClick={() => setToolViewMode('medium')}
                  className={`${styles.viewToggleButton} ${toolViewMode === 'medium' ? styles.viewToggleButtonActive : ''}`}
                  title="Medium Tiles View"
                >
                  <Grid size={15} />
                  <span>Medium</span>
                </button>
                <button
                  type="button"
                  onClick={() => setToolViewMode('list')}
                  className={`${styles.viewToggleButton} ${toolViewMode === 'list' ? styles.viewToggleButtonActive : ''}`}
                  title="List View"
                >
                  <List size={15} />
                  <span>List</span>
                </button>
              </div>

              <div className={styles.searchBox}>
                <Search size={16} className={styles.searchIcon} />
                <input
                  type="text"
                  placeholder="Search tools by name, tag, serial..."
                  value={toolSearch}
                  onChange={(e) => setToolSearch(e.target.value)}
                  className={styles.searchInput}
                />
              </div>
              <button
                type="button"
                onClick={() => openToolModal(null)}
                className={styles.btnPrimary}
              >
                <Plus size={16} /> Add Tool
              </button>
            </div>
          </div>

          {/* Tools Rendering by View Mode */}
          {filteredTools.length === 0 ? (
            <div className={styles.emptyState}>
              <Wrench size={40} style={{ color: '#cbd5e1' }} />
              <h3 className={styles.emptyStateTitle}>No equipment found</h3>
              <p className={styles.emptyStateCopy}>
                {toolSearch
                  ? `No tools match "${toolSearch}". Clear search or adjust filter.`
                  : 'No serialized tools are currently registered under this filter.'}
              </p>
              <button
                type="button"
                onClick={() => {
                  setToolSearch('');
                  setToolFilter('all');
                }}
                className={styles.btnSecondary}
              >
                Reset Filters
              </button>
            </div>
          ) : toolViewMode === 'list' ? (
            /* ---- LIST VIEW ---- */
            <div className={styles.toolsTableWrapper}>
              <table className={styles.toolsTable}>
                <thead>
                  <tr>
                    <th className={styles.toolsTh}>Asset Tag</th>
                    <th className={styles.toolsTh}>Tool Name &amp; Brand</th>
                    <th className={styles.toolsTh}>Category</th>
                    <th className={styles.toolsTh}>Status</th>
                    <th className={styles.toolsTh}>Location / Custody</th>
                    <th className={styles.toolsTh}>Purchased &amp; Schedule</th>
                    <th className={styles.toolsTh}>Cost &amp; Book Basis</th>
                    <th className={styles.toolsTh} style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTools.map((tool) => {
                    const desc = describeToolStatus(tool.status);
                    const isCheckedOut = tool.status === 'checked_out';
                    const depr = calculateAssetDepreciation(
                      tool.purchasePrice,
                      tool.purchaseDate,
                      tool.depreciationSchedule
                    );

                    return (
                      <tr key={tool.id} className={styles.toolsTr}>
                        <td className={styles.toolsTd}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                            <span className={styles.assetTagBadge}>{tool.assetTag}</span>
                            {tool.serialNumber && (
                              <span className={styles.serialNumberTag}>SN: {tool.serialNumber}</span>
                            )}
                          </div>
                        </td>
                        <td className={styles.toolsTd}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            {tool.imageUrl ? (
                              <img
                                src={tool.imageUrl}
                                alt={tool.name}
                                className={styles.toolTableThumb}
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              />
                            ) : (
                              <div className={styles.toolTableThumbFallback}>
                                <Wrench size={18} />
                              </div>
                            )}
                            <div>
                              <div style={{ fontWeight: 700, color: '#ffffff', fontSize: '0.9rem' }}>
                                {tool.name}
                              </div>
                              <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                                {tool.brand} {tool.modelNumber ? `• Mod: ${tool.modelNumber}` : ''}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className={styles.toolsTd}>
                          <span style={{ color: '#cbd5e1', fontSize: '0.84rem' }}>{tool.category}</span>
                        </td>
                        <td className={styles.toolsTd}>
                          <span
                            className={`${styles.statusBadge} ${
                              tool.status === 'available'
                                ? styles.statusAvailable
                                : tool.status === 'checked_out'
                                ? styles.statusCheckedOut
                                : styles.statusMaintenance
                            }`}
                          >
                            {tool.status === 'available' ? (
                              <Check size={12} />
                            ) : tool.status === 'checked_out' ? (
                              <User size={12} />
                            ) : (
                              <AlertTriangle size={12} />
                            )}
                            {desc.label}
                          </span>
                        </td>
                        <td className={styles.toolsTd}>
                          {isCheckedOut ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#ffb580', fontWeight: 600 }}>
                              <User size={13} /> {tool.assignedCrewName || 'Assigned Tech'}
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--inv-text-muted)' }}>
                              <MapPin size={13} /> {tool.locationName || 'Main Shop'}
                            </div>
                          )}
                        </td>
                        <td className={styles.toolsTd}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: '#e2e8f0' }}>
                              {tool.purchaseDate || 'N/A'}
                            </span>
                            <span className={styles.taxScheduleBadge}>{depr.scheduleBadge}</span>
                            <TaxHelpBubble schedule={tool.depreciationSchedule} />
                          </div>
                        </td>
                        <td className={styles.toolsTd}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                            <span style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                              Cost: <strong>{tool.purchasePrice ? formatUsdExact(tool.purchasePrice) : 'N/A'}</strong>
                            </span>
                            <span style={{ fontSize: '0.82rem', color: '#34d399', fontWeight: 700 }}>
                              Basis: {formatUsdExact(depr.currentBookValue)}
                            </span>
                          </div>
                        </td>
                        <td className={styles.toolsTd} style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                            {tool.status === 'available' ? (
                              <button
                                type="button"
                                onClick={() => handleOpenCheckout(tool)}
                                className={styles.btnActionCheckOut}
                                style={{ padding: '0.3rem 0.75rem', fontSize: '0.78rem' }}
                              >
                                Check Out <ArrowRight size={12} />
                              </button>
                            ) : tool.status === 'checked_out' ? (
                              <button
                                type="button"
                                onClick={() => handleOpenCheckin(tool)}
                                className={styles.btnActionReturn}
                                style={{ padding: '0.3rem 0.75rem', fontSize: '0.78rem' }}
                              >
                                Return <Check size={12} />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenCheckin(tool)}
                                className={styles.btnActionMaintenance}
                                style={{ padding: '0.3rem 0.75rem', fontSize: '0.78rem' }}
                              >
                                Release <Check size={12} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openToolModal(tool)}
                              className={styles.btnGhostIcon}
                              title="Edit Tool"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTool(tool)}
                              className={`${styles.btnGhostIcon} ${styles.btnGhostDanger}`}
                              title="Delete Tool"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* ---- GRID VIEW (Large Tiles or Medium Tiles) ---- */
            <div className={toolViewMode === 'large' ? styles.cardsGridLarge : styles.cardsGridMedium}>
              {filteredTools.map((tool) => {
                const desc = describeToolStatus(tool.status);
                const isCheckedOut = tool.status === 'checked_out';
                const isLarge = toolViewMode === 'large';
                const depr = calculateAssetDepreciation(
                  tool.purchasePrice,
                  tool.purchaseDate,
                  tool.depreciationSchedule
                );

                return (
                  <div key={tool.id} className={`${styles.assetCard} ${isLarge ? styles.assetCardLarge : ''}`}>
                    <div>
                      <div className={styles.cardHeader}>
                        <div className={styles.cardTagRow}>
                          <span className={styles.assetTagBadge}>{tool.assetTag}</span>
                          {tool.serialNumber && (
                            <span className={styles.serialNumberTag}>SN: {tool.serialNumber}</span>
                          )}
                        </div>
                        <span
                          className={`${styles.statusBadge} ${
                            tool.status === 'available'
                              ? styles.statusAvailable
                              : tool.status === 'checked_out'
                              ? styles.statusCheckedOut
                              : styles.statusMaintenance
                          }`}
                        >
                          {tool.status === 'available' ? (
                            <Check size={12} />
                          ) : tool.status === 'checked_out' ? (
                            <User size={12} />
                          ) : (
                            <AlertTriangle size={12} />
                          )}
                          {desc.label}
                        </span>
                      </div>

                      {tool.imageUrl && (
                        <div className={isLarge ? styles.toolPhotoWrapLarge : styles.toolPhotoWrapMedium}>
                          <img
                            src={tool.imageUrl}
                            alt={tool.name}
                            className={styles.toolPhotoImg}
                            onError={(e) => {
                              const parent = e.currentTarget.parentElement;
                              if (parent) parent.style.display = 'none';
                            }}
                          />
                        </div>
                      )}

                      <h3 className={styles.cardTitle} style={{ fontSize: isLarge ? '1.18rem' : '1.05rem' }}>
                        {tool.name}
                      </h3>
                      <div className={styles.cardMeta}>
                        {tool.brand} {tool.modelNumber ? `• Mod: ${tool.modelNumber}` : ''} • {tool.category}
                      </div>

                      {/* Checked out custody well */}
                      {isCheckedOut && (
                        <div className={styles.custodyBlock}>
                          <div className={styles.custodyRow}>
                            <span className={styles.custodyLabel}>
                              <User size={13} /> Assigned Tech:
                            </span>
                            <span className={styles.custodyValue}>
                              {tool.assignedCrewName || 'Assigned'}
                            </span>
                          </div>
                          {tool.assignedJobLabel && (
                            <div className={styles.custodyRow}>
                              <span className={styles.custodyLabel}>
                                <MapPin size={13} /> Destination:
                              </span>
                              <span
                                className={styles.custodyValue}
                                style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              >
                                {tool.assignedJobLabel}
                              </span>
                            </div>
                          )}
                          {tool.checkedOutAt && (
                            <div className={styles.custodyRow} style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>
                              <span className={styles.custodyLabel}>
                                <Calendar size={14} /> Checked Out:
                              </span>
                              <span style={{ fontWeight: 600, color: '#ffffff' }}>
                                {new Date(tool.checkedOutAt).toLocaleDateString()}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {tool.notes && (
                        <p className={styles.notesQuote}>&ldquo;{tool.notes}&rdquo;</p>
                      )}

                      {/* Tax Depreciation & Book Basis Strip */}
                      <div
                        style={{
                          marginTop: '0.75rem',
                          padding: isLarge ? '0.65rem 0.85rem' : '0.45rem 0.65rem',
                          borderRadius: '8px',
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: '1px solid var(--inv-border-subtle)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '0.8rem',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                          <span style={{ color: 'var(--inv-text-muted)' }}>
                            Cost Basis:{' '}
                            <strong style={{ color: '#ffffff' }}>
                              {tool.purchasePrice ? formatUsdExact(tool.purchasePrice) : 'N/A'}
                            </strong>
                            {tool.purchaseDate && (
                              <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginLeft: '0.35rem' }}>
                                ({tool.purchaseDate})
                              </span>
                            )}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <span className={styles.taxScheduleBadge}>{depr.scheduleBadge}</span>
                            <TaxHelpBubble schedule={tool.depreciationSchedule} />
                            <span style={{ color: '#94a3b8', fontSize: '0.74rem' }}>{depr.statusText}</span>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>
                            Book Value
                          </div>
                          <div className={styles.taxBookValue}>{formatUsdExact(depr.currentBookValue)}</div>
                        </div>
                      </div>
                    </div>

                    {/* Card Footer */}
                    <div className={styles.cardFooter}>
                      <div className={styles.cardActions} style={{ width: '100%', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button
                            type="button"
                            onClick={() => openToolModal(tool)}
                            className={styles.btnGhostIcon}
                            title="Edit Tool Details"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTool(tool)}
                            className={`${styles.btnGhostIcon} ${styles.btnGhostDanger}`}
                            title="Delete Tool"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        <div>
                          {tool.status === 'available' ? (
                            <button
                              type="button"
                              onClick={() => handleOpenCheckout(tool)}
                              className={styles.btnActionCheckOut}
                            >
                              Check Out <ArrowRight size={13} />
                            </button>
                          ) : tool.status === 'checked_out' ? (
                            <button
                              type="button"
                              onClick={() => handleOpenCheckin(tool)}
                              className={styles.btnActionReturn}
                            >
                              Return Tool <Check size={13} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenCheckin(tool)}
                              className={styles.btnActionMaintenance}
                            >
                              Release <Check size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: FLEET VEHICLES ──────────────────────────────────────────── */}
      {activeTab === 'fleet' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className={styles.controlsBar}>
            <div className={styles.searchBox} style={{ minWidth: '300px' }}>
              <Search size={14} className={styles.searchIcon} />
              <input
                type="text"
                placeholder="Search fleet by name, plate, driver, make..."
                value={vehicleSearch}
                onChange={(e) => setVehicleSearch(e.target.value)}
                className={styles.searchInput}
              />
            </div>

            <button
              type="button"
              onClick={() => setVehicleModal({ open: true, vehicle: null })}
              className={styles.btnPrimary}
            >
              <Plus size={16} /> Add Fleet Vehicle
            </button>
          </div>

          {filteredVehicles.length === 0 ? (
            <div className={styles.emptyState}>
              <Truck size={40} style={{ color: '#cbd5e1' }} />
              <h3 className={styles.emptyStateTitle}>No fleet vehicles found</h3>
              <p className={styles.emptyStateCopy}>
                {vehicleSearch
                  ? `No vehicles match "${vehicleSearch}". Clear search.`
                  : 'No fleet vehicles configured yet. Add your first service van.'}
              </p>
            </div>
          ) : (
            <div className={styles.cardsGrid}>
              {filteredVehicles.map((v) => {
                const statusDesc = describeVehicleStatus(v.status);
                const audit = auditVehicleMaintenance(v);
                const statusBadgeClass =
                  statusDesc.tone === 'success'
                    ? styles.statusAvailable
                    : statusDesc.tone === 'warn'
                    ? styles.statusMaintenance
                    : styles.statusDanger;

                const depr = calculateAssetDepreciation(v.purchasePrice, v.purchaseDate, v.depreciationSchedule);

                return (
                  <div key={v.id} className={styles.assetCard}>
                    <div>
                      <div className={styles.cardHeader}>
                        <div className={styles.cardTagRow}>
                          <span className={styles.assetTagBadge}>{v.licensePlate}</span>
                          <span className={styles.serialNumberTag}>VIN: {v.vin}</span>
                        </div>
                        <span className={`${styles.statusBadge} ${statusBadgeClass}`}>
                          {statusDesc.tone === 'success' ? <Check size={14} /> : <AlertTriangle size={14} />} {statusDesc.label}
                        </span>
                      </div>

                      <h3 className={styles.cardTitle}>{v.name}</h3>
                      <div className={styles.cardMeta}>
                        {v.year} {v.make} {v.model}
                      </div>

                      {/* Mileage & PM Alerts */}
                      <div style={{ marginTop: '0.95rem', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                        <div className={styles.mileageMeter}>
                          <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#cbd5e1' }}>Current Odometer</span>
                          <span className={styles.mileageFigure}>{v.currentMileage.toLocaleString()} mi</span>
                        </div>

                        <div className={styles.alertsStrip}>
                          {audit.isServiceOverdue && (
                            <div className={`${styles.alertItem} ${styles.alertDanger}`}>
                              <AlertCircle size={15} />
                              <span>PM Service overdue by {Math.abs(audit.milesUntilService ?? 0).toLocaleString()} miles</span>
                            </div>
                          )}
                          {!audit.isServiceOverdue && audit.isServiceDueSoon && (
                            <div className={`${styles.alertItem} ${styles.alertWarn}`}>
                              <AlertTriangle size={15} />
                              <span>PM Service due in {Math.abs(audit.milesUntilService ?? 0).toLocaleString()} miles</span>
                            </div>
                          )}
                          {audit.isInspectionExpired && (
                            <div className={`${styles.alertItem} ${styles.alertDanger}`}>
                              <AlertTriangle size={15} />
                              <span>State safety inspection expired!</span>
                            </div>
                          )}
                          {!audit.isServiceOverdue && !audit.isServiceDueSoon && !audit.isInspectionExpired && (
                            <div className={`${styles.alertItem} ${styles.alertGood}`}>
                              <Check size={15} />
                              <span>PM schedule compliant</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Driver & Assignment */}
                      <div className={styles.custodyBlock} style={{ marginTop: '0.95rem' }}>
                        <div className={styles.custodyRow}>
                          <span className={styles.custodyLabel}>
                            <User size={15} /> Primary Driver:
                          </span>
                          <span className={styles.custodyValue}>
                            {v.primaryDriverName ?? 'Unassigned Shop Pool'}
                          </span>
                        </div>

                        <div className={styles.custodyRow}>
                          <span className={styles.custodyLabel}>
                            <Gauge size={15} /> Odometer:
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#ffffff' }}>
                              {v.currentMileage.toLocaleString()} mi
                            </span>
                            <button
                              type="button"
                              onClick={() => setMileageModal({ open: true, vehicle: v, mileage: v.currentMileage })}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#ff9d5c',
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                textDecoration: 'underline',
                              }}
                            >
                              Update
                            </button>
                          </div>
                        </div>

                        <div className={styles.custodyRow}>
                          <span className={styles.custodyLabel}>
                            <Calendar size={15} /> Next PM Due:
                          </span>
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontWeight: 700,
                              color: audit.isServiceOverdue
                                ? '#f87171'
                                : audit.isServiceDueSoon
                                ? '#fbbf24'
                                : '#ffffff',
                            }}
                          >
                            {v.nextServiceDueMileage?.toLocaleString()} mi
                          </span>
                        </div>

                        {v.inspectionExpiresAt && (
                          <div className={styles.custodyRow} style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                            <span className={styles.custodyLabel}>
                              <ShieldCheck size={15} /> State Inspection:
                            </span>
                            <span style={{ color: audit.isInspectionExpired ? '#f87171' : '#ffffff', fontWeight: audit.isInspectionExpired ? 700 : 600 }}>
                              {v.inspectionExpiresAt}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Tax Depreciation & Book Value */}
                      <div
                        className={styles.taxBasisRow}
                        style={{
                          marginTop: '0.85rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.65rem 0.85rem',
                          background: 'rgba(15, 23, 42, 0.65)',
                          borderRadius: '8px',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                          <span style={{ color: 'var(--inv-text-muted)' }}>
                            Cost Basis:{' '}
                            <strong style={{ color: '#ffffff' }}>
                              {v.purchasePrice ? formatUsdExact(v.purchasePrice) : 'N/A'}
                            </strong>
                            {v.purchaseDate && (
                              <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginLeft: '0.35rem' }}>
                                ({v.purchaseDate})
                              </span>
                            )}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <span className={styles.taxScheduleBadge}>{depr.scheduleBadge}</span>
                            <TaxHelpBubble schedule={v.depreciationSchedule} isVehicle />
                            <span style={{ color: '#94a3b8', fontSize: '0.74rem' }}>{depr.statusText}</span>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>
                            Book Value
                          </div>
                          <div className={styles.taxBookValue}>{formatUsdExact(depr.currentBookValue)}</div>
                        </div>
                      </div>
                    </div>

                    {/* Card Footer */}
                    <div className={styles.cardFooter}>
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
                        className={styles.btnSecondary}
                        style={{ fontSize: '0.875rem', padding: '0.55rem 1.1rem' }}
                      >
                        <Plus size={15} /> Log PM Service
                      </button>

                      <div className={styles.cardActions}>
                        <button
                          type="button"
                          onClick={() => openVehicleModal(v)}
                          className={styles.btnGhostIcon}
                          title="Edit Vehicle"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteVehicle(v)}
                          className={`${styles.btnGhostIcon} ${styles.btnGhostDanger}`}
                          title="Delete Vehicle"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: MULTI-LOCATION VAN STOCK ────────────────────────────────── */}
      {activeTab === 'stock' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Low Stock Warning Banner */}
          {lowStockResult.lowStockCount > 0 && (
            <div className={styles.stockHeaderBanner}>
              <div className={styles.bannerCopy}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(251, 191, 36, 0.18)', display: 'grid', placeItems: 'center', color: '#fbbf24' }}>
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <div className={styles.bannerTitle}>
                    {lowStockResult.lowStockCount} items below minimum safety replenishment threshold
                  </div>
                  <div className={styles.bannerSub}>
                    Estimated restocking order: <strong>{lowStockResult.formattedRestockCost}</strong> across preferred wholesale suppliers.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPoModal(true)}
                className={styles.btnPrimary}
                style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', color: '#1c1200' }}
              >
                <FileText size={15} /> Generate Restock PO Sheet
              </button>
            </div>
          )}

          {/* Location Filters & Search Bar */}
          <div className={styles.controlsBar}>
            <div className={styles.filterPills}>
              <button
                type="button"
                onClick={() => setStockLocationFilter('all')}
                className={`${styles.filterPill} ${stockLocationFilter === 'all' ? styles.filterPillActive : ''}`}
              >
                <span>All Locations</span>
                <span style={{ opacity: 0.9, fontSize: '0.85rem', fontFamily: 'monospace', fontWeight: 700 }}>
                  ({stock.length})
                </span>
              </button>
              {availableLocationNames.map((loc) => {
                const count = stock.filter((s) => s.location === loc).length;
                return (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => setStockLocationFilter(loc)}
                    className={`${styles.filterPill} ${stockLocationFilter === loc ? styles.filterPillActive : ''}`}
                  >
                    <span>{loc}</span>
                    <span style={{ opacity: 0.9, fontSize: '0.85rem', fontFamily: 'monospace', fontWeight: 700 }}>
                      ({count})
                    </span>
                  </button>
                );
              })}
            </div>

            <div className={styles.searchAndActions}>
              <div className={styles.searchBox}>
                <Search size={16} className={styles.searchIcon} />
                <input
                  type="text"
                  placeholder="Search parts by SKU, name, supplier..."
                  value={stockSearch}
                  onChange={(e) => setStockSearch(e.target.value)}
                  className={styles.searchInput}
                />
              </div>

              <button
                type="button"
                onClick={() => setStockModal({ open: true, item: null })}
                className={styles.btnPrimary}
              >
                <Plus size={16} /> Add Part
              </button>
            </div>
          </div>

          {/* Stock Table */}
          <div className={styles.tableWrap}>
            <table className={styles.stockTable}>
              <thead>
                <tr>
                  <th>Item &amp; SKU</th>
                  <th>Category</th>
                  <th>Location</th>
                  <th style={{ textAlign: 'center' }}>On Hand / Min Level</th>
                  <th style={{ textAlign: 'right' }}>Unit Cost</th>
                  <th style={{ textAlign: 'right' }}>Total Value</th>
                  <th>Preferred Supplier</th>
                  <th style={{ textAlign: 'center' }}>Stock Health</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStock.map((item) => {
                  const isLow = item.quantityOnHand <= item.minThreshold;
                  const ratio = Math.min(100, Math.round((item.quantityOnHand / Math.max(1, item.minThreshold * 2)) * 100));

                  return (
                    <tr key={item.id}>
                      <td>
                        <div style={{ fontWeight: 700, color: '#ffffff', fontSize: '1rem' }}>{item.name}</div>
                        <div style={{ fontSize: '0.85rem', fontFamily: 'monospace', color: '#cbd5e1' }}>
                          {item.sku}
                        </div>
                      </td>
                      <td style={{ color: '#cbd5e1', fontSize: '0.92rem' }}>{item.category}</td>
                      <td>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            padding: '0.3rem 0.65rem',
                            borderRadius: '8px',
                            background: 'rgba(255, 255, 255, 0.08)',
                            border: '1px solid rgba(255, 255, 255, 0.18)',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            color: '#ffffff',
                          }}
                        >
                          <MapPin size={13} /> {item.location}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className={styles.stepperGroup}>
                          <button
                            type="button"
                            onClick={() => handleAdjustStock(item, -1)}
                            className={styles.stepperBtn}
                            title="Decrease quantity by 1"
                          >
                            -
                          </button>
                          <span
                            className={styles.stepperValue}
                            style={{ color: isLow ? '#fbbf24' : '#ffffff' }}
                          >
                            {item.quantityOnHand} {item.unit}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAdjustStock(item, 1)}
                            className={styles.stepperBtn}
                            title="Increase quantity by 1"
                          >
                            +
                          </button>
                        </div>
                        <div style={{ fontSize: '0.82rem', color: '#cbd5e1', marginTop: '0.3rem', fontWeight: 600 }}>
                          Min: {item.minThreshold} {item.unit}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#f1f5f9' }}>
                        {formatUsdExact(item.unitCost)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: '#ffffff', fontSize: '1rem' }}>
                        {formatUsdExact(item.quantityOnHand * item.unitCost)}
                      </td>
                      <td style={{ color: '#cbd5e1', fontSize: '0.92rem' }}>{item.preferredSupplier || '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span
                          className={`${styles.statusBadge} ${isLow ? styles.statusMaintenance : styles.statusAvailable}`}
                          style={{ fontSize: '0.85rem', padding: '0.25rem 0.65rem' }}
                        >
                          {isLow ? `Reorder +${item.reorderQty}` : 'Adequate'}
                        </span>
                        <div className={styles.stockLevelBarContainer} style={{ margin: '0.35rem auto 0' }}>
                          <div
                            className={styles.stockLevelBarFill}
                            style={{
                              width: `${ratio}%`,
                              background: isLow ? '#fbbf24' : '#34d399',
                            }}
                          />
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                          <button
                            type="button"
                            onClick={() => handleOpenTransfer(item)}
                            className={styles.btnSecondary}
                            style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem', borderRadius: '999px' }}
                            title="Transfer parts between vans or warehouse"
                          >
                            <ArrowLeftRight size={14} /> Transfer
                          </button>
                          <button
                            type="button"
                            onClick={() => setStockModal({ open: true, item })}
                            className={styles.btnGhostIcon}
                            title="Edit Stock Item"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteStock(item)}
                            className={`${styles.btnGhostIcon} ${styles.btnGhostDanger}`}
                            title="Delete Stock Item"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Transfers Log */}
          {transfers.length > 0 && (
            <div style={{ background: 'var(--inv-surface-elevated)', border: '1px solid var(--inv-border-strong)', borderRadius: '18px', padding: '1.4rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '1rem' }}>
                <ArrowLeftRight size={18} style={{ color: 'var(--accent)' }} />
                <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 700, color: '#ffffff' }}>
                  Recent Inter-Location Parts Transfers
                </h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '0.92rem' }}>
                {transfers.slice(0, 5).map((tr) => (
                  <div
                    key={tr.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.75rem 1rem',
                      borderRadius: '12px',
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                    }}
                  >
                    <div>
                      <strong style={{ color: '#ffffff' }}>
                        {tr.quantity} × {tr.itemName}
                      </strong>
                      <span style={{ color: '#cbd5e1' }}> from </span>
                      <span style={{ color: '#ffffff', fontWeight: 600 }}>{tr.fromLocation}</span>
                      <span style={{ color: '#cbd5e1' }}> → </span>
                      <span style={{ color: '#ffffff', fontWeight: 600 }}>{tr.toLocation}</span>
                      {tr.notes && <span style={{ color: '#cbd5e1', fontStyle: 'italic' }}> ({tr.notes})</span>}
                    </div>
                    <span style={{ color: '#cbd5e1', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      {new Date(tr.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 4: MAINTENANCE LOG ─────────────────────────────────────────── */}
      {activeTab === 'maintenance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className={styles.controlsBar}>
            <div>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 800, color: '#ffffff' }}>
                Equipment &amp; Fleet Service Ledger
              </h2>
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.95rem', color: '#cbd5e1' }}>
                Immutable audit records of oil changes, factory recalibrations, and safety inspections.
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
              className={styles.btnPrimary}
            >
              <Plus size={16} /> Log Service Record
            </button>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.stockTable}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Asset &amp; Type</th>
                  <th>Service Description</th>
                  <th>Performed By</th>
                  <th style={{ textAlign: 'right' }}>Cost</th>
                  <th>Next Due</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {maintenance.map((m) => (
                  <tr key={m.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600, color: '#ffffff' }}>{m.performedAt}</td>
                    <td>
                      <div style={{ fontWeight: 700, color: '#ffffff', fontSize: '1rem' }}>{m.assetName}</div>
                      <span
                        style={{
                          fontSize: '0.82rem',
                          fontFamily: 'monospace',
                          textTransform: 'uppercase',
                          color: '#ff9d5c',
                          background: 'rgba(255, 122, 33, 0.16)',
                          border: '1px solid rgba(255, 122, 33, 0.35)',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontWeight: 700,
                        }}
                      >
                        {m.assetType}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: '#f8fafc' }}>
                      {m.serviceType}
                      {m.mileageAtService && (
                        <div style={{ fontSize: '0.85rem', fontFamily: 'monospace', color: '#cbd5e1', marginTop: '0.2rem' }}>
                          At {m.mileageAtService.toLocaleString()} mi
                        </div>
                      )}
                    </td>
                    <td style={{ color: '#cbd5e1' }}>{m.performedBy}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: '#ffffff', fontSize: '1rem' }}>
                      {formatUsdExact(m.cost)}
                    </td>
                    <td style={{ fontFamily: 'monospace', color: '#cbd5e1' }}>{m.nextDueAt || '—'}</td>
                    <td style={{ fontStyle: 'italic', color: '#e2e8f0', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.notes || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 5: LOCATIONS & DEPOTS ──────────────────────────────────────── */}
      {activeTab === 'locations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className={styles.controlsBar}>
            <div>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 800, color: '#ffffff' }}>
                Depots, Warehouses &amp; Fleet Vehicles
              </h2>
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.95rem', color: '#cbd5e1' }}>
                Configure physical stock locations and vehicles for granular supply chain replenishment.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setLocationModal({ open: true, location: null })}
              className={styles.btnPrimary}
            >
              <Plus size={16} /> Add Location
            </button>
          </div>

          <div className={styles.cardsGrid}>
            {locations.map((loc) => {
              const stockCount = stock.filter((s) => s.location === loc.name).length;
              return (
                <div key={loc.id} className={styles.assetCard}>
                  <div>
                    <div className={styles.cardHeader}>
                      <span className={styles.assetTagBadge}>{loc.code || 'LOC'}</span>
                      <span
                        style={{
                          fontSize: '0.82rem',
                          fontFamily: 'monospace',
                          textTransform: 'uppercase',
                          padding: '0.25rem 0.65rem',
                          borderRadius: '999px',
                          background: 'rgba(255, 255, 255, 0.08)',
                          border: '1px solid rgba(255, 255, 255, 0.18)',
                          color: '#ffffff',
                          fontWeight: 700,
                        }}
                      >
                        {loc.type}
                      </span>
                    </div>

                    <h3 className={styles.cardTitle}>{loc.name}</h3>
                    <p style={{ margin: '0.35rem 0 0', fontSize: '0.92rem', color: '#cbd5e1' }}>
                      {loc.address || 'Standard Company Depot'}
                    </p>

                    <div style={{ marginTop: '0.95rem', padding: '0.85rem 1rem', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.1)', fontSize: '0.92rem' }}>
                      <span style={{ color: '#cbd5e1' }}>Stock items stocked: </span>
                      <strong style={{ fontFamily: 'monospace', color: '#ffffff', fontWeight: 800 }}>{stockCount} items</strong>
                    </div>
                  </div>

                  <div className={styles.cardFooter}>
                    <span style={{ fontSize: '0.85rem', color: '#34d399', fontWeight: 600 }}>Active Facility</span>
                    <div className={styles.cardActions}>
                      <button
                        type="button"
                        onClick={() => setLocationModal({ open: true, location: loc })}
                        className={styles.btnGhostIcon}
                        title="Edit Location"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteLocation(loc)}
                        className={`${styles.btnGhostIcon} ${styles.btnGhostDanger}`}
                        title="Delete Location"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
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
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>Check Out: {checkoutTool.name}</h3>
                <span style={{ fontSize: '0.78rem', fontFamily: 'monospace', color: 'var(--accent-ink)' }}>
                  Asset Tag: {checkoutTool.assetTag}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setCheckoutTool(null)}
                className={styles.btnGhostIcon}
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.formField}>
                <label className={styles.fieldLabel}>Assign to Technician / Crew Member *</label>
                <select
                  aria-label="Assign to crew member or technician"
                  value={selectedCrewName}
                  onChange={(e) => setSelectedCrewName(e.target.value)}
                  className={styles.fieldSelect}
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

              <div className={styles.formField}>
                <label className={styles.fieldLabel}>Destination Job Site / Location</label>
                <input
                  type="text"
                  value={selectedJobLabel}
                  onChange={(e) => setSelectedJobLabel(e.target.value)}
                  placeholder="e.g. 142 Ridgewood Rd - Water Heater Replacement"
                  className={styles.fieldInput}
                />
              </div>

              <div className={styles.formField}>
                <label className={styles.fieldLabel}>Custody Notes / Included Jaws &amp; Dies</label>
                <textarea
                  rows={2}
                  value={checkoutNotes}
                  onChange={(e) => setCheckoutNotes(e.target.value)}
                  placeholder="e.g. Includes 1/2 to 2 ProPress jaws in hard case"
                  className={styles.fieldTextarea}
                />
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                onClick={() => setCheckoutTool(null)}
                className={styles.btnSecondary}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmCheckout}
                className={styles.btnPrimary}
              >
                Confirm Custody <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Check In / Return Tool Modal */}
      {checkinTool && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>Return Tool: {checkinTool.name}</h3>
                <span style={{ fontSize: '0.78rem', fontFamily: 'monospace', color: 'var(--accent-ink)' }}>
                  Asset Tag: {checkinTool.assetTag}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setCheckinTool(null)}
                className={styles.btnGhostIcon}
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.formField}>
                <label className={styles.fieldLabel}>Return Condition *</label>
                <select
                  aria-label="Return condition"
                  value={checkinCondition}
                  onChange={(e) => setCheckinCondition(e.target.value as ToolAssetStatus)}
                  className={styles.fieldSelect}
                >
                  <option value="available">Available in Shop Pool (Good Working Condition)</option>
                  <option value="in_maintenance">Needs Service / Maintenance / Calibration</option>
                  <option value="lost_damaged">Reported Lost or Damaged</option>
                </select>
              </div>

              <div className={styles.formField}>
                <label className={styles.fieldLabel}>Check-in Notes</label>
                <textarea
                  rows={2}
                  value={checkinNotes}
                  onChange={(e) => setCheckinNotes(e.target.value)}
                  placeholder="e.g. Returned clean, battery charged, placed in Bay 2"
                  className={styles.fieldTextarea}
                />
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                onClick={() => setCheckinTool(null)}
                className={styles.btnSecondary}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmCheckin}
                className={styles.btnPrimary}
              >
                Confirm Return <Check size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Tool Modal */}
      {toolModal.open && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                {toolModal.tool ? 'Edit Tool Asset' : 'Register New Tool Asset'}
              </h3>
              <button
                type="button"
                onClick={() => setToolModal({ open: false, tool: null })}
                className={styles.btnGhostIcon}
              >
                <X size={18} />
              </button>
            </div>

            <form key={toolModalFormKey} onSubmit={handleSaveTool} className={styles.formGrid}>
              {/* Store Autofill from Home Depot & Lowe's */}
              <div className={styles.storeAutofillCard}>
                <div className={styles.storeAutofillHeader}>
                  <div className={styles.storeAutofillTitle}>
                    <Sparkles size={15} style={{ color: '#ff7a21' }} />
                    Autofill from Home Depot &amp; Lowe&apos;s
                  </div>
                  <div className={styles.storeBadges}>
                    <span className={styles.storeBadgeHD}>Home Depot</span>
                    <span className={styles.storeBadgeLowes}>Lowe&apos;s</span>
                  </div>
                </div>

                <div className={styles.storeInputGroup}>
                  <div className={styles.storeInputWrap}>
                    <input
                      type="text"
                      value={storeAutofillUrl}
                      onChange={(e) => handleStoreInputChange(e.target.value)}
                      onFocus={() => {
                        if (storeAutofillUrl.trim().length > 0 && storeSearchResults.length > 0) {
                          setShowStoreDropdown(true);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (storeSearchResults.length > 0) {
                            applyStoreProduct(storeSearchResults[0]);
                          } else {
                            handleAutofillStore();
                          }
                        } else if (e.key === 'Escape') {
                          setShowStoreDropdown(false);
                        }
                      }}
                      placeholder="Search store catalog (e.g. pipe, drill, bandsaw) or paste URL..."
                      className={styles.storeUrlInput}
                    />

                    {showStoreDropdown && (
                      <div className={styles.storeSearchResultsDropdown}>
                        <div className={styles.storeSearchResultsHeader}>
                          <span>Matching Home Depot &amp; Lowe&apos;s Products ({storeSearchResults.length})</span>
                          <button
                            type="button"
                            onClick={() => setShowStoreDropdown(false)}
                            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.72rem' }}
                          >
                            Close ✕
                          </button>
                        </div>
                        {storeSearchResults.length > 0 ? (
                          storeSearchResults.map((item, idx) => (
                            <button
                              key={item.sku || `${item.name}-${idx}`}
                              type="button"
                              className={styles.storeSearchResultItem}
                              onClick={() => applyStoreProduct(item)}
                            >
                              {item.imageUrl ? (
                                <img
                                  src={item.imageUrl}
                                  alt={item.name}
                                  className={styles.storeResultThumb}
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                  }}
                                />
                              ) : (
                                <div className={styles.storeResultThumb} style={{ display: 'grid', placeItems: 'center' }}>
                                  <Sparkles size={16} style={{ color: '#ff7a21' }} />
                                </div>
                              )}
                              <div className={styles.storeResultInfo}>
                                <div className={styles.storeResultTitleRow}>
                                  <span
                                    className={
                                      item.retailer === 'Home Depot'
                                        ? styles.storeResultBadgeHD
                                        : styles.storeResultBadgeLowes
                                    }
                                  >
                                    {item.retailer}
                                  </span>
                                  <span className={styles.storeResultTitle}>{item.name}</span>
                                </div>
                                <div className={styles.storeResultMeta}>
                                  <span>{item.brand}</span>
                                  {item.modelNumber && <span>· Model #{item.modelNumber}</span>}
                                  {item.sku && (
                                    <span>
                                      · {item.retailer === 'Home Depot' ? 'Internet #' : 'Item #'}{item.sku}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {item.purchasePrice !== null && (
                                <div className={styles.storeResultPrice}>
                                  {formatUsdExact(item.purchasePrice)}
                                </div>
                              )}
                            </button>
                          ))
                        ) : (
                          <div className={styles.storeSearchEmpty}>
                            No matching contractor tools found in store catalog for &ldquo;{storeAutofillUrl}&rdquo;.
                            <br />
                            Try searching for <em>&ldquo;pipe&rdquo;</em>, <em>&ldquo;drill&rdquo;</em>, <em>&ldquo;bandsaw&rdquo;</em>, or paste a product link.
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={storeAutofillLoading}
                    onClick={() => {
                      if (storeSearchResults.length > 0) {
                        applyStoreProduct(storeSearchResults[0]);
                      } else {
                        handleAutofillStore();
                      }
                    }}
                    className={styles.storeAutofillBtn}
                  >
                    {storeAutofillLoading ? (
                      <>
                        <Loader2 size={13} className={styles.spinner} />
                        Autofilling...
                      </>
                    ) : (
                      <>
                        <Zap size={13} />
                        Autofill Tool
                      </>
                    )}
                  </button>
                </div>

                <div className={styles.storePresetRow}>
                  <span>Popular contractor tools:</span>
                  <button
                    type="button"
                    className={styles.storePresetTagHD}
                    onClick={() =>
                      handleAutofillStore(
                        'https://www.homedepot.com/p/RIDGID-18-in-Heavy-Duty-Straight-Pipe-Wrench-31025/100072045'
                      )
                    }
                  >
                    HD: RIDGID 18&quot; Pipe Wrench
                  </button>
                  <button
                    type="button"
                    className={styles.storePresetTagHD}
                    onClick={() =>
                      handleAutofillStore(
                        'https://www.homedepot.com/p/RIDGID-RP-351-ProPress-Press-Tool-Kit-with-1-2-in-to-2-in-ProPress-Jaws-67123/319409824'
                      )
                    }
                  >
                    HD: RIDGID ProPress
                  </button>
                  <button
                    type="button"
                    className={styles.storePresetTagHD}
                    onClick={() =>
                      handleAutofillStore(
                        'https://www.homedepot.com/p/Milwaukee-M18-FUEL-18V-Lithium-Ion-Brushless-Cordless-Deep-Cut-Band-Saw-Tool-Only-2729-20/205629470'
                      )
                    }
                  >
                    HD: Milwaukee Band Saw
                  </button>
                  <button
                    type="button"
                    className={styles.storePresetTagHD}
                    onClick={() =>
                      handleAutofillStore(
                        'https://www.homedepot.com/p/Klein-Tools-Digital-Multimeter-600V-Auto-Ranging-MM400/206517333'
                      )
                    }
                  >
                    HD: Klein Multimeter
                  </button>
                  <button
                    type="button"
                    className={styles.storePresetTagLowes}
                    onClick={() =>
                      handleAutofillStore(
                        'https://www.lowes.com/pd/DEWALT-20V-MAX-1-2-in-Brushless-Cordless-Drill-Driver/1000135831'
                      )
                    }
                  >
                    Lowe&apos;s: DEWALT Drill
                  </button>
                  <button
                    type="button"
                    className={styles.storePresetTagLowes}
                    onClick={() =>
                      handleAutofillStore(
                        'https://www.lowes.com/pd/Kobalt-14-in-Steel-Pipe-Wrench/807387'
                      )
                    }
                  >
                    Lowe&apos;s: Kobalt Pipe Wrench
                  </button>
                </div>

                {storeAutofillSuccess && (
                  <div className={styles.storeSuccessBanner}>
                    <Check size={14} style={{ flexShrink: 0 }} />
                    <span>{storeAutofillSuccess}</span>
                  </div>
                )}
              </div>

              <div className={styles.formField}>
                <label className={styles.fieldLabel}>Tool Name *</label>
                <input
                  type="text"
                  name="name"
                  required
                  defaultValue={toolModal.tool?.name || ''}
                  placeholder="e.g. RIDGID RP 351 ProPress Press Tool"
                  className={styles.fieldInput}
                />
              </div>

              <div className={styles.formGrid2Col}>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Brand *</label>
                  <input
                    type="text"
                    name="brand"
                    required
                    defaultValue={toolModal.tool?.brand || ''}
                    placeholder="e.g. RIDGID"
                    className={styles.fieldInput}
                  />
                </div>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Category *</label>
                  <input
                    type="text"
                    name="category"
                    required
                    defaultValue={toolModal.tool?.category || 'Pipe Joining'}
                    placeholder="e.g. Drain Cleaning, Diagnostics"
                    className={styles.fieldInput}
                  />
                </div>
              </div>

              <div className={styles.formGrid2Col}>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Asset Tag *</label>
                  <input
                    type="text"
                    name="assetTag"
                    required
                    defaultValue={toolModal.tool?.assetTag || `TAG-${Date.now().toString().slice(-4)}`}
                    className={styles.fieldInput}
                  />
                </div>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Serial Number</label>
                  <input
                    type="text"
                    name="serialNumber"
                    defaultValue={toolModal.tool?.serialNumber || ''}
                    placeholder="e.g. RP351-884920"
                    className={styles.fieldInput}
                  />
                </div>
              </div>

              <div className={styles.formGrid2Col}>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Model Number</label>
                  <input
                    type="text"
                    name="modelNumber"
                    defaultValue={toolModal.tool?.modelNumber || ''}
                    placeholder="e.g. RP 351"
                    className={styles.fieldInput}
                  />
                </div>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Storage Location / Depot</label>
                  <select
                    aria-label="Storage location or depot"
                    name="locationName"
                    defaultValue={toolModal.tool?.locationName || availableLocationNames[0]}
                    className={styles.fieldSelect}
                  >
                    {availableLocationNames.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={styles.formGrid2Col}>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Purchase Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    name="purchasePrice"
                    defaultValue={toolModal.tool?.purchasePrice ?? ''}
                    placeholder="e.g. 3850.00"
                    className={styles.fieldInput}
                  />
                </div>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Purchase Date</label>
                  <input
                    type="date"
                    name="purchaseDate"
                    defaultValue={toolModal.tool?.purchaseDate || getTodayDateString()}
                    className={styles.fieldInput}
                  />
                </div>
              </div>

              <div className={styles.formField}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <label className={styles.fieldLabel} style={{ marginBottom: 0 }}>
                    Tax Depreciation Schedule
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <TaxHelpBubble schedule={toolModalSchedule} />
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>IRS Tax Guidance [?]</span>
                  </div>
                </div>
                <select
                  aria-label="Tax depreciation schedule"
                  name="depreciationSchedule"
                  value={toolModalSchedule}
                  onChange={(e) => setToolModalSchedule(e.target.value as DepreciationSchedule)}
                  className={styles.fieldSelect}
                >
                  <option value="section_179">Section 179 (100% Immediate Write-Off)</option>
                  <option value="de_minimis">De Minimis Safe Harbor (Under $2,500 Full Expense)</option>
                  <option value="macrs_5">MACRS 5-Year (Vehicles &amp; Tech Equipment)</option>
                  <option value="macrs_7">MACRS 7-Year (General Equipment &amp; Machinery)</option>
                  <option value="straight_line_3">Straight-Line 3-Year (High-Wear Tools)</option>
                  <option value="straight_line_5">Straight-Line 5-Year (Uniform Accounting)</option>
                  <option value="none">No Depreciation (Hold at Cost Basis)</option>
                </select>
                {toolModalSchedule && TAX_GUIDANCE_SCHEDULES[toolModalSchedule] && (
                  <div className={styles.taxTipBox}>
                    <p style={{ margin: 0, fontWeight: 600, color: '#ffb580' }}>
                      {TAX_GUIDANCE_SCHEDULES[toolModalSchedule].title}
                    </p>
                    <p style={{ margin: '0.2rem 0 0 0', color: '#cbd5e1' }}>
                      {TAX_GUIDANCE_SCHEDULES[toolModalSchedule].shortTip} Best for: <em>{TAX_GUIDANCE_SCHEDULES[toolModalSchedule].bestFor}</em>
                    </p>
                  </div>
                )}
              </div>

              <div className={styles.formField}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label className={styles.fieldLabel}>Tool Photo (Optional)</label>
                  {toolModalImageUrl && (
                    <button
                      type="button"
                      onClick={() => setToolModalImageUrl('')}
                      className={styles.photoClearBtn}
                    >
                      Clear Photo
                    </button>
                  )}
                </div>

                <div className={styles.photoFieldWrap}>
                  {toolModalImageUrl ? (
                    <div className={styles.photoPreviewWrap}>
                      <img
                        src={toolModalImageUrl}
                        alt="Tool preview"
                        className={styles.photoPreviewImg}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                  ) : (
                    <div className={styles.photoPreviewPlaceholder}>
                      <Camera size={20} style={{ opacity: 0.6 }} />
                      <span>Optional Photo</span>
                    </div>
                  )}

                  <div className={styles.photoInputWrap}>
                    <input
                      type="text"
                      name="imageUrl"
                      value={toolModalImageUrl}
                      onChange={(e) => setToolModalImageUrl(e.target.value)}
                      placeholder="e.g. /images/tools/ridgid-propress.jpg or image URL"
                      className={styles.fieldInput}
                    />
                    <div className={styles.photoPresetRow}>
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Presets:</span>
                      <button
                        type="button"
                        className={styles.photoPresetBtn}
                        onClick={() => setToolModalImageUrl('/images/tools/ridgid-propress.jpg')}
                      >
                        ProPress
                      </button>
                      <button
                        type="button"
                        className={styles.photoPresetBtn}
                        onClick={() => setToolModalImageUrl('/images/tools/spartan-jetter.jpg')}
                      >
                        Jetter
                      </button>
                      <button
                        type="button"
                        className={styles.photoPresetBtn}
                        onClick={() => setToolModalImageUrl('/images/tools/flir-thermal.jpg')}
                      >
                        FLIR
                      </button>
                      <button
                        type="button"
                        className={styles.photoPresetBtn}
                        onClick={() => setToolModalImageUrl('/images/tools/milwaukee-bandsaw.jpg')}
                      >
                        Band Saw
                      </button>
                      <button
                        type="button"
                        className={styles.photoPresetBtn}
                        onClick={() => setToolModalImageUrl('/images/tools/fieldpiece-manifold.jpg')}
                      >
                        Manifold
                      </button>
                      <button
                        type="button"
                        className={styles.photoPresetBtn}
                        onClick={() => setToolModalImageUrl('/images/tools/generic-tool.jpg')}
                      >
                        Packout
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.formField}>
                <label className={styles.fieldLabel}>Notes &amp; Accessories</label>
                <textarea
                  name="notes"
                  rows={2}
                  defaultValue={toolModal.tool?.notes || ''}
                  placeholder="e.g. Stored in Shop Bay 2. Includes copper jaws."
                  className={styles.fieldTextarea}
                />
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  onClick={() => setToolModal({ open: false, tool: null })}
                  className={styles.btnSecondary}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.btnPrimary}>
                  Save Asset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Update Mileage Modal */}
      {mileageModal.open && mileageModal.vehicle && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent} style={{ maxWidth: '440px' }}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>Update Odometer</h3>
                <span style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>
                  {mileageModal.vehicle.name} ({mileageModal.vehicle.licensePlate})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMileageModal({ open: false, vehicle: null, mileage: 0 })}
                className={styles.btnGhostIcon}
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.formField}>
                <label className={styles.fieldLabel}>New Odometer Reading (Miles) *</label>
                <input
                  type="number"
                  value={mileageModal.mileage}
                  onChange={(e) => setMileageModal((prev) => ({ ...prev, mileage: Number(e.target.value) }))}
                  className={styles.fieldInput}
                  style={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 700 }}
                />
              </div>
              <span style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 500 }}>
                Previous recorded mileage: {mileageModal.vehicle.currentMileage.toLocaleString()} mi
              </span>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                onClick={() => setMileageModal({ open: false, vehicle: null, mileage: 0 })}
                className={styles.btnSecondary}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmMileage}
                className={styles.btnPrimary}
              >
                Update Reading
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Fleet Vehicle Modal */}
      {vehicleModal.open && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                {vehicleModal.vehicle ? 'Edit Fleet Vehicle' : 'Register New Fleet Vehicle'}
              </h3>
              <button
                type="button"
                onClick={() => setVehicleModal({ open: false, vehicle: null })}
                className={styles.btnGhostIcon}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveVehicle} className={styles.formGrid}>
              <div className={styles.formField}>
                <label className={styles.fieldLabel}>Vehicle Name / Unit Identifier *</label>
                <input
                  type="text"
                  name="name"
                  required
                  defaultValue={vehicleModal.vehicle?.name || 'Van #3 (Service)'}
                  className={styles.fieldInput}
                />
              </div>

              <div className={styles.formGrid2Col}>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Make *</label>
                  <input
                    type="text"
                    name="make"
                    required
                    defaultValue={vehicleModal.vehicle?.make || 'Ford'}
                    className={styles.fieldInput}
                  />
                </div>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Model *</label>
                  <input
                    type="text"
                    name="model"
                    required
                    defaultValue={vehicleModal.vehicle?.model || 'Transit 250'}
                    className={styles.fieldInput}
                  />
                </div>
              </div>

              <div className={styles.formGrid2Col}>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Year *</label>
                  <input
                    type="number"
                    name="year"
                    required
                    defaultValue={vehicleModal.vehicle?.year || new Date().getFullYear()}
                    className={styles.fieldInput}
                  />
                </div>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>License Plate *</label>
                  <input
                    type="text"
                    name="licensePlate"
                    required
                    defaultValue={vehicleModal.vehicle?.licensePlate || ''}
                    className={styles.fieldInput}
                  />
                </div>
              </div>

              <div className={styles.formGrid2Col}>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Current Mileage</label>
                  <input
                    type="number"
                    name="currentMileage"
                    defaultValue={vehicleModal.vehicle?.currentMileage || 0}
                    className={styles.fieldInput}
                  />
                </div>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Next PM Due (Mileage)</label>
                  <input
                    type="number"
                    name="nextServiceDueMileage"
                    defaultValue={vehicleModal.vehicle?.nextServiceDueMileage || 30000}
                    className={styles.fieldInput}
                  />
                </div>
              </div>

              <div className={styles.formGrid2Col}>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Primary Driver Name</label>
                  <input
                    type="text"
                    name="primaryDriverName"
                    defaultValue={vehicleModal.vehicle?.primaryDriverName || ''}
                    placeholder="e.g. Carlos Ramirez"
                    className={styles.fieldInput}
                  />
                </div>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>State Inspection Expiration</label>
                  <input
                    type="date"
                    name="inspectionExpiresAt"
                    defaultValue={vehicleModal.vehicle?.inspectionExpiresAt || ''}
                    className={styles.fieldInput}
                  />
                </div>
              </div>

              <div className={styles.formGrid2Col}>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Purchase Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    name="purchasePrice"
                    defaultValue={vehicleModal.vehicle?.purchasePrice ?? ''}
                    placeholder="e.g. 48500.00"
                    className={styles.fieldInput}
                  />
                </div>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Purchase Date</label>
                  <input
                    type="date"
                    name="purchaseDate"
                    defaultValue={vehicleModal.vehicle?.purchaseDate || getTodayDateString()}
                    className={styles.fieldInput}
                  />
                </div>
              </div>

              <div className={styles.formField}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <label className={styles.fieldLabel} style={{ marginBottom: 0 }}>
                    Tax Depreciation Schedule
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <TaxHelpBubble schedule={vehicleModalSchedule} isVehicle />
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>IRS Tax Guidance [?]</span>
                  </div>
                </div>
                <select
                  aria-label="Vehicle tax depreciation schedule"
                  name="depreciationSchedule"
                  value={vehicleModalSchedule}
                  onChange={(e) => setVehicleModalSchedule(e.target.value as DepreciationSchedule)}
                  className={styles.fieldSelect}
                >
                  <option value="section_179">Section 179 (100% Write-Off for &gt;6,000 lb GVWR Work Trucks)</option>
                  <option value="macrs_5">MACRS 5-Year (Standard Fleet Vehicles &amp; Cargo Vans)</option>
                  <option value="straight_line_5">Straight-Line 5-Year (Uniform Accounting)</option>
                  <option value="none">No Depreciation (Hold at Cost Basis)</option>
                </select>
                <div className={styles.taxTipBox}>
                  <p style={{ margin: 0, fontWeight: 600, color: '#38bdf8' }}>
                    Heavy Commercial Vehicle Tax Tip (&gt;6,000 lbs GVWR):
                  </p>
                  <p style={{ margin: '0.2rem 0 0 0', color: '#cbd5e1' }}>
                    {COMMERCIAL_VEHICLE_TAX_TIP}
                  </p>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  onClick={() => setVehicleModal({ open: false, vehicle: null })}
                  className={styles.btnSecondary}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.btnPrimary}>
                  Save Vehicle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Stock Item Modal */}
      {stockModal.open && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                {stockModal.item ? 'Edit Van Stock Part' : 'Add New Van Stock Part'}
              </h3>
              <button
                type="button"
                onClick={() => setStockModal({ open: false, item: null })}
                className={styles.btnGhostIcon}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveStockItem} className={styles.formGrid}>
              <div className={styles.formField}>
                <label className={styles.fieldLabel}>Item Name *</label>
                <input
                  type="text"
                  name="name"
                  required
                  defaultValue={stockModal.item?.name || ''}
                  placeholder="e.g. 3/4-inch ProPress Copper Coupling"
                  className={styles.fieldInput}
                />
              </div>

              <div className={styles.formGrid2Col}>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>SKU *</label>
                  <input
                    type="text"
                    name="sku"
                    required
                    defaultValue={stockModal.item?.sku || ''}
                    placeholder="e.g. VIEGA-78052"
                    className={styles.fieldInput}
                  />
                </div>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Category *</label>
                  <input
                    type="text"
                    name="category"
                    required
                    defaultValue={stockModal.item?.category || 'Fittings'}
                    className={styles.fieldInput}
                  />
                </div>
              </div>

              <div className={styles.formGrid2Col}>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Stock Location *</label>
                  <select
                    aria-label="Item location"
                    name="location"
                    defaultValue={stockModal.item?.location || availableLocationNames[0] || 'Main Shop & Warehouse'}
                    className={styles.fieldSelect}
                  >
                    {availableLocationNames.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Unit of Measure</label>
                  <input
                    type="text"
                    name="unit"
                    defaultValue={stockModal.item?.unit || 'ea'}
                    placeholder="ea, box, ft"
                    className={styles.fieldInput}
                  />
                </div>
              </div>

              <div className={styles.formGrid2Col}>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Quantity On Hand</label>
                  <input
                    type="number"
                    name="quantityOnHand"
                    defaultValue={stockModal.item?.quantityOnHand ?? 10}
                    className={styles.fieldInput}
                  />
                </div>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Min Safety Threshold</label>
                  <input
                    type="number"
                    name="minThreshold"
                    defaultValue={stockModal.item?.minThreshold ?? 5}
                    className={styles.fieldInput}
                  />
                </div>
              </div>

              <div className={styles.formGrid2Col}>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Unit Cost ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    name="unitCost"
                    defaultValue={stockModal.item?.unitCost ?? 0}
                    className={styles.fieldInput}
                  />
                </div>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Reorder Quantity</label>
                  <input
                    type="number"
                    name="reorderQty"
                    defaultValue={stockModal.item?.reorderQty ?? 20}
                    className={styles.fieldInput}
                  />
                </div>
              </div>

              <div className={styles.formField}>
                <label className={styles.fieldLabel}>Preferred Wholesale Supplier</label>
                <input
                  type="text"
                  name="preferredSupplier"
                  defaultValue={stockModal.item?.preferredSupplier || 'Ferguson Plumbing'}
                  className={styles.fieldInput}
                />
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  onClick={() => setStockModal({ open: false, item: null })}
                  className={styles.btnSecondary}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.btnPrimary}>
                  Save Stock Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Transfer Modal */}
      {transferModal.open && transferModal.item && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>Transfer Van Stock</h3>
                <span style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>
                  {transferModal.item.name} ({transferModal.item.sku})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setTransferModal({ open: false, item: null, toLocation: '', qty: 1, notes: '' })}
                className={styles.btnGhostIcon}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '0.95rem 1.15rem', borderRadius: '14px', background: 'rgba(255, 255, 255, 0.04)', border: '1px solid var(--inv-border-strong)', fontSize: '0.92rem' }}>
              <div>From Source: <strong style={{ color: '#ffffff' }}>{transferModal.item.location}</strong></div>
              <div style={{ color: '#cbd5e1', marginTop: '0.35rem' }}>
                Available on hand: <strong style={{ color: '#34d399', fontFamily: 'monospace' }}>{transferModal.item.quantityOnHand} {transferModal.item.unit}</strong>
              </div>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.formField}>
                <label className={styles.fieldLabel}>Destination Location *</label>
                <select
                  aria-label="Destination location"
                  value={transferModal.toLocation}
                  onChange={(e) => setTransferModal((prev) => ({ ...prev, toLocation: e.target.value }))}
                  className={styles.fieldSelect}
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

              <div className={styles.formField}>
                <label className={styles.fieldLabel}>
                  Quantity to Transfer ({transferModal.item.unit}) *
                </label>
                <input
                  type="number"
                  min="1"
                  max={transferModal.item.quantityOnHand}
                  value={transferModal.qty}
                  onChange={(e) => setTransferModal((prev) => ({ ...prev, qty: Number(e.target.value) }))}
                  className={styles.fieldInput}
                  style={{ fontFamily: 'monospace', fontWeight: 700 }}
                />
              </div>

              <div className={styles.formField}>
                <label className={styles.fieldLabel}>Transfer Notes</label>
                <input
                  type="text"
                  value={transferModal.notes}
                  onChange={(e) => setTransferModal((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="e.g. Replenished lead tech van for morning job"
                  className={styles.fieldInput}
                />
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                onClick={() => setTransferModal({ open: false, item: null, toLocation: '', qty: 1, notes: '' })}
                className={styles.btnSecondary}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmTransfer}
                className={styles.btnPrimary}
              >
                Execute Transfer <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log Maintenance Modal */}
      {maintenanceModal.open && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Log Service Record</h3>
              <button
                type="button"
                onClick={() =>
                  setMaintenanceModal({
                    open: false,
                    record: { assetType: 'tool', assetId: '', assetName: '', serviceType: '', cost: 0, performedBy: '', performedAt: '' },
                  })
                }
                className={styles.btnGhostIcon}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveMaintenance} className={styles.formGrid}>
              <div className={styles.formGrid2Col}>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Asset Type *</label>
                  <select
                    aria-label="Asset type"
                    name="assetType"
                    defaultValue={maintenanceModal.record.assetType}
                    className={styles.fieldSelect}
                  >
                    <option value="tool">Tool / Equipment</option>
                    <option value="vehicle">Fleet Vehicle</option>
                  </select>
                </div>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Asset Name *</label>
                  <input
                    type="text"
                    name="assetName"
                    required
                    defaultValue={maintenanceModal.record.assetName || ''}
                    className={styles.fieldInput}
                  />
                  <input type="hidden" name="assetId" value={maintenanceModal.record.assetId || 'custom-asset'} />
                </div>
              </div>

              <div className={styles.formField}>
                <label className={styles.fieldLabel}>Service Description *</label>
                <input
                  type="text"
                  name="serviceType"
                  required
                  defaultValue={maintenanceModal.record.serviceType || 'Routine Oil Change & Inspection'}
                  className={styles.fieldInput}
                />
              </div>

              <div className={styles.formGrid2Col}>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Total Cost ($) *</label>
                  <input
                    type="number"
                    step="0.01"
                    name="cost"
                    required
                    defaultValue={maintenanceModal.record.cost || 0}
                    className={styles.fieldInput}
                    style={{ fontFamily: 'monospace' }}
                  />
                </div>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Performed By *</label>
                  <input
                    type="text"
                    name="performedBy"
                    required
                    defaultValue={maintenanceModal.record.performedBy || 'Fleet Tech'}
                    className={styles.fieldInput}
                  />
                </div>
              </div>

              <div className={styles.formGrid2Col}>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Service Date *</label>
                  <input
                    type="date"
                    name="performedAt"
                    required
                    defaultValue={maintenanceModal.record.performedAt || new Date().toISOString().split('T')[0]}
                    className={styles.fieldInput}
                  />
                </div>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Odometer at Service</label>
                  <input
                    type="number"
                    name="mileageAtService"
                    defaultValue={maintenanceModal.record.mileageAtService || ''}
                    placeholder="e.g. 45000"
                    className={styles.fieldInput}
                  />
                </div>
              </div>

              <div className={styles.formField}>
                <label className={styles.fieldLabel}>Notes &amp; Invoice Reference</label>
                <textarea
                  name="notes"
                  rows={2}
                  defaultValue={maintenanceModal.record.notes || ''}
                  className={styles.fieldTextarea}
                />
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  onClick={() =>
                    setMaintenanceModal({
                      open: false,
                      record: { assetType: 'tool', assetId: '', assetName: '', serviceType: '', cost: 0, performedBy: '', performedAt: '' },
                    })
                  }
                  className={styles.btnSecondary}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.btnPrimary}>
                  Save Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Location Modal */}
      {locationModal.open && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent} style={{ maxWidth: '480px' }}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                {locationModal.location ? 'Edit Location' : 'Add Inventory Depot / Location'}
              </h3>
              <button
                type="button"
                onClick={() => setLocationModal({ open: false, location: null })}
                className={styles.btnGhostIcon}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveLocation} className={styles.formGrid}>
              <div className={styles.formField}>
                <label className={styles.fieldLabel}>Location Name *</label>
                <input
                  type="text"
                  name="name"
                  required
                  defaultValue={locationModal.location?.name || ''}
                  placeholder="e.g. Job Trailer #1 (North Site)"
                  className={styles.fieldInput}
                />
              </div>

              <div className={styles.formGrid2Col}>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Location Type *</label>
                  <select
                    aria-label="Location type"
                    name="type"
                    defaultValue={locationModal.location?.type || 'warehouse'}
                    className={styles.fieldSelect}
                  >
                    <option value="warehouse">Warehouse / Depot</option>
                    <option value="vehicle">Service Van</option>
                    <option value="cage">Secure Tool Cage</option>
                    <option value="job_site">Job Site Trailer</option>
                  </select>
                </div>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Code / Prefix</label>
                  <input
                    type="text"
                    name="code"
                    defaultValue={locationModal.location?.code || ''}
                    placeholder="e.g. TR-01"
                    className={styles.fieldInput}
                  />
                </div>
              </div>

              <div className={styles.formField}>
                <label className={styles.fieldLabel}>Physical Address / Bay Location</label>
                <input
                  type="text"
                  name="address"
                  defaultValue={locationModal.location?.address || ''}
                  placeholder="e.g. 1420 Depot Way, Bay 3"
                  className={styles.fieldInput}
                />
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  onClick={() => setLocationModal({ open: false, location: null })}
                  className={styles.btnSecondary}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.btnPrimary}>
                  Save Location
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Restock Purchase Order Sheet Modal */}
      {showPoModal && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent} style={{ maxWidth: '680px' }}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>Multi-Location Replenishment Purchase Order</h3>
                <span style={{ fontSize: '0.92rem', color: '#cbd5e1' }}>
                  Automated reorder sheet for all depot items below minimum threshold
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowPoModal(false)}
                className={styles.btnGhostIcon}
              >
                <X size={18} />
              </button>
            </div>

            {lowStockResult.lowStockCount === 0 ? (
              <div className={styles.emptyState} style={{ padding: '2.5rem 1rem' }}>
                <Check size={40} style={{ color: '#34d399' }} />
                <h3 className={styles.emptyStateTitle}>All stock levels healthy</h3>
                <p className={styles.emptyStateCopy}>
                  No items across any depot or service van are currently below their minimum threshold.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.95rem 1.25rem',
                    borderRadius: '14px',
                    background: 'rgba(251, 191, 36, 0.12)',
                    border: '1px solid rgba(251, 191, 36, 0.35)',
                    fontSize: '0.92rem',
                  }}
                >
                  <div>
                    <span style={{ color: '#cbd5e1' }}>Items to Reorder: </span>
                    <strong style={{ color: '#fbbf24', fontFamily: 'monospace', fontWeight: 800 }}>
                      {lowStockResult.lowStockCount} items
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: '#cbd5e1' }}>Estimated Total Cost: </span>
                    <strong style={{ color: '#34d399', fontFamily: 'monospace', fontSize: '1.05rem', fontWeight: 800 }}>
                      {lowStockResult.formattedRestockCost}
                    </strong>
                  </div>
                </div>

                <div className={styles.tableWrap} style={{ maxHeight: '340px' }}>
                  <table className={styles.stockTable}>
                    <thead>
                      <tr>
                        <th>Item &amp; Location</th>
                        <th>Supplier</th>
                        <th style={{ textAlign: 'center' }}>On Hand / Min</th>
                        <th style={{ textAlign: 'center' }}>Order Qty</th>
                        <th style={{ textAlign: 'right' }}>Est. Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lowStockResult.lowStockItems.map((item) => {
                        const needed = Math.max(item.reorderQty, item.minThreshold - item.quantityOnHand);
                        const cost = needed * item.unitCost;
                        return (
                          <tr key={item.id}>
                            <td>
                              <div style={{ fontWeight: 700, color: '#ffffff', fontSize: '0.95rem' }}>{item.name}</div>
                              <div style={{ fontSize: '0.85rem', fontFamily: 'monospace', color: '#cbd5e1' }}>
                                {item.sku} • {item.location}
                              </div>
                            </td>
                            <td style={{ color: '#cbd5e1', fontSize: '0.92rem' }}>
                              {item.preferredSupplier || 'Generic Supplier'}
                            </td>
                            <td style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: '0.95rem' }}>
                              <span style={{ color: '#fbbf24', fontWeight: 700 }}>{item.quantityOnHand}</span> / {item.minThreshold}
                            </td>
                            <td style={{ textAlign: 'center', fontFamily: 'monospace', fontWeight: 800, color: '#ff9d5c', fontSize: '0.95rem' }}>
                              +{needed} {item.unit}
                            </td>
                            <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: '#ffffff', fontSize: '1rem' }}>
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

            <div className={styles.modalFooter} style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    const lines = [
                      `PURCHASE ORDER RESTOCK SHEET - ${businessName.toUpperCase()}`,
                      `Date: ${new Date().toLocaleDateString()}`,
                      `Estimated Total: ${lowStockResult.formattedRestockCost}`,
                      `-------------------------------------------------------`,
                      ...lowStockResult.lowStockItems.map((item) => {
                        const needed = Math.max(item.reorderQty, item.minThreshold - item.quantityOnHand);
                        return `[${item.sku}] ${item.name} | Location: ${item.location} | Qty: ${needed} ${item.unit} | Supplier: ${item.preferredSupplier || 'N/A'} | Est: ${formatUsdExact(needed * item.unitCost)}`;
                      }),
                    ];
                    navigator.clipboard.writeText(lines.join('\n'));
                    showToast('Copied purchase order sheet to clipboard!');
                  }}
                  className={styles.btnSecondary}
                  style={{ fontSize: '0.8rem', padding: '0.45rem 0.85rem' }}
                >
                  <Copy size={13} /> Copy PO Text
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowPoModal(false)}
                className={styles.btnPrimary}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
