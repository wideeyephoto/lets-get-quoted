'use client';

import { useState } from 'react';
import {
  type ToolAsset,
  type FleetVehicle,
  type VanStockItem,
  checkOutTool,
  checkInTool,
  auditVehicleMaintenance,
  auditLowStockItems,
  describeToolStatus,
  describeVehicleStatus,
} from '@/lib/inventory-tracker';
import { formatUsdExact } from '@/lib/money-format';

interface InventoryClientProps {
  businessName: string;
}

const INITIAL_TOOLS: ToolAsset[] = [
  {
    id: 'tool-1',
    name: 'RIDGID RP 351 ProPress Press Tool',
    category: 'Pipe Joining',
    brand: 'RIDGID',
    modelNumber: 'RP-351',
    assetTag: 'TAG-PLUMB-01',
    purchasePrice: 2850,
    status: 'available',
    notes: 'Includes 1/2" to 2" jaws in hard case',
  },
  {
    id: 'tool-2',
    name: 'Milwaukee M18 FUEL Deep Cut Band Saw',
    category: 'Cutting',
    brand: 'Milwaukee',
    modelNumber: '2729-20',
    assetTag: 'TAG-CUT-04',
    purchasePrice: 399,
    status: 'checked_out',
    assignedCrewName: 'Jake Martinez (Van #2)',
    assignedJobLabel: '142 Ridgewood Rd Water Main',
    checkedOutAt: '2026-08-31T08:30:00Z',
  },
  {
    id: 'tool-3',
    name: 'Fieldpiece SMAN480V 4-Port Digital Manifold',
    category: 'HVAC Diagnostics',
    brand: 'Fieldpiece',
    modelNumber: 'SMAN480V',
    assetTag: 'TAG-HVAC-02',
    purchasePrice: 650,
    status: 'available',
    notes: 'Calibrated July 2026',
  },
  {
    id: 'tool-4',
    name: 'DeWalt 60V MAX 1-7/8" SDS-Max Rotary Hammer',
    category: 'Masonry & Concrete',
    brand: 'DeWalt',
    modelNumber: 'DCH733',
    assetTag: 'TAG-HAMMER-03',
    purchasePrice: 899,
    status: 'in_maintenance',
    notes: 'Chuck replacement scheduled with service depot',
  },
];

const INITIAL_VEHICLES: FleetVehicle[] = [
  {
    id: 'veh-1',
    name: 'Van #1 (Lead Tech)',
    make: 'Ford',
    model: 'Transit 250 High Roof',
    year: 2023,
    licensePlate: 'TX-LGQ-81',
    currentMileage: 28450,
    primaryDriverName: 'Carlos Ramirez',
    status: 'active',
    lastServiceDate: '2026-06-15',
    lastServiceMileage: 25000,
    nextServiceDueMileage: 30000,
  },
  {
    id: 'veh-2',
    name: 'Van #2 (Install Crew)',
    make: 'Ram',
    model: 'ProMaster 3500',
    year: 2022,
    licensePlate: 'TX-LGQ-82',
    currentMileage: 46200,
    primaryDriverName: 'Jake Martinez',
    status: 'active',
    lastServiceDate: '2026-04-10',
    lastServiceMileage: 40000,
    nextServiceDueMileage: 45000,
  },
  {
    id: 'veh-3',
    name: 'Truck #3 (Heavy Service)',
    make: 'Chevrolet',
    model: 'Silverado 3500HD Utility',
    year: 2021,
    licensePlate: 'TX-LGQ-83',
    currentMileage: 58900,
    primaryDriverName: 'Sarah Jenkins',
    status: 'in_shop',
    notes: 'Transmission fluid flush and brake pads at dealer',
  },
];

const INITIAL_VAN_STOCK: VanStockItem[] = [
  {
    id: 'stock-1',
    name: '3/4" ProPress Copper Elbow 90°',
    sku: 'COP-75-90-PR',
    category: 'Fittings',
    quantityOnHand: 14,
    minThreshold: 20,
    unit: 'ea',
    unitCost: 6.85,
    preferredSupplier: 'Ferguson',
    reorderQty: 50,
    location: 'Van #1 Bin A2',
  },
  {
    id: 'stock-2',
    name: '50A 2-Pole Square D QO Circuit Breaker',
    sku: 'SQD-QO-250',
    category: 'Electrical',
    quantityOnHand: 3,
    minThreshold: 5,
    unit: 'ea',
    unitCost: 28.5,
    preferredSupplier: 'Graybar',
    reorderQty: 10,
    location: 'Shop Shelf E',
  },
  {
    id: 'stock-3',
    name: 'R-410A Refrigerant 25lb Cylinder',
    sku: 'REF-R410A-25',
    category: 'Refrigerant',
    quantityOnHand: 4,
    minThreshold: 2,
    unit: 'cyl',
    unitCost: 185.0,
    preferredSupplier: 'Baker Distributing',
    reorderQty: 4,
    location: 'Secured Cage #1',
  },
  {
    id: 'stock-4',
    name: '3/4" SharkBite Max Ball Valve with Drain',
    sku: 'SB-BV-75',
    category: 'Valves',
    quantityOnHand: 8,
    minThreshold: 6,
    unit: 'ea',
    unitCost: 24.2,
    preferredSupplier: 'Winsupply',
    reorderQty: 12,
    location: 'Van #2 Bin C1',
  },
];

export default function InventoryClient({ businessName }: InventoryClientProps) {
  const [activeTab, setActiveTab] = useState<'tools' | 'fleet' | 'stock'>('tools');
  const [tools, setTools] = useState<ToolAsset[]>(INITIAL_TOOLS);
  const [vehicles] = useState<FleetVehicle[]>(INITIAL_VEHICLES);
  const [stock] = useState<VanStockItem[]>(INITIAL_VAN_STOCK);

  const lowStockCount = auditLowStockItems(stock).lowStockCount;
  const maintenanceDueVehicles = vehicles.filter((v) => {
    const audit = auditVehicleMaintenance(v);
    return audit.isServiceOverdue || audit.isInspectionExpired || audit.isInsuranceExpired;
  }).length;

  const handleToggleTool = (tool: ToolAsset) => {
    if (tool.status === 'available') {
      const updated = checkOutTool(tool, {
        crewId: 'crew_default',
        crewName: 'On-Duty Tech',
        jobLabel: 'Active Work Order',
        notes: 'Checked out from Shop Pool',
      });
      setTools((prev) => prev.map((t) => (t.id === tool.id ? updated : t)));
    } else {
      const updated = checkInTool(tool);
      setTools((prev) => prev.map((t) => (t.id === tool.id ? updated : t)));
    }
  };


  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-stone-200 dark:border-stone-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300 border border-orange-200 dark:border-orange-900">
              🛠️ Fleet &amp; Asset Custody
            </span>
            <span className="text-xs text-stone-500 dark:text-stone-400">{businessName}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 dark:text-stone-100 tracking-tight">
            Inventory &amp; Fleet Management
          </h1>
          <p className="text-sm text-stone-600 dark:text-stone-400 mt-1">
            Track tool chain-of-custody, fleet vehicle PM schedules, and van stock replenishment.
          </p>
        </div>

        {/* Quick KPI Badges */}
        <div className="flex items-center gap-3">
          <div className="bg-stone-100 dark:bg-stone-800/80 px-3.5 py-2 rounded-xl border border-stone-200 dark:border-stone-700 text-center">
            <div className="text-xs font-medium text-stone-500 dark:text-stone-400">Low Stock</div>
            <div className={`text-lg font-bold ${lowStockCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {lowStockCount} {lowStockCount === 1 ? 'item' : 'items'}
            </div>
          </div>
          <div className="bg-stone-100 dark:bg-stone-800/80 px-3.5 py-2 rounded-xl border border-stone-200 dark:border-stone-700 text-center">
            <div className="text-xs font-medium text-stone-500 dark:text-stone-400">Service Due</div>
            <div className={`text-lg font-bold ${maintenanceDueVehicles > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {maintenanceDueVehicles} {maintenanceDueVehicles === 1 ? 'van' : 'vans'}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-stone-200 dark:border-stone-800" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'tools'}
          onClick={() => setActiveTab('tools')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'tools'
              ? 'border-orange-600 text-orange-600 dark:border-orange-400 dark:text-orange-400'
              : 'border-transparent text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
          }`}
        >
          Tools &amp; Equipment ({tools.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'fleet'}
          onClick={() => setActiveTab('fleet')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'fleet'
              ? 'border-orange-600 text-orange-600 dark:border-orange-400 dark:text-orange-400'
              : 'border-transparent text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
          }`}
        >
          Fleet Vehicles ({vehicles.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'stock'}
          onClick={() => setActiveTab('stock')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'stock'
              ? 'border-orange-600 text-orange-600 dark:border-orange-400 dark:text-orange-400'
              : 'border-transparent text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
          }`}
        >
          Van Stock &amp; Supplies ({stock.length})
        </button>
      </div>

      {/* Tab 1: Tools & Equipment */}
      {activeTab === 'tools' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tools.map((tool) => {
            const desc = describeToolStatus(tool.status);
            return (
              <div
                key={tool.id}
                className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 shadow-sm space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-xs font-mono font-semibold text-stone-500 dark:text-stone-400">
                      {tool.assetTag}
                    </span>
                    <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
                      {tool.name}
                    </h3>
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      {tool.brand} {tool.modelNumber ? `· Model ${tool.modelNumber}` : ''} · {tool.category}
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

                {tool.assignedCrewName && (
                  <div className="bg-stone-50 dark:bg-stone-800/50 p-3 rounded-xl border border-stone-100 dark:border-stone-800 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-stone-500 dark:text-stone-400">Assigned Tech:</span>
                      <strong className="text-stone-800 dark:text-stone-200">{tool.assignedCrewName}</strong>
                    </div>
                    {tool.assignedJobLabel && (
                      <div className="flex justify-between">
                        <span className="text-stone-500 dark:text-stone-400">Job Location:</span>
                        <span className="text-stone-700 dark:text-stone-300">{tool.assignedJobLabel}</span>
                      </div>
                    )}
                  </div>
                )}

                {tool.notes && (
                  <p className="text-xs italic text-stone-600 dark:text-stone-400">
                    &ldquo;{tool.notes}&rdquo;
                  </p>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-stone-100 dark:border-stone-800">
                  <span className="text-xs text-stone-500 dark:text-stone-400">
                    Value: <strong>{tool.purchasePrice ? formatUsdExact(tool.purchasePrice) : 'N/A'}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleToggleTool(tool)}
                    disabled={tool.status === 'in_maintenance'}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      tool.status === 'available'
                        ? 'bg-orange-600 hover:bg-orange-700 text-white shadow-sm'
                        : tool.status === 'checked_out'
                        ? 'bg-stone-200 dark:bg-stone-700 hover:bg-stone-300 dark:hover:bg-stone-600 text-stone-800 dark:text-stone-100'
                        : 'bg-stone-100 text-stone-400 cursor-not-allowed'
                    }`}
                  >
                    {tool.status === 'available' ? 'Check Out Tool →' : tool.status === 'checked_out' ? 'Return to Shop ✓' : 'In Service Depot'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab 2: Fleet Vehicles */}
      {activeTab === 'fleet' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {vehicles.map((v) => {
            const statusDesc = describeVehicleStatus(v.status);
            const isDue = v.nextServiceDueMileage && v.currentMileage >= v.nextServiceDueMileage;
            return (
              <div
                key={v.id}
                className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 shadow-sm space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-mono font-bold text-stone-500 dark:text-stone-400">
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

                <div className="bg-stone-50 dark:bg-stone-800/50 p-3 rounded-xl border border-stone-100 dark:border-stone-800 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-stone-500 dark:text-stone-400">Driver:</span>
                    <strong className="text-stone-800 dark:text-stone-200">{v.primaryDriverName ?? 'Unassigned'}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500 dark:text-stone-400">Odometer:</span>
                    <span className="text-stone-800 dark:text-stone-200 font-mono">{v.currentMileage.toLocaleString()} mi</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500 dark:text-stone-400">PM Next Service:</span>
                    <span className={`font-mono font-bold ${isDue ? 'text-amber-600 dark:text-amber-400' : 'text-stone-700 dark:text-stone-300'}`}>
                      {v.nextServiceDueMileage?.toLocaleString()} mi {isDue ? '(Due Now!)' : ''}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab 3: Van Stock & Supplies */}
      {activeTab === 'stock' && (
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
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800 font-medium">
                {stock.map((item) => {
                  const isLow = item.quantityOnHand <= item.minThreshold;
                  return (
                    <tr key={item.id} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-stone-900 dark:text-stone-100">{item.name}</div>
                        <div className="text-xs font-mono text-stone-500 dark:text-stone-400">{item.sku}</div>
                      </td>
                      <td className="py-3 px-4 text-xs text-stone-600 dark:text-stone-400">{item.category}</td>
                      <td className="py-3 px-4 text-xs text-stone-600 dark:text-stone-400">{item.location}</td>
                      <td className="py-3 px-4 text-center font-mono">
                        <span className={isLow ? 'text-amber-600 dark:text-amber-400 font-bold' : ''}>
                          {item.quantityOnHand} {item.unit}
                        </span>{' '}
                        / <span className="text-stone-400 text-xs">{item.minThreshold}</span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono">{formatUsdExact(item.unitCost)}</td>
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
