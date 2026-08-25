'use client';

import { useState } from 'react';
import {
  type ToolAsset,
  type FleetVehicle,
  type VanStockItem,
  type MaintenanceRecord,
  type ToolAssetStatus,
  checkOutTool,
  checkInTool,
  auditVehicleMaintenance,
  auditLowStockItems,
  describeToolStatus,
  describeVehicleStatus,
} from '@/lib/inventory-tracker';
import { formatUsdExact } from '@/lib/money-format';

type Props = {
  initialTools: ToolAsset[];
  initialVehicles: FleetVehicle[];
  initialStock: VanStockItem[];
  initialMaintenance: MaintenanceRecord[];
};

export default function InventoryWorkspace({
  initialTools,
  initialVehicles,
  initialStock,
  initialMaintenance,
}: Props) {
  const [activeTab, setActiveTab] = useState<'tools' | 'fleet' | 'stock' | 'maintenance'>('tools');
  const [tools, setTools] = useState<ToolAsset[]>(initialTools);
  const [vehicles, setVehicles] = useState<FleetVehicle[]>(initialVehicles);
  const [stock, setStock] = useState<VanStockItem[]>(initialStock);
  const [maintenance, _setMaintenance] = useState<MaintenanceRecord[]>(initialMaintenance);

  // Filter & Search states
  const [toolFilter, setToolFilter] = useState<'all' | ToolAssetStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected tool for check-in / check-out modal
  const [checkoutModalTool, setCheckoutModalTool] = useState<ToolAsset | null>(null);
  const [selectedCrewName, setSelectedCrewName] = useState('Jake Martinez');
  const [selectedJobLabel, setSelectedJobLabel] = useState('142 Ridgewood Rd - Water Heater');

  // Purchase Order Sheet modal
  const [showPoModal, setShowPoModal] = useState(false);

  // Mileage Update Modal
  const [mileageModalVehicle, setMileageModalVehicle] = useState<FleetVehicle | null>(null);
  const [newMileage, setNewMileage] = useState<number>(0);

  const lowStockResult = auditLowStockItems(stock);

  // Handle Tool Check Out
  function handleConfirmCheckout() {
    if (!checkoutModalTool) return;
    const updated = checkOutTool(checkoutModalTool, {
      crewId: 'c1',
      crewName: selectedCrewName,
      jobId: 'job-1',
      jobLabel: selectedJobLabel,
    });
    setTools((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setCheckoutModalTool(null);
  }

  // Handle Tool Check In
  function handleConfirmCheckIn(tool: ToolAsset) {
    const updated = checkInTool(tool);
    setTools((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  // Handle Mileage Update
  function handleConfirmMileage() {
    if (!mileageModalVehicle) return;
    setVehicles((prev) =>
      prev.map((v) => (v.id === mileageModalVehicle.id ? { ...v, currentMileage: newMileage } : v))
    );
    setMileageModalVehicle(null);
  }

  // Filtered tools
  const filteredTools = tools.filter((tool) => {
    if (toolFilter !== 'all' && tool.status !== toolFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        tool.name.toLowerCase().includes(q) ||
        tool.brand.toLowerCase().includes(q) ||
        tool.assetTag.toLowerCase().includes(q) ||
        (tool.serialNumber && tool.serialNumber.toLowerCase().includes(q)) ||
        (tool.assignedCrewName && tool.assignedCrewName.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Header & Navigation Tabs */}
      <div style={{
        background: 'var(--surface-primary, #ffffff)',
        border: '1px solid var(--border-default, #e2e8f0)',
        borderRadius: '12px',
        padding: '20px 24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary, #0f172a)' }}>
              🛠️ Vehicle, Equipment &amp; Tool Inventory
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.88rem', color: 'var(--text-secondary, #64748b)' }}>
              Track serial-numbered tool custody, fleet vehicle maintenance, and van stock replenishment.
            </p>
          </div>

          {lowStockResult.lowStockCount > 0 ? (
            <button
              type="button"
              onClick={() => setShowPoModal(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px',
                borderRadius: '8px',
                background: '#fef3c7',
                border: '1px solid #fde68a',
                color: '#92400e',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <span>⚠️ {lowStockResult.lowStockCount} Items Low on Stock</span>
              <span style={{ textDecoration: 'underline' }}>View Restock PO ({lowStockResult.formattedRestockCost})</span>
            </button>
          ) : null}
        </div>

        {/* Tab Selector */}
        <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid #f1f5f9', paddingTop: '16px', marginTop: '16px', overflowX: 'auto' }}>
          <button
            type="button"
            onClick={() => setActiveTab('tools')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              border: activeTab === 'tools' ? '1px solid #047857' : '1px solid #e2e8f0',
              background: activeTab === 'tools' ? '#ecfdf5' : '#ffffff',
              color: activeTab === 'tools' ? '#047857' : '#475569',
            }}
          >
            🔧 Tools &amp; Equipment ({tools.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('fleet')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              border: activeTab === 'fleet' ? '1px solid #047857' : '1px solid #e2e8f0',
              background: activeTab === 'fleet' ? '#ecfdf5' : '#ffffff',
              color: activeTab === 'fleet' ? '#047857' : '#475569',
            }}
          >
            🚚 Vehicles &amp; Fleet ({vehicles.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('stock')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              border: activeTab === 'stock' ? '1px solid #047857' : '1px solid #e2e8f0',
              background: activeTab === 'stock' ? '#ecfdf5' : '#ffffff',
              color: activeTab === 'stock' ? '#047857' : '#475569',
            }}
          >
            📦 Van Stock &amp; Materials ({stock.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('maintenance')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              border: activeTab === 'maintenance' ? '1px solid #047857' : '1px solid #e2e8f0',
              background: activeTab === 'maintenance' ? '#ecfdf5' : '#ffffff',
              color: activeTab === 'maintenance' ? '#047857' : '#475569',
            }}
          >
            📋 Maintenance Log ({maintenance.length})
          </button>
        </div>
      </div>

      {/* TAB 1: TOOLS & EQUIPMENT */}
      {activeTab === 'tools' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Controls Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {(['all', 'available', 'checked_out', 'in_maintenance'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setToolFilter(status)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: toolFilter === status ? '1px solid #047857' : '1px solid #e2e8f0',
                    background: toolFilter === status ? 'rgba(4,120,87,0.08)' : '#fff',
                    color: toolFilter === status ? '#047857' : '#475569',
                  }}
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

            <input
              type="text"
              placeholder="Search tools by name, tag, or serial..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.82rem',
                minWidth: '260px',
              }}
            />
          </div>

          {/* Tools Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
            {filteredTools.map((tool) => {
              const statusInfo = describeToolStatus(tool.status);
              const isCheckedOut = tool.status === 'checked_out';

              return (
                <div
                  key={tool.id}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    padding: '16px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#047857', letterSpacing: '0.5px' }}>
                          {tool.assetTag}
                        </div>
                        <h3 style={{ margin: '2px 0 0', fontSize: '0.98rem', fontWeight: 600, color: '#0f172a' }}>
                          {tool.name}
                        </h3>
                        <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                          {tool.brand} {tool.modelNumber ? `• Mod: ${tool.modelNumber}` : ''}
                        </div>
                      </div>

                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: '10px',
                          background:
                            statusInfo.tone === 'success'
                              ? '#dcfce7'
                              : statusInfo.tone === 'warn'
                                ? '#fef3c7'
                                : '#fee2e2',
                          color:
                            statusInfo.tone === 'success'
                              ? '#15803d'
                              : statusInfo.tone === 'warn'
                                ? '#b45309'
                                : '#b91c1c',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {statusInfo.label}
                      </span>
                    </div>

                    {/* Custody Info */}
                    {isCheckedOut && tool.assignedCrewName ? (
                      <div style={{ marginTop: '12px', padding: '10px 12px', background: '#f8fafc', borderRadius: '6px', fontSize: '0.78rem' }}>
                        <div><strong>Assigned To:</strong> {tool.assignedCrewName}</div>
                        {tool.assignedJobLabel ? (
                          <div style={{ color: '#475569', marginTop: '2px' }}>
                            <strong>Job Site:</strong> {tool.assignedJobLabel}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {tool.notes ? (
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '8px', fontStyle: 'italic' }}>
                        {tool.notes}
                      </div>
                    ) : null}
                  </div>

                  {/* Actions Bar */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                      {tool.serialNumber ? `S/N: ${tool.serialNumber}` : 'No S/N'}
                    </div>

                    {isCheckedOut ? (
                      <button
                        type="button"
                        onClick={() => handleConfirmCheckIn(tool)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          background: '#f1f5f9',
                          border: '1px solid #cbd5e1',
                          color: '#334155',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        ↩ Check In to Shop
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setCheckoutModalTool(tool)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          background: '#047857',
                          border: 'none',
                          color: '#ffffff',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        ➔ Check Out to Tech
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: VEHICLES & FLEET */}
      {activeTab === 'fleet' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px' }}>
          {vehicles.map((vehicle) => {
            const audit = auditVehicleMaintenance(vehicle);
            const statusInfo = describeVehicleStatus(vehicle.status);

            return (
              <div
                key={vehicle.id}
                style={{
                  background: '#ffffff',
                  border: audit.statusTone === 'danger' ? '1px solid #fca5a5' : '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '18px 20px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: '#0f172a' }}>
                      {vehicle.name}
                    </h3>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      {vehicle.year} {vehicle.make} {vehicle.model} • Plate: <strong>{vehicle.licensePlate}</strong>
                    </div>
                  </div>

                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: '10px',
                      background: statusInfo.tone === 'success' ? '#dcfce7' : '#fef3c7',
                      color: statusInfo.tone === 'success' ? '#15803d' : '#b45309',
                    }}
                  >
                    {statusInfo.label}
                  </span>
                </div>

                {/* Driver & Mileage */}
                <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: '#f8fafc', padding: '10px 12px', borderRadius: '6px', fontSize: '0.78rem' }}>
                  <div>
                    <span style={{ color: '#64748b' }}>Assigned Driver:</span>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{vehicle.primaryDriverName || 'Unassigned'}</div>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Odometer:</span>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{vehicle.currentMileage.toLocaleString()} mi</div>
                  </div>
                </div>

                {/* Maintenance Alert Box */}
                {audit.summaryAlert ? (
                  <div
                    style={{
                      marginTop: '12px',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      fontWeight: 500,
                      background: audit.statusTone === 'danger' ? '#fef2f2' : '#fffbeb',
                      border: audit.statusTone === 'danger' ? '1px solid #fecaca' : '1px solid #fde68a',
                      color: audit.statusTone === 'danger' ? '#b91c1c' : '#92400e',
                    }}
                  >
                    ⚠️ {audit.summaryAlert}
                  </div>
                ) : (
                  <div style={{ marginTop: '12px', fontSize: '0.75rem', color: '#16a34a' }}>
                    ✓ Routine maintenance &amp; inspections up to date
                  </div>
                )}

                {/* Card Footer Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setMileageModalVehicle(vehicle);
                      setNewMileage(vehicle.currentMileage);
                    }}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      color: '#334155',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Update Odometer
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 3: VAN STOCK & MATERIALS */}
      {activeTab === 'stock' && (
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                <th style={{ padding: '12px 16px' }}>Item &amp; SKU</th>
                <th style={{ padding: '12px 16px' }}>Category</th>
                <th style={{ padding: '12px 16px' }}>Location</th>
                <th style={{ padding: '12px 16px' }}>Quantity on Hand</th>
                <th style={{ padding: '12px 16px' }}>Unit Cost</th>
                <th style={{ padding: '12px 16px' }}>Supplier</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {stock.map((item) => {
                const isLow = item.quantityOnHand <= item.minThreshold;

                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', background: isLow ? '#fffbeb' : '#ffffff' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{item.name}</div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>SKU: {item.sku}</div>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#475569' }}>{item.category}</td>
                    <td style={{ padding: '12px 16px', color: '#475569' }}>{item.location}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 700, color: isLow ? '#b45309' : '#0f172a' }}>
                          {item.quantityOnHand} {item.unit}
                        </span>
                        {isLow ? (
                          <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '4px', background: '#fee2e2', color: '#dc2626', fontWeight: 600 }}>
                            Low (Min: {item.minThreshold})
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#475569' }}>{formatUsdExact(item.unitCost)}</td>
                    <td style={{ padding: '12px 16px', color: '#475569' }}>{item.preferredSupplier}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '4px' }}>
                        <button
                          type="button"
                          onClick={() =>
                            setStock((prev) =>
                              prev.map((s) => (s.id === item.id ? { ...s, quantityOnHand: Math.max(0, s.quantityOnHand - 1) } : s))
                            )
                          }
                          style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}
                        >
                          -
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setStock((prev) =>
                              prev.map((s) => (s.id === item.id ? { ...s, quantityOnHand: s.quantityOnHand + 1 } : s))
                            )
                          }
                          style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}
                        >
                          +
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 4: MAINTENANCE LOG */}
      {activeTab === 'maintenance' && (
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '20px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '1.05rem', fontWeight: 600, color: '#0f172a' }}>
            Recent Service &amp; Factory Calibrations
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {maintenance.map((rec) => (
              <div
                key={rec.id}
                style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: rec.assetType === 'vehicle' ? '#e0f2fe' : '#f3e8ff', color: rec.assetType === 'vehicle' ? '#0369a1' : '#7e22ce' }}>
                      {rec.assetType === 'vehicle' ? 'Vehicle Service' : 'Tool Calibration'}
                    </span>
                    <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>{rec.assetName}</strong>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#334155', marginTop: '4px' }}>
                    {rec.serviceType} • Performed by: {rec.performedBy}
                  </div>
                  {rec.notes ? <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>{rec.notes}</div> : null}
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.92rem' }}>{formatUsdExact(rec.cost)}</div>
                  <div style={{ fontSize: '0.74rem', color: '#64748b' }}>Date: {rec.performedAt}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CHECKOUT MODAL */}
      {checkoutModalTool && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', maxWidth: '440px', width: '90%' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '1.1rem' }}>Check Out Tool</h3>
            <p style={{ fontSize: '0.85rem', color: '#475569', margin: '0 0 16px' }}>
              Assign <strong>{checkoutModalTool.name}</strong> ({checkoutModalTool.assetTag}) to a technician.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Crew Technician
                </label>
                <select
                  aria-label="Crew Technician"
                  value={selectedCrewName}
                  onChange={(e) => setSelectedCrewName(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                >
                  <option value="Jake Martinez">Jake Martinez (Lead Plumber)</option>
                  <option value="Dave Cooper">Dave Cooper (Apprentice Tech)</option>
                  <option value="Tyler Vance">Tyler Vance (HVAC Specialist)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Assigned Job Site
                </label>
                <input
                  type="text"
                  value={selectedJobLabel}
                  onChange={(e) => setSelectedJobLabel(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button
                type="button"
                onClick={() => setCheckoutModalTool(null)}
                style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmCheckout}
                style={{ padding: '8px 14px', borderRadius: '6px', background: '#047857', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}
              >
                Confirm Check Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PURCHASE ORDER MODAL */}
      {showPoModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', maxWidth: '520px', width: '90%', maxHeight: '80vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '1.15rem' }}>📦 Stock Replenishment Purchase Order</h3>
            <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 16px' }}>
              Compiled for items currently below minimum van stock thresholds.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {lowStockResult.lowStockItems.map((item) => (
                <div key={item.id} style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                  <div>
                    <strong>{item.name}</strong>
                    <div style={{ color: '#64748b', fontSize: '0.74rem' }}>Supplier: {item.preferredSupplier}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div>Order <strong>{item.reorderQty} {item.unit}</strong></div>
                    <div style={{ color: '#047857', fontWeight: 600 }}>{formatUsdExact(item.reorderQty * item.unitCost)}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
              <div>
                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Estimated PO Total:</span>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>{lowStockResult.formattedRestockCost}</div>
              </div>

              <button
                type="button"
                onClick={() => setShowPoModal(false)}
                style={{ padding: '8px 16px', borderRadius: '6px', background: '#047857', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MILEAGE UPDATE MODAL */}
      {mileageModalVehicle && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', maxWidth: '400px', width: '90%' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem' }}>Update Odometer</h3>
            <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 16px' }}>
              {mileageModalVehicle.name} ({mileageModalVehicle.licensePlate})
            </p>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                New Mileage (miles)
              </label>
              <input
                type="number"
                value={newMileage}
                onChange={(e) => setNewMileage(Number(e.target.value))}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button
                type="button"
                onClick={() => setMileageModalVehicle(null)}
                style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmMileage}
                style={{ padding: '8px 14px', borderRadius: '6px', background: '#047857', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}
              >
                Save Mileage
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
