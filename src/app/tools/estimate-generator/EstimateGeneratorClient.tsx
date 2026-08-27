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
  formatDisplayDate,
  getTodaysDateString,
  generateEstimateNumber,
  getInitialBlankEstimate,
  getInitialExampleEstimate,
  formatEstimateSummaryText,
  loadEstimateDraft,
  saveEstimateDraft,
  clearEstimateDraft,
} from '@/lib/tools/estimate-generator-utils';
import { normalizeAddress } from '@/lib/location-context/normalize-address';
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
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isLoadedRef = useRef(false);

  // Load initial draft from localStorage after mount
  useEffect(() => {
    const draft = loadEstimateDraft();
    if (draft) {
      setEstimate({
        ...draft,
        estimateDate: draft.estimateDate || getTodaysDateString(),
      });
      setHasInteracted(true);
    }
    setMounted(true);
    setTimeout(() => {
      isLoadedRef.current = true;
    }, 50);
  }, []);

  // Autosave draft on change once initial load is complete
  useEffect(() => {
    if (!mounted || !isLoadedRef.current) return;
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

          const parsedClientAddr = normalizeAddress(estimate.clientAddress);
          const clientState = parsedClientAddr.state || 'US';

          const rebateRes = await fetch('/api/rebates/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              category: rebateCategory,
              state: clientState,
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

  const handleCopyFromTier1 = () => {
    const tier1 = estimate.tiers.find((t) => t.id === 'good') || estimate.tiers[0];
    if (!tier1 || !activeTier) return;

    const clonedItems: LineItem[] = tier1.items.map((it) => ({
      ...it,
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    }));

    setEstimate((prev) => ({
      ...prev,
      tiers: prev.tiers.map((t) =>
        t.id === prev.activeTierId ? { ...t, items: [...clonedItems] } : t
      ),
    }));
    setHasInteracted(true);
    setStatusMessage(`Copied ${clonedItems.length} items from ${tier1.name} into ${activeTier.name}.`);
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

  const handleDownloadPdf = async () => {
    try {
      setDownloadingPdf(true);
      setPdfError(null);
      setStatusMessage('Generating professional PDF...');
      const res = await fetch('/api/tools/estimate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estimate, totals }),
      });
      if (!res.ok) {
        const errorJson = await res.json().catch(() => null);
        throw new Error(errorJson?.details || errorJson?.error || 'Server error generating PDF');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const rawNum = estimate.estimateNumber?.trim() || 'estimate';
      const safeNum = rawNum.replace(/[^a-zA-Z0-9_-]/g, '_');
      a.download = `Estimate-${safeNum}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setStatusMessage('Estimate PDF downloaded successfully.');
    } catch (err) {
      console.error('PDF download error:', err);
      const msg = err instanceof Error ? err.message : 'Direct PDF generation service unavailable.';
      setPdfError(msg);
      setStatusMessage(`PDF download encountered an issue: ${msg}`);
    } finally {
      setDownloadingPdf(false);
    }
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
          {/* Screen Editing Contractor Inputs */}
          <div className={`${styles.contractorEditorCol} ${styles.screenOnly}`} style={{ flex: 1 }}>
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

          {/* Dedicated Print Business Branding Header */}
          <div className={`${styles.printHeaderCompany} ${styles.printOnly}`}>
            <h1 className={styles.printCompanyName}>
              {estimate.contractorName?.trim() || (estimate.mode === 'multi_tier' ? 'MULTI-TIER PROPOSAL' : 'CONTRACTOR ESTIMATE')}
            </h1>
            {estimate.contractorName?.trim() || estimate.contractorPhone?.trim() || estimate.contractorEmail?.trim() || estimate.contractorLicense?.trim() ? (
              <div className={styles.printCompanyContact}>
                {[
                  estimate.contractorPhone?.trim() || null,
                  estimate.contractorEmail?.trim() || null,
                  estimate.contractorLicense?.trim() ? `License # ${estimate.contractorLicense.replace(/^lic\s*#?\s*/i, '')}` : null,
                ].filter(Boolean).join(' • ') || (estimate.contractorName?.trim() ? 'Licensed & Insured Trade Contractor' : null)}
              </div>
            ) : null}
          </div>

          {/* Screen Estimate Metadata Controls */}
          <div className={`${styles.estimateMetaBox} ${styles.screenOnly}`}>
            <div className={styles.estimateMetaGrid}>
              <div className={styles.estimateMetaItem}>
                <label className={styles.estimateMetaLabel}>
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
              <div className={styles.estimateMetaItem}>
                <label className={styles.estimateMetaLabel}>
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

          {/* Dedicated Print Estimate Metadata Card */}
          <div className={`${styles.printMetaCard} ${styles.printOnly}`}>
            <div className={styles.printDocBadge}>
              {estimate.mode === 'multi_tier' ? 'PROPOSAL' : 'ESTIMATE'}
            </div>
            <div className={styles.printMetaGrid}>
              <div className={styles.printMetaRow}>
                <span className={styles.printMetaKey}>ESTIMATE #:</span>
                <strong className={styles.printMetaVal}>{estimate.estimateNumber || 'EST-2026-001'}</strong>
              </div>
              <div className={styles.printMetaRow}>
                <span className={styles.printMetaKey}>DATE:</span>
                <strong className={styles.printMetaVal}>{formatDisplayDate(estimate.estimateDate)}</strong>
              </div>
              <div className={styles.printMetaRow}>
                <span className={styles.printMetaKey}>VALIDITY:</span>
                <span className={styles.printMetaVal}>30 Days</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bill To Section (Screen) */}
        <div className={`${styles.estimateBillTo} ${styles.screenOnly}`}>
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

        {/* Dedicated Print Client & Job Site Information Block */}
        <div className={`${styles.printClientSection} ${styles.printOnly}`}>
          <div className={styles.printClientCol}>
            <span className={styles.printSectionLabel}>PREPARED FOR:</span>
            <div className={styles.printClientName}>{estimate.clientName?.trim() || 'Valued Client / Homeowner'}</div>
            {estimate.clientAddress?.trim() && (
              <div className={styles.printClientAddr}>{estimate.clientAddress.trim()}</div>
            )}
          </div>
          <div className={styles.printClientCol} style={{ textAlign: 'right' }}>
            <span className={styles.printSectionLabel}>TRADE / SCOPE SPECIFICATION:</span>
            <div className={styles.printProjectTrade}>
              {estimate.selectedTrade ? `${estimate.selectedTrade.toUpperCase().replace('_', ' ')} SERVICE` : 'GENERAL CONTRACTING'}
            </div>
            <div className={styles.printProjectNotes}>
              {estimate.roofPitch && estimate.selectedTrade === 'roofing' ? `Pitch Spec: ${estimate.roofPitch}` : 'Standard Workmanship & Building Codes'}
            </div>
          </div>
        </div>

        {/* Trade & Municipal Permit Intelligence Embed */}
        <div className={styles.permitBox}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Trade Discipline:
              </span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { id: 'roofing', label: 'Roofing' },
                  { id: 'electrical', label: 'Electrical' },
                  { id: 'mechanical', label: 'HVAC' },
                  { id: 'plumbing', label: 'Plumbing' },
                  { id: 'heat_pump', label: '⚡ Heat Pump' },
                  { id: 'solar_pv', label: '☀️ Solar PV' },
                  { id: 'ev_charger', label: '🔌 EV Charger' },
                ].map((t) => {
                  const isSelected = estimate.selectedTrade === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleFieldChange('selectedTrade', t.id as EstimateData['selectedTrade'])}
                      style={{
                        background: isSelected ? '#ff6a24' : '#ffffff',
                        color: isSelected ? '#ffffff' : '#334155',
                        border: isSelected ? '1px solid #ea580c' : '1px solid #cbd5e1',
                        borderRadius: 8,
                        padding: '6px 12px',
                        fontSize: 12,
                        fontWeight: 750,
                        cursor: 'pointer',
                        minHeight: 34,
                        boxShadow: isSelected ? '0 2px 8px rgba(255, 106, 36, 0.25)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {permitData ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    padding: '5px 10px',
                    borderRadius: 6,
                    background: permitData.decision === 'required' ? '#e0f2fe' : '#dcfce7',
                    color: permitData.decision === 'required' ? '#0369a1' : '#15803d',
                    border: permitData.decision === 'required' ? '1px solid #bae6fd' : '1px solid #bbf7d0',
                  }}
                >
                  {permitData.decision === 'required' ? '🏛️ City Permit Required' : '✓ No Permit Needed'}
                </span>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#0c4a6e' }}>
                  Est. Municipal Fee: {formatCurrency(permitData.estimatedFee)}
                </span>
                <button
                  type="button"
                  onClick={addPermitItemToEstimate}
                  style={{
                    background: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 6,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(2, 132, 199, 0.3)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  + Add Permit to Estimate
                </button>
                {rebateData && rebateData.federalCredit > 0 && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      padding: '5px 10px',
                      borderRadius: 6,
                      background: '#fef3c7',
                      color: '#92400e',
                      border: '1px solid #fde68a',
                    }}
                  >
                    ⚡ IRA 25C Rebate: {formatCurrency(rebateData.federalCredit)} Credit
                  </span>
                )}
              </div>
            ) : loadingPermit ? (
              <span style={{ fontSize: 12, color: '#0369a1', fontStyle: 'italic', fontWeight: 600 }}>
                🔍 Checking municipal building codes &amp; permit requirements...
              </span>
            ) : null}
          </div>
        </div>

        {/* Multi-Tier Package Tab Selector (if in 3-Tier Mode) */}
        {estimate.mode === 'multi_tier' && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 850, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                ⭐ Package Tier Selector:
              </span>
              <span style={{ fontSize: 12, color: '#64748b' }}>
                Editing: <strong style={{ color: '#0f172a' }}>{activeTier?.name}</strong>
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
                      <strong style={{ fontSize: 15, color: isActive ? '#0f172a' : '#334155' }}>{t.name}</strong>
                      <span
                        className={`${styles.tierBadgeRibbon} ${
                          isRec ? styles.ribbonRecommended : t.id === 'best' ? styles.ribbonBest : styles.ribbonStandard
                        }`}
                      >
                        {t.badge || (isRec ? 'Recommended' : t.id === 'best' ? 'Best Value' : 'Standard')}
                      </span>
                    </div>
                    <span style={{ fontSize: 12, color: '#64748b' }}>{t.items.length} items included</span>
                    <strong style={{ fontSize: 17, color: '#0f172a', marginTop: 4 }}>
                      {formatCurrency(tTotals.grandTotal)}
                    </strong>
                  </button>
                );
              })}
            </div>

            {estimate.activeTierId !== 'good' && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                <button
                  type="button"
                  onClick={handleCopyFromTier1}
                  className="btn ghost xs"
                  style={{
                    fontSize: 12.5,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    color: '#0369a1',
                    borderColor: '#bae6fd',
                    background: '#f0f9ff',
                    padding: '6px 12px',
                    borderRadius: 6,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                  title="Duplicate base scope from Tier 1 (Standard) into this package to save time"
                >
                  <span aria-hidden="true">📋</span> Copy Base Scope from {estimate.tiers[0]?.name || 'Tier 1 (Standard)'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Line Items Table (Desktop & Print) */}
        <table className={styles.estimateTable}>
          <thead>
            <tr>
              <th style={{ width: '45%' }}>Description</th>
              <th style={{ width: '15%' }}>Category</th>
              <th style={{ width: '10%', textAlign: 'center' }}>Qty</th>
              <th style={{ width: '15%', textAlign: 'right' }}>Unit Price ($)</th>
              <th style={{ width: '10%', textAlign: 'right' }}>Total</th>
              <th style={{ width: '5%', textAlign: 'center' }} className={styles.screenOnly} aria-label="Actions"></th>
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
                    {/* Screen Input */}
                    <div className={styles.screenOnly} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                        placeholder="Item description (e.g. Master Tech Labor)"
                        className={styles.itemDescInput}
                        aria-label="Item description"
                      />
                      <label className={styles.optionalCheckboxLabel}>
                        <input
                          type="checkbox"
                          checked={Boolean(item.isOptional)}
                          onChange={(e) => updateItem(item.id, 'isOptional', e.target.checked)}
                          aria-label="Optional item toggle"
                        />
                        <span className={item.isOptional ? styles.optionalBadge : styles.optionalText}>
                          {item.isOptional ? 'Optional' : 'Optional'}
                        </span>
                      </label>
                    </div>
                    {/* Print Clean Display */}
                    <div className={styles.printOnly}>
                      <span className={styles.printItemTitle}>{item.description?.trim() || 'Specified Scope Item'}</span>
                      {item.isOptional && <span className={styles.printOptionalTag}>[OPTIONAL]</span>}
                    </div>
                  </td>
                  <td>
                    <select
                      value={item.type}
                      onChange={(e) => updateItem(item.id, 'type', e.target.value)}
                      className={`${styles.itemSelect} ${styles.screenOnly}`}
                      aria-label="Item category"
                    >
                      <option value="Labor">Labor</option>
                      <option value="Material">Material</option>
                      <option value="Equipment">Equipment</option>
                      <option value="Permit">Permit</option>
                      <option value="Discount">Discount</option>
                    </select>
                    <span className={`${styles.printCategoryPill} ${styles.printOnly}`}>
                      {item.type || 'Labor'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="number"
                      min="0.01"
                      step="any"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                      className={`${styles.itemNumInput} ${styles.screenOnly}`}
                      style={{ textAlign: 'center' }}
                      aria-label="Quantity"
                    />
                    <span className={styles.printOnly}>{qty}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(item.id, 'unitPrice', e.target.value)}
                      className={`${styles.itemNumInput} ${styles.screenOnly}`}
                      style={{ textAlign: 'right' }}
                      aria-label="Unit price"
                    />
                    <span className={styles.printOnly}>{formatCurrency(price)}</span>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: isDisc ? '#dc2626' : '#0f172a' }}>
                    {isDisc ? `-${formatCurrency(itemTotal)}` : formatCurrency(itemTotal)}
                  </td>
                  <td style={{ textAlign: 'center' }} className={styles.screenOnly}>
                    {activeItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className={styles.cardRemoveBtn}
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

        {/* Mobile Stacked Card View (< 768px, Screen Only) */}
        <div className={`${styles.mobileItemList} ${styles.screenOnly}`}>
          {activeItems.map((item) => {
            const qty = clampQuantity(item.quantity, 1);
            const price = clampUnitPrice(item.unitPrice, 0);
            const itemTotal = qty * price;
            const isDisc = item.isDiscount || item.type === 'Discount';

            return (
              <div key={item.id} className={styles.mobileItemCard} style={{ background: isDisc ? '#fef2f2' : undefined }}>
                <div className={styles.mobileCardHeader}>
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                    placeholder="Item description (e.g. Master Tech Labor)"
                    className={styles.itemDescInput}
                    aria-label="Item description"
                  />
                  {activeItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className={styles.cardRemoveBtn}
                      title="Delete line item"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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

                  <label className={styles.optionalCheckboxLabel}>
                    <input
                      type="checkbox"
                      checked={Boolean(item.isOptional)}
                      onChange={(e) => updateItem(item.id, 'isOptional', e.target.checked)}
                      aria-label="Optional item toggle"
                    />
                    <span className={item.isOptional ? styles.optionalBadge : styles.optionalText}>
                      {item.isOptional ? 'Optional' : 'Optional'}
                    </span>
                  </label>
                </div>

                <div className={styles.mobileCardNumbers}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 2 }}>
                      Qty
                    </label>
                    <input
                      type="number"
                      min="0.01"
                      step="any"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                      className={styles.itemNumInput}
                      style={{ width: '100%', textAlign: 'center' }}
                      aria-label="Quantity"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 2 }}>
                      Unit Price ($)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(item.id, 'unitPrice', e.target.value)}
                      className={styles.itemNumInput}
                      style={{ width: '100%', textAlign: 'right' }}
                      aria-label="Unit price"
                    />
                  </div>
                  <div className={styles.mobileItemTotal}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Total</span>
                    <strong style={{ color: isDisc ? '#dc2626' : '#0f172a' }}>
                      {isDisc ? `-${formatCurrency(itemTotal)}` : formatCurrency(itemTotal)}
                    </strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Action Button Row (Screen Only) */}
        <div className={`${styles.actionBtnRow} ${styles.screenOnly}`}>
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
            <div className={styles.screenOnly}>
              <label style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#64748b', display: 'block', marginBottom: 6, letterSpacing: '0.5px' }}>
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
            </div>

            {/* Print Clean Terms Display */}
            <div className={`${styles.printTermsBlock} ${styles.printOnly}`}>
              <span className={styles.printSectionLabel}>TERMS, CONDITIONS &amp; WARRANTY:</span>
              <p className={styles.printTermsContent}>
                {estimate.terms?.trim() ||
                  'Estimate valid for 30 days. Deposit required upon authorization to schedule crew and order materials. Workmanship backed by standard warranty.'}
              </p>
            </div>

            {/* Payment Milestone Schedule */}
            <div className={`${styles.milestoneScheduleBox} ${!estimate.milestonesEnabled ? styles.hideOnPrint : ''}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: estimate.milestonesEnabled ? 8 : 0 }}>
                <strong style={{ fontSize: 13, color: '#1e293b' }}>💳 Payment Milestone Schedule</strong>
                <label className={styles.hideOnPrint} style={{ fontSize: 12, fontWeight: 750, color: '#ff6a24', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
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
                      <strong style={{ color: '#0f172a' }}>{formatCurrency(m.amount)} ({m.percentage}%)</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className={styles.totalsBox}>
            <div className={styles.totalLine}>
              <span>Subtotal:</span>
              <strong style={{ color: '#0f172a', fontSize: 15 }}>{formatCurrency(totals.subtotal)}</strong>
            </div>

            {totals.discountTotal > 0 && (
              <div className={styles.totalLine} style={{ color: '#dc2626' }}>
                <span>Discounts:</span>
                <strong>-{formatCurrency(totals.discountTotal)}</strong>
              </div>
            )}

            <div className={styles.totalLine}>
              <span className={styles.screenOnly}>
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
              <span className={styles.printOnly}>
                Estimated Tax ({estimate.taxRate}%):
              </span>
              <span>{formatCurrency(totals.taxAmount)}</span>
            </div>

            <div className={`${styles.totalLine} ${styles.totalGrand}`}>
              <span>Total:</span>
              <span>{formatCurrency(totals.grandTotal)}</span>
            </div>

            <div className={`${styles.totalLine} ${styles.depositLine}`}>
              <span className={styles.screenOnly}>
                Deposit Due (
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={estimate.depositPct}
                  onChange={(e) => handleFieldChange('depositPct', clampPercentage(e.target.value))}
                  className={styles.totalPercentInput}
                  style={{ border: '1px solid #6ee7b7' }}
                  aria-label="Deposit percentage"
                />
                %):
              </span>
              <span className={styles.printOnly}>
                Deposit Due ({estimate.depositPct}%):
              </span>
              <span>{formatCurrency(totals.depositDue)}</span>
            </div>
          </div>
        </div>

        {/* Multi-Tier Side-by-Side Comparison Grid (if in 3-Tier Mode) */}
        {estimate.mode === 'multi_tier' && (
          <div style={{ marginTop: 36, paddingTop: 28, borderTop: '2px dashed #e2e8f0' }}>
            <h3 style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', margin: '0 0 6px' }}>
              📊 Package Comparison Summary (Customer Preview)
            </h3>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 18px' }}>
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
                          background: '#ff6a24',
                          color: '#ffffff',
                          fontSize: 10,
                          fontWeight: 800,
                          padding: '4px 10px',
                          borderRadius: 999,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          boxShadow: '0 2px 6px rgba(255, 106, 36, 0.35)',
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
                          <span style={{ color: '#16a34a', fontWeight: 800 }}>✓</span>
                          <span>{it.description || 'Service component'}</span>
                        </li>
                      ))}
                    </ul>

                    <div style={{ marginTop: 'auto', paddingTop: 14, borderTop: '1px solid #f1f5f9', fontSize: 12, color: '#64748b' }}>
                      Deposit required: <strong style={{ color: '#0f172a' }}>{formatCurrency(tTotals.depositDue)}</strong>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Authorized Client Signature & Acceptance Block (Visible in Print & Preview) */}
        <div className={styles.acceptanceSection}>
          <div className={styles.acceptanceNotice}>
            <strong>Authorization &amp; Acceptance of Scope:</strong> By signing below, the client agrees to the specified scope of work, total pricing, and payment terms outlined in this estimate and authorizes the contractor to proceed as scheduled.
          </div>
          <div className={styles.signatureGrid}>
            <div className={styles.signatureCol}>
              <div className={styles.signatureLine}></div>
              <div className={styles.signatureLabel}>Authorized Client / Homeowner Signature</div>
              <div className={styles.signatureMetaRow}>
                <span>Print Name: _____________________</span>
                <span>Date: ____________</span>
              </div>
            </div>
            <div className={styles.signatureCol}>
              <div className={styles.signatureLine}></div>
              <div className={styles.signatureLabel}>Contractor Representative Signature</div>
              <div className={styles.signatureMetaRow}>
                <span>Authorized Rep: _________________</span>
                <span>Date: ____________</span>
              </div>
            </div>
          </div>
        </div>

        {/* Print Only Page Footer */}
        <div className={`${styles.printFooter} ${styles.printOnly}`}>
          <div>✓ Thank you for the opportunity to earn your business!</div>
          <div>Prepared via Let’s Get Quoted • Instant Contractor Estimate</div>
        </div>

        {/* Action Bar */}
        <div className={styles.printActions}>
          {pdfError ? (
            <div className={styles.pdfErrorBanner} role="alert">
              <div className={styles.pdfErrorBannerHeader}>
                <span aria-hidden="true">⚠️</span>
                <span>Direct PDF download failed: {pdfError}</span>
              </div>
              <div>
                You can retry the download or generate a clean print/PDF directly using your browser.
              </div>
              <div className={styles.pdfErrorActions}>
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={downloadingPdf}
                  className={styles.pdfErrorRetryBtn}
                >
                  🔄 {downloadingPdf ? 'Retrying...' : 'Retry PDF Download'}
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className={styles.pdfErrorPrintBtn}
                >
                  🖨️ Print / Save as PDF via Browser
                </button>
              </div>
            </div>
          ) : null}

          <div className={styles.actionButtonsCluster}>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
              className={styles.printBtn}
              style={{ background: '#ff6a24', borderColor: '#ea580c', color: '#ffffff', fontWeight: 800 }}
              title="Download clean 1-page PDF document"
            >
              {downloadingPdf ? '⏳ Generating PDF...' : '📥 Download PDF'}
            </button>
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

          <div style={{ fontSize: 13, color: '#64748b' }}>
            Save this estimate, text it for approval, and collect a deposit:{' '}
            <Link href={signupUrl} style={{ color: '#ff6a24', fontWeight: 800, textDecoration: 'underline' }}>
              Try Let’s Get Quoted ($0/mo Flex) &rarr;
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
