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
  const [_hasInteracted, setHasInteracted] = useState(false);
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

  // Active items and totals
  const activeItems = useMemo(() => {
    if (estimate.mode === 'multi_tier') {
      const activeTier = estimate.tiers.find((t) => t.id === estimate.activeTierId) || estimate.tiers[1] || estimate.tiers[0];
      return activeTier ? activeTier.items : [];
    }
    return estimate.items;
  }, [estimate.mode, estimate.activeTierId, estimate.tiers, estimate.items]);

  const totals = useMemo(() => {
    if (estimate.mode === 'multi_tier') {
      const activeTier = estimate.tiers.find((t) => t.id === estimate.activeTierId) || estimate.tiers[1] || estimate.tiers[0];
      if (activeTier) {
        return calculateEstimateTotals(
          activeTier.items,
          activeTier.taxRate,
          activeTier.depositPct,
          activeTier.discountAmount || 0,
          estimate.milestonesEnabled ? estimate.milestones : undefined
        );
      }
    }
    return calculateEstimateTotals(
      estimate.items,
      estimate.taxRate,
      estimate.depositPct,
      estimate.discountAmount,
      estimate.milestonesEnabled ? estimate.milestones : undefined
    );
  }, [
    estimate.mode,
    estimate.activeTierId,
    estimate.tiers,
    estimate.items,
    estimate.taxRate,
    estimate.depositPct,
    estimate.discountAmount,
    estimate.milestonesEnabled,
    estimate.milestones,
  ]);

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

    setHasInteracted(true);
    if (estimate.mode === 'multi_tier') {
      setEstimate((prev) => ({
        ...prev,
        tiers: prev.tiers.map((t) =>
          t.id === prev.activeTierId ? { ...t, items: [...t.items, newItem] } : t
        ),
      }));
    } else {
      setEstimate((prev) => ({
        ...prev,
        items: [...prev.items, newItem],
      }));
    }
    setStatusMessage('Permit line item added.');
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

    if (estimate.mode === 'multi_tier') {
      setEstimate((prev) => ({
        ...prev,
        tiers: prev.tiers.map((t) =>
          t.id === prev.activeTierId ? { ...t, items: [...t.items, newItem] } : t
        ),
      }));
    } else {
      setEstimate((prev) => ({
        ...prev,
        items: [...prev.items, newItem],
      }));
    }
    setStatusMessage('Line item added.');
  };

  const addDiscountItem = () => {
    setHasInteracted(true);
    const discountItem: LineItem = {
      id: `discount-${Date.now()}`,
      description: 'Promotional / Seasonal Discount',
      type: 'Discount',
      quantity: 1,
      unitPrice: 100,
      isDiscount: true,
    };

    if (estimate.mode === 'multi_tier') {
      setEstimate((prev) => ({
        ...prev,
        tiers: prev.tiers.map((t) =>
          t.id === prev.activeTierId ? { ...t, items: [...t.items, discountItem] } : t
        ),
      }));
    } else {
      setEstimate((prev) => ({
        ...prev,
        items: [...prev.items, discountItem],
      }));
    }
    setStatusMessage('Discount line item added.');
  };

  const updateItem = (id: string, field: keyof LineItem, value: string | number | boolean | null | undefined) => {
    setHasInteracted(true);
    const updateFn = (items: LineItem[]) =>
      items.map((item) => {
        if (item.id !== id) return item;
        if (field === 'quantity') {
          return { ...item, quantity: clampQuantity(typeof value === 'number' || typeof value === 'string' ? value : 1, 1) };
        }
        if (field === 'unitPrice') {
          return { ...item, unitPrice: clampUnitPrice(typeof value === 'number' || typeof value === 'string' ? value : 0, 0) };
        }
        return { ...item, [field]: value };
      });

    if (estimate.mode === 'multi_tier') {
      setEstimate((prev) => ({
        ...prev,
        tiers: prev.tiers.map((t) =>
          t.id === prev.activeTierId ? { ...t, items: updateFn(t.items) } : t
        ),
      }));
    } else {
      setEstimate((prev) => ({
        ...prev,
        items: updateFn(prev.items),
      }));
    }
  };

  const removeItem = (id: string) => {
    if (activeItems.length <= 1) return;
    setHasInteracted(true);
    const filterFn = (items: LineItem[]) => items.filter((item) => item.id !== id);

    if (estimate.mode === 'multi_tier') {
      setEstimate((prev) => ({
        ...prev,
        tiers: prev.tiers.map((t) =>
          t.id === prev.activeTierId ? { ...t, items: filterFn(t.items) } : t
        ),
      }));
    } else {
      setEstimate((prev) => ({
        ...prev,
        items: filterFn(prev.items),
      }));
    }
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
        // fallback
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

  const activeTier = estimate.mode === 'multi_tier'
    ? estimate.tiers.find((t) => t.id === estimate.activeTierId) || estimate.tiers[1] || estimate.tiers[0]
    : null;

  return (
    <section className={styles.container}>
      {/* Screen Reader Announcement Live Region */}
      <div role="status" aria-live="polite" className={styles.srOnly}>
        {statusMessage}
      </div>

      <div className={styles.estimateSheet}>
        {/* Editor Controls Bar */}
        <div className={styles.editorHeaderBar}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
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

            {/* Proposal Mode: Single vs Multi-Tier */}
            <div className={styles.modeToggleGroup} role="group" aria-label="Proposal Format">
              <button
                type="button"
                onClick={() => handleFieldChange('mode', 'single')}
                className={`${styles.modeBtn} ${estimate.mode === 'single' ? styles.modeBtnActive : ''}`}
                aria-pressed={estimate.mode === 'single'}
              >
                📄 Single Estimate
              </button>
              <button
                type="button"
                onClick={() => handleFieldChange('mode', 'multi_tier')}
                className={`${styles.modeBtn} ${estimate.mode === 'multi_tier' ? styles.modeBtnActive : ''}`}
                aria-pressed={estimate.mode === 'multi_tier'}
              >
                ⭐ 3-Tier Packages (Good/Better/Best)
              </button>
            </div>
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
            <h2 className={styles.estimateDocTitle}>
              {estimate.mode === 'multi_tier' ? 'MULTI-TIER PROPOSAL' : 'ESTIMATE'}
            </h2>
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
                    onClick={() => handleFieldChange('selectedTrade', t.id as EstimateData['selectedTrade'])}
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
                  style={{
                    background: '#094886',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 4,
                    padding: '4px 8px',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  + Add Permit to Estimate
                </button>
                {rebateData && rebateData.federalCredit > 0 && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 750,
                      padding: '4px 8px',
                      borderRadius: 4,
                      background: '#fef3c7',
                      color: '#92400e',
                    }}
                  >
                    ⚡ IRA 25C Rebate: {formatCurrency(rebateData.federalCredit)} Credit
                  </span>
                )}
              </div>
            ) : loadingPermit ? (
              <span style={{ fontSize: 12, color: '#094886', fontStyle: 'italic' }}>
                🔍 Checking municipal building codes...
              </span>
            ) : null}
          </div>
        </div>

        {/* Multi-Tier Package Tab Selector (if in 3-Tier Mode) */}
        {estimate.mode === 'multi_tier' && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#334155', textTransform: 'uppercase' }}>
                ⭐ Package Tier Selector:
              </span>
              <span style={{ fontSize: 12, color: '#64748b' }}>
                Editing: <strong>{activeTier?.name}</strong>
              </span>
            </div>

            <div className={styles.tierTabsRow}>
              {estimate.tiers.map((t) => {
                const isActive = estimate.activeTierId === t.id;
                const isRec = t.isRecommended;
                const tTotals = calculateEstimateTotals(t.items, t.taxRate, t.depositPct, t.discountAmount);

                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleFieldChange('activeTierId', t.id)}
                    className={`${styles.tierTabBtn} ${isActive ? styles.tierTabBtnActive : ''} ${
                      isRec ? styles.tierTabRecommended : ''
                    }`}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                      <strong style={{ fontSize: 14, color: isActive ? '#0f172a' : '#475569' }}>{t.name}</strong>
                      <span
                        className={`${styles.tierBadgeRibbon} ${
                          isRec ? styles.ribbonRecommended : t.id === 'best' ? styles.ribbonBest : styles.ribbonStandard
                        }`}
                      >
                        {t.badge || (isRec ? 'Recommended' : t.id === 'best' ? 'Best Value' : 'Standard')}
                      </span>
                    </div>
                    <span style={{ fontSize: 12, color: '#64748b' }}>{t.items.length} items included</span>
                    <strong style={{ fontSize: 15, color: '#0f172a', marginTop: 4 }}>
                      {formatCurrency(tTotals.grandTotal)}
                    </strong>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Line Items Table (Desktop) */}
        <table className={styles.estimateTable}>
          <thead>
            <tr>
              <th style={{ width: '45%' }}>Description</th>
              <th style={{ width: '15%' }}>Category</th>
              <th style={{ width: '10%', textAlign: 'center' }}>Qty</th>
              <th style={{ width: '15%', textAlign: 'right' }}>Unit Price ($)</th>
              <th style={{ width: '10%', textAlign: 'right' }}>Total</th>
              <th style={{ width: '5%', textAlign: 'center' }} aria-label="Actions"></th>
            </tr>
          </thead>
          <tbody>
            {activeItems.map((item) => {
              const qty = clampQuantity(item.quantity, 1);
              const price = clampUnitPrice(item.unitPrice, 0);
              const itemTotal = qty * price;
              const isDisc = item.isDiscount || item.type === 'Discount';

              return (
                <tr key={item.id} style={{ background: isDisc ? '#fef2f2' : undefined }}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                        placeholder="Item description (e.g. Master Tech Labor)"
                        className={styles.itemDescInput}
                        aria-label="Item description"
                      />
                      <label style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={Boolean(item.isOptional)}
                          onChange={(e) => updateItem(item.id, 'isOptional', e.target.checked)}
                          aria-label="Optional item toggle"
                        />
                        Optional
                      </label>
                    </div>
                  </td>
                  <td>
                    <select
                      value={item.type}
                      onChange={(e) => updateItem(item.id, 'type', e.target.value)}
                      className={styles.itemSelect}
                      aria-label="Item category"
                    >
                      <option value="Labor">Labor</option>
                      <option value="Material">Material</option>
                      <option value="Equipment">Equipment</option>
                      <option value="Permit">Permit</option>
                      <option value="Discount">Discount</option>
                    </select>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="number"
                      min="0.01"
                      step="any"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                      className={styles.itemNumInput}
                      style={{ textAlign: 'center' }}
                      aria-label="Quantity"
                    />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(item.id, 'unitPrice', e.target.value)}
                      className={styles.itemNumInput}
                      style={{ textAlign: 'right' }}
                      aria-label="Unit price"
                    />
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: isDisc ? '#dc2626' : '#0c202d' }}>
                    {isDisc ? `-${formatCurrency(itemTotal)}` : formatCurrency(itemTotal)}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {activeItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className={styles.cardRemoveBtn}
                        style={{ width: 32, height: 32, fontSize: 14 }}
                        title="Delete line item"
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Action Button Row */}
        <div className={styles.actionBtnRow}>
          <button type="button" onClick={addItem} className={styles.addLineBtn}>
            + Add Line Item
          </button>
          <button
            type="button"
            onClick={addDiscountItem}
            className={styles.addLineBtn}
            style={{ color: '#b91c1c', borderColor: '#fca5a5', background: '#fff5f5' }}
          >
            - Add Discount
          </button>
        </div>

        {/* Terms, Tax, Deposit & Totals Grid */}
        <div className={styles.termsAndTotalsGrid}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#687e8d', display: 'block', marginBottom: 6 }}>
              Terms, Conditions &amp; Warranty Notes
            </label>
            <textarea
              rows={3}
              value={estimate.terms}
              onChange={(e) => handleFieldChange('terms', e.target.value)}
              className={styles.termsTextarea}
              placeholder="e.g. Estimate valid for 30 days. Deposit required prior to scheduling."
              aria-label="Terms and conditions notes"
            />

            {/* Payment Milestone Schedule Expander */}
            <div className={styles.milestoneScheduleBox}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <strong style={{ fontSize: 13, color: '#334155' }}>💳 Payment Milestone Schedule</strong>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={estimate.milestonesEnabled}
                    onChange={(e) => handleFieldChange('milestonesEnabled', e.target.checked)}
                  />
                  Enable Milestones
                </label>
              </div>

              {estimate.milestonesEnabled && (
                <div style={{ marginTop: 8 }}>
                  {totals.milestones?.map((m, idx) => (
                    <div key={idx} className={styles.milestoneRow}>
                      <span>{m.name}</span>
                      <strong>{formatCurrency(m.amount)} ({m.percentage}%)</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className={styles.totalsBox}>
            <div className={styles.totalLine}>
              <span>Subtotal:</span>
              <strong style={{ color: '#0c202d' }}>{formatCurrency(totals.subtotal)}</strong>
            </div>

            {totals.discountTotal > 0 && (
              <div className={styles.totalLine} style={{ color: '#dc2626' }}>
                <span>Discounts:</span>
                <strong>-{formatCurrency(totals.discountTotal)}</strong>
              </div>
            )}

            <div className={styles.totalLine}>
              <span>
                Tax (
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={estimate.taxRate}
                  onChange={(e) => handleFieldChange('taxRate', clampPercentage(e.target.value))}
                  className={styles.totalPercentInput}
                  aria-label="Tax percentage"
                />
                %):
              </span>
              <span>{formatCurrency(totals.taxAmount)}</span>
            </div>

            <div className={`${styles.totalLine} ${styles.totalGrand}`}>
              <span>Total:</span>
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
                  onChange={(e) => handleFieldChange('depositPct', clampPercentage(e.target.value))}
                  className={styles.totalPercentInput}
                  style={{ border: '1px solid #a3e5ce' }}
                  aria-label="Deposit percentage"
                />
                %):
              </span>
              <strong>{formatCurrency(totals.depositDue)}</strong>
            </div>
          </div>
        </div>

        {/* Multi-Tier Side-by-Side Comparison Grid (if in 3-Tier Mode) */}
        {estimate.mode === 'multi_tier' && (
          <div style={{ marginTop: 32, paddingTop: 24, borderTop: '2px dashed #e2e8f0' }}>
            <h3 style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', margin: '0 0 4px' }}>
              📊 Package Comparison Summary (Customer Preview)
            </h3>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>
              This side-by-side view shows how your 3 tiers compare for the client to choose their preferred option.
            </p>

            <div className={styles.tierComparisonGrid}>
              {estimate.tiers.map((t) => {
                const isRec = t.isRecommended;
                const tTotals = calculateEstimateTotals(t.items, t.taxRate, t.depositPct, t.discountAmount);

                return (
                  <div key={t.id} className={`${styles.tierCard} ${isRec ? styles.tierCardRec : ''}`}>
                    {isRec && (
                      <span
                        style={{
                          position: 'absolute',
                          top: -12,
                          right: 16,
                          background: '#2563eb',
                          color: '#ffffff',
                          fontSize: 11,
                          fontWeight: 800,
                          padding: '3px 10px',
                          borderRadius: 999,
                          textTransform: 'uppercase',
                        }}
                      >
                        ⭐ Most Popular
                      </span>
                    )}

                    <h4 className={styles.tierCardTitle}>{t.name}</h4>
                    <p className={styles.tierCardDesc}>{t.description}</p>
                    <div className={styles.tierCardPrice}>{formatCurrency(tTotals.grandTotal)}</div>

                    <ul className={styles.tierCardItemsList}>
                      {t.items.map((it) => (
                        <li key={it.id} className={styles.tierCardItem}>
                          <span style={{ color: '#16a34a' }}>✓</span>
                          <span>{it.description || 'Service component'}</span>
                        </li>
                      ))}
                    </ul>

                    <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid #e2e8f0', fontSize: 12, color: '#64748b' }}>
                      Deposit required: <strong>{formatCurrency(tTotals.depositDue)}</strong>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Action Bar */}
        <div className={styles.printActions}>
          <div className={styles.actionButtonsCluster}>
            <button type="button" onClick={handlePrint} className={styles.printBtn}>
              🖨️ Print / Save as PDF
            </button>
            <button
              type="button"
              onClick={handleCopySummary}
              className={styles.copyBtn}
              style={{ background: copied ? '#e0fbf0' : '#f0f4f7' }}
            >
              {copied ? '✓ Copied to Clipboard!' : '📋 Copy Text Summary'}
            </button>
          </div>

          <div style={{ fontSize: 13, color: '#687e8d' }}>
            Save this estimate, text it for approval, and collect a deposit:{' '}
            <Link href={signupUrl} style={{ color: '#ff6a24', fontWeight: 800 }}>
              Try Let’s Get Quoted ($0/mo Flex) &rarr;
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
