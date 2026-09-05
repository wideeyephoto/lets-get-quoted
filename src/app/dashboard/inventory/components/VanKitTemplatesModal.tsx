'use client';

import React, { useState } from 'react';
import type { VanKitTemplate, InventoryLocation, VanStockItem } from '@/lib/inventory-tracker';
import AccessibleModal from './AccessibleModal';
import styles from '../inventory.module.css';
import { Boxes, Check, ArrowRight, Loader2 } from 'lucide-react';
import { applyVanKitTemplateAction } from '../actions';

interface VanKitTemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  templates: VanKitTemplate[];
  locations: InventoryLocation[];
  onTemplateApplied: (newStock: VanStockItem[]) => void;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}

const DEFAULT_TEMPLATES: VanKitTemplate[] = [
  {
    id: 'tmpl-plumbing',
    name: 'Plumbing Service Van Kit',
    description: 'Standard brass valves, sharkbite fittings, PEX tubing, and sealing tape for residential calls.',
    items: [
      { sku: 'VALVE-75', name: '3/4" Brass Ball Valve', category: 'Valves', minThreshold: 4, reorderQty: 10, unit: 'ea', unitCost: 14.5 },
      { sku: 'VALVE-50', name: '1/2" Brass Ball Valve', category: 'Valves', minThreshold: 6, reorderQty: 12, unit: 'ea', unitCost: 9.8 },
      { sku: 'TEE-SB-75', name: '3/4" SharkBite Tee Fitting', category: 'Fittings', minThreshold: 8, reorderQty: 16, unit: 'ea', unitCost: 12.25 },
      { sku: 'PEX-BLUE-75', name: '3/4" Blue PEX Tubing 100ft', category: 'Pipe', minThreshold: 2, reorderQty: 4, unit: 'roll', unitCost: 48.0 },
      { sku: 'TAPE-PTFE', name: 'High-Density PTFE Thread Tape', category: 'Sealants', minThreshold: 5, reorderQty: 10, unit: 'ea', unitCost: 3.5 },
    ],
  },
  {
    id: 'tmpl-hvac',
    name: 'HVAC Maintenance & Diagnostic Kit',
    description: 'Essential dual-run capacitors, contactors, filter driers, and refrigerant caps for seasonal tune-ups.',
    items: [
      { sku: 'CAP-45-5', name: '45/5 MFD 440V Dual Run Capacitor', category: 'Electrical', minThreshold: 4, reorderQty: 8, unit: 'ea', unitCost: 16.0 },
      { sku: 'CAP-35-5', name: '35/5 MFD 440V Dual Run Capacitor', category: 'Electrical', minThreshold: 4, reorderQty: 8, unit: 'ea', unitCost: 14.0 },
      { sku: 'CONT-2P-30A', name: '2-Pole 30A 24V Contactor', category: 'Controls', minThreshold: 3, reorderQty: 6, unit: 'ea', unitCost: 18.5 },
      { sku: 'FLTR-DRIER-163', name: '163S Liquid Line Filter Drier', category: 'Refrigerant', minThreshold: 3, reorderQty: 6, unit: 'ea', unitCost: 22.0 },
    ],
  },
  {
    id: 'tmpl-electrical',
    name: 'Electrical Van Restock Kit',
    description: 'Common breakers, duplex outlets, wire connectors, and junction boxes.',
    items: [
      { sku: 'BRK-20A-1P', name: '20A Single-Pole Circuit Breaker', category: 'Breakers', minThreshold: 6, reorderQty: 12, unit: 'ea', unitCost: 8.5 },
      { sku: 'REC-15A-TR', name: '15A Tamper-Resistant Duplex Outlet', category: 'Devices', minThreshold: 10, reorderQty: 25, unit: 'ea', unitCost: 3.25 },
      { sku: 'WIRE-NUT-YEL', name: 'Winged Wire Connectors (Yellow, 100pk)', category: 'Hardware', minThreshold: 2, reorderQty: 4, unit: 'box', unitCost: 14.0 },
    ],
  },
];

export default function VanKitTemplatesModal({
  isOpen,
  onClose,
  templates = [],
  locations = [],
  onTemplateApplied,
  onToast,
}: VanKitTemplatesModalProps) {
  const activeTemplates = templates.length > 0 ? templates : DEFAULT_TEMPLATES;
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(activeTemplates[0]?.id || '');
  const [targetLocation, setTargetLocation] = useState<string>(locations[0]?.name || 'Van #1 (Lead Tech)');
  const [loading, setLoading] = useState(false);

  const selectedTemplate = activeTemplates.find((t) => t.id === selectedTemplateId) || activeTemplates[0];

  async function handleApply() {
    if (!selectedTemplate || !targetLocation) return;
    setLoading(true);
    try {
      const updatedStock = await applyVanKitTemplateAction({
        templateId: selectedTemplate.id,
        targetLocation,
      });
      onTemplateApplied(updatedStock);
      onToast(`Applied "${selectedTemplate.name}" to ${targetLocation}!`);
      onClose();
    } catch (err: unknown) {
      onToast(err instanceof Error ? err.message : 'Failed to apply van kit template', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Van Kit Restock Templates"
      subtitle="Standardize par levels and rapidly provision stock across mobile service vans"
      maxWidth="720px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--inv-text-muted)' }}>
              Select Van Kit Template:
            </label>
            <select
              value={selectedTemplate?.id}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className={styles.fieldSelect}
              style={{ marginTop: '0.25rem' }}
            >
              {activeTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--inv-text-muted)' }}>
              Target Vehicle / Depot Location:
            </label>
            <select
              value={targetLocation}
              onChange={(e) => setTargetLocation(e.target.value)}
              className={styles.fieldSelect}
              style={{ marginTop: '0.25rem' }}
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.name}>
                  {loc.name} {loc.type === 'vehicle' ? '(Fleet Van)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedTemplate && (
          <div style={{ padding: '0.85rem', borderRadius: '10px', background: 'var(--inv-surface-subtle)', border: '1px solid var(--inv-border-subtle)' }}>
            <div style={{ fontWeight: 800, color: 'var(--inv-text-primary)', fontSize: '0.92rem' }}>
              {selectedTemplate.name}
            </div>
            {selectedTemplate.description && (
              <div style={{ fontSize: '0.8rem', color: 'var(--inv-text-muted)', marginTop: '0.2rem' }}>
                {selectedTemplate.description}
              </div>
            )}

            <div style={{ marginTop: '0.75rem', maxHeight: '220px', overflowY: 'auto' }}>
              <table className={styles.stockTable}>
                <thead>
                  <tr>
                    <th>SKU &amp; Item</th>
                    <th>Category</th>
                    <th style={{ textAlign: 'center' }}>Min Par</th>
                    <th style={{ textAlign: 'center' }}>Restock Target</th>
                    <th style={{ textAlign: 'right' }}>Unit Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedTemplate.items.map((item) => (
                    <tr key={item.sku}>
                      <td>
                        <strong style={{ color: 'var(--inv-text-primary)' }}>{item.name}</strong>
                        <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--inv-text-caption)' }}>{item.sku}</div>
                      </td>
                      <td style={{ color: 'var(--inv-text-muted)', fontSize: '0.82rem' }}>{item.category}</td>
                      <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{item.minThreshold} {item.unit}</td>
                      <td style={{ textAlign: 'center', fontFamily: 'monospace', color: '#ff9d5c', fontWeight: 700 }}>{item.reorderQty} {item.unit}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>${item.unitCost.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className={styles.modalFooter} style={{ justifyContent: 'space-between', marginTop: '0.5rem' }}>
          <button type="button" onClick={onClose} className={styles.btnSecondary} disabled={loading}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className={styles.btnPrimary}
            disabled={loading || !selectedTemplate}
          >
            {loading ? <Loader2 size={16} className="spin" /> : <Boxes size={16} />}
            Apply Template to {targetLocation}
          </button>
        </div>
      </div>
    </AccessibleModal>
  );
}
