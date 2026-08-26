'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import Link from 'next/link';
import { buildStartUrl } from '@/lib/signup-intent';
import {
  type LineItem,
  type EstimateData,
  calculateEstimateTotals,
  clampPercentage,
  clampQuantity,
  clampUnitPrice,
  formatCurrency,
  getTodaysDateString,
  generateEstimateNumber,
  getInitialBlankEstimate,
  getInitialExampleEstimate,
  formatEstimateSummaryText,
  loadEstimateDraft,
  saveEstimateDraft,
  clearEstimateDraft,
} from '@/lib/tools/estimate-generator-utils';
import styles from '../tools.module.css';

export default function EstimateGeneratorClient() {
  const [mounted, setMounted] = useState(false);
  const [estimate, setEstimate] = useState<EstimateData>(getInitialBlankEstimate);
  const [copied, setCopied] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // Permit & Clean Energy Rebate state
  const [permitData, setPermitData] = useState<{
    authorityName: string;
    agencyName: string;
    decision: string;
    estimatedFee: number;
    citations: Array<{ section: string; title: string; codeFamily: string }>;
  } | null>(null);

  const [rebateData, setRebateData] = useState<{
    federalCredit: number;
    utilityRebate: number;
    netCost: number;
    programTitle: string;
  } | null>(null);

  const [loadingPermit, setLoadingPermit] = useState(false);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load initial draft from localStorage after mount
  useEffect(() => {
    setMounted(true);
    const draft = loadEstimateDraft();
    if (draft) {
      // Ensure date is updated if missing
      setEstimate({
        ...draft,
        estimateDate: draft.estimateDate || getTodaysDateString(),
      });
      setHasInteracted(true);
    }
  }, []);

  // Autosave draft on change
  useEffect(() => {
    if (!mounted) return;
    saveEstimateDraft(estimate);
  }, [estimate, mounted]);

  const totals = useMemo(() => {
    return calculateEstimateTotals(estimate.items, estimate.taxRate, estimate.depositPct);
  }, [estimate.items, estimate.taxRate, estimate.depositPct]);

  // Live Permit & Building Code Analyzer + Clean Energy Rebates query
  useEffect(() => {
    if (!estimate.clientAddress || estimate.clientAddress.trim().length < 3) {
      setPermitData(null);
      setRebateData(null);
      return;
    }

    const timer = setTimeout(async () => {
      setLoadingPermit(true);
      const permitTrade =
        estimate.selectedTrade === 'heat_pump'
          ? 'mechanical'
          : estimate.selectedTrade === 'solar_pv' || estimate.selectedTrade === 'ev_charger'
          ? 'electrical'
          : estimate.selectedTrade;

      try {
        const res = await fetch(
          `/api/permits/public-estimate?address=${encodeURIComponent(
            estimate.clientAddress
          )}&trade=${permitTrade}&cost=${totals.subtotal || 8500}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.ok && data.jurisdiction && data.requirement) {
            setPermitData({
              authorityName: data.jurisdiction.authorityName,
              agencyName: data.jurisdiction.agencyName,
              decision: data.requirement.decision,
              estimatedFee: data.requirement.estimatedGovernmentFee?.estimatedTotal ?? 125,
              citations: data.requirement.citations ?? [],
            });
          }
        }

        // Fetch Clean Energy Rebates if applicable
        if (['heat_pump', 'solar_pv', 'ev_charger'].includes(estimate.selectedTrade)) {
          const rebateCategory =
            estimate.selectedTrade === 'heat_pump'
              ? 'heat_pump_hvac'
              : estimate.selectedTrade === 'solar_pv'
              ? 'solar_rooftop_pv'
              : 'ev_charger_level2';

          const rebateRes = await fetch('/api/rebates/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              category: rebateCategory,
              state: 'MI',
              projectCost: totals.subtotal || 9500,
            }),
          });
          if (rebateRes.ok) {
            const rData = await rebateRes.json();
            if (rData.rebateReport) {
              setRebateData({
                federalCredit: rData.rebateReport.incentives.federalTaxCredit.calculatedAmount,
                utilityRebate: rData.rebateReport.incentives.utilityRebate?.cashRebateAmount || 0,
                netCost: rData.rebateReport.financialSummary.netHomeownerCost,
                programTitle: rData.rebateReport.incentives.federalTaxCredit.programName,
              });
            }
          }
        } else {
          setRebateData(null);
        }
      } catch {
        // quiet fallback
      } finally {
        setLoadingPermit(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [estimate.clientAddress, estimate.selectedTrade, totals.subtotal]);

  const hasPermitItem = useMemo(() => {
    return estimate.items.some(
      (item) =>
        item.type === 'Permit' ||
        item.description.toLowerCase().includes('permit') ||
        item.description.toLowerCase().includes('municipal fee')
    );
  }, [estimate.items]);

  const addPermitItemToEstimate = () => {
    if (!permitData) return;
    const fee = permitData.estimatedFee || 125;
    const newItem: LineItem = {
      id: `permit-fee-${Date.now()}`,
      description: `Municipal Building Permit & Inspection Fee (${permitData.authorityName})`,
      type: 'Permit',
      quantity: 1,
      unitPrice: fee,
    };
    setEstimate((prev) => ({
      ...prev,
      items: [...prev.items, newItem],
    }));
    setStatusMessage('Permit line item added to estimate.');
  };

  const handleFieldChange = <K extends keyof EstimateData>(key: K, value: EstimateData[K]) => {
    setHasInteracted(true);
    setEstimate((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const addItem = () => {
    setHasInteracted(true);
    const newItem: LineItem = {
      id: String(Date.now()),
      description: '',
      type: 'Labor',
      quantity: 1,
      unitPrice: 100,
    };
    setEstimate((prev) => ({
      ...prev,
      items: [...prev.items, newItem],
    }));
    setStatusMessage('Line item added.');
  };

  const updateItem = (id: string, field: keyof LineItem, value: string | number) => {
    setHasInteracted(true);
    setEstimate((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        if (item.id !== id) return item;
        if (field === 'quantity') {
          return { ...item, quantity: clampQuantity(value, 1) };
        }
        if (field === 'unitPrice') {
          return { ...item, unitPrice: clampUnitPrice(value, 0) };
        }
        return { ...item, [field]: value };
      }),
    }));
  };

  const removeItem = (id: string) => {
    if (estimate.items.length <= 1) return;
    setHasInteracted(true);
    setEstimate((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.id !== id),
    }));
    setStatusMessage('Line item removed.');
  };

  const handleModeChange = (useSample: boolean) => {
    if (useSample) {
      const sample = getInitialExampleEstimate();
      setEstimate(sample);
      saveEstimateDraft(sample);
      setStatusMessage('Loaded example estimate.');
    } else {
      const blank = getInitialBlankEstimate();
      setEstimate(blank);
      saveEstimateDraft(blank);
      setStatusMessage('Started fresh blank estimate.');
    }
  };

  const handleNewEstimate = () => {
    const fresh = {
      ...getInitialBlankEstimate(),
      estimateNumber: generateEstimateNumber(),
      estimateDate: getTodaysDateString(),
    };
    setEstimate(fresh);
    clearEstimateDraft();
    setStatusMessage('Created new blank estimate.');
  };

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const handleCopySummary = async () => {
    const summaryText = formatEstimateSummaryText(estimate, totals);
    let success = false;
    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(summaryText);
        success = true;
      } catch {
        // clipboard permission or headless restriction, fall back
      }
    }

    if (!success) {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = summaryText;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        success = true;
      } catch {
        success = false;
      }
    }

    if (success) {
      setCopied(true);
      setStatusMessage('Estimate summary copied to clipboard.');
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => {
        setCopied(false);
      }, 3000);
    } else {
      setStatusMessage('Failed to copy. Please select and copy manually.');
    }
  };

  const signupUrl = buildStartUrl({
    goal: 'feature',
    feature: 'quotes',
    source: 'tools',
    businessName: estimate.contractorName ? estimate.contractorName.trim() : undefined,
  });

  return (
    <section className={styles.container}>
      {/* Screen Reader Announcement Live Region */}
      <div role="status" aria-live="polite" className={styles.srOnly}>
        {statusMessage}
      </div>

      <div className={styles.estimateSheet}>
        {/* Editor Controls Bar */}
        <div className={styles.editorHeaderBar}>
          <div className={styles.modeToggleGroup} role="group" aria-label="Estimate Preset Mode">
            <button
              type="button"
              onClick={() => handleModeChange(false)}
              className={`${styles.modeBtn} ${!estimate.isSample ? styles.modeBtnActive : ''}`}
              aria-pressed={!estimate.isSample}
            >
              Start Blank
            </button>
            <button
              type="button"
              onClick={() => handleModeChange(true)}
              className={`${styles.modeBtn} ${estimate.isSample ? styles.modeBtnActive : ''}`}
              aria-pressed={estimate.isSample}
            >
              Use Example
            </button>
          </div>

          <div className={styles.draftStatusGroup}>
            <span className={styles.draftBadge} title="Draft saved automatically in browser storage">
              ✓ Saved on this device
            </span>
            <button
              type="button"
              onClick={handleNewEstimate}
              className={styles.resetBtn}
              title="Reset all fields and start a fresh estimate"
            >
              New Estimate
            </button>
          </div>
        </div>

        {/* Sample Mode Banner */}
        {estimate.isSample && (
          <div className={styles.sampleBanner}>
            <span>
              <strong>Sample Mode Active:</strong> You are viewing pre-filled demo contractor data. Edit any
              field or start blank.
            </span>
            <button
              type="button"
              onClick={() => handleModeChange(false)}
              className={styles.sampleBannerBtn}
            >
              Clear to Blank
            </button>
          </div>
        )}

        {/* Top Row: Business Info + Estimate Metadata */}
        <div className={styles.estimateTopRow}>
          <div style={{ flex: 1 }}>
            <h2 className={styles.estimateDocTitle}>ESTIMATE</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              <input
                type="text"
                value={estimate.contractorName}
                onChange={(e) => handleFieldChange('contractorName', e.target.value)}
                placeholder="Your Business Name (e.g. Apex Trade Solutions)"
                className={styles.estimateFieldText}
                style={{ fontWeight: 800, fontSize: 16 }}
                aria-label="Contractor or Business Name"
              />
              <div className={styles.contractorInputsRow}>
                <input
                  type="text"
                  value={estimate.contractorPhone}
                  onChange={(e) => handleFieldChange('contractorPhone', e.target.value)}
                  placeholder="Phone"
                  className={styles.estimateFieldText}
                  aria-label="Contractor Phone Number"
                />
                <input
                  type="text"
                  value={estimate.contractorEmail}
                  onChange={(e) => handleFieldChange('contractorEmail', e.target.value)}
                  placeholder="Email"
                  className={styles.estimateFieldText}
                  aria-label="Contractor Email Address"
                />
                <input
                  type="text"
                  value={estimate.contractorLicense}
                  onChange={(e) => handleFieldChange('contractorLicense', e.target.value)}
                  placeholder="License #"
                  className={styles.estimateFieldText}
                  aria-label="Contractor License Number"
                />
              </div>
            </div>
          </div>

          <div className={styles.estimateMetaBox}>
            <div className={styles.estimateMetaGrid}>
              <div style={{ marginBottom: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#687e8d', display: 'block' }}>
                  Estimate #
                </label>
                <input
                  type="text"
                  value={estimate.estimateNumber}
                  onChange={(e) => handleFieldChange('estimateNumber', e.target.value)}
                  className={styles.estimateFieldText}
                  style={{ textAlign: 'right', fontWeight: 700 }}
                  aria-label="Estimate Reference Number"
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#687e8d', display: 'block' }}>
                  Estimate Date
                </label>
                <input
                  type="date"
                  value={estimate.estimateDate}
                  onChange={(e) => handleFieldChange('estimateDate', e.target.value)}
                  className={styles.estimateFieldText}
                  style={{ textAlign: 'right' }}
                  aria-label="Estimate Date"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Bill To Section */}
        <div className={styles.estimateBillTo}>
          <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#687e8d' }}>
            Prepared For:
          </span>
          <div className={styles.billToGrid}>
            <input
              type="text"
              value={estimate.clientName}
              onChange={(e) => handleFieldChange('clientName', e.target.value)}
              placeholder="Client / Homeowner Name (e.g. Sarah Jenkins)"
              className={styles.estimateFieldText}
              style={{ fontWeight: 700 }}
              aria-label="Client or Homeowner Name"
            />
            <input
              type="text"
              value={estimate.clientAddress}
              onChange={(e) => handleFieldChange('clientAddress', e.target.value)}
              placeholder="Job / Property Address (e.g. 211 S Williams St, Royal Oak, MI)"
              className={styles.estimateFieldText}
              aria-label="Job Property Address"
            />
          </div>
        </div>

        {/* Trade & Municipal Permit Intelligence Embed */}
        <div className={styles.permitBox}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 750, color: '#094886' }}>Trade Discipline:</span>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {[
                  { id: 'roofing', label: 'Roofing' },
                  { id: 'electrical', label: 'Electrical' },
                  { id: 'mechanical', label: 'HVAC' },
                  { id: 'plumbing', label: 'Plumbing' },
                  { id: 'heat_pump', label: '⚡ Heat Pump' },
                  { id: 'solar_pv', label: '☀️ Solar PV' },
                  { id: 'ev_charger', label: '🔌 EV Charger' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleFieldChange('selectedTrade', t.id as any)}
                    style={{
                      background: estimate.selectedTrade === t.id ? '#0066cc' : '#ffffff',
                      color: estimate.selectedTrade === t.id ? '#ffffff' : '#334e68',
                      border: '1px solid #bcd7f5',
                      borderRadius: 6,
                      padding: '5px 10px',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      minHeight: 34,
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {estimate.selectedTrade === 'roofing' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#094886' }}>
                <span style={{ fontWeight: 750 }}>Roof Pitch:</span>
                {(['4/12', '6/12', '8/12', '10/12'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handleFieldChange('roofPitch', p)}
                    style={{
                      background: estimate.roofPitch === p ? '#0066cc' : '#ffffff',
                      color: estimate.roofPitch === p ? '#ffffff' : '#334e68',
                      border: '1px solid #bcd7f5',
                      borderRadius: 4,
                      padding: '4px 8px',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      minHeight: 32,
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}

            {permitData ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 750,
                    padding: '4px 8px',
                    borderRadius: 4,
                    background: permitData.decision === 'required' ? '#e1f5fe' : '#e8f5e9',
                    color: permitData.decision === 'required' ? '#0277bd' : '#2e7d32',
                  }}
                >
                  {permitData.decision === 'required' ? '🏛️ City Permit Required' : '✓ No Permit Needed'}
                </span>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#094886' }}>
                  Est. Municipal Fee: {formatCurrency(permitData.estimatedFee)}
                </span>
                <button
                  type="button"
                  onClick={addPermitItemToEstimate}
                  disabled={hasPermitItem}
                  style={{
                    background: hasPermitItem ? '#bcccdc' : '#0066cc',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 6,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 750,
                    cursor: hasPermitItem ? 'default' : 'pointer',
                    minHeight: 34,
                  }}
                >
                  {hasPermitItem ? '✓ Permit Added' : '+ Add Permit to Estimate'}
                </button>
              </div>
            ) : loadingPermit ? (
              <span style={{ fontSize: 12, color: '#687e8d' }}>Analyzing municipal codes &amp; permits...</span>
            ) : null}
          </div>

          {permitData ? (
            <div style={{ marginTop: 8, fontSize: 11, color: '#486581', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <span>
                <strong>Authority:</strong> {permitData.authorityName} ({permitData.agencyName})
              </span>
              {permitData.citations?.[0] ? (
                <span>
                  <strong>Code Citation:</strong> {permitData.citations[0].codeFamily} {permitData.citations[0].section} - {permitData.citations[0].title}
                </span>
              ) : null}
            </div>
          ) : null}

          {rebateData && (
            <div
              style={{
                marginTop: 10,
                padding: '8px 12px',
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                borderRadius: 6,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <div>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#065f46' }}>
                  🌱 Clean Energy Incentives Available:
                </span>{' '}
                <span style={{ fontSize: 11, color: '#047857' }}>
                  Est. Federal Tax Credit: <strong>{formatCurrency(rebateData.federalCredit)}</strong>
                  {rebateData.utilityRebate > 0 && ` + Local Utility Rebate: ${formatCurrency(rebateData.utilityRebate)}`}
                </span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#065f46' }}>
                Net Investment After Incentives: {formatCurrency(rebateData.netCost)}
              </div>
            </div>
          )}
        </div>

        {/* Desktop Line Items Table */}
        <table className={styles.estimateTable}>
          <thead>
            <tr>
              <th style={{ width: '48%' }}>Description</th>
              <th style={{ width: '16%' }}>Type</th>
              <th style={{ width: '12%' }}>Qty</th>
              <th style={{ width: '14%' }}>Unit Price</th>
              <th style={{ width: '10%', textAlign: 'right' }}>Total</th>
              <th style={{ width: '5%' }}></th>
            </tr>
          </thead>
          <tbody>
            {estimate.items.map((item) => (
              <tr key={item.id}>
                <td>
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                    placeholder="Scope item description..."
                    className={styles.itemDescInput}
                    aria-label="Item description"
                  />
                </td>
                <td>
                  <select
                    value={item.type}
                    onChange={(e) => updateItem(item.id, 'type', e.target.value)}
                    className={styles.itemSelect}
                    aria-label="Item type"
                  >
                    <option value="Labor">Labor</option>
                    <option value="Material">Material</option>
                    <option value="Equipment">Equipment</option>
                    <option value="Permit">Permit</option>
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={item.quantity}
                    onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                    className={styles.itemNumInput}
                    aria-label="Item quantity"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={item.unitPrice}
                    onChange={(e) => updateItem(item.id, 'unitPrice', e.target.value)}
                    className={styles.itemNumInput}
                    aria-label="Unit price"
                  />
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: '#0c202d' }}>
                  {formatCurrency(clampQuantity(item.quantity, 1) * clampUnitPrice(item.unitPrice, 0))}
                </td>
                <td style={{ textAlign: 'center' }}>
                  {estimate.items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#dc2626',
                        cursor: 'pointer',
                        fontWeight: 800,
                        fontSize: 16,
                        padding: 6,
                      }}
                      title="Remove item"
                      aria-label="Remove line item"
                    >
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Mobile Line Items Stacked Cards (< 768px) */}
        <div className={styles.mobileItemList}>
          {estimate.items.map((item, idx) => (
            <div key={item.id} className={styles.mobileItemCard}>
              <div className={styles.mobileCardHeader}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#687e8d', display: 'block', marginBottom: 4 }}>
                    Item #{idx + 1} Type
                  </label>
                  <select
                    value={item.type}
                    onChange={(e) => updateItem(item.id, 'type', e.target.value)}
                    className={styles.itemSelect}
                    aria-label={`Item ${idx + 1} type`}
                  >
                    <option value="Labor">Labor</option>
                    <option value="Material">Material</option>
                    <option value="Equipment">Equipment</option>
                    <option value="Permit">Permit</option>
                  </select>
                </div>

                {estimate.items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className={styles.cardRemoveBtn}
                    title="Remove item"
                    aria-label={`Remove item ${idx + 1}`}
                  >
                    ✕
                  </button>
                )}
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#687e8d', display: 'block', marginBottom: 4 }}>
                  Description
                </label>
                <input
                  type="text"
                  value={item.description}
                  onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                  placeholder="Scope item description..."
                  className={styles.itemDescInput}
                  aria-label={`Item ${idx + 1} description`}
                />
              </div>

              <div className={styles.mobileCardNumbers}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#687e8d', display: 'block', marginBottom: 4 }}>
                    Qty
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={item.quantity}
                    onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                    className={styles.itemNumInput}
                    style={{ width: '100%' }}
                    aria-label={`Item ${idx + 1} quantity`}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#687e8d', display: 'block', marginBottom: 4 }}>
                    Unit Price ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={item.unitPrice}
                    onChange={(e) => updateItem(item.id, 'unitPrice', e.target.value)}
                    className={styles.itemNumInput}
                    style={{ width: '100%' }}
                    aria-label={`Item ${idx + 1} unit price`}
                  />
                </div>

                <div className={styles.mobileItemTotal}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#687e8d', display: 'block', marginBottom: 4 }}>
                    Line Total
                  </span>
                  <span>{formatCurrency(clampQuantity(item.quantity, 1) * clampUnitPrice(item.unitPrice, 0))}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Add Line Item Button */}
        <div className={styles.actionBtnRow}>
          <button type="button" onClick={addItem} className={styles.addLineBtn}>
            + Add Line Item
          </button>
        </div>

        {/* Totals & Terms */}
        <div className={styles.termsAndTotalsGrid}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 750, color: '#4a5c68', display: 'block', marginBottom: 6 }}>
              Terms &amp; Warranty Notes:
            </label>
            <textarea
              value={estimate.terms}
              onChange={(e) => handleFieldChange('terms', e.target.value)}
              rows={4}
              className={styles.termsTextarea}
              aria-label="Scope notes and warranty terms"
              placeholder="e.g. Estimate valid for 30 days. Deposit required upon scheduling..."
            />
          </div>

          <div className={styles.totalsBox}>
            <div className={styles.totalLine}>
              <span>Subtotal:</span>
              <strong>{formatCurrency(totals.subtotal)}</strong>
            </div>

            <div className={styles.totalLine}>
              <span>
                Tax (
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={estimate.taxRate}
                  onChange={(e) => handleFieldChange('taxRate', clampPercentage(e.target.value, 0))}
                  className={styles.totalPercentInput}
                  aria-label="Tax percentage"
                />
                %):
              </span>
              <span>{formatCurrency(totals.taxAmount)}</span>
            </div>

            <div className={`${styles.totalLine} ${styles.totalGrand}`}>
              <span>Total Amount:</span>
              <span>{formatCurrency(totals.grandTotal)}</span>
            </div>

            <div className={`${styles.totalLine} ${styles.depositLine}`}>
              <span>
                Deposit Due (
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={estimate.depositPct}
                  onChange={(e) => handleFieldChange('depositPct', clampPercentage(e.target.value, 0))}
                  className={styles.totalPercentInput}
                  aria-label="Deposit percentage"
                />
                %):
              </span>
              <strong>{formatCurrency(totals.depositDue)}</strong>
            </div>
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className={styles.printActions}>
          <div className={styles.actionButtonsCluster}>
            <button type="button" onClick={handlePrint} className={styles.printBtn}>
              🖨️ Print / Save as PDF
            </button>
            <button
              type="button"
              onClick={handleCopySummary}
              className={`${styles.copyBtn} ${copied ? styles.copyBtnCopied : ''}`}
            >
              {copied ? '✓ Copied to Clipboard!' : '📋 Copy Text Summary'}
            </button>
          </div>
        </div>

        {/* Contextual Post-Action Conversion Opportunity */}
        <div className={styles.postActionCta}>
          <div className={styles.postActionText}>
            <h3 className={styles.postActionTitle}>
              Save this estimate, text it for approval, and collect a deposit.
            </h3>
            <p className={styles.postActionDesc}>
              Let’s Get Quoted lets trade contractors send interactive SMS quotes with 1-tap Apple Pay deposits,
              automatic customer follow-ups, and live booking with zero monthly fee.
            </p>
          </div>
          <Link href={signupUrl} className={styles.postActionBtn}>
            Start Free on Flex ($0/mo) &rarr;
          </Link>
        </div>
      </div>
    </section>
  );
}
