'use client';

import React, { useState } from 'react';
import { Copy, Download, Printer, Check, ShoppingBag } from 'lucide-react';
import type { VanStockItem } from '@/lib/inventory-tracker';
import { formatUsdExact } from '@/lib/money-format';
import AccessibleModal from './AccessibleModal';
import styles from '../inventory.module.css';

interface PurchaseOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  stock: VanStockItem[];
  businessName: string;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}

export default function PurchaseOrderModal({
  isOpen,
  onClose,
  stock,
  businessName,
  onToast,
}: PurchaseOrderModalProps) {
  const [selectedSupplier, setSelectedSupplier] = useState<string>('all');

  // Compute replenishment needs
  const replenishmentItems = stock
    .filter((s) => s.quantityOnHand <= s.minThreshold)
    .map((item) => {
      const orderQty = Math.max(item.reorderQty, item.minThreshold - item.quantityOnHand);
      const lineCost = orderQty * item.unitCost;
      const supplier = (item.preferredSupplier || '').trim() || 'General Supplier';
      return {
        ...item,
        orderQty,
        lineCost,
        supplier,
      };
    });

  // Group by supplier
  const supplierGroups = replenishmentItems.reduce((acc, item) => {
    if (!acc[item.supplier]) {
      acc[item.supplier] = [];
    }
    acc[item.supplier].push(item);
    return acc;
  }, {} as Record<string, typeof replenishmentItems>);

  const supplierNames = Object.keys(supplierGroups).sort();
  const totalCost = replenishmentItems.reduce((sum, item) => sum + item.lineCost, 0);

  // Filtered items based on supplier selector
  const displayedItems =
    selectedSupplier === 'all'
      ? replenishmentItems
      : replenishmentItems.filter((item) => item.supplier === selectedSupplier);

  const displayedCost = displayedItems.reduce((sum, item) => sum + item.lineCost, 0);

  function exportCsv(targetSupplier: string) {
    const itemsToExport =
      targetSupplier === 'all'
        ? replenishmentItems
        : replenishmentItems.filter((i) => i.supplier === targetSupplier);

    const headers = ['Supplier', 'SKU', 'Item Name', 'Location', 'On Hand', 'Min Threshold', 'Order Qty', 'Unit', 'Unit Cost', 'Line Total'];
    const rows = itemsToExport.map((item) => [
      `"${item.supplier.replace(/"/g, '""')}"`,
      `"${item.sku.replace(/"/g, '""')}"`,
      `"${item.name.replace(/"/g, '""')}"`,
      `"${item.location.replace(/"/g, '""')}"`,
      item.quantityOnHand,
      item.minThreshold,
      item.orderQty,
      `"${item.unit.replace(/"/g, '""')}"`,
      item.unitCost.toFixed(2),
      item.lineCost.toFixed(2),
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const sanitizedSupplier = targetSupplier === 'all' ? 'All-Suppliers' : targetSupplier.replace(/[^a-z0-9]/gi, '_');
    link.download = `PurchaseOrder_${sanitizedSupplier}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onToast(`Exported PO CSV for ${targetSupplier === 'all' ? 'all suppliers' : targetSupplier}`);
  }

  async function handleCopyText() {
    const lines = [
      `PURCHASE ORDER RESTOCK SHEET - ${businessName.toUpperCase()}`,
      `Date: ${new Date().toLocaleDateString()}`,
      `Total Estimated Cost: ${formatUsdExact(displayedCost)}`,
      `Supplier Filter: ${selectedSupplier === 'all' ? 'All Suppliers' : selectedSupplier}`,
      `-------------------------------------------------------`,
      ...displayedItems.map((item) => {
        return `[${item.sku}] ${item.name} | Loc: ${item.location} | Qty: ${item.orderQty} ${item.unit} | Supplier: ${item.supplier} | Est: ${formatUsdExact(item.lineCost)}`;
      }),
    ];

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(lines.join('\n'));
        onToast('Copied purchase order sheet to clipboard!');
      } else {
        throw new Error('Clipboard API not available');
      }
    } catch {
      onToast('Could not access clipboard directly. Please use Export CSV instead.', 'error');
    }
  }

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Multi-Location Replenishment Purchase Order"
      subtitle="Automated reorder sheet grouped by vendor for low-stock van stock & depot parts"
      maxWidth="820px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
        {replenishmentItems.length === 0 ? (
          <div className={styles.emptyState} style={{ padding: '2.5rem 1rem' }}>
            <Check size={40} style={{ color: '#34d399' }} />
            <h3 className={styles.emptyStateTitle}>All stock levels healthy</h3>
            <p className={styles.emptyStateCopy}>
              No items across any depot or service van are currently below their minimum threshold.
            </p>
          </div>
        ) : (
          <>
            {/* KPI & Filter Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.95rem 1.25rem',
                borderRadius: '14px',
                background: 'rgba(251, 191, 36, 0.12)',
                border: '1px solid rgba(251, 191, 36, 0.35)',
                flexWrap: 'wrap',
                gap: '0.75rem',
              }}
            >
              <div>
                <span style={{ color: 'var(--inv-text-muted)', fontSize: '0.85rem' }}>Items to Reorder: </span>
                <strong style={{ color: '#fbbf24', fontFamily: 'monospace', fontWeight: 800 }}>
                  {displayedItems.length} items
                </strong>
                {selectedSupplier !== 'all' && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--inv-text-caption)', marginLeft: '0.5rem' }}>
                    (of {replenishmentItems.length} total)
                  </span>
                )}
              </div>

              <div>
                <span style={{ color: 'var(--inv-text-muted)', fontSize: '0.85rem' }}>Estimated Cost: </span>
                <strong style={{ color: '#34d399', fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 800 }}>
                  {formatUsdExact(displayedCost)}
                </strong>
              </div>

              {supplierNames.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <label htmlFor="po-supplier-select" style={{ fontSize: '0.8rem', color: 'var(--inv-text-muted)' }}>
                    Filter Vendor:
                  </label>
                  <select
                    id="po-supplier-select"
                    value={selectedSupplier}
                    onChange={(e) => setSelectedSupplier(e.target.value)}
                    className={styles.fieldSelect}
                    style={{ width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.82rem' }}
                  >
                    <option value="all">All Vendors ({supplierNames.length})</option>
                    {supplierNames.map((s) => (
                      <option key={s} value={s}>
                        {s} ({supplierGroups[s].length})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* PO Sheet Table */}
            <div className={styles.tableWrap} style={{ maxHeight: '360px', overflowY: 'auto' }}>
              <table className={styles.stockTable}>
                <caption className="sr-only">Low stock items requiring replenishment purchase orders</caption>
                <thead>
                  <tr>
                    <th scope="col">Item &amp; Location</th>
                    <th scope="col">Supplier</th>
                    <th scope="col" style={{ textAlign: 'center' }}>On Hand / Min</th>
                    <th scope="col" style={{ textAlign: 'center' }}>Order Qty</th>
                    <th scope="col" style={{ textAlign: 'right' }}>Est. Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedItems.map((item) => (
                    <tr key={`${item.id}-${item.location}`}>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--inv-text-primary)', fontSize: '0.92rem' }}>
                          {item.name}
                        </div>
                        <div style={{ fontSize: '0.82rem', fontFamily: 'monospace', color: 'var(--inv-text-muted)' }}>
                          {item.sku} • {item.location}
                        </div>
                      </td>
                      <td style={{ color: 'var(--inv-text-muted)', fontSize: '0.88rem' }}>
                        {item.supplier}
                      </td>
                      <td style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: '0.92rem' }}>
                        <span style={{ color: '#fbbf24', fontWeight: 700 }}>{item.quantityOnHand}</span> / {item.minThreshold}
                      </td>
                      <td style={{ textAlign: 'center', fontFamily: 'monospace', fontWeight: 800, color: '#ff9d5c', fontSize: '0.92rem' }}>
                        +{item.orderQty} {item.unit}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: 'var(--inv-text-primary)', fontSize: '0.95rem' }}>
                        {formatUsdExact(item.lineCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Actions Footer */}
            <div className={styles.modalFooter} style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.65rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => exportCsv(selectedSupplier)}
                  className={styles.btnSecondary}
                  style={{ fontSize: '0.82rem', padding: '0.45rem 0.85rem' }}
                >
                  <Download size={14} /> Export CSV
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className={styles.btnSecondary}
                  style={{ fontSize: '0.82rem', padding: '0.45rem 0.85rem' }}
                >
                  <Printer size={14} /> Print PO
                </button>
                <button
                  type="button"
                  onClick={handleCopyText}
                  className={styles.btnSecondary}
                  style={{ fontSize: '0.82rem', padding: '0.45rem 0.85rem' }}
                >
                  <Copy size={14} /> Copy PO Text
                </button>
              </div>

              <button
                type="button"
                onClick={onClose}
                className={styles.btnPrimary}
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </AccessibleModal>
  );
}
