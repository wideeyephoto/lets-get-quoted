'use client';

import React, { useState, useEffect } from 'react';
import {
  ToolAsset,
  FleetVehicle,
  MaintenanceRecord,
  ToolCustodyLogEntry,
  calculateAssetDepreciation,
  describeToolStatus,
  describeVehicleStatus,
  formatDueBackLabel,
} from '@/lib/inventory-tracker';
import { formatUsdExact } from '@/lib/money-format';
import styles from '../inventory.module.css';
import {
  Wrench,
  Truck,
  Calendar,
  DollarSign,
  User,
  Clock,
  Check,
  AlertTriangle,
  History,
  Tag,
  ArrowRight,
  ArrowRightLeft,
  Edit2,
  X,
  MapPin,
} from 'lucide-react';

interface AssetDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset: ToolAsset | FleetVehicle | null;
  assetType: 'tool' | 'vehicle';
  custodyLogs?: ToolCustodyLogEntry[];
  maintenanceRecords?: MaintenanceRecord[];
  asOfDate?: string;
  onCheckOut?: (tool: ToolAsset) => void;
  onReturn?: (tool: ToolAsset) => void;
  onTransfer?: (tool: ToolAsset) => void;
  onSendMaintenance?: (asset: ToolAsset | FleetVehicle) => void;
  onEdit?: (asset: ToolAsset | FleetVehicle) => void;
}

export default function AssetDetailModal({
  isOpen,
  onClose,
  asset,
  assetType,
  custodyLogs = [],
  maintenanceRecords = [],
  asOfDate,
  onCheckOut,
  onReturn,
  onTransfer,
  onSendMaintenance,
  onEdit,
}: AssetDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'custody' | 'maintenance' | 'tax'>('details');

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen || !asset) return null;

  const isTool = assetType === 'tool';
  const tool = isTool ? (asset as ToolAsset) : null;
  const vehicle = !isTool ? (asset as FleetVehicle) : null;

  const relevantCustody = isTool
    ? custodyLogs.filter((log) => log.toolId === tool?.id)
    : [];

  const relevantMaintenance = maintenanceRecords.filter(
    (m) => m.assetId === asset.id || m.assetName === asset.name
  );

  const dep = calculateAssetDepreciation(
    asset.purchasePrice,
    asset.purchaseDate,
    asset.depreciationSchedule,
    asOfDate
  );

  const dueInfo = tool ? formatDueBackLabel(tool.expectedReturnDate) : null;
  const statusDesc = isTool ? describeToolStatus(tool!.status) : describeVehicleStatus(vehicle!.status);

  return (
    <div
      className={styles.drawerBackdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`${asset.name} details drawer`}
    >
      <div className={styles.drawerPanel}>
        {/* Header */}
        <div className={styles.drawerHeader}>
          <div className={styles.drawerHeaderInfo}>
            <div className={styles.drawerSubtitleRow}>
              <span className={styles.compactTag}>
                {isTool ? tool?.assetTag : vehicle?.licensePlate}
              </span>
              <span
                className={`${styles.statusBadge} ${
                  asset.status === 'available' || asset.status === 'active'
                    ? styles.statusAvailable
                    : asset.status === 'checked_out' || asset.status === 'in_shop'
                    ? styles.statusCheckedOut
                    : styles.statusMaintenance
                }`}
              >
                {statusDesc.label}
              </span>
              {dueInfo?.isOverdue && (
                <span className={styles.statusOverdue}>
                  <Clock size={11} /> Overdue
                </span>
              )}
            </div>
            <h2 className={styles.drawerTitle}>{asset.name}</h2>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              {isTool ? `${tool?.brand} • ${tool?.category}` : `${vehicle?.year} ${vehicle?.make} ${vehicle?.model}`}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={styles.drawerCloseBtn}
            aria-label="Close drawer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Persistent Action Bar */}
        <div className={styles.drawerActionBar}>
          {isTool && tool && (
            <>
              {tool.status === 'available' && onCheckOut && (
                <button
                  type="button"
                  onClick={() => onCheckOut(tool)}
                  className={styles.btnActionCompactCheckOut}
                >
                  <ArrowRight size={13} /> Check Out Tool
                </button>
              )}

              {tool.status === 'checked_out' && onReturn && (
                <button
                  type="button"
                  onClick={() => onReturn(tool)}
                  className={styles.btnActionCompactReturn}
                >
                  <Check size={13} /> Return Tool
                </button>
              )}

              {tool.status === 'checked_out' && onTransfer && (
                <button
                  type="button"
                  onClick={() => onTransfer(tool)}
                  className={styles.btnActionCompactTransfer}
                >
                  <ArrowRightLeft size={13} /> Transfer to Tech
                </button>
              )}

              {tool.status === 'in_maintenance' && onReturn && (
                <button
                  type="button"
                  onClick={() => onReturn(tool)}
                  className={styles.btnActionCompactReturn}
                >
                  <Check size={13} /> Return to Service
                </button>
              )}

              {onSendMaintenance && (
                <button
                  type="button"
                  onClick={() => onSendMaintenance(tool)}
                  className={styles.btnSecondary}
                  style={{ fontSize: '0.76rem', padding: '0.3rem 0.65rem' }}
                >
                  <Wrench size={13} /> {tool.status === 'in_maintenance' ? 'Log Service' : 'Send for Service'}
                </button>
              )}

              {onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(tool)}
                  className={styles.btnSecondary}
                  style={{ fontSize: '0.76rem', padding: '0.3rem 0.65rem' }}
                >
                  <Edit2 size={13} /> Edit
                </button>
              )}
            </>
          )}

          {!isTool && vehicle && (
            <>
              {onSendMaintenance && (
                <button
                  type="button"
                  onClick={() => onSendMaintenance(vehicle)}
                  className={styles.btnActionCompactCheckOut}
                >
                  <Wrench size={13} /> Log Maintenance
                </button>
              )}
              {onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(vehicle)}
                  className={styles.btnSecondary}
                  style={{ fontSize: '0.76rem', padding: '0.3rem 0.65rem' }}
                >
                  <Edit2 size={13} /> Edit Vehicle
                </button>
              )}
            </>
          )}
        </div>

        {/* Sub-nav tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', padding: '0.5rem 1.25rem 0', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <button
            type="button"
            onClick={() => setActiveTab('details')}
            className={activeTab === 'details' ? styles.tabBtnActive : styles.tabBtn}
            style={{ fontSize: '0.82rem', padding: '0.4rem 0.75rem' }}
          >
            Overview
          </button>
          {isTool && (
            <button
              type="button"
              onClick={() => setActiveTab('custody')}
              className={activeTab === 'custody' ? styles.tabBtnActive : styles.tabBtn}
              style={{ fontSize: '0.82rem', padding: '0.4rem 0.75rem' }}
            >
              Custody History ({relevantCustody.length})
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveTab('maintenance')}
            className={activeTab === 'maintenance' ? styles.tabBtnActive : styles.tabBtn}
            style={{ fontSize: '0.82rem', padding: '0.4rem 0.75rem' }}
          >
            Service History ({relevantMaintenance.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tax')}
            className={activeTab === 'tax' ? styles.tabBtnActive : styles.tabBtn}
            style={{ fontSize: '0.82rem', padding: '0.4rem 0.75rem' }}
          >
            Accounting
          </button>
        </div>

        {/* Drawer Body */}
        <div className={styles.drawerBody}>
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'details' && (
            <>
              {/* Custody Card */}
              {isTool && tool && (
                <div
                  style={{
                    background: tool.status === 'checked_out' ? 'rgba(56, 189, 248, 0.08)' : 'rgba(52, 211, 153, 0.08)',
                    border: `1px solid ${tool.status === 'checked_out' ? 'rgba(56, 189, 248, 0.3)' : 'rgba(52, 211, 153, 0.3)'}`,
                    borderRadius: '10px',
                    padding: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.65rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', fontWeight: 700 }}>
                      Current Custody &amp; Status
                    </span>
                    <span
                      style={{
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        color: tool.status === 'checked_out' ? '#38bdf8' : '#34d399',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                      }}
                    >
                      {tool.status === 'checked_out' ? <User size={13} /> : <Check size={13} />}
                      {tool.status === 'checked_out' ? 'In Field Custody' : 'Available in Pool'}
                    </span>
                  </div>

                  {tool.status === 'checked_out' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div>
                        <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Assigned Technician</div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#ffffff', marginTop: '0.15rem' }}>
                          {tool.assignedCrewName || 'Assigned Crew'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Due Back</div>
                        <div
                          style={{
                            fontSize: '0.95rem',
                            fontWeight: 800,
                            color: dueInfo?.tone === 'danger' ? '#f87171' : dueInfo?.tone === 'warn' ? '#fbbf24' : '#ffffff',
                            marginTop: '0.15rem',
                          }}
                        >
                          {dueInfo?.label || '—'}
                        </div>
                      </div>
                      {tool.assignedJobLabel && (
                        <div style={{ gridColumn: 'span 2' }}>
                          <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Assigned Job Site</div>
                          <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginTop: '0.15rem' }}>
                            {tool.assignedJobLabel}
                          </div>
                        </div>
                      )}
                      <div>
                        <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Checked Out Since</div>
                        <div style={{ fontSize: '0.82rem', color: '#cbd5e1', marginTop: '0.15rem' }}>
                          {tool.checkedOutAt ? new Date(tool.checkedOutAt).toLocaleDateString() : 'Recent'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Home Base Depot</div>
                        <div style={{ fontSize: '0.82rem', color: '#cbd5e1', marginTop: '0.15rem' }}>
                          {tool.locationName || 'Main Shop & Warehouse'}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Current Stored Location</div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#ffffff', marginTop: '0.15rem' }}>
                          <MapPin size={13} style={{ display: 'inline', marginRight: '0.3rem', color: '#34d399' }} />
                          {tool.locationName || 'Main Shop & Warehouse'}
                        </div>
                      </div>
                      <span style={{ fontSize: '0.78rem', color: '#34d399', fontWeight: 600 }}>Ready for dispatch</span>
                    </div>
                  )}
                </div>
              )}

              {/* Photo & Technical Specs */}
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                {isTool && tool?.imageUrl && (
                  <div
                    style={{
                      width: '110px',
                      height: '110px',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      flexShrink: 0,
                      background: '#1a2233',
                    }}
                  >
                    <img
                      src={tool.imageUrl}
                      alt={tool.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                )}

                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.65rem' }}>
                  <div style={{ padding: '0.6rem 0.75rem', background: '#171d2b', borderRadius: '7px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>Brand</span>
                    <div style={{ fontWeight: 700, marginTop: '0.15rem', color: '#ffffff' }}>
                      {isTool ? tool!.brand : vehicle!.make}
                    </div>
                  </div>

                  <div style={{ padding: '0.6rem 0.75rem', background: '#171d2b', borderRadius: '7px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>Model Number</span>
                    <div style={{ fontWeight: 700, marginTop: '0.15rem', color: '#ffffff' }}>
                      {isTool ? tool!.modelNumber || 'None' : vehicle!.model}
                    </div>
                  </div>

                  <div style={{ padding: '0.6rem 0.75rem', background: '#171d2b', borderRadius: '7px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>Serial Number</span>
                    <div style={{ fontWeight: 700, marginTop: '0.15rem', color: '#38bdf8', fontFamily: 'monospace' }}>
                      {isTool ? tool!.serialNumber || 'Not recorded' : vehicle!.vin || 'None'}
                    </div>
                  </div>

                  <div style={{ padding: '0.6rem 0.75rem', background: '#171d2b', borderRadius: '7px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>Category</span>
                    <div style={{ fontWeight: 700, marginTop: '0.15rem', color: '#ffffff' }}>
                      {isTool ? tool!.category : 'Fleet Transport'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {asset.notes && (
                <div style={{ padding: '0.75rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                    Notes &amp; Equipment Details
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#cbd5e1', whiteSpace: 'pre-wrap' }}>
                    {asset.notes}
                  </div>
                </div>
              )}
            </>
          )}

          {/* TAB 2: CUSTODY HISTORY */}
          {activeTab === 'custody' && isTool && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {relevantCustody.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#94a3b8' }}>
                  <History size={36} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                  <p style={{ fontWeight: 600 }}>No custody transitions recorded yet</p>
                  <p style={{ fontSize: '0.78rem', marginTop: '0.2rem' }}>
                    Every checkout, return, and technician transfer creates an audit trail event here.
                  </p>
                </div>
              ) : (
                relevantCustody.map((log) => {
                  const isCheckOut = log.action === 'check_out';
                  const isCheckIn = log.action === 'check_in';
                  const isTransfer = log.action === 'transfer';

                  return (
                    <div
                      key={log.id}
                      style={{
                        display: 'flex',
                        gap: '0.75rem',
                        alignItems: 'flex-start',
                        padding: '0.75rem 0.95rem',
                        background: '#161c28',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '8px',
                      }}
                    >
                      <div
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '6px',
                          background: isCheckOut
                            ? 'rgba(255, 122, 33, 0.16)'
                            : isCheckIn
                            ? 'rgba(52, 211, 153, 0.16)'
                            : 'rgba(56, 189, 248, 0.16)',
                          color: isCheckOut ? '#ff9d5c' : isCheckIn ? '#34d399' : '#38bdf8',
                          display: 'grid',
                          placeItems: 'center',
                          flexShrink: 0,
                          marginTop: '0.1rem',
                        }}
                      >
                        {isCheckOut ? <ArrowRight size={14} /> : isCheckIn ? <Check size={14} /> : <ArrowRightLeft size={14} />}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#ffffff' }}>
                            {isCheckOut
                              ? `Checked out to ${log.crewName || 'Technician'}`
                              : isCheckIn
                              ? 'Returned to Shop / Pool'
                              : isTransfer
                              ? `Transferred to ${log.crewName || 'Technician'}`
                              : log.action.replace('_', ' ')}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                            {new Date(log.occurredAt).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>

                        {log.jobLabel && (
                          <div style={{ fontSize: '0.78rem', color: '#cbd5e1', marginTop: '0.2rem' }}>
                            Job: {log.jobLabel}
                          </div>
                        )}

                        {log.notes && (
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem', fontStyle: 'italic' }}>
                            &ldquo;{log.notes}&rdquo;
                          </div>
                        )}

                        {log.performedBy && (
                          <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.25rem' }}>
                            Logged by: {log.performedBy}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 3: SERVICE HISTORY */}
          {activeTab === 'maintenance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {relevantMaintenance.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#94a3b8' }}>
                  <Wrench size={36} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                  <p style={{ fontWeight: 600 }}>No service records logged</p>
                  <p style={{ fontSize: '0.78rem', marginTop: '0.2rem' }}>
                    Routine service, calibration, and repair tickets will display here.
                  </p>
                </div>
              ) : (
                relevantMaintenance.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.75rem',
                      padding: '0.75rem 0.95rem',
                      borderRadius: '8px',
                      background: '#161c28',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                    }}
                  >
                    <Wrench size={16} style={{ color: '#fbbf24', marginTop: '0.15rem' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: '0.85rem', color: '#ffffff' }}>{m.serviceType}</strong>
                        <span style={{ fontSize: '0.88rem', color: '#34d399', fontWeight: 700, fontFamily: 'monospace' }}>
                          {formatUsdExact(m.cost)}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.76rem', color: '#cbd5e1', marginTop: '0.2rem' }}>
                        Performed by {m.performedBy} on {m.performedAt}
                        {m.mileageAtService ? ` at ${m.mileageAtService.toLocaleString()} mi` : ''}
                      </div>
                      {m.notes && (
                        <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                          {m.notes}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 4: TAX & ACCOUNTING */}
          {activeTab === 'tax' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={{ padding: '0.75rem', background: '#161c28', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase' }}>Acquisition Cost</span>
                  <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#ffffff', fontFamily: 'monospace', marginTop: '0.2rem' }}>
                    {asset.purchasePrice ? formatUsdExact(asset.purchasePrice) : 'Not recorded'}
                  </div>
                </div>

                <div style={{ padding: '0.75rem', background: '#161c28', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase' }}>Tax Election</span>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#ff9d5c', marginTop: '0.2rem' }}>
                    {asset.depreciationSchedule || 'None'}
                  </div>
                </div>

                <div style={{ padding: '0.75rem', background: '#161c28', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase' }}>Carrying Book Value</span>
                  <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#34d399', fontFamily: 'monospace', marginTop: '0.2rem' }}>
                    {formatUsdExact(dep.currentBookValue)}
                  </div>
                </div>

                <div style={{ padding: '0.75rem', background: '#161c28', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase' }}>Tax Basis Remaining</span>
                  <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#38bdf8', fontFamily: 'monospace', marginTop: '0.2rem' }}>
                    {formatUsdExact(dep.remainingTaxBasis)}
                  </div>
                </div>
              </div>

              <div style={{ padding: '0.75rem', background: 'rgba(56, 189, 248, 0.08)', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.25)', fontSize: '0.8rem', color: '#bae6fd' }}>
                <strong>Accounting Note:</strong> Placed in service: {asset.purchaseDate || 'Unknown'}. Accumulated tax write-off: {formatUsdExact(dep.accumulatedTaxDeduction)} ({dep.percentDepreciated}%).
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
