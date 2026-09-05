'use client';

import React, { useState } from 'react';
import {
  ToolAsset,
  FleetVehicle,
  MaintenanceRecord,
  ToolCustodyLogEntry,
  calculateAssetDepreciation,
  describeToolStatus,
  describeVehicleStatus,
} from '@/lib/inventory-tracker';
import { formatUsdExact } from '@/lib/money-format';
import AccessibleModal from './AccessibleModal';
import styles from '../inventory.module.css';
import {
  Wrench,
  Truck,
  Calendar,
  DollarSign,
  User,
  Clock,
  FileText,
  ShieldCheck,
  Check,
  AlertTriangle,
  History,
  Tag,
} from 'lucide-react';

interface AssetDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset: ToolAsset | FleetVehicle | null;
  assetType: 'tool' | 'vehicle';
  custodyLogs?: ToolCustodyLogEntry[];
  maintenanceRecords?: MaintenanceRecord[];
  asOfDate?: string;
}

export default function AssetDetailModal({
  isOpen,
  onClose,
  asset,
  assetType,
  custodyLogs = [],
  maintenanceRecords = [],
  asOfDate,
}: AssetDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'custody' | 'maintenance' | 'tax'>('details');

  if (!asset) return null;

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

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      title={asset.name}
      subtitle={isTool ? `Tool Asset Tag: ${tool?.assetTag}` : `Fleet Unit: ${vehicle?.licensePlate}`}
      maxWidth="780px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
        {/* Sub-navigation tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--inv-border-subtle)', paddingBottom: '0.5rem' }}>
          <button
            type="button"
            onClick={() => setActiveTab('details')}
            className={activeTab === 'details' ? styles.tabBtnActive : styles.tabBtn}
            style={{ fontSize: '0.84rem', padding: '0.4rem 0.85rem' }}
          >
            Overview
          </button>
          {isTool && (
            <button
              type="button"
              onClick={() => setActiveTab('custody')}
              className={activeTab === 'custody' ? styles.tabBtnActive : styles.tabBtn}
              style={{ fontSize: '0.84rem', padding: '0.4rem 0.85rem' }}
            >
              Custody History ({relevantCustody.length})
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveTab('maintenance')}
            className={activeTab === 'maintenance' ? styles.tabBtnActive : styles.tabBtn}
            style={{ fontSize: '0.84rem', padding: '0.4rem 0.85rem' }}
          >
            Service History ({relevantMaintenance.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tax')}
            className={activeTab === 'tax' ? styles.tabBtnActive : styles.tabBtn}
            style={{ fontSize: '0.84rem', padding: '0.4rem 0.85rem' }}
          >
            Depreciation &amp; Tax Basis
          </button>
        </div>

        {/* Tab 1: Overview */}
        {activeTab === 'details' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
              {isTool && tool?.imageUrl && (
                <div style={{ width: '160px', height: '160px', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--inv-border-strong)', flexShrink: 0 }}>
                  <img
                    src={tool.imageUrl}
                    alt={tool.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
              )}

              <div style={{ flex: 1, minWidth: '240px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                <div style={{ padding: '0.65rem 0.85rem', background: 'var(--inv-surface-subtle)', borderRadius: '8px', border: '1px solid var(--inv-border-subtle)' }}>
                  <span style={{ fontSize: '0.74rem', color: 'var(--inv-text-caption)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</span>
                  <div style={{ fontWeight: 700, marginTop: '0.2rem', color: 'var(--inv-text-primary)' }}>
                    {isTool ? describeToolStatus(tool!.status).label : describeVehicleStatus(vehicle!.status).label}
                  </div>
                </div>

                {isTool ? (
                  <>
                    <div style={{ padding: '0.65rem 0.85rem', background: 'var(--inv-surface-subtle)', borderRadius: '8px', border: '1px solid var(--inv-border-subtle)' }}>
                      <span style={{ fontSize: '0.74rem', color: 'var(--inv-text-caption)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Brand / Category</span>
                      <div style={{ fontWeight: 700, marginTop: '0.2rem', color: 'var(--inv-text-primary)' }}>{tool!.brand} • {tool!.category}</div>
                    </div>
                    <div style={{ padding: '0.65rem 0.85rem', background: 'var(--inv-surface-subtle)', borderRadius: '8px', border: '1px solid var(--inv-border-subtle)' }}>
                      <span style={{ fontSize: '0.74rem', color: 'var(--inv-text-caption)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current Custody</span>
                      <div style={{ fontWeight: 700, marginTop: '0.2rem', color: tool!.assignedCrewName ? '#38bdf8' : '#34d399' }}>
                        {tool!.assignedCrewName ? `${tool!.assignedCrewName}${tool!.assignedJobLabel ? ` (${tool!.assignedJobLabel})` : ''}` : 'Shop Pool / Available'}
                      </div>
                    </div>
                    {tool!.expectedReturnDate && (
                      <div style={{ padding: '0.65rem 0.85rem', background: 'var(--inv-surface-subtle)', borderRadius: '8px', border: '1px solid var(--inv-border-subtle)' }}>
                        <span style={{ fontSize: '0.74rem', color: 'var(--inv-text-caption)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Expected Return</span>
                        <div style={{ fontWeight: 700, marginTop: '0.2rem', color: 'var(--inv-text-primary)' }}>{tool!.expectedReturnDate}</div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div style={{ padding: '0.65rem 0.85rem', background: 'var(--inv-surface-subtle)', borderRadius: '8px', border: '1px solid var(--inv-border-subtle)' }}>
                      <span style={{ fontSize: '0.74rem', color: 'var(--inv-text-caption)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Make / Model / Year</span>
                      <div style={{ fontWeight: 700, marginTop: '0.2rem', color: 'var(--inv-text-primary)' }}>{vehicle!.year} {vehicle!.make} {vehicle!.model}</div>
                    </div>
                    <div style={{ padding: '0.65rem 0.85rem', background: 'var(--inv-surface-subtle)', borderRadius: '8px', border: '1px solid var(--inv-border-subtle)' }}>
                      <span style={{ fontSize: '0.74rem', color: 'var(--inv-text-caption)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Odometer Mileage</span>
                      <div style={{ fontWeight: 700, marginTop: '0.2rem', color: 'var(--inv-text-primary)', fontFamily: 'monospace' }}>{vehicle!.currentMileage.toLocaleString()} mi</div>
                    </div>
                    {vehicle!.vin && (
                      <div style={{ padding: '0.65rem 0.85rem', background: 'var(--inv-surface-subtle)', borderRadius: '8px', border: '1px solid var(--inv-border-subtle)' }}>
                        <span style={{ fontSize: '0.74rem', color: 'var(--inv-text-caption)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>VIN</span>
                        <div style={{ fontWeight: 700, marginTop: '0.2rem', color: 'var(--inv-text-primary)', fontFamily: 'monospace', fontSize: '0.84rem' }}>{vehicle!.vin}</div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {asset.notes && (
              <div style={{ padding: '0.85rem', borderRadius: '8px', background: 'var(--inv-surface-subtle)', border: '1px solid var(--inv-border-subtle)' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--inv-text-caption)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes</span>
                <p style={{ fontSize: '0.85rem', color: 'var(--inv-text-body)', marginTop: '0.25rem', whiteSpace: 'pre-wrap' }}>
                  {asset.notes}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Custody History */}
        {activeTab === 'custody' && isTool && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '340px', overflowY: 'auto' }}>
            {relevantCustody.length === 0 ? (
              <p style={{ color: 'var(--inv-text-caption)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 0' }}>
                No past check-out or check-in custody events recorded for this tool.
              </p>
            ) : (
              relevantCustody.map((log) => (
                <div
                  key={log.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.75rem',
                    padding: '0.75rem 0.95rem',
                    borderRadius: '8px',
                    background: 'var(--inv-surface-subtle)',
                    border: '1px solid var(--inv-border-subtle)',
                  }}
                >
                  <div style={{ marginTop: '0.15rem' }}>
                    {log.action === 'check_out' ? (
                      <Clock size={16} style={{ color: '#38bdf8' }} />
                    ) : (
                      <Check size={16} style={{ color: '#34d399' }} />
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '0.85rem', color: 'var(--inv-text-primary)' }}>
                        {log.action === 'check_out' ? `Checked out to ${log.crewName || 'Crew'}` : 'Returned to Shop Pool'}
                      </strong>
                      <span style={{ fontSize: '0.74rem', color: 'var(--inv-text-caption)', fontFamily: 'monospace' }}>
                        {new Date(log.occurredAt).toLocaleDateString()} {new Date(log.occurredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {log.jobLabel && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--inv-text-muted)', marginTop: '0.15rem' }}>
                        Job: {log.jobLabel}
                      </div>
                    )}
                    {log.notes && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--inv-text-caption)', marginTop: '0.25rem', fontStyle: 'italic' }}>
                        &ldquo;{log.notes}&rdquo;
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 3: Maintenance History */}
        {activeTab === 'maintenance' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '340px', overflowY: 'auto' }}>
            {relevantMaintenance.length === 0 ? (
              <p style={{ color: 'var(--inv-text-caption)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 0' }}>
                No maintenance or repair records logged for this asset.
              </p>
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
                    background: 'var(--inv-surface-subtle)',
                    border: '1px solid var(--inv-border-subtle)',
                  }}
                >
                  <Wrench size={16} style={{ color: '#fbbf24', marginTop: '0.15rem' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '0.85rem', color: 'var(--inv-text-primary)' }}>
                        {m.serviceType}
                      </strong>
                      <span style={{ fontSize: '0.9rem', color: '#34d399', fontWeight: 700, fontFamily: 'monospace' }}>
                        {formatUsdExact(m.cost)}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--inv-text-muted)', marginTop: '0.2rem' }}>
                      Performed by {m.performedBy} on {m.performedAt}
                      {m.mileageAtService ? ` at ${m.mileageAtService.toLocaleString()} mi` : ''}
                    </div>
                    {m.notes && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--inv-text-caption)', marginTop: '0.2rem' }}>
                        {m.notes}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 4: Depreciation & Tax Basis */}
        {activeTab === 'tax' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem' }}>
              <div style={{ padding: '0.75rem', background: 'var(--inv-surface-subtle)', borderRadius: '8px', border: '1px solid var(--inv-border-subtle)' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--inv-text-caption)', textTransform: 'uppercase' }}>Purchase Price</span>
                <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--inv-text-primary)', fontFamily: 'monospace', marginTop: '0.2rem' }}>
                  {asset.purchasePrice ? formatUsdExact(asset.purchasePrice) : 'Not recorded'}
                </div>
              </div>

              <div style={{ padding: '0.75rem', background: 'var(--inv-surface-subtle)', borderRadius: '8px', border: '1px solid var(--inv-border-subtle)' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--inv-text-caption)', textTransform: 'uppercase' }}>Tax Election</span>
                <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#ff9d5c', marginTop: '0.2rem' }}>
                  {asset.depreciationSchedule || 'None'}
                </div>
              </div>

              <div style={{ padding: '0.75rem', background: 'var(--inv-surface-subtle)', borderRadius: '8px', border: '1px solid var(--inv-border-subtle)' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--inv-text-caption)', textTransform: 'uppercase' }}>Current GAAP Carrying Value</span>
                <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#34d399', fontFamily: 'monospace', marginTop: '0.2rem' }}>
                  {formatUsdExact(dep.currentBookValue)}
                </div>
              </div>

              <div style={{ padding: '0.75rem', background: 'var(--inv-surface-subtle)', borderRadius: '8px', border: '1px solid var(--inv-border-subtle)' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--inv-text-caption)', textTransform: 'uppercase' }}>Remaining Tax Basis</span>
                <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#38bdf8', fontFamily: 'monospace', marginTop: '0.2rem' }}>
                  {formatUsdExact(dep.remainingTaxBasis)}
                </div>
              </div>
            </div>

            <div style={{ padding: '0.85rem', background: 'rgba(56, 189, 248, 0.08)', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.25)', fontSize: '0.82rem', color: '#bae6fd' }}>
              <strong>Tax Planning Note:</strong> Placed in service: {asset.purchaseDate || 'Unknown'}. Accumulated tax write-off: {formatUsdExact(dep.accumulatedTaxDeduction)} ({dep.percentDepreciated}% of initial basis).
            </div>

            <p className={styles.taxPopoverDisclaimer} style={{ marginTop: '0.5rem' }}>
              * Tax schedules and GAAP book values for informational managerial planning only. Consult your certified CPA for deduction elections.
            </p>
          </div>
        )}

        <div className={styles.modalFooter} style={{ marginTop: '0.5rem' }}>
          <button type="button" onClick={onClose} className={styles.btnPrimary}>
            Close
          </button>
        </div>
      </div>
    </AccessibleModal>
  );
}
