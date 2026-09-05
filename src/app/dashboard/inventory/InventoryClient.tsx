'use client';

import { useState, useTransition, useRef, useCallback, useMemo, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
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
  Barcode,
  Download,
  Clock,
  Slash,
  Eye,
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
  type ToolCustodyLogEntry,
  type VanKitTemplate,
  TAX_GUIDANCE_SCHEDULES,
  COMMERCIAL_VEHICLE_TAX_TIP,
  calculateAssetDepreciation,
  auditVehicleMaintenance,
  auditLowStockItems,
  describeToolStatus,
  describeVehicleStatus,
  isToolOverdue,
  generateDepreciationScheduleCsv,
} from '@/lib/inventory-tracker';
import { formatUsdExact } from '@/lib/money-format';
import { validateToolPhotoFile } from '@/lib/tool-photo-validation';
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
  seedStarterInventoryAction,
  uploadToolPhotoAction,
  applyVanKitTemplateAction,
} from './actions';
import { getTodayDateString, type StoreAutofillResult } from '@/lib/store-autofill';
import AccessibleModal from './components/AccessibleModal';
import BarcodeScannerModal from './components/BarcodeScannerModal';
import PurchaseOrderModal from './components/PurchaseOrderModal';
import AssetDetailModal from './components/AssetDetailModal';
import VanKitTemplatesModal from './components/VanKitTemplatesModal';
import ThemeDatePicker from '@/components/theme-date-picker';
import styles from './inventory.module.css';

interface InventoryClientProps {
  businessName: string;
  initialPayload?: InventoryPayload;
  crewMembers?: Array<{ id: string; name: string; role?: string }>;
  activeJobs?: Array<{ id: string; label: string; status?: string }>;
  canWrite?: boolean;
  canCustody?: boolean;
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
  canWrite = true,
  canCustody = true,
}: InventoryClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initialTab = (searchParams.get('tab') as 'tools' | 'fleet' | 'stock' | 'maintenance' | 'locations') || 'tools';
  const [activeTab, setActiveTab] = useState<'tools' | 'fleet' | 'stock' | 'maintenance' | 'locations'>(
    ['tools', 'fleet', 'stock', 'maintenance', 'locations'].includes(initialTab) ? initialTab : 'tools'
  );
  const [asOfDate, setAsOfDate] = useState<string>(searchParams.get('asOf') || getTodayDateString());
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
  const [custodyLogs, setCustodyLogs] = useState<ToolCustodyLogEntry[]>(initialPayload?.custodyLogs ?? []);
  const [vanKitTemplates, setVanKitTemplates] = useState<VanKitTemplate[]>(initialPayload?.vanKitTemplates ?? []);

  // Filter & Search states
  const [toolFilter, setToolFilter] = useState<'all' | ToolAssetStatus>('all');
  const [toolSearch, setToolSearch] = useState('');
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [stockLocationFilter, setStockLocationFilter] = useState<string>('all');
  const [stockSearch, setStockSearch] = useState('');

  // Modal active schedule states for live tax advice
  const [toolModalSchedule, setToolModalSchedule] = useState<DepreciationSchedule>('none');
  const [vehicleModalSchedule, setVehicleModalSchedule] = useState<DepreciationSchedule>('none');
  const [toolModalImageUrl, setToolModalImageUrl] = useState<string>('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [isPriceEstimated, setIsPriceEstimated] = useState(false);
  const [priceConfirmed, setPriceConfirmed] = useState(false);
  const [toolModalFormKey, setToolModalFormKey] = useState(0);
  const [storeAutofillUrl, setStoreAutofillUrl] = useState('');
  const [storeAutofillLoading, setStoreAutofillLoading] = useState(false);
  const [storeAutofillSuccess, setStoreAutofillSuccess] = useState<string | null>(null);
  const [storeSearchResults, setStoreSearchResults] = useState<StoreAutofillResult[]>([]);
  const [showStoreDropdown, setShowStoreDropdown] = useState(false);
  const [toolEntryMode, setToolEntryMode] = useState<'manual' | 'autofill'>('manual');

  // High-leverage feature modals
  const [barcodeScannerOpen, setBarcodeScannerOpen] = useState(false);
  const [vanKitModalOpen, setVanKitModalOpen] = useState(false);
  const [detailModal, setDetailModal] = useState<{
    open: boolean;
    asset: ToolAsset | FleetVehicle | null;
    type: 'tool' | 'vehicle';
  }>({ open: false, asset: null, type: 'tool' });

  // Custody checkout modal states
  const [checkoutTool, setCheckoutTool] = useState<ToolAsset | null>(null);
  const [selectedCrewId, setSelectedCrewId] = useState<string>(crewMembers[0]?.id || '');
  const [selectedCrewName, setSelectedCrewName] = useState(crewMembers[0]?.name || '');
  const [selectedJobId, setSelectedJobId] = useState<string>(activeJobs[0]?.id || '');
  const [selectedJobLabel, setSelectedJobLabel] = useState(activeJobs[0]?.label || '');
  const [checkoutExpectedReturnDate, setCheckoutExpectedReturnDate] = useState('');
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

  // References for robust timer management
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storeSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storeSearchSeqRef = useRef<number>(0);
  const pendingStockDeltas = useRef<Map<string, { delta: number; timer: ReturnType<typeof setTimeout> }>>(new Map());

  // URL synchronization
  const handleTabChange = useCallback((tab: 'tools' | 'fleet' | 'stock' | 'maintenance' | 'locations') => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router, searchParams]);

  const handleAsOfDateChange = useCallback((dateStr: string) => {
    const effectiveDate = dateStr || getTodayDateString();
    setAsOfDate(effectiveDate);
    const params = new URLSearchParams(searchParams.toString());
    if (dateStr) {
      params.set('asOf', dateStr);
    } else {
      params.delete('asOf');
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router, searchParams]);

  function showToast(text: string, type: 'success' | 'error' = 'success') {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToastMessage({ text, type });
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimeoutRef.current = null;
    }, 4000);
  }

  function handleExportTaxCsv() {
    try {
      const csv = generateDepreciationScheduleCsv(tools, vehicles, asOfDate);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tax-depreciation-schedule-${asOfDate}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Exported IRS tax depreciation schedule CSV');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to export tax CSV', 'error');
    }
  }

  function handleLoadStarterInventory() {
    startTransition(async () => {
      try {
        const payload = await seedStarterInventoryAction();
        setLocations(payload.locations);
        setTools(payload.tools);
        setVehicles(payload.vehicles);
        setStock(payload.stock);
        setMaintenance(payload.maintenance);
        setTransfers(payload.transfers);
        if (payload.custodyLogs) setCustodyLogs(payload.custodyLogs);
        if (payload.vanKitTemplates) setVanKitTemplates(payload.vanKitTemplates);
        showToast('Loaded starter multi-location inventory & fleet records.');
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : 'Failed to load starter inventory', 'error');
      }
    });
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
      calculateAssetDepreciation(t.purchasePrice, t.purchaseDate, t.depreciationSchedule, asOfDate)
        .currentBookValue,
    0
  );
  const totalDepreciatedVehicleValue = vehicles.reduce(
    (sum, v) =>
      sum +
      calculateAssetDepreciation(v.purchasePrice, v.purchaseDate, v.depreciationSchedule, asOfDate)
        .currentBookValue,
    0
  );
  const totalDepreciatedBookValue = totalDepreciatedToolValue + totalDepreciatedVehicleValue;

  const totalStockValue = stock.reduce((sum, s) => sum + s.quantityOnHand * s.unitCost, 0);
  const checkedOutToolsCount = tools.filter((t) => t.status === 'checked_out').length;

  // Categorized & unified locations (auto-syncs active registered fleet vehicles into location pool)
  const facilityLocations = Array.from(
    new Set([
      'Main Shop & Warehouse',
      ...locations.filter((l) => l.type !== 'vehicle').map((l) => l.name),
    ].filter(Boolean))
  );

  const activeVehicles = vehicles.filter((v) => v.status !== 'retired');
  const vehicleLocations = Array.from(
    new Set([
      ...activeVehicles.map((v) => v.name),
      ...locations.filter((l) => l.type === 'vehicle').map((l) => l.name),
    ].filter(Boolean))
  );

  const otherLocations = Array.from(
    new Set([
      ...stock.map((s) => s.location),
      ...locations.map((l) => l.name),
    ].filter((name) => Boolean(name) && !facilityLocations.includes(name) && !vehicleLocations.includes(name)))
  );

  const availableLocationNames = Array.from(
    new Set([
      ...facilityLocations,
      ...vehicleLocations,
      ...otherLocations,
    ].filter(Boolean))
  );

  function isVehicleLocation(locName?: string | null): boolean {
    if (!locName) return false;
    if (vehicleLocations.includes(locName)) return true;
    const lower = locName.toLowerCase();
    return (
      lower.includes('van') ||
      lower.includes('truck') ||
      lower.includes('trailer') ||
      lower.includes('fleet') ||
      lower.includes('ford') ||
      lower.includes('ram') ||
      lower.includes('chevy') ||
      lower.includes('silverado') ||
      lower.includes('promaster') ||
      lower.includes('transit')
    );
  }

  function openToolModal(tool: Partial<ToolAsset> | null = null) {
    setToolModal({ open: true, tool });
    const defaultSchedule =
      tool?.depreciationSchedule ||
      (tool?.purchasePrice && tool.purchasePrice < 2500 ? 'de_minimis' : 'section_179');
    setToolModalSchedule(defaultSchedule);
    setToolModalImageUrl(tool?.imageUrl || '');
    setPhotoFile(null);
    setIsPriceEstimated(false);
    setPriceConfirmed(true);
    setToolEntryMode('manual');
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
    setPhotoFile(null);
    setIsPriceEstimated(Boolean(res.isPriceEstimated));
    setPriceConfirmed(!res.isPriceEstimated);
    setToolModalSchedule(res.depreciationSchedule);
    setStoreAutofillUrl(res.name);
    setShowStoreDropdown(false);
    setToolEntryMode('manual');
    setToolModalFormKey((k) => k + 1);
    setStoreAutofillSuccess(
      `Autofilled: ${res.name}${res.isPriceEstimated ? ' (Price is estimated — please verify against receipt)' : ''}`
    );
    showToast(`Loaded ${res.name}`);
  }

  async function handleStoreInputChange(val: string) {
    setStoreAutofillUrl(val);
    if (storeSearchTimerRef.current) {
      clearTimeout(storeSearchTimerRef.current);
    }
    const trimmed = val.trim();
    if (!trimmed) {
      setStoreSearchResults([]);
      setShowStoreDropdown(false);
      return;
    }
    storeSearchTimerRef.current = setTimeout(async () => {
      const seq = ++storeSearchSeqRef.current;
      try {
        const results = await searchStoreCatalogAction(trimmed);
        if (seq === storeSearchSeqRef.current) {
          setStoreSearchResults(results);
          setShowStoreDropdown(true);
        }
      } catch {
        // ignore network error
      }
    }, 300);
  }

  async function handleAutofillStore(urlToUse?: string) {
    const raw = (urlToUse || storeAutofillUrl).trim();
    if (!raw) {
      showToast('Please enter a tool keyword or paste a product link', 'error');
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
    setVehicleModalSchedule(vehicle?.depreciationSchedule || 'none');
  }

  // ── Handlers: Tools ────────────────────────────────────────────────────────

  function handleOpenCheckout(tool: ToolAsset) {
    setCheckoutTool(tool);
    const assignedCrew = crewMembers.find((c) => c.name === tool.assignedCrewName);
    setSelectedCrewId(assignedCrew?.id || crewMembers[0]?.id || '');
    setSelectedCrewName(tool.assignedCrewName || crewMembers[0]?.name || (crewMembers.length > 0 ? crewMembers[0].name : 'Unassigned Crew'));
    const assignedJob = activeJobs.find((j) => j.label === tool.assignedJobLabel);
    setSelectedJobId(assignedJob?.id || activeJobs[0]?.id || '');
    setSelectedJobLabel(tool.assignedJobLabel || activeJobs[0]?.label || 'Shop Pool / Maintenance');
    setCheckoutExpectedReturnDate(tool.expectedReturnDate || '');
    setCheckoutNotes(tool.notes || '');
  }

  function handleConfirmCheckout() {
    if (!checkoutTool) return;
    const toolId = checkoutTool.id;
    const crewId = selectedCrewId || null;
    const crewName = selectedCrewName;
    const jobId = selectedJobId || null;
    const jobLabel = selectedJobLabel;
    const expectedReturnDate = checkoutExpectedReturnDate || null;
    const notes = checkoutNotes;

    const prevTools = tools;
    setTools((prev) =>
      prev.map((t) =>
        t.id === toolId
          ? {
              ...t,
              status: 'checked_out',
              assignedCrewId: crewId,
              assignedCrewName: crewName,
              assignedJobId: jobId,
              assignedJobLabel: jobLabel,
              expectedReturnDate,
              checkedOutAt: new Date().toISOString(),
              notes,
            }
          : t
      )
    );
    setCheckoutTool(null);

    startTransition(async () => {
      try {
        const updated = await checkOutToolAction({
          toolId,
          crewId: crewId || undefined,
          crewName,
          jobId: jobId || undefined,
          jobLabel,
          expectedReturnDate: expectedReturnDate || undefined,
          notes,
        });
        setTools((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        showToast(`Checked out ${checkoutTool.name} to ${crewName}`);
      } catch (err: unknown) {
        setTools(prevTools);
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

    const prevTools = tools;
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
              expectedReturnDate: null,
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
        setTools(prevTools);
        showToast(err instanceof Error ? err.message : 'Failed to return tool', 'error');
      }
    });
  }

  function handleSaveTool(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isPriceEstimated && !priceConfirmed) {
      showToast('Please verify or confirm the estimated purchase price before saving', 'error');
      return;
    }
    const fd = new FormData(e.currentTarget);
    const id = toolModal.tool?.id;
    const baseImageUrl = (toolModalImageUrl || (fd.get('imageUrl') as string))?.trim() || null;
    const currentPhotoFile = photoFile;

    const toolData = {
      id,
      name: fd.get('name') as string,
      brand: fd.get('brand') as string,
      category: fd.get('category') as string,
      assetTag: fd.get('assetTag') as string,
      imageUrl: baseImageUrl,
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
        let finalImageUrl = baseImageUrl;
        if (currentPhotoFile) {
          const uploadFd = new FormData();
          uploadFd.append('photo', currentPhotoFile);
          uploadFd.append('toolId', id || 'new');
          const uploadRes = await uploadToolPhotoAction(uploadFd);
          if (uploadRes?.url) {
            finalImageUrl = uploadRes.url;
          } else {
            showToast('Failed to upload tool photo to cloud storage', 'error');
            return;
          }
        }

        const saved = await saveToolAction({ ...toolData, imageUrl: finalImageUrl });
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
    const prevTools = tools;
    setTools((prev) => prev.filter((t) => t.id !== tool.id));

    startTransition(async () => {
      try {
        await deleteToolAction(tool.id);
        showToast(`Deleted tool ${tool.name}`);
      } catch (err: unknown) {
        setTools(prevTools);
        showToast(err instanceof Error ? err.message : 'Failed to delete tool', 'error');
      }
    });
  }

  // ── Handlers: Vehicles ─────────────────────────────────────────────────────

  function handleConfirmMileage() {
    if (!mileageModal.vehicle) return;
    const vehicleId = mileageModal.vehicle.id;
    const currentMileage = Number(mileageModal.mileage);

    if (currentMileage < mileageModal.vehicle.currentMileage) {
      const confirmed = window.confirm(
        `The new odometer reading (${currentMileage.toLocaleString()} mi) is LESS than the current recorded mileage (${mileageModal.vehicle.currentMileage.toLocaleString()} mi). Confirm odometer rollback/correction?`
      );
      if (!confirmed) return;
    }

    const prevVehicles = vehicles;
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
        setVehicles(prevVehicles);
        showToast(err instanceof Error ? err.message : 'Failed to update mileage', 'error');
      }
    });
  }

  function handleSaveVehicle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const existing = vehicleModal.vehicle;
    const vehicleData = {
      id: existing?.id,
      name: (fd.get('name') as string)?.trim(),
      make: (fd.get('make') as string)?.trim(),
      model: (fd.get('model') as string)?.trim(),
      year: Number(fd.get('year')) || new Date().getFullYear(),
      licensePlate: (fd.get('licensePlate') as string)?.trim().toUpperCase(),
      vin: (fd.get('vin') as string)?.trim() || null,
      currentMileage: Number(fd.get('currentMileage')) || 0,
      purchasePrice: fd.get('purchasePrice') ? Number(fd.get('purchasePrice')) : null,
      purchaseDate: (fd.get('purchaseDate') as string)?.trim() || null,
      depreciationSchedule: (fd.get('depreciationSchedule') as DepreciationSchedule) || 'none',
      primaryDriverId: existing?.primaryDriverId ?? null,
      primaryDriverName: (fd.get('primaryDriverName') as string)?.trim() || null,
      status: (fd.get('status') as VehicleStatus) || existing?.status || 'active',
      lastServiceDate: existing?.lastServiceDate ?? null,
      lastServiceMileage: existing?.lastServiceMileage ?? null,
      nextServiceDueMileage: fd.get('nextServiceDueMileage') ? Number(fd.get('nextServiceDueMileage')) : null,
      inspectionExpiresAt: (fd.get('inspectionExpiresAt') as string) || null,
      insuranceExpiresAt: (fd.get('insuranceExpiresAt') as string) || null,
      notes: (fd.get('notes') as string)?.trim() || null,
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
    const prevVehicles = vehicles;
    setVehicles((prev) => prev.filter((v) => v.id !== vehicle.id));

    startTransition(async () => {
      try {
        await deleteVehicleAction(vehicle.id);
        showToast(`Deleted vehicle ${vehicle.name}`);
      } catch (err: unknown) {
        setVehicles(prevVehicles);
        showToast(err instanceof Error ? err.message : 'Failed to delete vehicle', 'error');
      }
    });
  }

  // ── Handlers: Stock & Multi-Location Transfers ─────────────────────────────

  function handleAdjustStock(item: VanStockItem, delta: number) {
    // Immediate optimistic update in UI
    setStock((prev) =>
      prev.map((s) => (s.id === item.id ? { ...s, quantityOnHand: Math.max(0, s.quantityOnHand + delta) } : s))
    );

    const existing = pendingStockDeltas.current.get(item.id);
    if (existing) {
      clearTimeout(existing.timer);
    }
    const combinedDelta = (existing?.delta ?? 0) + delta;
    const timer = setTimeout(async () => {
      pendingStockDeltas.current.delete(item.id);
      try {
        const updated = await adjustStockQuantityAction({ stockId: item.id, delta: combinedDelta });
        setStock((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : 'Failed to update stock quantity', 'error');
        setStock((prev) => prev.map((s) => (s.id === item.id ? item : s)));
      }
    }, 250);

    pendingStockDeltas.current.set(item.id, { delta: combinedDelta, timer });
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

        // Update source, destination, and transfers cleanly using real persisted DB entities
        setTransfers((prev) => [res.transfer, ...prev]);
        setStock((prev) => {
          const updatedSource = prev.map((s) => (s.id === res.sourceStock.id ? res.sourceStock : s));
          if (!res.destinationStock) return updatedSource;
          const destExists = updatedSource.some((s) => s.id === res.destinationStock!.id);
          return destExists
            ? updatedSource.map((s) => (s.id === res.destinationStock!.id ? res.destinationStock! : s))
            : [...updatedSource, res.destinationStock!];
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
    const prevStock = stock;
    setStock((prev) => prev.filter((s) => s.id !== item.id));

    startTransition(async () => {
      try {
        await deleteStockItemAction(item.id);
        showToast(`Deleted stock item ${item.name}`);
      } catch (err: unknown) {
        setStock(prevStock);
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

        // If vehicle, update mileage if provided and refresh next PM due
        if (saved.assetType === 'vehicle' && saved.assetId && saved.assetId !== 'custom') {
          setVehicles((prev) =>
            prev.map((v) =>
              v.id === saved.assetId
                ? {
                    ...v,
                    lastServiceDate: saved.performedAt,
                    lastServiceMileage: saved.mileageAtService ?? v.lastServiceMileage,
                    nextServiceDueMileage: (saved.mileageAtService ?? v.currentMileage) + 5000,
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
    const prevLocations = locations;
    setLocations((prev) => prev.filter((l) => l.id !== loc.id));

    startTransition(async () => {
      try {
        await deleteLocationAction(loc.id);
        showToast(`Deleted location ${loc.name}`);
      } catch (err: unknown) {
        setLocations(prevLocations);
        showToast(err instanceof Error ? err.message : 'Failed to delete location', 'error');
      }
    });
  }

  // ── Handlers: Barcode Scanner & Van Kit Templates ──────────────────────────

  function handleBarcodeDetected(code: string) {
    setBarcodeScannerOpen(false);
    const trimmed = code.trim().toLowerCase();
    const matchedTool = tools.find(
      (t) =>
        t.assetTag.toLowerCase() === trimmed ||
        (t.serialNumber && t.serialNumber.toLowerCase() === trimmed) ||
        (t.modelNumber && t.modelNumber.toLowerCase() === trimmed) ||
        t.name.toLowerCase().includes(trimmed)
    );
    if (matchedTool) {
      setDetailModal({ open: true, asset: matchedTool, type: 'tool' });
      showToast(`Scanned tag matches tool: ${matchedTool.name}`);
      return;
    }
    const matchedStock = stock.find(
      (s) => s.sku.toLowerCase() === trimmed || s.name.toLowerCase().includes(trimmed)
    );
    if (matchedStock) {
      handleTabChange('stock');
      setStockSearch(matchedStock.sku);
      showToast(`Found stock item: ${matchedStock.name}`);
      return;
    }
    const shouldAdd = window.confirm(`Tag "${code}" not found. Would you like to register a new tool with this asset tag?`);
    if (shouldAdd) {
      openToolModal({ assetTag: code });
    }
  }

  function handleTemplateApplied(newStockItems: VanStockItem[]) {
    setStock((prev) => {
      const merged = [...prev];
      for (const item of newStockItems) {
        const idx = merged.findIndex((m) => m.id === item.id);
        if (idx >= 0) {
          merged[idx] = item;
        } else {
          merged.push(item);
        }
      }
      return merged;
    });
    showToast('Van kit stock template successfully provisioned');
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
            {/* As-Of Date selector and Tax Schedule CSV export */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.78rem', color: '#cbd5e1', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}>
                <Calendar size={13} style={{ color: '#ff9d5c' }} /> As of:
              </span>
              <ThemeDatePicker
                value={asOfDate}
                onChange={handleAsOfDateChange}
                title="Select As-Of tax year / date for Section 179 and MACRS depreciation calculation"
                ariaLabel="As-Of calculation date"
              />
              <button
                type="button"
                onClick={handleExportTaxCsv}
                className={styles.btnSecondary}
                title="Export IRS Section 179 & MACRS Depreciation Schedule CSV"
                style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
              >
                <Download size={13} /> Export Tax CSV
              </button>
            </div>

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

      {/* Empty Starter Inventory Prompt for New Accounts */}
      {locations.length === 0 && tools.length === 0 && vehicles.length === 0 && stock.length === 0 && (
        <div
          style={{
            background: 'rgba(56, 189, 248, 0.08)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            borderRadius: '12px',
            padding: '1rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            marginBottom: '0.75rem',
          }}
        >
          <div>
            <h4 style={{ margin: 0, fontSize: '0.98rem', color: '#ffffff', fontWeight: 700 }}>
              Welcome to Inventory &amp; Fleet Tracker
            </h4>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#cbd5e1' }}>
              Your workspace is empty. Add your own locations, tools, and fleet vehicles, or load sample starter data to explore features.
            </p>
          </div>
          <button
            type="button"
            className={styles.btnSecondary}
            disabled={isPending}
            onClick={() => handleLoadStarterInventory()}
            style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Sparkles size={15} /> {isPending ? 'Loading...' : 'Load Starter Inventory'}
          </button>
        </div>
      )}

      {/* KPI Metrics Strip */}
      <div className={styles.kpiGrid}>
        <div
          className={styles.kpiCard}
          role="button"
          tabIndex={0}
          aria-label="Fleet Asset Basis: view all equipment & asset tax basis"
          onClick={() => {
            handleTabChange('tools');
            setToolFilter('all');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleTabChange('tools');
              setToolFilter('all');
            }
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
            <DollarSign size={13} /> Tax Book Basis: {formatUsdExact(totalDepreciatedBookValue)}
          </div>
        </div>

        <div
          className={styles.kpiCard}
          role="button"
          tabIndex={0}
          aria-label="Low Stock Alert: open restock purchase order sheet"
          onClick={() => {
            handleTabChange('stock');
            setShowPoModal(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleTabChange('stock');
              setShowPoModal(true);
            }
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
          role="button"
          tabIndex={0}
          aria-label="Vehicle Service Due: review fleet maintenance schedules"
          onClick={() => handleTabChange('fleet')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleTabChange('fleet');
            }
          }}
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
          role="button"
          tabIndex={0}
          aria-label="Field Custody: filter tools currently checked out"
          onClick={() => {
            handleTabChange('tools');
            setToolFilter('checked_out');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleTabChange('tools');
              setToolFilter('checked_out');
            }
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
            onClick={() => handleTabChange('tools')}
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
            onClick={() => handleTabChange('fleet')}
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
            onClick={() => handleTabChange('stock')}
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
            onClick={() => handleTabChange('maintenance')}
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
            onClick={() => handleTabChange('locations')}
            className={`${styles.tabButton} ${activeTab === 'locations' ? styles.tabButtonActive : ''}`}
          >
            <MapPin size={18} />
            <span>Depots &amp; Vans</span>
            <span className={`${styles.tabBadge} ${activeTab === 'locations' ? styles.tabBadgeActive : ''}`}>
              {locations.length + vehicles.length}
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
                onClick={() => setBarcodeScannerOpen(true)}
                className={styles.btnSecondary}
                title="Scan Barcode / QR / Asset Tag via Camera"
              >
                <Barcode size={16} /> Scan Tag
              </button>
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
                    const isOverdue = isToolOverdue(tool);
                    const depr = calculateAssetDepreciation(
                      tool.purchasePrice,
                      tool.purchaseDate,
                      tool.depreciationSchedule,
                      asOfDate
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
                          <div
                            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}
                            onClick={() => setDetailModal({ open: true, asset: tool, type: 'tool' })}
                            title="Click to view complete asset details and custody timeline"
                          >
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
                              <div style={{ fontWeight: 700, color: '#ffffff', fontSize: '0.9rem', textDecoration: 'underline' }}>
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
                          <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-start' }}>
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
                            {isOverdue && (
                              <span className={styles.statusOverdue} title={`Overdue since ${tool.expectedReturnDate}`}>
                                <Clock size={11} /> Overdue
                              </span>
                            )}
                          </div>
                        </td>
                        <td className={styles.toolsTd}>
                          {isCheckedOut ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#ffb580', fontWeight: 600 }}>
                                <User size={13} /> {tool.assignedCrewName || 'Assigned Tech'}
                              </div>
                              {tool.expectedReturnDate && (
                                <span style={{ fontSize: '0.72rem', color: isOverdue ? '#f87171' : '#cbd5e1', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                  <Clock size={11} /> Due: {tool.expectedReturnDate}
                                </span>
                              )}
                              <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                {isVehicleLocation(tool.locationName) ? <Truck size={11} /> : <MapPin size={11} />} Base: {tool.locationName || 'Main Shop & Warehouse'}
                              </span>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#cbd5e1' }}>
                              {isVehicleLocation(tool.locationName) ? (
                                <Truck size={13} style={{ color: '#60a5fa' }} />
                              ) : (
                                <MapPin size={13} style={{ color: '#94a3b8' }} />
                              )}
                              <span>{tool.locationName || 'Main Shop & Warehouse'}</span>
                              {isVehicleLocation(tool.locationName) && (
                                <span className={`${styles.locationTypeTag} ${styles.locationTypeTagVehicle}`} style={{ fontSize: '0.68rem', padding: '0.1rem 0.35rem' }}>
                                  Van
                                </span>
                              )}
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
                            <button
                              type="button"
                              onClick={() => setDetailModal({ open: true, asset: tool, type: 'tool' })}
                              className={styles.btnGhostIcon}
                              title="Inspect Details & History"
                            >
                              <Eye size={13} />
                            </button>
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
                const isOverdue = isToolOverdue(tool);
                const depr = calculateAssetDepreciation(
                  tool.purchasePrice,
                  tool.purchaseDate,
                  tool.depreciationSchedule,
                  asOfDate
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
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
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
                          {isOverdue && (
                            <span className={styles.statusOverdue} title={`Overdue since ${tool.expectedReturnDate}`}>
                              <Clock size={11} /> Overdue
                            </span>
                          )}
                        </div>
                      </div>

                      {tool.imageUrl && (
                        <div
                          className={isLarge ? styles.toolPhotoWrapLarge : styles.toolPhotoWrapMedium}
                          style={{ cursor: 'pointer' }}
                          onClick={() => setDetailModal({ open: true, asset: tool, type: 'tool' })}
                          title="Click to inspect asset details"
                        >
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

                      <h3
                        className={styles.cardTitle}
                        style={{ fontSize: isLarge ? '1.18rem' : '1.05rem', cursor: 'pointer' }}
                        onClick={() => setDetailModal({ open: true, asset: tool, type: 'tool' })}
                        title="Click to view complete asset details and audit log"
                      >
                        {tool.name}
                      </h3>
                      <div className={styles.cardMeta}>
                        {tool.brand} {tool.modelNumber ? `• Mod: ${tool.modelNumber}` : ''} • {tool.category}
                      </div>

                      {/* Checked out custody well */}
                      {isCheckedOut ? (
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
                          <div className={styles.custodyRow}>
                            <span className={styles.custodyLabel}>
                              {isVehicleLocation(tool.locationName) ? <Truck size={13} /> : <MapPin size={13} />} Home Base:
                            </span>
                            <span className={styles.custodyValue}>
                              {tool.locationName || 'Main Shop & Warehouse'}
                            </span>
                          </div>
                          {tool.expectedReturnDate && (
                            <div className={styles.custodyRow} style={{ color: isOverdue ? '#fca5a5' : '#cbd5e1', fontSize: '0.85rem' }}>
                              <span className={styles.custodyLabel}>
                                <Clock size={14} /> Expected Return:
                              </span>
                              <span style={{ fontWeight: 700, color: isOverdue ? '#f87171' : '#ffffff' }}>
                                {tool.expectedReturnDate} {isOverdue && '(OVERDUE)'}
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
                      ) : (
                        /* Storage Depot for Available / In-Maintenance tools */
                        <div className={styles.locationBlock}>
                          <div className={styles.locationRow}>
                            <span className={styles.locationLabel}>
                              {isVehicleLocation(tool.locationName) ? <Truck size={13} /> : <MapPin size={13} />} Storage Depot:
                            </span>
                            <span className={styles.locationValue}>
                              <span>{tool.locationName || 'Main Shop & Warehouse'}</span>
                              <span
                                className={`${styles.locationTypeTag} ${
                                  isVehicleLocation(tool.locationName)
                                    ? styles.locationTypeTagVehicle
                                    : styles.locationTypeTagFacility
                                }`}
                              >
                                {isVehicleLocation(tool.locationName) ? 'Vehicle' : 'Facility'}
                              </span>
                            </span>
                          </div>
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
                            onClick={() => setDetailModal({ open: true, asset: tool, type: 'tool' })}
                            className={styles.btnGhostIcon}
                            title="Inspect Details & Custody Timeline"
                          >
                            <Eye size={14} />
                          </button>
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
                const isRetired = v.status === 'retired';
                const statusBadgeClass =
                  isRetired
                    ? styles.statusRetired
                    : statusDesc.tone === 'success'
                    ? styles.statusAvailable
                    : statusDesc.tone === 'warn'
                    ? styles.statusMaintenance
                    : styles.statusDanger;

                const depr = calculateAssetDepreciation(v.purchasePrice, v.purchaseDate, v.depreciationSchedule, asOfDate);

                return (
                  <div key={v.id} className={styles.assetCard}>
                    <div>
                      <div className={styles.cardHeader}>
                        <div className={styles.cardTagRow}>
                          <span className={styles.assetTagBadge}>{v.licensePlate}</span>
                          {v.vin ? <span className={styles.serialNumberTag}>VIN: {v.vin}</span> : null}
                        </div>
                        <span className={`${styles.statusBadge} ${statusBadgeClass}`}>
                          {isRetired ? <Slash size={14} /> : statusDesc.tone === 'success' ? <Check size={14} /> : <AlertTriangle size={14} />} {statusDesc.label}
                        </span>
                      </div>

                      <h3
                        className={styles.cardTitle}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setDetailModal({ open: true, asset: v, type: 'vehicle' })}
                        title="Click to view vehicle maintenance history & tax schedule"
                      >
                        {v.name}
                      </h3>
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
                          {isRetired ? (
                            <div className={`${styles.alertItem} ${styles.alertGood}`} style={{ opacity: 0.7 }}>
                              <Slash size={15} />
                              <span>Vehicle decommissioned &amp; retired</span>
                            </div>
                          ) : (
                            <>
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
                            </>
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
                            {v.nextServiceDueMileage ? `${v.nextServiceDueMileage.toLocaleString()} mi` : 'Not set'}
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
                              cost: 0,
                              performedBy: '',
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
                          onClick={() => setDetailModal({ open: true, asset: v, type: 'vehicle' })}
                          className={styles.btnGhostIcon}
                          title="Inspect Maintenance & Tax History"
                        >
                          <Eye size={14} />
                        </button>
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
                onClick={() => setBarcodeScannerOpen(true)}
                className={styles.btnSecondary}
                title="Scan Barcode / SKU via Camera"
              >
                <Barcode size={16} /> Scan Tag
              </button>

              <button
                type="button"
                onClick={() => setVanKitModalOpen(true)}
                className={styles.btnSecondary}
                title="Apply Predefined Trade Van Kit Templates"
              >
                <Boxes size={16} /> Van Kits
              </button>

              <button
                type="button"
                onClick={() => setStockModal({ open: true, item: null })}
                className={styles.btnPrimary}
              >
                <Plus size={16} /> Add Part
              </button>
            </div>
          </div>

          {/* Total Stock Value KPI Strip */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1.25rem', borderRadius: '12px', background: 'var(--inv-surface-elevated)', border: '1px solid var(--inv-border-strong)', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <div style={{ width: 32, height: 32, borderRadius: '8px', background: 'rgba(56, 189, 248, 0.16)', display: 'grid', placeItems: 'center', color: '#38bdf8' }}>
                <Boxes size={18} />
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
                  Total Van &amp; Depot Stock Value
                </span>
                <div style={{ fontSize: '1.2rem', color: '#ffffff', fontFamily: 'monospace', fontWeight: 800 }}>
                  {formatUsdExact(totalStockValue)}
                </div>
              </div>
            </div>
            <span style={{ fontSize: '0.82rem', color: '#cbd5e1' }}>
              {stock.length} catalog parts tracked across {availableLocationNames.length} depots &amp; mobile fleet vans
            </span>
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
                            aria-label={`Decrease quantity of ${item.name}`}
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
                            aria-label={`Increase quantity of ${item.name}`}
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

          {/* Registered Fleet Vehicles (Auto-synced as Mobile Depot Locations) */}
          {vehicles.length > 0 && (
            <div style={{ marginTop: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Truck size={18} style={{ color: '#60a5fa' }} /> Mobile Fleet Units ({vehicles.length} Synced)
                </h3>
                <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                  Auto-synced from Fleet Vehicles • Available in all tool &amp; stock location pickers
                </span>
              </div>

              <div className={styles.cardsGrid}>
                {vehicles.map((v) => {
                  const stockCount = stock.filter((s) => s.location === v.name).length;
                  const toolsCount = tools.filter((t) => t.locationName === v.name).length;
                  return (
                    <div key={v.id} className={styles.assetCard}>
                      <div>
                        <div className={styles.cardHeader}>
                          <span className={styles.assetTagBadge}>{v.licensePlate || 'FLEET'}</span>
                          <span className={`${styles.locationTypeTag} ${styles.locationTypeTagVehicle}`}>
                            <Truck size={11} /> FLEET UNIT
                          </span>
                        </div>

                        <h3 className={styles.cardTitle}>{v.name}</h3>
                        <p style={{ margin: '0.35rem 0 0', fontSize: '0.92rem', color: '#cbd5e1' }}>
                          {v.year} {v.make} {v.model} • Driver: <strong style={{ color: '#ffffff' }}>{v.primaryDriverName || 'Unassigned'}</strong>
                        </p>

                        <div style={{ marginTop: '0.95rem', display: 'flex', gap: '0.65rem' }}>
                          <div style={{ flex: 1, padding: '0.65rem 0.85rem', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.1)', fontSize: '0.85rem' }}>
                            <span style={{ color: '#cbd5e1' }}>Tools: </span>
                            <strong style={{ fontFamily: 'monospace', color: '#ffffff' }}>{toolsCount} assigned</strong>
                          </div>
                          <div style={{ flex: 1, padding: '0.65rem 0.85rem', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.1)', fontSize: '0.85rem' }}>
                            <span style={{ color: '#cbd5e1' }}>Parts: </span>
                            <strong style={{ fontFamily: 'monospace', color: '#ffffff' }}>{stockCount} stocked</strong>
                          </div>
                        </div>
                      </div>

                      <div className={styles.cardFooter}>
                        <span style={{ fontSize: '0.85rem', color: '#60a5fa', fontWeight: 600 }}>Active Mobile Depot</span>
                        <button
                          type="button"
                          onClick={() => setActiveTab('fleet')}
                          className={styles.btnGhostIcon}
                          title="Manage in Fleet Tab"
                        >
                          <ArrowRight size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MODALS ──────────────────────────────────────────────────────────── */}

      {/* Check Out Tool Modal */}
      <AccessibleModal
        isOpen={Boolean(checkoutTool)}
        onClose={() => setCheckoutTool(null)}
        title={checkoutTool ? `Check Out: ${checkoutTool.name}` : 'Check Out Tool'}
        subtitle={checkoutTool ? `Asset Tag: ${checkoutTool.assetTag}` : undefined}
      >
        <div className={styles.formGrid}>
          <div className={styles.formField}>
            <label className={styles.fieldLabel}>Assign to Technician / Crew Member *</label>
            <select
              aria-label="Assign to crew member or technician"
              value={selectedCrewId || selectedCrewName}
              onChange={(e) => {
                const selected = crewMembers.find((c) => c.id === e.target.value || c.name === e.target.value);
                if (selected) {
                  setSelectedCrewId(selected.id);
                  setSelectedCrewName(selected.name);
                } else {
                  setSelectedCrewId(e.target.value);
                  setSelectedCrewName(e.target.value);
                }
              }}
              className={styles.fieldSelect}
            >
              {crewMembers.length > 0 ? (
                crewMembers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.role ? `(${c.role})` : ''}
                  </option>
                ))
              ) : (
                <>
                  <option value="crew-1">Carlos Ramirez (Van #1)</option>
                  <option value="crew-2">Jake Martinez (Van #2)</option>
                  <option value="crew-3">Tyler Vance (Truck #3)</option>
                </>
              )}
            </select>
          </div>

          <div className={styles.formField}>
            <label className={styles.fieldLabel}>Destination Job Site / Location</label>
            {activeJobs.length > 0 && (
              <select
                aria-label="Destination job site selector"
                value={selectedJobId}
                onChange={(e) => {
                  const job = activeJobs.find((j) => j.id === e.target.value);
                  setSelectedJobId(e.target.value);
                  if (job) setSelectedJobLabel(job.label);
                }}
                className={styles.fieldSelect}
                style={{ marginBottom: '0.45rem' }}
              >
                <option value="">-- Choose active job site or custom below --</option>
                {activeJobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.label}
                  </option>
                ))}
              </select>
            )}
            <input
              type="text"
              value={selectedJobLabel}
              onChange={(e) => setSelectedJobLabel(e.target.value)}
              placeholder="e.g. 142 Ridgewood Rd - Water Heater Replacement"
              className={styles.fieldInput}
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.fieldLabel}>Expected Return Date (Optional)</label>
            <input
              type="date"
              value={checkoutExpectedReturnDate}
              onChange={(e) => setCheckoutExpectedReturnDate(e.target.value)}
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
      </AccessibleModal>

      {/* Check In / Return Tool Modal */}
      <AccessibleModal
        isOpen={Boolean(checkinTool)}
        onClose={() => setCheckinTool(null)}
        title={checkinTool ? `Return Tool: ${checkinTool.name}` : 'Return Tool'}
        subtitle={checkinTool ? `Asset Tag: ${checkinTool.assetTag}` : undefined}
      >
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
      </AccessibleModal>

      {/* Add / Edit Tool Modal */}
      <AccessibleModal
        isOpen={toolModal.open}
        onClose={() => setToolModal({ open: false, tool: null })}
        title={toolModal.tool ? 'Edit Tool Asset' : 'Register New Tool Asset'}
        maxWidth="640px"
      >
        <form key={toolModalFormKey} onSubmit={handleSaveTool} className={styles.formGrid}>
          {/* Mode Switcher: + Add Tool Manually (Default) vs Quick Autofill (Optional) */}
          <div className={styles.toolModalModeToggle}>
            <button
              type="button"
              className={`${styles.toolModalModeBtn} ${toolEntryMode === 'manual' ? styles.toolModalModeBtnActive : ''}`}
              onClick={() => setToolEntryMode('manual')}
            >
              <Plus size={14} /> + Add Tool Manually
            </button>
            <button
              type="button"
              className={`${styles.toolModalModeBtn} ${toolEntryMode === 'autofill' ? styles.toolModalModeBtnActive : ''}`}
              onClick={() => setToolEntryMode('autofill')}
            >
              <Sparkles size={14} /> Quick Autofill (Optional)
            </button>
          </div>

          {storeAutofillSuccess && (
            <div className={styles.storeSuccessBanner} style={{ marginBottom: '0.65rem' }}>
              <Check size={14} style={{ flexShrink: 0 }} />
              <span>{storeAutofillSuccess}</span>
            </div>
          )}

          {/* Quick Autofill Section (Optional - only visible when toggled) */}
          {toolEntryMode === 'autofill' && (
            <div className={styles.storeAutofillCard}>
              <div className={styles.storeAutofillHeader}>
                <div className={styles.storeAutofillTitle}>
                  <Sparkles size={15} style={{ color: '#ff7a21' }} />
                  Quick Tool Autofill
                </div>
                <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                  Search contractor catalog or paste a product link
                </span>
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
                    placeholder="Search tool catalog (e.g. pipe, drill, bandsaw) or paste link..."
                    className={styles.storeUrlInput}
                  />

                  {showStoreDropdown && (
                    <div className={styles.storeSearchResultsDropdown}>
                      <div className={styles.storeSearchResultsHeader}>
                        <span>Matching Tools ({storeSearchResults.length})</span>
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
                                <span className={styles.storeResultBrandBadge}>
                                  {item.brand}
                                </span>
                                <span className={styles.storeResultTitle}>{item.name}</span>
                              </div>
                              <div className={styles.storeResultMeta}>
                                <span>{item.category}</span>
                                {item.modelNumber && <span>· Model #{item.modelNumber}</span>}
                                {item.sku && <span>· SKU #{item.sku}</span>}
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
                          No matching tools found for &ldquo;{storeAutofillUrl}&rdquo;.
                          <br />
                          Try searching for <em>&ldquo;pipe&rdquo;</em>, <em>&ldquo;drill&rdquo;</em>, or <em>&ldquo;bandsaw&rdquo;</em>.
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
            </div>
          )}

          {toolEntryMode === 'manual' && !storeAutofillSuccess && (
            <div className={styles.manualEntryBanner}>
              <span>Entering tool details manually.</span>
              <button
                type="button"
                onClick={() => setToolEntryMode('autofill')}
                className={styles.manualEntryAutofillLink}
              >
                <Sparkles size={12} /> Or use Quick Autofill
              </button>
            </div>
          )}

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
                <optgroup label="Shop & Facilities">
                  {facilityLocations.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Fleet Vehicles (Mobile Units)">
                  {vehicleLocations.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </optgroup>
                {otherLocations.length > 0 && (
                  <optgroup label="Other Locations">
                    {otherLocations.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </optgroup>
                )}
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

          {isPriceEstimated && (
            <div
              style={{
                background: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                borderRadius: '8px',
                padding: '0.65rem 0.85rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.65rem',
                color: '#fbbf24',
                fontSize: '0.84rem',
              }}
            >
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontWeight: 700 }}>Estimated Purchase Price: Please Verify</div>
                <div style={{ color: '#cbd5e1', marginTop: '0.2rem', fontSize: '0.8rem' }}>
                  This purchase price was estimated based on tool category averages. Please check your actual purchase receipt or invoice before filing tax deductions.
                </div>
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    marginTop: '0.5rem',
                    cursor: 'pointer',
                    color: '#fef3c7',
                    fontWeight: 600,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={priceConfirmed}
                    onChange={(e) => setPriceConfirmed(e.target.checked)}
                  />
                  I have verified this purchase price
                </label>
              </div>
            </div>
          )}

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
            <label className={styles.fieldLabel}>Tool Photo (Optional)</label>
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
                <div className={styles.photoEmptyBox}>
                  <Camera size={20} style={{ opacity: 0.5 }} />
                  <span>No Photo</span>
                </div>
              )}

              <div className={styles.photoUploadActions}>
                <label className={styles.photoUploadBtn}>
                  <Camera size={14} />
                  <span>{toolModalImageUrl ? 'Change Photo' : 'Upload Photo'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const validation = validateToolPhotoFile(file);
                        if (!validation.valid) {
                          showToast(validation.error || 'Invalid photo file', 'error');
                          return;
                        }
                        setPhotoFile(file);
                        setToolModalImageUrl(URL.createObjectURL(file));
                      }
                    }}
                  />
                </label>
                {toolModalImageUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setToolModalImageUrl('');
                      setPhotoFile(null);
                    }}
                    className={styles.photoClearBtn}
                  >
                    <X size={12} /> Remove Photo
                  </button>
                )}
                <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                  Max 5MB (JPG, PNG, WebP)
                </span>
              </div>
              <input type="hidden" name="imageUrl" value={toolModalImageUrl} />
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
      </AccessibleModal>

      {/* Update Mileage Modal */}
      {/* Update Mileage Modal */}
      <AccessibleModal
        isOpen={mileageModal.open && Boolean(mileageModal.vehicle)}
        onClose={() => setMileageModal({ open: false, vehicle: null, mileage: 0 })}
        title="Update Odometer"
        subtitle={mileageModal.vehicle ? `${mileageModal.vehicle.name} (${mileageModal.vehicle.licensePlate})` : undefined}
        maxWidth="440px"
      >
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
          {mileageModal.vehicle && (
            <span style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 500 }}>
              Previous recorded mileage: {mileageModal.vehicle.currentMileage.toLocaleString()} mi
            </span>
          )}
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
      </AccessibleModal>

      {/* Add / Edit Fleet Vehicle Modal */}
      <AccessibleModal
        isOpen={vehicleModal.open}
        onClose={() => setVehicleModal({ open: false, vehicle: null })}
        title={vehicleModal.vehicle ? 'Edit Fleet Vehicle' : 'Register New Fleet Vehicle'}
        maxWidth="640px"
      >
        <form onSubmit={handleSaveVehicle} className={styles.formGrid}>
          <div className={styles.formField}>
            <label className={styles.fieldLabel}>Vehicle Name / Unit Identifier *</label>
            <input
              type="text"
              name="name"
              required
              defaultValue={vehicleModal.vehicle?.name || ''}
              placeholder="e.g. Van #3 (Service)"
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
                defaultValue={vehicleModal.vehicle?.make || ''}
                placeholder="e.g. Ford"
                className={styles.fieldInput}
              />
            </div>
            <div className={styles.formField}>
              <label className={styles.fieldLabel}>Model *</label>
              <input
                type="text"
                name="model"
                required
                defaultValue={vehicleModal.vehicle?.model || ''}
                placeholder="e.g. Transit 250"
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
              <label className={styles.fieldLabel}>Operational Status</label>
              <select
                name="status"
                aria-label="Operational Status"
                defaultValue={vehicleModal.vehicle?.status || 'active'}
                className={styles.fieldSelect}
              >
                <option value="active">Active (In Service)</option>
                <option value="in_shop">In Shop (Maintenance / Repair)</option>
                <option value="retired">Retired / Out of Service</option>
              </select>
            </div>
          </div>

          <div className={styles.formGrid2Col}>
            <div className={styles.formField}>
              <label className={styles.fieldLabel}>License Plate *</label>
              <input
                type="text"
                name="licensePlate"
                required
                defaultValue={vehicleModal.vehicle?.licensePlate || ''}
                placeholder="e.g. X92-KLP"
                className={styles.fieldInput}
              />
            </div>
            <div className={styles.formField}>
              <label className={styles.fieldLabel}>VIN (Vehicle Identification Number)</label>
              <input
                type="text"
                name="vin"
                defaultValue={vehicleModal.vehicle?.vin || ''}
                placeholder="e.g. 1FT8W2BT5REC99210"
                maxLength={17}
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
                defaultValue={vehicleModal.vehicle?.currentMileage ?? 0}
                className={styles.fieldInput}
              />
            </div>
            <div className={styles.formField}>
              <label className={styles.fieldLabel}>Next PM Due (Mileage)</label>
              <input
                type="number"
                name="nextServiceDueMileage"
                defaultValue={vehicleModal.vehicle?.nextServiceDueMileage ?? ''}
                placeholder="e.g. 30000"
                className={styles.fieldInput}
              />
            </div>
          </div>

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

          <div className={styles.formGrid2Col}>
            <div className={styles.formField}>
              <label className={styles.fieldLabel}>State Inspection Expiration</label>
              <input
                type="date"
                name="inspectionExpiresAt"
                defaultValue={vehicleModal.vehicle?.inspectionExpiresAt || ''}
                className={styles.fieldInput}
              />
            </div>
            <div className={styles.formField}>
              <label className={styles.fieldLabel}>Commercial Auto Insurance Expiration</label>
              <input
                type="date"
                name="insuranceExpiresAt"
                defaultValue={vehicleModal.vehicle?.insuranceExpiresAt || ''}
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
                defaultValue={vehicleModal.vehicle?.purchaseDate || ''}
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
              <option value="none">No Depreciation (Hold at Cost Basis)</option>
              <option value="section_179">Section 179 (100% Write-Off for &gt;6,000 lb GVWR Work Trucks)</option>
              <option value="macrs_5">MACRS 5-Year (Standard Fleet Vehicles &amp; Cargo Vans)</option>
              <option value="straight_line_5">Straight-Line 5-Year (Uniform Accounting)</option>
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

          <div className={styles.formField}>
            <label className={styles.fieldLabel}>Vehicle Notes / Equipment Specs</label>
            <textarea
              name="notes"
              rows={3}
              defaultValue={vehicleModal.vehicle?.notes || ''}
              placeholder="e.g. Equipped with ladder rack, packout shelves, 100-gal fuel transfer tank..."
              className={styles.fieldTextarea}
            />
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
      </AccessibleModal>

      {/* Add / Edit Stock Item Modal */}
      <AccessibleModal
        isOpen={stockModal.open}
        onClose={() => setStockModal({ open: false, item: null })}
        title={stockModal.item ? 'Edit Van Stock Part' : 'Add New Van Stock Part'}
        maxWidth="600px"
      >
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
                <optgroup label="Shop & Facilities">
                  {facilityLocations.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Fleet Vehicles (Mobile Units)">
                  {vehicleLocations.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </optgroup>
                {otherLocations.length > 0 && (
                  <optgroup label="Other Locations">
                    {otherLocations.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </optgroup>
                )}
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
      </AccessibleModal>

      {/* Stock Transfer Modal */}
      <AccessibleModal
        isOpen={transferModal.open && Boolean(transferModal.item)}
        onClose={() => setTransferModal({ open: false, item: null, toLocation: '', qty: 1, notes: '' })}
        title="Transfer Van Stock"
        subtitle={transferModal.item ? `${transferModal.item.name} (${transferModal.item.sku})` : undefined}
        maxWidth="520px"
      >
        {transferModal.item && (
          <>
            <div style={{ padding: '0.95rem 1.15rem', borderRadius: '14px', background: 'rgba(255, 255, 255, 0.04)', border: '1px solid var(--inv-border-strong)', fontSize: '0.92rem', marginBottom: '1rem' }}>
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
                  <optgroup label="Shop & Facilities">
                    {facilityLocations
                      .filter((l) => l !== transferModal.item?.location)
                      .map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Fleet Vehicles (Mobile Units)">
                    {vehicleLocations
                      .filter((l) => l !== transferModal.item?.location)
                      .map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                  </optgroup>
                  {otherLocations.filter((l) => l !== transferModal.item?.location).length > 0 && (
                    <optgroup label="Other Locations">
                      {otherLocations
                        .filter((l) => l !== transferModal.item?.location)
                        .map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                    </optgroup>
                  )}
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
          </>
        )}
      </AccessibleModal>

      {/* Log Maintenance Modal */}
      <AccessibleModal
        isOpen={maintenanceModal.open}
        onClose={() =>
          setMaintenanceModal({
            open: false,
            record: { assetType: 'tool', assetId: '', assetName: '', serviceType: '', cost: 0, performedBy: '', performedAt: '' },
          })
        }
        title="Log Service Record"
        maxWidth="600px"
      >
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
                defaultValue={maintenanceModal.record.cost !== undefined ? maintenanceModal.record.cost : ''}
                placeholder="0.00"
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
                defaultValue={maintenanceModal.record.performedBy || ''}
                placeholder="e.g. In-House Mechanic, Dealership"
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
      </AccessibleModal>

      {/* Add / Edit Location Modal */}
      <AccessibleModal
        isOpen={locationModal.open}
        onClose={() => setLocationModal({ open: false, location: null })}
        title={locationModal.location ? 'Edit Location' : 'Add Inventory Depot / Location'}
        maxWidth="480px"
      >
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
      </AccessibleModal>

      {/* Restock Purchase Order Sheet Modal */}
      <PurchaseOrderModal
        isOpen={showPoModal}
        onClose={() => setShowPoModal(false)}
        stock={stock}
        businessName={businessName}
        onToast={showToast}
      />

      {/* Barcode & QR Scanner Modal */}
      <BarcodeScannerModal
        isOpen={barcodeScannerOpen}
        onClose={() => setBarcodeScannerOpen(false)}
        onDetected={handleBarcodeDetected}
      />

      {/* Comprehensive Asset Detail Modal */}
      <AssetDetailModal
        isOpen={detailModal.open}
        onClose={() => setDetailModal({ open: false, asset: null, type: 'tool' })}
        asset={detailModal.asset}
        assetType={detailModal.type}
        custodyLogs={custodyLogs}
        maintenanceRecords={maintenance}
        asOfDate={asOfDate}
      />

      {/* Van Kit Predefined Replenishment Templates Modal */}
      <VanKitTemplatesModal
        isOpen={vanKitModalOpen}
        onClose={() => setVanKitModalOpen(false)}
        templates={vanKitTemplates}
        locations={locations}
        onTemplateApplied={handleTemplateApplied}
        onToast={showToast}
      />
    </div>
  );
}
